// crawlability.indexability - port of the extension's indexability-checker.js (8 pts)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MAIN = 'main, article, [role="main"], .content, #content'
const NON_CONTENT = new Set(['nav', 'footer', 'header', 'aside'])
const HIDDEN = new Set(['script', 'style', 'template', 'noscript', 'head', 'title'])
// Divergence: "404" must stand alone (not inside a phone number or product code)
// and "error" must be a whole word
const NUM_404 = /(?<![\w-])404(?![\w-])/
const TITLE_404 = [NUM_404, /not found/, /page not found/, /\berror\b/, /no encontrado/, /nicht gefunden/]
const BODY_404 = [/page not found/, NUM_404]
const PARAMS = new Set(['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after'])

// Extension's normalizeUrl: protocol//hostname + pathname + search, one trailing
// slash stripped, lowercased.
function normalizeUrl(u) {
  return `${u.protocol}//${u.hostname}${u.pathname}${u.search}`.replace(/\/$/, '').toLowerCase()
}

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

function textWithout(root, skip) {
  let out = ''
  const visit = node => {
    if (node.nodeType === 3) {
      out += node.data
      return
    }
    if (node.nodeType !== 1) return
    if (HIDDEN.has(node.localName) || skip.has(node.localName)) return
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return
    for (const c of node.childNodes) visit(c)
    out += ' '
  }
  visit(root)
  return out
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
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

function checkCanonical(page, helpers) {
  const links = page.doc.querySelectorAll('link[rel="canonical"]')
  const headLine = page.doc.head?.line ?? 1
  if (links.length === 0) {
    return { status: 'warning', penalty: 1, message: 'No canonical tag found', line: headLine }
  }
  if (links.length > 1) {
    return { status: 'fail', penalty: 3, message: 'Multiple canonical tags found', urls: links.map(l => l.getAttribute('href')), line: links[1].line, lines: links.map(l => l.line) }
  }
  const el = links[0]
  const href = (el.getAttribute('href') || '').trim()
  let canonical = null
  try {
    canonical = href ? new URL(href, page.url) : null
  } catch {
    canonical = null
  }
  // Divergence: the extension throws on an empty or unparseable href
  if (!canonical) {
    return { status: 'warning', penalty: 1, message: 'Canonical tag has no valid href', canonical: href || null, line: el.line }
  }

  const current = new URL(page.url)
  const absolute = /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href)
  // Without a known base URL the page host is a placeholder, so another host
  // cannot be compared; only the path is.
  const hostCompared = page.hasRealUrl || !absolute
  if (hostCompared && canonical.hostname !== current.hostname) {
    return { status: 'fail', penalty: 8, critical: true, message: 'Canonical points to a different domain', canonical: canonical.href, current: page.url, line: el.line, hostCompared }
  }

  // Divergence: a canonical that a static host would serve from this same file
  // (/about for about.html, /blog/ for blog/index.html) counts as self-referencing.
  const resolved = helpers?.resolveLocal ? helpers.resolveLocal(canonical.pathname) : null
  const sameFile = resolved !== null && resolved === page.file && canonical.search === current.search
  let self
  if (hostCompared) {
    self = normalizeUrl(canonical) === normalizeUrl(current) || (sameFile && canonical.protocol === current.protocol)
  } else {
    const path = u => `${u.pathname}${u.search}`.replace(/\/$/, '').toLowerCase()
    self = path(canonical) === path(current) || sameFile
  }
  if (self) return { status: 'pass', penalty: 0, message: 'Canonical is self-referencing', canonical: canonical.href, line: el.line, hostCompared }
  return { status: 'warning', penalty: 2, message: 'Canonical points to a different URL (this page may not be indexed)', canonical: canonical.href, current: page.url, line: el.line, hostCompared }
}

function checkRobots(page, site) {
  const issues = []
  // meta[name*="bot" i] also covers name="robots"
  for (const meta of page.doc.querySelectorAll('meta[name*="bot" i]')) {
    const content = meta.getAttribute('content') || ''
    const d = parseDirectives(content)
    if (d.noindex || d.nofollow) issues.push({ type: 'meta', name: meta.getAttribute('name'), directive: content, hasNoindex: d.noindex, hasNofollow: d.nofollow, line: meta.line })
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
      if (d.noindex || d.nofollow) issues.push({ type: 'header', source: h.source, directive: h.value, hasNoindex: d.noindex, hasNofollow: d.nofollow, line: headerLine(site, h.source, h.value) })
    }
  }
  return { hasNoindex: issues.some(i => i.hasNoindex), hasNofollow: issues.some(i => i.hasNofollow), issues }
}

function checkSoft404(page) {
  const doc = page.doc
  const signals = []
  const title = doc.title.toLowerCase()
  if (TITLE_404.some(re => re.test(title))) signals.push('title')
  const main = doc.querySelector(MAIN)
  const body = doc.body
  const mainText = main ? main.innerText : body ? textWithout(body, NON_CONTENT) : ''
  const wordCount = countWords(mainText)
  if (wordCount < 200) signals.push('thin')
  const bodyText = (body ? body.innerText : '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 1000)
  if (BODY_404.some(re => re.test(bodyText))) signals.push('body')
  return { isSoft404: signals.length >= 2, signals, wordCount }
}

export default {
  id: 'crawlability.indexability',
  scope: 'page',
  run({ page, site, helpers }) {
    const file = page.file
    const canonical = checkCanonical(page, helpers)
    const robots = checkRobots(page, site)
    const soft404 = checkSoft404(page)
    const findings = []
    const recs = []

    for (const i of robots.issues) {
      const what = i.hasNoindex ? (i.hasNofollow ? 'noindex, nofollow' : 'noindex') : 'nofollow'
      if (i.type === 'meta') findings.push({ file, line: i.line, message: `<meta name="${i.name}"> blocks indexing (${what})` })
      else findings.push({ file: site.live ? page.url : i.source, line: site.live ? null : i.line, message: `X-Robots-Tag header blocks indexing (${what})` })
    }
    if (canonical.status !== 'pass') {
      if (canonical.lines) for (const line of canonical.lines.slice(1)) findings.push({ file, line, message: 'Duplicate canonical link' })
      else findings.push({ file, line: canonical.line, message: canonical.message })
    }
    if (soft404.isSoft404) {
      const why = { title: 'error words in the title', thin: `under 200 words of main content`, body: '"404" or "page not found" near the top of the page' }
      findings.push({ file, line: page.doc.querySelector('title')?.line ?? 1, message: `Looks like a soft 404 (${soft404.signals.map(s => why[s]).join(', ')})` })
    }

    const headerOnly = robots.issues.length > 0 && robots.issues.every(i => i.type === 'header')
    // Header rules from repo config are predicted; URL mode reads real headers
    const predicted = !site.live && robots.issues.some(i => i.type === 'header')
    const details = {
      canonical: { status: canonical.status, message: canonical.message, canonical: canonical.canonical ?? null, urls: canonical.urls, penalty: canonical.penalty, hostCompared: canonical.hostCompared ?? null },
      robots: { hasNoindex: robots.hasNoindex, hasNofollow: robots.hasNofollow, issues: robots.issues },
      soft404,
      pageUrl: page.hasRealUrl ? page.url : null
    }

    const critical = []
    if (robots.hasNoindex) {
      critical.push('Page has a noindex directive')
      recs.push(headerOnly ? (site.live ? 'Remove noindex from the X-Robots-Tag response header for this path' : 'Remove noindex from the X-Robots-Tag header rule for this path') : 'Remove noindex / none from the robots meta tag in production')
    }
    if (soft404.isSoft404) {
      critical.push('Soft 404 detected')
      recs.push('Make sure this page has real content, or serve it with a 404 status')
    }
    if (canonical.critical) {
      critical.push(canonical.message)
      recs.push('Point the canonical at this page on the production host')
    }
    if (critical.length) {
      return {
        score: 0,
        predicted,
        message: `Critical indexability issues: ${critical.join('; ')}`,
        findings,
        recommendation: recs.join('; ') + '.',
        details: { ...details, criticalIssues: critical }
      }
    }

    let score = 8 - canonical.penalty
    if (robots.hasNofollow) {
      score -= 2
      recs.push('Remove nofollow so links on this page are followed')
    }
    if (canonical.status !== 'pass') recs.unshift('Emit exactly one absolute, self-referencing <link rel="canonical"> on the production host')

    const parts = [canonical.status === 'pass' ? 'canonical OK' : 'canonical issue', 'indexable', 'not a soft 404']
    if (robots.hasNofollow) parts.push('nofollow')
    return {
      score: Math.max(0, score),
      predicted,
      message: `Indexability: ${parts.join(', ')}`,
      findings,
      recommendation: recs.length ? recs.join('; ') + '.' : '',
      details
    }
  }
}
