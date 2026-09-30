// agent-readiness.controls - port of the extension's agent-controls-checker.js (4 pts)
// Four categories, one point each: buttons, links, fake clickables, autocomplete.

const BUTTONS = 'button, [role="button"], input[type="submit" i], input[type="button" i], input[type="reset" i], input[type="image" i]'
const FAKE_CLICKABLES = 'div[onclick], span[onclick], li[onclick], p[onclick], img[onclick], td[onclick]'
const AUTOCOMPLETE_SKIP_TYPES = ['hidden', 'password', 'search', 'checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'image', 'range', 'color']

// Divergence: personal-data field names are matched as whole tokens of the
// name/id (split on - _ space digits and camelCase), so name="name" and
// "emailAddress" are candidates while "statement" or "cityscape" are not.
const PERSONAL_TOKENS = new Set([
  'fname', 'firstname', 'lname', 'lastname', 'fullname', 'surname', 'name', 'address', 'street',
  'city', 'zip', 'zipcode', 'postal', 'postalcode', 'postcode', 'phone', 'tel', 'email', 'country',
  'state', 'company', 'organization'
])

export function isPersonalField(identifier) {
  const tokens = identifier.split(/[-_\s\d]+|(?<=[a-z])(?=[A-Z])/).map(t => t.toLowerCase()).filter(Boolean)
  if (tokens.some(t => PERSONAL_TOKENS.has(t))) return true
  // "first-name", "last_name", "postal-code" as two tokens
  for (let i = 0; i < tokens.length - 1; i++) {
    if (PERSONAL_TOKENS.has(tokens[i] + tokens[i + 1])) return true
  }
  return false
}

const isHidden = el => !!el.closest('[hidden], [aria-hidden="true"]')

function accessibleName(el, doc) {
  const aria = el.getAttribute('aria-label')
  if (aria && aria.trim()) return aria.trim()
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map(id => doc.getElementById(id)?.textContent.trim() || '').filter(Boolean).join(' ')
    if (text) return text
  }
  const text = el.textContent.trim()
  if (text) return text
  for (const attr of ['title', 'value', 'alt']) {
    const v = el.getAttribute(attr)
    if (v && v.trim()) return v.trim()
  }
  const img = el.querySelector('img[alt]')
  if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim()
  const svgTitle = el.querySelector('svg > title')
  if (svgTitle && svgTitle.textContent.trim()) return svgTitle.textContent.trim()
  if (el.localName === 'input') {
    const type = (el.getAttribute('type') || '').toLowerCase()
    if (type === 'submit' || type === 'reset') return type
  }
  return ''
}

function isNative(el) {
  if (['button', 'input', 'select', 'textarea', 'summary'].includes(el.localName)) return true
  return el.localName === 'a' && el.hasAttribute('href')
}

const snippet = el => {
  const html = el.outerHTML
  return html.length > 120 ? `${html.slice(0, 120)}...` : html
}

function analyze(elements, problemOf) {
  const problems = []
  for (const el of elements) {
    const reason = problemOf(el)
    if (reason) problems.push({ el, reason })
  }
  return { total: elements.length, problems }
}

export default {
  id: 'agent-readiness.controls',
  scope: 'page',
  run({ page }) {
    const { doc, file } = page

    const buttons = analyze(doc.querySelectorAll(BUTTONS).filter(el => !isHidden(el)), el => {
      const reasons = []
      if (!accessibleName(el, doc)) reasons.push('no accessible name')
      if (el.getAttribute('role') === 'button' && !isNative(el) && !el.hasAttribute('tabindex')) reasons.push('not focusable')
      return reasons.join(', ')
    })

    const links = analyze(doc.querySelectorAll('a').filter(el => el.getAttribute('role') !== 'button' && !isHidden(el)), el => {
      const href = el.getAttribute('href')
      const h = href === null ? '' : href.trim()
      if (!(href === null || h === '' || h === '#' || /^javascript:/i.test(h))) return ''
      if (el.hasAttribute('aria-haspopup') || el.hasAttribute('aria-expanded')) return ''
      if ((el.hasAttribute('name') || el.hasAttribute('id')) && !el.textContent.trim() && !el.hasAttribute('onclick')) return ''
      return href === null ? 'no href' : `placeholder href "${h}"`
    })

    // Divergence: only role="button" elements are left to the button
    // category; any other role (e.g. presentation) no longer exempts a
    // div with an inline click handler.
    const fake = analyze(doc.querySelectorAll(FAKE_CLICKABLES).filter(el => el.getAttribute('role') !== 'button' && !isHidden(el)), el =>
      el.hasAttribute('tabindex') ? '' : 'click handler on a non-interactive element')

    const candidates = doc.querySelectorAll('input').filter(el => {
      if (isHidden(el)) return false
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      if (AUTOCOMPLETE_SKIP_TYPES.includes(type)) return false
      if (type === 'email' || type === 'tel') return true
      return isPersonalField(`${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''}`)
    })
    const autocomplete = analyze(candidates, el => {
      const ac = (el.getAttribute('autocomplete') || '').trim().toLowerCase()
      return ac && ac !== 'off' ? '' : 'missing autocomplete'
    })

    const categories = { buttons, links, fakeClickables: fake, autocomplete }
    const issueText = {
      buttons: c => `${c.problems.length} of ${c.total} buttons have no accessible name or cannot be focused`,
      links: c => `${c.problems.length} of ${c.total} links do not navigate anywhere (missing or placeholder href)`,
      fakeClickables: c => `${c.problems.length} non-interactive elements carry click handlers instead of being buttons`,
      autocomplete: c => `${c.problems.length} of ${c.total} personal-data inputs are missing an autocomplete attribute`
    }
    const findingText = {
      buttons: r => `Button agents cannot use (${r})`,
      links: r => `Link that does not navigate (${r}); use a real href or a <button>`,
      fakeClickables: () => 'Inline onclick on a non-interactive element without tabindex; use a <button>',
      autocomplete: () => 'Personal-data input without an autocomplete attribute'
    }
    const fixText = {
      buttons: 'give every button a text label, aria-label or image alt, and make custom buttons focusable with tabindex="0"',
      links: 'give links a real href and use <button> for in-page actions',
      fakeClickables: 'replace div/span click handlers with <button> elements',
      autocomplete: 'add autocomplete attributes (email, tel, name, street-address) to personal-data inputs'
    }

    let score = 0
    const issues = []
    const fixes = []
    const findings = []
    const summary = {}
    for (const [key, c] of Object.entries(categories)) {
      const percentage = c.total ? Math.round(((c.total - c.problems.length) / c.total) * 100) : null
      summary[key] = { total: c.total, problems: c.problems.length, percentage, samples: c.problems.slice(0, 5).map(p => `${snippet(p.el)} (${p.reason})`) }
      if (c.total === 0 || percentage >= 90) {
        score += 1
        continue
      }
      issues.push(issueText[key](c))
      fixes.push(fixText[key])
      for (const p of c.problems) findings.push({ file, line: p.el.line, message: findingText[key](p.reason) })
    }

    const totalProblems = Object.values(categories).reduce((s, c) => s + c.problems.length, 0)
    const anyElements = Object.values(categories).some(c => c.total > 0)
    const message = !anyElements
      ? 'No interactive controls found on this page'
      : totalProblems === 0
        ? 'All interactive controls are usable by agents'
        : `${totalProblems} control${totalProblems === 1 ? '' : 's'} an agent cannot reliably operate`

    return {
      score,
      message,
      findings,
      recommendation: fixes.length ? `${fixes.join('; ')}.`.replace(/^./, c => c.toUpperCase()) : '',
      details: { categories: summary, totalProblems, issues }
    }
  }
}
