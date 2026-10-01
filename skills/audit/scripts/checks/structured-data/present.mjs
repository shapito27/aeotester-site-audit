// structured-data.present - port of the extension's structured-data-checker.js (15 pts)

import { extractJsonLd, resolver } from '../../lib/jsonld.mjs'
import { validateNodes, ORGANIZATION_TYPES, ARTICLE_TYPES } from '../../lib/schema-validator.mjs'
import { isHomepage } from '../../lib/noindex.mjs'

// bucket -> [types, kind]
//
// Plugin divergence from the extension's tier points: a page earns most of the
// points for one main type that fits it (Organization, Article, Product...),
// so Organization plus breadcrumbs passes (12). FAQPage is a bonus for pages
// that actually show questions and answers, not a requirement on every page.
const BUCKETS = [
  ['FAQ', ['FAQPage'], 'faq'],
  ['HowTo', ['HowTo'], 'main'],
  ['Product', ['Product'], 'main'],
  ['Organization', ORGANIZATION_TYPES, 'main'],
  ['Article', ARTICLE_TYPES, 'main'],
  ['VideoObject', ['VideoObject'], 'main'],
  ['Dataset', ['Dataset'], 'main'],
  ['BreadcrumbList', ['BreadcrumbList'], 'support'],
  ['ItemList', ['ItemList'], 'support'],
  ['Person', ['Person'], 'support'],
  // Plugin addition: the standard homepage pairing is Organization + WebSite,
  // where breadcrumbs make no sense. No validator exists for WebSite, so it
  // counts when it names the site (name or url); structured-data.valid is
  // unchanged.
  ['WebSite', ['WebSite'], 'support']
]
const POINTS = {
  base: 4, // at least one JSON-LD block parses
  firstMain: 7, // the first valid main type
  extraMain: 2, // each further valid main type
  invalidMain: 2, // main types present, none valid (once)
  faq: 8, // valid FAQPage
  invalidFaq: 4,
  support: 1 // each valid supporting type
}

// Questions the visitor can see: headings, <summary> and <dt> ending in "?"
export function visibleQuestions(doc) {
  return doc.querySelectorAll('h2, h3, h4, h5, summary, dt').filter(el => /\?\s*$/.test(el.textContent.trim())).length
}

function microdataTypes(doc) {
  const els = doc.querySelectorAll('[itemscope]')
  const types = new Set()
  for (const el of els) {
    const t = el.getAttribute('itemtype')
    if (t) types.add(t.match(/schema\.org\/(\w+)/)?.[1] || t)
  }
  return { found: els.length > 0, count: els.length, types: [...types] }
}

function rdfaTypes(doc) {
  const typed = doc.querySelectorAll('[typeof]')
  const found = typed.length > 0 || doc.querySelectorAll('[vocab]').length > 0
  const types = new Set()
  for (const el of typed) for (const t of (el.getAttribute('typeof') || '').split(/\s+/)) if (t) types.add(t)
  return { found, count: typed.length, types: [...types] }
}

export default {
  id: 'structured-data.present',
  scope: 'page',
  run({ page }) {
    const { doc } = page
    const file = page.file
    const headLine = doc.head?.line ?? 1
    const { blocks, nodes } = extractJsonLd(doc, { templates: true })
    const parsed = blocks.filter(b => b.data)
    const broken = blocks.filter(b => !b.data && !b.templated)
    const unresolved = blocks.filter(b => !b.data && b.templated)
    const microdata = microdataTypes(doc)
    const rdfa = rdfaTypes(doc)
    const brokenFindings = broken.map(b => ({ file, line: b.line, message: 'JSON-LD block is not valid JSON' }))
    const base = { jsonldBlocks: blocks.length, validBlocks: parsed.length, parseErrors: broken.length, templatedBlocks: blocks.filter(b => b.templated).length, microdata, rdfa }

    if (blocks.length === 0 && !microdata.found && !rdfa.found) {
      return {
        score: 0,
        message: 'No structured data found',
        findings: [{ file, line: headLine, message: 'No structured data (JSON-LD, Microdata or RDFa)' }],
        recommendation: 'Add JSON-LD structured data (Organization on every page, plus Article, FAQPage or Product where they fit).',
        details: base
      }
    }

    if (parsed.length === 0) {
      if (microdata.found || rdfa.found) {
        const formats = []
        if (microdata.found) formats.push(`Microdata (${microdata.types.join(', ')})`)
        if (rdfa.found) formats.push(`RDFa (${rdfa.types.join(', ')})`)
        return {
          score: 4,
          message: `Found: ${formats.join(', ')} - consider adding JSON-LD for better AEO`,
          findings: [...brokenFindings, { file, line: headLine, message: 'Structured data uses Microdata/RDFa only, no parseable JSON-LD' }],
          recommendation: 'Convert Microdata/RDFa to JSON-LD, the format AI engines and search engines parse most reliably.',
          details: base
        }
      }
      if (unresolved.length > 0) {
        return {
          score: 8,
          inconclusive: true,
          message: 'JSON-LD is built from template tags and cannot be evaluated from source',
          findings: unresolved.map(b => ({ file, line: b.line, message: 'JSON-LD block contains template tags and could not be parsed from source' })),
          recommendation: 'Build the site and re-run the audit, or check the rendered page, to evaluate this JSON-LD.',
          details: base
        }
      }
      return {
        score: 0,
        message: `${blocks.length} JSON-LD block${blocks.length !== 1 ? 's' : ''}, none valid JSON`,
        findings: brokenFindings,
        recommendation: 'Fix the JSON syntax in the JSON-LD blocks (trailing commas, unescaped quotes, missing brackets).',
        details: base
      }
    }

    const results = validateNodes(nodes, resolver(nodes))
    let score = POINTS.base
    let validMain = 0
    let invalidMain = 0
    const breakdown = {}
    const found = []
    const findings = [...brokenFindings]
    for (const [bucket, types, kind] of BUCKETS) {
      const entries = results.filter(r => types.includes(r.type))
      if (entries.length === 0) continue
      const own = entries.filter(r => !r.reference)
      const isValid = r => (bucket === 'WebSite' ? !!(r.node?.name || r.node?.url) : r.validation?.valid === true)
      const validCount = own.filter(isValid).length
      const valid = validCount > 0
      let points = 0
      if (kind === 'faq') points = valid ? POINTS.faq : POINTS.invalidFaq
      else if (kind === 'support') points = valid ? POINTS.support : 0
      else if (valid) points = validMain++ === 0 ? POINTS.firstMain : POINTS.extraMain
      else invalidMain++
      breakdown[bucket] = { count: own.length || entries.length, valid: validCount, points }
      score += points
      const n = own.length || entries.length
      const word = n === 1 ? 'schema' : 'schemas'
      found.push(validCount === n ? `${n} ${bucket} ${word} (valid)` : validCount === 0 ? `${n} ${bucket} ${word} (invalid)` : `${n} ${bucket} ${word} (${validCount} valid, ${n - validCount} invalid)`)
      if (!valid) {
        const bad = own.find(r => r.validation?.valid === false)
        if (!bad && bucket === 'WebSite') findings.push({ file, line: own[0]?.line ?? null, message: 'WebSite schema has no name or url' })
        if (bad) findings.push({ file, line: bad.line, message: `${bucket} schema is invalid: ${bad.validation.issues.slice(0, 2).join('; ')}` })
      }
    }
    if (!validMain && invalidMain) score += POINTS.invalidMain
    score = Math.min(15, Math.round(score))

    // Blocks we could not parse from source might hold more types
    let inconclusive = false
    if (unresolved.length > 0 && score < 8) {
      score = 8
      inconclusive = true
      for (const b of unresolved) findings.push({ file, line: b.line, message: 'JSON-LD block contains template tags and could not be parsed from source' })
    }

    const recs = []
    const questions = visibleQuestions(doc)
    if (!validMain) {
      recs.push(invalidMain ? 'Fix the main schema type so it validates (+5 pts)' : 'Add Organization schema, plus Article on posts or Product on product pages (+7 pts)')
      if (!invalidMain) findings.push({ file, line: parsed[0].line, message: 'No main schema type (Organization, Article, Product, HowTo, VideoObject or Dataset)' })
    }
    if (!breakdown.FAQ && questions >= 2) recs.push(`The page shows ${questions} questions: add FAQPage schema with the same questions and answers (+8 pts)`)
    const home = isHomepage(page)
    if (validMain && score < 15) {
      if (home && !breakdown.WebSite) recs.push('Add WebSite schema with the site name and url (+1 pt)')
      if (!home && !breakdown.BreadcrumbList) recs.push('Add BreadcrumbList schema (+1 pt)')
    }
    for (const [bucket] of BUCKETS) {
      const b = breakdown[bucket]
      if (b && b.valid === 0) {
        const bad = results.find(r => BUCKETS.find(x => x[0] === bucket)[1].includes(r.type) && r.validation?.valid === false)
        if (bad) recs.push(`Fix ${bucket} schema: ${bad.validation.issues.slice(0, 2).join('; ')}`)
      }
    }
    if (broken.length) recs.unshift('Fix the JSON syntax errors in the JSON-LD blocks')

    return {
      score,
      inconclusive,
      predicted: blocks.some(b => b.templated && b.data),
      message: found.length ? `Found: ${found.join(', ')}` : `${blocks.length} JSON-LD block${blocks.length !== 1 ? 's' : ''}, no recognized schemas`,
      findings,
      recommendation: score < 15 ? recs.slice(0, 3).join('; ') : '',
      details: { ...base, breakdown, visibleQuestions: questions, foundTypes: found, otherTypes: [...new Set(results.filter(r => !BUCKETS.some(x => x[1].includes(r.type))).map(r => r.type))] }
    }
  }
}
