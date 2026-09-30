// Test helpers: build a throwaway site on disk from a { path: content } map
// and run a single check module against it through the real engine plumbing.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { loadSite, loadPage, resolveLocal } from '../skills/audit/scripts/lib/site.mjs'
import { loadRubric } from '../skills/audit/scripts/lib/engine.mjs'

const rubric = loadRubric()

export function makeSite(files, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aeotester-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  const site = loadSite(root, options)
  return { root, site, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

// Minimal valid page wrapper so tests can focus on one element
export function html({ head = '', body = '', lang = 'en' } = {}) {
  return `<!DOCTYPE html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

// Runs one check. For page checks, runs against pageFile (default: first page).
export function runCheck(mod, files, { pageFile, siteOptions } = {}) {
  const { site, cleanup } = makeSite(files, siteOptions)
  try {
    const entry = rubric.checks.find(c => c.id === mod.id)
    if (!entry) throw new Error(`No rubric entry for ${mod.id}`)
    const pages = site.pages.map(p => loadPage(site, p))
    const page = pageFile ? pages.find(p => p.file.endsWith(pageFile)) : pages[0] || null
    const helpers = { resolveLocal: u => resolveLocal(site, u), headersFor: u => site.host.headersFor(u) }
    const result = mod.run({ site, page, rubric: entry, pages, helpers, options: {} })
    return { ...result, score: Math.floor(result.score), weight: entry.weight }
  } finally {
    cleanup()
  }
}
