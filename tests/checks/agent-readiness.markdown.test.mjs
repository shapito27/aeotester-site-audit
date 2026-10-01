import { test } from 'node:test'
import assert from 'node:assert/strict'
import check, { markdownPaths } from '../../skills/audit/scripts/checks/agent-readiness/markdown.mjs'
import { runCheck, html } from '../helpers.mjs'

const index = (head = '') => html({ head, body: '<main><h1>Pins</h1></main>' })

test('nothing found scores 0 but stays inconclusive (negotiation not visible)', () => {
  const r = runCheck(check, { 'index.html': index() })
  assert.equal(r.score, 0)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.negotiation, 'unknown')
  assert.match(r.findings[0].message, /verify live/)
})

test('edge code negotiating text/markdown scores full, predicted', () => {
  const mw = "export async function onRequest(ctx) {\n  if (ctx.request.headers.get('Accept')?.includes('text/markdown')) return new Response(md, { headers: { 'Content-Type': 'text/markdown' } })\n}\n"
  const r = runCheck(check, { 'index.html': index(), 'functions/_middleware.js': mw })
  assert.equal(r.score, 3)
  assert.equal(r.weight, 3)
  assert.equal(r.predicted, true)
  assert.deepEqual(r.details.negotiationEvidence, ['functions/_middleware.js'])
})

test('Accept-Ranges alone is not negotiation evidence', () => {
  const r = runCheck(check, { 'index.html': index(), 'server.js': "res.set('Accept-Ranges', 'bytes'); res.type('text/markdown')" })
  assert.equal(r.score, 0)
})

test('plugin: <link rel=alternate type=text/markdown> earns full points, negotiation is advice', () => {
  const r = runCheck(check, { 'index.html': index('<link rel="alternate" type="text/markdown" href="/index.md">'), 'index.md': '# Pins\n' })
  assert.equal(r.score, 3)
  assert.ok(!r.inconclusive)
  assert.equal(r.findings.length, 0)
  assert.match(r.advice[0].message, /Optional: also answer "Accept: text\/markdown"/)
  assert.equal(r.details.domAlternateResolves, true)
})

test('plugin: an advertised alternate whose target is not in the site scores 0, as in URL mode', () => {
  const r = runCheck(check, { 'index.html': index('<link rel="alternate" type="text/markdown" href="/index.md">') })
  assert.equal(r.score, 0)
  assert.equal(r.inconclusive, true)
  assert.match(r.findings[0].message, /was not found in the site/)
})

test('Link header in _headers scores 3 (host config substitute)', () => {
  const r = runCheck(check, { 'index.html': index(), _headers: '/\n  Link: </index.md>; rel="alternate"; type="text/markdown"\n' })
  assert.equal(r.score, 3)
  assert.equal(r.details.linkHeaderSource, '_headers')
})

test('Link header values are tested one by one (divergence)', () => {
  const header = '/\n  Link: </fr/>; rel="alternate"; hreflang="fr", </notes.md>; rel="preload"; type="text/markdown"\n'
  assert.equal(runCheck(check, { 'index.html': index(), _headers: header }).score, 0)
})

test('undiscoverable .md file next to the page scores 1', () => {
  const r = runCheck(check, { 'index.html': index(), 'index.md': '# Pins\n\nText' })
  assert.equal(r.score, 1)
  assert.equal(r.details.markdownFile, 'index.md')
})

test('/page.html probes /page.md (divergence)', () => {
  const files = { 'index.html': index(), 'about.html': index(), 'about.md': 'About us' }
  const r = runCheck(check, files, { pageFile: 'about.html' })
  assert.equal(r.score, 1)
  assert.deepEqual(markdownPaths('/about.html'), ['/about.md'])
  assert.deepEqual(markdownPaths('/blog/'), ['/blog.md', '/blog/index.md'])
  assert.deepEqual(markdownPaths('/file.pdf'), [])
})

test('a .md file that is really HTML does not count', () => {
  assert.equal(runCheck(check, { 'index.html': index(), 'index.md': '<!DOCTYPE html><html></html>' }).score, 0)
})
