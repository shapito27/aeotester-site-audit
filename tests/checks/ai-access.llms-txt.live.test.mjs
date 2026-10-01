import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/ai-access/llms-txt.mjs'
import { runLiveCheck } from '../live-helpers.mjs'

const page = '<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>'
const LLMS = '# Example Site\n> What this site is about.\n\n## Docs\n- [Home](/): the home page of the example site\n'

test('live valid llms.txt scores full', async () => {
  const r = await runLiveCheck(check, { '/': page, '/llms.txt': LLMS })
  assert.equal(r.score, 6)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.exists, true)
  assert.equal(r.details.robotsUnknown, false)
})

test('live llms.txt 404 is absent (0), not inconclusive', async () => {
  const r = await runLiveCheck(check, { '/': page })
  assert.equal(r.score, 0)
  assert.ok(!r.inconclusive)
  assert.equal(r.details.exists, false)
})

test('live llms.txt 403 is inconclusive at half weight', async () => {
  const r = await runLiveCheck(check, { '/': page, '/llms.txt': { status: 403, body: 'no' } })
  assert.equal(r.score, 3)
  assert.equal(r.inconclusive, true)
  assert.equal(r.details.exists, null)
})

test('live robots.txt 403 makes the robots rule unknown, not a penalty', async () => {
  const r = await runLiveCheck(check, { '/': page, '/llms.txt': LLMS, '/robots.txt': { status: 403, body: 'no' } })
  assert.equal(r.score, 6)
  assert.equal(r.details.robotsUnknown, true)
})
