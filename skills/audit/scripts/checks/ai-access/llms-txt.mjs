// ai-access.llms-txt - port of the extension's llms-txt-checker.js (6 pts)

import { parseRobots, canCrawl } from '../../lib/robots.mjs'
import { llmsGenerator, robotsGenerator } from '../../lib/sources.mjs'
import { isUnreachable, responseLabel } from '../../lib/remote.mjs'

const BASE = 5
const WEIGHT = 6

export function validateFormat(text) {
  const firstLine = text.split('\n').find(l => l.trim().length > 0) || ''
  const hasH1 = /^#\s+\S/.test(firstLine.trim())
  const linkCount = (text.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
  const issues = []
  if (!hasH1) issues.push('Missing H1 title on the first line (e.g. "# Project Name")')
  if (linkCount === 0) issues.push('No markdown links to key pages - agents cannot navigate from it')
  return {
    hasH1,
    title: hasH1 ? firstLine.trim().replace(/^#\s+/, '') : null,
    hasSummary: /^>\s+\S/m.test(text),
    linkCount,
    sectionCount: (text.match(/^##\s+/gm) || []).length,
    valid: hasH1 && linkCount > 0,
    issues
  }
}

export default {
  id: 'ai-access.llms-txt',
  scope: 'site',
  run({ site }) {
    const llms = site.llmsTxt
    const full = site.llmsFullTxt
    const llmsFullTxt = { exists: !!full, file: full?.path ?? null, fileSizeKB: full ? Math.round((full.text.length / 1024) * 10) / 10 : 0 }

    // URL mode: unreachable is inconclusive; 404 or an HTML fallback is absent
    if (!llms && site.live) {
      const res = site.live.response('/llms.txt')
      if (isUnreachable(res)) {
        return {
          score: WEIGHT / 2,
          inconclusive: true,
          message: `llms.txt could not be read (${responseLabel(res)})`,
          findings: [{ file: `${site.live.origin}/llms.txt`, line: null, message: `Fetching /llms.txt answered ${responseLabel(res)}, so whether it exists is unknown` }],
          recommendation: 'Make sure /llms.txt is reachable for AI assistants (not blocked by bot protection or rate limiting).',
          details: { exists: null, inconclusive: true, status: res?.status ?? null, error: res?.error ?? null, llmsFullTxt }
        }
      }
      return {
        score: 0,
        message: 'llms.txt not found',
        findings: [{ file: `${site.live.origin}/llms.txt`, line: null, message: `No llms.txt (${res && res.ok ? 'the URL returns an HTML page or is empty' : responseLabel(res)})` }],
        recommendation: 'Create an llms.txt at the site root with "# Site Name", a "> summary" line and "## Section" lists of [Title](url) links. See https://llmstxt.org/',
        details: { exists: false, status: res?.status ?? null, llmsFullTxt }
      }
    }

    if (!llms) {
      const generator = llmsGenerator(site)
      if (generator) {
        return {
          score: WEIGHT / 2,
          inconclusive: true,
          message: 'llms.txt is generated, content could not be read from the repo',
          findings: [],
          recommendation: 'Build the site (or fetch the live /llms.txt) to confirm it has an H1 title and markdown links.',
          details: { exists: null, generator, llmsFullTxt }
        }
      }
      return {
        score: 0,
        message: 'llms.txt not found',
        findings: [{ file: null, line: null, message: 'No llms.txt in the served root' }],
        recommendation: 'Create an llms.txt at the site root with "# Site Name", a "> summary" line and "## Section" lists of [Title](url) links. See https://llmstxt.org/',
        details: { exists: false, llmsFullTxt }
      }
    }

    const text = llms.text
    const size = text.length
    const issues = []
    const findings = []
    let score = BASE

    if (size === 0) {
      score -= 3
      issues.push('llms.txt file is empty')
    } else if (size < 50) {
      score -= 1
      issues.push('llms.txt file appears too short (< 50 characters)')
    }
    for (const m of issues) findings.push({ file: llms.path, line: 1, message: m })

    // Blocked for User-agent: * (the extension only consults the global group)
    let blockedByRobots = false
    let robotsUnknown = false
    if (site.robotsTxt) {
      const r = canCrawl(parseRobots(site.robotsTxt.text), '*', '/llms.txt')
      if (!r.allowed) {
        blockedByRobots = true
        score -= 2
        issues.push('llms.txt exists but is blocked by robots.txt')
        findings.push({ file: site.robotsTxt.path, line: r.rule.line, message: `"Disallow: ${r.rule.path}" blocks /llms.txt for User-agent: *` })
      }
    } else if (site.live ? isUnreachable(site.live.response('/robots.txt')) : robotsGenerator(site)) {
      robotsUnknown = true
    }

    if (size > 10000) {
      issues.push(`llms.txt file is quite large (${Math.round(size / 1024)}KB). Consider keeping it concise.`)
      findings.push({ file: llms.path, line: 1, message: 'llms.txt is larger than 10KB (no penalty)' })
    }

    const format = validateFormat(text)
    if (format.valid) {
      score += 1
    } else if (size > 0) {
      issues.push(...format.issues)
      for (const m of format.issues) findings.push({ file: llms.path, line: 1, message: m })
    }

    const recs = []
    if (size < 50) recs.push('Expand llms.txt into an index of key pages')
    if (blockedByRobots) recs.push('remove the robots.txt rule that blocks /llms.txt')
    if (!format.valid && size > 0) recs.push('start llms.txt with "# Site Name" and list key pages as [Title](url) links')

    return {
      score: Math.max(0, Math.min(WEIGHT, score)),
      message: format.valid ? 'llms.txt found (valid format)' : (size > 0 ? 'llms.txt found (format issues)' : 'llms.txt found'),
      findings,
      recommendation: recs.length ? recs.join('; ') + '.' : (llmsFullTxt.exists ? '' : 'Consider also publishing /llms-full.txt with the full expanded content.'),
      details: {
        exists: true,
        file: llms.path,
        fileSize: size,
        fileSizeKB: Math.round((size / 1024) * 10) / 10,
        blockedByRobots,
        robotsUnknown,
        format,
        llmsFullTxt,
        issues,
        preview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
      }
    }
  }
}
