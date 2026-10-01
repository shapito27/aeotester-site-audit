import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/crawlability/indexability.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const words = Array.from({ length: 250 }, (_, i) => `word${i}`).join(' ')
const page = req => `<!doctype html><html lang="en"><head><title>Guide</title><link rel="canonical" href="http://${req.headers.host}/"></head><body><main><h1>Guide</h1><p>${words}</p></main></body></html>`

test('live self-canonical page with no noindex header scores full', async () => {
  const r = await runLiveCheck(check, { '/': page })
  assert.equal(r.score, 8)
  assert.ok(!r.predicted)
  assert.equal(r.details.canonical.status, 'pass')
})

test('live X-Robots-Tag noindex header is measured, with no file lookup', async () => {
  const r = await runLiveCheck(check, { '/': req => ({ body: page(req), headers: { 'x-robots-tag': 'noindex' } }) })
  assert.equal(r.score, 0)
  assert.ok(!r.predicted)
  const f = r.findings.find(x => /X-Robots-Tag/.test(x.message))
  assert.match(f.file, /^http:\/\/127\.0\.0\.1:\d+\/$/)
  assert.equal(f.line, null)
  assert.equal(r.details.robots.issues[0].source, 'HTTP response')
  assert.match(r.recommendation, /response header/)
})
