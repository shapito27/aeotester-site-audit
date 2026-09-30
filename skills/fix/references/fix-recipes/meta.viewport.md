# Mobile Friendly (`meta.viewport`, 3 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| Missing `<meta name="viewport">` | Add the standard tag (0 pts until it exists) |
| Fixed width instead of `device-width` | Replace with `width=device-width` (-1.5) |
| Missing `width=device-width` | Add it (-1) |
| Missing `initial-scale=1` | Add it (-0.5) |
| `initial-scale` is not 1 | Set it to `1` (-0.25) |
| `user-scalable=no` or `maximum-scale` below 2 | Remove them (reported only, blocks zoom) |
| Uses `;` as separator | Use `,` (reported only) |

The engine floors the score, so any deduction costs a whole point. Full marks needs exactly `width=device-width, initial-scale=1`.

## Where to edit

| Stack | Where the viewport tag comes from |
|---|---|
| static-html | `<head>` of each flagged `.html` file |
| astro | the `<head>` in `src/layouts/*.astro` (every layout) |
| hugo | `layouts/partials/head.html` or `layouts/_default/baseof.html` (check the theme under `themes/*/layouts/` and override in the project `layouts/` rather than editing the theme) |
| eleventy | the `_includes/**` base layout head |
| vite-spa | `index.html` |
| nextjs (assisted) | Next.js adds the default tag itself; if flagged, look for an overriding `export const viewport` in `app/layout.tsx` or a manual `<meta name="viewport">` in `pages/_document.tsx` / `_app.tsx`, and set `export const viewport = { width: 'device-width', initialScale: 1 }` |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, find which layouts produce the flagged pages (`file`, `headCloseLine`).
2. If the tag is missing, add it near the top of the shared `<head>`, right after `<meta charset>`.
3. If it exists, replace its `content` with `width=device-width, initial-scale=1`. Drop `user-scalable=no` and low `maximum-scale` values.
4. Remove any duplicate viewport tag so only one remains.

## Template

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

## Rules

- Never invent facts; this check needs none, so add only the tag.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Do not edit theme files inside `node_modules/` or `themes/`; override in the project.
- Keep changes minimal: one tag. If the layout uses a fixed-width design, tell the user the CSS may also need work; do not rewrite CSS.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only meta.viewport`
