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
//       advice: [{ file, line, message }],  // worth knowing, costs no points
//       recommendation,          // what to do about it
//       details: {}              // anything check-specific
//     }
//   }
//
// Status is derived here, not in the check, from the reported integer score:
// >= 80% pass, >= 50% warning, else fail. Inconclusive is always a warning.
//
// Plugin divergences from the extension's single-page scoring:
// - Pages kept out of search on purpose (noindex, not the homepage, not in the
//   sitemap; see lib/noindex.mjs) are left out of every page check's average.
//   Their freshness and author findings are kept as advice.
// - A check marked advisory in the rubric never counts toward the score: its
//   weight is left out of the total and its findings are reported as advice.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadPage, resolveLocal } from './site.mjs'
import { noindexIntent, sitemapPaths } from './noindex.mjs'

// Findings that still matter on a page kept out of search, by check: a
// "last updated" date and who is responsible, not expertise credentials
const ADVICE_ON_EXCLUDED = new Map([
  ['content.freshness', () => true],
  ['content.author', f => /author attribution/i.test(f.message)]
])

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
  const toFinding = f => ({ file: f.file ?? null, line: f.line ?? null, message: f.message })
  const findings = (result.findings || []).map(toFinding)
  const advice = (result.advice || []).map(toFinding)
  return {
    score,
    na: !!result.na,
    inconclusive: !!result.inconclusive,
    predicted: !!result.predicted,
    message: result.message || '',
    recommendation: result.recommendation || '',
    findings,
    advice,
    details: result.details || {}
  }
}

// Pages kept out of search on purpose (page -> reason), unless that would
// leave nothing to score
function excludedPages(site, pages) {
  if (pages.length < 2) return new Map()
  const sitemap = sitemapPaths(site)
  const out = new Map()
  for (const p of pages) {
    try {
      const intent = noindexIntent(p, site, sitemap)
      if (intent.intentional) out.set(p, intent.reason)
    } catch {
      // a page that cannot be read for directives is scored normally
    }
  }
  return out.size >= pages.length ? new Map() : out
}

export async function runAudit(site, options = {}) {
  const rubric = loadRubric()
  const only = options.only ? new Set(options.only) : null
  const entries = rubric.checks.filter(c => !only || only.has(c.id))
  const modules = new Map()
  for (const entry of entries) modules.set(entry.id, await loadModule(entry))

  // A database-backed CMS gets a fix list, not a score: repo files say
  // little about the live site (WordPress serves robots.txt virtually, etc.)
  if (site.mode === 'report-only') {
    return { rubricVersion: rubric.version, maxScore: rubric.max_score, total: 0, available: 0, percentage: 0, grade: '', naWeight: 0, skippedWeight: rubric.max_score, categories: [], checks: entries.map(e => ({ id: e.id, name: e.name, category: e.category, weight: e.weight, fixable: 'report-only', status: 'skipped', score: 0, message: 'Report-only: check the live site.', findings: [] })), rubric }
  }

  const pages = site.mode === 'full' ? site.pages.map(p => loadPage(site, p)) : []
  const excluded = excludedPages(site, pages)
  const helpers = {
    resolveLocal: urlPath => resolveLocal(site, urlPath),
    headersFor: urlPath => site.host.headersFor(urlPath)
  }

  const results = []
  for (const entry of entries) {
    const mod = modules.get(entry.id)
    const base = { id: entry.id, name: entry.name, category: entry.category, weight: entry.weight, fixable: entry.fixable, parity: entry.parity.level, advisory: !!entry.advisory }
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
      results.push(finish(base, pages.map(runOne), entry, pages.length, pages, excluded))
    }
  }

  // Advisory checks are reported but never scored
  const counts = r => !r.advisory
  const scored = results.filter(r => r.status !== 'skipped' && counts(r))
  const naWeight = scored.filter(r => r.status === 'na').reduce((s, r) => s + r.weight, 0)
  const skippedWeight = results.filter(r => r.status === 'skipped' && counts(r)).reduce((s, r) => s + r.weight, 0)
  const available = entries.filter(c => !c.advisory).reduce((s, c) => s + c.weight, 0) - naWeight - skippedWeight
  const total = Math.round(scored.reduce((s, r) => s + (r.status === 'na' ? 0 : r.score), 0))
  const percentage = available > 0 ? Math.round((total / available) * 100) : 0

  const categories = rubric.categories.map(cat => {
    const inCat = results.filter(r => r.category === cat.id && counts(r))
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
    excludedPages: [...excluded].map(([p, reason]) => ({ file: p.file, url: p.hasRealUrl ? p.url : null, reason })),
    available,
    percentage,
    grade: gradeFor(rubric, percentage),
    naWeight,
    skippedWeight,
    categories,
    checks: results
  }
}

// Groups identical findings across pages so a template bug is reported once
function group(list) {
  const groups = new Map()
  for (const f of list) {
    const g = groups.get(f.message) || { message: f.message, locations: [] }
    if (f.file) g.locations.push({ file: f.file, line: f.line })
    groups.set(f.message, g)
  }
  return [...groups.values()]
}

// Collapses per-page results into one site-level result for a check.
function finish(base, runs, entry, pageCount, pages = [], excluded = new Map()) {
  const pairs = runs.map((r, i) => ({ r, page: pages[i] }))
  const kept = pairs.filter(x => !x.page || !excluded.has(x.page))
  const left = pairs.filter(x => x.page && excluded.has(x.page))
  const keptRuns = kept.map(x => x.r)

  const na = keptRuns.every(r => r.na)
  if (na) return { ...base, status: 'na', score: 0, message: keptRuns[0].message, recommendation: keptRuns[0].recommendation, findings: [], advice: [], pages: pageCount, details: keptRuns[0].details }

  const mean = keptRuns.reduce((s, r) => s + r.score, 0) / keptRuns.length
  const score = Math.round(mean * 10) / 10
  const inconclusive = keptRuns.some(r => r.inconclusive)
  let status = inconclusive && score < entry.weight ? 'warning' : statusFor(score, entry.weight)

  let findings = group(keptRuns.flatMap(r => r.findings))
  const adviceList = keptRuns.flatMap(r => r.advice)
  const keepAsAdvice = ADVICE_ON_EXCLUDED.get(entry.id)
  if (keepAsAdvice) {
    for (const { r } of left) for (const f of r.findings.filter(keepAsAdvice)) adviceList.push({ ...f, message: `Page kept out of search: ${f.message}` })
  }
  // An advisory check never costs points: what it found is advice
  if (base.advisory) {
    adviceList.unshift(...keptRuns.flatMap(r => r.findings))
    findings = []
    status = score >= entry.weight ? 'pass' : 'advice'
  }

  const failingPages = kept
    .filter(x => x.page && x.r.score < entry.weight)
    .map(x => ({ file: x.page.file, score: x.r.score, message: x.r.message }))

  // Summary message: the most common one among pages that lost points
  const counts = new Map()
  for (const r of keptRuns) if (r.score < entry.weight || keptRuns.length === 1) counts.set(r.message, (counts.get(r.message) || 0) + 1)
  const message = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || keptRuns[0].message
  const recommendation = keptRuns.find(r => r.score < entry.weight && r.recommendation)?.recommendation || ''

  return {
    ...base,
    status,
    score,
    lost: base.advisory ? 0 : Math.round((entry.weight - score) * 10) / 10,
    inconclusive,
    predicted: keptRuns.some(r => r.predicted),
    message,
    recommendation,
    findings,
    advice: group(adviceList),
    failingPages,
    pages: pageCount - left.length,
    excludedPages: left.length,
    details: keptRuns.length === 1 ? keptRuns[0].details : undefined
  }
}
