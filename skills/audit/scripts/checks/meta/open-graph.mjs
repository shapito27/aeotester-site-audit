// meta.open-graph - port of the extension's opengraph-checker.js (3 pts)

const REQUIRED = ['title', 'description', 'image']
const ALL = ['title', 'description', 'image', 'url', 'type', 'site_name', 'locale']

// Extension's normalizeUrl: protocol//hostname + pathname + search, one trailing
// slash stripped, lowercased. Unparseable input is returned unchanged.
function normalizeUrl(url) {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}${u.pathname}${u.search}`.replace(/\/$/, '').toLowerCase()
  } catch {
    return url
  }
}

function isAbsolute(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export default {
  id: 'meta.open-graph',
  scope: 'page',
  run({ page }) {
    const file = page.file
    const doc = page.doc
    const headLine = doc.head?.line ?? 1
    // Divergence: name="og:*" is accepted as a fallback for property="og:*"
    const els = {}
    const og = {}
    for (const key of ALL) {
      const el = doc.querySelector(`meta[property="og:${key}"]`) || doc.querySelector(`meta[name="og:${key}"]`)
      els[key] = el
      og[key] = el ? (el.getAttribute('content') ?? '') : null
    }

    let score = 3
    const findings = []
    const missing = REQUIRED.filter(k => og[k] === null)
    const empty = REQUIRED.filter(k => og[k] !== null && !og[k].trim())
    for (const k of missing) {
      score -= 0.75
      findings.push({ file, line: headLine, message: `Missing og:${k}` })
    }
    for (const k of empty) {
      score -= 0.75
      findings.push({ file, line: els[k].line, message: `Empty og:${k}` })
    }
    if (og.url === null) {
      score -= 0.25
      findings.push({ file, line: headLine, message: 'Missing og:url' })
    }
    if (og.type === null) {
      score -= 0.25
      findings.push({ file, line: headLine, message: 'Missing og:type (use "website" or "article")' })
    }

    let imageFormat = null
    if (og.image) {
      imageFormat = isAbsolute(og.image) ? 'valid_url' : 'invalid_url'
      // Reported, not scored (same as the extension)
      if (imageFormat === 'invalid_url') findings.push({ file, line: els.image.line, message: 'og:image is not an absolute URL' })
    }

    let urlMatchesCanonical = null
    const canonicalEl = doc.querySelector('link[rel="canonical"]')
    const canonicalHref = canonicalEl?.getAttribute('href')?.trim()
    if (og.url && canonicalHref) {
      // The browser resolves canonical.href against the page URL. Without a known
      // base URL, resolve a relative canonical against og:url's origin instead.
      const base = !page.hasRealUrl && isAbsolute(og.url) ? og.url : page.url
      let canonical = canonicalHref
      try {
        canonical = new URL(canonicalHref, base).href
      } catch {
        // keep the raw value, it will not match
      }
      urlMatchesCanonical = normalizeUrl(og.url) === normalizeUrl(canonical)
      if (!urlMatchesCanonical) {
        score -= 0.25
        findings.push({ file, line: els.url.line, message: 'og:url does not match the canonical URL' })
      }
    }

    const present = Object.values(og).filter(v => v !== null).length
    const lost = missing.length || empty.length || og.url === null || og.type === null || urlMatchesCanonical === false
    let message
    if (!missing.length && !empty.length) message = `Open Graph: ${present}/${ALL.length} tags present`
    else if (!missing.length) message = `Open Graph: ${empty.length} empty required tag(s)`
    else message = `Missing ${missing.length} required OG tag(s)`

    return {
      score: Math.max(0, score),
      message,
      findings,
      recommendation: lost || imageFormat === 'invalid_url'
        ? 'Add og:title, og:description, og:image (absolute URL), og:type and og:url (equal to the canonical URL) as <meta property="og:..."> in the shared head.'
        : '',
      details: {
        tags: og,
        presentCount: present,
        missingRequired: missing.map(k => `og:${k}`),
        emptyRequired: empty.map(k => `og:${k}`),
        imageFormat,
        canonical: canonicalHref || null,
        urlMatchesCanonical
      }
    }
  }
}
