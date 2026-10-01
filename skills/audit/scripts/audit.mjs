#!/usr/bin/env node
// AEOTester audit CLI.
//
//   node audit.mjs [root | https://site] [--out aeotester-report.md] [--json <file|->]
//                  [--pages N] [--all] [--base-url https://example.com] [--ignore-robots]
//                  [--only id1,id2] [--no-report]
//
// With a folder (default "."), reads files under it only and makes no network
// requests. With an http(s) URL, fetches that site's pages and root files
// (see lib/remote.mjs) and writes the report to the current directory.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadSite } from './lib/site.mjs'
import { isUrl, loadRemoteSite } from './lib/remote.mjs'
import { runAudit, loadRubric } from './lib/engine.mjs'
import { renderReport, renderSummary } from './lib/report.mjs'

function parseArgs(argv) {
  const args = { root: '.', out: 'aeotester-report.md', json: null, maxPages: null, baseUrl: null, only: null, report: true, ignoreRobots: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--out') args.out = next()
    else if (a === '--json') args.json = next()
    else if (a === '--max-pages' || a === '--pages') args.maxPages = parseInt(next(), 10)
    else if (a === '--ignore-robots') args.ignoreRobots = true
    else if (a === '--all') args.all = true
    else if (a === '--base-url') args.baseUrl = next()
    else if (a === '--only') args.only = next().split(',')
    else if (a === '--no-report') args.report = false
    else if (!a.startsWith('--')) args.root = a
    else throw new Error(`Unknown option ${a}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const live = isUrl(args.root)
// URL mode writes the report to the current directory
const root = live ? process.cwd() : resolve(args.root)
const site = live
  ? await loadRemoteSite(args.root, { maxPages: args.maxPages ?? undefined, ignoreRobots: args.ignoreRobots, all: !!args.all, log: m => args.json !== '-' && process.stderr.write(m + '\n') })
  : loadSite(root, { maxPages: args.maxPages ?? undefined, baseUrl: args.baseUrl })
const audit = await runAudit(site, { only: args.only })

const outPath = resolve(root, args.out)
if (args.report) {
  writeFileSync(outPath, renderReport(site, audit, { rubric: audit.rubric || loadRubric() }))
}
if (args.json) {
  const payload = JSON.stringify({
    site: {
      root: live ? args.root : root,
      stack: site.stack,
      mode: site.mode,
      servedRoot: site.servedRoot,
      sourcePublicDir: site.sourcePublicDir,
      baseUrl: site.baseUrl,
      pages: site.pages.length,
      totalPages: site.totalPages,
      notes: site.notes
    },
    ...audit,
    rubric: undefined
  }, null, 2)
  if (args.json === '-') process.stdout.write(payload + '\n')
  else writeFileSync(resolve(root, args.json), payload + '\n')
}
if (args.json !== '-') {
  console.log(renderSummary(site, audit))
  if (args.report) console.log(`\nReport: ${outPath}`)
}
