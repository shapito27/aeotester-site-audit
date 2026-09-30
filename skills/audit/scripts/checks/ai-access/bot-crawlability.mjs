// ai-access.bot-crawlability - port of the extension's ai-bot-crawlability.js (12 pts)
//
// Evaluated once for the site at path '/'. Parsing and matching use the shared
// RFC 9309 parser in lib/robots.mjs (grouped user-agents, case-insensitive
// tokens, longest match, no global Crawl-delay inheritance).

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRobots, canCrawl, groupsFor } from '../../lib/robots.mjs'
import { robotsGenerator } from '../../lib/sources.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const BOTS = JSON.parse(readFileSync(join(here, '..', '..', '..', 'references', 'ai-bots.json'), 'utf8')).bots.map(b => b.name)
const WEIGHT = 12
const ABSENT_SCORE = 8
const MAX_DELAY = 5

export default {
  id: 'ai-access.bot-crawlability',
  scope: 'site',
  run({ site }) {
    const robots = site.robotsTxt
    const path = '/'

    if (!robots) {
      const generator = robotsGenerator(site)
      if (generator) {
        return {
          score: ABSENT_SCORE,
          inconclusive: true,
          message: 'robots.txt is generated, rules could not be read from the repo',
          findings: [],
          recommendation: 'Build the site (or check the live /robots.txt) to confirm AI crawlers are allowed.',
          details: { robotsTxtExists: null, generator, path }
        }
      }
      return {
        score: ABSENT_SCORE,
        message: 'robots.txt not found - all bots allowed by default',
        findings: [{ file: null, line: null, message: 'No robots.txt in the served root' }],
        recommendation: 'Add a robots.txt at the site root that explicitly allows AI crawlers (e.g. "User-agent: *" then "Allow: /").',
        details: { robotsTxtExists: false, allBotsAllowed: true, path }
      }
    }

    if (robots.text.trim() === '') {
      return {
        score: WEIGHT,
        message: 'Empty robots.txt - all AI bots allowed',
        findings: [],
        details: { robotsTxtExists: true, robotsTxtEmpty: true, allBotsAllowed: true, file: robots.path, path }
      }
    }

    const parsed = parseRobots(robots.text)
    const blockedBots = []
    const delayWarnings = []
    const byRule = new Map()
    const byDelayGroup = new Map()

    for (const bot of BOTS) {
      const r = canCrawl(parsed, bot, path)
      if (!r.allowed) {
        blockedBots.push(bot)
        const key = r.rule.line
        const g = byRule.get(key) || { rule: r.rule, bots: [] }
        g.bots.push(bot)
        byRule.set(key, g)
      } else if (r.crawlDelay !== null && r.crawlDelay > MAX_DELAY) {
        delayWarnings.push({ bot, delay: r.crawlDelay })
        const group = groupsFor(parsed, bot).groups.find(g => g.crawlDelay === r.crawlDelay)
        const line = group?.line ?? null
        const g = byDelayGroup.get(line) || { delay: r.crawlDelay, bots: [] }
        g.bots.push(bot)
        byDelayGroup.set(line, g)
      }
    }

    const total = BOTS.length
    const allowedCount = total - blockedBots.length
    let score = Math.round((allowedCount / total) * WEIGHT)
    if (delayWarnings.length) score = Math.max(0, score - 2)

    const findings = []
    for (const { rule, bots } of byRule.values()) {
      const list = bots.slice(0, 5).join(', ') + (bots.length > 5 ? ` and ${bots.length - 5} more` : '')
      findings.push({ file: robots.path, line: rule.line, message: `"${rule.type === 'disallow' ? 'Disallow' : 'Allow'}: ${rule.path}" blocks AI crawlers from ${path}: ${list}` })
    }
    for (const [line, { delay, bots }] of byDelayGroup) {
      findings.push({ file: robots.path, line, message: `Crawl-delay ${delay}s (over ${MAX_DELAY}s) slows AI crawlers: ${bots.slice(0, 5).join(', ')}${bots.length > 5 ? ` and ${bots.length - 5} more` : ''}` })
    }

    const recs = []
    if (blockedBots.length) recs.push(`Remove the Disallow rules that block AI crawlers in ${robots.path} (or give them their own "Allow: /" group)`)
    if (delayWarnings.length) recs.push(`lower Crawl-delay to ${MAX_DELAY}s or less`)

    return {
      score,
      message: `${allowedCount}/${total} AI bots can access ${path}${delayWarnings.length ? ` (${delayWarnings.length} with crawl-delay > ${MAX_DELAY}s)` : ''}`,
      findings,
      recommendation: recs.length ? recs.join('; ') + '.' : '',
      details: {
        robotsTxtExists: true,
        file: robots.path,
        path,
        totalBots: total,
        allowedCount,
        blockedCount: blockedBots.length,
        allowedPercentage: Math.round((allowedCount / total) * 100),
        blockedBots,
        delayWarnings,
        hasExcessiveDelays: delayWarnings.length > 0
      }
    }
  }
}
