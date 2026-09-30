# Internal Linking (`content.internal-links`, 4 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| No internal links on the page | Add links to related pages (-3) |
| Fewer than 3 in-content internal links (and under 5 in total) | Add in-content links, outside `nav`/`header`/`footer` (-1) |
| Generic anchor text ("read more", "click here", "here", "learn more", empty) on an in-content link | Rewrite the anchor to name the target page (-0.25 each, max -1) |

The engine floors the score, so a single generic anchor already costs a whole point. Full marks: at least 3 in-content internal links (or 5+ internal links in total) and no generic in-content anchors. Links in `nav`, `header` and `footer` count toward the total but are not checked for generic text.

## Where to edit

| Stack | Where links come from |
|---|---|
| static-html | the body content of each flagged `.html` file |
| astro | page and component markup in `src/pages/**`, `src/components/**`; Markdown links in `src/content/**` |
| hugo | Markdown in `content/**` (use `{{< ref "path" >}}` or root-relative links); card/list partials in `layouts/partials/**` for "read more" links |
| eleventy | Markdown and templates in the input dir; `_includes/**` for card partials |
| vite-spa | route components in `src/**` (`<a>` or the router's `<Link>`) |
| nextjs (assisted) | `<Link>` in `app/**` pages, components and MDX |

For generated stacks, fix the source that produced the built page, never the build output. A "Read more" in a card loop is fixed once in the partial, using the item's title variable.

## Steps

1. From `page-facts.mjs`, read each flagged page's `headings`, `firstParagraph` and `site.pages` (titles and urlPaths) to know what can be linked.
2. Generic anchors (auto part): replace the text with the target page's title, or keep the visible text and add hidden context: `Read more<span class="sr-only"> about Visual bookmarks</span>`. Add an `sr-only` CSS rule only if none exists. Icon-only links get an `aria-label`.
3. Too few links (assisted part): find 3 existing pages in `site.pages` that genuinely relate to this page's topic. Propose a sentence-level link for each, placed where the page already mentions that topic, anchor text taken from the page's own words.
4. Show the proposed links to the user and apply after the OK.

## Template

```html
<p>For setup details, see the <a href="/docs/getting-started">getting started guide</a>.</p>
<a href="/blog/tagging-tips">Read more<span class="sr-only"> about tagging tips</span></a>
```

## Rules

- Link only to pages that exist in the repo. Never invent URLs or pages.
- Never invent facts in new link sentences; prefer linking words already on the page over adding text.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: no new navigation menus or "related posts" widgets unless the user asks.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only content.internal-links`
