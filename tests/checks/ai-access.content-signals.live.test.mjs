import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/ai-access/content-signals.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = '<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>'

test('live robots.txt Content-Signal scores full', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': 'User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n' })
  assert.equal(r.score, 3)
  assert.equal(r.details.source, 'robots')
  assert.ok(!r.predicted)
})

test('live Content-Signal response header scores full and is measured', async () => {
  const r = await runLiveCheck(check, { '/': { body: page, headers: { 'content-signal': 'search=yes, ai-input=yes, ai-train=no' } }, '/robots.txt': 'User-agent: *\nAllow: /\n' })
  assert.equal(r.score, 3)
  assert.equal(r.details.source, 'header')
  assert.equal(r.details.headerSource, 'HTTP response')
  assert.equal(r.details.headerUrlPath, '/')
  assert.ok(!r.predicted)
})

test('live header is read from the audited page, not only /', async () => {
  const r = await runLiveCheck(check, { '/docs/a': { body: page, headers: { 'content-signal': 'ai-train=no' } } }, { path: '/docs/a' })
  assert.equal(r.score, 3)
  assert.equal(r.details.headerUrlPath, '/docs/a')
})

test('live robots.txt without signals and no header scores 0', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': 'User-agent: *\nAllow: /\n' })
  assert.equal(r.score, 0)
  assert.ok(!r.inconclusive)
})

test('live robots.txt 404 and no header scores 0, not inconclusive', async () => {
  const r = await runLiveCheck(check, { '/': page })
  assert.equal(r.score, 0)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.robotsTxtExists, false)
})

test('live robots.txt 403 and no header is inconclusive', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': { status: 403, body: 'no' } })
  assert.equal(r.score, 2)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.robotsTxtExists, null)
})
