import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/content/image-alt.mjs'
import { runCheck, html } from '../helpers.mjs'

const imgs = list => ({ 'index.html': html({ body: list.join('\n') }) })
const good = '<img src="/a.png" alt="A pin board">'
const none = '<img src="/b.png">'
const empty = '<img src="/c.png" alt="">'

test('no images scores full', () => {
  assert.equal(runCheck(check, imgs([])).score, 5)
})

test('all images with alt scores full', () => {
  assert.equal(runCheck(check, imgs([good, good])).score, 5)
})

test('no alt anywhere scores 0 with a finding per image', () => {
  const r = runCheck(check, imgs([none, empty]))
  assert.equal(r.score, 0)
  assert.equal(r.findings.length, 2)
  assert.match(r.findings[0].message, /no alt attribute/)
  assert.match(r.findings[1].message, /empty alt/)
})

test('partial coverage uses double rounding', () => {
  // 2/3 = 67% -> round(3.35) = 3
  assert.equal(runCheck(check, imgs([good, good, none])).score, 3)
  // 1/2 = 50% -> round(2.5) = 3
  assert.equal(runCheck(check, imgs([good, none])).score, 3)
  // 1/4 = 25% -> round(1.25) = 1
  assert.equal(runCheck(check, imgs([good, none, none, none])).score, 1)
})

test('plain alt="" still counts as missing', () => {
  assert.equal(runCheck(check, imgs([good, empty])).score, 3)
})

test('alt="" marked decorative is left out of the count (divergence from extension)', () => {
  const r = runCheck(check, imgs([good, '<img src="/d.png" alt="" role="presentation">', '<img src="/e.png" alt="" aria-hidden="true">']))
  assert.equal(r.score, 5)
  assert.equal(r.details.decorativeImages, 2)
  assert.equal(r.details.totalImages, 1)
})

test('role="presentation" without alt="" is not decorative', () => {
  assert.equal(runCheck(check, imgs([good, '<img src="/d.png" role="presentation">'])).score, 3)
})
