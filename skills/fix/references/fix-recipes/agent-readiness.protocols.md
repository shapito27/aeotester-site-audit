# Agent Protocol Discovery (`agent-readiness.protocols`, 6 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| Not applicable: no API or agent surface detected | Nothing to fix; the check is removed from the total |
| API surface detected but no agent discovery artifacts published | Publish discovery files that describe the real API or agent (0 pts until then) |
| API surface evidence: `/api/...`, `/docs/...`, `api.` host, `link rel="service-desc"`, JSON-LD `WebAPI` | Shows why the audit thinks there is an API; confirm with the user |
| `<path>` exists but does not validate | Fix the file: valid JSON of the expected shape, not served as HTML |

Conditional: sites with no API or agent surface score n/a. Score by distinct categories found: 1 = 3 pts, 2 = 5 pts, 3 or more = 6 pts. Categories and files: MCP (`/.well-known/mcp/server-card.json` or `/.well-known/mcp.json`, a JSON object), A2A (`/.well-known/agent-card.json` with `name`), skills (`/.well-known/agent-skills/index.json`), API (`/.well-known/api-catalog` linkset, `/.well-known/openapi.json` or `/openapi.json` with `openapi`), OAuth (`/.well-known/oauth-authorization-server` with `issuer`, `/.well-known/oauth-protected-resource` with `resource`), WebMCP (`toolname`/`tooldescription` attributes). Route handlers that generate these paths (Next.js `app/.well-known/.../route.ts`, Astro endpoints) count as predicted.

## Where to edit

| Stack | Where discovery files go |
|---|---|
| static-html | `.well-known/` in the served root (same folder as `index.html`) |
| astro | `public/.well-known/`, or an endpoint `src/pages/.well-known/<name>.json.ts` generated from real config |
| hugo | `static/.well-known/` |
| eleventy | a `.well-known/` folder plus `eleventyConfig.addPassthroughCopy(".well-known")` |
| vite-spa | `public/.well-known/` |
| nextjs (assisted) | `public/.well-known/`, or `app/.well-known/<name>/route.ts` built from the real API spec |

Content types: serve `api-catalog` as `application/linkset+json` via `_headers` (Cloudflare Pages / Netlify, in the output root) or `vercel.json` headers. For generated stacks, never write into the build output.

## Steps

1. From the audit details, read `apiEvidence`, `probed` and `categories`. Ask the user whether the site really offers an API, an MCP server or an agent. A link to `/docs/` for product help, or an API owned by someone else, is not this site's surface.
2. If there is no real surface: stop. Tell the user the check is not applicable in spirit, and add nothing.
3. If there is a real surface, look for existing facts in the repo: an OpenAPI/Swagger file, MCP server code and its tool list, OAuth/auth config, API base URL.
4. Publish only what exists: copy or reference the existing OpenAPI spec at `/.well-known/openapi.json` or `/openapi.json`; add an `api-catalog` linkset pointing at it; add an MCP server card only for a real MCP server; OAuth metadata only when the API uses OAuth and the user gives the issuer and endpoints.
5. Where facts are missing, Claude may draft a skeleton with placeholders, clearly marked as a draft, and must not publish it until the user fills in real values.

## Template

```json
{
  "linkset": [
    {
      "anchor": "https://api.example.com/v1",
      "service-desc": [{ "href": "https://example.com/.well-known/openapi.json", "type": "application/json" }],
      "service-doc": [{ "href": "https://example.com/docs/api", "type": "text/html" }]
    }
  ]
}
```

## Rules

- Never add fake or placeholder discovery files to score points. Every endpoint, tool, issuer and URL must be real and come from the repo or the user.
- Do not publish `/.well-known/ai` or empty cards just to add a category.
- Never invent facts (endpoints, auth servers, scopes, tool names, contact details).
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: reuse the existing spec instead of rewriting it.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only agent-readiness.protocols`
