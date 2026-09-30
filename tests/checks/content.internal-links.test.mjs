import { test } from 'node:test'
import assert from 'node:assert/strict'
import check from '../../skills/audit/scripts/checks/content/internal-links.mjs'
import { runCheck, html } from '../helpers.mjs'

const page = (body, head = '') => ({ 'index.html': html({ head, body }) })
const a = (href, text) => `<a href="${href}">${text}</a>`

test('three descriptive in-content links score full', () => {
  const r = runCheck(check, page(`<main><p>${a('/pricing', 'Pricing plans')} ${a('/guide', 'Pinning guide')} ${a('team.html', 'Our team')}</p></main>`))
  assert.equal(r.details.contentLinkCount, 3)
  assert.equal(r.score, 4)
  assert.equal(r.findings.length, 0)
})

test('no internal links scores 1', () => {
  const r = runCheck(check, page(`<main>${a('https://other.example/', 'Elsewhere')} ${a('mailto:x@y.z', 'Mail us')} ${a('#top', 'Top')}</main>`))
  assert.equal(r.details.totalInternalLinks, 0)
  assert.equal(r.score, 1)
})

test('few links loses 1', () => {
  const r = runCheck(check, page(`<main>${a('/pricing', 'Pricing plans')}</main>`))
  assert.equal(r.score, 3)
})

test('five nav links avoid the low-count rule even with no content links', () => {
  const nav = ['/a', '/b', '/c', '/d', '/e'].map(h => a(h, `Section ${h}`)).join('')
  assert.equal(runCheck(check, page(`<nav>${nav}</nav>`)).score, 4)
})

test('generic anchors cost 0.25 each, capped at 1', () => {
  const good = `${a('/x', 'Pricing plans')} ${a('/y', 'Pinning guide')} ${a('/z', 'Our team')}`
  const one = runCheck(check, page(`<main>${good} ${a('/w', 'Read more')}</main>`))
  assert.equal(one.details.genericLinkCount, 1)
  assert.equal(one.score, 3)
  const many = runCheck(check, page(`<main>${good} ${['here', 'more', 'click here', 'link', 'info', 'go'].map((t, i) => a(`/g${i}`, t)).join(' ')}</main>`))
  assert.equal(many.details.genericLinkCount, 6)
  assert.equal(many.score, 3)
  assert.equal(many.findings.filter(f => /Generic anchor/.test(f.message)).length, 6)
})

test('generic anchors in nav are not penalised', () => {
  const r = runCheck(check, page(`<header>${a('/', 'x')}</header><main>${a('/x', 'Pricing plans')} ${a('/y', 'Pinning guide')} ${a('/z', 'Our team')}</main>`))
  assert.equal(r.score, 4)
})

test('image-only link named by alt text is not generic (divergence)', () => {
  const body = `<main>${a('/x', '<img src="c.png" alt="Pinning guide">')} ${a('/y', 'Pricing plans')} ${a('/z', 'Our team')}</main>`
  const r = runCheck(check, page(body))
  assert.equal(r.details.genericLinkCount, 0)
  assert.equal(r.score, 4)
  const bare = runCheck(check, page(body.replace(' alt="Pinning guide"', '')))
  assert.equal(bare.details.genericLinkCount, 1)
})

test('www and apex hosts are the same site (divergence)', () => {
  const head = '<link rel="canonical" href="https://example.com/">'
  const r = runCheck(check, page(`<main>${a('https://www.example.com/x', 'Pricing plans')} ${a('https://example.com/y', 'Pinning guide')} ${a('https://sub.example.com/z', 'Sub site')}</main>`, head))
  assert.equal(r.details.totalInternalLinks, 2)
})
