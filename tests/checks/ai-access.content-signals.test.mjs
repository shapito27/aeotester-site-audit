import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/ai-access/content-signals.mjs'
import { runCheck, html } from '../helpers.mjs'

const site = (robots, extra = {}) => ({ 'index.html': html({ body: '<h1>Hi</h1>' }), ...(robots === null ? {} : { 'robots.txt': robots }), ...extra })

test('Content-Signal in robots.txt scores full', () => {
  const r = runCheck(check, site('User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n'))
  assert.equal(r.score, 3)
  assert.equal(r.details.source, 'robots')
  assert.deepEqual(r.details.signals, { search: 'yes', 'ai-input': 'yes', 'ai-train': 'no' })
})

test('later robots lines override earlier keys', () => {
  const r = runCheck(check, site('Content-Signal: ai-train=yes\nContent-Signal: ai-train=no\n'))
  assert.equal(r.details.signals['ai-train'], 'no')
})

test('no robots.txt and no header scores 0', () => {
  const r = runCheck(check, site(null))
  assert.equal(r.score, 0)
  assert.equal(r.findings[0].file, null)
})

test('robots.txt without AI bot groups or signals scores 0', () => {
  assert.equal(runCheck(check, site('User-agent: *\nAllow: /\n')).score, 0)
})

test('AI bots addressed but no signals scores 1', () => {
  const r = runCheck(check, site('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n'))
  assert.equal(r.score, 1)
  assert.deepEqual(r.details.aiBotsAddressed, ['gptbot'])
  assert.equal(r.findings[0].line, 4)
})

test('trailing comment on a User-agent line still counts as addressed (divergence)', () => {
  assert.equal(runCheck(check, site('User-agent: GPTBot # openai\nDisallow: /\n')).score, 1)
})

test('trailing comment after a signal value does not invalidate it (divergence)', () => {
  assert.equal(runCheck(check, site('Content-Signal: ai-train=no # policy\n')).score, 3)
})

test('invalid values are ignored', () => {
  const r = runCheck(check, site('Content-Signal: ai-train=maybe, foo=yes\n'))
  assert.equal(r.score, 0)
  assert.match(r.findings[1].message, /no valid key/)
})

test('Content-Signal header in _headers scores full as predicted (source vs live)', () => {
  const r = runCheck(check, site(null, { _headers: '/*\n  Content-Signal: search=yes, ai-train=no\n' }))
  assert.equal(r.score, 3)
  assert.equal(r.predicted, true)
  assert.equal(r.details.source, 'header')
  assert.equal(r.details.headerSource, '_headers')
})

test('robots wins on conflicts with the header', () => {
  const r = runCheck(check, site('Content-Signal: ai-train=no\n', { _headers: '/*\n  Content-Signal: ai-train=yes, search=yes\n' }))
  assert.equal(r.details.source, 'both')
  assert.deepEqual(r.details.signals, { 'ai-train': 'no', search: 'yes' })
})

test('generated robots.txt is inconclusive with 2 points (unreachable equivalent)', () => {
  const r = runCheck(check, site(null, { 'app/robots.ts': 'export default () => ({})' }))
  assert.equal(r.inconclusive, true)
  assert.equal(r.score, 2)
})
