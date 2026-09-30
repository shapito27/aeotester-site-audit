#!/usr/bin/env node
// Prints the facts /aeotester:fix needs to write fixes from real site data
// instead of guessing: per-page title, description, headings, first paragraph,
// social tags, JSON-LD types, images without alt, dates, author, social links,
// plus site-wide brand, base URL and logo.
//
//   node page-facts.mjs [root] [--pages index.html,about.html] [--max-pages N] [--base-url URL]
//
// Reads files only. No network requests.

import { existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import { resolve } from 'node:path'
import { loadSite, loadPage, toPosix } from '../../audit/scripts/lib/site.mjs'
import { extractJsonLd } from '../../audit/scripts/lib/jsonld.mjs'
import { visibleText } from '../../audit/scripts/lib/html.mjs'

const SOCIAL_HOSTS = /(^|\.)(twitter\.com|x\.com|linkedin\.com|github\.com|facebook\.com|instagram\.com|youtube\.com|mastodon\.social|bsky\.app|threads\.net|tiktok\.com|pinterest\.com|medium\.com|dev\.to|producthunt\.com)$/i

function parseArgs(argv) {
  const args = { root: '.', pages: null, maxPages: 200, baseUrl: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pages') args.pages = argv[++i].split(',')
    else if (a === '--max-pages') args.maxPages = parseInt(argv[++i], 10)
    else if (a === '--base-url') args.baseUrl = argv[++i]
    else if (!a.startsWith('--')) args.root = a
    else throw new Error(`Unknown option ${a}`)
  }
  return args
}

const clean = s => (s || '').replace(/\s+/g, ' ').trim()
const meta = (doc, attr, name) => doc.querySelector(`meta[${attr}="${name}" i]`)?.getAttribute('content') ?? null

export function pageFacts(site, page) {
  const { doc } = page
  const og = {}
  const twitter = {}
  for (const el of doc.querySelectorAll('meta[property^="og:"], meta[name^="og:"]')) og[(el.getAttribute('property') || el.getAttribute('name')).slice(3)] = el.getAttribute('content')
  for (const el of doc.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]')) twitter[(el.getAttribute('name') || el.getAttribute('property')).slice(8)] = el.getAttribute('content')

  const main = doc.querySelector('main') || doc.querySelector('article') || doc.body
  const firstP = main ? main.querySelectorAll('p').map(p => clean(p.textContent)).find(t => t.split(' ').length >= 8) : null
  const words = main ? clean(visibleText(main)).split(' ').filter(Boolean).length : 0
  const { nodes } = extractJsonLd(doc, { templates: true })
  const head = doc.head

  const socialLinks = new Set()
  for (const a of doc.querySelectorAll('a[href]')) {
    try {
      const u = new URL(a.getAttribute('href'), page.url)
      if (SOCIAL_HOSTS.test(u.hostname) && u.pathname.length > 1) socialLinks.add(u.href)
    } catch {
      // ignore unparsable hrefs
    }
  }

  return {
    file: page.file,
    urlPath: page.urlPath,
    url: page.hasRealUrl ? page.url : null,
    lang: doc.documentElement?.getAttribute('lang') ?? null,
    title: doc.title || null,
    titleLine: doc.querySelector('title')?.line ?? null,
    metaDescription: meta(doc, 'name', 'description'),
    canonical: doc.querySelector('link[rel="canonical" i]')?.getAttribute('href') ?? null,
    h1: doc.querySelectorAll('h1').map(h => clean(h.textContent)),
    headings: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').map(h => ({ level: +h.localName[1], text: clean(h.textContent).slice(0, 120), line: h.line })),
    firstParagraph: firstP ? firstP.slice(0, 400) : null,
    wordCount: words,
    og,
    twitter,
    jsonld: nodes.filter(n => /^\$(\[\d+\])?(\.@graph\[\d+\])?$/.test(n.path)).map(n => ({ types: n.types, line: n.line })),
    imagesMissingAlt: doc.querySelectorAll('img').filter(i => !clean(i.getAttribute('alt'))).map(i => ({ src: i.getAttribute('src'), line: i.line, emptyAlt: i.getAttribute('alt') !== null })),
    dates: {
      published: meta(doc, 'property', 'article:published_time') || nodes.map(n => n.node.datePublished).find(Boolean) || doc.querySelector('time[datetime]')?.getAttribute('datetime') || null,
      modified: meta(doc, 'property', 'article:modified_time') || nodes.map(n => n.node.dateModified).find(Boolean) || null
    },
    author: meta(doc, 'name', 'author') || null,
    socialLinks: [...socialLinks],
    headOpenLine: head?.line ?? null,
    headCloseLine: head ? lastLine(head) : null
  }
}

function lastLine(el) {
  let line = el.line
  const visit = n => {
    if (n.line && n.line > line) line = n.line
    for (const c of n.childNodes || []) visit(c)
  }
  visit(el)
  return line
}

// Brand: og:site_name, else the suffix most titles share after a separator
export function guessBrand(facts, baseUrl = null) {
  const siteName = facts.map(f => f.og.site_name).find(Boolean)
  if (siteName) return siteName
  const counts = new Map()
  for (const f of facts) {
    const m = /\s[|\-\u2013\u2014\u00b7:]\s([^|:]{2,40})$/.exec(f.title || '')
    if (m) counts.set(m[1].trim(), (counts.get(m[1].trim()) || 0) + 1)
  }
  // Ties go to the candidate that matches the domain, then the shorter one
  const host = (baseUrl || '').replace(/^https?:\/\/(www\.)?/, '').split('.')[0].toLowerCase()
  const onDomain = name => !!host && name.toLowerCase().replace(/[^a-z0-9]/g, '') === host.replace(/[^a-z0-9]/g, '')
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || onDomain(b[0]) - onDomain(a[0]) || a[0].length - b[0].length)[0]
  if (best) return best[0]
  const home = facts.find(f => f.urlPath === '/')
  return home?.title || null
}

// Site logo files to look for, most specific first: logo.* in the usual
// folders, then the touch icon (a square brand mark on most sites)
const LOGO_CANDIDATES = ['', 'img/', 'images/', 'assets/']
  .flatMap(dir => ['svg', 'png', 'jpg', 'webp'].map(ext => `${dir}logo.${ext}`))
  .concat(['apple-touch-icon'].map(base => `${base}.png`))

function findLogo(site) {
  const roots = [site.servedRoot, site.sourcePublicDir].filter(Boolean)
  for (const r of roots) {
    for (const name of LOGO_CANDIDATES) {
      if (existsSync(join(site.root, r, name))) return { path: toPosix(posix.join(toPosix(r), name)), urlPath: '/' + name }
    }
  }
  return null
}

export function siteFacts(site, pageList = null) {
  const pages = site.pages.filter(p => !pageList || pageList.some(x => p.file === x || p.file.endsWith('/' + x) || p.urlPath === x))
  const facts = pages.map(p => pageFacts(site, loadPage(site, p)))
  const all = pageList ? site.pages.map(p => pageFacts(site, loadPage(site, p))) : facts
  const logo = findLogo(site)
  return {
    site: {
      stack: site.stack.id,
      mode: site.mode,
      servedRoot: site.servedRoot,
      sourcePublicDir: site.sourcePublicDir,
      baseUrl: site.baseUrl,
      brand: guessBrand(all, site.baseUrl),
      logo: logo ? { ...logo, url: site.baseUrl ? new URL(logo.urlPath, site.baseUrl).href : null } : null,
      socialLinks: [...new Set(all.flatMap(f => f.socialLinks))],
      robotsTxt: site.robotsTxt?.path ?? null,
      llmsTxt: site.llmsTxt?.path ?? null,
      sitemaps: site.sitemaps.map(s => s.path),
      hostConfig: site.host.sources,
      totalPages: site.totalPages
    },
    pages: facts
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  const site = loadSite(resolve(args.root), { maxPages: args.maxPages, baseUrl: args.baseUrl })
  process.stdout.write(JSON.stringify(siteFacts(site, args.pages), null, 2) + '\n')
}
