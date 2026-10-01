// ai-access.content-signals - port of the extension's content-signals-checker.js (3 pts)
//
// Advisory in the plugin (rubric advisory: true): the engine reports the
// result as advice and leaves it out of the score. A missing Content-Signal
// line restricts nothing, so it is not an AI visibility defect.
//
// Source equivalents: robots.txt in the served root, and a Content-Signal
// header from host config (_headers, vercel.json, netlify.toml) for '/'.
// URL mode: the fetched robots.txt and the real Content-Signal response
// header of every audited page (measured, not predicted).

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRobots } from '../../lib/robots.mjs'
import { robotsGenerator } from '../../lib/sources.mjs'
import { isUnreachable, responseLabel } from '../../lib/remote.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const BOTS = JSON.parse(readFileSync(join(here, '..', '..', '..', 'references', 'ai-bots.json'), 'utf8')).bots.map(b => b.name.toLowerCase())
const KEYS = ['search', 'ai-input', 'ai-train']
const WEIGHT = 3
const RECOMMEND = 'Add a line such as "Content-Signal: search=yes, ai-input=yes, ai-train=no" to robots.txt to state how AI may use your content (the yes/no values are your policy choice). See https://contentsignals.org/'

export function parseContentSignal(value) {
  const signals = {}
  if (!value) return signals
  for (const part of value.split(',')) {
    const [rawKey, rawValue] = part.split('=')
    if (!rawKey || rawValue === undefined) continue
    const key = rawKey.trim().toLowerCase()
    const v = rawValue.trim().toLowerCase()
    if (KEYS.includes(key) && (v === 'yes' || v === 'no')) signals[key] = v
  }
  return signals
}

const format = s => KEYS.filter(k => s[k] !== undefined).map(k => `${k}=${s[k]}`).join(', ')

export default {
  id: 'ai-access.content-signals',
  scope: 'site',
  run({ site, pages = [] }) {
    const robots = site.robotsTxt
    const parsed = robots ? parseRobots(robots.text) : null

    // robots.txt: every Content-Signal line, regardless of group; later lines win
    const robotsSignals = {}
    const robotsLines = []
    for (const entry of parsed?.contentSignals || []) {
      robotsLines.push({ line: entry.line, value: entry.value })
      Object.assign(robotsSignals, parseContentSignal(entry.value))
    }

    // Header from host config for the home page (URL mode: real response
    // headers of the audited pages, first valid one wins)
    const headerPaths = site.live ? [...new Set([...pages.map(p => p.urlPath), '/'])] : ['/']
    const headerEntries = headerPaths.flatMap(p => (site.host.headersFor(p)['content-signal'] || []).map(h => ({ ...h, urlPath: p })))
    const headerEntry = headerEntries.find(h => Object.keys(parseContentSignal(h.value)).length) || headerEntries[0] || null
    const headerSignals = parseContentSignal(headerEntry?.value)

    const hasRobots = Object.keys(robotsSignals).length > 0
    const hasHeader = Object.keys(headerSignals).length > 0
    const combined = { ...headerSignals, ...robotsSignals }
    const source = hasRobots && hasHeader ? 'both' : hasRobots ? 'robots' : hasHeader ? 'header' : null

    const agents = new Set((parsed?.groups || []).flatMap(g => g.agents))
    const addressedBots = BOTS.filter(b => agents.has(b))
    const generator = robots || site.live ? null : robotsGenerator(site)
    const robotsRes = site.live && !robots ? site.live.response('/robots.txt') : null
    const robotsUnreachable = !!site.live && !robots && isUnreachable(robotsRes)

    const details = {
      robotsSignals,
      robotsLines,
      headerSignals,
      headerRaw: headerEntry?.value ?? null,
      headerSource: headerEntry?.source ?? null,
      source,
      signals: combined,
      aiBotsAddressed: addressedBots.slice(0, 10),
      aiBotsAddressedCount: addressedBots.length,
      robotsTxtExists: robots ? true : (generator || robotsUnreachable ? null : false),
      robotsFile: robots?.path ?? null
    }
    if (site.live && headerEntry) details.headerUrlPath = headerEntry.urlPath

    if (source) {
      return {
        score: WEIGHT,
        predicted: source === 'header' && !site.live,
        message: `Content Signals declared: ${format(combined)}`,
        findings: [],
        details
      }
    }

    // Unreachable equivalent: robots.txt is generated and cannot be read
    if (generator) {
      return {
        score: 2,
        inconclusive: true,
        message: 'robots.txt is generated, Content Signals could not be read from the repo',
        findings: [],
        recommendation: `Check the live /robots.txt for a Content-Signal line. If there is none: ${RECOMMEND}`,
        details: { ...details, inconclusive: true, generator }
      }
    }

    // URL mode: robots.txt could not be fetched and no page sends the header
    if (robotsUnreachable) {
      return {
        score: 2,
        inconclusive: true,
        message: `robots.txt could not be read (${responseLabel(robotsRes)}) and no page sends a Content-Signal header`,
        findings: [{ file: `${site.live.origin}/robots.txt`, line: null, message: `Fetching /robots.txt answered ${responseLabel(robotsRes)}, so a Content-Signal line there is unknown` }],
        recommendation: `Make sure /robots.txt is reachable for crawlers, then check it for a Content-Signal line. If there is none: ${RECOMMEND}`,
        details: { ...details, inconclusive: true, status: robotsRes?.status ?? null, error: robotsRes?.error ?? null }
      }
    }

    const invalid = robotsLines.map(l => ({ file: robots.path, line: l.line, message: 'Content-Signal line has no valid key=yes|no pair (keys: search, ai-input, ai-train)' }))

    if (addressedBots.length) {
      const firstGroup = parsed.groups.find(g => g.agents.some(a => BOTS.includes(a)))
      return {
        score: 1,
        message: `robots.txt addresses ${addressedBots.length} AI bot${addressedBots.length === 1 ? '' : 's'} but declares no Content Signals`,
        findings: [{ file: robots.path, line: firstGroup?.line ?? 1, message: 'robots.txt controls AI crawler access but declares no Content-Signal' }, ...invalid],
        recommendation: RECOMMEND,
        details
      }
    }

    return {
      score: 0,
      message: 'No Content Signals declared',
      findings: robots
        ? [{ file: robots.path, line: 1, message: 'robots.txt has no Content-Signal line' }, ...invalid]
        : [{ file: site.live ? `${site.live.origin}/robots.txt` : null, line: null, message: 'No robots.txt, so no Content-Signal is declared' }],
      recommendation: robots ? RECOMMEND : `Create robots.txt at the site root. ${RECOMMEND}`,
      details
    }
  }
}
