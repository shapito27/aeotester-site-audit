import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/meta/title.mjs'
import { runCheck, html } from '../helpers.mjs'

const withTitle = t => ({ 'index.html': html({ head: t === null ? '' : `<title>${t}</title>` }) })

test('missing title scores 0', () => {
  const r = runCheck(check, withTitle(null))
  assert.equal(r.score, 0)
  assert.equal(r.findings[0].file, 'index.html')
})

test('optimal title scores full', () => {
  const r = runCheck(check, withTitle('How to organize research with visual pins | InsightPins'))
  assert.equal(r.score, 5)
})

test('generic short title loses most points', () => {
  assert.equal(runCheck(check, withTitle('Home')).score, 0)
})

test('hyphens inside words are not separators (divergence from extension)', () => {
  const r = runCheck(check, withTitle('A step-by-step how-to guide for AI-powered pin boards'))
  assert.equal(r.details.separators, 0)
  assert.equal(r.score, 5)
})

test('more than 3 standalone separators is penalized', () => {
  const r = runCheck(check, withTitle('Pins | Boards | Tags | Teams | InsightPins app for you'))
  assert.equal(r.details.separators, 4)
  assert.equal(r.score, 4)
})
