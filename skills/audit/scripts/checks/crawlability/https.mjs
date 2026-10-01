// crawlability.https - port of the extension's security-checker.js (2 pts)
//
// The repo cannot show TLS. The scheme is inferred from, in order of
// strength: host config that forces HTTPS (HSTS header, http -> https
// redirect), the declared site URL (base URL, canonical, og:url), and host
// defaults (Netlify, Vercel, Cloudflare Pages, GitHub Pages, Firebase serve
// HTTPS). Everything here is predicted; verify the live URL.
//
// URL mode measures instead: the scheme of the fetched origin, the real
// Strict-Transport-Security header, and whether http:// redirects to https://.

import { detectHost, redirectRules } from '../../lib/sources.mjs'

const WEIGHT = 2
const HTTPS_HOSTS = { netlify: 'Netlify', vercel: 'Vercel', cloudflare: 'Cloudflare', 'github-pages': 'GitHub Pages', firebase: 'Firebase Hosting', 'netlify-or-cloudflare': 'Netlify / Cloudflare Pages' }
// Exact extension selectors (case-sensitive attribute prefix)
const MIXED = [
  ['images', 'img[src^="http:"]', 'src', 'img'],
  ['scripts', 'script[src^="http:"]', 'src', 'script'],
  ['stylesheets', 'link[rel="stylesheet"][href^="http:"]', 'href', 'link rel="stylesheet"'],
  ['iframes', 'iframe[src^="http:"]', 'src', 'iframe']
]
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i

function mixedContent(pages, findings) {
  const mixed = []
  for (const [type, selector, attr, label] of MIXED) {
    let count = 0
    const examples = []
    for (const page of pages) {
      for (const el of page.doc.querySelectorAll(selector)) {
        count++
        if (examples.length < 3) examples.push(el.getAttribute(attr))
        findings.push({ file: page.file, line: el.line, message: `Mixed content: <${label}> loads over http://` })
      }
    }
    if (count) mixed.push({ type, count, examples })
  }
  return mixed
}

// URL mode: everything measured from live responses
function runLive(site, pages) {
  const findings = []
  const origin = site.live.origin
  const isHttps = origin.startsWith('https:')
  const firstPath = pages[0]?.urlPath || '/'
  const hsts = (site.host.headersFor(firstPath)['strict-transport-security'] || [])[0]?.value ?? null
  const httpRes = site.live.httpOrigin
  const location = httpRes?.headers?.location || ''
  const redirectsToHttps = !!httpRes && httpRes.status >= 300 && httpRes.status < 400 && /^https:\/\//i.test(location)
  // http:// answers with content instead of redirecting
  const httpServesContent = !!httpRes && httpRes.status >= 200 && httpRes.status < 300
  const details = {
    scheme: isHttps ? 'https' : 'http',
    origin,
    isHttps,
    hsts: !!hsts,
    hstsValue: hsts,
    httpRedirect: httpRes ? { status: httpRes.status || null, location: location || null, error: httpRes.error ?? null, redirectsToHttps } : null,
    pagesScanned: pages.length,
    measured: true
  }

  if (!isHttps) {
    return {
      score: 0,
      message: `Site is served over plain http:// (${origin})`,
      findings: [{ file: origin + '/', line: null, message: 'The site answers over http:// and did not redirect to https://' }],
      recommendation: 'Serve the site over HTTPS (host setting or certificate), redirect http to https, and switch the canonical and og:url to https://.',
      details: { ...details, mixedContent: [], mixedContentCount: 0 }
    }
  }

  const mixed = mixedContent(pages, findings)
  const mixedCount = mixed.reduce((s, m) => s + m.count, 0)
  for (const page of pages) {
    const els = [page.doc.querySelector('link[rel="canonical" i]'), page.doc.querySelector('meta[property="og:url"]')].filter(Boolean)
    for (const el of els) {
      const value = (el.getAttribute('href') ?? el.getAttribute('content') ?? '').trim()
      if (schemeOf(value) === 'http') findings.push({ file: page.file, line: el.line, message: `${el.localName === 'link' ? 'Canonical' : 'og:url'} declares an http:// URL` })
    }
  }
  if (httpServesContent) findings.push({ file: origin.replace(/^https:/, 'http:') + '/', line: null, message: `http:// answers ${httpRes.status} with content instead of redirecting to https://` })
  const score = Math.floor(WEIGHT - (mixedCount ? 0.5 : 0) - (httpServesContent ? 0.5 : 0))
  const recs = []
  if (httpServesContent) recs.push('Redirect http:// to https:// with a 301')
  if (mixedCount) recs.push('Change http:// asset URLs (img, script, stylesheet, iframe) to https://')
  if (!hsts) recs.push('Consider a Strict-Transport-Security header')
  const notes = []
  if (mixedCount) notes.push(`${mixedCount} mixed content warning${mixedCount === 1 ? '' : 's'}`)
  if (httpServesContent) notes.push('http:// does not redirect')
  return {
    score,
    message: `Site uses HTTPS${redirectsToHttps ? ', http redirects to https' : ''}${hsts ? ', HSTS set' : ''}${notes.length ? ` (${notes.join(', ')})` : ''}`,
    findings,
    recommendation: recs.length ? recs.join('. ') + '.' : '',
    details: { ...details, mixedContent: mixed, mixedContentCount: mixedCount }
  }
}

const schemeOf = v => (/^https:\/\//i.test(v) ? 'https' : /^http:\/\//i.test(v) && !LOCAL.test(v) ? 'http' : null)

export default {
  id: 'crawlability.https',
  scope: 'site',
  run({ site, pages }) {
    if (site.live) return runLive(site, pages)
    const findings = []
    const evidence = []

    // 1. Host config that forces HTTPS
    const hsts = site.host.headersFor('/')['strict-transport-security'] || []
    const upgrades = redirectRules(site).filter(r => /^http:\/\//i.test(r.from) && /^https:\/\//i.test(r.to))
    if (hsts.length) evidence.push(`Strict-Transport-Security header in ${hsts[0].source}`)
    for (const r of upgrades) evidence.push(`http -> https redirect in ${r.file}${r.line ? `:${r.line}` : ''}`)
    const forced = hsts.length > 0 || upgrades.length > 0

    // 2. Declared site URL: base URL, then canonical / og:url on pages
    const declared = { https: 0, http: 0 }
    const baseScheme = site.baseUrl ? schemeOf(site.baseUrl) : null
    for (const page of pages) {
      const els = [page.doc.querySelector('link[rel="canonical" i]'), page.doc.querySelector('meta[property="og:url"]')].filter(Boolean)
      for (const el of els) {
        const value = el.getAttribute('href') ?? el.getAttribute('content') ?? ''
        const s = schemeOf(value.trim())
        if (!s) continue
        declared[s]++
        if (s === 'http') findings.push({ file: page.file, line: el.line, message: `${el.localName === 'link' ? 'Canonical' : 'og:url'} declares an http:// URL` })
      }
    }
    const declaredScheme = baseScheme || (declared.http > declared.https ? 'http' : declared.https ? 'https' : null)
    if (declaredScheme) evidence.push(`site URL declared as ${declaredScheme}://${baseScheme ? ` (${site.baseUrl})` : ''}`)

    // 3. Host defaults
    const host = detectHost(site)
    const hostHttps = host && HTTPS_HOSTS[host.id] ? `${HTTPS_HOSTS[host.id]} serves HTTPS by default (${host.evidence})` : null
    if (hostHttps) evidence.push(hostHttps)

    let scheme = null
    if (forced) scheme = 'https'
    else if (declaredScheme === 'http') scheme = hostHttps ? 'https' : 'http'
    else if (declaredScheme === 'https' || hostHttps) scheme = 'https'

    const details = { scheme, evidence, baseUrl: site.baseUrl, forced, hsts: hsts.length > 0, host: host?.id ?? null, declared, pagesScanned: pages.length }

    if (scheme === 'http') {
      return {
        score: 0,
        predicted: true,
        message: 'Site URL is declared as http:// and nothing in the repo enforces HTTPS',
        findings: findings.length ? findings : [{ file: null, line: null, message: 'Site URL is declared as http://' }],
        recommendation: 'Serve the site over HTTPS (host setting or certificate), redirect http to https, and switch the site URL, canonical and og:url to https://.',
        details: { ...details, isHttps: false, mixedContent: [], mixedContentCount: 0 }
      }
    }

    // Mixed content across all pages
    const mixed = mixedContent(pages, findings)
    const mixedCount = mixed.reduce((s, m) => s + m.count, 0)
    const score = Math.floor(WEIGHT - (mixedCount ? 0.5 : 0))
    const recs = []
    if (mixedCount) recs.push('Change http:// asset URLs (img, script, stylesheet, iframe) to https://')
    if (declared.http) recs.push('switch canonical and og:url to https://')

    if (!scheme) {
      return {
        score: WEIGHT / 2,
        inconclusive: true,
        message: `HTTPS could not be determined from the repo${mixedCount ? ` (${mixedCount} mixed content reference${mixedCount === 1 ? '' : 's'})` : ''}`,
        findings,
        recommendation: ['Set the production site URL (base URL, canonical) to https:// and confirm the live site redirects http to https', ...recs].join('; ') + '.',
        details: { ...details, isHttps: null, mixedContent: mixed, mixedContentCount: mixedCount }
      }
    }

    return {
      score,
      predicted: true,
      message: `Site uses HTTPS (inferred)${mixedCount ? ` (${mixedCount} mixed content warning${mixedCount === 1 ? '' : 's'})` : ''}`,
      findings,
      recommendation: recs.length ? recs.join('; ') + '.' : '',
      details: { ...details, isHttps: true, mixedContent: mixed, mixedContentCount: mixedCount }
    }
  }
}
