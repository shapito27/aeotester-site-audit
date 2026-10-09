#!/usr/bin/env node
// Builds the ZIP to upload at https://platform.openai.com/plugins ("Skills only").
//
//   node scripts/build-openai-zip.mjs [out-dir]     # default: dist/aeotester-<version>.zip
//
// The plugin root sits at the archive root. Only what the plugin needs at runtime goes in:
// the portable manifest, the icon, the skills (with their scripts and references) and the
// licence files. Claude Code manifests, tests, CI and dev scripts stay out. No MCP or app
// files are included: a skills-only upload must not contain them.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const INCLUDE = [
  /^plugin\.json$/,
  /^assets\//,
  /^skills\//,
  /^(LICENSE|LICENSE-RUBRIC|README\.md|SECURITY\.md)$/,
]
const hidden = (path) => path.split('/').some(part => part.startsWith('.'))

export function packageFiles() {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  return tracked.filter(p => INCLUDE.some(re => re.test(p)) && !hidden(p)).sort()
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Fixed timestamp (1980-01-01) so the same sources always give the same bytes
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1

// Minimal ZIP writer: deflate (or store when that is not smaller), UTF-8 names, no extras
export function zip(entries) {
  const parts = []
  const central = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const deflated = deflateRawSync(data, { level: 9 })
    const stored = deflated.length >= data.length
    const body = stored ? data : deflated
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    parts.push(local, nameBuf, body)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(0x031e, 4) // made by: Unix, spec 3.0
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(stored ? 0 : 8, 10)
    dir.writeUInt16LE(DOS_TIME, 12)
    dir.writeUInt16LE(DOS_DATE, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(body.length, 20)
    dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(nameBuf.length, 28)
    dir.writeUInt32LE((0o100644 << 16) >>> 0, 38) // regular file, rw-r--r--
    dir.writeUInt32LE(offset, 42)
    central.push(dir, nameBuf)
    offset += local.length + nameBuf.length + body.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, centralBuf, end])
}

export function buildZip(outDir = join(root, 'dist')) {
  const names = packageFiles()
  const entries = names.map(name => ({ name, data: readFileSync(join(root, name)) }))
  const { name, version } = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8'))
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, `${name}-${version}.zip`)
  const bytes = zip(entries)
  writeFileSync(file, bytes)
  return { file, names, bytes: bytes.length, version }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { file, names, bytes } = buildZip(process.argv[2] ? resolve(process.argv[2]) : undefined)
  console.log(`${file}\n${names.length} files, ${(bytes / 1024).toFixed(0)} KiB`)
}
