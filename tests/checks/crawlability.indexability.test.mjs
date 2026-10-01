import { test } from 'node:test'
import assert from 'node:assert/strict'
import check, { parseDirectives } from '../../skills/audit/scripts/checks/crawlability/indexability.mjs'
import { runCheck, html } from '../helpers.mjs'
import { noindexIntent } from '../../skills/audit/scripts/lib/noindex.mjs'

const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const content = `<main><h1>Pin boards</h1><p>${words(250)}</p></main>`
const page = (head, body = content, title = 'Pin boards for research | InsightPins') => html({ head: `<title>${title}</title>\n${head}`, body })
const site = (aboutHead, extra = {}) => ({ 'index.html': page('<link rel="canonical" href="/">'), 'about.html': page(aboutHead), ...extra })
const about = { pageFile: 'about.html' }
const withBase = { pageFile: 'about.html', siteOptions: { baseUrl: 'https://ex.com' } }

test('self-referencing canonical and no robots directives scores full', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">'), about)
  assert.equal(r.score, 8)
  assert.equal(r.details.canonical.status, 'pass')
  assert.equal(r.findings.length, 0)
})

const sitemap = paths => ({ 'sitemap.xml': `<?xml version="1.0"?><urlset>${paths.map(p => `<url><loc>https://ex.com${p}</loc></url>`).join('')}</urlset>` })

test('noindex page that is not in the sitemap is kept out of search on purpose: full score, no findings', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">\n<meta name="robots" content="noindex, follow">', sitemap(['/'])), about)
  assert.equal(r.score, 8)
  assert.equal(r.details.intentionalNoindex, true)
  assert.equal(r.findings.length, 0)
})

test('noindex page with no sitemap at all is also deliberate', () => {
  assert.equal(runCheck(check, site('<link rel="canonical" href="/about.html">\n<meta name="robots" content="noindex">'), about).score, 8)
})

test('a noindex for one crawler only is not deliberate exclusion and scores 0', () => {
  assert.equal(runCheck(check, site('<meta name="GPTBot" content="noindex">'), about).score, 0)
  assert.equal(runCheck(check, site('<link rel="canonical" href="/about.html">', { _headers: '/about\n  X-Robots-Tag: googlebot: noindex\n' }), about).score, 0)
})

test('an X-Robots-Tag noindex for all crawlers off the sitemap is deliberate', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">', { _headers: '/about\n  X-Robots-Tag: noindex\n' }), about)
  assert.equal(r.score, 8)
  assert.equal(r.details.intentionalNoindex, true)
})

test('noindex page listed in the sitemap is a conflict and scores 0', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">\n<meta name="robots" content="noindex">', sitemap(['/', '/about'])), about)
  assert.equal(r.score, 0)
  assert.match(r.message, /listed in the sitemap/)
  assert.ok(r.findings.some(f => /listed in the sitemap/.test(f.message)))
})

test('noindex on the homepage always scores 0', () => {
  const files = { 'index.html': page('<link rel="canonical" href="/">\n<meta name="robots" content="noindex">'), 'about.html': page('') }
  const r = runCheck(check, files, { pageFile: 'index.html' })
  assert.equal(r.score, 0)
  assert.match(r.message, /Homepage has a noindex/)
})

test('noindex on the only audited page (single URL mode) is never treated as deliberate', () => {
  const doc = { querySelectorAll: () => [{ getAttribute: n => (n === 'name' ? 'robots' : 'noindex'), line: 3 }] }
  const pg = { urlPath: '/blog/post', doc }
  const fake = { sampleMode: 'single', pages: [pg], sitemaps: [], host: { headersFor: () => ({}) } }
  const intent = noindexIntent(pg, fake)
  assert.equal(intent.noindex, true)
  assert.equal(intent.intentional, false)
  assert.equal(noindexIntent(pg, { ...fake, sampleMode: 'sample', pages: [pg, pg] }).intentional, true)
})

test('missing canonical loses 1', () => {
  const r = runCheck(check, site(''), about)
  assert.equal(r.score, 7)
  assert.equal(r.details.canonical.status, 'warning')
})

test('multiple canonicals lose 3', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">\n<link rel="canonical" href="/about">'), about)
  assert.equal(r.score, 5)
  assert.match(r.findings[0].message, /Duplicate canonical/)
})

test('canonical to another path loses 2', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/">'), about)
  assert.equal(r.score, 6)
})

test('nofollow loses 2', () => {
  assert.equal(runCheck(check, site('<link rel="canonical" href="/about.html">\n<meta name="robots" content="nofollow">'), about).score, 6)
})

test('"none" is noindex + nofollow', () => {
  assert.equal(runCheck(check, site('<meta name="robots" content="none">', sitemap(['/about.html'])), about).score, 0)
  assert.deepEqual(parseDirectives('none'), { noindex: true, nofollow: true, none: true })
})

test('max-image-preview:none is not "none" (divergence from extension)', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">\n<meta name="robots" content="index, follow, max-image-preview:none, max-snippet:-1">'), about)
  assert.equal(r.score, 8)
  assert.equal(parseDirectives('max-image-preview: none').noindex, false)
  assert.equal(parseDirectives('googlebot: noindex').noindex, true)
  assert.equal(parseDirectives('unavailable_after: 25 Jun 2030 15:00:00 PST').noindex, false)
})

test('canonical on another host is critical when the base URL is known', () => {
  const r = runCheck(check, site('<link rel="canonical" href="https://other.com/about.html">'), withBase)
  assert.equal(r.score, 0)
  assert.equal(r.details.canonical.hostCompared, true)
})

test('www vs apex is still a different host', () => {
  assert.equal(runCheck(check, site('<link rel="canonical" href="https://www.ex.com/about.html">'), withBase).score, 0)
})

test('absolute canonical without a base URL compares the path only (source substitute)', () => {
  const r = runCheck(check, site('<link rel="canonical" href="https://other.com/about.html">'), about)
  assert.equal(r.score, 8)
  assert.equal(r.details.canonical.hostCompared, false)
})

test('clean-URL canonical served by the same file is self-referencing (divergence from extension)', () => {
  const r = runCheck(check, site('<link rel="canonical" href="https://ex.com/about">'), withBase)
  assert.equal(r.score, 8)
  const r2 = runCheck(check, site('<link rel="canonical" href="http://ex.com/about">'), withBase)
  assert.equal(r2.score, 6)
})

test('canonical with an empty href is treated as missing (divergence from extension)', () => {
  const r = runCheck(check, site('<link rel="canonical" href="">'), about)
  assert.equal(r.score, 7)
  assert.match(r.findings[0].message, /no valid href/)
})

test('X-Robots-Tag noindex from _headers scores 0 and is predicted (source substitute)', () => {
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">', { _headers: '/about\n  X-Robots-Tag: noindex\n', ...sitemap(['/about']) }), about)
  assert.equal(r.score, 0)
  assert.equal(r.predicted, true)
  assert.equal(r.findings[0].file, '_headers')
  assert.equal(r.findings[0].line, 2)
})

test('X-Robots-Tag nofollow from vercel.json loses 2', () => {
  const vercel = JSON.stringify({ headers: [{ source: '/about', headers: [{ key: 'X-Robots-Tag', value: 'nofollow' }] }] })
  const r = runCheck(check, site('<link rel="canonical" href="/about.html">', { 'vercel.json': vercel }), about)
  assert.equal(r.score, 6)
  assert.equal(r.predicted, true)
})

test('soft 404: error title plus thin content scores 0', () => {
  const r = runCheck(check, { 'index.html': page('<link rel="canonical" href="/">', '<main><h1>Oops</h1><p>We could not find that.</p></main>', 'Page not found') })
  assert.equal(r.score, 0)
  assert.deepEqual(r.details.soft404.signals, ['title', 'thin'])
})

test('thin content alone is not a soft 404', () => {
  const r = runCheck(check, { 'index.html': page('<link rel="canonical" href="/">', '<main><p>Short page.</p></main>') })
  assert.equal(r.score, 8)
  assert.equal(r.details.soft404.wordCount, 2)
})

test('fallback main content excludes nav, header, footer and aside', () => {
  const body = `<header>${words(100)}</header><nav>${words(100)}</nav><div>${words(20)}</div><footer>${words(100)}</footer>`
  const r = runCheck(check, { 'index.html': page('', body) })
  assert.equal(r.details.soft404.wordCount, 20)
})

test('404 inside a phone number or product code is not a signal (divergence from extension)', () => {
  const r = runCheck(check, { 'index.html': page('<link rel="canonical" href="/">', '<main><p>Call 404-555-0100 about model X404.</p></main>', 'Atlanta office X404') })
  assert.deepEqual(r.details.soft404.signals, ['thin'])
  assert.equal(r.score, 8)
})
