// The Claude Code and OpenAI (Codex / ChatGPT) manifests describe one plugin.
// This keeps their shared fields from drifting apart.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'))
const claude = read('.claude-plugin/plugin.json')
const portable = read('plugin.json')
const codexMarket = read('.agents/plugins/marketplace.json')
const claudeMarket = read('.claude-plugin/marketplace.json')

test('portable and Claude manifests agree on identity', () => {
  for (const key of ['name', 'version', 'description', 'license', 'repository', 'keywords']) {
    assert.deepEqual(portable[key], claude[key], `${key} differs between plugin.json and .claude-plugin/plugin.json`)
  }
  assert.deepEqual(portable.author, claude.author)
})

test('portable manifest declares the Agent Plugins schema', () => {
  assert.match(portable.$schema, /^https:\/\/agent-plugins\.org\/schemas\/1\.0\.0\/plugin\.schema\.json$/)
})

test('OpenAI listing fields respect submission limits', () => {
  const ui = portable.extensions['com.openai'].interface
  assert.ok(ui.displayName.length <= 30)
  assert.ok(ui.shortDescription.length <= 30)
  assert.ok(ui.longDescription.length <= 4000)
  assert.ok(ui.developerName.length <= 80)
  assert.ok(ui.defaultPrompt.length <= 3)
  for (const p of ui.defaultPrompt) assert.ok(p.length <= 128)
  for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL']) assert.match(ui[key], /^https:\/\//)
})

test('referenced icon files exist and use ./ paths', () => {
  const ui = portable.extensions['com.openai'].interface
  for (const key of ['composerIcon', 'logo']) {
    assert.ok(ui[key].startsWith('./'), `${key} must start with ./`)
    assert.ok(existsSync(new URL(`../${ui[key]}`, import.meta.url)), `${ui[key]} is missing`)
  }
})

test('Codex marketplace lists the same plugin as the Claude marketplace', () => {
  const entry = codexMarket.plugins[0]
  assert.equal(entry.name, portable.name)
  assert.equal(entry.name, claudeMarket.plugins[0].name)
  assert.ok(entry.source.path.startsWith('./'))
  assert.ok(entry.policy.installation && entry.policy.authentication && entry.category)
})

test('fix skill blocks implicit invocation for OpenAI hosts', () => {
  const yaml = readFileSync(new URL('../skills/fix/agents/openai.yaml', import.meta.url), 'utf8')
  assert.match(yaml, /allow_implicit_invocation:\s*false/)
})
