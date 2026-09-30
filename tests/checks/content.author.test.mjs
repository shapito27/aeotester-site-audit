import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/content/author.mjs'
import { runCheck, html } from '../helpers.mjs'

const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`
const page = (head, body) => ({ 'index.html': html({ head, body }) })
const trustFooter = '<footer><a href="/about">About</a> <a href="/contact">Contact</a> <a href="/privacy">Privacy</a></footer>'
const plain = '<p>Pin boards keep your research tidy and easy to share with teammates.</p>'

test('schema author with credentials, bio and trust links scores full', () => {
  const r = runCheck(check, page(
    ld({ '@type': 'Article', headline: 'x', author: { '@type': 'Person', name: 'Dana Lee', jobTitle: 'Senior Researcher' } }),
    `<article>${plain}<div class="author-bio">Dana Lee has spent years studying research workflows.</div></article>${trustFooter}`
  ))
  assert.equal(r.score, 5)
  assert.equal(r.details.authorName, 'Dana Lee')
  assert.equal(r.details.detectionMethod, 'schema')
  assert.equal(r.findings.length, 0)
})

test('nothing at all scores 0 with a finding per component', () => {
  const r = runCheck(check, page('', plain))
  assert.equal(r.score, 0)
  assert.equal(r.findings.length, 4)
  assert.match(r.findings[0].message, /No author attribution/)
})

test('meta author alone gives 2', () => {
  const r = runCheck(check, page('<meta name="author" content="Dana Lee">', plain))
  assert.equal(r.score, 2)
  assert.equal(r.details.detectionMethod, 'meta')
})

test('empty meta author is a marker worth 1', () => {
  const r = runCheck(check, page('<meta name="author" content="">', plain))
  assert.equal(r.score, 1)
  assert.match(r.findings[0].message, /name is empty/)
})

test('twitter:creator strips the @', () => {
  assert.equal(runCheck(check, page('<meta name="twitter:creator" content="@dana">', plain)).details.authorName, 'dana')
})

test('microdata author with name and bio', () => {
  const r = runCheck(check, page('', `<div itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">Dana Lee</span> writes about research tools.</div>`))
  // name 2 + bio 1, no expertise terms, no trust links
  assert.equal(r.details.detectionMethod, 'microdata')
  assert.equal(r.details.eeat.authoritativeness.hasAuthorBio, true)
  assert.equal(r.score, 3)
})

test('byline text pattern yields a name and bio', () => {
  const r = runCheck(check, page('', '<article><h1>Pins</h1><p>Written by Dana Lee</p><p>Some text about pins and boards.</p></article>'))
  assert.equal(r.details.authorName, 'Dana Lee')
  assert.equal(r.details.detectionMethod, 'text-pattern')
  assert.equal(r.score, 3)
})

test('trust needs 3 of 5 signals; address counts', () => {
  const two = runCheck(check, page('', `${plain}<a href="/about">About</a><a href="/terms">Terms</a>`))
  assert.equal(two.details.eeat.trustworthiness.score, 2)
  const three = runCheck(check, page('', `${plain}<a href="/about">About</a><a href="/terms">Terms</a><address>1 Main St</address>`))
  assert.equal(three.details.eeat.trustworthiness.score, 3)
  assert.equal(three.score - two.score, 1)
})

test('any Person in JSON-LD counts as author (extension behaviour kept)', () => {
  const r = runCheck(check, page(ld({ '@type': 'Organization', name: 'X', founder: { '@type': 'Person', name: 'Sam Roe' } }), plain))
  assert.equal(r.details.authorName, 'Sam Roe')
})

test('broad expertise patterns match ordinary words (extension behaviour kept)', () => {
  const r = runCheck(check, page('', '<p>We are a professional team.</p>'))
  assert.equal(r.details.eeat.expertise.found, true)
})

test('divergence: nameless schema author is a marker worth 1', () => {
  const r = runCheck(check, page(ld({ '@type': 'Article', headline: 'x', author: { '@id': 'https://x.example/#dana' } }), plain))
  assert.equal(r.details.hasSchemaAuthor, true)
  assert.equal(r.score, 1)
})

test('divergence: author @id references resolve to the Person', () => {
  const graph = { '@graph': [{ '@type': 'BlogPosting', author: { '@id': '#p' } }, { '@type': 'Person', '@id': '#p', name: 'Dana Lee' }] }
  assert.equal(runCheck(check, page(ld(graph), plain)).details.authorName, 'Dana Lee')
})

test('divergence: "Nearby Coffee Shop" is not a byline', () => {
  const r = runCheck(check, page('', '<div><p>Contributor notes: visit the Nearby Coffee Shop today.</p></div>'))
  assert.equal(r.details.authorName, null)
})

test('divergence: "by the way" and "about this" are not author sections', () => {
  const r = runCheck(check, page('', '<div><p>This is by the way a note about this tool and more text.</p></div>'))
  assert.equal(r.details.eeat.authoritativeness.hasAuthorBio, false)
})

test('divergence: relative hrefs count as trust and author links', () => {
  const files = { 'index.html': html({ body: plain }), 'blog/post.html': html({ body: `${plain}<a href="../about.html">About</a><a href="contact.html">Contact</a><a href="privacy.html">Privacy</a>` }) }
  const r = runCheck(check, files, { pageFile: 'blog/post.html' })
  assert.equal(r.details.eeat.trustworthiness.score, 3)
  assert.equal(r.details.eeat.authoritativeness.hasAuthorLink, true)
})

test('source: templated schema author name is predicted', () => {
  const r = runCheck(check, page('<script type="application/ld+json">{"@type": "Article", "author": {"@type": "Person", "name": "{{ page.author }}"}}</script>', plain))
  assert.equal(r.details.detectionMethod, 'schema')
  assert.equal(r.predicted, true)
})

test('ordinary words are not credentials (divergence: abbreviations are case-sensitive)', () => {
  const body = '<article><p>By Sam Park</p><p>What do you do when the ma and pa shop down the road is closed? We ask as we go.</p></article>'
  const r = runCheck(check, { 'index.html': html({ head: '<meta name="author" content="Sam Park">', body }) })
  assert.deepEqual(r.details.eeat.expertise.matches, [])
})
