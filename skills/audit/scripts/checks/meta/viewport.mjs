// meta.viewport - port of the extension's mobile-checker.js (3 pts)

const TAG = '<meta name="viewport" content="width=device-width, initial-scale=1">'

// Divergence: ';' is accepted as a separator (browsers do, with a console
// warning) and keys are case-insensitive, so "width=device-width; initial-scale=1"
// is not scored as a fixed width.
function parseViewport(content) {
  const settings = {}
  if (!content) return settings
  for (const part of content.split(/[,;]/).map(p => p.trim())) {
    const [key, value] = part.split('=').map(s => s.trim())
    if (key) settings[key.toLowerCase()] = value || true
  }
  return settings
}

export default {
  id: 'meta.viewport',
  scope: 'page',
  run({ page }) {
    const file = page.file
    const el = page.doc.querySelector('meta[name="viewport" i]')
    if (!el) {
      return {
        score: 0,
        message: 'No viewport meta tag found',
        findings: [{ file, line: page.doc.head?.line ?? 1, message: 'Missing <meta name="viewport">' }],
        recommendation: `Add ${TAG} to the shared <head>.`,
        details: { hasViewport: false, viewportContent: null, settings: {} }
      }
    }

    const line = el.line
    const content = el.getAttribute('content')
    const settings = parseViewport(content)
    let score = 3
    const findings = []

    const width = typeof settings.width === 'string' ? settings.width.toLowerCase() : settings.width
    const hasDeviceWidth = width === 'device-width'
    if (!hasDeviceWidth) {
      if (settings.width) {
        score -= 1.5
        findings.push({ file, line, message: 'Viewport sets a fixed width instead of device-width' })
      } else {
        score -= 1
        findings.push({ file, line, message: 'Viewport is missing width=device-width' })
      }
    }

    const hasInitialScale = !!settings['initial-scale']
    const initialScale = parseFloat(settings['initial-scale'])
    if (!hasInitialScale) {
      score -= 0.5
      findings.push({ file, line, message: 'Viewport is missing initial-scale=1' })
    } else if (initialScale !== 1) {
      score -= 0.25
      findings.push({ file, line, message: 'Viewport initial-scale is not 1' })
    }

    // Reported, not scored (same as the extension)
    const userScalable = String(settings['user-scalable'] ?? '').toLowerCase()
    if (userScalable === 'no' || userScalable === '0') findings.push({ file, line, message: 'user-scalable=no disables zoom (accessibility concern)' })
    if (settings['maximum-scale'] && parseFloat(settings['maximum-scale']) < 2) findings.push({ file, line, message: 'maximum-scale below 2 limits zoom (accessibility concern)' })
    const semicolons = !!content && content.includes(';')
    if (semicolons) findings.push({ file, line, message: 'Viewport uses ";" as separator (use ",")' })

    return {
      score: Math.max(0, score),
      message: hasDeviceWidth && hasInitialScale ? 'Mobile-friendly viewport configured' : 'Viewport present but may need optimization',
      findings,
      recommendation: findings.length ? `Use ${TAG}.` : '',
      details: { hasViewport: true, viewportContent: content, settings, hasDeviceWidth, hasInitialScale, initialScaleValue: Number.isNaN(initialScale) ? null : initialScale, semicolonSeparator: semicolons }
    }
  }
}
