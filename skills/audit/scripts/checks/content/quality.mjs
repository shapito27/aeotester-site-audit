// content.quality - port of the extension's content-quality-checker.js (5 pts)

import { visibleText } from '../../lib/html.mjs'
import { extractJsonLd } from '../../lib/jsonld.mjs'

const THRESHOLDS = {
  article: { minimum: 500, recommended: 800, excellent: 1500 },
  blog: { minimum: 400, recommended: 600, excellent: 1200 },
  product: { minimum: 150, recommended: 300, excellent: 600 },
  homepage: { minimum: 150, recommended: 300, excellent: 500 },
  about: { minimum: 200, recommended: 400, excellent: 800 },
  contact: { minimum: 50, recommended: 100, excellent: 200 },
  legal: { minimum: 300, recommended: 500, excellent: 1000 },
  faq: { minimum: 300, recommended: 500, excellent: 1000 },
  general: { minimum: 200, recommended: 300, excellent: 600 }
}

const MAIN_SELECTORS = ['main', 'article', '[role="main"]', '.content', '.main-content', '#content', '#main']
const BOILERPLATE = 'nav, header, footer, aside, .nav, .navigation, .menu, .sidebar, .header, .footer, .advertisement, .ad, script, style, noscript, iframe, [role="navigation"], [role="banner"], [role="contentinfo"]'

const ARTICLE_TYPES = ['Article', 'BlogPosting', 'NewsArticle']
const POST_SECTIONS = ['blog', 'article', 'post', 'news']

// Divergence from extension v1.3.1: URL keywords match whole path segments
// ("/about", "/about-us", "/about.html") instead of any substring, so
// "/aboutface" or "/helpers" are not typed about / faq, and a blog listing
// at "/blog/" is typed blog rather than article.
function segmentsOf(urlPath) {
  return urlPath.toLowerCase().split('/').filter(Boolean).map(s => s.replace(/\.(html?|php)$/, ''))
}

function segMatches(seg, keywords) {
  return keywords.some(k => seg === k || seg.startsWith(k + '-') || seg.startsWith(k + '_'))
}

export function detectPageType(page) {
  const path = page.urlPath.toLowerCase()
  const segs = segmentsOf(path)
  const has = keywords => segs.some(s => segMatches(s, keywords))

  if (has(['contact', 'kontakt', 'contacto'])) return { type: 'contact', source: 'url' }
  if (has(['about', 'uber-uns'])) return { type: 'about', source: 'url' }
  const postIdx = segs.findIndex(s => POST_SECTIONS.includes(s))
  if (postIdx !== -1 && postIdx < segs.length - 1) return { type: 'article', source: 'url' }
  if (segs.includes('blog')) return { type: 'blog', source: 'url' }
  if (segs.slice(0, -1).some(s => ['product', 'shop', 'item'].includes(s))) return { type: 'product', source: 'url' }
  if (has(['faq', 'help', 'support'])) return { type: 'faq', source: 'url' }
  if (has(['privacy', 'terms', 'legal', 'policy'])) return { type: 'legal', source: 'url' }
  if (['/', '/index', '/index.html', '/home'].includes(path)) return { type: 'homepage', source: 'url' }

  const title = page.doc.title.toLowerCase()
  if (title.includes('contact') || title.includes('kontakt')) return { type: 'contact', source: 'title' }
  if (title.includes('about') || title.includes('\u00fcber uns')) return { type: 'about', source: 'title' }
  if (title.includes('faq') || title.includes('frequently asked')) return { type: 'faq', source: 'title' }

  // Divergence: every top-level JSON-LD node (any block, @graph members,
  // pretty-printed JSON) is read, not a no-whitespace substring of the first block
  const top = extractJsonLd(page.doc).nodes.filter(n => n.topLevel)
  if (top.some(n => n.types.some(t => ARTICLE_TYPES.includes(t)))) return { type: 'article', source: 'schema' }
  if (top.some(n => n.types.includes('Product'))) return { type: 'product', source: 'schema' }
  return { type: 'general', source: 'default' }
}

function mainContent(doc) {
  for (const sel of MAIN_SELECTORS) {
    const el = doc.querySelector(sel)
    if (!el) continue
    // Divergence: a page of several <article> cards and no <main> counts all
    // top-level articles, not only the first card.
    if (sel === 'article') {
      const all = doc.querySelectorAll('article').filter(a => !a.parentElement?.closest('article'))
      return { elements: all, selector: sel }
    }
    return { elements: [el], selector: sel }
  }
  return { elements: [doc.body || doc], selector: null }
}

const countWords = text => text.split(/\s+/).filter(w => w.length > 0).length

export default {
  id: 'content.quality',
  scope: 'page',
  run({ page }) {
    const { doc, file } = page
    const pageType = detectPageType(page)
    const t = THRESHOLDS[pageType.type]

    const { elements, selector } = mainContent(doc)
    const skip = el => el.matches(BOILERPLATE)
    const text = elements.map(el => visibleText(el, skip)).join('\n').trim()
    const wordCount = countWords(text)
    const line = elements[0]?.line ?? doc.body?.line ?? 1

    let score = 5
    const issues = []
    let wordCountStatus = 'excellent'
    const veryThin = Math.floor(t.minimum * 0.33)
    const thin = Math.floor(t.minimum * 0.66)
    if (wordCount < veryThin) {
      score -= 3
      wordCountStatus = 'very_thin'
      issues.push(`Very thin content (${pageType.type} page: under ${veryThin} words, aim for ${t.minimum}+)`)
    } else if (wordCount < thin) {
      score -= 2
      wordCountStatus = 'thin'
      issues.push(`Thin content (${pageType.type} page: under ${thin} words, aim for ${t.minimum}+)`)
    } else if (wordCount < t.minimum) {
      score -= 1
      wordCountStatus = 'below_average'
      issues.push(`Content could be more substantial (${pageType.type} page: under ${t.minimum} words)`)
    } else if (wordCount >= t.excellent) {
      wordCountStatus = 'comprehensive'
    } else if (wordCount >= t.recommended) {
      wordCountStatus = 'good'
    }

    // Document-wide, as in the extension
    const paragraphCount = doc.querySelectorAll('p').filter(p => p.innerText.trim().length > 50).length
    if (paragraphCount < 3 && wordCount > 200) {
      score -= 0.5
      issues.push('Poor paragraph structure (fewer than 3 paragraphs over 50 characters)')
    }

    if (wordCount < 50) {
      score = Math.min(score, 1)
      issues.push('Page has minimal content (under 50 words) - may be an empty shell or loading state')
    }

    const finalScore = Math.max(0, Math.round(score * 10) / 10)
    const message = wordCount >= t.minimum && issues.length === 0
      ? `Good content quality: ${wordCount} words (${pageType.type} page)`
      : wordCount >= veryThin
        ? `${wordCount} words (${pageType.type} page) - needs improvement`
        : `Thin content: only ${wordCount} words (${pageType.type} page)`

    const findings = issues.map(message => ({ file, line, message }))
    if (!selector && issues.length) {
      findings.push({ file, line: doc.body?.line ?? 1, message: 'No <main> or <article> wrapper: boilerplate may be counted as content' })
    }

    return {
      score: finalScore,
      message,
      findings,
      recommendation: issues.length
        ? `Expand the main content to at least ${t.minimum} words (${pageType.type} page), split it into 3+ real <p> paragraphs, and wrap it in <main> or <article>.`
        : '',
      details: {
        wordCount,
        wordCountStatus,
        pageType: pageType.type,
        pageTypeSource: pageType.source,
        thresholds: t,
        paragraphCount,
        mainSelector: selector,
        usedFallback: !selector,
        listCount: doc.querySelectorAll('ul, ol').length,
        headingCount: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length
      }
    }
  }
}
