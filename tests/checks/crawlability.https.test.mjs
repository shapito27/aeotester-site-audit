import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/crawlability/https.mjs'
import { runCheck, html } from '../helpers.mjs'

const canonical = url => `<link rel="canonical" href="${url}">`
const page = (head = '', body = '<h1>Hi</h1>') => html({ head, body })

test('https canonical and no mixed content scores full (predicted)', () => {
  const r = runCheck(check, { 'index.html': page(canonical('https://x.example/')) })
  assert.equal(r.score, 2)
  assert.equal(r.predicted, true)
  assert.equal(r.details.scheme, 'https')
})

test('http site URL with nothing forcing HTTPS scores 0', () => {
  const r = runCheck(check, { 'index.html': page(canonical('http://x.example/')) })
  assert.equal(r.score, 0)
  assert.equal(r.findings[0].file, 'index.html')
  assert.match(r.findings[0].message, /Canonical declares an http/)
})

test('mixed content on an https site scores 1 with element findings', () => {
  const body = '<img src="http://cdn.x.example/a.png" alt="a">\n<script src="http://cdn.x.example/a.js"></script>\n<link rel="stylesheet" href="http://cdn.x.example/a.css">\n<iframe src="http://v.example/"></iframe>'
  const r = runCheck(check, { 'index.html': page(canonical('https://x.example/'), body) })
  assert.equal(r.score, 1)
  assert.equal(r.details.mixedContentCount, 4)
  assert.equal(r.findings.length, 4)
  assert.ok(r.findings.every(f => f.file === 'index.html' && f.line > 0))
})

test('uppercase, protocol-relative and https references are not mixed content', () => {
  const body = '<img src="HTTP://a.example/a.png" alt=""><img src="//a.example/b.png" alt=""><img src="https://a.example/c.png" alt="">'
  assert.equal(runCheck(check, { 'index.html': page(canonical('https://x.example/'), body) }).score, 2)
})

test('HSTS header forces https even when the canonical says http', () => {
  const r = runCheck(check, { 'index.html': page(canonical('http://x.example/')), _headers: '/*\n  Strict-Transport-Security: max-age=63072000\n' })
  assert.equal(r.score, 2)
  assert.equal(r.details.forced, true)
  assert.equal(r.findings.length, 1)
})

test('http -> https redirect in _redirects forces https', () => {
  const r = runCheck(check, { 'index.html': page(), _redirects: 'http://x.example/* https://x.example/:splat 301!\n' })
  assert.equal(r.details.forced, true)
  assert.equal(r.score, 2)
})

test('host with HTTPS by default counts as https without a site URL', () => {
  const r = runCheck(check, { 'index.html': page(), 'vercel.json': '{}' })
  assert.equal(r.details.host, 'vercel')
  assert.equal(r.score, 2)
})

test('nothing known about the scheme is inconclusive at half weight', () => {
  const r = runCheck(check, { 'index.html': page() })
  assert.equal(r.inconclusive, true)
  assert.equal(r.score, 1)
})

test('localhost site URLs are ignored', () => {
  const r = runCheck(check, { 'index.html': page(canonical('http://localhost:4321/')) })
  assert.equal(r.inconclusive, true)
})

test('scheme is inferred from config without built pages', () => {
  const files = {
    'package.json': '{"dependencies":{"astro":"4"}}',
    'astro.config.mjs': "export default { site: 'https://x.example' }\n",
    'src/pages/index.astro': '<h1>Hi</h1>'
  }
  const r = runCheck(check, files)
  assert.equal(r.details.pagesScanned, 0)
  assert.equal(r.score, 2)
})
