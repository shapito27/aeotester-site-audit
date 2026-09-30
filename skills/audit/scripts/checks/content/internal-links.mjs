// content.internal-links - port of the extension's internal-linking-checker.js (4 pts)
// Counts and classifies internal links only. Whether targets exist is the
// job of the separate /aeotester:links skill.

const GENERIC = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'learn more', 'this', 'this link',
  'click', 'go', 'see more', 'view', 'details', 'info'
])

export function isGenericAnchor(text) {
  const t = text.trim().toLowerCase()
  return t.length < 2 || GENERIC.has(t)
}

const stripWww = h => h.toLowerCase().replace(/^www\./, '')

function isInternal(href, pageUrl) {
  if (!href) return false
  if (/^(mailto:|tel:|javascript:|#)/.test(href)) return false
  try {
    const url = new URL(href, pageUrl)
    if (!/^https?:$/.test(url.protocol)) return false
    // Divergence: www and apex are the same site
    return stripWww(url.hostname) === stripWww(new URL(pageUrl).hostname)
  } catch {
    return href.startsWith('/') || !href.includes('://')
  }
}

// Divergence: an image-only link is named by its aria-label, img alt or
// title, as assistive tech and crawlers read it, instead of counting as empty.
function anchorText(a) {
  const text = a.innerText.replace(/\s+/g, ' ').trim()
  if (text) return text
  const aria = (a.getAttribute('aria-label') || '').trim()
  if (aria) return aria
  const img = a.querySelectorAll('img[alt]').map(i => i.getAttribute('alt').trim()).find(Boolean)
  if (img) return img
  return (a.getAttribute('title') || '').trim()
}

export default {
  id: 'content.internal-links',
  scope: 'page',
  run({ page }) {
    const { doc, file } = page
    const links = []
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href').trim()
      if (!isInternal(href, page.url)) continue
      const text = anchorText(a)
      links.push({ href, text, line: a.line, inNav: !!a.closest('nav, header, footer, [role="navigation"]'), generic: isGenericAnchor(text) })
    }
    const content = links.filter(l => !l.inNav)
    const generic = content.filter(l => l.generic)
    const total = links.length

    let score = 4
    const issues = []
    const findings = []
    const bodyLine = doc.body?.line ?? 1
    if (total === 0) {
      score -= 3
      issues.push('No internal links found')
      findings.push({ file, line: bodyLine, message: 'No internal links on the page' })
    } else if (content.length < 3 && total < 5) {
      score -= 1
      issues.push(`Only ${content.length} in-content internal links`)
      findings.push({ file, line: bodyLine, message: 'Fewer than 3 in-content internal links (and under 5 in total)' })
    }
    if (generic.length > 0) {
      score -= Math.min(generic.length * 0.25, 1)
      issues.push(`${generic.length} in-content link(s) with generic anchor text`)
      for (const l of generic) {
        findings.push({ file, line: l.line, message: `Generic anchor text "${l.text || '(empty)'}" on an in-content link` })
      }
    }

    const descriptive = links.filter(l => !l.generic).length
    const descriptivePercentage = total ? Math.round((descriptive / total) * 100) : 0
    const unique = new Set(links.map(l => {
      try {
        return new URL(l.href, page.url).pathname
      } catch {
        return l.href
      }
    }))

    let message = 'No internal links found'
    if (total) {
      message = `${total} internal link${total > 1 ? 's' : ''}${content.length ? ` (${content.length} in content)` : ''}, ${descriptivePercentage}% descriptive`
    }

    return {
      score: Math.max(0, Math.round(score * 10) / 10),
      message,
      findings,
      recommendation: issues.length
        ? 'Add 3+ in-content links to related pages with descriptive anchor text, and replace generic anchors such as "read more" or "click here" with the target page topic.'
        : '',
      details: {
        totalInternalLinks: total,
        contentLinkCount: content.length,
        navigationLinkCount: total - content.length,
        genericLinkCount: generic.length,
        descriptivePercentage,
        uniqueDestinations: unique.size,
        genericExamples: generic.slice(0, 3).map(l => ({ text: l.text || '(empty)', href: l.href, line: l.line }))
      }
    }
  }
}
