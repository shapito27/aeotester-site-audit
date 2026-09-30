# Content Freshness (`content.freshness`, 5 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| No publish or modified date | Emit both dates (0 pts until one exists) |
| Missing publish date | Add `article:published_time` meta, JSON-LD `datePublished`, or `<time itemprop="datePublished">` (-2) |
| Missing modified date | Add `article:modified_time` meta, JSON-LD `dateModified`, or a plain `<time datetime>` (-2) |

Full marks needs one publish signal and one modified signal. Any unlabelled `<time datetime>` counts as a modified date; a `<time>` counts as a publish date only with `itemprop="datePublished"` or a class like `published`, `pubdate`, `post-date` or `entry-date` on it or its parent.

## Where to edit

| Stack | Where dates come from |
|---|---|
| static-html | the `<head>` and article body of each flagged `.html` file |
| astro | `pubDate` / `updatedDate` in the content collection schema (`src/content.config.ts` or `src/content/config.ts`) and entries; render them in the post layout `src/layouts/*.astro` |
| hugo | `date` and `lastmod` in front matter (or `enableGitInfo = true` with `[frontmatter] lastmod = [":git", "lastmod"]`); render in `layouts/_default/single.html` or rely on `_internal/opengraph.html`, which emits `article:published_time` / `article:modified_time` for pages with dates |
| eleventy | `date` in front matter (or `date: Last Modified` / `git Last Modified`) and a `modified` field; render in the `_includes/**` post layout |
| vite-spa | `index.html` head for a single page, or the article component if posts are static data |
| nextjs (assisted) | `metadata.openGraph.publishedTime` / `modifiedTime` (with `type: 'article'`) in `generateMetadata`, plus a JSON-LD script in the post page |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `dates {published, modified}`, `jsonld [{types,line}]` and `file`.
2. Decide if the page is dated content (posts, articles, guides, docs). Timeless pages (home, contact) can use a site-wide last-updated date only if the user wants one; ask.
3. Wire the template (auto part): in the post layout, output `article:published_time` and `article:modified_time` meta tags and a visible `<time datetime>` for the updated date, all from front matter fields. If an Article/BlogPosting JSON-LD block exists, add `datePublished` / `dateModified` from the same fields.
4. Fill the values (assisted part): take dates from existing front matter, file names (`2024-05-01-post.md`) or `git log --follow --format=%aI -- <file>` (first commit = published, last = modified). Show the list to the user before writing.
5. Use ISO 8601 (`2025-03-14` or `2025-03-14T09:00:00Z`). If `modified` is unknown, fall back to the published date rather than today's date.

## Template

```html
<meta property="article:published_time" content="2025-03-14T09:00:00Z">
<meta property="article:modified_time" content="2025-06-02T10:30:00Z">
<p>Updated <time datetime="2025-06-02">June 2, 2025</time></p>
```

## Rules

- Never invent dates. Use front matter, file names or git history, and ask the user when none exist.
- Never set every modified date to today to look fresh.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: template wiring plus front matter fields; do not restyle the post layout.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only content.freshness`
