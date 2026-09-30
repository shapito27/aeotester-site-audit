import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRobots, canCrawl } from '../../skills/audit/scripts/lib/robots.mjs'

test('grouped user-agents share rules', () => {
  const p = parseRobots('User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n')
  assert.equal(canCrawl(p, 'GPTBot').allowed, false)
  assert.equal(canCrawl(p, 'ClaudeBot').allowed, false)
  assert.equal(canCrawl(p, 'Bingbot').allowed, true)
})

test('user-agent matching is case-insensitive', () => {
  const p = parseRobots('User-agent: gptbot\nDisallow: /\n')
  assert.equal(canCrawl(p, 'GPTBot').allowed, false)
})

test('longest match wins, allow wins ties', () => {
  const p = parseRobots('User-agent: *\nDisallow: /docs/\nAllow: /docs/public/\nAllow: /x\nDisallow: /x\n')
  assert.equal(canCrawl(p, 'Any', '/docs/private').allowed, false)
  assert.equal(canCrawl(p, 'Any', '/docs/public/a').allowed, true)
  assert.equal(canCrawl(p, 'Any', '/x').allowed, true)
})

test('specific group ignores the * group', () => {
  const p = parseRobots('User-agent: *\nDisallow: /\nCrawl-delay: 10\n\nUser-agent: GPTBot\nAllow: /\n')
  const r = canCrawl(p, 'GPTBot')
  assert.equal(r.allowed, true)
  assert.equal(r.crawlDelay, null)
})

test('wildcards and end anchors', () => {
  const p = parseRobots('User-agent: *\nDisallow: /*.pdf$\n')
  assert.equal(canCrawl(p, 'a', '/f.pdf').allowed, false)
  assert.equal(canCrawl(p, 'a', '/f.pdf?x=1').allowed, true)
})

test('empty disallow allows everything', () => {
  assert.equal(canCrawl(parseRobots('User-agent: *\nDisallow:\n'), 'a', '/').allowed, true)
})
