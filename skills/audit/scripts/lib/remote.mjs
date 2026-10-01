// URL mode: fetches a live site and builds the same site object that
// loadSite() builds from a repo, so the checks run unchanged. Everything a
// check needs is fetched up front, because checks are synchronous.
//
// What is fetched, all from the audited origin only:
//   robots.txt, llms.txt, llms-full.txt, sitemaps (index files followed),
//   the /.well-known/ agent discovery paths, every page (from the sitemaps,
//   else by following same-origin links), one made-up URL to see how unknown
//   pages are answered, the http:// origin to see whether it redirects, and
//   up to MARKDOWN_PROBES pages again with "Accept: text/markdown", and the
//   markdown alternates the pages advertise (<link> or Link header).
//
// Politeness: a few requests at a time, a timeout per request, one retry on
// 429/503/network errors, robots.txt respected for the "*" group (and an
// "AEOTester" group if the site has one) unless ignoreRobots is set.

import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseHTML } from './html.mjs'
import { parseRobots, canCrawl } from './robots.mjs'

export const USER_AGENT = 'Mozilla/5.0 (compatible; AEOTester-Audit/0.2; +https://github.com/shapito27/aeotester-site-audit)'
const ROBOTS_TOKEN = 'AEOTester'
const CONCURRENCY = 4
const TIMEOUT_MS = 10000
const MAX_BYTES = 2 * 1024 * 1024
const MARKDOWN_PROBES = 20
const DEFAULT_MAX_PAGES = 500
const SAMPLE_MAX_PAGES = 25
const SAMPLE_MAX_STATIC = 15
const MAX_SITEMAP_FILES = 20

// Kept in sync with checks/agent-readiness/protocols.mjs ARTIFACTS
const WELL_KNOWN = [
  '/.well-known/mcp/server-card.json', '/.well-known/mcp.json', '/.well-known/agent-card.json',
  '/.well-known/agent.json', '/.well-known/agent-skills/index.json', '/.well-known/api-catalog',
  '/.well-known/openapi.json', '/.well-known/openapi.yaml', '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource', '/.well-known/ai', '/openapi.json'
]
const MAX_ALTERNATE_FETCHES = 40
const MD_ALT_SELECTOR = 'link[rel~="alternate"][type="text/markdown"], link[rel~="alternate"][type="text/x-markdown"]'

export function isUrl(value) {
  return /^https?:\/\//i.test(value || '')
}

// Status codes and failures that mean "could not read it", never "absent"
export function isUnreachable(res) {
  return !res || res.timedOut || res.error || [0, 401, 403, 429, 503].includes(res.status)
}

// Short label for a response in messages: "HTTP 403", "timeout"
export function responseLabel(res) {
  if (!res) return 'not fetched'
  if (res.timedOut) return 'timeout'
  if (res.error) return res.error
  return `HTTP ${res.status}`
}

// Markdown alternate URLs a page advertises: <link rel="alternate"
// type="text/markdown"> and Link header entries with rel=alternate
export function markdownAlternates(doc, headers, baseUrl) {
  const out = []
  const add = (href, via) => {
    try {
      out.push({ url: new URL(href, baseUrl).href, via })
    } catch {
      // unparseable href
    }
  }
  const el = doc?.querySelector(MD_ALT_SELECTOR)
  if (el && el.getAttribute('href')) add(el.getAttribute('href'), 'link')
  for (const part of String(headers?.link || '').split(/,(?=\s*<)/)) {
    const m = /^\s*<([^>]*)>/.exec(part)
    if (m && /text\/(x-)?markdown/i.test(part) && /rel="?[^";]*\balternate\b/i.test(part)) add(m[1], 'header')
  }
  return out
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchOnce(url, { accept, redirect = 'follow' } = {}) {
  const headers = { 'user-agent': USER_AGENT, accept: accept || 'text/html,application/xhtml+xml,text/plain,application/json,application/xml;q=0.9,*/*;q=0.8' }
  try {
    const res = await fetch(url, { headers, redirect, signal: AbortSignal.timeout(TIMEOUT_MS) })
    const h = {}
    res.headers.forEach((v, k) => { h[k.toLowerCase()] = v })
    let text = ''
    if (redirect === 'follow' && res.body) {
      const reader = res.body.getReader()
      const chunks = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        chunks.push(value)
        if (size > MAX_BYTES) {
          await reader.cancel()
          break
        }
      }
      text = Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES)
    }
    return {
      url,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
      redirected: res.redirected,
      headers: h,
      contentType: (h['content-type'] || '').toLowerCase(),
      text
    }
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return { url, finalUrl: url, status: 0, ok: false, headers: {}, contentType: '', text: '', timedOut, error: timedOut ? 'timeout' : (err?.cause?.code || err?.message || 'network error') }
  }
}

// One retry after a pause on rate limiting, a 503 or a network error
export async function fetchUrl(url, options = {}) {
  const first = await fetchOnce(url, options)
  if (!(first.status === 429 || first.status === 503 || first.status === 0)) return first
  const retryAfter = parseInt(first.headers['retry-after'], 10)
  await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter, 10) * 1000 : 2000)
  return fetchOnce(url, options)
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

const isHtml = res => /text\/html|application\/xhtml/.test(res.contentType) || /^\s*<(!doctype|html)/i.test(res.text.slice(0, 200))

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

function normalizePageUrl(href, base) {
  try {
    const u = new URL(href, base)
    if (!/^https?:$/.test(u.protocol)) return null
    u.hash = ''
    if (/\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|gz|mp4|mp3|webm|css|js|json|xml|txt|woff2?)$/i.test(u.pathname)) return null
    return u.href
  } catch {
    return null
  }
}

function sitemapLocs(xml) {
  const isIndex = /<sitemapindex[\s>]/i.test(xml)
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/gi)].map(m => m[1].replace(/&amp;/g, '&'))
  return { isIndex, locs }
}

const TAXONOMY = new Set(['page', 'tag', 'tags', 'category', 'categories', 'author', 'authors', 'archive', 'archives', 'topic', 'topics', 'label', 'labels'])
const LOCALE = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/i
const NAV_SELECTOR = 'header a[href], nav a[href], footer a[href], [role="navigation"] a[href], [role="banner"] a[href], [role="contentinfo"] a[href]'

// Path segments with a locale prefix (/en/, /de-at/) and index files removed
function segmentsOf(url) {
  const parts = new URL(url).pathname.replace(/\/index\.html?$/i, '/').split('/').filter(Boolean)
  const locale = parts.length > 0 && LOCALE.test(parts[0]) && parts[0].length <= 5 ? parts.shift().toLowerCase() : null
  return { parts, locale }
}

// Picks one page per template instead of crawling everything. Sources, in
// priority order: the homepage's header, nav and footer links (they name the
// static pages and the section roots), then the sitemap, then any other
// homepage links. Returns items { url, role, fallback? } in fetch order.
export function samplePages({ origin, homeDoc, homeUrl, sitemapUrls = [], cap = SAMPLE_MAX_PAGES }) {
  const norm = u => normalizePageUrl(u, homeUrl)
  const navLinks = homeDoc ? homeDoc.querySelectorAll(NAV_SELECTOR).map(a => norm(a.getAttribute('href'))) : []
  const bodyLinks = homeDoc ? homeDoc.querySelectorAll('a[href]').map(a => norm(a.getAttribute('href'))) : []
  const all = [...new Set([...navLinks, ...sitemapUrls.map(norm), ...bodyLinks].filter(u => u && sameOrigin(u, origin) && u !== norm(homeUrl)))]

  // Stay in one locale: the homepage's, else the most common one
  const homeLocale = segmentsOf(homeUrl).locale
  const locales = all.map(u => segmentsOf(u).locale)
  const counts = new Map()
  for (const l of locales) counts.set(l, (counts.get(l) || 0) + 1)
  const locale = homeLocale ?? (counts.has(null) ? null : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
  const urls = all.filter(u => segmentsOf(u).locale === locale)
  const navSet = new Set(navLinks)

  // Group: static top-level pages, sections (first segment with children), taxonomy
  const sections = new Map() // first segment -> { root, children[] }
  const statics = []
  let taxonomy = null
  for (const u of urls) {
    const { parts } = segmentsOf(u)
    if (parts.length === 0) continue
    if (parts.some(p => TAXONOMY.has(p.toLowerCase())) || (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]) && TAXONOMY.has(parts[parts.length - 2].toLowerCase()))) {
      taxonomy ??= u
      continue
    }
    const head = parts[0].replace(/\.html?$/i, '')
    if (parts.length === 1) {
      const sec = sections.get(head) || { root: null, children: [] }
      sec.root ??= u
      sections.set(head, sec)
    } else {
      const sec = sections.get(head) || { root: null, children: [] }
      sec.children.push(u)
      sections.set(head, sec)
    }
  }
  for (const [head, sec] of [...sections]) {
    if (sec.children.length === 0) {
      statics.push(sec.root)
      sections.delete(head)
    }
  }

  const items = []
  const add = (url, role, fallback = null, guessed = false) => {
    if (url && !items.some(i => i.url === url) && items.length < cap - 1) items.push({ url, role, fallback, ...(guessed ? { guessed } : {}) })
  }
  // What the header, nav and footer link to comes first: that is what the
  // site itself treats as important. Then the rest of each kind.
  const navFirst = list => [...list.filter(u => navSet.has(u)), ...list.filter(u => !navSet.has(u))]
  const addSection = ([head, sec]) => {
    const [first, second] = navFirst(sec.children)
    const root = sec.root || `${origin}${locale ? `/${locale}` : ''}/${head}/`
    add(root, `section listing /${head}/`, second ? { url: second, role: `section item /${head}/` } : null, !sec.root)
    add(first, `section item /${head}/`)
  }
  const inNav = sec => navSet.has(sec.root) || sec.children.some(c => navSet.has(c))
  const sectionList = [...sections.entries()]
  const staticList = navFirst(statics).slice(0, SAMPLE_MAX_STATIC)
  sectionList.filter(([, sec]) => inNav(sec)).forEach(addSection)
  staticList.filter(u => navSet.has(u)).forEach(u => add(u, 'static page'))
  sectionList.filter(([, sec]) => !inNav(sec)).forEach(addSection)
  staticList.filter(u => !navSet.has(u)).forEach(u => add(u, 'static page'))
  if (taxonomy) add(taxonomy, 'tag, category or pagination page')
  return { items, totalFound: urls.length + 1 }
}

export async function loadRemoteSite(startUrl, options = {}) {
  const maxPages = options.maxPages ?? null
  const notes = []
  const log = options.log || (() => {})

  // Resolve the start URL first so redirects (http -> https, apex -> www) set the origin
  log(`Fetching ${startUrl}`)
  const start = await fetchUrl(startUrl)
  const origin = new URL(start.finalUrl || startUrl).origin
  const responses = new Map() // urlPath -> response
  const pathOf = url => {
    const u = new URL(url)
    return u.pathname + u.search
  }

  // Root files
  const rootNames = ['robots.txt', 'llms.txt', 'llms-full.txt']
  const rootResults = await pool(rootNames, name => fetchUrl(`${origin}/${name}`))
  rootNames.forEach((name, i) => responses.set('/' + name, rootResults[i]))
  const asFile = (name, res) => (res && res.ok && res.text.trim() !== '' && !isHtml(res) ? { path: `${origin}/${name}`, text: res.text, url: `${origin}/${name}` } : null)
  const robotsRes = responses.get('/robots.txt')
  const robotsTxt = robotsRes?.ok && !isHtml(robotsRes) ? { path: `${origin}/robots.txt`, text: robotsRes.text, url: `${origin}/robots.txt` } : null
  const parsedRobots = robotsTxt ? parseRobots(robotsTxt.text) : null
  const allowedByRobots = url => {
    if (options.ignoreRobots || !parsedRobots) return true
    const path = pathOf(url)
    const own = canCrawl(parsedRobots, ROBOTS_TOKEN, path)
    return own.allowed
  }

  // Sitemaps: robots.txt Sitemap lines, then the conventional names
  const sitemapQueue = [...(parsedRobots?.sitemaps || []).map(s => s.url), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]
  const sitemaps = []
  const sitemapPages = []
  const seenSitemaps = new Set()
  while (sitemapQueue.length && seenSitemaps.size < MAX_SITEMAP_FILES) {
    const url = sitemapQueue.shift()
    if (seenSitemaps.has(url) || !sameOrigin(url, origin)) continue
    seenSitemaps.add(url)
    const res = await fetchUrl(url, { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' })
    responses.set(pathOf(url), res)
    if (!res.ok || isHtml(res) || !/<(urlset|sitemapindex)[\s>]/i.test(res.text)) continue
    sitemaps.push({ path: url, text: res.text, url })
    const { isIndex, locs } = sitemapLocs(res.text)
    if (isIndex) sitemapQueue.push(...locs)
    else sitemapPages.push(...locs.filter(l => sameOrigin(l, origin)))
  }

  // Pages. Three modes:
  //   single - the URL names a page (any path but "/"): audit only that page
  //   sample - the URL is the homepage: one page per template (see samplePages)
  //   all    - --all: every page from the sitemap, else by following links
  const startFinal = start.finalUrl || startUrl
  const mode = options.all ? 'all' : new URL(startFinal).pathname === '/' ? 'sample' : 'single'
  const pages = []
  const skippedByRobots = []
  const failedPages = []
  // guessed: a section root URL made up by samplePages, not linked anywhere
  const addPage = (res, requested, role = null, guessed = false) => {
    if (!(res.ok && isHtml(res) && sameOrigin(res.finalUrl, origin))) {
      if (!res.ok) failedPages.push({ url: requested, status: res.status, error: res.error || null, guessed })
      return null
    }
    if (pages.some(p => p.url === res.finalUrl)) return null
    const page = { file: res.finalUrl, urlPath: pathOf(res.finalUrl), url: res.finalUrl, html: res.text, status: res.status, headers: res.headers, requestedUrl: requested, role }
    pages.push(page)
    responses.set(page.urlPath, res)
    return page
  }
  const fetchPages = async (items, cap) => {
    const todo = items.filter(it => {
      if (allowedByRobots(it.url)) return true
      skippedByRobots.push(it.url)
      return false
    }).slice(0, Math.max(0, cap - pages.length))
    const results = await pool(todo, it => (it.url === startFinal && start.ok ? start : fetchUrl(it.url)))
    return todo.map((it, i) => ({ item: it, page: addPage(results[i], it.url, it.role, !!it.guessed) }))
  }

  let totalFound = 1
  if (mode === 'single') {
    addPage(start, startUrl, 'requested page')
  } else if (mode === 'sample') {
    const cap = maxPages ?? SAMPLE_MAX_PAGES
    const home = addPage(start, startUrl, 'homepage')
    const homeDoc = home ? parseHTML(home.html) : null
    const plan = samplePages({ origin, homeDoc, homeUrl: startFinal, sitemapUrls: sitemapPages, cap })
    totalFound = plan.totalFound
    log(`Sampling one page per template from ${plan.totalFound} URLs found`)
    const done = await fetchPages(plan.items.filter(it => it.url !== startFinal), cap)
    // A section root that does not exist: take a second item from that section
    const extra = []
    for (const { item, page } of done) {
      if (!page && item.fallback) extra.push(item.fallback)
    }
    if (extra.length) await fetchPages(extra, cap)
  } else {
    const cap = maxPages ?? DEFAULT_MAX_PAGES
    const queued = new Set()
    const queue = []
    const enqueue = url => {
      const u = normalizePageUrl(url, origin)
      if (!u || !sameOrigin(u, origin) || queued.has(u)) return
      queued.add(u)
      queue.push({ url: u, role: null })
    }
    enqueue(startFinal)
    const fromSitemap = sitemapPages.length > 0
    for (const u of sitemapPages) enqueue(u)
    log(fromSitemap ? `Found ${sitemapPages.length} URLs in the sitemap` : 'No sitemap found, following links')
    while (queue.length && pages.length < cap) {
      const batch = queue.splice(0, CONCURRENCY * 2)
      const done = await fetchPages(batch, cap)
      if (!fromSitemap) {
        for (const { page } of done) {
          if (!page) continue
          for (const a of parseHTML(page.html).querySelectorAll('a[href]')) enqueue(new URL(a.getAttribute('href'), page.url).href)
        }
      }
      log(`Fetched ${pages.length} page(s)`)
    }
    totalFound = queued.size
  }

  // Unknown URL, http:// origin, discovery files, markdown negotiation
  const probePath = `/aeotester-404-check-${Math.random().toString(36).slice(2, 10)}`
  const [probe404, httpOrigin] = await Promise.all([
    fetchUrl(origin + probePath),
    origin.startsWith('https:') ? fetchOnce(origin.replace(/^https:/, 'http:') + '/', { redirect: 'manual' }) : Promise.resolve(null)
  ])
  const wkResults = await pool(WELL_KNOWN, p => fetchUrl(origin + p, { accept: 'application/json,application/linkset+json,*/*;q=0.5' }))
  const wellKnown = []
  WELL_KNOWN.forEach((p, i) => {
    const res = wkResults[i]
    responses.set(p, res)
    if (res.ok && res.text.trim() !== '' && !isHtml(res)) wellKnown.push({ urlPath: p, path: origin + p, text: res.text, contentType: res.contentType, status: res.status })
  })
  const markdown = new Map()
  const mdResults = await pool(pages.slice(0, MARKDOWN_PROBES), p => fetchUrl(p.url, { accept: 'text/markdown, text/html;q=0.9' }))
  pages.slice(0, MARKDOWN_PROBES).forEach((p, i) => markdown.set(p.urlPath, mdResults[i]))
  // Markdown alternates the pages advertise, so checks can see whether they resolve
  const altUrls = [...new Set(pages.flatMap(p => markdownAlternates(parseHTML(p.html), p.headers, p.url).map(a => a.url)))]
    .filter(u => sameOrigin(u, origin) && !responses.has(pathOf(u)))
    .slice(0, MAX_ALTERNATE_FETCHES)
  const altResults = await pool(altUrls, u => fetchUrl(u, { accept: 'text/markdown, text/plain;q=0.9, */*;q=0.5' }))
  altUrls.forEach((u, i) => responses.set(pathOf(u), altResults[i]))

  if (!start.ok) notes.push(`The start URL answered ${start.status || start.error}. ${isUnreachable(start) ? 'It may be blocking automated requests, so results that depend on it are marked inconclusive.' : ''}`.trim())
  if (mode === 'single') notes.push('Audited this one page plus the site-wide files (robots.txt, llms.txt, sitemap, /.well-known/). Pass the homepage URL to sample the whole site.')
  if (mode === 'sample') notes.push(`Sampled ${pages.length} page(s), one per template (homepage, top-level pages, and a listing plus an item from each section), from ${totalFound} URLs found. Use --pages N to change the sample size or --all to audit every page.`)
  if (mode === 'all' && totalFound > pages.length) notes.push(`Audited ${pages.length} of ${totalFound} pages found (use --pages to change the limit).`)
  if (skippedByRobots.length) notes.push(`Skipped ${skippedByRobots.length} page(s) that robots.txt disallows for crawlers (use --ignore-robots to include them).`)
  const realFailures = failedPages.filter(f => !f.guessed)
  if (realFailures.length) notes.push(`${realFailures.length} URL(s) could not be fetched or returned an error.`)
  notes.push(`Fetched live from ${origin} with the user agent "${USER_AGENT}".`)

  const headersFor = urlPath => {
    const res = responses.get(urlPath) || responses.get(urlPath.replace(/\/$/, '')) || pages.find(p => p.urlPath === urlPath)
    const out = {}
    for (const [k, v] of Object.entries(res?.headers || {})) out[k] = [{ value: v, source: 'HTTP response' }]
    return out
  }

  const rootFiles = new Map([['robots.txt', robotsTxt], ['llms.txt', asFile('llms.txt', responses.get('/llms.txt'))], ['llms-full.txt', asFile('llms-full.txt', responses.get('/llms-full.txt'))]])
  for (const s of sitemaps) rootFiles.set(pathOf(s.url).replace(/^\//, ''), s)

  return {
    // No repo: point file reads at a directory that does not exist
    root: join(tmpdir(), 'aeotester-live-site-has-no-files'),
    stack: { id: 'live', evidence: origin },
    mode: pages.length ? 'full' : 'no-pages',
    servedRoot: null,
    sourcePublicDir: null,
    fileRoot: null,
    pages,
    totalPages: totalFound,
    sampleMode: mode,
    errorPages: [],
    notes: pages.length ? notes : [`No HTML pages could be fetched from ${startUrl}${start.status ? ` (status ${start.status})` : start.error ? ` (${start.error})` : ''}.`, ...notes],
    robotsTxt,
    llmsTxt: rootFiles.get('llms.txt'),
    llmsFullTxt: rootFiles.get('llms-full.txt'),
    sitemaps,
    wellKnown,
    baseUrl: origin,
    rootFile: name => rootFiles.get(name.replace(/^\//, '')) ?? null,
    host: { sources: [], redirectFiles: [], headerRules: [], headersFor },
    live: {
      origin,
      startUrl,
      userAgent: USER_AGENT,
      response: urlPath => responses.get(urlPath) ?? null,
      probe404: { ...probe404, urlPath: probePath },
      httpOrigin,
      markdown,
      mode,
      skippedByRobots,
      failedPages
    }
  }
}
