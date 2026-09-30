# llms.txt Detection (`ai-access.llms-txt`, 6 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| No llms.txt in the served root (0/6) | Create llms.txt from the generator draft |
| llms.txt is generated, content could not be read (3/6, inconclusive) | Build the site and re-run; fix the generator if the output lacks an H1 or links |
| llms.txt file is empty (-3) or under 50 characters (-1) | Expand it into an index of key pages |
| `"Disallow: ..." blocks /llms.txt for User-agent: *` (-2) | Remove that rule, or add `Allow: /llms.txt` to the `*` group |
| Missing H1 title on the first line | Make the first non-empty line `# Site Name` |
| No markdown links to key pages | List pages as `- [Title](url): description` |
| Larger than 10KB (no penalty) | Trim to the key pages; move full content to llms-full.txt |

Full points: a non-empty llms.txt of 50+ characters, first line `# Title`, at least one `[text](url)` link, not blocked for `User-agent: *`.

## Where to edit

| Stack | Where llms.txt goes |
|---|---|
| static-html | `llms.txt` in the served root (same folder as `index.html`) |
| astro | `public/llms.txt`, or the existing `src/pages/llms.txt.ts` endpoint |
| hugo | `static/llms.txt`, or the existing `layouts/index.llms.txt` output format |
| eleventy | a passthrough-copied `llms.txt` (add `eleventyConfig.addPassthroughCopy("llms.txt")` if missing), or the existing `llms.txt.njk` |
| vite-spa | `public/llms.txt` |
| nextjs (assisted) | `public/llms.txt`, or the existing `app/llms.txt/route.ts` |

If a generator already exists, fix it instead of adding a static file.

## Steps

1. Run the draft generator: `node "${CLAUDE_PLUGIN_ROOT}/skills/fix/scripts/generate-llms-txt.mjs" [root]`. It prints a draft built from the page facts: brand H1 (`site.brand`), `> summary` from the homepage meta description, and `## Section` lists of `- [Title](url): description`.
2. Review the draft: drop thin, duplicate, legal, tag and pagination pages; keep the pages an assistant should read first. Check every URL is absolute on the production host (`site.baseUrl`) and every description comes from the page.
3. If `site.baseUrl` is unknown, ask the user for the production domain before writing links.
4. Write the reviewed file to the location in the table. Show the diff first.
5. If robots.txt blocks `/llms.txt` for `User-agent: *`, remove that rule or add `Allow: /llms.txt`.
6. Optional: offer llms-full.txt (full page text) only if the user wants it; it is not scored.

## Template

```
# Brand Name

> One-sentence summary taken from the homepage meta description.

## Docs

- [Getting started](https://example.com/start/): How to install and set up Brand.

## Blog

- [Post title](https://example.com/blog/post/): The post's meta description.
```

## Rules

- Never invent facts: titles, summaries and descriptions come from the pages or the user.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); write to the source location.
- Keep it concise: key pages only, under 10KB.
- Keep changes minimal; do not rewrite unrelated robots.txt rules.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only ai-access.llms-txt`
