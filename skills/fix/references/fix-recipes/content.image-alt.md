# Image Alt Text (`content.image-alt`, 5 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| `<img src="...">` has no alt attribute | Add a descriptive `alt`, or mark it decorative |
| `<img src="...">` has empty alt text | Write a description, or add `role="presentation"` if decorative |

Score = share of non-decorative images with non-empty alt, times 5, rounded. An image with `alt=""` plus `role="presentation"` (or `role="none"` / `aria-hidden="true"`) is decorative and left out. Plain `alt=""` alone still counts as missing. A page with no images scores 5.

## Where to edit

| Stack | Where images come from |
|---|---|
| static-html | `<img>` tags in each flagged `.html` file |
| astro | `<img>` and `<Image alt="...">` in `src/pages/**`, `src/components/**`; Markdown `![alt](src)` in `src/content/**` |
| hugo | Markdown `![alt](src)` in `content/**`; `<img>` in `layouts/**` partials and shortcodes (pass alt as a shortcode param) |
| eleventy | Markdown and templates in the input dir; `_includes/**`; image shortcode `alt` argument |
| vite-spa | `<img>` in components under `src/**` and `index.html` |
| nextjs (assisted) | `<Image alt="...">` / `<img>` in `app/**` and components; MDX images |

For generated stacks, fix the source that produced the built page, never the build output. An image rendered from data (CMS, JSON, front matter list) gets its alt from a new field in that data, not a hard-coded string in the loop.

## Steps

1. From `page-facts.mjs`, read each flagged page's `imagesMissingAlt [{src,line,emptyAlt}]`, plus `title` and the nearby `headings` for context.
2. Find the image file in the repo and look at it with the Read tool. Also read the surrounding text and caption.
3. Decide per image:
   - Informative (shows content, a product, a chart, a person, a screenshot): draft alt text that says what it shows and why it matters here, under about 125 characters. No "image of" prefix.
   - Linked image or icon button: describe the destination or action ("Download the report").
   - Decorative (dividers, background flourishes, icons next to text that already says the same thing): `alt="" role="presentation"`.
4. If the file is not in the repo (remote URL) and the context does not make it clear, ask the user.
5. Present the drafted alt texts as a list (file, line, src, proposed alt) marked as a draft for review, and apply after the user confirms.

## Template

```html
<img src="/img/dashboard.png" alt="Project board with three columns of saved screenshots grouped by tag">
<img src="/img/divider.svg" alt="" role="presentation">
```

## Rules

- Alt text is a draft for the user to confirm. Describe only what is visible; never invent facts (names of people, places, products, numbers) that the image or page does not show.
- Do not identify real people by name unless the page names them next to the image.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: add attributes only; do not resize, rename or move images.
- Do not stuff keywords into alt text.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only content.image-alt`
