#!/usr/bin/env node
// Fails if any tracked text file contains an em dash (U+2014) or en dash (U+2013).
// House style: use a plain hyphen instead.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
const bad = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']')
let failures = 0

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  text.split('\n').forEach((line, i) => {
    if (bad.test(line)) {
      console.error(`${file}:${i + 1}: ${line.trim()}`)
      failures++
    }
  })
}

if (failures > 0) {
  console.error(`\n${failures} line(s) contain an em or en dash. Use a hyphen.`)
  process.exit(1)
}
console.log('No em or en dashes found.')
