import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/ai-access/bot-crawlability.mjs'
import { runCheck, html } from '../helpers.mjs'

const site = (robots, extra = {}) => ({ 'index.html': html({ body: '<h1>Hi</h1>' }), ...(robots === null ? {} : { 'robots.txt': robots }), ...extra })

test('missing robots.txt scores 8 (absent, all allowed by default)', () => {
  const r = runCheck(check, site(null))
  assert.equal(r.score, 8)
  assert.equal(r.details.robotsTxtExists, false)
  assert.equal(r.findings[0].file, null)
})

test('empty robots.txt scores full', () => {
  assert.equal(runCheck(check, site('  \n')).score, 12)
})

test('permissive robots.txt scores full with no findings', () => {
  const r = runCheck(check, site('User-agent: *\nAllow: /\n'))
  assert.equal(r.score, 12)
  assert.equal(r.findings.length, 0)
})

test('blocking everything scores 0 and points at the rule line', () => {
  const r = runCheck(check, site('# block all\nUser-agent: *\nDisallow: /\n'))
  assert.equal(r.score, 0)
  assert.equal(r.details.allowedCount, 0)
  assert.equal(r.findings[0].file, 'robots.txt')
  assert.equal(r.findings[0].line, 3)
})

test('grouped user-agents share rules (divergence: extension only blocked the last agent)', () => {
  const r = runCheck(check, site('User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n'))
  assert.ok(r.details.blockedBots.includes('GPTBot'))
  assert.ok(r.details.blockedBots.includes('CCBot'))
})

test('user-agent tokens match case-insensitively (divergence)', () => {
  const r = runCheck(check, site('User-agent: gptbot\nDisallow: /\n'))
  assert.deepEqual(r.details.blockedBots, ['GPTBot'])
})

test('longest match wins over a blanket Allow (divergence: extension let any Allow win)', () => {
  const r = runCheck(check, site('User-agent: *\nAllow: /blog\nDisallow: /\n'))
  assert.equal(r.score, 0)
})

test('only GPTBot allowed: one major bot earns 1 of the 9 major points', () => {
  const r = runCheck(check, site('User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n'))
  assert.equal(r.details.allowedCount, 1)
  assert.equal(r.score, Math.round(9 * 1 / 10)) // 0.9 -> 1
})

test('blocking the major AI bots costs most of the points (divergence)', () => {
  const r = runCheck(check, site('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n'))
  assert.deepEqual(r.details.majorBlocked, ['ClaudeBot', 'GPTBot'])
  assert.equal(r.score, 9) // 10.2 -> 10, capped at 9 (warning); the extension gave 12
  assert.match(r.message, /major bots: ClaudeBot, GPTBot/)
})

test('blocking only minor bots costs little', () => {
  const r = runCheck(check, site('User-agent: *\nAllow: /\n\nUser-agent: Bytespider\nUser-agent: CCBot\nDisallow: /\n'))
  assert.equal(r.details.majorBlocked.length, 0)
  assert.equal(r.score, 12)
})

test('crawl-delay over 5s on allowed bots costs 2 points', () => {
  const r = runCheck(check, site('User-agent: *\nAllow: /\nCrawl-delay: 10\n'))
  assert.equal(r.score, 10)
  assert.equal(r.details.hasExcessiveDelays, true)
  assert.match(r.findings[0].message, /Crawl-delay 10s/)
})

test('global crawl-delay is not inherited by a bot with its own group (divergence)', () => {
  const r = runCheck(check, site('User-agent: *\nDisallow: /\nCrawl-delay: 10\n\nUser-agent: GPTBot\nAllow: /\n'))
  assert.equal(r.details.delayWarnings.length, 0)
})

test('generated robots.txt is inconclusive, not absent (source vs live)', () => {
  const r = runCheck(check, site(null, { 'src/app/robots.ts': 'export default function robots() {}' }))
  assert.equal(r.inconclusive, true)
  assert.equal(r.score, 8)
  assert.equal(r.details.generator, 'src/app/robots.ts')
})
