// Port of the extension's SchemaValidator (src/shared/schema-validator.js).
// validate(type, data, resolve) -> { valid: true|false|null, issues, warnings }
// valid is null for types without a validator. Issues make a node invalid;
// warnings never affect scores.
//
// Divergences from extension v1.3.1 (option A bug fixes):
// - ISO 8601 dates are checked against the ISO 8601 shape, not new Date()
//   (which accepts "March 5, 2024").
// - HowTo steps may be HowToSection groups of HowToStep items.
// - Pure {"@id"} references in mainEntity, acceptedAnswer, author, step and
//   itemListElement are resolved with the optional resolve function.
// - Template placeholders (unbuilt source) count as present values.

import { typesOf, TEMPLATE_PLACEHOLDER } from './jsonld.mjs'

export const LOCAL_BUSINESS_TYPES = [
  'LocalBusiness', 'Restaurant', 'Store', 'MedicalBusiness',
  'LegalService', 'FinancialService', 'FoodEstablishment',
  'HealthAndBeautyBusiness', 'HomeAndConstructionBusiness',
  'EntertainmentBusiness', 'AutomotiveBusiness'
]
export const ORGANIZATION_SUBTYPES = [
  'Corporation', 'GovernmentOrganization', 'EducationalOrganization',
  'MedicalOrganization', 'NGO', 'Airline'
]
export const ORGANIZATION_TYPES = ['Organization', ...LOCAL_BUSINESS_TYPES, ...ORGANIZATION_SUBTYPES]
export const ARTICLE_TYPES = ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle']

const AVAILABILITY = ['InStock', 'OutOfStock', 'PreOrder', 'BackOrder', 'Discontinued', 'InStoreOnly', 'OnlineOnly', 'LimitedAvailability', 'SoldOut']
const VALID_AVAILABILITY = new Set(AVAILABILITY.flatMap(v => [v, `https://schema.org/${v}`]))

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

const identity = v => v
const arr = v => (Array.isArray(v) ? v : [v])
const isTemplate = v => typeof v === 'string' && v.includes(TEMPLATE_PLACEHOLDER)

export function isValidISO8601(value) {
  if (!value || typeof value !== 'string') return false
  if (isTemplate(value)) return true
  const v = value.trim()
  if (!ISO_8601.test(v)) return false
  return !isNaN(new Date(v).getTime())
}

// Which validator a type uses (null = none). Used to group @type arrays.
export function validatorKind(type) {
  if (type === 'FAQPage' || type === 'HowTo' || type === 'Product' || type === 'Person' ||
      type === 'BreadcrumbList' || type === 'ItemList' || type === 'VideoObject' || type === 'Dataset') return type
  if (ORGANIZATION_TYPES.includes(type)) return 'Organization'
  if (ARTICLE_TYPES.includes(type)) return 'Article'
  return null
}

function faqPage(data, resolve) {
  const issues = []
  const warnings = []
  if (!data.mainEntity || !Array.isArray(data.mainEntity)) {
    return { valid: false, issues: ['Missing or invalid mainEntity array'], warnings, questionCount: 0 }
  }
  data.mainEntity.forEach((raw, index) => {
    const question = resolve(raw) || {}
    if (!typesOf(question).includes('Question')) issues.push(`Item ${index}: Not a Question type`)
    if (!question.name) issues.push(`Question ${index}: Missing "name" (question text)`)
    const answer = resolve(question.acceptedAnswer)
    if (!answer) {
      issues.push(`Question ${index}: Missing acceptedAnswer`)
    } else {
      const a = Array.isArray(answer) ? resolve(answer[0]) || {} : answer
      if (!typesOf(a).includes('Answer')) issues.push(`Question ${index}: acceptedAnswer is not Answer type`)
      if (!a.text) issues.push(`Question ${index}: acceptedAnswer missing text`)
    }
  })
  return { valid: issues.length === 0, issues, warnings, questionCount: data.mainEntity.length }
}

function howTo(data, resolve) {
  const issues = []
  const warnings = []
  if (!data.name) issues.push('Missing "name" field')
  if (!data.step || !Array.isArray(data.step)) {
    issues.push('Missing or invalid "step" array')
    return { valid: false, issues, warnings, stepCount: 0 }
  }
  // Flatten HowToSection groups into their steps
  const steps = []
  data.step.forEach((raw, index) => {
    const step = resolve(raw) || {}
    if (typesOf(step).includes('HowToSection')) {
      const items = Array.isArray(step.itemListElement) ? step.itemListElement : []
      if (items.length === 0) issues.push(`Step ${index}: HowToSection has no itemListElement steps`)
      items.forEach((s, j) => steps.push({ step: resolve(s) || {}, label: `${index}.${j}` }))
    } else {
      steps.push({ step, label: String(index) })
    }
  })
  if (steps.length < 2) issues.push('HowTo should have at least 2 steps')
  for (const { step, label } of steps) {
    if (!typesOf(step).includes('HowToStep')) issues.push(`Step ${label}: Not a HowToStep type`)
    if (!step.text && !step.name) issues.push(`Step ${label}: Missing text or name`)
  }
  if (data.video) {
    const video = videoObject(resolve(data.video) || {})
    if (!video.valid) warnings.push('HowTo has video but with issues: ' + video.issues.slice(0, 2).join('; '))
  }
  return { valid: issues.length === 0, issues, warnings, stepCount: steps.length }
}

function product(data, resolve) {
  const issues = []
  const warnings = []
  for (const field of ['name', 'image', 'description']) {
    if (!data[field]) issues.push(`Missing required field: ${field}`)
  }
  if (!data.offers) {
    issues.push('Missing offers (price information)')
  } else {
    const offers = arr(data.offers).map(o => resolve(o) || {})
    offers.forEach((offer, idx) => {
      const prefix = offers.length > 1 ? `Offer[${idx}]: ` : ''
      if (!offer.price && offer.price !== 0 && !offer.priceRange && !offer.lowPrice) issues.push(`${prefix}Missing price or priceRange`)
      if (!offer.priceCurrency) issues.push(`${prefix}Missing priceCurrency`)
      if (!offer.availability) warnings.push(`${prefix}Missing availability (recommended)`)
      else if (!VALID_AVAILABILITY.has(offer.availability) && !isTemplate(offer.availability)) warnings.push(`${prefix}Invalid availability value`)
    })
  }
  if (data.aggregateRating) {
    const rating = resolve(data.aggregateRating) || {}
    if (!rating.ratingValue && rating.ratingValue !== 0) issues.push('AggregateRating missing ratingValue')
    if (!rating.reviewCount && !rating.ratingCount) warnings.push('AggregateRating should have reviewCount or ratingCount')
  }
  if (data.review) {
    arr(data.review).slice(0, 3).forEach((review, idx) => {
      if (!review?.author) warnings.push(`Review[${idx}]: Missing author`)
      if (!review?.reviewRating) warnings.push(`Review[${idx}]: Missing reviewRating`)
    })
  }
  return { valid: issues.length === 0, issues, warnings }
}

function organization(data, resolve, types) {
  const issues = []
  const warnings = []
  const isLocalBusiness = types.some(t => LOCAL_BUSINESS_TYPES.includes(t))
  if (!data.name) issues.push('Missing required field: name')
  if (!data.url && !data['@id']) warnings.push('Missing url (recommended for top-level Organization)')
  if (!data.logo) warnings.push('Missing logo (recommended)')
  if (!data.sameAs || !Array.isArray(data.sameAs) || data.sameAs.length === 0) warnings.push('Missing sameAs links (social profiles, Wikipedia, etc.)')
  if (isLocalBusiness) {
    if (!data.address) {
      warnings.push('LocalBusiness should have address (PostalAddress)')
    } else {
      const addr = resolve(data.address) || {}
      if (!addr.streetAddress) warnings.push('Address missing streetAddress')
      if (!addr.addressLocality) warnings.push('Address missing addressLocality')
    }
    if (!data.telephone) warnings.push('LocalBusiness should have telephone')
    if (!data.openingHoursSpecification && !data.openingHours) warnings.push('LocalBusiness should have openingHours')
  }
  return { valid: issues.length === 0, issues, warnings, isLocalBusiness }
}

function article(data, resolve) {
  const issues = []
  const warnings = []
  if (!data.headline) issues.push('Missing required field: headline')
  else if (typeof data.headline === 'string' && data.headline.length > 110) warnings.push('Headline exceeds 110 characters (may be truncated)')
  if (!data.author) {
    issues.push('Missing required field: author')
  } else {
    const author = resolve(Array.isArray(data.author) ? data.author[0] : data.author)
    if (typeof author === 'string') warnings.push('Author should be Person/Organization object, not just a string')
    else if (author && !author.name) issues.push('Author missing name property')
  }
  if (!data.datePublished) issues.push('Missing required field: datePublished')
  else if (!isValidISO8601(data.datePublished)) issues.push('datePublished is not valid ISO 8601 format')
  if (!data.image) warnings.push('Missing image (recommended)')
  if (!data.dateModified) warnings.push('Consider adding dateModified for freshness signals')
  if (!data.publisher) warnings.push('Missing publisher (recommended)')
  return { valid: issues.length === 0, issues, warnings }
}

function person(data) {
  const issues = []
  const warnings = []
  if (!data.name) issues.push('Missing required field: name')
  if (!data.jobTitle) warnings.push('Consider adding jobTitle for expertise signals')
  if (!data.worksFor) warnings.push('Consider adding worksFor (Organization) for authority')
  if (!data.sameAs || (Array.isArray(data.sameAs) && data.sameAs.length === 0)) warnings.push('Consider adding sameAs links (LinkedIn, Twitter, etc.)')
  if (!data.image) warnings.push('Consider adding image for recognition')
  return { valid: issues.length === 0, issues, warnings, hasExpertiseSignals: !!(data.jobTitle || data.worksFor) }
}

function breadcrumbList(data, resolve) {
  const issues = []
  const warnings = []
  if (!data.itemListElement || !Array.isArray(data.itemListElement)) {
    return { valid: false, issues: ['Missing or invalid itemListElement array'], warnings, itemCount: 0 }
  }
  const items = data.itemListElement
  if (items.length < 2) warnings.push('BreadcrumbList should have at least 2 items')
  items.forEach((raw, index) => {
    const item = resolve(raw) || {}
    if (!typesOf(item).includes('ListItem')) warnings.push(`Item[${index}]: Should be ListItem type`)
    // Kept from the extension: position must be truthy (Google requires positions from 1)
    if (!item.position) issues.push(`Item[${index}]: Missing position`)
    if (!item.name && !item.item?.name) issues.push(`Item[${index}]: Missing name`)
    if (index < items.length - 1 && !item.item) warnings.push(`Item[${index}]: Missing item URL (except for last breadcrumb)`)
  })
  return { valid: issues.length === 0, issues, warnings, itemCount: items.length }
}

function itemList(data) {
  const warnings = []
  if (!data.itemListElement || !Array.isArray(data.itemListElement)) {
    return { valid: false, issues: ['Missing or invalid itemListElement array'], warnings, itemCount: 0 }
  }
  if (!data.numberOfItems) warnings.push('Consider adding numberOfItems property')
  else if (data.numberOfItems !== data.itemListElement.length) warnings.push('numberOfItems does not match actual item count')
  return { valid: true, issues: [], warnings, itemCount: data.itemListElement.length }
}

function videoObject(data) {
  const issues = []
  const warnings = []
  if (!data.name) issues.push('Missing required field: name')
  if (!data.description) issues.push('Missing required field: description')
  if (!data.thumbnailUrl) issues.push('Missing required field: thumbnailUrl')
  if (!data.uploadDate) issues.push('Missing required field: uploadDate')
  else if (!isValidISO8601(data.uploadDate)) issues.push('uploadDate is not valid ISO 8601 format')
  if (!data.contentUrl && !data.embedUrl) warnings.push('Should have contentUrl or embedUrl')
  if (!data.duration) warnings.push('Consider adding duration (ISO 8601 format, e.g., PT1M30S)')
  if (!data.publisher) warnings.push('Consider adding publisher (Organization)')
  return { valid: issues.length === 0, issues, warnings }
}

function dataset(data) {
  const issues = []
  const warnings = []
  if (!data.name) issues.push('Missing required field: name')
  if (!data.description) issues.push('Missing required field: description')
  if (!data.keywords) warnings.push('Missing recommended field: keywords')
  if (!data.distribution) {
    warnings.push('Missing distribution (DataDownload) - how to access the data')
  } else {
    const dist = (Array.isArray(data.distribution) ? data.distribution[0] : data.distribution) || {}
    if (!dist.contentUrl && !dist.url) warnings.push('Distribution missing contentUrl or url')
    if (!dist.encodingFormat && !dist.fileFormat) warnings.push('Distribution missing encodingFormat/fileFormat')
  }
  if (!data.license) warnings.push('Consider adding license information')
  if (!data.creator && !data.author) warnings.push('Consider adding creator or author')
  return { valid: issues.length === 0, issues, warnings }
}

const VALIDATORS = {
  FAQPage: faqPage,
  HowTo: howTo,
  Product: product,
  Organization: organization,
  Article: article,
  Person: person,
  BreadcrumbList: breadcrumbList,
  ItemList: itemList,
  VideoObject: videoObject,
  Dataset: dataset
}

// type: a schema.org type name (prefix already stripped). data: the node.
export function validate(type, data, resolve = identity) {
  const kind = validatorKind(type)
  if (!kind || !data || typeof data !== 'object') {
    return { valid: null, issues: [], warnings: [], message: `No specific validation for type: ${type}` }
  }
  return VALIDATORS[kind](data, resolve, typesOf(data))
}

// Validates every typed JSON-LD node once. Returns one entry per node and
// validator kind: { node, type, kind, line, reference, validation }.
// A typed node that only points at a fuller definition of the same @id on
// the page ({"@type": "Organization", "@id": "#org"}) is a reference: it is
// reported with reference: true and validation null, and the full node is
// validated instead.
export function validateNodes(nodes, resolve = identity) {
  const best = new Map()
  for (const { node } of nodes) {
    const id = node['@id']
    if (typeof id !== 'string') continue
    const cur = best.get(id)
    if (!cur || Object.keys(node).length > Object.keys(cur).length) best.set(id, node)
  }
  const out = []
  for (const { node, types, line, path } of nodes) {
    const full = typeof node['@id'] === 'string' ? best.get(node['@id']) : null
    const reference = !!full && full !== node && Object.keys(full).length > Object.keys(node).length
    const seenKinds = new Set()
    for (const type of types) {
      const kind = validatorKind(type)
      const key = kind || `other:${type}`
      if (seenKinds.has(key)) continue
      seenKinds.add(key)
      out.push({ node, type, kind, line, path, reference, validation: reference ? null : validate(type, node, resolve) })
    }
  }
  return out
}
