# Author Signals (`content.author`, 5 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| No author attribution | Add a named author: JSON-LD `Person` as Article `author`, `<meta name="author">`, or a byline (+2) |
| Author markup found but the name is empty or unclear | Fill in the name (+1 until then, +2 after) |
| No expertise signals (credentials, job title, years of experience) | Add the author's real role or credentials to the bio or JSON-LD `jobTitle` (+1) |
| No author bio section or link to an author/about page | Add a bio block (`class="author-bio"`) or a link to `/about` or `/author/<name>` (+1) |
| Fewer than 3 trust signals | Link to at least 3 of `/about`, `/contact`, `/privacy`, `/terms`, or add an `<address>` (+1) |

Points add up to 5: name 2, expertise 1, bio or author link 1, trust signals 1.

## Where to edit

| Stack | Where author data comes from |
|---|---|
| static-html | the `<head>` (meta, JSON-LD), the article byline, and the shared footer markup in each flagged `.html` file |
| astro | `author` in the content collection schema and entries; byline and JSON-LD in the post layout `src/layouts/*.astro`; footer links in `src/components/Footer.astro` |
| hugo | `author` / `authors` in front matter or `params.author` in `hugo.toml`; byline and JSON-LD in `layouts/_default/single.html` or `layouts/partials/head.html`; footer in `layouts/partials/footer.html` |
| eleventy | `author` in front matter or `_data/site.json` / `_data/authors.json`; byline in the `_includes/**` post layout; footer include |
| vite-spa | `index.html` head and the article/footer components in `src/**` |
| nextjs (assisted) | `metadata.authors` in `generateMetadata`, a JSON-LD `<script>` in the post page, byline and footer components |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `author`, `jsonld [{types,line}]`, `socialLinks`, and `site.brand`, `site.pages` (to see which of `/about`, `/contact`, `/privacy`, `/terms` exist).
2. Look for real author data in the repo: front matter `author`, `_data/` or config author entries, an about page, `package.json` author. Collect name, role and profile links.
3. Wire the template (auto part): print `<meta name="author">` and a byline from the author field; add or extend the Article/BlogPosting JSON-LD with an `author` Person. Organization-authored sites may use the organization as author and skip the personal bio.
4. Trust links (auto part): add footer links only to pages that already exist in `site.pages`. For missing pages, tell the user; do not create empty legal pages.
5. Bio and expertise (assisted part): ask the user for the author's name, role and credentials. Claude may draft a short bio from facts already in the repo, clearly marked as a draft for review.

## Template

```html
<meta name="author" content="Jane Doe">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting","headline":"...","author":{"@type":"Person","name":"Jane Doe","jobTitle":"Senior Data Engineer","url":"https://example.com/about","sameAs":["https://www.linkedin.com/in/janedoe"]}}
</script>
<div class="author-bio"><p>Written by <a href="/about">Jane Doe</a>, Senior Data Engineer.</p></div>
```

## Rules

- Never invent facts: names, job titles, credentials, degrees, years of experience, employers, social profiles or addresses. Use what is in the repo or ask the user.
- Never link to pages that do not exist, and never create placeholder about/privacy/terms pages without the user's OK.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: reuse existing author fields and the existing footer.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only content.author`
