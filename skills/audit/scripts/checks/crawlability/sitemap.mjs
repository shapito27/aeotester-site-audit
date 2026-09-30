// crawlability.sitemap - port of the extension's sitemap-checker.js (5 pts)
//
// URL mode: the sitemaps remote.mjs fetched (robots.txt Sitemap lines, then
// /sitemap.xml and /sitemap_index.xml). A sitemap or robots.txt that could not
// be read (blocked, rate limited, timed out) is inconclusive, never a fail.

import { parseRobots } from '../../lib/robots.mjs'
import { robotsGenerator, sitemapGenerator } from '../../lib/sources.mjs'
import { isUnreachable, responseLabel } from '../../lib/remote.mjs'

const WEIGHT = 5
// Probed in this order by the extension
const PROBES = ['sitemap.xml', 'sitemap_index.xml', 'sitemap-index.xml', 'sitemap1.xml']

function findSitemap(site, parsedRobots) {
  for (const name of PROBES) {
    const f = site.rootFile(name)
    if (f) return { ...f, urlPath: '/' + name, via: 'probe' }
  }
  // Sitemaps declared in robots.txt that exist on disk (the extension only probes the four names)
  for (const s of parsedRobots?.sitemaps || []) {
    let pathname
    try {
      pathname = new URL(s.url, 'https://x.invalid').pathname
    } catch {
      continue
    }
    const f = site.rootFile(decodeURIComponent(pathname).replace(/^\//, ''))
    if (f) return { ...f, urlPath: pathname, via: 'robots' }
  }
  // URL mode: any sitemap that was fetched (a robots.txt Sitemap line whose
  // path does not map back cleanly, or a child of a sitemap index)
  if (site.live && site.sitemaps?.length) {
    const s = site.sitemaps[0]
    const u = new URL(s.url)
    return { ...s, urlPath: u.pathname + u.search, via: (parsedRobots?.sitemaps || []).some(r => r.url === s.url) ? 'robots' : 'probe' }
  }
  return null
}

// URL mode: sitemap locations that could not be read, as [{ url, res }]
function unreachableSitemaps(site, parsedRobots) {
  const origin = site.live.origin
  const urls = [...new Set([...(parsedRobots?.sitemaps || []).map(s => s.url), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])]
  const out = []
  for (const url of urls) {
    let u
    try {
      u = new URL(url)
    } catch {
      continue
    }
    if (u.origin !== origin) continue
    const res = site.live.response(u.pathname + u.search)
    if (res && isUnreachable(res)) out.push({ url, res })
  }
  return out
}

export default {
  id: 'crawlability.sitemap',
  scope: 'site',
  run({ site }) {
    const robots = site.robotsTxt
    const parsed = robots ? parseRobots(robots.text) : null
    const found = findSitemap(site, parsed)
    const generated = found || site.live ? null : sitemapGenerator(site)
    const robotsRes = site.live && !robots ? site.live.response('/robots.txt') : null
    const robotsUnreachable = !!site.live && !robots && isUnreachable(robotsRes)

    if (!found && site.live) {
      const blocked = unreachableSitemaps(site, parsed)
      if (blocked.length || robotsUnreachable) {
        const what = blocked.length ? `${new URL(blocked[0].url).pathname} answered ${responseLabel(blocked[0].res)}` : `robots.txt answered ${responseLabel(robotsRes)}, so a Sitemap: line there is unknown`
        return {
          score: WEIGHT / 2,
          inconclusive: true,
          message: `Sitemap could not be read (${what})`,
          findings: [
            ...blocked.map(b => ({ file: b.url, line: null, message: `Fetching the sitemap answered ${responseLabel(b.res)}` })),
            ...(robotsUnreachable ? [{ file: `${site.live.origin}/robots.txt`, line: null, message: `Fetching /robots.txt answered ${responseLabel(robotsRes)}` }] : [])
          ],
          recommendation: 'Make sure /sitemap.xml and /robots.txt are reachable for crawlers (not blocked by bot protection or rate limiting).',
          details: { exists: null, inconclusive: true, unreachable: blocked.map(b => ({ url: b.url, status: b.res.status, error: b.res.error ?? null })), robotsUnreachable, declaredInRobots: (parsed?.sitemaps || []).map(s => s.url) }
        }
      }
    }

    if (!found && !generated) {
      return {
        score: 0,
        message: 'No sitemap.xml found',
        findings: [{ file: null, line: null, message: site.live ? 'No sitemap at /sitemap.xml, /sitemap_index.xml or any robots.txt Sitemap: URL' : 'No sitemap at /sitemap.xml, /sitemap_index.xml, /sitemap-index.xml or /sitemap1.xml' }],
        recommendation: 'Add a sitemap at /sitemap.xml listing every page and reference it in robots.txt with "Sitemap: https://<domain>/sitemap.xml".',
        details: { exists: false, checkedLocations: PROBES.map(p => '/' + p), declaredInRobots: (parsed?.sitemaps || []).map(s => s.url) }
      }
    }

    let score = WEIGHT
    const issues = []
    const findings = []
    const robotsUnknown = !robots && (site.live ? robotsUnreachable : !!robotsGenerator(site))

    // robots.txt presence and Sitemap: directive (comments are not directives)
    const referencedInRobots = !!parsed && parsed.sitemaps.length > 0
    if (!robots && !robotsUnknown) {
      score -= 1
      issues.push('robots.txt not found')
      findings.push({ file: null, line: null, message: 'No robots.txt, so the sitemap is not declared to crawlers' })
    }
    if (robots && !referencedInRobots) {
      issues.push('Sitemap not referenced in robots.txt')
      findings.push({ file: robots.path, line: 1, message: 'robots.txt has no Sitemap: directive' })
    }
    if (!referencedInRobots && !robotsUnknown) score -= 2

    let urlCount = null
    let isSitemapIndex = null
    if (found) {
      isSitemapIndex = /<sitemapindex[\s>]/i.test(found.text)
      urlCount = (found.text.match(/<loc[\s>]/g) || []).length
      if (urlCount === 0) {
        score -= 2
        issues.push('Sitemap appears empty')
        findings.push({ file: found.path, line: 1, message: 'Sitemap has no <loc> entries' })
      }
    }

    const recs = []
    if (!robots && !robotsUnknown) recs.push('Create robots.txt with a "Sitemap: https://<domain>/sitemap.xml" line')
    else if (robots && !referencedInRobots) recs.push(`Add "Sitemap: https://<domain>/${found ? found.urlPath.slice(1) : 'sitemap.xml'}" to ${robots.path}`)
    if (urlCount === 0) recs.push('list every page as <url><loc>...</loc></url> in the sitemap')

    return {
      score: Math.max(0, score),
      predicted: !!generated,
      inconclusive: robotsUnknown,
      message: found
        ? `Sitemap found with ${urlCount} URL${urlCount !== 1 ? 's' : ''}`
        : `Sitemap generated at build time (${generated.source})`,
      findings,
      recommendation: recs.length ? recs.join('; ') + '.' : '',
      details: {
        exists: true,
        file: found?.path ?? null,
        url: found ? found.urlPath : generated.path,
        foundVia: found ? found.via : 'generator',
        generator: generated?.source ?? null,
        isSitemapIndex,
        urlCount,
        referencedInRobots: robotsUnknown ? null : referencedInRobots,
        robotsTxtExists: robots ? true : (robotsUnknown ? null : false),
        issues
      }
    }
  }
}
