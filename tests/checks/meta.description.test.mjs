import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/meta/description.mjs'
import { runCheck, html } from '../helpers.mjs'

const page = (desc, title = 'How to organize research with visual pins | InsightPins') => ({
  'index.html': html({ head: `<title>${title}</title>${desc === null ? '' : `\n<meta name="description" content="${desc}">`}` })
})
const optimal = 'Learn how to organize research with visual pins: one board per question, tags as you go, and a weekly review so sources never get lost again.'

test('optimal description scores full', () => {
  assert.equal(optimal.length >= 120 && optimal.length <= 160, true)
  const r = runCheck(check, page(optimal))
  assert.equal(r.score, 5)
  assert.equal(r.findings.length, 0)
  assert.equal(r.details.hasCta, true)
})

test('missing description scores 0 with a head finding', () => {
  const r = runCheck(check, page(null))
  assert.equal(r.score, 0)
  assert.equal(r.details.present, false)
  assert.equal(r.findings[0].file, 'index.html')
})

test('empty description scores 0', () => {
  const r = runCheck(check, page('   '))
  assert.equal(r.score, 0)
  assert.equal(r.details.present, true)
})

test('short description loses 2', () => {
  const r = runCheck(check, page('Short guide.'))
  assert.equal(r.score, 3)
  assert.equal(r.details.lengthStatus, 'too_short')
})

test('70-119 chars loses 1', () => {
  const r = runCheck(check, page('A practical guide to organizing research with visual pins, boards and tags for teams.'))
  assert.equal(r.details.lengthStatus, 'short')
  assert.equal(r.score, 4)
})

test('161-170 chars loses 0.5 (floored to 4)', () => {
  const r = runCheck(check, page(optimal + ' Also teams.'.padEnd(25, '.')))
  assert.equal(r.details.lengthStatus, 'long')
  assert.equal(r.score, 4)
})

test('generic short description equal to title', () => {
  const r = runCheck(check, page('Welcome to my site', 'Welcome to my site'))
  // 5 - 2 (short) - 2 (generic) - 1 (same as title)
  assert.equal(r.score, 0)
  assert.equal(r.details.isGeneric, true)
  assert.equal(r.details.matchesTitle, true)
})

test('keyword stuffing loses 0.5', () => {
  const desc = 'Pins pins pins pins for research teams who love to collect sources, organize boards, share pins with colleagues and review them weekly together.'
  const r = runCheck(check, page(desc))
  assert.equal(r.details.keywordStuffing, true)
  assert.equal(r.score, 4)
})

test('name="Description" is matched case-insensitively (divergence from extension)', () => {
  const r = runCheck(check, { 'index.html': html({ head: `<title>T</title><meta name="Description" content="${optimal}">` }) })
  assert.equal(r.score, 5)
})

test('entities are decoded before measuring length', () => {
  const r = runCheck(check, page(optimal.replace('research', 'research &amp; notes').slice(0, 150)))
  assert.equal(r.details.value.includes('&amp;'), false)
})
