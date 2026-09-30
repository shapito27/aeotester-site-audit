// Source-side helpers for site-level checks: detecting files that are
// generated at build/request time (so their absence on disk proves nothing),
// the hosting target, and redirect/rewrite rules in host config.
// Read-only, no network.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readText } from './site.mjs'

export function packageDeps(site) {
  try {
    const pkg = JSON.parse(readFileSync(join(site.root, 'package.json'), 'utf8'))
    return { ...pkg.dependencies, ...pkg.devDependencies }
  } catch {
    return {}
  }
}

const firstFile = (site, files) => files.find(f => existsSync(join(site.root, f))) || null

function configText(site, names) {
  for (const n of names) {
    const t = readText(join(site.root, n))
    if (t !== null) return { file: n, text: t }
  }
  return null
}

const HUGO_CONFIGS = ['hugo.toml', 'hugo.yaml', 'hugo.yml', 'hugo.json', 'config.toml', 'config.yaml', 'config.yml']
const ASTRO_CONFIGS = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts']

// Returns a short description of what generates robots.txt, or null
export function robotsGenerator(site) {
  if (site.mode === 'report-only') return `${site.stack.id} serves a virtual robots.txt`
  const file = firstFile(site, [
    'src/pages/robots.txt.ts', 'src/pages/robots.txt.js', 'src/pages/robots.txt.mjs',
    'app/robots.ts', 'app/robots.js', 'src/app/robots.ts', 'src/app/robots.js', 'app/robots.txt', 'src/app/robots.txt',
    'robots.njk', 'src/robots.njk', 'robots.11ty.js', 'src/robots.11ty.js'
  ])
  if (file) return file
  if (site.stack.id === 'hugo') {
    const cfg = configText(site, HUGO_CONFIGS)
    if (cfg && /enableRobotsTXT\s*[=:]\s*true/i.test(cfg.text)) return `enableRobotsTXT in ${cfg.file}`
  }
  const deps = packageDeps(site)
  const dep = ['astro-robots-txt', 'next-sitemap'].find(d => deps[d])
  return dep ? `${dep} in package.json` : null
}

export function llmsGenerator(site) {
  if (site.mode === 'report-only') return `${site.stack.id} may generate llms.txt through a plugin`
  const file = firstFile(site, [
    'src/pages/llms.txt.ts', 'src/pages/llms.txt.js', 'src/pages/llms.txt.mjs',
    'app/llms.txt/route.ts', 'app/llms.txt/route.js', 'src/app/llms.txt/route.ts', 'src/app/llms.txt/route.js',
    'layouts/index.llms.txt', 'llms.txt.njk', 'src/llms.txt.njk', 'llms.txt.11ty.js', 'src/llms.txt.11ty.js'
  ])
  if (file) return file
  const dep = Object.keys(packageDeps(site)).find(d => /llms/i.test(d))
  return dep ? `${dep} in package.json` : null
}

// Returns { source, path } for a sitemap the build would emit at a probed path, or null
export function sitemapGenerator(site) {
  if (site.stack.id === 'wordpress') return { source: 'WordPress core sitemap (/sitemap.xml redirects to /wp-sitemap.xml)', path: '/sitemap.xml' }
  const deps = packageDeps(site)
  if (site.stack.id === 'astro') {
    const cfg = configText(site, ASTRO_CONFIGS)
    if (cfg && /@astrojs\/sitemap/.test(cfg.text) && /\bsite\s*:/.test(cfg.text)) return { source: `@astrojs/sitemap in ${cfg.file}`, path: '/sitemap-index.xml' }
  }
  if (site.stack.id === 'hugo') {
    const cfg = configText(site, HUGO_CONFIGS)
    if (!cfg || !/disableKinds[^\n\]]*sitemap/i.test(cfg.text)) return { source: 'Hugo built-in sitemap', path: '/sitemap.xml' }
  }
  const file = firstFile(site, [
    'app/sitemap.ts', 'app/sitemap.js', 'app/sitemap.xml', 'src/app/sitemap.ts', 'src/app/sitemap.js', 'src/app/sitemap.xml',
    'pages/sitemap.xml.ts', 'pages/sitemap.xml.js', 'src/pages/sitemap.xml.ts', 'src/pages/sitemap.xml.js',
    'sitemap.njk', 'sitemap.xml.njk', 'src/sitemap.njk', 'src/sitemap.xml.njk', 'sitemap.liquid', 'src/sitemap.liquid', 'sitemap.11ty.js', 'src/sitemap.11ty.js'
  ])
  if (file) return { source: file, path: '/sitemap.xml' }
  const dep = ['next-sitemap', '@quasibit/eleventy-plugin-sitemap', 'vite-plugin-sitemap'].find(d => deps[d])
  return dep ? { source: `${dep} in package.json`, path: '/sitemap.xml' } : null
}

// Hosting target inferred from config files in the repo
export function detectHost(site) {
  const has = f => existsSync(join(site.root, f))
  if (has('netlify.toml')) return { id: 'netlify', evidence: 'netlify.toml' }
  if (has('vercel.json')) return { id: 'vercel', evidence: 'vercel.json' }
  const wrangler = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'].find(has)
  if (wrangler) return { id: 'cloudflare', evidence: wrangler }
  if (has('firebase.json')) return { id: 'firebase', evidence: 'firebase.json' }
  const cname = [site.fileRoot && join(site.fileRoot, 'CNAME'), 'CNAME'].filter(Boolean).find(has)
  if (cname || has('.github/workflows/pages.yml')) return { id: 'github-pages', evidence: cname || '.github/workflows/pages.yml' }
  if (site.host.sources.length || site.host.redirectFiles.length) {
    return { id: 'netlify-or-cloudflare', evidence: [...site.host.sources, ...site.host.redirectFiles][0] }
  }
  return null
}

// Redirect and rewrite rules: [{ from, to, status, force, file, line }]
// status is a number (200 = rewrite). Sources: _redirects, netlify.toml
// [[redirects]], vercel.json redirects/rewrites, firebase.json rewrites.
export function redirectRules(site) {
  const rules = []
  for (const file of site.host.redirectFiles) {
    const text = readText(join(site.root, file)) || ''
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/#.*$/, '').trim()
      if (!line) return
      const parts = line.split(/\s+/)
      if (parts.length < 2) return
      const statusPart = parts.slice(2).find(p => /^\d{3}!?$/.test(p))
      rules.push({
        from: parts[0],
        to: parts[1],
        status: statusPart ? parseInt(statusPart, 10) : 301,
        force: !!statusPart?.endsWith('!'),
        file,
        line: i + 1
      })
    })
  }
  const toml = readText(join(site.root, 'netlify.toml'))
  if (toml) {
    const lines = toml.split(/\r?\n/)
    let current = null
    lines.forEach((raw, i) => {
      const line = raw.replace(/#.*$/, '').trim()
      if (/^\[\[redirects\]\]$/.test(line)) {
        current = { from: null, to: null, status: 301, force: false, file: 'netlify.toml', line: i + 1 }
        rules.push(current)
        return
      }
      if (/^\[/.test(line)) {
        current = null
        return
      }
      if (!current) return
      const m = /^(\w+)\s*=\s*"?([^"]*)"?$/.exec(line)
      if (!m) return
      if (m[1] === 'from') current.from = m[2]
      else if (m[1] === 'to') current.to = m[2]
      else if (m[1] === 'status') current.status = parseInt(m[2], 10)
      else if (m[1] === 'force') current.force = m[2] === 'true'
    })
  }
  const vercelText = readText(join(site.root, 'vercel.json'))
  if (vercelText) {
    try {
      const v = JSON.parse(vercelText)
      const lineOf = s => {
        const idx = vercelText.indexOf(JSON.stringify(s))
        return idx < 0 ? null : vercelText.slice(0, idx).split('\n').length
      }
      for (const r of v.rewrites || []) rules.push({ from: r.source, to: r.destination, status: 200, force: false, file: 'vercel.json', line: lineOf(r.source) })
      for (const r of v.redirects || []) rules.push({ from: r.source, to: r.destination, status: r.statusCode || (r.permanent === false ? 307 : 308), force: true, file: 'vercel.json', line: lineOf(r.source) })
      for (const r of v.routes || []) if (r.dest) rules.push({ from: r.src, to: r.dest, status: r.status || 200, force: false, file: 'vercel.json', line: lineOf(r.src) })
    } catch {
      // invalid JSON
    }
  }
  const firebaseText = readText(join(site.root, 'firebase.json'))
  if (firebaseText) {
    try {
      const f = JSON.parse(firebaseText)
      const hosting = [].concat(f.hosting || [])
      for (const h of hosting) {
        for (const r of h.rewrites || []) if (r.destination) rules.push({ from: r.source, to: r.destination, status: 200, force: false, file: 'firebase.json', line: null })
        for (const r of h.redirects || []) rules.push({ from: r.source, to: r.destination, status: r.type || 301, force: true, file: 'firebase.json', line: null })
      }
    } catch {
      // invalid JSON
    }
  }
  return rules.filter(r => r.from && r.to)
}

// True when a rule's source pattern matches every path (a catch-all)
export function isCatchAll(from) {
  return /^(\/?\*\*?|\/\*\*\/\*|\/:\w+\*{1,2}|\/\(\.\*\)|\/\.\*)$/.test(from.trim())
}
