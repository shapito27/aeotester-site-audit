import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/structured-data/present.mjs'
import { runCheck, html } from '../helpers.mjs'

const ld = obj => `<script type="application/ld+json">${typeof obj === 'string' ? obj : JSON.stringify(obj)}</script>`
const page = (head, body = '<p>Hi</p>') => ({ 'index.html': html({ head, body }) })

const faq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [{ '@type': 'Question', name: 'What is it?', acceptedAnswer: { '@type': 'Answer', text: 'A pin board.' } }]
}
const org = { '@context': 'https://schema.org', '@type': 'Organization', name: 'InsightPins', url: 'https://x.example' }
const article = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pins',
  datePublished: '2025-03-02',
  author: { '@type': 'Person', name: 'Dana Lee' },
  publisher: { '@type': 'Organization', name: 'InsightPins' }
}

test('no structured data scores 0 with a finding', () => {
  const r = runCheck(check, page(''))
  assert.equal(r.score, 0)
  assert.equal(r.findings[0].file, 'index.html')
})

test('valid FAQ plus Organization plus Article reaches the cap', () => {
  const r = runCheck(check, page(ld(faq) + ld(org) + ld(article)))
  // 4 + 8 + 3 + 2 + 1 (nested Person) = 18, capped at 15
  assert.equal(r.score, 15)
  assert.equal(r.findings.length, 0)
})

test('Article with nested publisher and author earns Organization and Person tiers', () => {
  const r = runCheck(check, page(ld(article)))
  // 4 + Organization 3 + Article 2 + Person 1
  assert.equal(r.score, 10)
  assert.equal(r.details.breakdown.Organization.points, 3)
})

test('invalid FAQ earns 4 instead of 8 and reports the issue', () => {
  const bad = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q?' }] }
  const r = runCheck(check, page(ld(bad) + ld(org)))
  assert.equal(r.score, 4 + 4 + 3)
  assert.ok(r.findings.some(f => /FAQ schema is invalid: Question 0: Missing acceptedAnswer/.test(f.message)))
})

test('tier 2 invalid rounds half points', () => {
  const r = runCheck(check, page(ld({ '@type': 'Article', headline: 'x' }) + ld({ '@type': 'VideoObject', name: 'v' })))
  // 4 + 0.5 + 0.5 = 5
  assert.equal(r.score, 5)
})

test('Microdata only is a fixed 4', () => {
  const r = runCheck(check, page('', '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Pin</span></div>'))
  assert.equal(r.score, 4)
  assert.deepEqual(r.details.microdata.types, ['Product'])
})

test('RDFa vocab counts, OpenGraph property alone does not', () => {
  assert.equal(runCheck(check, page('', '<div vocab="https://schema.org/" typeof="Person"><span property="name">A</span></div>')).score, 4)
  assert.equal(runCheck(check, page('<meta property="og:title" content="x">')).score, 0)
})

test('only broken JSON-LD scores 0 and points at the block', () => {
  const r = runCheck(check, page('\n' + ld('{"@type": "Organization",}')))
  assert.equal(r.score, 0)
  assert.equal(r.findings[0].message, 'JSON-LD block is not valid JSON')
})

test('divergence: broken JSON-LD no longer hides Microdata', () => {
  const r = runCheck(check, page(ld('{oops'), '<div itemscope itemtype="https://schema.org/Organization"><span itemprop="name">A</span></div>'))
  assert.equal(r.score, 4)
})

test('divergence: @id references are resolved and typed references are not validated on their own', () => {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': '#org', name: 'InsightPins' },
      { '@type': 'Article', headline: 'x', datePublished: '2025-01-01', author: { '@id': '#dana' }, publisher: { '@type': 'Organization', '@id': '#org' } },
      { '@type': 'Person', '@id': '#dana', name: 'Dana' }
    ]
  }
  const r = runCheck(check, page(ld(graph)))
  assert.equal(r.details.breakdown.Organization.valid, 1)
  assert.equal(r.details.breakdown.Organization.count, 1)
  assert.equal(r.score, 4 + 3 + 2 + 1)
})

test('divergence: full schema.org IRIs in @type are recognized', () => {
  const r = runCheck(check, page(ld({ '@type': 'https://schema.org/Organization', name: 'A' })))
  assert.equal(r.score, 7)
})

test('divergence: HowToSection steps are valid', () => {
  const howto = {
    '@type': 'HowTo',
    name: 'Pin',
    step: [{ '@type': 'HowToSection', name: 'Prep', itemListElement: [{ '@type': 'HowToStep', text: 'a' }, { '@type': 'HowToStep', text: 'b' }] }]
  }
  const r = runCheck(check, page(ld(howto)))
  assert.equal(r.details.breakdown.HowTo.points, 3)
})

test('divergence: non-ISO datePublished makes Article invalid', () => {
  const r = runCheck(check, page(ld({ ...article, publisher: undefined, author: 'Dana', datePublished: 'March 3, 2024' })))
  assert.equal(r.details.breakdown.Article.points, 0.5)
})

test('source: template tags in JSON-LD are substituted, result is predicted', () => {
  const r = runCheck(check, page('<script type="application/ld+json">{"@type": "Organization", "name": {{ site.title | jsonify }}, "url": "{{ site.url }}"}</script>'))
  assert.equal(r.score, 7)
  assert.equal(r.predicted, true)
})

test('source: JSON-LD that cannot be parsed even after substitution is inconclusive, not scored down', () => {
  const r = runCheck(check, page('<script type="application/ld+json">{"@type": "Organization", {% for x in y %}"a": 1,{% endfor %}}</script>'))
  assert.equal(r.inconclusive, true)
  assert.equal(r.score, 8)
})
