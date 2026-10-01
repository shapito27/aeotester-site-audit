#!/usr/bin/env node
// Structural checks for rubric.json that the JSON schema alone cannot express:
// point totals, category sums, unique ids, and cross-references.
import { readFileSync } from 'node:fs'

const path = process.argv[2] || 'skills/audit/references/rubric.json'
const rubric = JSON.parse(readFileSync(path, 'utf8'))
const errors = []
const fail = msg => errors.push(msg)

const FIXABLE = ['auto', 'assisted', 'report-only']
const METHODS = ['script', 'llm', 'hybrid', 'live-only']
const PARITY = ['full', 'partial', 'none']
const REQUIRED = ['id', 'extension_key', 'name', 'category', 'weight', 'description', 'inputs', 'scoring', 'detect', 'parity', 'fixable', 'fix_summary', 'stacks', 'sub_ids']

const categoryIds = new Set(rubric.categories.map(c => c.id))
const stackIds = new Set(Object.keys(rubric.stacks))
const seen = new Set()

for (const check of rubric.checks) {
  const where = check.id || '(missing id)'
  for (const field of REQUIRED) if (check[field] === undefined) fail(`${where}: missing ${field}`)
  if (seen.has(check.id)) fail(`${where}: duplicate id`)
  seen.add(check.id)
  if (!categoryIds.has(check.category)) fail(`${where}: unknown category ${check.category}`)
  if (!Number.isInteger(check.weight) || check.weight < 1) fail(`${where}: weight must be a positive integer`)
  if (!FIXABLE.includes(check.fixable)) fail(`${where}: bad fixable ${check.fixable}`)
  if (!METHODS.includes(check.detect?.method)) fail(`${where}: bad detect.method ${check.detect?.method}`)
  if (!PARITY.includes(check.parity?.level)) fail(`${where}: bad parity.level ${check.parity?.level}`)
  if (check.advisory !== undefined && typeof check.advisory !== 'boolean') fail(`${where}: advisory must be a boolean`)
  if (check.advisory && check.conditional) fail(`${where}: a check cannot be both advisory and conditional`)
  if (check.fixable === 'report-only' && check.fix_recipe) fail(`${where}: report-only check should not have a fix_recipe`)
  if (check.fixable !== 'report-only' && !check.fix_recipe) fail(`${where}: fixable check needs a fix_recipe`)
  for (const s of check.stacks || []) if (!stackIds.has(s)) fail(`${where}: unknown stack ${s}`)
  if (!Array.isArray(check.scoring?.rules) || check.scoring.rules.length === 0) fail(`${where}: scoring.rules is empty`)
}

// Advisory checks are reported as advice and never scored
const scored = rubric.checks.filter(c => !c.advisory)
const total = scored.reduce((sum, c) => sum + c.weight, 0)
if (total !== rubric.max_score) fail(`weights sum to ${total}, max_score says ${rubric.max_score}`)

for (const cat of rubric.categories) {
  const sum = scored.filter(c => c.category === cat.id).reduce((s, c) => s + c.weight, 0)
  if (sum !== cat.max) fail(`category ${cat.id}: checks sum to ${sum}, max says ${cat.max}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  console.error(`\n${errors.length} rubric error(s)`)
  process.exit(1)
}
const conditional = scored.filter(c => c.conditional).reduce((s, c) => s + c.weight, 0)
const advisory = rubric.checks.length - scored.length
console.log(`rubric ok: ${rubric.checks.length} checks (${advisory} advisory), ${total} points (${total - conditional} when conditional checks are na)`)
