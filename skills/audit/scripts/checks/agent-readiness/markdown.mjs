// agent-readiness.markdown - port of the extension's markdown-for-agents-checker.js (5 pts)
//
// Tiers, first match wins: negotiation evidence in the repo (5, predicted),
// a markdown alternate advertised by <link> or a Link header (3), a .md file
// served next to the page (2), nothing (0). Whether the host or CDN answers
// "Accept: text/markdown" (e.g. Cloudflare Markdown for Agents, a dashboard
// toggle) cannot be seen in the repo, so every result below 5 is flagged
// inconclusive with a live command to verify.

import { readdirSync } from 'node:fs'
import { join, posix } from 'node:path'
import { readText, toPosix } from '../../lib/site.mjs'

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

export default {
  id: 'agent-readiness.markdown',
  scope: 'page',
  run({ site, page, helpers }) {
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
