// Engine behaviour that spans checks: pages kept out of search on purpose and
// advisory checks (plugin divergences from the extension's single-page score)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSite, html } from '../helpers.mjs'
import { runAudit, loadRubric } from '../../skills/audit/scripts/lib/engine.mjs'
import { renderReport, renderSummary } from '../../skills/audit/scripts/lib/report.mjs'

const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const og = path => `<meta property="og:title" content="Pins"><meta property="og:description" content="Pin research"><meta property="og:image" content="https://ex.com/a.png"><meta property="og:url" content="https://ex.com${path}"><meta property="og:type" content="website">`
const page = (path, extraHead = '') => html({ head: `<title>Pin research tools for marketers and creators | Pins</title>\n<link rel="canonical" href="https://ex.com${path}">\n${extraHead}`, body: `<main><h1>Pins</h1><p>${words(300)}</p></main>` })
const sitemap = paths => `<?xml version="1.0"?><urlset>${paths.map(p => `<url><loc>https://ex.com${p}</loc></url>`).join('')}</urlset>`
const noindex = '<meta name="robots" content="noindex, nofollow">'

async function audit(files) {
  const { site, cleanup } = makeSite(files, { baseUrl: 'https://ex.com' })
  try {
    return await runAudit(site)
  } finally {
    cleanup()
  }
}

const check = (a, id) => a.checks.find(c => c.id === id)

test('a noindex page outside the sitemap is left out of page averages and listed', async () => {
  const a = await audit({
    'index.html': page('/', og('/')),
    'about.html': page('/about.html', og('/about.html')),
    'privacy.html': page('/privacy.html', noindex),
    'sitemap.xml': sitemap(['/', '/about.html'])
  })
  assert.deepEqual(a.excludedPages.map(p => p.file), ['privacy.html'])
  const ogCheck = check(a, 'meta.open-graph')
  assert.equal(ogCheck.score, 3, 'privacy has no Open Graph tags but is not scored')
  assert.equal(ogCheck.pages, 2)
  assert.equal(ogCheck.excludedPages, 1)
  assert.ok(ogCheck.findings.every(f => f.locations.every(l => l.file !== 'privacy.html')))
  assert.equal(check(a, 'crawlability.indexability').score, 8)
})

test('freshness and author findings on an excluded page become advice', async () => {
  const a = await audit({
    'index.html': page('/'),
    'about.html': page('/about.html'),
    'privacy.html': page('/privacy.html', noindex)
  })
  const fresh = check(a, 'content.freshness')
  assert.ok(fresh.findings.every(f => f.locations.every(l => l.file !== 'privacy.html')))
  const advice = fresh.advice.find(f => /^Page kept out of search: /.test(f.message))
  assert.ok(advice, 'missing advice for the excluded page')
  assert.deepEqual(advice.locations.map(l => l.file), ['privacy.html'])
  assert.ok(check(a, 'meta.open-graph').advice.length === 0, 'Open Graph is not advice on excluded pages')
  const author = check(a, 'content.author').advice.map(f => f.message)
  assert.ok(author.some(m => /author attribution/.test(m)))
  assert.ok(!author.some(m => /expertise/i.test(m)), 'expertise credentials are not asked of legal pages')
})

test('a noindex page listed in the sitemap is scored and flagged as a conflict', async () => {
  const a = await audit({
    'index.html': page('/'),
    'privacy.html': page('/privacy.html', noindex),
    'sitemap.xml': sitemap(['/', '/privacy.html'])
  })
  assert.equal(a.excludedPages.length, 0)
  const idx = check(a, 'crawlability.indexability')
  assert.equal(idx.score, 4) // mean of 8 (home) and 0 (conflict)
  assert.ok(idx.findings.some(f => /listed in the sitemap/.test(f.message)))
})

test('a sitemap index is followed to its child sitemaps in repo mode', async () => {
  const a = await audit({
    'index.html': page('/'),
    'privacy.html': page('/privacy.html', noindex),
    'sitemap_index.xml': '<sitemapindex><sitemap><loc>https://ex.com/pages-sitemap.xml</loc></sitemap></sitemapindex>',
    'pages-sitemap.xml': sitemap(['/', '/privacy'])
  })
  assert.equal(a.excludedPages.length, 0, 'privacy is listed in the child sitemap')
  assert.ok(check(a, 'crawlability.indexability').findings.some(f => /listed in the sitemap/.test(f.message)))
})

test('the exclusion reason says when there is no sitemap', async () => {
  const withMap = await audit({ 'index.html': page('/'), 'privacy.html': page('/privacy.html', noindex), 'sitemap.xml': sitemap(['/']) })
  assert.equal(withMap.excludedPages[0].reason, 'noindex, not in the sitemap')
  const noMap = await audit({ 'index.html': page('/'), 'privacy.html': page('/privacy.html', noindex) })
  assert.equal(noMap.excludedPages[0].reason, 'noindex, and the site has no sitemap that lists pages')
})

test('a noindex homepage is never excluded', async () => {
  const a = await audit({ 'index.html': page('/', noindex), 'about.html': page('/about.html') })
  assert.equal(a.excludedPages.length, 0)
  assert.equal(check(a, 'crawlability.indexability').failingPages[0].file, 'index.html')
})

test('an advisory check is reported as advice and never counted', async () => {
  const rubric = loadRubric()
  const signals = rubric.checks.find(c => c.id === 'ai-access.content-signals')
  assert.equal(signals.advisory, true)
  assert.equal(rubric.max_score, rubric.checks.filter(c => !c.advisory).reduce((s, c) => s + c.weight, 0))

  const a = await audit({ 'index.html': page('/'), 'robots.txt': 'User-agent: *\nAllow: /\n' })
  const c = check(a, 'ai-access.content-signals')
  assert.equal(c.status, 'advice')
  assert.equal(c.lost, 0)
  assert.equal(c.findings.length, 0)
  assert.match(c.advice[0].message, /no Content-Signal line/)
  const protocols = check(a, 'agent-readiness.protocols')
  assert.equal(a.available, rubric.max_score - (protocols.status === 'na' ? protocols.weight : 0))
  const cat = a.categories.find(x => x.id === 'ai-access')
  assert.equal(cat.max, rubric.categories.find(x => x.id === 'ai-access').max)

  const declared = await audit({ 'index.html': page('/'), 'robots.txt': 'User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n' })
  assert.equal(declared.total, a.total, 'declaring Content Signals does not change the score')
  assert.equal(check(declared, 'ai-access.content-signals').status, 'pass')
})

test('the report lists excluded pages and advice, and keeps advice out of issues', async () => {
  const files = { 'index.html': page('/'), 'about.html': page('/about.html'), 'privacy.html': page('/privacy.html', noindex), 'robots.txt': 'User-agent: *\nAllow: /\n' }
  const { site, cleanup } = makeSite(files, { baseUrl: 'https://ex.com' })
  try {
    const a = await runAudit(site)
    const report = renderReport(site, a, { rubric: loadRubric(), date: '2026-10-01' })
    assert.match(report, /Not scored: 1 page\(s\) kept out of search on purpose \(noindex, and the site has no sitemap that lists pages\): `https:\/\/ex\.com\/privacy\.html`/)
    assert.match(report, /## Advice \(no points\)/)
    const issues = report.slice(report.indexOf('## Issues by points lost'), report.indexOf('## Advice'))
    assert.doesNotMatch(issues, /Content Signals/)
    assert.match(report, /\| Content Signals \| ADVICE \| not scored \|/)
  } finally {
    cleanup()
  }
})

test('running only an advisory check reports advice, not a 0/0 score', async () => {
  const { site, cleanup } = makeSite({ 'index.html': page('/'), 'robots.txt': 'User-agent: *\nAllow: /\n' }, { baseUrl: 'https://ex.com' })
  try {
    const a = await runAudit(site, { only: ['ai-access.content-signals'] })
    assert.equal(a.available, 0)
    const summary = renderSummary(site, a)
    assert.match(summary, /^Advice only, no score: Content Signals advice/)
    assert.doesNotMatch(summary, /0\/0/)
    assert.match(renderReport(site, a, { rubric: loadRubric() }), /No score: only advice checks ran/)
  } finally {
    cleanup()
  }
})
