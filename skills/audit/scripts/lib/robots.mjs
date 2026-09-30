// robots.txt parser following RFC 9309 and Google's documented behaviour:
// - consecutive User-agent lines form one group that shares the rules
// - user-agent matching is case-insensitive on the product token
// - the most specific (longest) matching rule wins; Allow wins a tie
// - * matches any sequence, $ anchors the end of the path
// - a bot with its own group ignores the * group entirely
//
// Divergence from extension v1.3.1: the extension gives rules only to the
// last User-agent of a group, matches bot names case-sensitively, lets any
// Allow beat any Disallow, and applies the global Crawl-delay to bots that
// have their own group.

export function parseRobots(text) {
  const groups = []
  const sitemaps = []
  const contentSignals = []
  let current = null
  let lastWasAgent = false
  const lines = (text || '').split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) return
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [], crawlDelay: null, contentSignals: [], line: i + 1 }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      return
    }
    lastWasAgent = false
    if (key === 'sitemap') {
      sitemaps.push({ url: value, line: i + 1 })
      return
    }
    if (key === 'content-signal') {
      const entry = { value, line: i + 1 }
      if (current) current.contentSignals.push(entry)
      contentSignals.push({ ...entry, agents: current ? current.agents : ['*'] })
      return
    }
    if (!current) return
    if (key === 'allow' || key === 'disallow') {
      current.rules.push({ type: key, path: value, line: i + 1 })
    } else if (key === 'crawl-delay') {
      const n = parseFloat(value)
      if (Number.isFinite(n)) current.crawlDelay = n
    }
  })
  return { groups, sitemaps, contentSignals }
}

function patternMatches(path, pattern) {
  if (pattern === '') return false
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const re = body.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path)
}

// Groups that apply to a bot: its own (by product token), else the * group
export function groupsFor(parsed, botName) {
  const token = botName.toLowerCase()
  const own = parsed.groups.filter(g => g.agents.some(a => a !== '*' && a === token))
  if (own.length) return { groups: own, specific: true }
  return { groups: parsed.groups.filter(g => g.agents.includes('*')), specific: false }
}

// Returns { allowed, rule, crawlDelay, specific }
export function canCrawl(parsed, botName, path = '/') {
  const { groups, specific } = groupsFor(parsed, botName)
  let best = null
  for (const g of groups) {
    for (const r of g.rules) {
      if (r.type === 'disallow' && r.path === '') continue
      if (!patternMatches(path, r.path)) continue
      const len = r.path.replace(/\$$/, '').length
      if (!best || len > best.len || (len === best.len && r.type === 'allow')) best = { ...r, len }
    }
  }
  const delays = groups.map(g => g.crawlDelay).filter(d => d !== null)
  return {
    allowed: !best || best.type === 'allow',
    rule: best,
    crawlDelay: delays.length ? Math.max(...delays) : null,
    specific
  }
}
