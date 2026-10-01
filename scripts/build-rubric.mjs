#!/usr/bin/env node
// Builds skills/audit/references/rubric.json from rubric/meta.json and
// rubric/checks/*.json. The built file is the single artifact that the plugin
// (and later the extension) reads; the split sources only make editing sane.
// --check exits 1 if the committed rubric.json is out of date.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'skills/audit/references/rubric.json')
const meta = JSON.parse(readFileSync(join(root, 'rubric/meta.json'), 'utf8'))
const byId = new Map()
for (const f of readdirSync(join(root, 'rubric/checks')).filter(f => f.endsWith('.json'))) {
  const check = JSON.parse(readFileSync(join(root, 'rubric/checks', f), 'utf8'))
  if (`${check.id}.json` !== f) throw new Error(`${f}: id ${check.id} does not match file name`)
  byId.set(check.id, check)
}

const missing = meta.check_order.filter(id => !byId.has(id))
const extra = [...byId.keys()].filter(id => !meta.check_order.includes(id))
if (missing.length || extra.length) throw new Error(`check_order mismatch. missing: ${missing} extra: ${extra}`)

const { check_order: order, categories, ...rest } = meta
const checks = order.map(id => byId.get(id))
// Advisory checks are reported as advice and never scored
const scored = checks.filter(c => !c.advisory)
const rubric = {
  ...rest,
  max_score: scored.reduce((s, c) => s + c.weight, 0),
  categories: categories.map(c => ({
    ...c,
    max: scored.filter(k => k.category === c.id).reduce((s, k) => s + k.weight, 0)
  })),
  checks
}
const text = JSON.stringify(rubric, null, 2) + '\n'

if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== text) {
    console.error('rubric.json is out of date. Run: node scripts/build-rubric.mjs')
    process.exit(1)
  }
  console.log('rubric.json is up to date')
} else {
  writeFileSync(out, text)
  console.log(`built rubric.json: ${checks.length} checks (${checks.length - scored.length} advisory), ${rubric.max_score} points`)
}
