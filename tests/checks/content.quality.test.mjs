import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/content/quality.mjs'
import { runCheck, html } from '../helpers.mjs'

const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const paras = (count, each) => Array.from({ length: count }, () => `<p>${words(each)}</p>`).join('\n')
const site = (file, body, head = '') => ({ 'index.html': html({ body: '<main><p>home</p></main>' }), [file]: html({ head, body }) })

test('substantial homepage scores full', () => {
  const r = runCheck(check, { 'index.html': html({ body: `<main>${paras(3, 60)}</main>` }) })
  assert.equal(r.details.pageType, 'homepage')
  assert.equal(r.details.wordCount, 180)
  assert.equal(r.score, 5)
  assert.equal(r.findings.length, 0)
})

test('empty shell is capped at 1 (the lowest reachable score)', () => {
  const r = runCheck(check, { 'index.html': html({ body: '<div id="app"></div>' }) })
  assert.equal(r.details.wordCount, 0)
  assert.equal(r.score, 1)
  assert.ok(r.findings.some(f => /minimal content/.test(f.message)))
})

test('thin general page loses 2', () => {
  const r = runCheck(check, site('page.html', `<main>${paras(2, 50)}</main>`), { pageFile: 'page.html' })
  assert.equal(r.details.pageType, 'general')
  assert.equal(r.details.wordCountStatus, 'thin')
  assert.equal(r.score, 3)
})

test('below-minimum general page loses 1', () => {
  const r = runCheck(check, site('page.html', `<main>${paras(3, 50)}</main>`), { pageFile: 'page.html' })
  assert.equal(r.details.wordCountStatus, 'below_average')
  assert.equal(r.score, 4)
})

test('one long paragraph loses 0.5 for structure', () => {
  const r = runCheck(check, site('page.html', `<main><p>${words(250)}</p></main>`), { pageFile: 'page.html' })
  assert.equal(r.details.paragraphCount, 1)
  assert.equal(r.score, 4)
})

test('boilerplate inside main is not counted', () => {
  const r = runCheck(check, { 'index.html': html({ body: `<main><nav>${words(300)}</nav>${paras(3, 60)}</main>` }) })
  assert.equal(r.details.wordCount, 180)
})

test('about keyword matches whole path segments only (divergence)', () => {
  const body = `<main>${paras(4, 60)}</main>`
  assert.equal(runCheck(check, site('about-us.html', body), { pageFile: 'about-us.html' }).details.pageType, 'about')
  assert.equal(runCheck(check, site('aboutface.html', body), { pageFile: 'aboutface.html' }).details.pageType, 'general')
})

test('blog listing at /blog/ is a blog page, a post under it is an article (divergence)', () => {
  const files = { ...site('blog/index.html', '<main></main>'), 'blog/first-post.html': html({ body: '<main></main>' }) }
  assert.equal(runCheck(check, files, { pageFile: 'blog/index.html' }).details.pageType, 'blog')
  assert.equal(runCheck(check, files, { pageFile: 'blog/first-post.html' }).details.pageType, 'article')
})

test('pretty-printed JSON-LD Article sets the page type (divergence)', () => {
  const head = '<script type="application/ld+json">\n{ "@context": "https://schema.org", "@type": "Article", "headline": "x" }\n</script>'
  const r = runCheck(check, site('page.html', `<main>${paras(3, 60)}</main>`, head), { pageFile: 'page.html' })
  assert.equal(r.details.pageType, 'article')
  assert.equal(r.details.pageTypeSource, 'schema')
})

test('several article cards without main are all counted (divergence)', () => {
  const cards = Array.from({ length: 3 }, () => `<article><p>${words(60)}</p></article>`).join('')
  const r = runCheck(check, { 'index.html': html({ body: cards }) })
  assert.equal(r.details.mainSelector, 'article')
  assert.equal(r.details.wordCount, 180)
  assert.equal(r.score, 5)
})

test('no main wrapper is reported when points are lost', () => {
  const r = runCheck(check, site('page.html', `<p>${words(80)}</p>`), { pageFile: 'page.html' })
  assert.equal(r.details.usedFallback, true)
  assert.ok(r.findings.some(f => /No <main>/.test(f.message)))
})
