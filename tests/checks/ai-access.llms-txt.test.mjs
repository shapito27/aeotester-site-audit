import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/ai-access/llms-txt.mjs'
import { runCheck, html } from '../helpers.mjs'

const VALID = '# InsightPins\n\n> Visual pin boards for research.\n\n## Docs\n\n- [Pinning guide](https://insightpins.example/blog/pinning-guide.html): how to pin\n'
const site = (llms, extra = {}) => ({ 'index.html': html({ body: '<h1>Hi</h1>' }), ...(llms === null ? {} : { 'llms.txt': llms }), ...extra })

test('missing llms.txt scores 0', () => {
  const r = runCheck(check, site(null))
  assert.equal(r.score, 0)
  assert.equal(r.details.exists, false)
})

test('valid llms.txt scores full', () => {
  const r = runCheck(check, site(VALID))
  assert.equal(r.score, 6)
  assert.equal(r.details.format.valid, true)
  assert.equal(r.findings.length, 0)
})

test('prose without H1 or links scores 5 with format findings', () => {
  const r = runCheck(check, site('This site is about pin boards and collecting research notes from the web.'))
  assert.equal(r.score, 5)
  assert.equal(r.findings.length, 2)
  assert.equal(r.findings[0].file, 'llms.txt')
})

test('empty file scores 2', () => {
  assert.equal(runCheck(check, site('')).score, 2)
})

test('short but valid file scores 5', () => {
  assert.equal(runCheck(check, site('# X\n[a](/a)')).score, 5)
})

test('blocked for User-agent * costs 2 and points at the robots rule', () => {
  const r = runCheck(check, site(VALID, { 'robots.txt': 'User-agent: *\nDisallow: /llms\n' }))
  assert.equal(r.score, 4)
  assert.equal(r.details.blockedByRobots, true)
  assert.deepEqual([r.findings[0].file, r.findings[0].line], ['robots.txt', 2])
})

test('longest-match precedence: specific Disallow beats blanket Allow (divergence)', () => {
  const r = runCheck(check, site(VALID, { 'robots.txt': 'User-agent: *\nAllow: /\nDisallow: /llms.txt\n' }))
  assert.equal(r.details.blockedByRobots, true)
})

test('llms-full.txt is reported but not scored', () => {
  const r = runCheck(check, site(VALID, { 'llms-full.txt': '# Full' }))
  assert.equal(r.details.llmsFullTxt.exists, true)
  assert.equal(r.score, 6)
})

test('generated llms.txt is inconclusive at half weight (source vs live)', () => {
  const r = runCheck(check, site(null, { 'src/pages/llms.txt.ts': 'export const GET = () => new Response("")' }))
  assert.equal(r.inconclusive, true)
  assert.equal(r.score, 3)
})
