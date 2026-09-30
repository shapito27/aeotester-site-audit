import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/content/accessibility.mjs'
import { runCheck, html } from '../helpers.mjs'

const page = body => ({ 'index.html': html({ body }) })

test('main and nav score full', () => {
  const r = runCheck(check, page('<header><nav><a href="/">Home</a></nav></header><main><p>Hi</p></main>'))
  assert.equal(r.score, 4)
  assert.equal(r.findings.length, 0)
})

test('no landmarks and unlabelled inputs score 0', () => {
  const r = runCheck(check, page('<div><input type="text" name="q"></div>'))
  assert.equal(r.score, 0)
  assert.equal(r.findings.length, 4)
})

test('missing nav only loses 0.75', () => {
  assert.equal(runCheck(check, page('<main><p>Hi</p></main>')).score, 3)
})

test('role landmarks count', () => {
  assert.equal(runCheck(check, page('<div role="navigation"></div><div role="main"></div>')).score, 4)
})

test('missing main with 5+ semantic elements loses only 1.75', () => {
  const r = runCheck(check, page('<header></header><nav></nav><section></section><article></article><footer></footer>'))
  assert.equal(r.details.semanticCount, 5)
  assert.equal(r.score, 2)
})

test('label association: for, aria-label, wrapping label', () => {
  const r = runCheck(check, page('<nav></nav><main><label for="a">A</label><input id="a"><input aria-label="B"><label>C <select></select></label><textarea></textarea></main>'))
  assert.equal(r.details.labelPercentage, 75)
  assert.equal(r.score, 4)
})

test('under 50% labelled loses 0.75 with a finding per field', () => {
  const r = runCheck(check, page('<nav></nav><main><input name="a"><input name="b"><input aria-label="c"></main>'))
  assert.equal(r.details.labelPercentage, 33)
  assert.equal(r.score, 3)
  assert.equal(r.findings.length, 2)
})

test('submit and button inputs do not need labels (divergence)', () => {
  const r = runCheck(check, page('<nav></nav><main><form><input aria-label="Email" type="email"><input type="submit" value="Go"><input type="button" value="X"></form></main>'))
  assert.equal(r.details.inputCount, 1)
  assert.equal(r.score, 4)
})

test('ids with quotes do not break label lookup (divergence)', () => {
  const r = runCheck(check, page('<nav></nav><main><label for=\'we"ird\'>A</label><input id=\'we"ird\'></main>'))
  assert.equal(r.details.labelPercentage, 100)
})
