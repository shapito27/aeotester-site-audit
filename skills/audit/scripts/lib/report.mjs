// Renders an audit result as the aeotester-report.md Markdown report.

const STATUS_ICON = { pass: 'PASS', warning: 'WARN', fail: 'FAIL', na: 'N/A', skipped: 'SKIP', advice: 'ADVICE' }
const FIX_LABEL = { auto: 'auto-fix', assisted: 'assisted', 'report-only': 'report only' }
const MAX_LOCATIONS = 5

function esc(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function loc(l) {
  return l.line ? `\`${l.file}:${l.line}\`` : `\`${l.file}\``
}

export function renderReport(site, audit, options = {}) {
  const L = []
  const date = options.date || new Date().toISOString().slice(0, 10)
  L.push('# AEOTester report', '')
  L.push(`Generated ${date} by the [AEOTester](https://aeotester.com/?utm_source=plugin&utm_medium=report) Claude Code plugin, rubric v${audit.rubricVersion}.`, '')

  L.push('| | |', '|---|---|')
  if (site.live) {
    const what = { single: 'one page', sample: 'a sample, one page per template', all: 'every page found' }[site.sampleMode]
    L.push(`| Live site | ${site.live.origin} |`)
    L.push(`| Audited | ${site.pages.length} page(s): ${what}${site.totalPages > site.pages.length ? `, from ${site.totalPages} URLs found` : ''} |`)
  } else L.push(`| Stack | ${site.stack.id} (${esc(site.stack.evidence)}) |`)
  if (site.servedRoot) L.push(`| Audited | \`${site.servedRoot}/\`, ${site.pages.length} page(s)${site.totalPages > site.pages.length ? ` of ${site.totalPages}` : ''} |`)
  if (site.baseUrl && !site.live) L.push(`| Site URL | ${site.baseUrl} |`)
  L.push('')

  for (const note of site.notes) L.push(`> ${note}`, '')

  if (site.live && site.sampleMode === 'sample' && site.pages.length) {
    L.push('<details><summary>Pages in the sample</summary>', '', '| Page | Stands in for |', '|---|---|')
    for (const p of site.pages) L.push(`| ${p.url} | ${esc(p.role || '')} |`)
    L.push('', '</details>', '')
  }

  if (site.mode === 'report-only') {
    renderFixList(L, options.rubric)
    footer(L)
    return L.join('\n')
  }

  if (site.mode === 'needs-build' || site.mode === 'no-pages') {
    L.push('No score: there were no built pages to audit.', '')
    footer(L)
    return L.join('\n')
  }

  // --only with advisory checks alone: nothing is scored
  const adviceOnly = audit.available === 0 && audit.checks.some(c => c.advisory)
  const scoreLine = adviceOnly
    ? '**No score: only advice checks ran.** Advice costs no points.'
    : site.mode === 'report-only'
    ? `**Partial score: ${audit.total} / ${audit.available}** (only checks that can run on repo files; page checks need a live URL)`
    : `**Score: ${audit.total} / ${audit.available} (${audit.percentage}%) - ${audit.grade}**`
  L.push('## Summary', '', scoreLine, '')
  if (audit.naWeight) L.push(`${audit.naWeight} points do not apply to this site and are left out of the total (max ${audit.maxScore}).`, '')
  const excluded = audit.excludedPages || []
  if (excluded.length) {
    const names = excluded.map(p => `\`${p.url || p.file}\``)
    L.push(`Not scored: ${excluded.length} page(s) kept out of search on purpose (${excluded[0].reason}): ${names.slice(0, 10).join(', ')}${names.length > 10 ? ` and ${names.length - 10} other pages` : ''}. They do not need to rank, so page checks leave them out.`, '')
  }

  L.push('| Category | Score |', '|---|---:|')
  for (const c of audit.categories) {
    if (c.max === 0 && c.skipped) {
      L.push(`| ${c.name} | not evaluated |`)
      continue
    }
    L.push(`| ${c.name} | ${c.score} / ${c.max}${c.skipped ? ` (${c.skipped} pts n/a)` : ''} |`)
  }
  L.push('')

  const problems = audit.checks
    .filter(c => c.status === 'fail' || c.status === 'warning')
    .sort((a, b) => b.lost - a.lost || b.weight - a.weight)

  L.push('## Issues by points lost', '')
  if (problems.length === 0) L.push('Nothing to fix. Every evaluated check passed.', '')
  for (const c of problems) {
    const flags = [FIX_LABEL[c.fixable], c.inconclusive ? 'inconclusive' : null, c.predicted ? 'predicted from config' : null].filter(Boolean).join(', ')
    L.push(`### ${STATUS_ICON[c.status]} ${c.name} - ${c.score} / ${c.weight} (-${c.lost})`, '')
    L.push(`\`${c.id}\` | ${flags}`, '')
    L.push(esc(c.message), '')
    for (const f of c.findings.slice(0, 8)) {
      const where = f.locations.slice(0, MAX_LOCATIONS).map(loc).join(', ')
      const more = f.locations.length > MAX_LOCATIONS ? ` and ${f.locations.length - MAX_LOCATIONS} more` : ''
      L.push(`- ${esc(f.message)}${where ? ` - ${where}${more}` : ''}`)
    }
    if (c.findings.length > 8) L.push(`- ...and ${c.findings.length - 8} more finding(s)`)
    if (c.pages > 1 && c.failingPages?.length) L.push(`- Pages losing points: ${c.failingPages.length} of ${c.pages}`)
    if (c.recommendation) L.push('', `Fix: ${esc(c.recommendation)}`)
    L.push('')
  }

  const advice = audit.checks.filter(c => c.advice?.length || c.status === 'advice')
  if (advice.length) {
    L.push('## Advice (no points)', '')
    L.push('Worth knowing, but not scored: these can be deliberate choices.', '')
    for (const c of advice) {
      L.push(`### ${c.name}`, '', `\`${c.id}\``, '')
      for (const f of c.advice.slice(0, 8)) {
        const where = f.locations.slice(0, MAX_LOCATIONS).map(loc).join(', ')
        const more = f.locations.length > MAX_LOCATIONS ? ` and ${f.locations.length - MAX_LOCATIONS} more` : ''
        L.push(`- ${esc(f.message)}${where ? ` - ${where}${more}` : ''}`)
      }
      if (c.advice.length > 8) L.push(`- ...and ${c.advice.length - 8} more`)
      if (c.status === 'advice' && c.recommendation) L.push('', `Suggestion: ${esc(c.recommendation)}`)
      L.push('')
    }
  }

  L.push('## All checks', '')
  L.push('| Check | Status | Score | Fix |', '|---|---|---:|---|')
  for (const c of audit.checks) {
    const points = c.status === 'na' || c.status === 'skipped' ? '-' : c.advisory ? 'not scored' : `${c.score} / ${c.weight}`
    L.push(`| ${c.name} | ${STATUS_ICON[c.status]} | ${points} | ${FIX_LABEL[c.fixable]} |`)
  }
  L.push('')

  if (options.linksSection) L.push(options.linksSection, '')

  L.push('## Notes', '')
  if (site.live) {
    L.push('- Scores come from the live site as a crawler sees it: the HTML the server sends, before any JavaScript runs. Checks marked "inconclusive" could not be read (blocked, rate limited or timed out) and were not scored down.')
    L.push('- To fix issues, open the site\'s code in Claude Code and run `/aeotester:fix` there. It shows a diff and asks before writing anything.')
  } else {
    L.push('- Scores come from the repo, not a live page. Tags injected by JavaScript, headers set by your host, and server behaviour can differ in production; checks marked "predicted from config" or "inconclusive" are the ones to confirm live, for example with `/aeotester:audit https://your-site.com`.')
    L.push('- Run `/aeotester:fix` to apply the auto-fixable items. It shows a diff and asks before writing anything.')
  }
  L.push('')
  footer(L)
  return L.join('\n')
}

// Database-backed CMS: no score, a checklist of what to fix in the CMS instead
function renderFixList(L, rubric) {
  L.push('## Fix list', '')
  L.push('This site is built with a database-backed CMS, so the pages are not in the repo and no score is given. Nothing was edited. Work through this list in your CMS (theme, SEO plugin, or hosting settings). For a real score, audit the live site: `/aeotester:audit https://your-site.com`.', '')
  for (const cat of rubric.categories) {
    const checks = rubric.checks.filter(c => c.category === cat.id).sort((a, b) => b.weight - a.weight)
    L.push(`### ${cat.name} (${cat.max} pts)`, '')
    for (const c of checks) L.push(`- [ ] **${c.name}** (${c.weight} pts${c.conditional ? ', only if you expose an API or agent' : ''}) - ${esc(firstSentence(c.description))}`)
    L.push('')
  }
}

function firstSentence(text) {
  const m = /^[\s\S]*?[a-z0-9)"'][.!?](\s|$)/.exec(text || '')
  return (m ? m[0] : text || '').trim()
}

function footer(L) {
  L.push('---', '', 'Check a live URL: https://aeotester.com/?utm_source=plugin&utm_medium=report', '')
}

export function renderSummary(site, audit) {
  if (site.mode === 'needs-build' || site.mode === 'no-pages') return site.notes.join(' ')
  if (site.mode === 'report-only') return `Report-only (${site.stack.id}): content lives in the database, so no score. Wrote a fix list of ${audit.checks.length} checks to work through in the CMS. Audit the live site with a URL for a score.`
  const worst = audit.checks
    .filter(c => c.status === 'fail' || c.status === 'warning')
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 5)
    .map(c => `- ${c.name}: -${c.lost} (${FIX_LABEL[c.fixable]})`)
  const head = audit.available === 0 && audit.checks.some(c => c.advisory)
    ? `Advice only, no score: ${audit.checks.map(c => `${c.name} ${c.status}`).join(', ')}`
    : site.mode === 'report-only'
    ? `Partial score ${audit.total}/${audit.available} (report-only: ${site.stack.id})`
    : `AEO score ${audit.total}/${audit.available} (${audit.percentage}%, ${audit.grade})`
  const extra = []
  const excluded = audit.excludedPages?.length || 0
  if (excluded) extra.push(`Not scored: ${excluded} page(s) kept out of search on purpose (noindex)`)
  const advice = audit.checks.filter(c => c.advice?.length || c.status === 'advice').map(c => c.name)
  if (advice.length) extra.push(`Advice, no points: ${advice.join(', ')}`)
  return [head, ...worst, ...extra].join('\n')
}
