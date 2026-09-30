// structured-data.valid - port of the extension's schema-validation-checker.js (5 pts)

import { extractJsonLd, resolver } from '../../lib/jsonld.mjs'
import { validateNodes } from '../../lib/schema-validator.mjs'

function actionable(type, issues) {
  const issue = issues[0].toLowerCase()
  if (issue.includes('missing') && issue.includes('price')) return `Add 'price' and 'priceCurrency' to your ${type} offers`
  if (issue.includes('missing') && issue.includes('name')) return `Add a 'name' property to your ${type} schema`
  if (issue.includes('missing') && issue.includes('image')) return `Add an 'image' property to your ${type} schema`
  if (issue.includes('missing') && issue.includes('description')) return `Add a 'description' property to your ${type} schema`
  if (issue.includes('mainentity') || issue.includes('question')) return `Add 'mainEntity' with Question/Answer items to your FAQPage`
  if (issue.includes('acceptedanswer') || issue.includes('answer')) return `Add 'acceptedAnswer' with 'text' to each Question in your FAQPage`
  if (issue.includes('step') || issue.includes('howto')) return `Add 'step' array with HowToStep items to your HowTo schema`
  return `${issues[0]}. See schema.org/${type} for required fields`
}

export default {
  id: 'structured-data.valid',
  scope: 'page',
  run({ page }) {
    const { doc } = page
    const file = page.file
    const { blocks, nodes } = extractJsonLd(doc, { templates: true })

    if (blocks.length === 0) {
      return {
        score: 0,
        message: 'No JSON-LD structured data to validate',
        findings: [{ file, line: doc.head?.line ?? 1, message: 'No JSON-LD structured data to validate' }],
        recommendation: 'Add JSON-LD structured data first, then validation can be checked.',
        details: { totalBlocks: 0 }
      }
    }

    const parsed = blocks.filter(b => b.data)
    const broken = blocks.filter(b => !b.data && !b.templated)
    const unresolved = blocks.filter(b => !b.data && b.templated)
    const results = validateNodes(nodes, resolver(nodes))
    const own = results.filter(r => !r.reference)
    const validatable = own.filter(r => r.validation && r.validation.valid !== null)
    const invalid = validatable.filter(r => r.validation.valid === false)
    const validCount = validatable.length - invalid.length

    const findings = broken.map(b => ({ file, line: b.line, message: 'JSON-LD block is not valid JSON' }))
    for (const r of invalid) findings.push({ file, line: r.line, message: `${r.type} schema: ${r.validation.issues.slice(0, 2).join('; ')}` })

    // Only template-built blocks and nothing else: cannot judge from source
    if (parsed.length === 0 && broken.length === 0) {
      return {
        score: 3,
        inconclusive: true,
        message: 'JSON-LD is built from template tags and cannot be validated from source',
        findings: unresolved.map(b => ({ file, line: b.line, message: 'JSON-LD block contains template tags and could not be parsed from source' })),
        recommendation: 'Build the site and re-run the audit, or validate the rendered page.',
        details: { totalBlocks: blocks.length, templatedBlocks: unresolved.length }
      }
    }

    // No parseable block means nothing on the page validates
    const validationRate = parsed.length === 0 ? 0 : validatable.length > 0 ? Math.round((validCount / validatable.length) * 100) : 100

    let score = 5 - broken.length * 0.5
    const issues = []
    if (broken.length) issues.push(`${broken.length} JSON-LD block${broken.length > 1 ? 's have' : ' has'} invalid JSON syntax`)
    if (validationRate < 50) {
      score -= 2
      issues.push(`Only ${validationRate}% of schemas pass validation`)
    } else if (validationRate < 80) {
      score -= 1
      issues.push(`${validationRate}% of schemas pass validation (target: 100%)`)
    } else if (validationRate < 100) {
      score -= 0.5
    }
    score = Math.max(0, Math.round(score * 10) / 10)

    let inconclusive = false
    if (unresolved.length > 0) {
      for (const b of unresolved) findings.push({ file, line: b.line, message: 'JSON-LD block contains template tags and could not be parsed from source' })
      if (score < 3) {
        score = 3
        inconclusive = true
      }
    }

    const primary = [...new Set(own.filter(r => r.path === '$' || /^\$\.@graph\[\d+\]$/.test(r.path) || /^\$\[\d+\]$/.test(r.path)).map(r => r.type))]
    const badTypes = new Set(invalid.map(r => r.type))
    const summary = primary.map(t => (badTypes.has(t) ? `${t} (invalid)` : t)).join(', ')
    let message
    if (validationRate === 100 && broken.length === 0) message = primary.length ? `${primary.length} schema${primary.length > 1 ? 's' : ''} valid: ${summary}` : 'No schemas found to validate'
    else message = `${validCount}/${validatable.length} validatable schemas valid${summary ? `: ${summary}` : ''}${broken.length ? ` (${broken.length} JSON error${broken.length > 1 ? 's' : ''})` : ''}`

    let recommendation = ''
    if (broken.length) recommendation = `Fix JSON syntax errors in ${broken.length} JSON-LD block${broken.length > 1 ? 's' : ''}. Use a JSON validator to check your structured data.`
    else if (invalid.length) {
      const top = invalid[0]
      recommendation = `Fix ${top.type} schema: ${actionable(top.type, top.validation.issues)}`
      if (invalid.length > 1) recommendation += `. ${invalid.length - 1} more schema${invalid.length > 2 ? 's' : ''} need${invalid.length === 2 ? 's' : ''} attention.`
    }

    return {
      score,
      inconclusive,
      predicted: blocks.some(b => b.templated && b.data),
      message,
      findings,
      recommendation,
      details: {
        totalBlocks: blocks.length,
        validBlocks: parsed.length,
        parseErrors: broken.length,
        templatedBlocks: blocks.filter(b => b.templated).length,
        totalSchemas: own.length,
        references: results.length - own.length,
        validatableSchemas: validatable.length,
        validSchemas: validCount,
        validationRate,
        schemas: own.map(r => ({ type: r.type, path: r.path, line: r.line, valid: r.validation?.valid ?? null, issues: r.validation?.issues || [], warnings: r.validation?.warnings || [] })),
        issues
      }
    }
  }
}
