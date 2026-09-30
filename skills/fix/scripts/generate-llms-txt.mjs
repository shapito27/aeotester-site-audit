#!/usr/bin/env node
// Prints a draft llms.txt (https://llmstxt.org/) built from the site's pages:
//
//   # Brand
//   > One-line summary from the homepage description
//   ## Section
//   - [Page title](https://site/page): page description
//
// Sections come from the first URL path segment. Legal and utility pages go
// under "## Optional". The output is a draft for review; nothing is written.
//
//   node generate-llms-txt.mjs [root] [--base-url https://example.com] [--max-pages N]

import { resolve } from 'node:path'
import { loadSite } from '../../audit/scripts/lib/site.mjs'
import { siteFacts } from './page-facts.mjs'

const OPTIONAL = /^(privacy|terms|legal|cookies?|imprint|impressum|disclaimer|sitemap|search|login|signin|signup|register|account|cart|checkout|thank-?you|tags?|categor(y|ies)|page)$/i
const MAX_LINKS_PER_SECTION = 40

function parseArgs(argv) {
  const args = { root: '.', baseUrl: null, maxPages: 500 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--base-url') args.baseUrl = argv[++i]
    else if (a === '--max-pages') args.maxPages = parseInt(argv[++i], 10)
    else if (!a.startsWith('--')) args.root = a
    else throw new Error(`Unknown option ${a}`)
  }
  return args
}

const clean = s => (s || '').replace(/\s+/g, ' ').trim()

function stripBrand(title, brand) {
  if (!title || !brand) return clean(title)
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return clean(title.replace(new RegExp(`\\s*[|\\-\\u2013\\u2014\\u00b7:]\\s*${escaped}\\s*$`), '')) || clean(title)
}

function titleCase(segment) {
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function shorten(text, max = 160) {
  const t = clean(text)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '...'
}

export function buildLlmsTxt(facts) {
  const { site, pages } = facts
  const brand = site.brand || 'Site name'
  const home = pages.find(p => p.urlPath === '/')
  const summary = home?.metaDescription || home?.og?.description || home?.firstParagraph || null
  const link = p => (site.baseUrl ? new URL(p.urlPath, site.baseUrl).href : p.urlPath)

  const sections = new Map()
  const optional = []
  for (const p of pages) {
    if (p.urlPath === '/') continue
    const segments = p.urlPath.split('/').filter(Boolean)
    const first = (segments[0] || '').replace(/\.html?$/i, '')
    const name = clean(p.h1[0] || stripBrand(p.title, brand) || titleCase(first))
    const desc = p.metaDescription || p.og.description || p.firstParagraph
    const line = `- [${name.replace(/[[\]]/g, '')}](${link(p)})${desc ? `: ${shorten(desc)}` : ''}`
    if (OPTIONAL.test(first)) optional.push(line)
    else {
      const section = segments.length > 1 ? titleCase(first) : 'Pages'
      if (!sections.has(section)) sections.set(section, [])
      sections.get(section).push(line)
    }
  }

  const out = [`# ${brand}`, '']
  out.push(`> ${summary ? shorten(summary, 300) : 'TODO: one sentence on what this site is and who it is for.'}`, '')
  if (home?.firstParagraph && home.firstParagraph !== summary) out.push(shorten(home.firstParagraph, 400), '')
  const ordered = [...sections.entries()].sort((a, b) => (a[0] === 'Pages' ? -1 : b[0] === 'Pages' ? 1 : a[0].localeCompare(b[0])))
  for (const [section, lines] of ordered) {
    out.push(`## ${section}`, '')
    out.push(...lines.slice(0, MAX_LINKS_PER_SECTION))
    if (lines.length > MAX_LINKS_PER_SECTION) out.push(`- ...and ${lines.length - MAX_LINKS_PER_SECTION} more (trim this list to the most useful pages)`)
    out.push('')
  }
  if (optional.length) out.push('## Optional', '', ...optional, '')
  return out.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  const site = loadSite(resolve(args.root), { maxPages: args.maxPages, baseUrl: args.baseUrl })
  if (!site.pages.length) {
    console.error(site.notes.join(' ') || 'No pages found.')
    process.exit(1)
  }
  process.stdout.write(buildLlmsTxt(siteFacts(site)))
}
