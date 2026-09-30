import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/meta/language.mjs'
import { runCheck, html } from '../helpers.mjs'

const withLang = (lang, head = '') => ({
  'index.html': lang === null
    ? `<!DOCTYPE html>\n<html>\n<head>${head}</head><body></body></html>\n`
    : html({ lang, head })
})

test('valid lang scores full', () => {
  assert.equal(runCheck(check, withLang('en')).score, 3)
  assert.equal(runCheck(check, withLang('pt-BR')).score, 3)
})

test('missing lang scores 1', () => {
  const r = runCheck(check, withLang(null))
  assert.equal(r.score, 1)
  assert.equal(r.findings[0].line, 2)
})

test('invalid format loses 0.5', () => {
  const r = runCheck(check, withLang('en_US'))
  assert.equal(r.score, 2)
  assert.equal(r.details.langValid, false)
})

test('unknown language loses 0.5', () => {
  const r = runCheck(check, withLang('qq'))
  assert.equal(r.score, 2)
})

test('unknown region loses 0.25', () => {
  const r = runCheck(check, withLang('en-QQ'))
  assert.equal(r.score, 2)
  assert.match(r.findings[0].message, /region/)
})

test('script subtags and numeric regions are valid (divergence from extension)', () => {
  assert.equal(runCheck(check, withLang('zh-Hans')).score, 3)
  assert.equal(runCheck(check, withLang('zh-Hant-TW')).score, 3)
  assert.equal(runCheck(check, withLang('es-419')).score, 3)
})

test('ISO codes outside the extension short lists are valid (divergence from extension)', () => {
  assert.equal(runCheck(check, withLang('la')).score, 3)
  assert.equal(runCheck(check, withLang('lv-LV')).score, 3)
})

test('hreflang without x-default is reported but not scored', () => {
  const head = '<link rel="alternate" hreflang="en" href="/en/"><link rel="alternate" hreflang="de" href="/de/">'
  const r = runCheck(check, withLang('en', head))
  assert.equal(r.score, 3)
  assert.equal(r.findings.length, 1)
  assert.equal(r.details.hasXDefault, false)
})
