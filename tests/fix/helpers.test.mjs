import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSite, loadPage, resolveLocal } from '../../skills/audit/scripts/lib/site.mjs'
import { loadRubric } from '../../skills/audit/scripts/lib/engine.mjs'
import { siteFacts, guessBrand } from '../../skills/fix/scripts/page-facts.mjs'
import { buildLlmsTxt } from '../../skills/fix/scripts/generate-llms-txt.mjs'
import llmsCheck from '../../skills/audit/scripts/checks/ai-access/llms-txt.mjs'

const fixture = new URL('../fixtures/sample-site/', import.meta.url).pathname

test('page facts come from the page, not guesses', () => {
  const facts = siteFacts(loadSite(fixture))
  assert.equal(facts.site.brand, 'InsightPins')
  assert.equal(facts.site.baseUrl, 'https://insightpins.example')
  assert.deepEqual(facts.site.socialLinks, ['https://twitter.com/insightpins'])
  const home = facts.pages.find(p => p.urlPath === '/')
  assert.equal(home.title, 'Home')
  assert.deepEqual(home.h1, ['Pin boards for curious people', 'Start pinning today'])
  assert.equal(home.imagesMissingAlt.length, 2)
  const guide = facts.pages.find(p => p.file === 'blog/pinning-guide.html')
  assert.equal(guide.author, 'Dana Lee')
  assert.equal(guide.dates.published, '2025-03-02')
  assert.deepEqual(guide.jsonld.map(j => j.types), [['Article']])
})

test('brand prefers og:site_name, then the shared title suffix', () => {
  assert.equal(guessBrand([{ og: { site_name: 'Acme' }, title: 'x | Other' }]), 'Acme')
  assert.equal(guessBrand([{ og: {}, title: 'A | Acme' }, { og: {}, title: 'B | Acme' }, { og: {}, title: 'C - Else' }]), 'Acme')
})

test('generated llms.txt follows the llmstxt.org shape and passes the audit check', () => {
  const text = buildLlmsTxt(siteFacts(loadSite(fixture)))
  assert.match(text, /^# InsightPins\n\n> .+/)
  assert.match(text, /^## Blog$/m)
  assert.match(text, /- \[How to organize research with visual pins\]\(https:\/\/insightpins\.example\/blog\/pinning-guide\.html\)/)

  const dir = mkdtempSync(join(tmpdir(), 'aeotester-llms-'))
  try {
    cpSync(fixture, dir, { recursive: true })
    writeFileSync(join(dir, 'llms.txt'), text)
    const site = loadSite(dir)
    const entry = loadRubric().checks.find(c => c.id === 'ai-access.llms-txt')
    const pages = site.pages.map(p => loadPage(site, p))
    const helpers = { resolveLocal: u => resolveLocal(site, u), headersFor: u => site.host.headersFor(u) }
    const r = llmsCheck.run({ site, page: pages[0], pages, rubric: entry, helpers, options: {} })
    assert.equal(Math.floor(r.score), entry.weight, r.message)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
