import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/structured-data/valid.mjs'
import { runCheck, html } from '../helpers.mjs'

const ld = obj => `<script type="application/ld+json">${typeof obj === 'string' ? obj : JSON.stringify(obj)}</script>`
const page = head => ({ 'index.html': html({ head }) })

const org = { '@context': 'https://schema.org', '@type': 'Organization', name: 'InsightPins' }
const person = n => ({ '@type': 'Person', ...(n ? { name: n } : {}) })

test('no JSON-LD scores 0', () => {
  const r = runCheck(check, page(''))
  assert.equal(r.score, 0)
  assert.equal(r.findings.length, 1)
})

test('all valid scores full', () => {
  const r = runCheck(check, page(ld(org) + ld({ '@type': 'WebSite', name: 'x' })))
  assert.equal(r.score, 5)
  assert.equal(r.details.validationRate, 100)
  assert.equal(r.details.validatableSchemas, 1)
})

test('only types without a validator counts as 100%', () => {
  assert.equal(runCheck(check, page(ld({ '@type': 'WebSite', name: 'x' }))).score, 5)
})

test('one parse error alongside valid data scores 4', () => {
  const r = runCheck(check, page(ld(org) + '\n' + ld('{bad json')))
  assert.equal(r.score, 4)
  assert.equal(r.details.parseErrors, 1)
  assert.equal(r.findings[0].message, 'JSON-LD block is not valid JSON')
})

test('three parse errors score 3', () => {
  assert.equal(runCheck(check, page(ld(org) + ld('{') + ld('{') + ld('{'))).score, 3)
})

test('rate 80-99 loses 0.5, floored to 4', () => {
  const list = { '@type': 'ItemList', itemListElement: [person('a'), person('b'), person('c'), person('d'), person()] }
  const r = runCheck(check, page(ld(list)))
  // ItemList valid + 4 valid Person + 1 invalid Person = 5/6 = 83%
  assert.equal(r.details.validationRate, 83)
  assert.equal(r.score, 4)
})

test('rate below 50 loses 2 and reports every invalid node', () => {
  const r = runCheck(check, page(ld({ '@type': 'Product', name: 'Pin' }) + ld(person())))
  assert.equal(r.details.validationRate, 0)
  assert.equal(r.score, 3)
  assert.ok(r.findings.some(f => f.message.startsWith('Product schema: Missing required field: image')))
  assert.ok(r.findings.some(f => f.message === 'Person schema: Missing required field: name'))
})

test('rate below 50 plus a parse error scores 2', () => {
  assert.equal(runCheck(check, page(ld(person()) + ld('{'))).score, 2)
})

test('divergence: every block broken fails instead of counting as 100%', () => {
  const r = runCheck(check, page(ld('{')))
  assert.equal(r.details.validationRate, 0)
  assert.equal(r.score, 2)
})

test('divergence: a @graph node referenced by @id is validated once', () => {
  const graph = {
    '@graph': [
      { '@type': 'Article', '@id': '#a', headline: 'x', datePublished: '2025-01-01', author: { '@id': '#p' } },
      { '@type': 'Person', '@id': '#p', name: 'Dana' }
    ]
  }
  const r = runCheck(check, page(ld(graph)))
  assert.equal(r.details.validatableSchemas, 2)
  assert.equal(r.score, 5)
})

test('divergence: a typed reference to a node defined on the page is not validated separately', () => {
  const graph = {
    '@graph': [
      { '@type': 'Organization', '@id': '#org', name: 'InsightPins' },
      { '@type': 'WebPage', publisher: { '@type': 'Organization', '@id': '#org' } }
    ]
  }
  const r = runCheck(check, page(ld(graph)))
  assert.equal(r.details.references, 1)
  assert.equal(r.score, 5)
})

test('extension behaviour kept: an unresolvable typed reference without name is invalid', () => {
  const r = runCheck(check, page(ld({ '@type': 'WebPage', publisher: { '@type': 'Organization', '@id': 'https://x.example/#org' } })))
  assert.equal(r.details.validationRate, 0)
})

test('divergence: non-ISO dates are invalid, ISO dates with time are valid', () => {
  const art = d => ({ '@type': 'BlogPosting', headline: 'x', author: 'Dana', datePublished: d })
  assert.equal(runCheck(check, page(ld(art('March 5, 2024')))).details.validationRate, 0)
  assert.equal(runCheck(check, page(ld(art('2024-03-05T10:00:00+02:00')))).details.validationRate, 100)
})

test('divergence: a price of 0 is a valid price', () => {
  const product = { '@type': 'Product', name: 'Pin', image: 'x.png', description: 'd', offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' } }
  assert.equal(runCheck(check, page(ld(product))).score, 5)
})

test('source: template placeholders count as present values (predicted)', () => {
  const r = runCheck(check, page('<script type="application/ld+json">{"@type": "BlogPosting", "headline": "{{ page.title }}", "author": "{{ page.author }}", "datePublished": "{{ page.date | date_to_xmlschema }}"}</script>'))
  assert.equal(r.score, 5)
  assert.equal(r.predicted, true)
})

test('source: an unparseable template block is inconclusive, not a parse error', () => {
  const r = runCheck(check, page('<script type="application/ld+json">{ {% for p in posts %}"a": 1,{% endfor %} }</script>'))
  assert.equal(r.inconclusive, true)
  assert.equal(r.score, 3)
})
