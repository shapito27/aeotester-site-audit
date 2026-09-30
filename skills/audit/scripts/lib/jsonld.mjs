// JSON-LD extraction shared by the structured data, schema validation,
// author, freshness and content quality checks.

// Returns { blocks: [{ el, line, data, error, templated }], nodes: [{ node, types, line, path }] }
// nodes includes every object with an @type, at any depth, including @graph
// members. Each node appears once (by identity), even when referenced twice.
// With { templates: true }, a block that holds
// template tags ({{ }}, {% %}, <% %>, <? ?>) is parsed with the tags replaced
// by TEMPLATE_PLACEHOLDER; templated is true for such blocks (data is null
// when it does not parse either way).
export function extractJsonLd(doc, { templates = false } = {}) {
  const blocks = []
  for (const el of doc.querySelectorAll('script[type="application/ld+json" i]')) {
    const text = el.textContent.trim()
    if (!text) {
      blocks.push({ el, line: el.line, data: null, error: 'empty block', templated: false })
      continue
    }
    if (templates && hasTemplateSyntax(text)) {
      try {
        blocks.push({ el, line: el.line, data: JSON.parse(substituteTemplates(text)), error: null, templated: true })
        continue
      } catch {
        // fall through to a plain parse
      }
    }
    try {
      blocks.push({ el, line: el.line, data: JSON.parse(text), error: null, templated: false })
    } catch (err) {
      blocks.push({ el, line: el.line, data: null, error: err.message, templated: templates && hasTemplateSyntax(text) })
    }
  }

  const nodes = []
  const seen = new Set()
  const visit = (value, line, path, depth) => {
    if (depth > 12 || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, line, `${path}[${i}]`, depth + 1))
      return
    }
    if (seen.has(value)) return
    seen.add(value)
    if (value['@type']) nodes.push({ node: value, types: typesOf(value), line, path, topLevel: depth <= 2 })
    for (const [k, v] of Object.entries(value)) {
      if (k === '@context') continue
      visit(v, line, `${path}.${k}`, depth + 1)
    }
  }
  for (const b of blocks) if (b.data) visit(b.data, b.line, '$', 0)
  return { blocks, nodes }
}

export function typesOf(node) {
  const t = node?.['@type']
  const list = Array.isArray(t) ? t : t ? [t] : []
  return list.map(x => String(x).replace(/^https?:\/\/schema\.org\//, ''))
}

export function hasType(node, type) {
  return typesOf(node).includes(type)
}

// Resolves { "@id": "..." } references against nodes that define that @id
export function resolver(nodes) {
  const byId = new Map()
  for (const { node } of nodes) if (node['@id'] && Object.keys(node).length > 1) byId.set(node['@id'], node)
  return value => {
    if (value && typeof value === 'object' && !Array.isArray(value) && value['@id'] && Object.keys(value).length === 1) {
      return byId.get(value['@id']) || value
    }
    return value
  }
}

// Template tags left in unbuilt source (Jekyll/Liquid, Nunjucks, ERB, PHP)
export const TEMPLATE_PLACEHOLDER = '__template__'
const TEMPLATE_TAG = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|<%[\s\S]*?%>|<\?[\s\S]*?\?>/y

export function hasTemplateSyntax(text) {
  return /\{\{|\{%|<%|<\?/.test(text)
}

// Output tags become the placeholder (quoted when outside a JSON string);
// control tags ({% if %}, <% code %>) are dropped.
export function substituteTemplates(text) {
  let out = ''
  let inStr = false
  for (let i = 0; i < text.length;) {
    TEMPLATE_TAG.lastIndex = i
    const m = TEMPLATE_TAG.exec(text)
    if (m) {
      const control = m[0].startsWith('{%') || (m[0].startsWith('<%') && !m[0].startsWith('<%='))
      if (!control) out += inStr ? TEMPLATE_PLACEHOLDER : `"${TEMPLATE_PLACEHOLDER}"`
      i += m[0].length
      continue
    }
    const c = text[i]
    if (inStr && c === '\\') {
      out += c + (text[i + 1] ?? '')
      i += 2
      continue
    }
    if (c === '"') inStr = !inStr
    out += c
    i++
  }
  return out
}
