// agent-readiness.protocols - port of the extension's agent-protocols-checker.js (6 pts, conditional)
//
// Instead of probing 11 URLs, looks for the same files in the served root
// (site.wellKnown and root files), with the extension's validators. Content
// types come from host config. Framework route handlers that would produce
// an artifact count as predicted. WebMCP annotations and API evidence are
// read from every audited page, not just one.
//
// URL mode: the files remote.mjs fetched (site.wellKnown, 2xx non-HTML
// answers only) with their real content types; no route-handler predictions.

import { existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import { readText, toPosix } from '../../lib/site.mjs'
import { extractJsonLd } from '../../lib/jsonld.mjs'
import { isUnreachable, responseLabel } from '../../lib/remote.mjs'

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v)

export const ARTIFACTS = [
  { path: '/.well-known/mcp/server-card.json', category: 'mcp', label: 'MCP server card', validate: json => isObject(json) },
  { path: '/.well-known/mcp.json', category: 'mcp', label: 'MCP server card', validate: json => isObject(json) },
  { path: '/.well-known/agent-card.json', category: 'a2a', label: 'A2A agent card', validate: json => isObject(json) && !!json.name },
  { path: '/.well-known/agent.json', category: 'a2a', label: 'Agent card', validate: json => isObject(json) && !!json.name },
  { path: '/.well-known/agent-skills/index.json', category: 'skills', label: 'Agent skills index', validate: json => isObject(json) || Array.isArray(json) },
  { path: '/.well-known/api-catalog', category: 'api', label: 'API catalog (RFC 9727)', validate: (json, p) => (isObject(json) && !!json.linkset) || /linkset/i.test(p.contentType) },
  { path: '/.well-known/openapi.json', category: 'api', label: 'OpenAPI document', validate: json => isObject(json) && !!(json.openapi || json.swagger) },
  { path: '/openapi.json', category: 'api', label: 'OpenAPI document', validate: json => isObject(json) && !!(json.openapi || json.swagger) },
  { path: '/.well-known/oauth-authorization-server', category: 'oauth', label: 'OAuth authorization server metadata', validate: json => isObject(json) && !!json.issuer },
  { path: '/.well-known/oauth-protected-resource', category: 'oauth', label: 'OAuth protected resource metadata (RFC 9728)', validate: json => isObject(json) && !!json.resource },
  { path: '/.well-known/ai', category: 'ai', label: 'AI metadata', validate: (json, p) => !p.isHtml && p.text.trim().length > 0 }
]

const API_PATH_SEGMENTS = ['api', 'apis', 'developer', 'developers', 'docs', 'documentation', 'graphql', 'swagger', 'openapi', 'api-docs', 'api-reference']
const API_HOSTNAME_PATTERN = /^(api|apis|developers?|docs)\./i
const MAX_ANCHORS_SCANNED = 500

// Route handlers that generate a path at runtime (Next.js, Astro, SvelteKit)
function routeHandlers(site, urlPath) {
  const p = urlPath.replace(/^\//, '')
  const bare = p.replace(/\.json$/, '')
  const candidates = []
  for (const base of ['app', 'src/app']) for (const ext of ['ts', 'js']) candidates.push(`${base}/${p}/route.${ext}`)
  for (const base of ['src/pages', 'pages', 'src/routes']) {
    for (const ext of ['ts', 'js']) candidates.push(`${base}/${p}.${ext}`, `${base}/${bare}.json.${ext}`, `${base}/${p}/+server.${ext}`)
  }
  return candidates.filter(c => existsSync(join(site.root, c)))
}

function readArtifact(site, urlPath, helpers) {
  if (site.live) {
    const entry = (site.wellKnown || []).find(w => w.urlPath === urlPath)
    if (!entry) return null
    const text = entry.text ?? ''
    const contentType = entry.contentType || ''
    const isHtml = /text\/html|application\/xhtml/i.test(contentType) || /^\s*<(!doctype|html)/i.test(text)
    let json = null
    if (text.trim() && !isHtml) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }
    return { file: entry.path, text, contentType, isHtml, json }
  }
  const dirs = [...new Set([site.fileRoot, site.sourcePublicDir].filter(Boolean))]
  for (const d of dirs) {
    const rel = toPosix(posix.join(toPosix(d), urlPath))
    const text = readText(join(site.root, rel))
    if (text === null) continue
    const contentType = (helpers.headersFor(urlPath)['content-type'] || []).map(h => h.value).pop() || ''
    const isHtml = /text\/html|application\/xhtml/i.test(contentType) || /^\s*<(!doctype|html)/i.test(text)
    let json = null
    if (text.trim() && !isHtml) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }
    return { file: rel, text, contentType, isHtml, json }
  }
  return null
}

export function isSameSite(a, b) {
  const strip = h => h.toLowerCase().replace(/^www\./, '')
  const x = strip(a)
  const y = strip(b)
  if (!x || !y) return false
  return x === y || y.endsWith(`.${x}`) || x.endsWith(`.${y}`)
}

function findApiEvidence(page) {
  const evidence = []
  let host
  try {
    host = new URL(page.url).hostname
  } catch {
    return evidence
  }
  for (const a of page.doc.querySelectorAll('a[href]').slice(0, MAX_ANCHORS_SCANNED)) {
    if (evidence.length >= 5) break
    let u
    try {
      u = new URL(a.getAttribute('href'), page.url)
    } catch {
      continue
    }
    if (!/^https?:$/.test(u.protocol) || !isSameSite(host, u.hostname)) continue
    const first = u.pathname.split('/').filter(Boolean)[0]
    if ((first && API_PATH_SEGMENTS.includes(first.toLowerCase())) || API_HOSTNAME_PATTERN.test(u.hostname)) {
      const sample = u.hostname === host ? u.pathname : `${u.origin}${u.pathname}`
      if (!evidence.some(e => e.sample === sample)) evidence.push({ sample, file: page.file, line: a.line })
    }
  }
  const desc = page.doc.querySelector('link[rel~="service-desc"], link[rel~="describedby"]')
  if (desc) evidence.push({ sample: `link rel="${desc.getAttribute('rel')}" -> ${desc.getAttribute('href')}`, file: page.file, line: desc.line })
  const webApi = extractJsonLd(page.doc).nodes.find(n => n.types.includes('WebAPI'))
  if (webApi) evidence.push({ sample: 'JSON-LD declares a WebAPI entity', file: page.file, line: webApi.line })
  return evidence
}

export default {
  id: 'agent-readiness.protocols',
  scope: 'site',
  run({ site, pages, helpers }) {
    const found = []
    const predictedFound = []
    const probed = []
    for (const a of ARTIFACTS) {
      const hit = readArtifact(site, a.path, helpers)
      let valid = false
      if (hit && !hit.isHtml) {
        try {
          valid = !!a.validate(hit.json, hit)
        } catch {
          valid = false
        }
      }
      if (valid) found.push({ ...a, file: hit.file })
      const routes = hit || site.live ? [] : routeHandlers(site, a.path)
      if (!valid && routes.length) predictedFound.push({ ...a, file: routes[0] })
      probed.push({ path: a.path, file: hit?.file ?? routes[0] ?? null, found: valid, predicted: !valid && routes.length > 0, invalid: !!hit && !valid })
    }

    const categories = new Set([...found, ...predictedFound].map(a => a.category))
    const webmcp = []
    for (const p of pages) for (const el of p.doc.querySelectorAll('[toolname], [tooldescription]')) webmcp.push({ file: p.file, line: el.line })
    if (webmcp.length) categories.add('webmcp')

    const details = {
      probed,
      found: found.map(f => f.path),
      foundFiles: found.map(f => f.file),
      predicted: predictedFound.map(f => ({ path: f.path, file: f.file })),
      foundLabels: found.map(f => f.label),
      categories: [...categories],
      webmcpElements: webmcp.length,
      applicable: true
    }
    const invalid = probed.filter(p => p.invalid)
    const invalidFindings = invalid.map(p => ({ file: p.file, line: 1, message: `${p.path} exists but does not validate (not JSON of the expected shape, or served as HTML)` }))

    if (categories.size > 0) {
      const n = categories.size
      const score = n >= 3 ? 6 : n === 2 ? 5 : 3
      const labels = [...found, ...predictedFound].map(f => f.label)
      if (webmcp.length) labels.push('WebMCP tool annotations')
      return {
        score,
        predicted: predictedFound.length > 0,
        message: `Agent discovery artifacts found: ${[...new Set(labels)].join(', ')}`,
        findings: invalidFindings,
        recommendation: n >= 2
          ? ''
          : 'Add more of the artifacts agents look for: an MCP server card at /.well-known/mcp/server-card.json, an API catalog at /.well-known/api-catalog, an OpenAPI document, and OAuth metadata if authentication is required.',
        details
      }
    }

    const evidence = pages.flatMap(findApiEvidence)
    const seen = new Set()
    const apiEvidence = evidence.filter(e => !seen.has(e.sample) && seen.add(e.sample))
    // URL mode: discovery paths that could not be read prove nothing
    const unreadable = site.live ? ARTIFACTS.map(a => ({ path: a.path, res: site.live.response(a.path) })).filter(u => u.res && isUnreachable(u.res)) : []
    if (apiEvidence.length && unreadable.length) {
      return {
        score: 3,
        inconclusive: true,
        message: `API surface detected; ${unreadable.length} discovery path${unreadable.length === 1 ? '' : 's'} could not be read (${responseLabel(unreadable[0].res)})`,
        findings: [
          ...unreadable.slice(0, 5).map(u => ({ file: site.live.origin + u.path, line: null, message: `Fetching ${u.path} answered ${responseLabel(u.res)}` })),
          ...apiEvidence.slice(0, 5).map(e => ({ file: e.file, line: e.line, message: `API surface evidence: ${e.sample}` })),
          ...invalidFindings
        ],
        recommendation: 'Make sure the /.well-known/ discovery paths are reachable for agents (not blocked by bot protection or rate limiting).',
        details: { ...details, inconclusive: true, unreachable: unreadable.map(u => u.path), apiEvidence: apiEvidence.map(e => e.sample) }
      }
    }
    if (apiEvidence.length) {
      return {
        score: 0,
        message: 'API surface detected but no agent discovery artifacts published',
        findings: [
          { file: null, line: null, message: 'No agent discovery files under /.well-known/ (MCP server card, API catalog, OpenAPI, OAuth metadata)' },
          ...apiEvidence.slice(0, 5).map(e => ({ file: e.file, line: e.line, message: `API surface evidence: ${e.sample}` })),
          ...invalidFindings
        ],
        recommendation: 'Publish an MCP server card at /.well-known/mcp/server-card.json, an API catalog at /.well-known/api-catalog (RFC 9727) or an OpenAPI document, plus OAuth metadata at /.well-known/oauth-protected-resource if authentication is required.',
        details: { ...details, apiEvidence: apiEvidence.map(e => e.sample) }
      }
    }

    return {
      score: 0,
      na: true,
      message: 'Not applicable: no API or agent surface detected',
      findings: invalidFindings,
      recommendation: '',
      details: { ...details, applicable: false, apiEvidence: [] }
    }
  }
}
