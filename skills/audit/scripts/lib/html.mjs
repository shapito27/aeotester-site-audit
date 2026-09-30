// Minimal, dependency-free HTML parser with a small DOM and CSS selector engine.
//
// It is not a spec-compliant HTML5 parser. It is tolerant enough for real site
// HTML (unclosed <p>/<li>, void elements, raw-text <script>/<style>, comments,
// entities) and records the source line of every element so checks can report
// file:line. The DOM surface is the subset the AEO checks need.

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
])
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript', 'template'])
const ESCAPABLE_RAW = new Set(['textarea', 'title'])

// Opening one of these tags implicitly closes an open element of the listed kinds
const IMPLIED_END = {
  p: ['p'],
  li: ['li'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  tr: ['tr', 'td', 'th'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  option: ['option'],
  thead: ['tbody', 'tfoot'],
  tbody: ['thead', 'tbody', 'tfoot'],
  tfoot: ['thead', 'tbody']
}
const BLOCK_CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'main', 'menu', 'nav', 'ol', 'pre', 'section', 'table', 'ul'
])
const HEAD_TAGS = new Set(['base', 'link', 'meta', 'script', 'style', 'title', 'noscript', 'template'])

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9',
  reg: '\u00ae', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', bull: '\u2022',
  middot: '\u00b7', laquo: '\u00ab', raquo: '\u00bb', euro: '\u20ac', pound: '\u00a3',
  yen: '\u00a5', cent: '\u00a2', deg: '\u00b0', times: '\u00d7', divide: '\u00f7'
}

export function decodeEntities(text) {
  if (!text || text.indexOf('&') === -1) return text
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named !== undefined ? named : m
  })
}

class Node {
  constructor(type, parent = null) {
    this.nodeType = type
    this.parentNode = parent
    this.childNodes = []
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null
  }

  get textContent() {
    if (this.nodeType === 3) return this.data
    if (this.nodeType === 8) return ''
    let out = ''
    for (const child of this.childNodes) out += child.textContent
    return out
  }
}

export class TextNode extends Node {
  constructor(data, parent, line) {
    super(3, parent)
    this.data = data
    this.line = line
  }
}

class CommentNode extends Node {
  constructor(data, parent, line) {
    super(8, parent)
    this.data = data
    this.line = line
  }
}

export class Element extends Node {
  constructor(tagName, attrs, parent, line) {
    super(1, parent)
    this.localName = tagName
    this.attrs = attrs // Map of lowercase name -> value
    this.line = line
  }

  get tagName() {
    return this.localName.toUpperCase()
  }

  get nodeName() {
    return this.tagName
  }

  get children() {
    return this.childNodes.filter(n => n.nodeType === 1)
  }

  get id() {
    return this.getAttribute('id') || ''
  }

  get className() {
    return this.getAttribute('class') || ''
  }

  get classList() {
    const list = this.className.split(/\s+/).filter(Boolean)
    return { contains: c => list.includes(c), length: list.length, [Symbol.iterator]: () => list[Symbol.iterator]() }
  }

  getAttribute(name) {
    const v = this.attrs.get(name.toLowerCase())
    return v === undefined ? null : v
  }

  hasAttribute(name) {
    return this.attrs.has(name.toLowerCase())
  }

  getAttributeNames() {
    return [...this.attrs.keys()]
  }

  // Approximation of innerText: text content without script/style/template
  // and elements hidden with the hidden attribute or aria-hidden="true".
  get innerText() {
    return visibleText(this)
  }

  get nextElementSibling() {
    if (!this.parentNode) return null
    const siblings = this.parentNode.childNodes
    for (let i = siblings.indexOf(this) + 1; i < siblings.length; i++) {
      if (siblings[i].nodeType === 1) return siblings[i]
    }
    return null
  }

  get previousElementSibling() {
    if (!this.parentNode) return null
    const siblings = this.parentNode.childNodes
    for (let i = siblings.indexOf(this) - 1; i >= 0; i--) {
      if (siblings[i].nodeType === 1) return siblings[i]
    }
    return null
  }

  matches(selector) {
    return parseSelector(selector).some(complex => matchComplex(this, complex))
  }

  closest(selector) {
    const groups = parseSelector(selector)
    for (let el = this; el && el.nodeType === 1; el = el.parentNode) {
      if (groups.some(complex => matchComplex(el, complex))) return el
    }
    return null
  }

  querySelectorAll(selector) {
    const groups = parseSelector(selector)
    const out = []
    walkElements(this, el => {
      if (el !== this && groups.some(complex => matchComplex(el, complex))) out.push(el)
    })
    return out
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }

  getElementsByTagName(name) {
    return this.querySelectorAll(name)
  }

  get outerHTML() {
    return serialize(this)
  }

  get innerHTML() {
    return this.childNodes.map(serialize).join('')
  }
}

export class Document extends Element {
  constructor() {
    super('#document', new Map(), null, 1)
    this.nodeType = 9
  }

  get documentElement() {
    return this.children.find(e => e.localName === 'html') || null
  }

  get head() {
    return this.querySelector('head')
  }

  get body() {
    return this.querySelector('body')
  }

  get title() {
    const t = this.querySelector('title')
    return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''
  }

  getElementById(id) {
    let found = null
    walkElements(this, el => {
      if (!found && el.getAttribute('id') === id) found = el
    })
    return found
  }
}

function walkElements(root, fn) {
  const stack = [...root.childNodes].reverse()
  while (stack.length) {
    const node = stack.pop()
    if (node.nodeType !== 1) continue
    fn(node)
    for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i])
  }
}

const HIDDEN_TEXT_TAGS = new Set(['script', 'style', 'template', 'noscript', 'head', 'title'])
const BLOCK_TEXT = new Set([...BLOCK_CLOSES_P, 'p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'caption', 'body', 'html'])

// skip(el) -> true drops an element and its subtree (e.g. boilerplate regions).
export function visibleText(root, skip = null) {
  let out = ''
  const visit = node => {
    if (node.nodeType === 3) {
      out += node.data
      return
    }
    if (node.nodeType !== 1 && node.nodeType !== 9) return
    if (node.nodeType === 1) {
      if (HIDDEN_TEXT_TAGS.has(node.localName)) return
      if (skip && node !== root && skip(node)) return
      if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return
      if (/display\s*:\s*none/i.test(node.getAttribute('style') || '')) return
      if (node.localName === 'br') out += '\n'
    }
    for (const child of node.childNodes) visit(child)
    if (node.nodeType === 1 && BLOCK_TEXT.has(node.localName)) out += '\n'
  }
  visit(root)
  return out
}

function serialize(node) {
  if (node.nodeType === 3) return node.data
  if (node.nodeType === 8) return `<!--${node.data}-->`
  const attrs = [...node.attrs].map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v.replace(/"/g, '&quot;')}"`)).join('')
  if (VOID.has(node.localName)) return `<${node.localName}${attrs}>`
  return `<${node.localName}${attrs}>${node.childNodes.map(serialize).join('')}</${node.localName}>`
}

// ---------------------------------------------------------------------------
// Parser

export function parseHTML(html) {
  const doc = new Document()
  const len = html.length
  let pos = 0
  let line = 1
  const stack = [doc]
  const current = () => stack[stack.length - 1]

  const advance = to => {
    for (let i = pos; i < to; i++) if (html.charCodeAt(i) === 10) line++
    pos = to
  }

  const appendText = (text, atLine) => {
    if (!text) return
    const parent = current()
    const last = parent.childNodes[parent.childNodes.length - 1]
    if (last && last.nodeType === 3) last.data += text
    else parent.childNodes.push(new TextNode(text, parent, atLine))
  }

  const closeTo = name => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].localName === name) {
        stack.length = i
        return true
      }
    }
    return false
  }

  const hasOpen = name => stack.some(el => el.localName === name)

  while (pos < len) {
    const lt = html.indexOf('<', pos)
    if (lt === -1) {
      const startLine = line
      const text = html.slice(pos)
      advance(len)
      appendText(decodeEntities(text), startLine)
      break
    }
    if (lt > pos) {
      const startLine = line
      const text = html.slice(pos, lt)
      advance(lt)
      appendText(decodeEntities(text), startLine)
    }

    // Comment
    if (html.startsWith('<!--', pos)) {
      const end = html.indexOf('-->', pos + 4)
      const stop = end === -1 ? len : end + 3
      const startLine = line
      const data = html.slice(pos + 4, end === -1 ? len : end)
      advance(stop)
      current().childNodes.push(new CommentNode(data, current(), startLine))
      continue
    }
    // Doctype, CDATA, processing instruction
    if (html[pos + 1] === '!' || html[pos + 1] === '?') {
      const end = html.indexOf('>', pos)
      advance(end === -1 ? len : end + 1)
      continue
    }
    // End tag
    if (html[pos + 1] === '/') {
      const m = /^<\/([a-zA-Z][\w:-]*)[^>]*>/.exec(html.slice(pos, pos + 200))
      if (!m) {
        appendText('<', line)
        advance(pos + 1)
        continue
      }
      advance(pos + m[0].length)
      const name = m[1].toLowerCase()
      if (name === 'p' && !hasOpen('p')) continue
      closeTo(name)
      continue
    }
    // Start tag
    const tag = readStartTag(html, pos)
    if (!tag) {
      appendText('<', line)
      advance(pos + 1)
      continue
    }
    const startLine = line
    advance(tag.end)
    const name = tag.name

    // Implicit closes
    const implied = IMPLIED_END[name]
    if (implied) {
      const top = current()
      if (implied.includes(top.localName)) stack.pop()
    }
    if (BLOCK_CLOSES_P.has(name) && current().localName === 'p') stack.pop()
    if (name === 'html' && stack.length > 1) continue
    if ((name === 'head' || name === 'body') && hasOpen(name)) continue
    if (name === 'body' && hasOpen('head')) closeTo('head')
    if (hasOpen('head') && !HEAD_TAGS.has(name) && name !== 'head') closeTo('head')

    const parent = current()
    const el = new Element(name, tag.attrs, parent, startLine)
    parent.childNodes.push(el)

    if (VOID.has(name) || tag.selfClosing) continue

    if (RAW_TEXT.has(name)) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'i')
      const rest = html.slice(pos)
      const m = closeRe.exec(rest)
      const rawEnd = m ? pos + m.index : len
      const textLine = line
      const raw = html.slice(pos, rawEnd)
      advance(rawEnd)
      if (raw) {
        const data = ESCAPABLE_RAW.has(name) ? decodeEntities(raw) : raw
        el.childNodes.push(new TextNode(data, el, textLine))
      }
      if (m) advance(pos + m[0].length)
      continue
    }
    stack.push(el)
  }
  return doc
}

function readStartTag(html, start) {
  const nameMatch = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(start, start + 100))
  if (!nameMatch) return null
  const name = nameMatch[1].toLowerCase()
  const attrs = new Map()
  let i = start + nameMatch[0].length
  const len = html.length
  while (i < len) {
    while (i < len && /\s/.test(html[i])) i++
    if (html[i] === '>') return { name, attrs, end: i + 1, selfClosing: false }
    if (html[i] === '/' && html[i + 1] === '>') return { name, attrs, end: i + 2, selfClosing: true }
    if (html[i] === '/') {
      i++
      continue
    }
    let j = i
    while (j < len && !/[\s=>]/.test(html[j]) && !(html[j] === '/' && html[j + 1] === '>')) j++
    const attrName = html.slice(i, j).toLowerCase()
    i = j
    while (i < len && /\s/.test(html[i])) i++
    let value = ''
    if (html[i] === '=') {
      i++
      while (i < len && /\s/.test(html[i])) i++
      const q = html[i]
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1)
        const stop = close === -1 ? len : close
        value = html.slice(i + 1, stop)
        i = stop + 1
      } else {
        let k = i
        while (k < len && !/[\s>]/.test(html[k])) k++
        value = html.slice(i, k)
        i = k
      }
    }
    if (attrName && !attrs.has(attrName)) attrs.set(attrName, decodeEntities(value))
    if (!attrName) i++
  }
  return { name, attrs, end: len, selfClosing: false }
}

// ---------------------------------------------------------------------------
// Selectors: type, *, #id, .class, [attr], [attr op "value" i], :not(),
// :first-child, descendant and child combinators, and selector lists.

const selectorCache = new Map()

export function parseSelector(selector) {
  if (selectorCache.has(selector)) return selectorCache.get(selector)
  const groups = splitTopLevel(selector, ',').map(s => parseComplex(s.trim()))
  selectorCache.set(selector, groups)
  return groups
}

function splitTopLevel(s, sep) {
  const parts = []
  let depth = 0
  let quote = null
  let buf = ''
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === sep && depth === 0) {
      parts.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  parts.push(buf)
  return parts
}

// Returns [{compound, combinator}] right-to-left friendly list
function parseComplex(s) {
  const parts = []
  let i = 0
  let combinator = null
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) {
      i++
      if (combinator === null && parts.length) combinator = ' '
    }
    if (s[i] === '>' || s[i] === '+' || s[i] === '~') {
      combinator = s[i]
      i++
      continue
    }
    if (i >= s.length) break
    const { compound, end } = parseCompound(s, i)
    parts.push({ compound, combinator: parts.length ? combinator || ' ' : null })
    combinator = null
    i = end
  }
  return parts
}

function parseCompound(s, start) {
  const compound = { tag: null, ids: [], classes: [], attrs: [], nots: [], pseudos: [] }
  let i = start
  const ident = () => {
    let j = i
    while (j < s.length && /[\w-]/.test(s[j])) j++
    const v = s.slice(i, j)
    i = j
    return v
  }
  while (i < s.length && !/[\s>+~,]/.test(s[i])) {
    const ch = s[i]
    if (ch === '*') {
      i++
    } else if (ch === '#') {
      i++
      compound.ids.push(ident())
    } else if (ch === '.') {
      i++
      compound.classes.push(ident())
    } else if (ch === '[') {
      const close = findClose(s, i, '[', ']')
      compound.attrs.push(parseAttr(s.slice(i + 1, close)))
      i = close + 1
    } else if (ch === ':') {
      i++
      const name = ident().toLowerCase()
      if (s[i] === '(') {
        const close = findClose(s, i, '(', ')')
        const arg = s.slice(i + 1, close)
        i = close + 1
        if (name === 'not') compound.nots.push(parseSelector(arg))
        else compound.pseudos.push({ name, arg })
      } else compound.pseudos.push({ name })
    } else {
      compound.tag = ident().toLowerCase()
      if (!compound.tag) throw new Error(`Unsupported selector: ${s}`)
    }
  }
  return { compound, end: i }
}

function findClose(s, start, open, close) {
  let depth = 0
  let quote = null
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === open) depth++
    else if (ch === close && --depth === 0) return i
  }
  throw new Error(`Unbalanced selector: ${s}`)
}

function parseAttr(body) {
  const m = /^\s*([\w:-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*([is])?\s*$/i.exec(body)
  if (!m) throw new Error(`Unsupported attribute selector: [${body}]`)
  return {
    name: m[1].toLowerCase(),
    op: m[2] || null,
    value: m[3] ?? m[4] ?? m[5] ?? null,
    insensitive: (m[6] || '').toLowerCase() === 'i'
  }
}

function matchAttr(el, a) {
  const actual = el.getAttribute(a.name)
  if (actual === null) return false
  if (!a.op) return true
  let v = actual
  let want = a.value
  if (a.insensitive) {
    v = v.toLowerCase()
    want = want.toLowerCase()
  }
  switch (a.op) {
    case '=': return v === want
    case '~=': return v.split(/\s+/).includes(want)
    case '|=': return v === want || v.startsWith(want + '-')
    case '^=': return want !== '' && v.startsWith(want)
    case '$=': return want !== '' && v.endsWith(want)
    case '*=': return want !== '' && v.includes(want)
    default: return false
  }
}

function matchCompound(el, c) {
  if (el.nodeType !== 1) return false
  if (c.tag && el.localName !== c.tag) return false
  for (const id of c.ids) if (el.getAttribute('id') !== id) return false
  if (c.classes.length) {
    const list = (el.getAttribute('class') || '').split(/\s+/)
    for (const cls of c.classes) if (!list.includes(cls)) return false
  }
  for (const a of c.attrs) if (!matchAttr(el, a)) return false
  for (const not of c.nots) if (not.some(complex => matchComplex(el, complex))) return false
  for (const p of c.pseudos) {
    if (p.name === 'first-child' && el.previousElementSibling) return false
    else if (p.name === 'last-child' && el.nextElementSibling) return false
    else if (!['first-child', 'last-child'].includes(p.name)) throw new Error(`Unsupported pseudo-class :${p.name}`)
  }
  return true
}

function matchComplex(el, parts, index = parts.length - 1) {
  if (!matchCompound(el, parts[index].compound)) return false
  if (index === 0) return true
  const combinator = parts[index].combinator
  if (combinator === '>') {
    const parent = el.parentElement
    return !!parent && matchComplex(parent, parts, index - 1)
  }
  if (combinator === '+') {
    const prev = el.previousElementSibling
    return !!prev && matchComplex(prev, parts, index - 1)
  }
  if (combinator === '~') {
    for (let p = el.previousElementSibling; p; p = p.previousElementSibling) {
      if (matchComplex(p, parts, index - 1)) return true
    }
    return false
  }
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (matchComplex(p, parts, index - 1)) return true
  }
  return false
}
