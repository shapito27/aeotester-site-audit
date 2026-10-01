import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadLive } from '../live-helpers.mjs'

const page = (title, links = '') => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><header><nav>${links}</nav></header><main><h1>${title}</h1></main></body></html>`

test('a page URL audits only that page, plus site files', async () => {
  const { site, hits } = await loadLive({
    '/': page('Home'),
    '/blog/post-1': page('Post 1'),
    '/robots.txt': 'User-agent: *\nAllow: /\n',
    '/llms.txt': '# Site\n> About\n'
  }, { path: '/blog/post-1' })
  assert.equal(site.sampleMode, 'single')
  assert.deepEqual(site.pages.map(p => p.urlPath), ['/blog/post-1'])
  assert.ok(site.robotsTxt)
  assert.ok(site.llmsTxt)
  assert.ok(!hits.some(h => h.path === '/'), 'homepage not fetched')
  assert.equal(site.live.probe404.status, 404)
})

test('the homepage samples one page per template', async () => {
  const nav = '<a href="/about">About</a><a href="/blog/">Blog</a>'
  const routes = {
    '/': page('Home', nav),
    '/about': page('About'),
    '/blog/': page('Blog'),
    '/sitemap.xml': req => {
      const base = `http://${req.headers.host}`
      return { headers: { 'content-type': 'application/xml' }, body: `<?xml version="1.0"?><urlset>${Array.from({ length: 200 }, (_, i) => `<url><loc>${base}/blog/post-${i}</loc></url>`).join('')}<url><loc>${base}/about</loc></url></urlset>` }
    }
  }
  for (let i = 0; i < 200; i++) routes[`/blog/post-${i}`] = page(`Post ${i}`)
  const { site, hits } = await loadLive(routes)
  assert.equal(site.sampleMode, 'sample')
  const paths = site.pages.map(p => p.urlPath)
  assert.ok(paths.includes('/'))
  assert.ok(paths.includes('/about'))
  assert.ok(paths.includes('/blog/'))
  assert.equal(paths.filter(p => p.startsWith('/blog/post-')).length, 1)
  assert.ok(hits.filter(h => h.path.startsWith('/blog/post-')).length <= 2, 'did not crawl the blog')
})

test('--all fetches every page up to --pages', async () => {
  const links = Array.from({ length: 30 }, (_, i) => `<a href="/p${i}">p</a>`).join('')
  const routes = { '/': page('Home', links) }
  for (let i = 0; i < 30; i++) routes[`/p${i}`] = page(`P${i}`)
  const { site } = await loadLive(routes, { all: true, maxPages: 10 })
  assert.equal(site.sampleMode, 'all')
  assert.equal(site.pages.length, 10)
})

test('robots.txt disallow is respected unless ignoreRobots', async () => {
  const routes = { '/': page('Home', '<a href="/private">x</a><a href="/open">y</a>'), '/private': page('Private'), '/open': page('Open'), '/robots.txt': 'User-agent: *\nDisallow: /private\n' }
  const a = await loadLive(routes)
  assert.ok(!a.site.pages.some(p => p.urlPath === '/private'))
  assert.ok(!a.hits.some(h => h.path === '/private'))
  const b = await loadLive(routes, { ignoreRobots: true })
  assert.ok(b.site.pages.some(p => p.urlPath === '/private'))
})

test('an SPA fallback that serves HTML for /robots.txt is not a robots.txt', async () => {
  const { site } = await loadLive({ '*': page('App'), '/': page('Home') })
  assert.equal(site.robotsTxt, null)
  assert.equal(site.llmsTxt, null)
})
