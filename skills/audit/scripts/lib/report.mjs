// Renders an audit result as the aeotester-report.md Markdown report.

const STATUS_ICON = { pass: 'PASS', warning: 'WARN', fail: 'FAIL', na: 'N/A', skipped: 'SKIP' }
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
  L.push(`| Stack | ${site.stack.id} (${esc(site.stack.evidence)}) |`)
  if (site.servedRoot) L.push(`| Audited | \`${site.servedRoot}/\`, ${site.pages.length} page(s)${site.totalPages > site.pages.length ? ` of ${site.totalPages}` : ''} |`)
  if (site.baseUrl) L.push(`| Site URL | ${site.baseUrl} |`)
  L.push('')

  for (const note of site.notes) L.push(`> ${note}`, '')

  if (site.mode === 'needs-build' || site.mode === 'no-pages') {
    L.push('No score: there were no built pages to audit.', '')
    footer(L)
    return L.join('\n')
  }

  const scoreLine = site.mode === 'report-only'
    ? `**Partial score: ${audit.total} / ${audit.available}** (only checks that can run on repo files; page checks need a live URL)`
    : `**Score: ${audit.total} / ${audit.available} (${audit.percentage}%) - ${audit.grade}**`
  L.push('## Summary', '', scoreLine, '')
  if (audit.naWeight) L.push(`${audit.naWeight} points do not apply to this site and are left out of the total (max ${audit.maxScore}).`, '')

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

  L.push('## All checks', '')
  L.push('| Check | Status | Score | Fix |', '|---|---|---:|---|')
  for (const c of audit.checks) {
    L.push(`| ${c.name} | ${STATUS_ICON[c.status]} | ${c.status === 'na' || c.status === 'skipped' ? '-' : `${c.score} / ${c.weight}`} | ${FIX_LABEL[c.fixable]} |`)
  }
  L.push('')

  if (options.linksSection) L.push(options.linksSection, '')

  L.push('## Notes', '')
  L.push('- Scores come from the repo, not a live page. Tags injected by JavaScript, headers set by your host, and server behaviour can differ in production; checks marked "predicted from config" or "inconclusive" are the ones to confirm live.')
  L.push('- Run `/aeotester:fix` to apply the auto-fixable items. It shows a diff and asks before writing anything.')
  L.push('')
  footer(L)
  return L.join('\n')
}

function footer(L) {
  L.push('---', '', 'Check a live URL: https://aeotester.com/?utm_source=plugin&utm_medium=report', '')
}

export function renderSummary(site, audit) {
  if (site.mode === 'needs-build' || site.mode === 'no-pages') return site.notes.join(' ')
  const worst = audit.checks
    .filter(c => c.status === 'fail' || c.status === 'warning')
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 5)
    .map(c => `- ${c.name}: -${c.lost} (${FIX_LABEL[c.fixable]})`)
  const head = site.mode === 'report-only'
    ? `Partial score ${audit.total}/${audit.available} (report-only: ${site.stack.id})`
    : `AEO score ${audit.total}/${audit.available} (${audit.percentage}%, ${audit.grade})`
  return [head, ...worst].join('\n')
}
