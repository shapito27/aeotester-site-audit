// content.headings - port of the extension's heading-analyzer.js (8 pts)

const GENERIC = ['introduction', 'overview', 'welcome', 'about', 'more', 'info', 'content', 'section', 'chapter', 'home']

function isGeneric(text) {
  const t = text.toLowerCase().trim()
  return t.length < 3 || GENERIC.includes(t)
}

export default {
  id: 'content.headings',
  scope: 'page',
  run({ page }) {
    const file = page.file
    const doc = page.doc
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    if (headings.length === 0) {
      return {
        score: 0,
        message: 'No headings found on page',
        findings: [{ file, line: doc.body?.line ?? 1, message: 'Page has no headings (h1-h6)' }],
        recommendation: 'Structure the page with one <h1> for the topic and <h2>/<h3> for its sections.',
        details: { totalHeadings: 0, h1Count: 0, hierarchy: [] }
      }
    }

    let score = 8
    const findings = []
    const recs = []
    const h1s = headings.filter(h => h.localName === 'h1')
    if (h1s.length === 0) {
      score -= 3
      findings.push({ file, line: headings[0].line, message: 'No <h1> on the page' })
      recs.push('add one <h1> naming the page topic')
    } else if (h1s.length > 1) {
      score -= 2
      for (const h of h1s.slice(1)) findings.push({ file, line: h.line, message: 'Additional <h1> (only one per page)' })
      recs.push('keep a single <h1> and demote the others to <h2>')
    }

    const hierarchy = []
    const skips = []
    let lastLevel = 0
    for (const h of headings) {
      const level = Number(h.localName[1])
      const text = h.textContent.replace(/\s+/g, ' ').trim()
      const generic = isGeneric(h.textContent)
      hierarchy.push({ level, tag: h.tagName, text, line: h.line, isGeneric: generic })
      // The first heading is never a skip (lastLevel starts at 0), as in the extension
      if (lastLevel > 0 && level > lastLevel + 1) skips.push({ h, from: lastLevel, level })
      lastLevel = level
    }
    if (skips.length) {
      score -= Math.min(2, skips.length)
      for (const s of skips) findings.push({ file, line: s.h.line, message: `Skipped heading level: H${s.level} after H${s.from}` })
      recs.push('do not skip heading levels (H2 then H3, not H2 then H4)')
    }

    const generic = hierarchy.filter(h => h.isGeneric)
    if (generic.length > 3) {
      score -= 1
      for (const g of generic) findings.push({ file, line: g.line, message: `Generic or very short heading "${g.text}"` })
      recs.push('rename generic headings to say what the section is about')
    }

    const byLevel = {}
    for (let i = 1; i <= 6; i++) byLevel[`h${i}`] = hierarchy.filter(h => h.level === i).length
    const count = findings.length
    return {
      score: Math.max(0, score),
      message: `${headings.length} heading(s), ${count ? `${recs.length} issue(s)` : 'well structured'}`,
      findings,
      recommendation: recs.length ? recs.join('; ').replace(/^./, c => c.toUpperCase()) + '.' : '',
      details: { totalHeadings: headings.length, h1Count: h1s.length, headingsByLevel: byLevel, skippedLevels: skips.length, genericHeadingCount: generic.length, hierarchy }
    }
  }
}
