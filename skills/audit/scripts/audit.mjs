#!/usr/bin/env node
// AEOTester audit CLI.
//
//   node audit.mjs [root] [--out aeotester-report.md] [--json <file|->]
//                  [--max-pages N] [--base-url https://example.com]
//                  [--only id1,id2] [--no-report]
//
// Reads files under root only. Makes no network requests.

import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadSite } from './lib/site.mjs'
import { runAudit } from './lib/engine.mjs'
import { renderReport, renderSummary } from './lib/report.mjs'

function parseArgs(argv) {
  const args = { root: '.', out: 'aeotester-report.md', json: null, maxPages: 500, baseUrl: null, only: null, report: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--out') args.out = next()
    else if (a === '--json') args.json = next()
    else if (a === '--max-pages') args.maxPages = parseInt(next(), 10)
    else if (a === '--base-url') args.baseUrl = next()
    else if (a === '--only') args.only = next().split(',')
    else if (a === '--no-report') args.report = false
    else if (!a.startsWith('--')) args.root = a
    else throw new Error(`Unknown option ${a}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const root = resolve(args.root)
const site = loadSite(root, { maxPages: args.maxPages, baseUrl: args.baseUrl })
const audit = await runAudit(site, { only: args.only })

if (args.report) {
  const outPath = resolve(root, args.out)
  writeFileSync(outPath, renderReport(site, audit))
}
if (args.json) {
  const payload = JSON.stringify({
    site: {
      root,
      stack: site.stack,
      mode: site.mode,
      servedRoot: site.servedRoot,
      sourcePublicDir: site.sourcePublicDir,
      baseUrl: site.baseUrl,
      pages: site.pages.length,
      totalPages: site.totalPages,
      notes: site.notes
    },
    ...audit
  }, null, 2)
  if (args.json === '-') process.stdout.write(payload + '\n')
  else writeFileSync(resolve(root, args.json), payload + '\n')
}
if (args.json !== '-') {
  console.log(renderSummary(site, audit))
  if (args.report) console.log(`\nReport: ${join(args.root, args.out)}`)
}
