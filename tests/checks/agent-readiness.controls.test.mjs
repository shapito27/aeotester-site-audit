import { test } from 'node:test'
import assert from 'node:assert/strict'
import check, { isPersonalField } from '../../skills/audit/scripts/checks/agent-readiness/controls.mjs'
import { runCheck, html } from '../helpers.mjs'

const page = body => ({ 'index.html': html({ body }) })

test('usable controls score full', () => {
  const r = runCheck(check, page('<button>Save</button><a href="/x">X</a><input type="email" autocomplete="email"><button aria-label="Close"><svg></svg></button>'))
  assert.equal(r.score, 4)
  assert.equal(r.findings.length, 0)
})

test('page without controls scores full', () => {
  const r = runCheck(check, page('<p>Just text</p>'))
  assert.equal(r.score, 4)
  assert.match(r.message, /No interactive controls/)
})

test('every category failing scores 0', () => {
  const r = runCheck(check, page('<button><svg></svg></button><a href="#">Menu</a><div onclick="go()">Go</div><input type="text" name="email">'))
  assert.equal(r.score, 0)
  assert.equal(r.findings.length, 4)
})

test('one failing category costs one point', () => {
  const r = runCheck(check, page('<button>Save</button><a href="javascript:void(0)">Do</a>'))
  assert.equal(r.details.categories.links.problems, 1)
  assert.equal(r.score, 3)
})

test('90% pass rate keeps the point', () => {
  const links = Array.from({ length: 9 }, (_, i) => `<a href="/p${i}">P${i}</a>`).join('') + '<a>Dead</a>'
  assert.equal(runCheck(check, page(links)).score, 4)
})

test('custom role=button needs tabindex; hidden controls are ignored', () => {
  const r = runCheck(check, page('<span role="button">Open</span><div hidden><button></button></div><div aria-hidden="true"><a href="#">x</a></div>'))
  assert.equal(r.details.categories.buttons.total, 1)
  assert.equal(r.details.categories.links.total, 0)
  assert.equal(r.score, 3)
})

test('ARIA toggles and named anchors are not dead links', () => {
  assert.equal(runCheck(check, page('<a href="#" aria-expanded="false">Menu</a><a id="top"></a>')).score, 4)
})

test('div with onclick and a non-button role is still a fake clickable (divergence)', () => {
  const r = runCheck(check, page('<div role="presentation" onclick="go()">Go</div>'))
  assert.equal(r.details.categories.fakeClickables.total, 1)
  assert.equal(r.score, 3)
})

test('personal-data names match whole tokens (divergence)', () => {
  assert.equal(isPersonalField('name '), true)
  assert.equal(isPersonalField('emailAddress '), true)
  assert.equal(isPersonalField('first-name '), true)
  assert.equal(isPersonalField('billing_postal_code '), true)
  assert.equal(isPersonalField('statement '), false)
  assert.equal(isPersonalField('cityscape '), false)
  const r = runCheck(check, page('<input name="name"><input name="statement">'))
  assert.equal(r.details.categories.autocomplete.total, 1)
  assert.equal(r.score, 3)
})

test('autocomplete="off" counts as missing', () => {
  assert.equal(runCheck(check, page('<input type="tel" autocomplete="off">')).score, 3)
})
