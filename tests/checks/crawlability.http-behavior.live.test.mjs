import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/crawlability/http-behavior.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = (links = '') => `<!doctype html><html lang="en"><head><title>Home</title></head><body><nav>${links}</nav><main><h1>Home</h1></main></body></html>`

test('live real 404, 200 pages and no noindex header scores full', async () => {
  const r = await runLiveCheck(check, { '/': page() })
  assert.equal(r.score, 3)
  assert.ok(!r.predicted)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.probe.status, 404)
  assert.equal(r.details.measured, true)
})

test('live soft 404 (unknown URL answers 200) loses the probe point', async () => {
  const r = await runLiveCheck(check, { '/': page(), '*': page() })
  assert.equal(r.score, 2)
  assert.equal(r.details.probe.soft404, true)
  assert.match(r.message, /soft 404/)
  assert.match(r.findings[0].file, /aeotester-404-check-/)
})

test('live X-Robots-Tag noindex header loses the header point', async () => {
  const r = await runLiveCheck(check, { '/': { body: page(), headers: { 'x-robots-tag': 'noindex' } } })
  assert.equal(r.score, 2)
  assert.equal(r.details.xRobotsTag.blockedByHeader, true)
  assert.match(r.findings[0].file, /^http:\/\/127\.0\.0\.1:\d+\/$/)
  assert.equal(r.findings[0].line, null)
})

test('live page answering 500 counts against page status', async () => {
  const r = await runLiveCheck(check, { '/': page('<a href="/about">About</a>'), '/about': { status: 500, body: 'boom' } })
  assert.equal(r.details.pages.notOk.length, 1)
  assert.equal(r.details.pages.notOk[0].status, 500)
  assert.equal(r.score, 2) // 1 + 0.5 + 1, floored
})

test('live section roots guessed by the sampler do not count as broken pages', async () => {
  const r = await runLiveCheck(check, { '/': page('<a href="/blog/post-1">Post</a>'), '/blog/post-1': page() })
  assert.equal(r.details.pages.notOk.length, 0)
  assert.equal(r.score, 3)
})

test('live unknown URL probe 403 is inconclusive at half a point', async () => {
  const r = await runLiveCheck(check, { '/': page(), '*': { status: 403, body: 'no' } })
  assert.equal(r.score, 2)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.probe.point, 0.5)
})
