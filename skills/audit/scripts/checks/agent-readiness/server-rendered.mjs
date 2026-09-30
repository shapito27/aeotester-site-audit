// agent-readiness.server-rendered - port of the extension's server-rendered-checker.js (6 pts)
//
// The extension diffs the raw HTML response against the rendered DOM. The
// repo holds only the built HTML, which is exactly what a non-JS agent gets,
// so this evaluates the raw HTML on its own: an empty SPA mount with little
// text fails, substantial server text passes. The share of text that client
// JavaScript adds at runtime cannot be measured here.

const APP_ROOT_SELECTORS = ['#root', '#app', '#__next', '#__nuxt', '#___gatsby', '#svelte', '#q-app', '[data-reactroot]']
const NON_CONTENT = new Set(['script', 'style', 'noscript', 'template', 'svg'])

// textContent without non-content subtrees, as the extension counts words
function contentText(root) {
  if (!root) return ''
  let out = ''
  const visit = node => {
    if (node.nodeType === 3) {
      out += node.data + ' '
      return
    }
    if (node.nodeType === 1 && NON_CONTENT.has(node.localName)) return
    for (const c of node.childNodes) visit(c)
  }
  visit(root)
  return out
}

const countWords = text => text.split(/\s+/).filter(Boolean).length

// Word counts below which the raw HTML is treated as an empty shell
const SHELL_WORDS = 50
const PARTIAL_WORDS = 150

function clientScripts(doc) {
  return doc.querySelectorAll('script').filter(s => {
    const type = (s.getAttribute('type') || '').toLowerCase()
    if (type && !/^(module|text\/javascript|application\/javascript)$/.test(type)) return false
    return s.hasAttribute('src') || s.textContent.trim().length > 0
  })
}

export default {
  id: 'agent-readiness.server-rendered',
  scope: 'page',
  run({ page }) {
    const { doc, file } = page
    const rawWordCount = countWords(contentText(doc.body))
    const scripts = clientScripts(doc)
    const hasClientJs = scripts.length > 0

    // Divergence: every element matching an app-root selector is checked,
    // not just the first one per selector.
    let appRoot = null
    for (const sel of APP_ROOT_SELECTORS) {
      appRoot = doc.querySelectorAll(sel).find(el => el.textContent.trim() === '') || null
      if (appRoot) {
        appRoot = { el: appRoot, selector: sel }
        break
      }
    }

    const findings = []
    const issues = []
    let score = 6
    let predicted = false
    let inconclusive = false

    if (appRoot && rawWordCount < SHELL_WORDS) {
      score = 0
      issues.push('empty-root')
      findings.push({ file, line: appRoot.el.line, message: `Empty app container (${appRoot.selector}) with almost no text in the HTML: the page is rendered by JavaScript` })
    } else if (appRoot && rawWordCount < PARTIAL_WORDS) {
      // Divergence: an empty mount point only zeroes the score when the page
      // is otherwise empty; here the server sends some text but the mount
      // point may hold the main content.
      score = 3
      predicted = true
      issues.push('partial')
      findings.push({ file, line: appRoot.el.line, message: `Empty app container (${appRoot.selector}) next to little server text: main content may only appear after JavaScript runs` })
    } else if (!appRoot && rawWordCount < 30 && hasClientJs) {
      score = 3
      inconclusive = true
      issues.push('near-empty')
      findings.push({ file, line: doc.body?.line ?? 1, message: 'HTML has almost no text and loads scripts: content may be rendered by JavaScript' })
    }

    // Raw HTML lacks the H1 / title. The extension only penalizes this when
    // JavaScript adds them later; from source that is inferred only when the
    // page already looks client-rendered (empty mount point or near-empty body).
    const jsRendered = issues.length > 0
    const h1Missing = jsRendered && !doc.querySelector('h1')
    const titleMissing = jsRendered && !doc.title
    if (h1Missing && score > 0) {
      score -= 1
      predicted = true
      findings.push({ file, line: doc.body?.line ?? 1, message: 'No <h1> in the server HTML (if JavaScript adds one, agents never see it)' })
    }
    if (titleMissing && score > 0) {
      score -= 1
      predicted = true
      findings.push({ file, line: doc.head?.line ?? 1, message: 'No <title> in the server HTML (if JavaScript sets it, agents never see it)' })
    }
    score = Math.max(0, score)

    const message = issues.includes('empty-root')
      ? `Rendered by JavaScript: empty ${appRoot.selector} and ${rawWordCount} words in the HTML`
      : score === 6
        ? `Server-rendered: ${rawWordCount} words in the HTML`
        : `${rawWordCount} words in the server HTML - some content may depend on JavaScript`

    return {
      score,
      predicted,
      inconclusive,
      message,
      findings,
      recommendation: score < 6
        ? 'Serve the main content, <h1> and <title> in the HTML using SSR, static generation or prerendering; most AI crawlers and agents do not run JavaScript. Verify live with curl -s <url>.'
        : '',
      details: {
        rawWordCount,
        appRootEmpty: !!appRoot,
        appRootSelector: appRoot?.selector ?? null,
        h1Missing,
        titleMissing,
        clientScripts: scripts.length,
        runtimeComparison: false,
        note: 'Built HTML is what agents receive; text added by client JavaScript at runtime is not compared.'
      }
    }
  }
}
