# Agent-Usable Controls (`agent-readiness.controls`, 4 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| Button agents cannot use (no accessible name) | Add visible text, `aria-label`, or `alt` on the button's image (buttons category, 1 pt) |
| Button agents cannot use (not focusable) | Use a real `<button>`, or add `tabindex="0"` to a `role="button"` element |
| Link that does not navigate (no href, or `#` / `javascript:` href) | Give it a real `href`, or make it a `<button type="button">` if it runs an action (links category, 1 pt) |
| Inline `onclick` on a non-interactive element (div, span, li, p, img, td) | Replace with `<button type="button">`, or add `role="button" tabindex="0"` (fake clickables, 1 pt) |
| Personal-data input without an autocomplete attribute | Add the matching `autocomplete` token (autocomplete category, 1 pt) |

One point per category. A category earns its point when it has no elements or at least 90% of them are fine. Elements inside `[hidden]` or `aria-hidden="true"` are skipped. Personal-data inputs are `type="email"`/`"tel"` or those whose name/id contains name, email, phone, address, city, zip, postal, country, state, company, organization.

## Where to edit

| Stack | Where controls come from |
|---|---|
| static-html | the markup in each flagged `.html` file (headers, forms, menus) |
| astro | components in `src/components/**` and `src/layouts/**` (menus, forms, icon buttons) |
| hugo | partials in `layouts/partials/**` and shortcodes (override theme partials in the project) |
| eleventy | `_includes/**` partials and templates |
| vite-spa | components in `src/**`; `onClick` on `<div>`/`<span>` in JSX or `@click` in Vue templates |
| nextjs (assisted) | components in `app/**` and `components/**`; `<Link href>` for navigation, `<button>` for actions |

For generated stacks, fix the source that produced the built page, never the build output. Fix the shared component once rather than every page.

## Steps

1. Run the audit and collect findings per file and line; group them by the component that renders them.
2. Autocomplete (auto part): map each field to a token: `email`, `tel`, `name`, `given-name`, `family-name`, `street-address`, `address-level2` (city), `postal-code`, `country-name`, `organization`. Add `autocomplete="..."` to the input.
3. Fake clickables (auto part): replace `<div onclick>` with `<button type="button" onclick>` keeping classes; reset button styles with a class if needed. If the element cannot become a button, add `role="button" tabindex="0"` and a keydown handler for Enter/Space.
4. Icon-only buttons (assisted part): propose an `aria-label` based on the icon and what the handler does (e.g. "Open menu", "Close dialog"); show the list to the user before writing.
5. Placeholder links (assisted part): if the handler navigates, propose the real `href`; if it toggles UI, convert to `<button type="button">`. Ask the user when the target is unclear.

## Template

```html
<button type="button" class="menu-toggle" aria-label="Open menu"><svg aria-hidden="true">...</svg></button>
<a href="/pricing">Pricing</a>
<input type="email" name="email" autocomplete="email">
<input type="text" name="first_name" autocomplete="given-name">
```

## Rules

- Never invent facts: link targets must be pages that exist; labels describe what the control really does.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: preserve classes, ids and event handlers so styling and behavior stay the same. Do not set `autocomplete="off"` to silence a finding.
- Do not edit theme files in `themes/` or `node_modules/`; override in the project.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only agent-readiness.controls`
