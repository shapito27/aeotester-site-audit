// meta.title - port of the extension's meta-title-checker.js (5 pts)

const GENERIC = /^(home|welcome|untitled|new page|page|document|index|test|website|my website|my blog|blog|site|my site|homepage)$/i
// Divergence from extension v1.3.1: only standalone separators count, so
// hyphens inside words ("step-by-step") are not treated as separators.
const SEPARATOR = /(?:^|\s)[-|\u2013\u2014\u00b7:](?=\s|$)|:(?=\s)/g

export default {
  id: 'meta.title',
  scope: 'page',
  run({ page }) {
    const el = page.doc.querySelector('title')
    const title = page.doc.title
    const file = page.file
    const line = el?.line ?? page.doc.head?.line ?? 1

    if (title.length === 0) {
      return {
        score: 0,
        message: 'No title tag found',
        findings: [{ file, line, message: el ? 'Empty <title>' : 'Missing <title>' }],
        recommendation: 'Add a unique, descriptive title (50-60 characters) in the form "Page Topic | Brand".'
      }
    }

    let score = 5
    const issues = []
    const len = title.length
    if (len < 40) {
      score -= 2
      issues.push(`Title too short (${len} chars, aim for 50-60)`)
    } else if (len < 50) {
      score -= 0.5
      issues.push(`Title could be longer (${len} chars, optimal 50-60)`)
    } else if (len > 70) {
      score -= 1.5
      issues.push(`Title too long (${len} chars, may be truncated)`)
    } else if (len > 60) {
      score -= 0.5
      issues.push(`Title slightly long (${len} chars, optimal 50-60)`)
    }
    const generic = GENERIC.test(title)
    if (generic) {
      score -= 2
      issues.push(`Generic title "${title}"`)
    }
    const separators = (title.match(SEPARATOR) || []).length
    if (len < 20 && separators === 0) {
      score -= 0.5
      issues.push('Title has no page context (consider "Page Topic | Brand")')
    }
    if (separators > 3) {
      score -= 0.5
      issues.push(`Title has ${separators} separators and may look spammy`)
    }

    return {
      score: Math.max(0, score),
      message: issues.length ? `Title: ${len} chars - ${issues.length} issue(s)` : `Title OK (${len} chars)`,
      findings: issues.map(message => ({ file, line, message: `${message}: "${title}"` })),
      recommendation: issues.length ? 'Rewrite the title to 50-60 characters, specific to the page, as "Page Topic | Brand".' : '',
      details: { value: title, length: len, generic, separators }
    }
  }
}
