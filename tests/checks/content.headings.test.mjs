import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/content/headings.mjs'
import { runCheck, html } from '../helpers.mjs'

const body = b => ({ 'index.html': html({ body: b }) })

test('clean outline scores full', () => {
  const r = runCheck(check, body('<h1>Pin boards</h1><h2>Why pins</h2><h3>Tags</h3><h2>Pricing plans</h2>'))
  assert.equal(r.score, 8)
  assert.equal(r.findings.length, 0)
})

test('no headings scores 0', () => {
  assert.equal(runCheck(check, body('<p>Hello</p>')).score, 0)
})

test('no h1 loses 3', () => {
  const r = runCheck(check, body('<h2>Why pins</h2><h3>Tags</h3>'))
  assert.equal(r.score, 5)
})

test('multiple h1 loses 2 and points at the extra ones', () => {
  const r = runCheck(check, { 'index.html': '<html><body>\n<h1>Pin boards</h1>\n<h2>Why pins</h2>\n<h1>Start today</h1>\n</body></html>' })
  assert.equal(r.score, 6)
  assert.equal(r.findings[0].line, 4)
})

test('skipped levels lose 1 each, capped at 2; first heading never a skip', () => {
  assert.equal(runCheck(check, body('<h1>Pin boards</h1><h3>Why pins</h3>')).score, 7)
  assert.equal(runCheck(check, body('<h1>Pin boards</h1><h3>Why pins</h3><h2>Tags</h2><h4>Setup guide</h4><h2>Plan</h2><h5>Details here</h5>')).score, 6)
  assert.equal(runCheck(check, body('<h3>Pin boards</h3><h1>Main topic</h1>')).details.skippedLevels, 0)
})

test('more than 3 generic headings lose 1', () => {
  const r = runCheck(check, body('<h1>Pin boards</h1><h2>Overview</h2><h2>About</h2><h2>More</h2><h2>FAQ</h2>'))
  assert.equal(r.details.genericHeadingCount, 3)
  assert.equal(r.score, 8)
  const r2 = runCheck(check, body('<h1>Pin boards</h1><h2>Overview</h2><h2>About</h2><h2>More</h2><h2>Q</h2>'))
  assert.equal(r2.score, 7)
})
