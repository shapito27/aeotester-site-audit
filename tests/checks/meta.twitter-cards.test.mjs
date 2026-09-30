import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/meta/twitter-cards.mjs'
import { runCheck, html } from '../helpers.mjs'

const tw = (tags, extra = '', attr = 'name') => ({
  'index.html': html({ head: Object.entries(tags).map(([k, v]) => `<meta ${attr}="twitter:${k}" content="${v}">`).join('\n') + extra })
})
const full = { card: 'summary_large_image', title: 'Pins', description: 'Pin boards', image: 'https://ex.com/og.png' }

test('all four tags valid scores full', () => {
  const r = runCheck(check, tw(full))
  assert.equal(r.score, 3)
  assert.equal(r.findings.length, 0)
})

test('property="twitter:*" is read too', () => {
  assert.equal(runCheck(check, tw(full, '', 'property')).score, 3)
})

test('nothing at all scores 0', () => {
  assert.equal(runCheck(check, tw({})).score, 0)
})

test('OG-only gets the fallback score of 2', () => {
  const r = runCheck(check, tw({}, '<meta property="og:title" content="Pins">'))
  assert.equal(r.score, 2)
  assert.equal(r.details.usingOgFallback, true)
})

test('name="og:*" also triggers the OG fallback (divergence from extension)', () => {
  assert.equal(runCheck(check, tw({}, '<meta name="og:title" content="Pins">')).score, 2)
})

test('missing image loses 0.5 (floored to 2)', () => {
  const { image, ...rest } = full
  assert.equal(runCheck(check, tw(rest)).score, 2)
})

test('empty image is not penalized, empty title is', () => {
  assert.equal(runCheck(check, tw({ ...full, image: '' })).score, 3)
  assert.equal(runCheck(check, tw({ ...full, title: ' ' })).score, 2)
})

test('invalid card type loses 0.25', () => {
  const r = runCheck(check, tw({ ...full, card: 'Summary' }))
  assert.equal(r.score, 2)
  assert.match(r.findings[0].message, /Invalid twitter:card/)
})

test('one required tag missing plus no image', () => {
  const r = runCheck(check, tw({ card: 'summary', title: 'Pins' }))
  // 3 - 0.75 - 0.5 = 1.75
  assert.equal(r.score, 1)
})
