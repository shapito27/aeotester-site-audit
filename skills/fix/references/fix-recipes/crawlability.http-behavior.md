# HTTP Behavior (`crawlability.http-behavior`, 3 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| `Catch-all rule turns unknown URLs into HTTP 200 (soft 404)` (0 of 1) | Remove the catch-all 200 rewrite or redirect-to-home rule; add a 404 page |
| `No 404 page (404.html) in the served root` (0.5 of 1, inconclusive) | Add a 404 page |
| `Page is served with HTTP N instead of 200` (up to 1) | Remove the redirect, error-status or Basic-Auth rule covering published pages |
| `X-Robots-Tag header rule contains noindex/none` (up to 1) | Remove noindex/none from header rules for production paths |

Full points (1 each): unknown URLs return a real 404/410, every page returns 200, no X-Robots-Tag noindex/none. All predicted from repo config; verify live with `curl -I`.

## Where to edit

| Stack | 404 page | Rules |
|---|---|---|
| static-html | `404.html` in the served root | `_redirects` / `_headers` in the served root, `netlify.toml`, `vercel.json`, `.htaccess` |
| astro | `src/pages/404.astro` | `public/_redirects`, `public/_headers`, `netlify.toml`, `vercel.json` |
| hugo | `layouts/404.html` | `static/_redirects`, `static/_headers`, `netlify.toml`, `vercel.json` |
| eleventy | `404.md` / `404.njk` with `permalink: /404.html` | passthrough `_redirects` / `_headers`, `netlify.toml`, `vercel.json` |
| vite-spa | `public/404.html` | `public/_redirects`, `public/_headers`, `vercel.json` `rewrites` |
| nextjs (assisted) | `app/not-found.tsx` | catch-all `app/[...slug]/page.tsx` must call `notFound()`; `next.config.js` `headers()` / `redirects()`, `middleware.ts` |

## Steps

1. Read the finding's file and line. Identify catch-alls (`/*`, `**`, `/(.*)`, `/:path*`) that rewrite (200) or redirect (3xx) to a fixed page. Path-preserving rules (`:splat`, `$1`) are fine.
2. Add a 404 page using the site's layout, title "Page not found", and links to the homepage and main sections. Reuse the site's existing wording; Claude may draft the copy, marked as a draft for review.
3. Assisted: a catch-all 200 rewrite is often needed by a client-side router (vite-spa). Ask before removing it. Alternatives: list real routes explicitly, prerender routes, or keep the fallback and accept the lost point.
4. Remove a redirect-to-home rule for unknown paths only with the user's OK (it may be a deliberate migration rule).
5. Remove X-Robots-Tag noindex/none rules that match production paths. Keep rules scoped to preview hosts or private paths. Ask if the intent is unclear.
6. Basic-Auth or error-status rules on published pages: report them and ask; they are usually deliberate.
7. Host dashboard settings (Cloudflare Pages SPA fallback, host-level auth) cannot be changed from the repo; tell the user what to change.

## Template

`_redirects` catch-all that serves a real 404 (only if a catch-all is needed at all):

```
/*  /404.html  404
```

## Rules

- Never remove SPA fallbacks, auth or redirect rules without the user's explicit OK.
- Never invent content for the 404 page beyond navigation and a short message.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only crawlability.http-behavior`
