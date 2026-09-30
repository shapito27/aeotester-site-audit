// crawlability.http-behavior - port of the extension's http-behavior-checker.js (3 pts)
//
// The extension probes the live site. From the repo the three criteria are
// predicted from host config and the served files:
//   1. unknown URLs return 404: a 404 page (or host default) and no catch-all
//      rewrite/redirect that turns every path into a 200
//   2. pages return 200: no redirect, error status or Basic-Auth rule on them
//   3. no X-Robots-Tag noindex/none header rule (_headers, vercel.json,
//      netlify.toml, .htaccess) covering the pages

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readText } from '../../lib/site.mjs'
import { detectHost, redirectRules, isCatchAll } from '../../lib/sources.mjs'

const NOINDEX = /\b(noindex|none)\b/i
const NOT_FOUND_SOURCES = [
  'src/pages/404.astro', 'src/pages/404.md', 'src/pages/404.mdx', 'src/pages/404.html',
  'layouts/404.html',
  'app/not-found.tsx', 'app/not-found.jsx', 'app/not-found.js', 'src/app/not-found.tsx', 'src/app/not-found.jsx', 'src/app/not-found.js',
  'pages/404.tsx', 'pages/404.jsx', 'pages/404.js', 'src/pages/404.tsx', 'src/pages/404.jsx', 'src/pages/404.js',
  'public/404.html', 'static/404.html', '404.md', '404.njk', '404.liquid', 'src/404.md', 'src/404.njk', 'src/404.liquid', '404.html'
]
// Hosts that answer unknown paths with a real 404 when the repo has no 404 page
const DEFAULT_404_HOSTS = { netlify: 'Netlify', vercel: 'Vercel', 'github-pages': 'GitHub Pages', firebase: 'Firebase Hosting' }

function ruleRegex(from) {
  const re = from
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/\(\.\*\)/g, '\u0000')
    .replace(/[.+?^${}|[\]\\()]/g, '\\$&')
    .replace(/:\w+\*/g, '\u0000')
    .replace(/:\w+/g, '[^/]+')
    .replace(/\*+/g, '\u0000')
    .replace(/\u0000/g, '.*')
  try {
    return new RegExp(`^${re}/?$`)
  } catch {
    return null
  }
}

// Line in a host config file that mentions a header, for findings
function headerLine(site, source, name) {
  const text = readText(join(site.root, source)) || ''
  const idx = text.split('\n').findIndex(l => l.toLowerCase().includes(name))
  return idx < 0 ? null : idx + 1
}

function htaccessNoindex(site) {
  for (const f of [...new Set([site.fileRoot && join(site.fileRoot, '.htaccess'), '.htaccess'].filter(Boolean))]) {
    const text = readText(join(site.root, f))
    if (!text) continue
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*Header\s+(?:always\s+)?(?:set|add|append)\s+X-Robots-Tag\s+"?([^"\n]+)"?/i.exec(lines[i])
      if (m && NOINDEX.test(m[1])) return { file: f.replace(/\\/g, '/'), line: i + 1, value: m[1].trim() }
    }
  }
  return null
}

function probeUnknownUrl(site, rules) {
  // Catch-all rules that apply to a path with no file behind it
  for (const r of rules) {
    if (!isCatchAll(r.from)) continue
    if (/:splat|\$1|:path|:slug/.test(r.to)) continue // path-preserving (domain move), not a soft 404
    if (r.status === 404 || r.status === 410) return { point: 1, status: r.status, reason: `catch-all serves ${r.to} with ${r.status} (${r.file})` }
    const kind = r.status === 200 ? `rewrites every unknown URL to ${r.to} with 200` : `redirects every unknown URL to ${r.to} (${r.status})`
    return { point: 0, soft404: true, status: 200, rule: r, reason: `Unknown URLs return HTTP 200 (soft 404): ${r.file} ${kind}` }
  }
  const page = site.errorPages?.find(p => /(^|\/)404\.html?$/i.test(p)) || NOT_FOUND_SOURCES.find(f => existsSync(join(site.root, f)))
  if (page) return { point: 1, status: 404, notFoundPage: page, reason: `404 page ${page}` }
  if (site.stack.id === 'nextjs') return { point: 1, status: 404, reason: 'Next.js returns 404 for unknown routes by default' }
  const host = detectHost(site)
  if (host && DEFAULT_404_HOSTS[host.id]) return { point: 1, status: 404, host: host.id, reason: `${DEFAULT_404_HOSTS[host.id]} serves its default 404 page with status 404 (${host.evidence})` }
  return {
    point: 0.5,
    inconclusive: true,
    host: host?.id ?? null,
    reason: host?.id === 'cloudflare' || host?.id === 'netlify-or-cloudflare'
      ? 'No 404 page: Cloudflare Pages then serves index.html with 200 for unknown URLs (soft 404)'
      : 'No 404 page found and the host is unknown, so the status for unknown URLs cannot be predicted'
  }
}

function pageStatus(site, rules, urlPath, resolveLocal) {
  const auth = site.host.headersFor(urlPath)['basic-auth']
  if (auth?.length) return { ok: false, status: 401, file: auth[0].source, line: headerLine(site, auth[0].source, 'basic-auth'), reason: `Basic-Auth header rule in ${auth[0].source}` }
  for (const r of rules) {
    if (/^https?:\/\//i.test(r.from)) continue
    if (r.status === 200) continue // rewrites do not change the status of an existing page
    // Netlify-style _redirects and netlify.toml rules are shadowed by an existing file unless forced
    // _redirects / netlify.toml rules are shadowed by an existing file unless forced with !
    if (!r.force && (r.file.endsWith('_redirects') || r.file === 'netlify.toml')) continue
    const re = ruleRegex(r.from)
    if (!re || !re.test(urlPath)) continue
    if (r.status >= 400) return { ok: false, status: r.status, file: r.file, line: r.line, reason: `${r.file} answers ${r.from} with ${r.status}` }
    if (r.status >= 300) {
      if (/^https?:\/\//i.test(r.to)) return { ok: true, status: r.status, external: true, reason: `redirects to ${r.to}` }
      const target = resolveLocal(r.to.replace(/:splat|:\w+|\*/g, ''))
      if (target) return { ok: true, status: 200, redirectedTo: r.to, reason: `redirects to ${r.to}` }
      return { ok: false, status: 404, file: r.file, line: r.line, reason: `${r.file} redirects ${r.from} to ${r.to}, which has no file (404)` }
    }
  }
  return { ok: true, status: 200 }
}

export default {
  id: 'crawlability.http-behavior',
  scope: 'site',
  run({ site, pages, helpers }) {
    const rules = redirectRules(site)
    const resolveLocal = helpers?.resolveLocal || (() => null)
    const paths = pages.length ? pages.map(p => ({ urlPath: p.urlPath, file: p.file })) : [{ urlPath: '/', file: null }]
    const findings = []
    const issues = []

    // 1. Unknown URL
    const probe = probeUnknownUrl(site, rules)
    if (probe.point === 0) {
      issues.push(probe.reason)
      findings.push({ file: probe.rule.file, line: probe.rule.line, message: 'Catch-all rule turns unknown URLs into HTTP 200 (soft 404)' })
    } else if (probe.inconclusive) {
      issues.push(probe.reason)
      findings.push({ file: null, line: null, message: 'No 404 page (404.html) in the served root' })
    }

    // 2. Page status
    const bad = []
    for (const p of paths) {
      const s = pageStatus(site, rules, p.urlPath, resolveLocal)
      if (!s.ok) {
        bad.push({ urlPath: p.urlPath, status: s.status, reason: s.reason })
        findings.push({ file: s.file, line: s.line, message: `Page is served with HTTP ${s.status} instead of 200` })
      }
    }
    const pagePoint = (paths.length - bad.length) / paths.length
    if (bad.length) issues.push(`${bad.length} page${bad.length === 1 ? '' : 's'} would not return HTTP 200 (${bad[0].reason})`)

    // 3. X-Robots-Tag
    const htaccess = htaccessNoindex(site)
    const blocked = []
    for (const p of paths) {
      const values = site.host.headersFor(p.urlPath)['x-robots-tag'] || []
      const hit = values.find(v => NOINDEX.test(v.value))
      if (hit) blocked.push({ urlPath: p.urlPath, value: hit.value, file: hit.source, line: headerLine(site, hit.source, 'x-robots-tag') })
      else if (htaccess) blocked.push({ urlPath: p.urlPath, value: htaccess.value, file: htaccess.file, line: htaccess.line })
    }
    const headerPoint = (paths.length - blocked.length) / paths.length
    const seen = new Set()
    for (const b of blocked) {
      const key = `${b.file}:${b.line}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({ file: b.file, line: b.line, message: 'X-Robots-Tag header rule contains noindex/none and hides pages from AI search' })
    }
    if (blocked.length) issues.push(`X-Robots-Tag "${blocked[0].value}" hides ${blocked.length} page${blocked.length === 1 ? '' : 's'} from AI search`)

    const score = probe.point + pagePoint + headerPoint
    const recs = []
    if (probe.point < 1) recs.push(probe.soft404 ? 'Remove the catch-all 200 rewrite or redirect-to-home rule for unknown paths and add a 404.html' : 'Add a 404.html (or framework 404 page) so unknown URLs return HTTP 404')
    if (bad.length) recs.push('remove the redirect, error or auth rules that apply to published pages')
    if (blocked.length) recs.push('remove X-Robots-Tag noindex/none from header rules for production pages')

    return {
      score,
      predicted: true,
      inconclusive: !!probe.inconclusive,
      message: issues[0] || 'Correct HTTP behavior predicted: real 404s, 200 pages, no noindex header',
      findings,
      recommendation: recs.length ? recs.join('; ') + '. Verify live with curl -I.' : '',
      details: {
        probe: { point: probe.point, status: probe.status ?? null, soft404: !!probe.soft404, inconclusive: !!probe.inconclusive, reason: probe.reason, notFoundPage: probe.notFoundPage ?? null, host: probe.host ?? null },
        pages: { checked: paths.length, notOk: bad },
        xRobotsTag: { blocked, blockedByHeader: blocked.length > 0 },
        issues
      }
    }
  }
}
