// content.accessibility - port of the extension's accessibility-checker.js (4 pts)

const SEMANTIC = ['main', 'nav', 'article', 'section', 'aside', 'header', 'footer', 'figure', 'figcaption']
const ARIA = {
  roleMain: '[role="main"]',
  roleNavigation: '[role="navigation"]',
  roleBanner: '[role="banner"]',
  roleContentinfo: '[role="contentinfo"]',
  roleSearch: '[role="search"]',
  roleComplementary: '[role="complementary"]',
  ariaLabel: '[aria-label]',
  ariaLabelledby: '[aria-labelledby]',
  ariaDescribedby: '[aria-describedby]'
}
// Divergence: buttons are named by their value / default label, so they are
// not form fields that need a <label>.
const BUTTON_TYPES = new Set(['submit', 'button', 'reset', 'image'])

export default {
  id: 'content.accessibility',
  scope: 'page',
  run({ page }) {
    const { doc, file } = page
    const bodyLine = doc.body?.line ?? 1
    const semanticElements = Object.fromEntries(SEMANTIC.map(t => [t, doc.querySelectorAll(t).length]))
    const semanticCount = Object.values(semanticElements).reduce((a, b) => a + b, 0)
    const hasMain = semanticElements.main > 0 || !!doc.querySelector('[role="main"]')
    const hasNav = semanticElements.nav > 0 || !!doc.querySelector('[role="navigation"]')

    let score = 4
    const findings = []
    const issues = []
    if (!hasMain) {
      score -= 1.75
      issues.push('main')
      findings.push({ file, line: bodyLine, message: 'Missing <main> element or role="main"' })
    }
    if (!hasNav) {
      score -= 0.75
      issues.push('nav')
      findings.push({ file, line: bodyLine, message: 'Missing <nav> element or role="navigation"' })
    }

    // Labels are matched by attribute value, so odd ids cannot break a selector
    const labelFor = new Set(doc.querySelectorAll('label[for]').map(l => l.getAttribute('for')))
    const inputs = doc.querySelectorAll('input:not([type="hidden" i]), textarea, select')
      .filter(el => !(el.localName === 'input' && BUTTON_TYPES.has((el.getAttribute('type') || '').toLowerCase())))
    const unlabelled = inputs.filter(el => {
      const id = el.getAttribute('id')
      if (id && labelFor.has(id)) return false
      if (el.getAttribute('aria-label')) return false
      if (el.getAttribute('aria-labelledby')) return false
      if (el.closest('label')) return false
      return true
    })
    let labelPercentage = null
    let formAccessibility = 'good'
    if (inputs.length) {
      labelPercentage = Math.round(((inputs.length - unlabelled.length) / inputs.length) * 100)
      if (labelPercentage < 50) {
        score -= 0.75
        formAccessibility = 'poor'
        issues.push('labels')
        for (const el of unlabelled) findings.push({ file, line: el.line, message: `Form <${el.localName}> has no label (label[for], aria-label, aria-labelledby or wrapping <label>)` })
      } else if (labelPercentage < 100) {
        formAccessibility = 'partial'
      }
    }

    if (semanticCount < 5 && !hasMain) {
      score -= 0.75
      issues.push('semantic')
      findings.push({ file, line: bodyLine, message: 'Fewer than 5 semantic elements (main, nav, article, section, aside, header, footer, figure, figcaption)' })
    }

    const ariaElements = Object.fromEntries(Object.entries(ARIA).map(([k, sel]) => [k, doc.querySelectorAll(sel).length]))
    const ariaCount = Object.values(ariaElements).reduce((a, b) => a + b, 0)
    const hasSkipLink = !!doc.querySelector('a[href^="#main"], a[href^="#content"], .skip-link, .skip-to-content')

    let message
    if (hasMain && semanticCount >= 5) message = `Good accessibility: ${semanticCount} semantic elements${ariaCount ? `, ${ariaCount} ARIA attributes` : ''}`
    else if (hasMain) message = `Basic accessibility: has <main>, ${semanticCount} semantic elements`
    else message = `Needs improvement: ${semanticCount} semantic elements, missing <main>`

    const recs = []
    if (!hasMain) recs.push('wrap the primary content in <main>')
    if (!hasNav) recs.push('wrap site navigation in <nav>')
    if (issues.includes('labels')) recs.push('add <label for> or aria-label to form inputs')

    return {
      score: Math.max(0, Math.round(score * 10) / 10),
      message,
      findings,
      recommendation: recs.length ? `In the base layout, ${recs.join(', ')}.` : '',
      details: {
        semanticElements,
        semanticCount,
        ariaElements,
        ariaCount,
        hasMain,
        hasNav,
        hasSkipLink,
        formCount: doc.querySelectorAll('form').length,
        inputCount: inputs.length,
        labelPercentage,
        formAccessibility
      }
    }
  }
}
