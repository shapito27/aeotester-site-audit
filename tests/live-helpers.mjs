// URL-mode test helpers: a throwaway local HTTP server with fixed routes,
// and a runner that loads it through lib/remote.mjs like the CLI does.
import { createServer } from 'node:http'
import { loadRemoteSite } from '../skills/audit/scripts/lib/remote.mjs'
import { loadPage, resolveLocal } from '../skills/audit/scripts/lib/site.mjs'
import { loadRubric } from '../skills/audit/scripts/lib/engine.mjs'

const rubric = loadRubric()

// routes: { '/path': body | { status, headers, body } | (req) => that }
// Unlisted paths answer 404 unless routes['*'] is set.
export async function serve(routes) {
  const hits = []
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    hits.push({ path, accept: req.headers.accept || '', ua: req.headers['user-agent'] || '' })
    let r = routes[path] ?? routes['*'] ?? { status: 404, body: 'not found' }
    if (typeof r === 'function') r = r(req)
    if (typeof r === 'string') r = { body: r }
    const headers = { 'content-type': /^\s*</.test(r.body || '') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', ...(r.headers || {}) }
    res.writeHead(r.status || 200, headers)
    res.end(r.body || '')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  return { url, hits, close: () => new Promise(resolve => server.close(resolve)) }
}

export async function loadLive(routes, { path = '/', ...options } = {}) {
  const srv = await serve(routes)
  try {
    const site = await loadRemoteSite(srv.url + path, options)
    return { site, hits: srv.hits, url: srv.url }
  } finally {
    await srv.close()
  }
}

// Runs one check module against a live-loaded site (first page, or pageUrlPath).
// patch(site) may adjust the loaded site first (e.g. to fake an https origin).
export async function runLiveCheck(mod, routes, { pageUrlPath, patch, ...options } = {}) {
  const { site, hits } = await loadLive(routes, options)
  if (patch) patch(site)
  const entry = rubric.checks.find(c => c.id === mod.id)
  const pages = site.pages.map(p => loadPage(site, p))
  const page = pageUrlPath ? pages.find(p => p.urlPath === pageUrlPath) : pages[0] || null
  const helpers = { resolveLocal: u => resolveLocal(site, u), headersFor: u => site.host.headersFor(u) }
  const result = mod.run({ site, page, rubric: entry, pages, helpers, options: {} })
  return { ...result, score: Math.floor(result.score), weight: entry.weight, site, hits }
}
