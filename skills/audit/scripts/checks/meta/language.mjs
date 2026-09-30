// meta.language - port of the extension's language-checker.js (3 pts)

const LANGS = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'bn', 'pa', 'te', 'mr', 'ta', 'ur',
  'gu', 'kn', 'nl', 'pl', 'uk', 'ro', 'el', 'hu', 'cs', 'sv', 'da', 'fi', 'no', 'nb', 'nn', 'tr', 'th', 'vi',
  'id', 'ms', 'he', 'fa', 'sw', 'tl', 'fil', 'ca', 'eu', 'gl', 'sr', 'hr', 'bs', 'sk', 'sl', 'bg', 'mk', 'sq',
  'et', 'lv', 'lt', 'mt', 'is', 'ga', 'cy', 'af', 'zu', 'xh', 'am', 'ne', 'si', 'km', 'lo', 'my'
])
const REGIONS = new Set([
  'US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA', 'IN', 'PK', 'NG', 'ES', 'MX', 'AR', 'CO', 'PE', 'VE', 'CL', 'EC',
  'GT', 'CU', 'FR', 'BE', 'CH', 'LU', 'MC', 'DE', 'AT', 'IT', 'PT', 'BR', 'RU', 'UA', 'BY', 'KZ', 'JP', 'KR',
  'CN', 'TW', 'HK', 'SG', 'NL', 'PL', 'RO', 'GR', 'HU', 'CZ', 'SE', 'DK', 'FI', 'NO', 'TR', 'TH', 'VN', 'ID',
  'MY', 'PH', 'IL', 'AE', 'SA', 'EG', 'KE', 'GH', 'MA', 'DZ', 'TN', 'LY', 'ET', 'TZ', 'UG', 'ZW'
])
// Divergence: language[-Script][-REGION], where region may be a UN M.49 number (es-419)
const PATTERN = /^([a-z]{2,3})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?$/i
const RECOMMENDATION = 'Set <html lang="..."> to a valid language tag such as "en" or "en-US" in the root layout.'

let langNames = null
let regionNames = null
try {
  langNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'code' })
  regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'code' })
} catch {
  // no ICU data: only the built-in lists are used
}

// Divergence: codes outside the extension's short lists count as known when
// the runtime's ICU data has a name for them (e.g. "la", "LV").
function knownLang(code) {
  if (LANGS.has(code)) return true
  try {
    return !!langNames && langNames.of(code).toLowerCase() !== code
  } catch {
    return false
  }
}

function knownRegion(code) {
  if (/^\d{3}$/.test(code) || REGIONS.has(code)) return true
  try {
    const name = regionNames?.of(code)
    return !!name && name !== code && name !== 'Unknown Region'
  } catch {
    return false
  }
}

export default {
  id: 'meta.language',
  scope: 'page',
  run({ page }) {
    const file = page.file
    const doc = page.doc
    const html = doc.documentElement
    const line = html?.line ?? 1
    const lang = html?.getAttribute('lang') ?? null
    const hasLang = !!lang && lang.trim().length > 0

    let score = 3
    const findings = []
    let langValid = false
    let langCode = null
    let scriptCode = null
    let regionCode = null

    if (!hasLang) {
      score -= 2
      findings.push({ file, line, message: 'Missing lang attribute on <html>' })
    } else {
      const m = PATTERN.exec(lang.trim())
      if (!m) {
        score -= 0.5
        findings.push({ file, line, message: `Invalid lang format "${lang}" (expected "en" or "en-US")` })
      } else {
        langCode = m[1].toLowerCase()
        scriptCode = m[2] ? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : null
        regionCode = m[3] ? m[3].toUpperCase() : null
        if (!knownLang(langCode)) {
          score -= 0.5
          findings.push({ file, line, message: `Unrecognized language code "${langCode}"` })
        } else if (regionCode && !knownRegion(regionCode)) {
          score -= 0.25
          findings.push({ file, line, message: `Unrecognized region code "${regionCode}"` })
        } else {
          langValid = true
        }
      }
    }

    const hreflang = doc.querySelectorAll('link[hreflang]').map(el => ({ hreflang: el.getAttribute('hreflang'), href: el.getAttribute('href'), line: el.line }))
    const hasXDefault = hreflang.some(h => h.hreflang === 'x-default')
    // Informational only, not scored (same as the extension)
    if (hreflang.length > 1 && !hasXDefault) {
      findings.push({ file, line: hreflang[0].line, message: 'Multiple hreflang links but no x-default' })
    }
    const contentLanguage = doc.querySelector('meta[http-equiv="Content-Language" i]')?.getAttribute('content') || null

    let message
    if (hasLang && langValid) message = `Language: ${lang}${hreflang.length ? ` (${hreflang.length} hreflang link(s))` : ''}`
    else if (hasLang) message = `Language attribute present but may be invalid: ${lang}`
    else message = 'No language attribute found'

    return {
      score: Math.max(0, score),
      message,
      findings,
      recommendation: score < 3 ? RECOMMENDATION : (hreflang.length > 1 && !hasXDefault ? 'Add <link rel="alternate" hreflang="x-default" href="..."> for the fallback version.' : ''),
      details: {
        langAttribute: lang,
        hasLangAttribute: hasLang,
        langValid,
        parsedLangCode: langCode,
        parsedScriptCode: scriptCode,
        parsedRegionCode: regionCode,
        hreflangTags: hreflang.map(({ hreflang: h, href }) => ({ hreflang: h, href })),
        hasXDefault,
        contentLanguageMeta: contentLanguage
      }
    }
  }
}
