# Semantic Headings (`content.headings`, 8 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| Page has no headings (h1-h6) | Add one `<h1>` plus `<h2>` section headings (0 pts until then) |
| No `<h1>` on the page | Add one `<h1>` naming the page topic (-3) |
| Additional `<h1>` (only one per page) | Demote every extra `<h1>` to `<h2>`, or to `<p>`/`<span>` if it is a logo or tagline (-2) |
| Skipped heading level: H4 after H2 | Change the tag to the next level down (H3) (-1 each, max -2) |
| Generic or very short heading ("Introduction", "Overview", "More", under 3 chars) | Only scored when there are more than 3: rename them to say what the section covers (-1) |

Full marks: exactly one `<h1>`, no level jumps going down, at most 3 generic headings.

## Where to edit

| Stack | Where headings come from |
|---|---|
| static-html | heading tags in each flagged `.html` file (check shared header/logo markup copied across pages) |
| astro | `src/pages/**` and components in `src/components/**`; a logo `<h1>` usually lives in `src/components/Header.astro` or the layout; Markdown `#` in `src/content/**` |
| hugo | Markdown headings in `content/**` (`#` is h1, so body text should start at `##` when the layout prints the title as h1); the title `<h1>` in `layouts/_default/single.html` or the theme override |
| eleventy | Markdown in the page source and the `_includes/**` layout that prints `{{ title }}` |
| vite-spa | components in `src/**` (JSX/Vue/Svelte templates) and `index.html` |
| nextjs (assisted) | `app/**/page.tsx` and shared components; MDX files for content pages |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `headings [{level,text,line}]`, `h1`, `title` and `firstParagraph`.
2. Extra `<h1>`: keep the one that names the page topic (usually matching `title`). Demote the rest to `<h2>`. A site logo or tagline wrapped in `<h1>` becomes `<p>`/`<span>`/`<a>` with the same classes so styling does not change.
3. Skipped levels: walk the list in order; any heading more than one level deeper than the previous one moves up to previous level + 1. Change only the tag; keep text, classes and ids. If CSS targets the old tag (e.g. `h4 { }`), add a class to keep the look.
4. Missing `<h1>` (assisted part): propose wording from the page's `title` (minus the brand suffix) or first heading, and show it to the user before writing. If an existing `<h2>` is clearly the page title, promote it.
5. Generic headings (more than 3): propose descriptive names built from each section's own text, and show them to the user before writing.
6. In Markdown, do not add a `#` heading if the layout already prints the title as `<h1>`.

## Rules

- Tag-level changes (demote, fix skips) are mechanical and can be applied. New or renamed heading text needs the user's OK.
- Never invent facts in heading text; use words already on the page.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: do not restyle. Preserve visual appearance with a class when a tag changes.
- Do not edit theme files in `themes/` or `node_modules/`; override in the project.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only content.headings`
