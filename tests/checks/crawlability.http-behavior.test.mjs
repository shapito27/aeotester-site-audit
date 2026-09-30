import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/crawlability/http-behavior.mjs'
import { runCheck, html } from '../helpers.mjs'

const base = (files = {}) => ({ 'index.html': html({ body: '<h1>Hi</h1>' }), 'about.html': html({ body: '<h1>About</h1>' }), ...files })
const NOT_FOUND = { '404.html': html({ body: '<h1>Not found</h1>' }) }

test('404 page, no catch-all, no noindex scores full (predicted)', () => {
  const r = runCheck(check, base(NOT_FOUND))
  assert.equal(r.score, 3)
  assert.equal(r.predicted, true)
  assert.equal(r.details.probe.notFoundPage, '404.html')
})

test('SPA catch-all 200 rewrite is a soft 404', () => {
  const r = runCheck(check, base({ ...NOT_FOUND, _redirects: '# spa\n/*  /index.html  200\n' }))
  assert.equal(r.score, 2)
  assert.equal(r.details.probe.soft404, true)
  assert.deepEqual([r.findings[0].file, r.findings[0].line], ['_redirects', 2])
})

test('vercel.json catch-all rewrite is a soft 404', () => {
  const r = runCheck(check, base({ 'vercel.json': '{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}' }))
  assert.equal(r.details.probe.soft404, true)
})

test('netlify.toml redirect of everything to home is a soft 404', () => {
  const r = runCheck(check, base({ ...NOT_FOUND, 'netlify.toml': '[[redirects]]\n  from = "/*"\n  to = "/"\n  status = 302\n' }))
  assert.equal(r.details.probe.point, 0)
})

test('catch-all to a 404 page with status 404 is a real 404', () => {
  assert.equal(runCheck(check, base({ _redirects: '/*  /404.html  404\n' })).details.probe.point, 1)
})

test('no 404 page on an unknown host is inconclusive at half a point', () => {
  const r = runCheck(check, base())
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.probe.point, 0.5)
  assert.equal(r.score, 2) // 2.5 floored
})

test('no 404 page on a host with a default 404 still earns the point', () => {
  const r = runCheck(check, base({ 'netlify.toml': '[build]\n  publish = "."\n' }))
  assert.equal(r.details.probe.point, 1)
  assert.equal(r.details.probe.host, 'netlify')
})

test('X-Robots-Tag noindex in _headers loses the header point', () => {
  const r = runCheck(check, base({ ...NOT_FOUND, _headers: '/*\n  X-Robots-Tag: noindex\n' }))
  assert.equal(r.score, 2)
  assert.equal(r.details.xRobotsTag.blockedByHeader, true)
  assert.deepEqual([r.findings[0].file, r.findings[0].line], ['_headers', 2])
})

test('X-Robots-Tag on one of two pages loses half the header point', () => {
  const r = runCheck(check, base({ ...NOT_FOUND, _headers: '/about.html\n  X-Robots-Tag: none\n' }))
  assert.equal(r.details.xRobotsTag.blocked.length, 1)
  assert.equal(r.score, 2) // 2.5 floored
})

test('X-Robots-Tag noindex in .htaccess is detected', () => {
  const r = runCheck(check, base({ ...NOT_FOUND, '.htaccess': 'Header set X-Robots-Tag "noindex, nofollow"\n' }))
  assert.equal(r.details.xRobotsTag.blocked.length, 2)
})

test('X-Robots-Tag without noindex is fine', () => {
  assert.equal(runCheck(check, base({ ...NOT_FOUND, _headers: '/*\n  X-Robots-Tag: max-snippet:-1\n' })).score, 3)
})

test('forced redirect of a page to a missing path predicts a 404', () => {
  const r = runCheck(check, base({ ...NOT_FOUND, _redirects: '/about.html  /gone.html  301!\n' }))
  assert.equal(r.details.pages.notOk.length, 1)
  assert.equal(r.score, 2) // 2.5 floored
})

test('unforced _redirects rules are shadowed by existing files', () => {
  assert.equal(runCheck(check, base({ ...NOT_FOUND, _redirects: '/about.html  /gone.html  301\n' })).score, 3)
})

test('Basic-Auth header on pages predicts 401', () => {
  const r = runCheck(check, base({ ...NOT_FOUND, _headers: '/*\n  Basic-Auth: user:pass\n' }))
  assert.equal(r.details.pages.notOk.length, 2)
  assert.equal(r.score, 2)
})

test('framework 404 source page counts without a build', () => {
  const files = { 'package.json': '{"dependencies":{"astro":"4"}}', 'astro.config.mjs': 'export default {}', 'src/pages/index.astro': '<h1>Hi</h1>', 'src/pages/404.astro': '<h1>404</h1>' }
  const r = runCheck(check, files)
  assert.equal(r.score, 3)
  assert.equal(r.details.pages.checked, 1)
})
