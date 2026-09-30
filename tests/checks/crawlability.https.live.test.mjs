import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/crawlability/https.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = (body = '') => `<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1>${body}</main></body></html>`
// The test server speaks plain http, so an https origin is faked on the loaded site
const asHttps = httpOrigin => site => {
  site.live.origin = 'https://x.example'
  site.live.httpOrigin = httpOrigin
}

test('live http:// origin scores 0, measured', async () => {
  const r = await runLiveCheck(check, { '/': page() })
  assert.equal(r.score, 0)
  assert.ok(!r.predicted)
  assert.equal(r.details.isHttps, false)
  assert.equal(r.details.measured, true)
})

test('live https with HSTS and an http -> https redirect scores full', async () => {
  const r = await runLiveCheck(check, { '/': { body: page(), headers: { 'strict-transport-security': 'max-age=31536000' } } }, {
    patch: asHttps({ status: 301, headers: { location: 'https://x.example/' } })
  })
  assert.equal(r.score, 2)
  assert.ok(!r.predicted)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.hsts, true)
  assert.equal(r.details.httpRedirect.redirectsToHttps, true)
  assert.equal(r.recommendation, '')
})

test('live https where http:// serves content and mixed content scores 1', async () => {
  const r = await runLiveCheck(check, { '/': page('<img src="http://cdn.x.example/a.png" alt="a">') }, {
    patch: asHttps({ status: 200, headers: {} })
  })
  assert.equal(r.score, 1)
  assert.equal(r.details.mixedContentCount, 1)
  assert.equal(r.details.httpRedirect.redirectsToHttps, false)
  assert.ok(r.findings.some(f => /instead of redirecting/.test(f.message)))
  assert.ok(r.findings.some(f => /Mixed content/.test(f.message)))
})

test('live https with an unreachable http:// origin is not penalized', async () => {
  const r = await runLiveCheck(check, { '/': page() }, {
    patch: asHttps({ status: 0, headers: {}, error: 'ECONNREFUSED' })
  })
  assert.equal(r.score, 2)
  assert.equal(r.details.httpRedirect.error, 'ECONNREFUSED')
})
