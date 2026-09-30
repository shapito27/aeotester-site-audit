// meta.twitter-cards - port of the extension's twitter-cards-checker.js (3 pts)

const REQUIRED = ['card', 'title', 'description']
const ALL = ['card', 'title', 'description', 'image', 'site', 'creator']
const VALID_CARDS = ['summary', 'summary_large_image', 'app', 'player']
const RECOMMENDATION = 'Add twitter:card (summary_large_image), twitter:title, twitter:description and twitter:image to the shared head, filled from the same values as the title, description and og:image.'

function metaContent(doc, key, attrs) {
  for (const attr of attrs) {
    const el = doc.querySelector(`meta[${attr}="${key}"]`)
    if (el) return { el, value: el.getAttribute('content') ?? '' }
  }
  return { el: null, value: null }
}

export default {
  id: 'meta.twitter-cards',
  scope: 'page',
  run({ page }) {
    const file = page.file
    const doc = page.doc
    const headLine = doc.head?.line ?? 1
    const els = {}
    const tw = {}
    for (const key of ALL) {
      const r = metaContent(doc, `twitter:${key}`, ['name', 'property'])
      els[key] = r.el
      tw[key] = r.value
    }
    // Divergence: OG fallback also accepts name="og:*" (matches meta.open-graph)
    const og = {}
    for (const key of ['title', 'description', 'image']) og[key] = metaContent(doc, `og:${key}`, ['property', 'name']).value

    const hasAnyTwitter = ['card', 'title', 'description', 'image'].some(k => tw[k] !== null)
    const hasOgFallback = !!(og.title || og.description || og.image)
    if (!hasAnyTwitter && hasOgFallback) {
      return {
        score: 2,
        message: 'Using Open Graph fallback (no Twitter-specific tags)',
        findings: [{ file, line: headLine, message: 'No twitter:* tags (X falls back to Open Graph)' }],
        recommendation: RECOMMENDATION,
        details: { tags: tw, usingOgFallback: true, cardType: null }
      }
    }

    let score = 3
    const findings = []
    const missing = REQUIRED.filter(k => tw[k] === null)
    const empty = REQUIRED.filter(k => tw[k] !== null && !tw[k].trim())
    for (const k of missing) {
      score -= 0.75
      findings.push({ file, line: headLine, message: `Missing twitter:${k}` })
    }
    for (const k of empty) {
      score -= 0.75
      findings.push({ file, line: els[k].line, message: `Empty twitter:${k}` })
    }
    // Only a missing image is penalized, not an empty one (same as the extension)
    if (tw.image === null) {
      score -= 0.5
      findings.push({ file, line: headLine, message: 'Missing twitter:image' })
    }
    const invalidCard = !!tw.card && !VALID_CARDS.includes(tw.card)
    if (invalidCard) {
      score -= 0.25
      findings.push({ file, line: els.card.line, message: `Invalid twitter:card type "${tw.card}" (use ${VALID_CARDS.join(', ')})` })
    }

    const present = Object.values(tw).filter(v => v !== null).length
    let message
    if (!missing.length && !empty.length) message = `Twitter Cards: ${present}/${ALL.length} tags present${tw.card ? ` (${tw.card})` : ''}`
    else if (!missing.length) message = `Twitter Cards: ${empty.length} empty required tag(s)`
    else message = `Missing ${missing.length} required Twitter tag(s)`

    return {
      score: Math.max(0, score),
      message,
      findings,
      recommendation: findings.length ? RECOMMENDATION : '',
      details: {
        tags: tw,
        presentCount: present,
        missingRequired: missing.map(k => `twitter:${k}`),
        emptyRequired: empty.map(k => `twitter:${k}`),
        cardType: tw.card,
        usingOgFallback: false,
        fallbackInfo: {
          titleFallback: tw.title === null && !!og.title,
          descriptionFallback: tw.description === null && !!og.description,
          imageFallback: tw.image === null && !!og.image
        }
      }
    }
  }
}
