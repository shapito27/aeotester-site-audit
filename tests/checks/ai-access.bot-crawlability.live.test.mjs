import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/ai-access/bot-crawlability.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = '<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>'

test('live robots.txt allowing everything scores full (measured)', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': 'User-agent: *\nAllow: /\n' })
  assert.equal(r.score, 12)
  assert.ok(!r.inconclusive)
  assert.ok(!r.predicted)
  assert.equal(r.details.robotsTxtExists, true)
})

test('live robots.txt blocking GPTBot is capped and points at the live file', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': 'User-agent: GPTBot\nDisallow: /\n' })
  assert.ok(r.score <= 9)
  assert.ok(r.details.majorBlocked.includes('GPTBot'))
  assert.match(r.findings[0].file, /^http:\/\/127\.0\.0\.1:\d+\/robots\.txt$/)
  assert.equal(r.findings[0].line, 2)
})

test('live robots.txt 404 is absent (8), not inconclusive', async () => {
  const r = await runLiveCheck(check, { '/': page })
  assert.equal(r.score, 8)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.robotsTxtExists, false)
  assert.equal(r.details.status, 404)
})

test('live robots.txt served as an HTML fallback is absent', async () => {
  const r = await runLiveCheck(check, { '/': page, '*': page })
  assert.equal(r.score, 8)
  assert.equal(r.details.robotsTxtExists, false)
  assert.match(r.findings[0].message, /HTML page/)
})

test('live robots.txt 403 is inconclusive at half weight', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': { status: 403, body: 'forbidden' } })
  assert.equal(r.score, 6)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.robotsTxtExists, null)
  assert.match(r.message, /HTTP 403/)
})
