// The ZIP uploaded to the OpenAI plugin portal ("Skills only"). The portal's validation
// rules are listed at https://developers.openai.com/plugins/deploy/submission; this checks
// the ones that apply to this package, since the portal itself cannot be run from CI.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { buildZip } from '../scripts/build-openai-zip.mjs'

const repo = new URL('..', import.meta.url).pathname
const CATEGORIES = ['Productivity', 'Creativity', 'Developer Tools', 'Business & Operations', 'Data & Analytics',
  'Communication', 'Education & Research', 'Security', 'Finance', 'Healthcare', 'Travel', 'Entertainment', 'Other']

// Independent reader: walks the central directory and inflates every entry
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(eocd >= 0, 'no end-of-central-directory record')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const files = new Map()
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'bad central directory entry')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const rawSize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const body = buf.subarray(dataStart, dataStart + size)
    const data = method === 8 ? inflateRawSync(body) : body
    assert.equal(data.length, rawSize, `${name}: size mismatch`)
    files.set(name, data)
    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

let built
let files
before(() => {
  built = buildZip(mkdtempSync(join(tmpdir(), 'aeotester-zip-')))
  files = readZip(readFileSync(built.file))
})

const json = (name) => JSON.parse(files.get(name).toString('utf8'))
const text = (name) => files.get(name).toString('utf8')
const skillDirs = () => [...new Set([...files.keys()].filter(n => /^skills\/[^/]+\/SKILL\.md$/.test(n)).map(n => n.split('/')[1]))]

test('archive entries are safe, unique and within the portal limits', () => {
  assert.ok(statSync(built.file).size <= 100 * 1024 * 1024)
  assert.ok(files.size > 0 && files.size <= 5000)
  const seen = new Set()
  for (const [name, data] of files) {
    assert.ok(!name.startsWith('/') && !name.includes('\\') && !name.includes('//'), name)
    assert.ok(!name.split('/').includes('..') && !name.endsWith('/'), name)
    assert.ok(name.split('/').length <= 20, name)
    assert.ok(data.length <= 100 * 1024 * 1024, name)
    const key = name.normalize('NFC').toLowerCase()
    assert.ok(!seen.has(key), `duplicate after normalization: ${name}`)
    seen.add(key)
  }
})

test('plugin root is the archive root, with the right files and nothing else', () => {
  assert.ok(files.has('plugin.json'))
  for (const name of files.keys()) {
    assert.match(name, /^(plugin\.json|assets\/|skills\/|LICENSE|LICENSE-RUBRIC|README\.md|SECURITY\.md)/, `unexpected file: ${name}`)
    assert.ok(!name.split('/').some(part => part.startsWith('.')), `hidden path: ${name}`)
  }
  // a skills-only upload must not carry MCP or app configuration
  for (const banned of ['mcp.json', '.mcp.json', '.app.json']) assert.ok(!files.has(banned), banned)
})

test('packaged files are the files in the repo', () => {
  for (const [name, data] of files) assert.ok(readFileSync(join(repo, name)).equals(data), `${name} differs from the repo`)
})

test('manifest passes the package rules', () => {
  const m = json('plugin.json')
  assert.match(m.name, /^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  assert.ok(m.name.length <= 64)
  assert.match(m.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/)
  assert.ok(m.description.length > 0 && m.description.length <= 1024)
  assert.ok(m.author.name && m.author.name.length <= 120)
  assert.match(m.homepage, /^https:\/\//)
  assert.equal(m.mcpServers, undefined)
  assert.equal(m.apps, undefined)
  const ui = m.extensions['com.openai'].interface
  assert.ok(CATEGORIES.includes(ui.category), `unknown category ${ui.category}`)
  assert.equal(ui.screenshots, undefined, 'screenshots need an MCP server with custom UI')
  assert.ok(ui.capabilities.length <= 20 && ui.capabilities.every(c => c && c.length <= 120))
  const prompts = ui.defaultPrompt
  assert.equal(new Set(prompts.map(p => p.normalize('NFC').replace(/\s+/g, ' ').trim())).size, prompts.length)
  assert.ok(prompts.every(p => !p.includes('@') && !p.includes('\n')))
  for (const url of ['websiteURL', 'supportURL', 'privacyPolicyURL']) assert.ok(ui[url].length <= 1024)
})

test('listing icons are in the package and square PNGs of at least 48 px', () => {
  const ui = json('plugin.json').extensions['com.openai'].interface
  for (const key of ['logo', 'composerIcon']) {
    const path = ui[key].replace(/^\.\//, '')
    assert.ok(files.has(path), `${key}: ${path} not in the package`)
    const png = files.get(path)
    assert.equal(png.toString('latin1', 1, 4), 'PNG')
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    assert.equal(w, h, `${path} is ${w}x${h}`)
    assert.ok(w >= 48 && w <= 4096 && png.length <= 5 * 1024 * 1024)
  }
})

test('every skill is valid: front matter, identity length, openai.yaml interface', () => {
  const plugin = json('plugin.json').name
  const dirs = skillDirs()
  assert.deepEqual(dirs.sort(), ['audit', 'fix'])
  const names = new Set()
  for (const dir of dirs) {
    const md = text(`skills/${dir}/SKILL.md`)
    const fm = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    assert.ok(fm, `${dir}: missing or unclosed front matter`)
    const name = fm[1].match(/^name:\s*(\S.*)$/m)?.[1].trim()
    const description = fm[1].match(/^description:\s*(\S.*)$/m)?.[1].trim()
    assert.ok(name, `${dir}: no name`)
    assert.ok(description && description.length <= 1024, `${dir}: description missing or over 1024 chars`)
    assert.ok(fm[2].trim().length > 0, `${dir}: empty body`)
    assert.ok(`${plugin}:${name}`.length <= 64)
    assert.ok(!names.has(name), `duplicate skill name ${name}`)
    names.add(name)
    const yaml = `skills/${dir}/agents/openai.yaml`
    if (files.has(yaml)) {
      assert.match(text(yaml), /^interface:\n(?:[ \t]+.*\n)*?[ \t]+display_name:\s*\S/m, `${yaml}: display_name`)
      assert.match(text(yaml), /^interface:\n(?:[ \t]+.*\n)*?[ \t]+short_description:\s*\S/m, `${yaml}: short_description`)
    }
  }
})

test('the scripts the skills call are in the package', () => {
  for (const script of ['skills/audit/scripts/audit.mjs', 'skills/fix/scripts/page-facts.mjs', 'skills/fix/scripts/generate-llms-txt.mjs',
    'skills/audit/references/rubric.json', 'skills/audit/references/ai-bots.json']) assert.ok(files.has(script), script)
  // every fix recipe the fix skill can open
  const recipes = [...files.keys()].filter(n => n.startsWith('skills/fix/references/fix-recipes/'))
  assert.ok(recipes.length >= 20)
})
