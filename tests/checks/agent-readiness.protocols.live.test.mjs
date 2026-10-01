import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/agent-readiness/protocols.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = (body = '') => `<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1>${body}</main></body></html>`
const json = obj => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) })
const API_LINK = '<a href="/api/">API</a>'

test('live MCP server card and OpenAPI document are found, measured', async () => {
  const r = await runLiveCheck(check, {
    '/': page(),
    '/.well-known/mcp/server-card.json': json({ name: 'x' }),
    '/.well-known/openapi.json': json({ openapi: '3.1.0' })
  })
  assert.equal(r.score, 5)
  assert.ok(!r.predicted)
  assert.deepEqual(r.details.found, ['/.well-known/mcp/server-card.json', '/.well-known/openapi.json'])
  assert.match(r.details.foundFiles[0], /^http:\/\/127\.0\.0\.1:\d+\/\.well-known\/mcp\/server-card\.json$/)
})

test('live api-catalog is validated by its real content type', async () => {
  const r = await runLiveCheck(check, { '/': page(), '/.well-known/api-catalog': { headers: { 'content-type': 'application/linkset+json' }, body: '{"x":1}' } })
  assert.equal(r.score, 3)
  assert.deepEqual(r.details.found, ['/.well-known/api-catalog'])
})

test('live SPA fallback HTML on discovery paths is not an artifact; plain site is na', async () => {
  const r = await runLiveCheck(check, { '/': page(), '*': page() })
  assert.equal(r.na, true)
  assert.deepEqual(r.details.found, [])
})

test('live API surface with no artifacts is a measured 0, invalid card reported', async () => {
  const r = await runLiveCheck(check, { '/': page(API_LINK), '/.well-known/agent-card.json': json({}) })
  assert.equal(r.score, 0)
  assert.ok(!r.na)
  assert.ok(!r.inconclusive)
  assert.ok(r.findings.some(f => /agent-card\.json exists but does not validate/.test(f.message)))
})

test('live API surface with 403 discovery paths is inconclusive, not 0', async () => {
  const r = await runLiveCheck(check, { '/': page(API_LINK), '*': { status: 403, body: 'no' } })
  assert.equal(r.score, 3)
  assert.equal(r.inconclusive, true)
  assert.ok(r.details.unreachable.length > 0)
})
