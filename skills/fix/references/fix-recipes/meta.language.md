# Language Tags (`meta.language`, 3 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| Missing `lang` attribute on `<html>` | Add `lang="en"` (or the page's language) (-2) |
| Invalid lang format (not `ll`, `ll-RR` or `ll-Scrp-RR`) | Fix the syntax, e.g. `en_US` to `en-US` (-0.5) |
| Unrecognized language code | Use an ISO 639-1 code such as `en`, `de`, `fr` (-0.5) |
| Unrecognized region code | Use an ISO 3166 region such as `US`, `GB`, or drop the region (-0.25) |
| Multiple hreflang links but no `x-default` | Add `<link rel="alternate" hreflang="x-default">` (informational, not scored) |

The engine floors the score, so any deduction costs a whole point. Full marks means a valid `lang` on `<html>`.

## Where to edit

| Stack | Where `<html lang>` comes from |
|---|---|
| static-html | the `<html>` tag of each flagged `.html` file |
| astro | the `<html>` tag in `src/layouts/*.astro` (every layout, not just the main one) |
| hugo | `layouts/_default/baseof.html` as `<html lang="{{ .Site.Language.LanguageCode }}">`, with `languageCode = "en-US"` (or `defaultContentLanguage`) in `hugo.toml` |
| eleventy | the `<html>` tag in the `_includes/**` base layout, optionally from `site.lang` in `_data/` |
| vite-spa | the `<html>` tag in `index.html` |
| nextjs (assisted) | `<html lang="en">` in `app/layout.tsx`, or `pages/_document.tsx` for the pages router |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `lang`, `title` and `firstParagraph`.
2. Detect the language from the page text. If it is clearly English (or another single language), use that code. A region (`en-US`, `en-GB`) is optional; only add one the repo already implies (spelling, config, currency).
3. Fix the root layout so every page inherits the attribute. On multilingual sites, set it per language from the framework's i18n config.
4. If an existing value is malformed, correct it in place (underscore to hyphen, lowercase language, uppercase region).

## Template

```html
<html lang="en">
```

## Rules

- Never guess a language the content does not support. If pages mix languages or the text is ambiguous, ask the user.
- Never invent facts, including a region the site does not target.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: one attribute on the root element.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only meta.language`
