import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/crawlability/sitemap.mjs'
import { runCheck, html } from '../helpers.mjs'

const SITEMAP = '<?xml version="1.0"?>\n<urlset><url><loc>https://x.example/</loc></url></urlset>\n'
const ROBOTS = 'User-agent: *\nAllow: /\nSitemap: https://x.example/sitemap.xml\n'
const site = (files = {}) => ({ 'index.html': html({ body: '<h1>Hi</h1>' }), ...files })

test('sitemap with URLs referenced in robots.txt scores full', () => {
  const r = runCheck(check, site({ 'sitemap.xml': SITEMAP, 'robots.txt': ROBOTS }))
  assert.equal(r.score, 5)
  assert.equal(r.details.urlCount, 1)
  assert.equal(r.details.url, '/sitemap.xml')
})

test('no sitemap scores 0', () => {
  const r = runCheck(check, site({ 'robots.txt': ROBOTS }))
  assert.equal(r.score, 0)
  assert.equal(r.details.exists, false)
})

test('probe order: sitemap-index.xml and sitemap1.xml are found', () => {
  assert.equal(runCheck(check, site({ 'sitemap-index.xml': SITEMAP, 'robots.txt': ROBOTS })).details.url, '/sitemap-index.xml')
  assert.equal(runCheck(check, site({ 'sitemap1.xml': SITEMAP, 'robots.txt': ROBOTS })).details.url, '/sitemap1.xml')
})

test('not referenced in robots.txt scores 3', () => {
  const r = runCheck(check, site({ 'sitemap.xml': SITEMAP, 'robots.txt': 'User-agent: *\nAllow: /\n' }))
  assert.equal(r.score, 3)
  assert.equal(r.findings[0].file, 'robots.txt')
})

test('missing robots.txt costs 3 (extension double penalty kept)', () => {
  assert.equal(runCheck(check, site({ 'sitemap.xml': SITEMAP })).score, 2)
})

test('empty sitemap costs 2', () => {
  const r = runCheck(check, site({ 'sitemap.xml': '<urlset></urlset>', 'robots.txt': ROBOTS }))
  assert.equal(r.score, 3)
  assert.equal(r.findings[0].file, 'sitemap.xml')
})

test('empty and unreferenced scores 1', () => {
  assert.equal(runCheck(check, site({ 'sitemap.xml': '<urlset></urlset>', 'robots.txt': 'User-agent: *\n' })).score, 1)
})

test('commented-out Sitemap line is not a reference (divergence)', () => {
  const r = runCheck(check, site({ 'sitemap.xml': SITEMAP, 'robots.txt': 'User-agent: *\n# Sitemap: https://x.example/sitemap.xml\n' }))
  assert.equal(r.details.referencedInRobots, false)
  assert.equal(r.score, 3)
})

test('sitemap declared in robots.txt at a non-probed path is found (divergence)', () => {
  const r = runCheck(check, site({ 'sitemaps/pages.xml': SITEMAP, 'robots.txt': 'Sitemap: https://x.example/sitemaps/pages.xml\n' }))
  assert.equal(r.score, 5)
  assert.equal(r.details.foundVia, 'robots')
  assert.equal(r.details.url, '/sitemaps/pages.xml')
})

test('<loc> with attributes or whitespace still counts (divergence)', () => {
  assert.equal(runCheck(check, site({ 'sitemap.xml': '<urlset><url><loc >https://x.example/</loc ></url></urlset>', 'robots.txt': ROBOTS })).details.urlCount, 1)
})

test('generated sitemap without a build is predicted found (source vs live)', () => {
  const files = {
    'package.json': '{"dependencies":{"astro":"4"}}',
    'astro.config.mjs': "import sitemap from '@astrojs/sitemap'\nexport default { site: 'https://x.example', integrations: [sitemap()] }\n",
    'public/robots.txt': ROBOTS,
    'src/pages/index.astro': '<h1>Hi</h1>'
  }
  const r = runCheck(check, files)
  assert.equal(r.predicted, true)
  assert.equal(r.score, 5)
  assert.equal(r.details.url, '/sitemap-index.xml')
})

test('generated robots.txt is not penalized (inconclusive)', () => {
  const r = runCheck(check, site({ 'sitemap.xml': SITEMAP, 'app/robots.ts': 'export default () => ({})' }))
  assert.equal(r.score, 5)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.referencedInRobots, null)
})
