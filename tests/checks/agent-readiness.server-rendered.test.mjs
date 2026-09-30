import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/agent-readiness/server-rendered.mjs'
import { runCheck, html } from '../helpers.mjs'

const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const page = (body, head = '<title>Pins</title>') => ({ 'index.html': html({ head, body }) })
const bundle = '<script type="module" src="/assets/app.js"></script>'

test('server-rendered page scores full', () => {
  const r = runCheck(check, page(`<main><h1>Pins</h1><p>${words(200)}</p></main>${bundle}`))
  assert.equal(r.score, 6)
  assert.equal(r.details.runtimeComparison, false)
  assert.equal(r.findings.length, 0)
})

test('short static page without scripts scores full', () => {
  assert.equal(runCheck(check, page('<p>Hello there</p>')).score, 6)
})

test('empty SPA root with no text scores 0', () => {
  const r = runCheck(check, page(`<div id="root"></div>${bundle}`))
  assert.equal(r.score, 0)
  assert.equal(r.details.appRootSelector, '#root')
  assert.equal(r.findings[0].line, 8)
})

test('empty root next to a little server text scores 3, predicted', () => {
  const r = runCheck(check, page(`<header><h1>Pins</h1><p>${words(100)}</p></header><div id="app"></div>${bundle}`))
  assert.equal(r.score, 3)
  assert.equal(r.predicted, true)
})

test('missing h1 and title on a client-rendered page cost 1 each', () => {
  const r = runCheck(check, page(`<p>${words(100)}</p><div id="app"></div>${bundle}`, ''))
  assert.equal(r.details.h1Missing, true)
  assert.equal(r.details.titleMissing, true)
  assert.equal(r.score, 1)
})

test('near-empty body that loads scripts is inconclusive (3, minus missing h1)', () => {
  const r = runCheck(check, page(`<noscript>Enable JS</noscript>${bundle}`))
  assert.equal(r.score, 2)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.h1Missing, true)
})

test('empty widget mount on a substantial page does not fail (divergence)', () => {
  const r = runCheck(check, page(`<main><h1>Pins</h1><p>${words(300)}</p><div id="app"></div></main>${bundle}`))
  assert.equal(r.details.appRootEmpty, true)
  assert.equal(r.score, 6)
})

test('every element matching an app-root selector is checked (divergence)', () => {
  const r = runCheck(check, page(`<div data-reactroot>Hi</div><div data-reactroot></div>${bundle}`))
  assert.equal(r.details.appRootSelector, '[data-reactroot]')
  assert.equal(r.score, 0)
})

test('script and style text is not counted', () => {
  const r = runCheck(check, page(`<div id="root"></div><script>window.x = "${words(100)}"</script><style>.a{}</style>`))
  assert.equal(r.details.rawWordCount, 0)
  assert.equal(r.score, 0)
})
