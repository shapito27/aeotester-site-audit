import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/agent-readiness/markdown.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = (head = '') => `<!doctype html><html lang="en"><head><title>Home</title>${head}</head><body><main><h1>Home</h1></main></body></html>`
const md = { headers: { 'content-type': 'text/markdown; charset=utf-8' }, body: '# Home\n' }
const ALT = '<link rel="alternate" type="text/markdown" href="/index.md">'
const wantsMd = req => /^text\/markdown/.test(req.headers.accept || '')

test('live negotiation answering text/markdown scores full, measured', async () => {
  const r = await runLiveCheck(check, { '/': req => (wantsMd(req) ? md : page()) })
  assert.equal(r.score, 3)
  assert.ok(!r.predicted)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.negotiation, 'yes')
})

test('plugin: live <link> alternate that works earns full points; failed negotiation is advice', async () => {
  const r = await runLiveCheck(check, { '/': page(ALT), '/index.md': md })
  assert.equal(r.score, 3)
  assert.ok(!r.inconclusive)
  assert.equal(r.findings.length, 0)
  assert.match(r.advice[0].message, /Optional: also answer.*got text\/html/)
  assert.equal(r.details.negotiation, 'no')
  assert.equal(r.details.alternates[0].works, true)
})

test('live Link header alternate that resolves scores 3', async () => {
  const r = await runLiveCheck(check, { '/': { body: page(), headers: { link: '</index.md>; rel="alternate"; type="text/markdown"' } }, '/index.md': md })
  assert.equal(r.score, 3)
  assert.equal(r.details.alternates[0].via, 'header')
})

test('live: nothing advertised and HTML for Accept: text/markdown is a measured 0', async () => {
  const r = await runLiveCheck(check, { '/': page() })
  assert.equal(r.score, 0)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.negotiation, 'no')
})

test('live: an advertised alternate that 404s is a measured 0 with a finding', async () => {
  const r = await runLiveCheck(check, { '/': page(ALT) })
  assert.equal(r.score, 0)
  assert.ok(!r.inconclusive)
  assert.ok(r.findings.some(f => /answers HTTP 404/.test(f.message)))
})

test('live markdown probe 403 is inconclusive', async () => {
  const r = await runLiveCheck(check, { '/': req => (wantsMd(req) ? { status: 403, body: 'no' } : page()) })
  assert.equal(r.score, 1)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.negotiation, 'unreachable')
})

test('live page beyond the probe limit with nothing advertised is inconclusive, not 0', async () => {
  const r = await runLiveCheck(check, { '/': page() }, { patch: site => site.live.markdown.clear() })
  assert.equal(r.score, 1)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.probed, false)
})

test('live page beyond the probe limit with a working alternate scores 3', async () => {
  const r = await runLiveCheck(check, { '/': page(ALT), '/index.md': md }, { patch: site => site.live.markdown.clear() })
  assert.equal(r.score, 3)
  assert.ok(!r.inconclusive)
  assert.equal(r.advice.length, 0)
})
