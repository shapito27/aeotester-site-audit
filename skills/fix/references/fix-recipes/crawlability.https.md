# SSL / HTTPS (`crawlability.https`, 2 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| Site URL is declared as http:// and nothing enforces HTTPS (0/2) | Switch the site URL to https:// and force HTTPS at the host |
| HTTPS could not be determined from the repo (1/2, inconclusive) | Set the production site URL to https:// (base URL, canonical) |
| `Mixed content: <img / script / link rel="stylesheet" / iframe> loads over http://` (-1) | Change the asset URL to https:// |
| `Canonical declares an http:// URL` / `og:url declares an http:// URL` | Switch them to https:// |

Full points: HTTPS inferred (HSTS header, http -> https redirect, https site URL, or an HTTPS-by-default host) and no mixed content. The result is always predicted; confirm on the live site.

## Where to edit

| Stack | Site URL | Mixed content |
|---|---|---|
| static-html | canonical / `og:url` in each `.html` file | `src` / `href` in the flagged `.html` files |
| astro | `site` in `astro.config.*` | `src/layouts/**`, `src/components/**`, `src/pages/**` |
| hugo | `baseURL` in `hugo.toml` / `config.toml` | `layouts/**` and `content/**` |
| eleventy | `url` in `_data/site.*` (or wherever the layout reads it) | `_includes/**` and content files |
| vite-spa | canonical / `og:url` in `index.html` | `index.html` and `src/**` |
| nextjs (assisted) | `metadataBase` in `app/layout.tsx` | `app/**`, `components/**` |

Forcing HTTPS: Netlify `_redirects` (`http://example.com/* https://example.com/:splat 301!`) or `netlify.toml`; `Strict-Transport-Security` in `_headers` (Cloudflare Pages / Netlify, output root) or `vercel.json` `headers`.

## Steps

1. Auto part: change each flagged `http://` asset URL to `https://`. First check the asset is actually served over HTTPS (same host, or a known CDN); if unsure, list it for the user instead of changing it.
2. Auto part: switch the site URL config, canonical and `og:url` from `http://` to `https://` for the production host (`site.baseUrl`).
3. Assisted part: enabling HTTPS itself (certificate, forced redirect) is host configuration. Netlify, Vercel, Cloudflare Pages, GitHub Pages and Firebase serve HTTPS by default; tell the user where to turn on "Enforce HTTPS" if they use another host.
4. Only add an HSTS header or redirect rule if the user confirms the site already works over HTTPS on every subdomain covered.

## Template

`_headers`:

```
/*
  Strict-Transport-Security: max-age=31536000
```

## Rules

- Never switch an asset to https:// without reason to believe it is served there; a broken asset is worse than mixed content.
- Never add HSTS or `includeSubDomains` / `preload` without the user's explicit OK.
- Never invent the domain; use `site.baseUrl` or ask.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only crawlability.https`
