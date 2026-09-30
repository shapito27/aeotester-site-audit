// Site model: stack detection, served-root discovery, page list, root files
// (robots.txt, llms.txt, sitemaps, /.well-known/), and host config
// (_headers, _redirects, vercel.json, netlify.toml).
//
// Everything is read from disk. Nothing here touches the network.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep, dirname, posix } from 'node:path'
import { parseHTML } from './html.mjs'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'vendor', 'bower_components', '.cache', '.next', '.astro', '.vercel', '.netlify', '.wrangler', 'coverage', '.idea', '.vscode'])

export function toPosix(p) {
  return p.split(sep).join('/')
}

export function readText(abs) {
  try {
    const st = statSync(abs)
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

function readJson(abs) {
  const text = readText(abs)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function firstExisting(root, names) {
  for (const n of names) if (existsSync(join(root, n))) return n
  return null
}

function hasHtml(dir) {
  if (!existsSync(dir)) return false
  let found = false
  walk(dir, file => {
    if (/\.html?$/i.test(file)) found = true
    return found
  }, 4)
  return found
}

// Walks files under dir. fn returns true to stop early.
function walk(dir, fn, maxDepth = 12, depth = 0) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const e of entries) {
    const abs = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || (e.name.startsWith('.') && e.name !== '.well-known')) continue
      if (depth < maxDepth && walk(abs, fn, maxDepth, depth + 1)) return true
    } else if (e.isFile()) {
      if (fn(abs)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Stack detection

export function detectStack(root) {
  const pkg = readJson(join(root, 'package.json')) || {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const has = name => Object.prototype.hasOwnProperty.call(deps, name)
  const file = names => firstExisting(root, names)
  const buildCommand = pkg.scripts?.build ? 'npm run build' : null

  const wp = file(['wp-config.php', 'wp-config-sample.php', 'wp-content', 'wp-includes'])
  const themeCss = readText(join(root, 'style.css'))
  if (wp || (themeCss && /Theme Name:/i.test(themeCss)) || (existsSync(join(root, 'functions.php')) && existsSync(join(root, 'index.php')))) {
    return { id: 'wordpress', evidence: wp || 'WordPress theme files (style.css / functions.php)' }
  }
  const composer = readText(join(root, 'composer.json')) || ''
  if (/drupal\/core|craftcms\/cms|statamic\/cms|joomla/i.test(composer) || pkg.engines?.ghost || has('ghost')) {
    return { id: 'other-cms', evidence: 'database-backed CMS (composer.json / Ghost theme)' }
  }

  const next = file(['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs'])
  if (next || has('next')) {
    return { id: 'nextjs', evidence: next || 'next in package.json', outputDirs: ['out', '.next/server/app', '.next/server/pages'], sourcePublicDir: 'public', buildCommand }
  }
  const astro = file(['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts'])
  if (astro || has('astro')) {
    return { id: 'astro', evidence: astro || 'astro in package.json', outputDirs: ['dist'], sourcePublicDir: 'public', buildCommand }
  }
  const hugoConfig = file(['hugo.toml', 'hugo.yaml', 'hugo.yml', 'hugo.json'])
  const legacyHugo = file(['config.toml', 'config.yaml', 'config.yml'])
  if (hugoConfig || (legacyHugo && (existsSync(join(root, 'layouts')) || existsSync(join(root, 'themes'))) && existsSync(join(root, 'content')))) {
    return { id: 'hugo', evidence: hugoConfig || `${legacyHugo} + content/`, outputDirs: ['public'], sourcePublicDir: 'static', buildCommand: 'hugo' }
  }
  const eleventy = file(['.eleventy.js', 'eleventy.config.js', 'eleventy.config.mjs', 'eleventy.config.cjs'])
  if (eleventy || has('@11ty/eleventy')) {
    return { id: 'eleventy', evidence: eleventy || '@11ty/eleventy in package.json', outputDirs: ['_site'], sourcePublicDir: null, buildCommand: buildCommand || 'npx @11ty/eleventy' }
  }
  const vite = file(['vite.config.js', 'vite.config.mjs', 'vite.config.ts', 'vite.config.mts'])
  if (vite || has('vite')) {
    return { id: 'vite-spa', evidence: vite || 'vite in package.json', outputDirs: ['dist'], sourcePublicDir: 'public', buildCommand }
  }
  return { id: 'static-html', evidence: 'plain HTML files' }
}

// Directory that is served at "/" for a static site: the shallowest folder
// with an index.html, preferring conventional names.
function findStaticRoot(root) {
  if (existsSync(join(root, 'index.html'))) return '.'
  for (const d of ['public', 'site', 'www', 'docs', 'dist', 'build', 'src', 'html', '_site']) {
    if (existsSync(join(root, d, 'index.html'))) return d
  }
  let best = null
  walk(root, abs => {
    if (/[\\/]index\.html?$/i.test(abs)) {
      const rel = toPosix(relative(root, dirname(abs))) || '.'
      if (!best || rel.split('/').length < best.split('/').length) best = rel
    }
    return false
  }, 4)
  return best
}

// ---------------------------------------------------------------------------
// Host config

export function parseHeadersFile(text) {
  // Netlify / Cloudflare Pages _headers: a path line, then indented "Name: value" lines
  const rules = []
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (/^\s/.test(raw) && current) {
      const m = /^\s+([^:]+):\s*(.*)$/.exec(raw)
      if (m) current.headers.push([m[1].trim().toLowerCase(), m[2].trim()])
    } else {
      current = { pattern: raw.trim(), headers: [] }
      rules.push(current)
    }
  }
  return rules
}

function patternToRegex(pattern) {
  let p = pattern.replace(/^https?:\/\/[^/]+/, '')
  const re = p
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\(\.\*\\\)/g, '.*') // vercel "(.*)"
    .replace(/:\w+\*?/g, '[^/]+')
    .replace(/\*/g, '.*')
  return new RegExp(`^${re}$`)
}

function loadHostConfig(root, servedRoot, sourcePublicDir) {
  const headerRules = []
  const redirectFiles = []
  const sources = []
  const dirs = [...new Set([servedRoot, sourcePublicDir, '.'].filter(Boolean))]
  for (const d of dirs) {
    const headersPath = posix.join(toPosix(d), '_headers')
    const text = readText(join(root, headersPath))
    if (text !== null) {
      sources.push(headersPath)
      for (const r of parseHeadersFile(text)) headerRules.push({ ...r, source: headersPath })
    }
    const redirectsPath = posix.join(toPosix(d), '_redirects')
    if (existsSync(join(root, redirectsPath))) redirectFiles.push(redirectsPath)
  }
  const vercel = readJson(join(root, 'vercel.json'))
  if (vercel?.headers) {
    sources.push('vercel.json')
    for (const h of vercel.headers) {
      headerRules.push({ pattern: h.source, headers: (h.headers || []).map(x => [String(x.key).toLowerCase(), String(x.value)]), source: 'vercel.json' })
    }
  }
  const netlifyToml = readText(join(root, 'netlify.toml'))
  if (netlifyToml) {
    // Minimal [[headers]] support: for = "/path" then [headers.values] Key = "value"
    const blocks = netlifyToml.split(/\[\[headers\]\]/).slice(1)
    for (const b of blocks) {
      const forMatch = /for\s*=\s*"([^"]+)"/.exec(b)
      const values = /\[headers\.values\]([\s\S]*?)(?:\n\[|$)/.exec(b)
      if (!forMatch || !values) continue
      const headers = []
      for (const line of values[1].split('\n')) {
        const m = /^\s*"?([\w-]+)"?\s*=\s*"(.*)"\s*$/.exec(line)
        if (m) headers.push([m[1].toLowerCase(), m[2]])
      }
      sources.push('netlify.toml')
      headerRules.push({ pattern: forMatch[1], headers, source: 'netlify.toml' })
    }
  }
  return {
    sources: [...new Set(sources)],
    redirectFiles,
    headerRules,
    // Headers configured for a URL path. Values are arrays because rules stack.
    headersFor(urlPath) {
      const out = {}
      for (const rule of headerRules) {
        let re
        try {
          re = patternToRegex(rule.pattern)
        } catch {
          continue
        }
        if (!re.test(urlPath)) continue
        for (const [k, v] of rule.headers) (out[k] ||= []).push({ value: v, source: rule.source })
      }
      return out
    }
  }
}

// ---------------------------------------------------------------------------
// Site loading

export function urlPathFor(relFile) {
  const p = '/' + toPosix(relFile)
  if (/\/index\.html?$/i.test(p)) return p.replace(/index\.html?$/i, '')
  return p
}

export function loadSite(root, options = {}) {
  const maxPages = options.maxPages ?? 500
  const stack = detectStack(root)
  const site = {
    root,
    stack,
    mode: 'full',
    servedRoot: null,
    sourcePublicDir: stack.sourcePublicDir ?? null,
    pages: [],
    totalPages: 0,
    notes: []
  }

  if (stack.id === 'wordpress' || stack.id === 'other-cms') {
    site.mode = 'report-only'
    site.notes.push('Content lives in a database, so pages cannot be audited from the repo. Only files in the repo are checked.')
  }

  if (stack.outputDirs) {
    site.servedRoot = stack.outputDirs.find(d => hasHtml(join(root, d))) || null
    if (!site.servedRoot) {
      site.mode = 'needs-build'
      site.notes.push(`No build output found (${stack.outputDirs.join(', ')}). Build the site first${stack.buildCommand ? ` with \`${stack.buildCommand}\`` : ''}, then re-run the audit.`)
    }
  } else if (stack.id === 'static-html') {
    site.servedRoot = findStaticRoot(root)
    if (!site.servedRoot) {
      site.mode = 'no-pages'
      site.notes.push('No HTML pages found in this repo.')
    }
  }

  // Root files are read from the served root when there is one, else from the
  // source public dir, else from the repo root.
  const fileRoot = site.servedRoot ?? site.sourcePublicDir ?? '.'
  site.fileRoot = fileRoot
  const rootFile = name => {
    for (const d of [fileRoot, site.sourcePublicDir, '.'].filter(Boolean)) {
      const rel = toPosix(posix.join(toPosix(d), name))
      const text = readText(join(root, rel))
      if (text !== null) return { path: rel, text }
    }
    return null
  }
  site.rootFile = rootFile
  site.robotsTxt = rootFile('robots.txt')
  site.llmsTxt = rootFile('llms.txt')
  site.llmsFullTxt = rootFile('llms-full.txt')
  site.host = loadHostConfig(root, site.servedRoot, site.sourcePublicDir)

  site.wellKnown = []
  const wkDir = join(root, fileRoot, '.well-known')
  if (existsSync(wkDir)) {
    walk(wkDir, abs => {
      site.wellKnown.push({ urlPath: '/.well-known/' + toPosix(relative(wkDir, abs)), path: toPosix(relative(root, abs)) })
      return false
    }, 3)
  }

  // Page list
  if (site.servedRoot) {
    const base = join(root, site.servedRoot)
    const files = []
    walk(base, abs => {
      if (/\.html?$/i.test(abs)) files.push(toPosix(relative(base, abs)))
      return false
    })
    files.sort((a, b) => {
      const da = a.split('/').length
      const db = b.split('/').length
      if (da !== db) return da - db
      const ia = /(^|\/)index\.html?$/i.test(a) ? 0 : 1
      const ib = /(^|\/)index\.html?$/i.test(b) ? 0 : 1
      return ia - ib || a.localeCompare(b)
    })
    // Error pages are not content pages
    const content = files.filter(f => !/^(404|500|50x)\.html?$/i.test(f))
    site.errorPages = files.filter(f => /^(404|500|50x)\.html?$/i.test(f)).map(f => toPosix(posix.join(toPosix(site.servedRoot), f)))
    site.totalPages = content.length
    site.pageFiles = content
    for (const f of content.slice(0, maxPages)) {
      const rel = toPosix(posix.join(toPosix(site.servedRoot), f))
      site.pages.push({ file: rel, urlPath: urlPathFor(f) })
    }
    if (content.length > maxPages) site.notes.push(`Audited the first ${maxPages} of ${content.length} pages (use --max-pages to change).`)
  }

  site.sitemaps = findSitemaps(site)
  site.baseUrl = options.baseUrl || guessBaseUrl(site)
  return site
}

function findSitemaps(site) {
  const out = []
  const seen = new Set()
  const add = f => {
    if (f && !seen.has(f.path)) {
      seen.add(f.path)
      out.push(f)
    }
  }
  for (const name of ['sitemap.xml', 'sitemap_index.xml', 'sitemap-index.xml', 'sitemap-0.xml', 'wp-sitemap.xml']) add(site.rootFile(name))
  // Sitemaps declared in robots.txt that exist on disk
  const robots = site.robotsTxt?.text || ''
  for (const m of robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) {
    try {
      add(site.rootFile(new URL(m[1], 'https://x.invalid').pathname.replace(/^\//, '')))
    } catch {
      // ignore malformed sitemap URLs
    }
  }
  return out
}

function guessBaseUrl(site) {
  const tryUrl = v => {
    try {
      const u = new URL(v)
      return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.host}` : null
    } catch {
      return null
    }
  }
  const home = site.pages[0]
  if (home) {
    const text = readText(join(site.root, home.file)) || ''
    const m = /<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)/i.exec(text) || /<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)/i.exec(text)
    if (m && tryUrl(m[1])) return tryUrl(m[1])
  }
  for (const s of site.sitemaps) {
    const m = /<loc>\s*([^<\s]+)/i.exec(s.text)
    if (m && tryUrl(m[1])) return tryUrl(m[1])
  }
  const cname = readText(join(site.root, site.fileRoot, 'CNAME')) || readText(join(site.root, 'CNAME'))
  if (cname && cname.trim()) return `https://${cname.trim().split(/\s/)[0]}`
  for (const [f, re] of [['hugo.toml', /baseURL\s*=\s*["']([^"']+)/i], ['config.toml', /baseURL\s*=\s*["']([^"']+)/i], ['astro.config.mjs', /site:\s*["']([^"']+)/], ['astro.config.ts', /site:\s*["']([^"']+)/]]) {
    const m = re.exec(readText(join(site.root, f)) || '')
    if (m && tryUrl(m[1])) return tryUrl(m[1])
  }
  return null
}

// Loads and parses one page. Kept separate so checks only pay for what they use.
export function loadPage(site, page) {
  const html = readText(join(site.root, page.file)) ?? ''
  const doc = parseHTML(html)
  const url = site.baseUrl ? new URL(page.urlPath, site.baseUrl).href : `https://example.invalid${page.urlPath}`
  return { ...page, html, doc, url, hasRealUrl: !!site.baseUrl }
}

// Resolves a same-site URL path to a file in the served root, the way static
// hosts do: exact file, then .html, then /index.html.
export function resolveLocal(site, urlPath) {
  if (!site.servedRoot) return null
  let p = decodeURIComponent(urlPath.split(/[?#]/)[0])
  if (!p.startsWith('/')) p = '/' + p
  const base = toPosix(site.servedRoot)
  const candidates = p.endsWith('/') ? [p + 'index.html', p + 'index.htm'] : [p, p + '.html', p + '/index.html']
  for (const c of candidates) {
    const rel = posix.join(base, c)
    try {
      if (statSync(join(site.root, rel)).isFile()) return rel
    } catch {
      // not found
    }
  }
  return null
}
