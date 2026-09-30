// JSON-LD extraction shared by the structured data, schema validation,
// author, freshness and content quality checks.

// Returns { blocks: [{ el, line, data, error }], nodes: [{ node, types, line, path }] }
// nodes includes every object with an @type, at any depth, including @graph
// members. Each node appears once (by identity), even when referenced twice.
export function extractJsonLd(doc) {
  const blocks = []
  for (const el of doc.querySelectorAll('script[type="application/ld+json" i]')) {
    const text = el.textContent.trim()
    if (!text) {
      blocks.push({ el, line: el.line, data: null, error: 'empty block' })
      continue
    }
    try {
      blocks.push({ el, line: el.line, data: JSON.parse(text), error: null })
    } catch (err) {
      blocks.push({ el, line: el.line, data: null, error: err.message })
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
