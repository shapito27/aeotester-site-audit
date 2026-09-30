// content.author - port of the extension's author-signals-checker.js (5 pts)

import { extractJsonLd, resolver, typesOf } from '../../lib/jsonld.mjs'

const EXPERTISE = [
  /\b(PhD|Ph\.D|Ed\.D|Sc\.D|DPhil|D\.Phil)\b/i,
  /\b(MD|M\.D|DO|D\.O|DDS|DMD|PharmD|DVM|JD|J\.D)\b/i,
  /\b(MBA|MFA|MPH|MSW|MEd|M\.Ed|LLM|LL\.M)\b/i,
  /\b(MA|M\.A|MS|M\.S|MSc|M\.Sc|MEng|M\.Eng)\b/i,
  /\b(BA|B\.A|BS|B\.S|BSc|B\.Sc|BEng|B\.Eng)\b/i,
  /\b(Dr\.|Prof\.)(?=\s|$)/i,
  /\b(Professor|Lecturer|Researcher|Fellow)\b/i,
  /\b(Associate\s+Professor|Assistant\s+Professor|Adjunct\s+Professor)\b/i,
  /\b(Founder|Co-?Founder|CEO|CTO|CFO|COO|CMO|CIO|CISO)\b/i,
  /\b(President|Vice\s+President|VP|Director|Managing\s+Director)\b/i,
  /\b(Senior|Lead|Principal|Staff|Chief|Head\s+of)\s+\w+/i,
  /\b(Editor|Editor-in-Chief|Managing\s+Editor|Executive\s+Editor)\b/i,
  /\b(Journalist|Reporter|Correspondent|Columnist|Analyst)\b/i,
  /\b(Author|Writer|Contributor)\b/i,
  /\b(AWS\s+Certified|AWS\s+Solutions\s+Architect|AWS\s+Developer)\b/i,
  /\b(Google\s+Cloud|GCP\s+Certified|Google\s+Certified)\b/i,
  /\b(Azure\s+Certified|Microsoft\s+Certified|MCSE|MCSA|MCP)\b/i,
  /\b(Cisco\s+Certified|CCNA|CCNP|CCIE)\b/i,
  /\b(CompTIA|A\+|Network\+|Security\+|CASP)\b/i,
  /\b(CISSP|CISM|CISA|CEH|OSCP|GIAC|GSEC)\b/i,
  /\b(PMP|PMI|PRINCE2|Scrum\s+Master|CSM|PSM|SAFe)\b/i,
  /\b(Six\s+Sigma|Lean\s+Six\s+Sigma|Black\s+Belt|Green\s+Belt)\b/i,
  /\b(CPA|CFA|CFP|CMA|CIA|ACCA|FRM)\b/i,
  /\b(RN|NP|PA-C|APRN|LPN|CNA|Board-?Certified)\b/i,
  /\b(Esq\.)(?=\s|,|$)/i,
  /\b(Attorney|Barrister|Solicitor|Bar\s+Admitted)\b/i,
  /\b(Realtor|Licensed\s+Agent|CLU|ChFC|CPCU)\b/i,
  /\b(Certified|Licensed|Registered|Accredited|Chartered)\b/i,
  /\b(Board-?Certified|State-?Licensed|Nationally\s+Certified)\b/i,
  /\b(Expert|Specialist|Consultant|Advisor|Strategist)\b/i,
  /\b(Practitioner|Professional|Veteran|Authority)\b/i,
  /\b(\d{1,2}\+?\s*years?\s*(of\s+)?experience)\b/i,
  /\b(decade[s]?\s+of\s+experience)\b/i,
  /\b(over\s+\d+\s+years?)\b/i,
  /\b(more\s+than\s+\d+\s+years?)\b/i,
  /\b(Award-?winning|Prize-?winning|Best-?selling)\b/i,
  /\b(Published\s+(in|author|writer)|Featured\s+in)\b/i,
  /\b(Recognized\s+by|Honored\s+by|Recipient\s+of)\b/i,
  /\b(Member\s+of|Fellow\s+of|Inducted\s+into)\b/i,
  /\b(Peer-?reviewed|Published\s+research|Research\s+scientist)\b/i,
  /\b(Tenured|Faculty\s+member|Department\s+(head|chair))\b/i
]

const EXPERIENCE = [
  /\b(in\s+my\s+experience|from\s+my\s+experience|based\s+on\s+my\s+experience)\b/i,
  /\b(I've\s+found|I've\s+learned|I've\s+worked|I've\s+seen)\b/i,
  /\b(I\s+have\s+spent|I\s+have\s+worked|I\s+have\s+been)\b/i,
  /\b(we've|we\s+have|our\s+team|our\s+experience)\b/i,
  /\b(personally|hands-on|firsthand|real-world)\b/i,
  /\b(throughout\s+my\s+career|during\s+my\s+time|in\s+my\s+years)\b/i
]

// Divergence: the two name-shaped patterns are case-sensitive on the name,
// as the extension's comments intend ("by the way" and "about this" no longer match).
const AUTHOR_SECTION = [
  /about\s+the\s+author/i,
  /meet\s+the\s+author/i,
  /author\s*:/i,
  /written\s+by/i,
  /article\s+by/i,
  /posted\s+by/i,
  /\b[Bb]y\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
  /contributor/i,
  /bio(?:graphy)?:/i,
  /\b[Aa]bout\s+[A-Z][a-z]+/
]

// Divergence: leading word boundary, so "Nearby Coffee Shop" is not a byline
const NAME_FROM_CONTAINER = /\b(?:[Bb]y|[Ww]ritten\s+[Bb]y|[Aa]uthor:?)[ ]+([A-Z][a-z]+(?:[ ]+[A-Z][a-z]+){1,3})/

const AUTHORITY_SELECTORS = [
  '[itemprop="author"]', '[itemtype*="Person"]', '[rel="author"]',
  '.author-bio', '.author-box', '.about-author', '[class*="author-bio"]', '[class*="author-box"]',
  '.byline', '.post-author', '.article-author', '.contributor', '.writer-bio'
]
const AUTHOR_LINK_PATHS = ['/author/', '/about', '/contributor/', '/writer/']
const TRUST_PATHS = { hasAboutPage: '/about', hasContactPage: '/contact', hasPrivacyPolicy: '/privacy', hasTerms: '/terms' }
const ARTICLE_LIKE = ['Article', 'BlogPosting', 'NewsArticle', 'WebPage', 'Review', 'HowTo', 'Recipe']

function personName(p) {
  if (!p || typeof p !== 'object') return null
  if (p.name) return typeof p.name === 'string' ? p.name.trim() || null : null
  if (p.givenName || p.familyName) return [p.givenName, p.familyName].filter(Boolean).join(' ').trim() || null
  return null
}

function parseAuthorProperty(author, resolve) {
  author = resolve(author)
  if (!author) return { authorName: null, author: null }
  if (typeof author === 'string') return { authorName: author.trim() || null, author: null }
  if (Array.isArray(author)) return author.length ? parseAuthorProperty(author[0], resolve) : { authorName: null, author: null }
  if (typeof author === 'object') return { authorName: personName(author), author }
  return { authorName: null, author: null }
}

// Port of parseSchemaForAuthor. personFound is new: a Person (or an article
// author) without a usable name still counts as an author marker.
function parseSchema(data, resolve, depth = 0) {
  const r = { authorName: null, author: null, articleHasAuthor: false, personFound: false }
  if (!data || typeof data !== 'object' || depth > 5) return r
  const merge = p => {
    if (p.articleHasAuthor) r.articleHasAuthor = true
    if (p.personFound) r.personFound = true
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const p = parseSchema(item, resolve, depth + 1)
      if (p.authorName) return p
      merge(p)
    }
    return r
  }
  const types = typesOf(data)
  if (types.includes('Person')) {
    return { ...r, author: data, authorName: personName(data), personFound: true }
  }
  if (types.some(t => ARTICLE_LIKE.includes(t)) && data.author) {
    r.articleHasAuthor = true
    const a = parseAuthorProperty(data.author, resolve)
    if (a.authorName) Object.assign(r, a)
  }
  if (Array.isArray(data['@graph'])) {
    for (const item of data['@graph']) {
      const p = parseSchema(item, resolve, depth + 1)
      if (p.authorName && !r.authorName) {
        r.authorName = p.authorName
        r.author = p.author
      }
      merge(p)
    }
  }
  if (!r.authorName) {
    for (const [key, value] of Object.entries(data)) {
      if (key === '@type' || key === '@context' || key === '@graph') continue
      if (typeof value !== 'object' || value === null) continue
      for (const item of Array.isArray(value) ? value : [value]) {
        const p = parseSchema(item, resolve, depth + 1)
        if (p.authorName) return { ...r, authorName: p.authorName, author: p.author, personFound: true }
        merge(p)
      }
    }
  }
  return r
}

function fromSchema(doc) {
  const { blocks, nodes } = extractJsonLd(doc, { templates: true })
  const resolve = resolver(nodes)
  const out = { found: false, authorName: null, author: null, articleHasAuthor: false, line: null, templated: false }
  for (const b of blocks) {
    if (!b.data) continue
    const p = parseSchema(b.data, resolve)
    if (p.authorName) {
      Object.assign(out, { found: true, authorName: p.authorName, author: p.author, line: b.line, templated: b.templated })
    }
    if (p.articleHasAuthor || p.personFound) {
      out.found = true
      out.line ??= b.line
    }
    if (p.articleHasAuthor) out.articleHasAuthor = true
  }
  return out
}

function fromMicrodata(doc) {
  const out = { found: false, authorName: null, authorBioText: null, line: null }
  for (const el of doc.querySelectorAll('[itemprop="author"]')) {
    out.found = true
    out.line ??= el.line
    const nameEl = el.querySelector('[itemprop="name"]')
    const text = el.textContent
    if (nameEl) out.authorName = nameEl.textContent.trim() || null
    else if (text.trim().length < 100 && text.trim().length > 1) out.authorName = text.trim()
    if (text.length > 20) out.authorBioText = text.substring(0, 2000)
    if (out.authorName) {
      out.line = el.line
      break
    }
  }
  if (!out.authorName) {
    for (const el of doc.querySelectorAll('[itemtype*="schema.org/Person"]')) {
      out.found = true
      out.line ??= el.line
      const nameEl = el.querySelector('[itemprop="name"]')
      if (nameEl) {
        out.authorName = nameEl.textContent.trim() || null
        out.authorBioText = el.textContent.substring(0, 2000) || null
        out.line = el.line
        break
      }
    }
  }
  return out
}

function fromMeta(doc) {
  const out = { hasAuthorMeta: false, authorName: null, line: null }
  const meta = doc.querySelector('meta[name="author"]')
  if (meta) {
    out.hasAuthorMeta = true
    out.line = meta.line
    out.authorName = (meta.getAttribute('content') || '').trim() || null
  }
  if (!out.authorName) {
    const og = doc.querySelector('meta[property="article:author"]')
    if (og?.getAttribute('content')) {
      out.authorName = og.getAttribute('content').trim()
      out.line = og.line
    }
  }
  if (!out.authorName) {
    const tw = doc.querySelector('meta[name="twitter:creator"]')
    if (tw?.getAttribute('content')) {
      const c = tw.getAttribute('content').trim()
      out.authorName = c.startsWith('@') ? c.substring(1) : c
      out.line = tw.line
    }
  }
  return out
}

function fromTextPatterns(doc, bodyText) {
  const out = { authorName: null, authorBioText: null, line: null }
  const elements = doc.querySelectorAll('h2, h3, h4, h5, p, div, section, aside')
  const text = new Map()
  const tc = el => {
    if (!text.has(el)) text.set(el, el.textContent)
    return text.get(el)
  }
  for (const pattern of AUTHOR_SECTION) {
    if (!pattern.test(bodyText)) continue
    for (const el of elements) {
      if (!pattern.test(tc(el))) continue
      const container = el.closest('section, article, aside, div') || el.parentElement
      if (container) {
        const containerText = tc(container)
        if (containerText.length > 20 && containerText.length < 3000) {
          out.authorBioText = containerText
          out.line = container.line
        }
        const by = containerText.match(NAME_FROM_CONTAINER)
        if (by) {
          out.authorName = by[1].trim()
          out.line = container.line
        }
      }
      break
    }
    if (out.authorBioText) break
  }
  return out
}

function fromSelectors(doc, linkTo) {
  const candidates = [...AUTHORITY_SELECTORS.map(s => doc.querySelector(s)), ...AUTHOR_LINK_PATHS.map(p => linkTo(p)?.el)]
  for (const el of candidates) {
    const text = el?.textContent.trim()
    if (text && text.length > 20 && text.length < 3000) return { authorBioText: text, line: el.line }
  }
  return { authorBioText: null, line: null }
}

export default {
  id: 'content.author',
  scope: 'page',
  run({ page }) {
    const { doc } = page
    const file = page.file
    const headLine = doc.head?.line ?? 1
    const bodyLine = doc.body?.line ?? headLine
    const bodyText = doc.body?.innerText || ''

    // Divergence: hrefs are matched on their resolved path as well as the raw
    // value, so relative links like href="about.html" count.
    const anchors = doc.querySelectorAll('a[href]').map(a => {
      const raw = a.getAttribute('href')
      let path = ''
      try {
        path = new URL(raw, page.url).pathname
      } catch {
        // unparseable href
      }
      return { el: a, raw, path }
    })
    const linkTo = sub => anchors.find(a => a.raw.includes(sub) || a.path.includes(sub)) || null

    // Author detection, in the extension's priority order
    const schema = fromSchema(doc)
    const result = {
      authorName: schema.authorName,
      detectionMethod: schema.authorName ? 'schema' : null,
      hasSchemaAuthor: schema.found,
      hasMicrodataAuthor: false,
      hasAuthorMeta: false,
      articleHasAuthor: schema.articleHasAuthor,
      schemaAuthor: schema.author,
      authorBioText: null,
      line: schema.authorName ? schema.line : null
    }
    if (!result.authorName) {
      const md = fromMicrodata(doc)
      if (md.found) {
        result.hasMicrodataAuthor = true
        if (md.authorName) Object.assign(result, { authorName: md.authorName, detectionMethod: 'microdata', line: md.line })
        if (md.authorBioText) result.authorBioText = md.authorBioText
      }
    }
    const meta = fromMeta(doc)
    result.hasAuthorMeta = meta.hasAuthorMeta
    if (!result.authorName && meta.authorName) Object.assign(result, { authorName: meta.authorName, detectionMethod: 'meta', line: meta.line })
    let bioLine = null
    if (!result.authorName || !result.authorBioText) {
      const t = fromTextPatterns(doc, bodyText)
      if (t.authorName && !result.authorName) Object.assign(result, { authorName: t.authorName, detectionMethod: 'text-pattern', line: t.line })
      if (t.authorBioText) {
        result.authorBioText = t.authorBioText
        bioLine = t.line
      }
    }
    if (!result.authorBioText) {
      const c = fromSelectors(doc, linkTo)
      if (c.authorBioText) {
        result.authorBioText = c.authorBioText
        bioLine = c.line
      }
    }

    // E-E-A-T text
    const sources = []
    if (result.authorBioText) sources.push(result.authorBioText)
    const sa = result.schemaAuthor
    if (sa) {
      if (sa.jobTitle) sources.push(String(sa.jobTitle))
      if (sa.description) sources.push(String(sa.description))
      for (const key of ['hasCredential', 'alumniOf']) {
        if (!sa[key]) continue
        for (const c of Array.isArray(sa[key]) ? sa[key] : [sa[key]]) {
          if (typeof c === 'string') sources.push(c)
          if (c?.name) sources.push(String(c.name))
        }
      }
      if (sa.knowsAbout) for (const k of Array.isArray(sa.knowsAbout) ? sa.knowsAbout : [sa.knowsAbout]) sources.push(String(k))
    }
    sources.push(bodyText.substring(0, 5000))
    const combined = sources.join(' ')
    const expertise = [...new Set(EXPERTISE.map(p => combined.match(p)?.[0]).filter(Boolean))]
    const experience = EXPERIENCE.map(p => combined.match(p)?.[0]).filter(Boolean)

    // Authoritativeness
    let hasAuthorBio = !!result.authorBioText
    if (doc.querySelector('[itemprop="author"]') || doc.querySelector('[itemtype*="Person"]')) hasAuthorBio = true
    if (doc.querySelector('.author-bio, .about-author, [class*="author-bio"]')) hasAuthorBio = true
    const authorLink = AUTHOR_LINK_PATHS.map(linkTo).find(Boolean) || null
    const hasAuthorLink = !!authorLink
    const hasSocialProfiles = anchors.some(a => ['twitter.com', 'linkedin.com', 'github.com', 'facebook.com'].some(s => a.raw.includes(s)))

    // Trustworthiness
    const trust = {}
    for (const [key, sub] of Object.entries(TRUST_PATHS)) trust[key] = !!linkTo(sub)
    trust.hasAddress = !!(doc.querySelector('address') || doc.querySelector('[itemtype*="PostalAddress"]'))
    const trustScore = Object.values(trust).filter(Boolean).length

    // Score
    let score = 0
    const findings = []
    if (result.authorName) {
      score += 2
    } else if (result.hasAuthorMeta || result.hasSchemaAuthor || result.hasMicrodataAuthor) {
      score += 1
      findings.push({ file, line: meta.line ?? schema.line ?? headLine, message: 'Author markup found but the author name is empty or unclear' })
    } else {
      findings.push({ file, line: headLine, message: 'No author attribution (JSON-LD author, meta name="author" or byline)' })
    }
    if (expertise.length) score += 1
    else findings.push({ file, line: bioLine ?? bodyLine, message: 'No expertise signals (credentials, job title, years of experience) near the author or in the page text' })
    if (hasAuthorBio || hasAuthorLink) score += 1
    else findings.push({ file, line: bodyLine, message: 'No author bio section or link to an author/about page' })
    if (trustScore >= 3) score += 1
    else {
      const missing = [...Object.entries(TRUST_PATHS).filter(([k]) => !trust[k]).map(([, v]) => v), ...(trust.hasAddress ? [] : ['<address>'])]
      findings.push({ file, line: bodyLine, message: `Fewer than 3 trust signals; missing: ${missing.join(', ')}` })
    }
    score = Math.min(score, 5)

    // Recommendation (extension order, first two)
    const recs = []
    if (!result.authorName && !result.hasAuthorMeta && !result.hasSchemaAuthor) recs.push('Add author attribution: a JSON-LD Person as the Article author, or <meta name="author">')
    else if (!result.authorName) recs.push('Fill in the author name in your author markup')
    if (!result.hasSchemaAuthor && result.authorName) recs.push('Add a JSON-LD Person (name, jobTitle, sameAs) as the author')
    if (!expertise.length) recs.push('Add credentials (certifications, degrees, years of experience) to establish expertise')
    if (!hasAuthorBio && !hasAuthorLink) recs.push('Add an author bio section with background and qualifications')
    if (trustScore < 3) {
      const missing = ['hasAboutPage', 'hasContactPage', 'hasPrivacyPolicy'].filter(k => !trust[k]).map(k => TRUST_PATHS[k])
      if (missing.length) recs.push(`Link to ${missing.slice(0, 2).join(' and ')} page${missing.length > 1 ? 's' : ''} for trustworthiness`)
    }
    if (!result.articleHasAuthor && result.authorName) recs.push('Add an author property to your Article/BlogPosting schema')

    const found = []
    const missing = []
    if (result.authorName) found.push(`Author: "${result.authorName}"${result.detectionMethod === 'schema' ? ' (schema)' : ''}`)
    else missing.push(result.hasAuthorMeta || result.hasSchemaAuthor || result.hasMicrodataAuthor ? 'author name (detected but empty)' : 'author attribution')
    if (expertise.length) found.push(`expertise (${expertise[0]})`)
    else missing.push('expertise credentials')
    if (hasAuthorBio) found.push('author bio')
    else if (hasAuthorLink) found.push('author link')
    else missing.push('author bio/profile')
    if (trustScore >= 3) found.push(`${trustScore}/5 trust signals`)
    else missing.push(trustScore > 0 ? `trust signals (only ${trustScore}/5)` : 'trust signals (about/contact pages)')
    const message = found.length === 0 ? `Missing: ${missing.slice(0, 3).join(', ')}`
      : missing.length === 0 ? found.join(' + ')
        : found.length >= missing.length ? `${found.join(' + ')}. Missing: ${missing[0]}`
          : `Missing: ${missing.slice(0, 2).join(', ')}. Found: ${found[0]}`

    return {
      score,
      predicted: schema.templated && result.detectionMethod === 'schema',
      message,
      findings,
      recommendation: score < 5 ? recs.slice(0, 2).join('. ') : '',
      details: {
        authorName: result.authorName,
        detectionMethod: result.detectionMethod,
        hasAuthorMeta: result.hasAuthorMeta,
        hasSchemaAuthor: result.hasSchemaAuthor,
        hasMicrodataAuthor: result.hasMicrodataAuthor,
        hasArticleAuthor: result.articleHasAuthor,
        authorLine: result.line,
        eeat: {
          expertise: { found: expertise.length > 0, matches: expertise.slice(0, 5) },
          experience: { found: experience.length > 0, matches: experience.slice(0, 3) },
          authoritativeness: { hasAuthorBio, hasAuthorLink, authorLink: authorLink?.raw ?? null, hasSocialProfiles },
          trustworthiness: { signals: trust, score: trustScore, maxScore: 5 }
        }
      }
    }
  }
}
