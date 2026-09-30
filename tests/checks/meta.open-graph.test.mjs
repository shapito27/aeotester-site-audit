import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/meta/open-graph.mjs'
import { runCheck, html } from '../helpers.mjs'

const og = (tags, extra = '') => ({
  'index.html': html({ head: Object.entries(tags).map(([k, v]) => `<meta property="og:${k}" content="${v}">`).join('\n') + extra })
})
const full = {
  title: 'Pins', description: 'Pin boards', image: 'https://ex.com/og.png', url: 'https://ex.com/', type: 'website'
}
const canonical = href => `\n<link rel="canonical" href="${href}">`

test('all tags present and consistent scores full', () => {
  const r = runCheck(check, og(full, canonical('https://ex.com')))
  assert.equal(r.score, 3)
  assert.equal(r.details.urlMatchesCanonical, true)
})

test('no tags at all scores 0', () => {
  const r = runCheck(check, og({}))
  assert.equal(r.score, 0)
  assert.equal(r.findings.length, 5)
})

test('missing og:url and og:type loses 0.5 (floored to 2)', () => {
  const { url, type, ...rest } = full
  assert.equal(runCheck(check, og(rest)).score, 2)
})

test('one empty required tag loses 0.75', () => {
  const r = runCheck(check, og({ ...full, image: '' }))
  assert.equal(r.score, 2)
  assert.deepEqual(r.details.emptyRequired, ['og:image'])
})

test('og:url not matching canonical loses 0.25', () => {
  const r = runCheck(check, og(full, canonical('https://ex.com/other')))
  assert.equal(r.details.urlMatchesCanonical, false)
  assert.equal(r.score, 2)
})

test('relative og:image is reported but not scored', () => {
  const r = runCheck(check, og({ ...full, image: '/og.png' }))
  assert.equal(r.score, 3)
  assert.equal(r.details.imageFormat, 'invalid_url')
  assert.equal(r.findings.length, 1)
})

test('name="og:*" is accepted as a fallback (divergence from extension)', () => {
  const files = { 'index.html': html({ head: Object.entries(full).map(([k, v]) => `<meta name="og:${k}" content="${v}">`).join('\n') }) }
  assert.equal(runCheck(check, files).score, 3)
})

test('relative canonical without a base URL resolves against og:url (source substitute)', () => {
  const r = runCheck(check, og({ ...full, url: 'https://ex.com/about' }, canonical('/about')), { pageFile: 'index.html' })
  assert.equal(r.details.urlMatchesCanonical, true)
  assert.equal(r.score, 3)
})

test('relative canonical with a known base URL resolves against the page URL', () => {
  const files = { 'index.html': html(), 'about.html': html({ head: Object.entries({ ...full, url: 'https://ex.com/about.html' }).map(([k, v]) => `<meta property="og:${k}" content="${v}">`).join('\n') + canonical('/about.html') }) }
  const r = runCheck(check, files, { pageFile: 'about.html', siteOptions: { baseUrl: 'https://ex.com' } })
  assert.equal(r.details.urlMatchesCanonical, true)
})
