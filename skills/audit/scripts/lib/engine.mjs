// Runs rubric checks against a loaded site and aggregates the score.
//
// Check module contract (skills/audit/scripts/checks/<category>/<slug>.mjs):
//
//   export default {
//     id: 'meta.title',          // must match the rubric id
//     scope: 'page' | 'site',    // page checks run once per page, site checks once
//     run(ctx) -> {
//       score,                   // integer 0..weight
//       na: false,               // true = does not apply (conditional checks only)
//       inconclusive: false,     // true = could not be evaluated from source
//       predicted: false,        // true = inferred from config, needs a live check to confirm
//       message,                 // one-line human summary
//       findings: [{ file, line, message }],
//       recommendation,          // what to do about it
//       details: {}              // anything check-specific
//     }
//   }
//
// Status is derived here, not in the check, from the reported integer score:
// >= 80% pass, >= 50% warning, else fail. Inconclusive is always a warning.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadPage, resolveLocal } from './site.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const scriptsDir = join(here, '..')
export const rubricPath = join(scriptsDir, '..', 'references', 'rubric.json')

export function loadRubric() {
  return JSON.parse(readFileSync(rubricPath, 'utf8'))
}

export function statusFor(score, weight) {
  const pct = weight > 0 ? (score / weight) * 100 : 0
  if (pct >= 80) return 'pass'
  if (pct >= 50) return 'warning'
  return 'fail'
}

export function gradeFor(rubric, percentage) {
  return rubric.scoring.grades.find(g => percentage >= g.min)?.label || ''
}

async function loadModule(entry) {
  if (!entry.detect.script) return null
  const abs = join(scriptsDir, entry.detect.script)
  if (!existsSync(abs)) return null
  const mod = (await import(pathToFileURL(abs).href)).default
  if (mod.id !== entry.id) throw new Error(`${entry.detect.script} exports id ${mod.id}, expected ${entry.id}`)
  return mod
}

function normalize(result, entry) {
  const weight = entry.weight
  const score = Math.max(0, Math.min(weight, Math.floor(Number(result.score) || 0)))
  const findings = (result.findings || []).map(f => ({ file: f.file ?? null, line: f.line ?? null, message: f.message }))
  return {
    score,
    na: !!result.na,
    inconclusive: !!result.inconclusive,
    predicted: !!result.predicted,
    message: result.message || '',
    recommendation: result.recommendation || '',
    findings,
    details: result.details || {}
  }
}

export async function runAudit(site, options = {}) {
  const rubric = loadRubric()
  const only = options.only ? new Set(options.only) : null
  const entries = rubric.checks.filter(c => !only || only.has(c.id))
  const modules = new Map()
  for (const entry of entries) modules.set(entry.id, await loadModule(entry))

  const pages = site.mode === 'full' ? site.pages.map(p => loadPage(site, p)) : []
  const helpers = {
    resolveLocal: urlPath => resolveLocal(site, urlPath),
    headersFor: urlPath => site.host.headersFor(urlPath)
  }

  const results = []
  for (const entry of entries) {
    const mod = modules.get(entry.id)
    const base = { id: entry.id, name: entry.name, category: entry.category, weight: entry.weight, fixable: entry.fixable, parity: entry.parity.level }
    if (!mod) {
      results.push({ ...base, status: 'skipped', score: 0, message: 'Not implemented in this version.', findings: [], pages: 0 })
      continue
    }
    if (mod.scope === 'page' && pages.length === 0) {
      results.push({ ...base, status: 'skipped', score: 0, message: site.mode === 'report-only' ? 'Needs a live URL: page content is not in the repo.' : 'No pages to check.', findings: [], pages: 0 })
      continue
    }

    const runOne = page => {
      try {
        return normalize(mod.run({ site, page, rubric: entry, pages, helpers, options }), entry)
      } catch (err) {
        return normalize({ score: 0, message: `Check crashed: ${err.message}`, findings: [{ file: page?.file ?? null, line: null, message: err.stack?.split('\n')[0] }] }, entry)
      }
    }

    if (mod.scope === 'site') {
      const r = runOne(pages[0] || null)
      results.push(finish(base, [r], entry, 1))
    } else {
      results.push(finish(base, pages.map(runOne), entry, pages.length, pages))
    }
  }

  const scored = results.filter(r => r.status !== 'skipped')
  const naWeight = scored.filter(r => r.status === 'na').reduce((s, r) => s + r.weight, 0)
  const skippedWeight = results.filter(r => r.status === 'skipped').reduce((s, r) => s + r.weight, 0)
  const available = entries.reduce((s, c) => s + c.weight, 0) - naWeight - skippedWeight
  const total = Math.round(scored.reduce((s, r) => s + (r.status === 'na' ? 0 : r.score), 0))
  const percentage = available > 0 ? Math.round((total / available) * 100) : 0

  const categories = rubric.categories.map(cat => {
    const inCat = results.filter(r => r.category === cat.id)
    const counted = inCat.filter(r => r.status !== 'skipped' && r.status !== 'na')
    return {
      id: cat.id,
      name: cat.name,
      score: Math.round(counted.reduce((s, r) => s + r.score, 0) * 10) / 10,
      max: counted.reduce((s, r) => s + r.weight, 0),
      skipped: inCat.filter(r => r.status === 'skipped' || r.status === 'na').reduce((s, r) => s + r.weight, 0)
    }
  })

  return {
    rubricVersion: rubric.version,
    maxScore: rubric.max_score,
    total,
    available,
    percentage,
    grade: gradeFor(rubric, percentage),
    naWeight,
    skippedWeight,
    categories,
    checks: results
  }
}

// Collapses per-page results into one site-level result for a check.
function finish(base, runs, entry, pageCount, pages = []) {
  const na = runs.every(r => r.na)
  if (na) return { ...base, status: 'na', score: 0, message: runs[0].message, recommendation: runs[0].recommendation, findings: [], pages: pageCount, details: runs[0].details }

  const mean = runs.reduce((s, r) => s + r.score, 0) / runs.length
  const score = Math.round(mean * 10) / 10
  const inconclusive = runs.some(r => r.inconclusive)
  const status = inconclusive && score < entry.weight ? 'warning' : statusFor(score, entry.weight)

  // Group identical findings across pages so a template bug is reported once
  const groups = new Map()
  for (const r of runs) {
    for (const f of r.findings) {
      const g = groups.get(f.message) || { message: f.message, locations: [] }
      if (f.file) g.locations.push({ file: f.file, line: f.line })
      groups.set(f.message, g)
    }
  }
  const failingPages = runs
    .map((r, i) => ({ r, page: pages[i] }))
    .filter(x => x.page && x.r.score < entry.weight)
    .map(x => ({ file: x.page.file, score: x.r.score, message: x.r.message }))

  // Summary message: the most common one among pages that lost points
  const counts = new Map()
  for (const r of runs) if (r.score < entry.weight || runs.length === 1) counts.set(r.message, (counts.get(r.message) || 0) + 1)
  const message = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || runs[0].message
  const recommendation = runs.find(r => r.score < entry.weight && r.recommendation)?.recommendation || ''

  return {
    ...base,
    status,
    score,
    lost: Math.round((entry.weight - score) * 10) / 10,
    inconclusive,
    predicted: runs.some(r => r.predicted),
    message,
    recommendation,
    findings: [...groups.values()],
    failingPages,
    pages: pageCount,
    details: runs.length === 1 ? runs[0].details : undefined
  }
}
