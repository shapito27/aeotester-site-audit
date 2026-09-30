import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/content/freshness.mjs'
import { runCheck, html } from '../helpers.mjs'

const page = (head, body = '<p>Hi</p>') => ({ 'index.html': html({ head, body }) })
const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`
const pubMeta = '<meta property="article:published_time" content="2025-03-02">'
const modMeta = '<meta property="article:modified_time" content="2025-04-01">'

test('both meta dates score full', () => {
  const r = runCheck(check, page(pubMeta + modMeta))
  assert.equal(r.score, 5)
  assert.equal(r.findings.length, 0)
})

test('no dates score 0', () => {
  const r = runCheck(check, page(''))
  assert.equal(r.score, 0)
  assert.equal(r.findings[0].file, 'index.html')
})

test('publish only scores 3 and points at the publish meta', () => {
  const r = runCheck(check, page('\n' + pubMeta))
  assert.equal(r.score, 3)
  assert.match(r.findings[0].message, /Missing modified date/)
  assert.equal(r.message, 'Found publish date only')
})

test('JSON-LD dates are found at any depth', () => {
  const r = runCheck(check, page(ld({ '@graph': [{ '@type': 'WebPage', mainEntity: { '@type': 'Article', datePublished: '2025-01-01', dateModified: '2025-02-01' } }] })))
  assert.equal(r.score, 5)
  assert.equal(r.details.hasJsonLdPublish, true)
})

test('empty meta content does not count', () => {
  assert.equal(runCheck(check, page('<meta property="article:published_time" content="">')).score, 0)
})

test('unlabelled <time datetime> counts as a modified date (extension behaviour kept)', () => {
  const r = runCheck(check, page(pubMeta, '<footer><time datetime="2025-05-01">May 1</time></footer>'))
  assert.equal(r.score, 5)
})

test('invalid JSON-LD is skipped', () => {
  assert.equal(runCheck(check, page('<script type="application/ld+json">{"datePublished": "2025",}</script>')).score, 0)
})

test('divergence: a <time> labelled as the publish date counts as publish, not modified', () => {
  const r = runCheck(check, page('', '<p>Posted <time class="published" datetime="2025-03-02">Mar 2</time></p>'))
  assert.equal(r.score, 3)
  assert.equal(r.message, 'Found publish date only')
  const md = runCheck(check, page('', '<time itemprop="datePublished" datetime="2025-03-02">Mar 2</time>'))
  assert.equal(md.details.publishTimeElements, 1)
})

test('source: dates inside template-built JSON-LD count and are predicted', () => {
  const r = runCheck(check, page('<script type="application/ld+json">{"@type": "BlogPosting", "datePublished": {{ page.date | jsonify }}, "dateModified": "{{ page.last_modified_at }}"}</script>'))
  assert.equal(r.score, 5)
  assert.equal(r.predicted, true)
})

test('source: dates in an unparseable template block are not scored down', () => {
  const r = runCheck(check, page('<script type="application/ld+json">{"datePublished": "{{ d }}", {% if m %}"dateModified": "{{ m }}",{% endif %}}</script>'))
  assert.equal(r.score, 5)
  assert.equal(r.predicted, true)
})
