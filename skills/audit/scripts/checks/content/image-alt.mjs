// content.image-alt - port of the extension's image-alt-checker.js (5 pts)

// Divergence: an image with alt="" that is also marked decorative
// (role="presentation"/"none" or aria-hidden="true") is left out of the count.
// The extension counts it as missing while recommending alt="" for decorative images.
function isDecorative(img) {
  const role = (img.getAttribute('role') || '').trim().toLowerCase()
  return img.getAttribute('alt') !== null && !img.getAttribute('alt').trim() &&
    (role === 'presentation' || role === 'none' || (img.getAttribute('aria-hidden') || '').trim().toLowerCase() === 'true')
}

export default {
  id: 'content.image-alt',
  scope: 'page',
  run({ page }) {
    const file = page.file
    const all = page.doc.querySelectorAll('img')
    const decorative = all.filter(isDecorative)
    const images = all.filter(img => !decorative.includes(img))
    const total = images.length
    if (total === 0) {
      return {
        score: 5,
        message: all.length ? `No content images (${decorative.length} decorative)` : 'No images found on page',
        findings: [],
        recommendation: '',
        details: { totalImages: 0, imagesWithAlt: 0, imagesMissingAlt: 0, decorativeImages: decorative.length, percentage: 100 }
      }
    }

    const findings = []
    let withAlt = 0
    for (const img of images) {
      const alt = img.getAttribute('alt')
      if (alt !== null && alt.trim().length > 0) {
        withAlt++
        continue
      }
      const src = img.getAttribute('src') || img.getAttribute('data-src') || ''
      const what = src ? `<img src="${src}">` : '<img>'
      findings.push({ file, line: img.line, message: alt === null ? `${what} has no alt attribute` : `${what} has empty alt text` })
    }
    const missing = total - withAlt
    const percentage = Math.round((withAlt / total) * 100)
    const score = Math.round((percentage / 100) * 5)

    return {
      score,
      message: `${withAlt}/${total} images have alt text`,
      findings,
      recommendation: missing
        ? `Add descriptive alt text to ${missing} image(s). For purely decorative images use alt="" together with role="presentation" (or aria-hidden="true").`
        : '',
      details: { totalImages: total, imagesWithAlt: withAlt, imagesMissingAlt: missing, decorativeImages: decorative.length, percentage }
    }
  }
}
