// crawlability.sitemap - port of the extension's sitemap-checker.js (5 pts)

import { parseRobots } from '../../lib/robots.mjs'
import { robotsGenerator, sitemapGenerator } from '../../lib/sources.mjs'

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
  return null
}

export default {
  id: 'crawlability.sitemap',
  scope: 'site',
  run({ site }) {
    const robots = site.robotsTxt
    const parsed = robots ? parseRobots(robots.text) : null
    const found = findSitemap(site, parsed)
    const generated = found ? null : sitemapGenerator(site)

    if (!found && !generated) {
      return {
        score: 0,
        message: 'No sitemap.xml found',
        findings: [{ file: null, line: null, message: 'No sitemap at /sitemap.xml, /sitemap_index.xml, /sitemap-index.xml or /sitemap1.xml' }],
        recommendation: 'Add a sitemap at /sitemap.xml listing every page and reference it in robots.txt with "Sitemap: https://<domain>/sitemap.xml".',
        details: { exists: false, checkedLocations: PROBES.map(p => '/' + p), declaredInRobots: (parsed?.sitemaps || []).map(s => s.url) }
      }
    }

    let score = WEIGHT
    const issues = []
    const findings = []
    const robotsUnknown = !robots && !!robotsGenerator(site)

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
