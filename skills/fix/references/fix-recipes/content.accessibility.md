# Accessibility (`content.accessibility`, 4 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| Missing `<main>` element or `role="main"` | Wrap the primary content in `<main>` in the base layout (-1.75) |
| Missing `<nav>` element or `role="navigation"` | Wrap the site menu in `<nav>` (-0.75) |
| Form input/textarea/select has no label (when under 50% are labelled) | Add `<label for>`, a wrapping `<label>`, or `aria-label` (-0.75) |
| Fewer than 5 semantic elements (only when `<main>` is also missing) | Use `header`, `nav`, `main`, `footer`, `section`/`article` instead of plain `div`s (-0.75) |

The engine floors the score, so any deduction costs a whole point. Adding `<main>` fixes the two largest deductions at once. Full marks: `<main>`, `<nav>`, and at least half of form fields labelled (all is better).

## Where to edit

| Stack | Where the page skeleton comes from |
|---|---|
| static-html | the body of each flagged `.html` file (the header/menu/footer blocks repeated per page) |
| astro | `src/layouts/*.astro` around `<slot />`; the menu in `src/components/Header.astro` or `Nav.astro` |
| hugo | `layouts/_default/baseof.html` around `{{ block "main" . }}`; menu in `layouts/partials/header.html` (override theme files in the project) |
| eleventy | the `_includes/**` base layout around `{{ content }}` |
| vite-spa | the root component (`src/App.*`) around the router outlet; `index.html` if the shell is static |
| nextjs (assisted) | `app/layout.tsx` around `{children}` (or each `page.tsx` if pages already render their own `<main>`); menu component |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, find the layout behind each flagged `file`, and check whether pages already render their own `<main>` (avoid two).
2. Replace the content wrapper `<div>` with `<main>` (keep its classes and id), or wrap the content slot in `<main>`. Header, nav and footer stay outside.
3. Change the menu container `<div>`/`<ul>` parent to `<nav>` (keep classes), or add `role="navigation"`. Give multiple navs an `aria-label`.
4. Where the header/footer are plain `div`s, switch them to `<header>`/`<footer>`, keeping classes so CSS still applies. Check CSS for tag selectors like `div.header`.
5. For unlabelled form fields: use the visible text next to the field as a `<label for>`; if there is none, add `aria-label` with the placeholder text or the field's evident purpose.

## Template

```html
<header class="site-header"><nav aria-label="Main">...</nav></header>
<main id="main">...page content...</main>
<footer class="site-footer">...</footer>
<label for="email">Email</label> <input id="email" type="email" name="email">
```

## Rules

- Never invent facts; label text comes from visible text, placeholders or the field name.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: swap tags and add attributes; keep classes and ids so styling does not change. Only one `<main>` per page.
- Do not edit theme files in `themes/` or `node_modules/`; override in the project.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only content.accessibility`
