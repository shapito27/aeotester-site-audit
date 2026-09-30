import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/meta/viewport.mjs'
import { runCheck, html } from '../helpers.mjs'

const vp = content => ({ 'index.html': html({ head: content === null ? '' : `<meta name="viewport" content="${content}">` }) })

test('standard viewport scores full', () => {
  const r = runCheck(check, vp('width=device-width, initial-scale=1'))
  assert.equal(r.score, 3)
  assert.equal(r.findings.length, 0)
})

test('missing viewport scores 0', () => {
  assert.equal(runCheck(check, vp(null)).score, 0)
})

test('device-width without initial-scale scores 2', () => {
  assert.equal(runCheck(check, vp('width=device-width')).score, 2)
})

test('initial-scale 0.5 loses 0.25, 1.0 is fine', () => {
  assert.equal(runCheck(check, vp('width=device-width, initial-scale=0.5')).score, 2)
  assert.equal(runCheck(check, vp('width=device-width, initial-scale=1.0')).score, 3)
})

test('fixed width without scale scores 1', () => {
  assert.equal(runCheck(check, vp('width=1024')).score, 1)
})

test('initial-scale only scores 2', () => {
  assert.equal(runCheck(check, vp('initial-scale=1')).score, 2)
})

test('user-scalable=no is reported but not scored', () => {
  const r = runCheck(check, vp('width=device-width, initial-scale=1, user-scalable=no, maximum-scale=1'))
  assert.equal(r.score, 3)
  assert.equal(r.findings.length, 2)
})

test('semicolon separators are parsed (divergence from extension)', () => {
  const r = runCheck(check, vp('width=device-width; initial-scale=1'))
  assert.equal(r.score, 3)
  assert.equal(r.details.semicolonSeparator, true)
  assert.equal(r.findings.length, 1)
})

test('keys are case-insensitive (divergence from extension)', () => {
  assert.equal(runCheck(check, vp('Width=device-width, Initial-Scale=1')).score, 3)
})
