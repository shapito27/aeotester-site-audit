// content.freshness - port of the extension's content-freshness-checker.js (5 pts)

import { extractJsonLd } from '../../lib/jsonld.mjs'

// Any object or array at any depth with a truthy own property
function hasProperty(value, prop, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 20) return false
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, prop) && value[prop]) return true
  return Object.values(value).some(v => hasProperty(v, prop, depth + 1))
}

// Divergence: a <time> explicitly labelled as the publish date counts as a
// publish signal. Unlabelled <time datetime> keeps the extension behaviour
// (a modified-date signal).
const PUBLISHED_TIME = el => el.getAttribute('itemprop') === 'datePublished' || /\b(published|pubdate|post-date|entry-date)\b/i.test(`${el.className} ${el.parentElement?.className || ''}`)

export default {
  id: 'content.freshness',
  scope: 'page',
  run({ page }) {
    const { doc } = page
    const file = page.file
    const headLine = doc.head?.line ?? 1

    const publishedMeta = doc.querySelector('meta[property="article:published_time"]')
    const modifiedMeta = doc.querySelector('meta[property="article:modified_time"]')
    const hasPublishDate = !!publishedMeta?.getAttribute('content')
    const hasModifiedDate = !!modifiedMeta?.getAttribute('content')

    const { blocks } = extractJsonLd(doc, { templates: true })
    // Blocks still unparseable because of template tags: a date property in
    // the raw text is taken as present (predicted), never scored down
    const rawHas = prop => b => !b.data && b.templated && b.el.textContent.includes(`"${prop}"`)
    const publishBlock = blocks.find(b => hasProperty(b.data, 'datePublished')) || blocks.find(rawHas('datePublished'))
    const modifiedBlock = blocks.find(b => hasProperty(b.data, 'dateModified')) || blocks.find(rawHas('dateModified'))

    const times = doc.querySelectorAll('time[datetime]')
    const publishTimes = times.filter(PUBLISHED_TIME)
    const otherTimes = times.filter(t => !PUBLISHED_TIME(t))

    const foundPublish = hasPublishDate || !!publishBlock || publishTimes.length > 0
    const foundModified = hasModifiedDate || !!modifiedBlock || otherTimes.length > 0
    const details = {
      hasPublishDate,
      hasModifiedDate,
      hasJsonLdPublish: !!publishBlock,
      hasJsonLdModified: !!modifiedBlock,
      hasTimeElements: times.length > 0,
      timeElementCount: times.length,
      publishTimeElements: publishTimes.length,
      publishedValue: publishedMeta?.getAttribute('content') || null,
      modifiedValue: modifiedMeta?.getAttribute('content') || null
    }

    if (!foundPublish && !foundModified) {
      return {
        score: 0,
        message: 'No publish or modified dates found',
        findings: [{ file, line: headLine, message: 'No publish or modified date (article:published_time, JSON-LD datePublished or <time datetime>)' }],
        recommendation: 'Add article:published_time and article:modified_time meta tags, or JSON-LD datePublished/dateModified.',
        details
      }
    }

    let score = 5
    const findings = []
    if (!foundPublish) {
      score -= 2
      findings.push({ file, line: modifiedMeta?.line ?? modifiedBlock?.line ?? otherTimes[0]?.line ?? headLine, message: 'Missing publish date (article:published_time or JSON-LD datePublished)' })
    }
    if (!foundModified) {
      score -= 2
      findings.push({ file, line: publishedMeta?.line ?? publishBlock?.line ?? publishTimes[0]?.line ?? headLine, message: 'Missing modified date (article:modified_time, JSON-LD dateModified or <time datetime>)' })
    }

    return {
      score,
      predicted: !!(publishBlock?.templated || modifiedBlock?.templated),
      message: foundPublish && foundModified ? 'Publish and modified dates found' : `Found ${foundPublish ? 'publish' : 'modified'} date only`,
      findings,
      recommendation: findings.length ? `Add the missing ${foundPublish ? 'modified' : 'publish'} date as a meta tag (article:${foundPublish ? 'modified' : 'published'}_time) or in JSON-LD (${foundPublish ? 'dateModified' : 'datePublished'}).` : '',
      details
    }
  }
}
