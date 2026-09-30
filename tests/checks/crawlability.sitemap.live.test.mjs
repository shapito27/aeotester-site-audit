import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/crawlability/sitemap.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = '<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>'
const xml = body => ({ headers: { 'content-type': 'application/xml' }, body })
const sitemap = req => xml(`<?xml version="1.0"?><urlset><url><loc>http://${req.headers.host}/</loc></url></urlset>`)
const robotsWith = path => req => `User-agent: *\nAllow: /\nSitemap: http://${req.headers.host}${path}\n`

test('live sitemap referenced in robots.txt scores full', async () => {
  const r = await runLiveCheck(check, { '/': page, '/sitemap.xml': sitemap, '/robots.txt': robotsWith('/sitemap.xml') })
  assert.equal(r.score, 5)
  assert.ok(!r.predicted)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.urlCount, 1)
  assert.equal(r.details.referencedInRobots, true)
})

test('live sitemap at a non-standard path declared in robots.txt is found', async () => {
  const r = await runLiveCheck(check, { '/': page, '/maps/site.xml': sitemap, '/robots.txt': robotsWith('/maps/site.xml') })
  assert.equal(r.score, 5)
  assert.equal(r.details.url, '/maps/site.xml')
})

test('live: no sitemap anywhere is a measured fail', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': 'User-agent: *\nAllow: /\n' })
  assert.equal(r.score, 0)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.exists, false)
})

test('live sitemap.xml 403 is inconclusive, not a fail', async () => {
  const r = await runLiveCheck(check, { '/': page, '/sitemap.xml': { status: 403, body: 'no' }, '/robots.txt': 'User-agent: *\nAllow: /\n' })
  assert.equal(r.score, 2)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.exists, null)
})

test('live robots.txt 403 with no sitemap found is inconclusive', async () => {
  const r = await runLiveCheck(check, { '/': page, '/robots.txt': { status: 403, body: 'no' } })
  assert.equal(r.score, 2)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.robotsUnreachable, true)
})

test('live sitemap found but robots.txt 403 is not penalized', async () => {
  const r = await runLiveCheck(check, { '/': page, '/sitemap.xml': sitemap, '/robots.txt': { status: 403, body: 'no' } })
  assert.equal(r.score, 5)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.referencedInRobots, null)
})
