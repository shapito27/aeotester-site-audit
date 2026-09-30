// End-to-end: run the audit CLI on the fixture sites
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cli = new URL('../skills/audit/scripts/audit.mjs', import.meta.url).pathname
const fixtures = new URL('./fixtures/', import.meta.url).pathname
const out = mkdtempSync(join(tmpdir(), 'aeotester-report-'))

function audit(name) {
  const report = join(out, `${name}.md`)
  const json = JSON.parse(execFileSync('node', [cli, join(fixtures, name), '--out', report, '--json', '-'], { encoding: 'utf8' }))
  return { json, report: readFileSync(report, 'utf8') }
}

test('sample static site gets a full scored report', () => {
  const { json, report } = audit('sample-site')
  assert.equal(json.site.stack.id, 'static-html')
  assert.equal(json.site.mode, 'full')
  assert.equal(json.checks.length, 26)
  assert.equal(json.checks.filter(c => c.status === 'skipped').length, 0)
  assert.equal(json.available, 132) // agent protocols is n/a
  assert.ok(json.total > 50 && json.total < 100, `unexpected total ${json.total}`)
  assert.match(report, /\*\*Score: \d+ \/ 132/)
  assert.match(report, /Check a live URL: https:\/\/aeotester\.com\/\?utm_source=plugin&utm_medium=report/)
  assert.match(report, /`index\.html:\d+`/)
})

test('WordPress theme gets a fix list, no score, no edits', () => {
  const dir = join(fixtures, 'wordpress-theme')
  const before = readdirSync(dir).sort()
  const { json, report } = audit('wordpress-theme')
  assert.equal(json.site.mode, 'report-only')
  assert.doesNotMatch(report, /Score:/)
  assert.match(report, /## Fix list/)
  assert.deepEqual(readdirSync(dir).sort(), before)
})

test('unbuilt Astro project asks for a build', () => {
  const { json, report } = audit('astro-unbuilt')
  assert.equal(json.site.stack.id, 'astro')
  assert.equal(json.site.mode, 'needs-build')
  assert.match(report, /No build output found/)
})
