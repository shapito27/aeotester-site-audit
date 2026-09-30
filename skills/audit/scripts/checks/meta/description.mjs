// meta.description - port of the extension's meta-description-checker.js (5 pts)

const GENERIC = [
  /^welcome to/i, /^this is a/i, /^this page/i, /^description$/i, /^lorem ipsum/i, /^todo/i,
  /^placeholder/i, /^my website/i, /^my blog/i, /^my site/i, /^about us$/i, /^contact us$/i,
  /^contact$/i, /^services$/i, /^products$/i, /^home page/i, /^homepage$/i, /^default description/i,
  /^add description here/i, /^enter description/i, /^website description/i, /^page description/i
]
const CTA = /\b(learn|discover|find|get|see|read|explore|check|try|start)\b/i
const RECOMMENDATION = 'Write a unique, specific meta description of 120-160 characters that summarizes the page (not a copy of the title).'

export default {
  id: 'meta.description',
  scope: 'page',
  run({ page }) {
    const file = page.file
    // Divergence: the name match is case-insensitive (name="Description" counts)
    const el = page.doc.querySelector('meta[name="description" i]')
    const headLine = page.doc.head?.line ?? 1

    if (!el) {
      return {
        score: 0,
        message: 'No meta description found',
        findings: [{ file, line: headLine, message: 'Missing <meta name="description">' }],
        recommendation: RECOMMENDATION,
        details: { present: false, value: null, length: 0 }
      }
    }

    const line = el.line
    const description = el.getAttribute('content') ?? ''
    const trimmed = description.trim()
    const len = trimmed.length
    if (len === 0) {
      return {
        score: 0,
        message: 'Meta description is empty',
        findings: [{ file, line, message: 'Empty <meta name="description">' }],
        recommendation: RECOMMENDATION,
        details: { present: true, value: description, length: 0 }
      }
    }

    let score = 5
    const issues = []
    let lengthStatus = 'optimal'
    if (len < 70) {
      score -= 2
      lengthStatus = 'too_short'
      issues.push('Description too short (under 70 chars, optimal 120-160)')
    } else if (len < 120) {
      score -= 1
      lengthStatus = 'short'
      issues.push('Description could be longer (70-119 chars, optimal 120-160)')
    } else if (len > 170) {
      score -= 1
      lengthStatus = 'too_long'
      issues.push('Description too long (over 170 chars, may be truncated)')
    } else if (len > 160) {
      score -= 0.5
      lengthStatus = 'long'
      issues.push('Description slightly long (161-170 chars, optimal 120-160)')
    }

    const isGeneric = GENERIC.some(re => re.test(trimmed))
    if (isGeneric) {
      score -= 2
      issues.push('Description looks generic or placeholder')
    }

    const title = page.doc.title
    const matchesTitle = trimmed.toLowerCase() === title.toLowerCase()
    if (matchesTitle) {
      score -= 1
      issues.push('Description is identical to the title')
    }

    const words = description.toLowerCase().split(/\s+/)
    const counts = {}
    for (const w of words) if (w.length > 3) counts[w] = (counts[w] || 0) + 1
    const maxRepetition = Math.max(0, ...Object.values(counts))
    const stuffed = maxRepetition > 3 && words.length > 10
    if (stuffed) {
      score -= 0.5
      issues.push('Description may be keyword-stuffed')
    }

    return {
      score: Math.max(0, score),
      message: issues.length ? `Description: ${len} chars - ${issues.length} issue(s)` : `Description OK (${len} chars)`,
      findings: issues.map(message => ({ file, line, message })),
      recommendation: issues.length ? RECOMMENDATION : '',
      details: { present: true, value: description, length: len, lengthStatus, isGeneric, matchesTitle, keywordStuffing: stuffed, hasCta: CTA.test(description) }
    }
  }
}
