# Content Signals (`ai-access.content-signals`, 3 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| No robots.txt, so no Content-Signal is declared (0/3) | Create robots.txt with a `Content-Signal:` line |
| robots.txt has no Content-Signal line (0/3) | Add a `Content-Signal:` line |
| robots.txt controls AI crawler access but declares no Content-Signal (1/3) | Add a `Content-Signal:` line |
| Content-Signal line has no valid key=yes\|no pair | Use only `search`, `ai-input`, `ai-train` with `yes` or `no` |
| robots.txt is generated, Content Signals could not be read (2/3, inconclusive) | Add the line in the generator, build, re-run |

Full points: at least one valid `key=yes|no` pair in robots.txt, or a `Content-Signal` response header for `/` in host config (header-only counts as predicted).

## Where to edit

| Stack | Where to add the line |
|---|---|
| static-html | `robots.txt` in the served root |
| astro | `public/robots.txt`, or the `src/pages/robots.txt.ts` endpoint |
| hugo | `static/robots.txt`, or `layouts/robots.txt` when `enableRobotsTXT = true` |
| eleventy | the passthrough `robots.txt` (add `eleventyConfig.addPassthroughCopy("robots.txt")` if missing), or `robots.njk` |
| vite-spa | `public/robots.txt` |
| nextjs (assisted) | `public/robots.txt`; `app/robots.ts` has no Content-Signal field, so use a `Content-Signal` header in `next.config.js` `headers()` or `vercel.json` |

Optional header: Cloudflare Pages / Netlify `_headers` in the output root (static: served root; frameworks: `public/` or `static/`), `netlify.toml` `[[headers]]`, or Vercel `vercel.json` `headers`.

## Steps

1. Ask the user for their policy, proposing: `search=yes, ai-input=yes, ai-train=no` (appear in AI search and answers, opt out of training). Change a value only if they say so.
2. Add the line inside the `User-agent: *` group of robots.txt (create the group with `Allow: /` if the file has none).
3. If there is no robots.txt, create one from the template below.
4. Leave existing `User-agent`, `Disallow` and `Sitemap:` lines as they are.
5. Only add the header as well if the user asks, or robots.txt cannot carry it (Next.js `app/robots.ts`).

## Template

```
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /
```

`_headers` (optional):

```
/*
  Content-Signal: search=yes, ai-input=yes, ai-train=no
```

## Rules

- The yes/no values are a policy choice: propose the default and ask. Never set `ai-train=yes` without explicit consent.
- Keys are exactly `search`, `ai-input`, `ai-train`; values exactly `yes` or `no`.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source file or generator.
- Keep changes minimal: one line added, nothing else reordered.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only ai-access.content-signals`
