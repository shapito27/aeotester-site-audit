// Robots directives for a page (meta robots / *bot meta and X-Robots-Tag), and
// whether a noindex is deliberate.
//
// A page is kept out of search on purpose when it says noindex, is not the
// homepage, is not listed in the sitemap, and the audit covers more than this
// one page. The engine leaves such pages out of the page averages (thank-you
// pages, privacy policy, terms) instead of scoring them as if they should rank.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PARAMS = new Set(['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after'])

// Divergence: directives are matched as whole comma/space separated tokens, so
// "max-image-preview:none" is not read as "none". A "googlebot: noindex" style
// user-agent prefix (X-Robots-Tag) is stripped.
export function parseDirectives(value) {
  const out = new Set()
  for (const part of String(value || '').toLowerCase().split(',')) {
    let p = part.trim()
    const m = /^([\w.-]+)\s*:\s*(.*)$/.exec(p)
    if (m) {
      if (PARAMS.has(m[1])) continue
      p = m[2]
    }
    for (const token of p.split(/\s+/)) if (token) out.add(token)
  }
  return { noindex: out.has('noindex') || out.has('none'), nofollow: out.has('nofollow') || out.has('none'), none: out.has('none') }
}

// A noindex that applies to every crawler: no user-agent prefix on any
// directive that carries it ("googlebot: noindex" is for Google only)
function forAllCrawlers(value) {
  return String(value || '').split(',').some(part => {
    const p = part.trim().toLowerCase()
    const m = /^([\w.-]+)\s*:\s*(.*)$/.exec(p)
    if (m && !PARAMS.has(m[1])) return false
    return !m && /(^|\s)(noindex|none)(\s|$)/.test(p)
  })
}

function headerLine(site, source, value) {
  // URL mode: the header came from a live response, there is no file
  if (site.live || source === 'HTTP response') return null
  try {
    const lines = readFileSync(join(site.root, source), 'utf8').split(/\r?\n/)
    const i = lines.findIndex(l => /x-robots-tag/i.test(l) && l.includes(value))
    const j = i === -1 ? lines.findIndex(l => l.includes(value)) : i
    return j === -1 ? null : j + 1
  } catch {
    return null
  }
}

export function robotsDirectives(page, site) {
  const issues = []
  // meta[name*="bot" i] also covers name="robots"
  for (const meta of page.doc.querySelectorAll('meta[name*="bot" i]')) {
    const content = meta.getAttribute('content') || ''
    const d = parseDirectives(content)
    const allCrawlers = (meta.getAttribute('name') || '').trim().toLowerCase() === 'robots'
    if (d.noindex || d.nofollow) issues.push({ type: 'meta', name: meta.getAttribute('name'), directive: content, hasNoindex: d.noindex, hasNofollow: d.nofollow, allCrawlers: allCrawlers && d.noindex, line: meta.line })
  }
  // Divergence: X-Robots-Tag from host config (the extension cannot read headers here)
  const paths = [page.urlPath]
  if (/\.html?$/i.test(page.urlPath)) paths.push(page.urlPath.replace(/\.html?$/i, ''))
  const seen = new Set()
  for (const p of paths) {
    for (const h of site.host.headersFor(p)['x-robots-tag'] || []) {
      const key = `${h.source}\n${h.value}`
      if (seen.has(key)) continue
      seen.add(key)
      const d = parseDirectives(h.value)
      if (d.noindex || d.nofollow) issues.push({ type: 'header', source: h.source, directive: h.value, hasNoindex: d.noindex, hasNofollow: d.nofollow, allCrawlers: d.noindex && forAllCrawlers(h.value), line: headerLine(site, h.source, h.value) })
    }
  }
  return { hasNoindex: issues.some(i => i.hasNoindex), noindexForAll: issues.some(i => i.allCrawlers), hasNofollow: issues.some(i => i.hasNofollow), issues }
}

// "/privacy.html", "/privacy/" and "/privacy" are the same page
function pathKey(path) {
  return String(path || '/')
    .split(/[?#]/)[0]
    .replace(/\/index\.html?$/i, '/')
    .replace(/\.html?$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase() || '/'
}

function locPaths(text) {
  const out = []
  for (const m of (text || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      out.push(new URL(m[1].replace(/&amp;/g, '&'), 'https://x.invalid').pathname)
    } catch {
      // ignore malformed <loc>
    }
  }
  return out
}

const sitemapCache = new WeakMap()

// Page paths listed in the sitemaps, or null when no page sitemap could be
// read. A sitemap index is followed to its children: URL mode already fetched
// them into site.sitemaps; repo mode reads them from the served root.
export function sitemapPaths(site) {
  if (!sitemapCache.has(site)) sitemapCache.set(site, readSitemapPaths(site))
  return sitemapCache.get(site)
}

function readSitemapPaths(site) {
  const queue = [...(site.sitemaps || [])]
  const seen = new Set(queue.map(s => s.path))
  const out = new Set()
  let pageSitemaps = 0
  while (queue.length) {
    const s = queue.shift()
    if (/<sitemapindex[\s>]/i.test(s.text || '')) {
      for (const p of locPaths(s.text)) {
        const child = site.rootFile(decodeURIComponent(p).replace(/^\//, ''))
        if (child && !seen.has(child.path)) {
          seen.add(child.path)
          queue.push(child)
        }
      }
      continue
    }
    if (!/<urlset[\s>]/i.test(s.text || '')) continue
    pageSitemaps++
    for (const p of locPaths(s.text)) out.add(pathKey(p))
  }
  return pageSitemaps ? out : null
}

export function isHomepage(page) {
  return pathKey(page.urlPath) === '/'
}

// { noindex, homepage, inSitemap (true/false/null if no sitemap), single, intentional, reason }
export function noindexIntent(page, site, sitemap = sitemapPaths(site)) {
  const robots = robotsDirectives(page, site)
  const homepage = isHomepage(page)
  const inSitemap = sitemap ? sitemap.has(pathKey(page.urlPath)) : null
  const single = site.sampleMode === 'single' || site.pages.length <= 1
  return {
    noindex: robots.hasNoindex,
    homepage,
    inSitemap,
    single,
    // A noindex for one crawler only (googlebot, GPTBot) leaves the page
    // visible to others, so it is not "kept out of search"
    intentional: robots.noindexForAll && !homepage && inSitemap !== true && !single,
    reason: inSitemap === null ? 'noindex, and the site has no sitemap that lists pages' : 'noindex, not in the sitemap',
    robots
  }
}
