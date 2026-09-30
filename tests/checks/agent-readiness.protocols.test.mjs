import { test } from 'node:test'
import assert from 'node:assert/strict'
import check, { isSameSite } from '../../skills/audit/scripts/checks/agent-readiness/protocols.mjs'
import { runCheck, html } from '../helpers.mjs'

const index = (body = '<main><h1>Pins</h1></main>', head = '') => ({ 'index.html': html({ head, body }) })
const json = v => JSON.stringify(v)

test('plain content site is not applicable', () => {
  const r = runCheck(check, index())
  assert.equal(r.na, true)
  assert.equal(r.details.applicable, false)
})

test('API links without artifacts fail with 0', () => {
  const r = runCheck(check, index('<footer><a href="/docs/">Developer docs</a></footer>'))
  assert.equal(r.na, undefined)
  assert.equal(r.score, 0)
  assert.deepEqual(r.details.apiEvidence, ['/docs/'])
  assert.ok(r.findings.some(f => f.file === 'index.html'))
})

test('service-desc link and WebAPI JSON-LD are API evidence', () => {
  assert.equal(runCheck(check, index('<p>x</p>', '<link rel="service-desc" href="/openapi.yaml">')).score, 0)
  const ld = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebAPI","name":"Pins API"}</script>'
  assert.equal(runCheck(check, index('<p>x</p>', ld)).na, undefined)
})

test('one category scores 3', () => {
  const r = runCheck(check, { ...index(), '.well-known/mcp.json': json({ name: 'pins' }) })
  assert.equal(r.score, 3)
  assert.deepEqual(r.details.categories, ['mcp'])
})

test('two categories score 5, three or more score 6', () => {
  const two = { ...index(), '.well-known/mcp/server-card.json': json({}), '.well-known/agent-card.json': json({ name: 'Pins' }) }
  assert.equal(runCheck(check, two).score, 5)
  const three = { ...two, 'openapi.json': json({ openapi: '3.1.0' }) }
  assert.equal(runCheck(check, three).score, 6)
})

test('files that fail the validator do not count', () => {
  const r = runCheck(check, { ...index(), '.well-known/agent.json': json({ description: 'no name' }), '.well-known/oauth-authorization-server': '<!DOCTYPE html><p>404</p>' })
  assert.equal(r.na, true)
  assert.equal(r.findings.length, 2)
})

test('api-catalog counts via a linkset Content-Type in _headers (host config substitute)', () => {
  const files = { ...index(), '.well-known/api-catalog': 'not json', _headers: '/.well-known/api-catalog\n  Content-Type: application/linkset+json\n' }
  assert.equal(runCheck(check, files).score, 3)
  assert.equal(runCheck(check, { ...index(), '.well-known/api-catalog': json({ linkset: [{}] }) }).score, 3)
})

test('/.well-known/ai accepts any non-empty text', () => {
  assert.equal(runCheck(check, { ...index(), '.well-known/ai': 'contact: ai@example.com' }).score, 3)
})

test('WebMCP annotations on any page add a category', () => {
  const r = runCheck(check, { ...index(), 'tools.html': html({ body: '<form toolname="search" tooldescription="Search pins"></form>' }) })
  assert.equal(r.score, 3)
  assert.deepEqual(r.details.categories, ['webmcp'])
})

test('a framework route handler counts as predicted', () => {
  const r = runCheck(check, { ...index(), 'app/.well-known/mcp.json/route.ts': 'export function GET() {}' })
  assert.equal(r.score, 3)
  assert.equal(r.predicted, true)
})

test('same-site matching strips www and accepts subdomains', () => {
  assert.equal(isSameSite('www.example.com', 'api.example.com'), true)
  assert.equal(isSameSite('example.com', 'example.org'), false)
})
