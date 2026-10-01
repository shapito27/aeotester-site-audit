// agent-readiness.markdown - port of the extension's markdown-for-agents-checker.js (5 pts)
//
// Tiers, first match wins: negotiation evidence in the repo (5, predicted),
// a markdown alternate advertised by <link> or a Link header (3), a .md file
// served next to the page (2), nothing (0). Whether the host or CDN answers
// "Accept: text/markdown" (e.g. Cloudflare Markdown for Agents, a dashboard
// toggle) cannot be seen in the repo, so every result below 5 is flagged
// inconclusive with a live command to verify.
//
// URL mode measures instead: each page (up to 20) was fetched again with
// "Accept: text/markdown", and advertised markdown alternates were fetched.
// Negotiation that was tested and failed is a real 0, not inconclusive.

import { readdirSync } from 'node:fs'
import { join, posix } from 'node:path'
import { readText, toPosix } from '../../lib/site.mjs'
import { isUnreachable, responseLabel, markdownAlternates } from '../../lib/remote.mjs'

const ALT_SELECTOR = 'link[rel~="alternate"][type="text/markdown"], link[rel~="alternate"][type="text/x-markdown"]'

// Edge / server code that could negotiate markdown
const CODE_DIRS = ['functions', 'netlify/edge-functions', 'src/middleware', 'middleware', 'workers', 'src/workers', 'server']
const CODE_FILES = ['middleware.js', 'middleware.ts', 'src/middleware.js', 'src/middleware.ts', '_worker.js', 'worker.js', 'src/worker.js', 'src/worker.ts', 'src/index.ts', 'server.js', 'server.mjs', 'server.ts']
const CODE_EXT = /\.(m?[jt]s|cjs)$/
const HOST_CONFIG = ['vercel.json', 'netlify.toml', 'nginx.conf', 'Caddyfile', 'wrangler.toml']

const negotiationCache = new WeakMap()

function listCode(root, dir, depth = 0, out = []) {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const rel = posix.join(dir, e.name)
    if (e.isDirectory() && depth < 4 && e.name !== 'node_modules') listCode(root, rel, depth + 1, out)
    else if (e.isFile() && CODE_EXT.test(e.name)) out.push(rel)
  }
  return out
}

// Files that branch on the Accept header and answer with text/markdown
export function findNegotiationEvidence(site) {
  if (negotiationCache.has(site)) return negotiationCache.get(site)
  const candidates = [...CODE_FILES, ...CODE_DIRS.flatMap(d => listCode(site.root, d)), ...HOST_CONFIG]
  const evidence = []
  for (const rel of [...new Set(candidates)]) {
    const text = readText(join(site.root, rel))
    if (!text) continue
    if (/text\/markdown/i.test(text) && /\baccept\b(?!-)/i.test(text)) evidence.push(rel)
  }
  negotiationCache.set(site, evidence)
  return evidence
}

// Divergence: "/page.html" probes "/page.md" (the extension skips any path
// with a dot); a directory path also tries "<dir>/index.md".
export function markdownPaths(urlPath) {
  const p = urlPath.split(/[?#]/)[0]
  if (p === '' || p === '/') return ['/index.md']
  const last = p.split('/').pop()
  if (/\.html?$/i.test(last)) return [p.replace(/\.html?$/i, '.md')]
  if (last.includes('.')) return []
  if (p.endsWith('/')) return [p.replace(/\/$/, '') + '.md', p + 'index.md']
  return [p + '.md']
}

// Divergence: each Link header value is tested on its own, so an unrelated
// rel=alternate next to another link mentioning text/markdown does not count.
function linkHeaderMarkdown(headers) {
  for (const { value, source } of headers.link || []) {
    for (const part of value.split(/,(?=\s*<)/)) {
      if (/text\/(x-)?markdown/i.test(part) && /rel="?[^";]*\balternate\b/i.test(part)) return { value: part.trim(), source }
    }
  }
  return null
}

function findMarkdownFile(site, urlPath, helpers) {
  if (!site.servedRoot) return null
  for (const mdPath of markdownPaths(urlPath)) {
    const rel = toPosix(posix.join(toPosix(site.servedRoot), mdPath))
    const text = readText(join(site.root, rel))
    if (text === null) continue
    if (/^\s*<(!doctype|html)/i.test(text)) continue
    const ct = (helpers.headersFor(mdPath)['content-type'] || []).map(h => h.value).pop() || ''
    if (/text\/html|application\/xhtml/i.test(ct)) continue
    return { urlPath: mdPath, file: rel, headingStart: /^\s*#\s+\S/.test(text), contentType: ct || null }
  }
  return null
}

function resolvesLocally(href, pageUrl, helpers) {
  try {
    const u = new URL(href || '', pageUrl)
    if (u.origin !== new URL(pageUrl).origin) return null
    return !!helpers.resolveLocal(u.pathname)
  } catch {
    return null
  }
}

const MARKDOWN_TYPE = /text\/(x-)?markdown/i
const LIVE_REC = 'Answer "Accept: text/markdown" with a Markdown version and Content-Type: text/markdown (Cloudflare offers this as "Markdown for Agents", or use edge middleware), and advertise it with <link rel="alternate" type="text/markdown" href="..."> or a Link header.'

// URL mode: advertised alternates with the live response for each target
function liveAlternates(site, page) {
  const headers = {}
  for (const [k, v] of Object.entries(site.host.headersFor(page.urlPath))) headers[k] = v.map(h => h.value).join(', ')
  return markdownAlternates(page.doc, headers, page.url).map(a => {
    let res = null
    try {
      const u = new URL(a.url)
      if (u.origin === site.live.origin) res = site.live.response(u.pathname + u.search)
    } catch {
      res = null
    }
    return { ...a, res, works: !!res && res.ok && !/text\/html|application\/xhtml/i.test(res.contentType) && !/^\s*<(!doctype|html)/i.test(res.text || '') }
  })
}

function runLive(site, page) {
  const { doc, urlPath } = page
  const file = page.url
  const headLine = doc.head?.line ?? 1
  const probed = site.live.markdown.has(urlPath)
  const res = probed ? site.live.markdown.get(urlPath) : null
  const negotiated = !!res && res.ok && MARKDOWN_TYPE.test(res.contentType)
  const alternates = liveAlternates(site, page)
  const working = alternates.find(a => a.works)
  const broken = alternates.find(a => a.res && !a.works && !isUnreachable(a.res))
  const unverified = alternates.find(a => !a.res || isUnreachable(a.res))
  const details = {
    measured: true,
    probed,
    negotiation: !probed ? 'not tested' : negotiated ? 'yes' : isUnreachable(res) ? 'unreachable' : 'no',
    negotiationStatus: res?.status ?? null,
    negotiationContentType: res?.contentType || null,
    alternates: alternates.map(a => ({ url: a.url, via: a.via, status: a.res?.status ?? null, works: a.works })),
    verify: `curl -sI -H "Accept: text/markdown" ${page.url}`
  }

  if (negotiated) {
    return { score: 5, message: 'Serves Markdown via content negotiation (Accept: text/markdown)', findings: [], recommendation: '', details }
  }
  const altFinding = a => ({ file, line: a.via === 'link' ? (doc.querySelector(ALT_SELECTOR)?.line ?? headLine) : null, message: '' })
  const tested = probed && !isUnreachable(res)
  if (working) {
    return {
      score: 3,
      inconclusive: !tested,
      message: tested ? 'Markdown alternate is advertised, but the page does not answer "Accept: text/markdown"' : 'Markdown alternate is advertised and resolves; negotiation could not be tested on this page',
      findings: tested ? [{ ...altFinding(working), message: `Markdown alternate ${working.url} works, but a request with "Accept: text/markdown" got ${res.contentType || 'no content type'} (HTTP ${res.status})` }] : [],
      recommendation: tested ? 'Make the host answer "Accept: text/markdown" with Content-Type: text/markdown (Cloudflare "Markdown for Agents", or edge middleware serving the .md file).' : `Check live with ${details.verify}.`,
      details
    }
  }
  if (probed && isUnreachable(res)) {
    return {
      score: 5 / 2,
      inconclusive: true,
      message: `Markdown negotiation could not be tested (${responseLabel(res)})`,
      findings: [{ file, line: null, message: `The request with "Accept: text/markdown" answered ${responseLabel(res)}` }],
      recommendation: `Check live with ${details.verify}.`,
      details
    }
  }
  if (unverified) {
    return {
      score: 3,
      inconclusive: true,
      message: 'Markdown alternate is advertised; its target could not be checked',
      findings: [{ ...altFinding(unverified), message: `Markdown alternate ${unverified.url} ${unverified.res ? `answered ${responseLabel(unverified.res)}` : 'was not fetched (another origin or over the fetch limit)'}` }],
      recommendation: `Check the alternate URL and ${details.verify}.`,
      details
    }
  }
  const findings = []
  if (broken) findings.push({ ...altFinding(broken), message: `Advertised markdown alternate ${broken.url} answers ${responseLabel(broken.res)}${broken.res.ok ? ' with HTML' : ''}` })
  if (!probed) {
    // Beyond the pages probed with "Accept: text/markdown": nothing found on
    // the page itself, but negotiation may still work
    const otherWorks = [...site.live.markdown.values()].some(r => r && r.ok && MARKDOWN_TYPE.test(r.contentType))
    if (otherWorks) {
      return {
        score: 5,
        predicted: true,
        message: 'Other pages on this host serve Markdown via content negotiation (not tested on this page)',
        findings,
        recommendation: '',
        details
      }
    }
    return {
      score: 5 / 2,
      inconclusive: true,
      message: 'No Markdown alternate advertised; negotiation was not tested on this page',
      findings: [...findings, { file, line: headLine, message: `No markdown alternate advertised. Check live with ${details.verify}` }],
      recommendation: LIVE_REC,
      details
    }
  }
  findings.push({ file, line: headLine, message: `A request with "Accept: text/markdown" got ${res.contentType || 'no content type'} (HTTP ${res.status}) and no working markdown alternate is advertised` })
  return {
    score: 0,
    message: 'No Markdown representation for agents: "Accept: text/markdown" returns HTML',
    findings,
    recommendation: LIVE_REC,
    details
  }
}

export default {
  id: 'agent-readiness.markdown',
  scope: 'page',
  run({ site, page, helpers }) {
    if (site.live) return runLive(site, page)
    const { doc, file, urlPath } = page
    const negotiation = findNegotiationEvidence(site)
    const altEl = doc.querySelector(ALT_SELECTOR)
    const linkHeader = linkHeaderMarkdown(helpers.headersFor(urlPath))
    const mdFile = findMarkdownFile(site, urlPath, helpers)

    const details = {
      negotiation: negotiation.length ? 'predicted' : 'unknown',
      negotiationEvidence: negotiation,
      domAlternate: !!altEl,
      domAlternateHref: altEl?.getAttribute('href') ?? null,
      domAlternateResolves: altEl ? resolvesLocally(altEl.getAttribute('href'), page.url, helpers) : null,
      linkHeader: linkHeader?.value ?? null,
      linkHeaderSource: linkHeader?.source ?? null,
      markdownFile: mdFile?.file ?? null,
      markdownUrl: mdFile?.urlPath ?? null,
      probePaths: markdownPaths(urlPath),
      verify: `curl -sI -H "Accept: text/markdown" ${page.url}`
    }
    const verifyNote = 'Content negotiation cannot be seen in the repo; verify live with curl -sI -H "Accept: text/markdown" <page url>.'

    if (negotiation.length) {
      return {
        score: 5,
        predicted: true,
        message: 'Serves Markdown via content negotiation (from server/edge code, unverified)',
        findings: [],
        recommendation: '',
        details
      }
    }

    const headLine = doc.head?.line ?? 1
    if (altEl || linkHeader) {
      return {
        score: 3,
        inconclusive: true,
        message: 'Markdown alternate is advertised; content negotiation not found in the repo',
        findings: [{ file, line: altEl?.line ?? headLine, message: `Markdown alternate advertised, but no "Accept: text/markdown" handling found. ${verifyNote}` }],
        recommendation: 'Make the host answer "Accept: text/markdown" with Content-Type: text/markdown (Cloudflare "Markdown for Agents", or edge middleware serving the .md file).',
        details
      }
    }

    if (mdFile) {
      return {
        score: 2,
        inconclusive: true,
        predicted: true,
        message: 'A .md version exists but is not discoverable',
        findings: [{ file, line: headLine, message: `Markdown version ${mdFile.urlPath} exists but is not advertised with <link rel="alternate" type="text/markdown">` }],
        recommendation: `Advertise ${mdFile.urlPath} with <link rel="alternate" type="text/markdown" href="${mdFile.urlPath}"> in the <head> or a Link header, and honour "Accept: text/markdown".`,
        details
      }
    }

    return {
      score: 0,
      inconclusive: true,
      message: 'No Markdown representation found for agents',
      findings: [{ file, line: headLine, message: `No markdown alternate, Link header or .md file for this page. ${verifyNote}` }],
      recommendation: 'Serve a Markdown version for agents: publish a .md file per page, advertise it with <link rel="alternate" type="text/markdown" href="..."> or a Link header, and answer "Accept: text/markdown" with Content-Type: text/markdown (Cloudflare offers this as "Markdown for Agents").',
      details
    }
  }
}
