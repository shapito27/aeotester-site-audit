# Rubric review notes

Generated from the AEOTester extension v1.3.1 (commit 490932c) during phase 2. `rubric.json` describes what the extension code does today, not what its comments say. This file lists everything the extraction found that needs a decision.

## Checks at a glance

| id | pts | detect | parity | fix |
|---|---:|---|---|---|
| `ai-access.bot-crawlability` | 12 | script | partial | auto |
| `ai-access.llms-txt` | 6 | script | partial | auto |
| `ai-access.content-signals` | 3 | hybrid | partial | auto |
| `crawlability.indexability` | 8 | hybrid | partial | auto |
| `crawlability.sitemap` | 5 | hybrid | partial | auto |
| `crawlability.https` | 2 | hybrid | partial | assisted |
| `crawlability.http-behavior` | 3 | hybrid | partial | assisted |
| `structured-data.present` | 15 | script | partial | auto |
| `structured-data.valid` | 5 | script | partial | auto |
| `meta.title` | 5 | script | partial | auto |
| `meta.description` | 5 | script | partial | auto |
| `meta.open-graph` | 3 | script | partial | auto |
| `meta.twitter-cards` | 3 | script | partial | auto |
| `meta.language` | 3 | script | partial | auto |
| `meta.viewport` | 3 | script | full | auto |
| `content.headings` | 8 | script | partial | auto |
| `content.quality` | 5 | hybrid | partial | assisted |
| `content.freshness` | 5 | script | partial | assisted |
| `content.author` | 5 | hybrid | partial | assisted |
| `content.image-alt` | 5 | script | partial | assisted |
| `content.internal-links` | 4 | script | partial | assisted |
| `content.accessibility` | 4 | script | partial | auto |
| `agent-readiness.server-rendered` | 6 | hybrid | partial | assisted |
| `agent-readiness.markdown` | 5 | hybrid | partial | assisted |
| `agent-readiness.controls` | 4 | script | partial | assisted |
| `agent-readiness.protocols` | 6 (cond.) | hybrid | partial | assisted |

## Per-check findings

Each list is the extractor's notes on the extension code: mismatches between comments and code, likely bugs, and edge cases. Nothing here has been changed in the extension.

### `ai-access.bot-crawlability` - AI Bot Crawlability (12 pts)

Parity: Full parity when robots.txt is a static file in the repo. Differences: host-generated or CDN-managed robots.txt (Cloudflare 'AI Scrapers and Crawlers' managed robots.txt, Vercel/Netlify rewrites, WordPress virtual robots.txt) is invisible in source; dynamic generators (Next.js robots.ts, Astro endpoints) need evaluation; an SPA fallback that serves index.html with 200 for /robots.txt would be parsed by the extension as a non-empty file with no directives (pass 12) while source shows no file (warning 8); the extension also scores a WAF-blocked robots.txt as missing. Per-page path results differ only if Disallow rules target specific paths.

- Grouped user-agent records ('User-agent: GPTBot' then 'User-agent: CCBot' then 'Disallow: /') only apply the rules to the last agent; earlier agents get an empty group and are counted as allowed. Verified by running the parser. This deviates from RFC 9309.
- Bot matching is case-sensitive exact string: 'User-agent: gptbot' does not match 'GPTBot' in robots.json, so that bot falls back to '*' rules. RFC 9309 says matching is case-insensitive. Verified.
- robots.json contains case-variant duplicates (meta-externalagent / Meta-ExternalAgent, meta-externalfetcher / Meta-ExternalFetcher, Webzio-Extended / webzio-extended) and names with spaces or slashes ('ChatGPT Agent', 'Brightbot 1.0', 'iaskspider/2.0') that sites rarely target; combined with case-sensitive matching, blocking one variant leaves the other allowed.
- Allow rules always win over Disallow regardless of specificity (no longest-match), contrary to RFC 9309 and Google behaviour.
- Global Crawl-delay is inherited by bots that have their own group (botRules.crawlDelay || global.crawlDelay).
- Does not use isUnreachable despite CLAUDE.md's Unreachable vs Absent rule: a 403/503 robots.txt is reported as 'not found' with 8 points.
- Inline comments ('Disallow: /x # note') are not stripped, so the pattern includes the comment text.
- loadBotList fetches 'src/data/robots.json' and caches under a hardcoded version '1.0.0'; if robots.json is updated without bumping that string, users keep the stale cached list.
- Header comment and CLAUDE.md describe 'prioritized'/'more specific' rules and 10+ bots; code uses 126 bots, all equal weight.

### `ai-access.llms-txt` - llms.txt Detection (6 pts)

Parity: Hosts can serve a 200 HTML fallback for unknown paths (SPA rewrites in _redirects, vercel.json, netlify.toml): the extension would then count /llms.txt as found with base 5 (pass) even though no file exists; source analysis should report absent. Conversely, WAF/bot protection returning 403 makes the extension fail where source shows the file. Generated llms.txt (endpoints, plugins, CMS) must be rendered to measure. Cloudflare-managed or CDN-level robots.txt changes are not visible in source.

- The result id is 'llmstxt' (lowercase t) while the orchestrator/maxScores key is 'llmsTxt'; the orchestrator keys results by plan id so scoring still works, but consumers reading result.id see a different key.
- Does not use isUnreachable: a 403/429/503/timeout on /llms.txt returns fail 0, contrary to the project's unreachable vs absent rule.
- No HTML or soft-200 detection: an HTML page returned with 200 for /llms.txt counts as found and scores 5 (pass) with only format issues listed.
- Only the User-agent: * group is consulted for the robots block; AI bot specific groups are ignored. RobotsParser uses Allow-first (not longest-match) precedence and treats '?' as a wildcard, and consecutive User-agent lines do not share a group (only the last agent receives the rules).
- 'Bytes' thresholds (50, 10000) are measured as JavaScript string length (UTF-16 code units), not bytes.
- An empty file scores 2 (warning) rather than fail, and one < 50 chars but spec-valid still scores 5 (pass).

### `ai-access.content-signals` - Content Signals (3 pts)

Parity: Hosts and CDNs can add robots.txt content or the Content-Signal header outside the repo (notably Cloudflare managed robots.txt, which injects Content-Signal lines, and Cloudflare Markdown for Agents which sets the header on markdown responses). Generated robots.txt may depend on env vars. The unreachable branch cannot be reproduced from source.

- Content-Signal lines are matched anywhere in robots.txt regardless of User-agent group; group scoping in the draft spec is ignored.
- A single valid pair (e.g. only 'search=yes') is enough for full pass; missing ai-input or ai-train is not penalised.
- If robots.txt is unreachable (e.g. 403 by WAF) but the page is reachable and sends no header, the check fails with 0 even though robots.txt signals were never read, which contradicts the project's unreachable vs absent rule.
- Bot matching requires the User-agent line to be exactly the bot name; lines like 'User-agent: GPTBot/1.0' or with trailing comments do not match.
- The inconclusive branch gives 2 of 3 points, more than the 'roughly half' convention.
- loadBotList caches the list in chrome.storage with a hardcoded bundledVersion '1.0.0', so an updated robots.json is not picked up by existing installs until that constant changes; the fetched path is 'src/data/robots.json'.

### `crawlability.indexability` - Indexability (8 pts)

Parity: Canonical and meta robots are usually exact from templates or metadata exports, but host resolution depends on the production domain, and values injected by JS (SPA route changes, SEO plugins, tag managers) or CMS are invisible in source. Extension compares canonical against the actual visited URL (including http/https, query strings and trailing slash rules), which source can only approximate. Soft-404 depends on rendered innerText and word counts, which source can only estimate without a build. X-Robots-Tag headers are NOT part of this check (see httpBehavior).

- Directive matching is substring-based: any content containing 'none' (e.g. 'max-image-preview:none', a valid non-blocking directive) is treated as noindex+nofollow and makes the check fail with 0.
- meta[name*="bot" i] also matches name="robots" itself, so robots directives are recorded twice (booleans, so no double penalty). It could match unrelated names containing 'bot'.
- Only the first meta[name="robots"] is read by querySelector (case-sensitive attribute value), but the case-insensitive bot selector catches all of them anyway.
- Soft-404 heuristic is aggressive: a short page (< 200 words) whose title contains 'error' or whose first 1000 body chars contain '404' (e.g. Atlanta 404 phone numbers, '404' in a product code) fails the whole check with 0.
- www vs apex (or any subdomain) canonical mismatch is treated as critical 'different domain' and zeroes the check.
- http vs https canonical mismatch on the same host is a -2 warning, not critical.
- File comment says X-Robots-Tag cannot be checked here; that is handled by httpBehavior.

### `crawlability.sitemap` - Sitemap Detection (5 pts)

Parity: Static files give full parity. Divergence: generated sitemaps depend on build config; hosting may add, rewrite or block routes (WAF/bot protection returning 403 makes the extension report no sitemap); a CMS or server may serve a sitemap not present in the repo; a SPA fallback that returns index.html with 200 for /sitemap.xml counts as "found" in the extension but with 0 <loc> (score 3 or lower); robots.txt may be generated by the host (e.g. Cloudflare managed robots.txt) and differ from the repo.

- No unreachable handling (see inconclusive): violates the CLAUDE.md "Unreachable vs Absent" rule.
- Missing robots.txt is penalized twice (-1 not found, -2 not referenced), total -3.
- Any response.ok counts as a sitemap, including an HTML soft-404 or SPA fallback page; there is no content-type or XML validation. "<loc>" counting is a raw substring count, so a namespaced or whitespace variant (e.g. <loc >) would not count.
- Robots reference check is only includes("sitemap:"), which also matches a commented-out "# Sitemap:" line or any text containing it.
- Sitemap probe fetches have no timeoutMs, unlike robots.txt which uses pageTimeoutMs.
- currentPageInSitemap uses the raw current URL (with query and trailing slash differences) and is informational only.
- Header comment says "Check 12"; irrelevant to scoring.

### `crawlability.https` - SSL / HTTPS (2 pts)

Parity: The protocol is a property of the deployment, not the repo; source can only infer it from config and host conventions. Mixed content from literal templates matches, but scripts/widgets injected at runtime, CMS content, and http: URLs built dynamically are not visible. Protocol-relative (//) or uppercase (HTTP:) URLs are not flagged by the extension either, so do not flag them.

- details.protocol uses window.location.protocol, not the analyzed URL; harmless for scoring.
- Selectors are prefix matches on raw attribute values: "HTTP:" uppercase, protocol-relative "//", link rel="stylesheet preload" or rel="Stylesheet", srcset, video/audio/source, and CSS url() are not detected.
- Header comment notes certificate validity, HSTS and other security headers are not checked; confirmed, none affect score.

### `crawlability.http-behavior` - HTTP Behavior (3 pts)

Parity: The extension observes live HTTP responses; the repo only lets us predict them. Host defaults (Cloudflare Pages SPA fallback when no 404.html exists, framework adapters, CDN or WAF rules, origin servers not in the repo), dashboard-configured headers/redirects, and edge middleware can all differ from what the source shows. The extension also awards points for WAF blocks and timeouts, which source analysis cannot reproduce.

- Inconclusive handling differs from the project rule in CLAUDE.md (warning at roughly half weight with details.inconclusive): here unreachable probe/page earn the full point, and there is no inconclusive flag, so a fully blocked site scores 3/3 pass.
- Probe treats every 5xx as inconclusive (+1), but the page criterion treats 500/502 as a real failure (only 503 is unreachable).
- fetch follows redirects, so the probe sees the final status: unknown URLs 301-redirected to a 404 page score +1, redirected to the homepage (200) score 0.
- X-Robots-Tag regex uses \b, so 'noindex' inside bot-scoped values like 'googlebot: noindex' also triggers the forced fail even if it only targets one bot.
- Only the page's own response headers are read; X-Robots-Tag set via <meta http-equiv> is not considered.

### `structured-data.present` - Structured Data (15 pts)

Parity: Exact when JSON-LD is literal in HTML or when the built output can be scanned. Differs when JSON-LD is assembled at runtime (client-side injection by GTM, Yoast/Rank Math style CMS plugins, React state), built from CMS data or template variables that cannot be resolved statically (validity of name/headline/datePublished then unknown), or injected per-route in SPAs. Extension evaluates one URL; source audit may cover many templates.

- File header comment says 20 points and 'Total capped at 20'; code caps at maxScore 15. Followed code.
- Maximum raw sum (4+8+9+6+3=30) far exceeds 15, so e.g. Organization + Article + Person + BreadcrumbList + base = 4+3+2+1+1 = 11 (warning); a single valid FAQPage plus base already gives 12 (pass).
- Recursive walk counts nested entities: an Article whose publisher is {@type: Organization, name} earns the Organization tier (+3) and an author {@type: Person, name} earns Person (+1). A plugin should replicate this rather than only counting top-level types.
- If every JSON-LD block fails to parse, jsonldData.length > 0 so the Microdata/RDFa 4-point fallback is skipped and score is 0 (fail) even when Microdata exists.
- RDFa detection uses [typeof] or [vocab] only; OpenGraph meta property= tags alone do not count. But a stray typeof attribute anywhere (e.g. some Drupal themes) makes RDFa 'found'.
- @type matching is exact and case-sensitive; prefixed types like 'schema:Organization' or full IRIs fall into Other.
- validateArticle calls data.headline.length; an array headline passes length check oddly. validateOrganization treats a nested reference-only object without name as invalid, but a type counts valid if ANY entity of that type is valid.
- validator ISO 8601 check is just new Date(x) not NaN, so non-ISO strings like 'March 3, 2024' pass in Chrome.
- Validity of HowTo requires step items with @type exactly 'HowToStep'; HowToSection groupings make it invalid.

### `structured-data.valid` - Schema Validation (5 pts)

Parity: Full parity when JSON-LD is literal in templates or a build output is available. Partial when JSON-LD is assembled at runtime (SPA frameworks, tag managers, CMS plugins injecting JSON-LD), when values come from CMS/frontmatter (a missing headline or datePublished depends on per-post data), or when templates emit different blocks per page type. Template syntax inside literal blocks can make static JSON.parse fail where the rendered page parses fine, so template tags must be substituted before parsing, never counted as parse errors.

- Nested nodes are validated too: a nested Person (Article.author) or Organization (publisher) without name drags the rate down. After @id resolution, a @graph node referenced from author/publisher is validated twice (once as graph item, once nested), so it counts double in the rate.
- Offer is not validated as its own type (valid null) even though the code comment says nested issues are "like Offer inside Product"; Offer issues surface only via Product.
- A block that is a JSON array at top level (e.g. [{...},{...}]) is walked by getSchemaTypes via Object.keys on the array (indexes), so its items are still collected; getPrimarySchemas ignores it (affects message only).
- If every block fails JSON.parse, validationRate defaults to 100 and status is warning, with score 5 - 0.5n floored.
- schema.isLocalBusiness is never set by the checker; isLocalBusiness in validator comes only from the type list, and LocalBusiness-specific checks are warnings anyway.
- Article.headline.length assumes a string; a non-string headline is not an issue (length undefined, no warning).
- isValidISO8601 uses new Date(), so non-ISO strings such as "March 5, 2024" pass.
- BreadcrumbList item position 0 counts as missing (falsy check).
- Status and score can disagree: warning with 4 for any parse error even at 100% rate; status uses validationRate thresholds 100/50 while score deductions use 100/80/50.

### `meta.title` - Meta Title (5 pts)

Parity: Full when the title is a literal or resolvable from front matter/metadata exports. Differs when titles come from CMS data, i18n, runtime document.title updates in SPAs (react-helmet, vue-meta), or template composition that cannot be evaluated statically. Source audits every page, extension scores just the visited one.

- Header comment says 50-60 optimal and the too_short comment says 40-60; code penalizes 40-49 by 0.5 and < 40 by 2.
- Reported score is Math.floor(finalScore) but status is computed from the unfloored value, so 'pass' can show 4/5 and 'warning' can show 2/5.
- Separator count uses /[-|:]/ over the untrimmed title and counts hyphens inside words (e.g. 'AI-powered step-by-step how-to' has 5 hyphens and loses 0.5). En/em dashes and other separators like a middle dot are not counted, and do not satisfy the brand-only exemption.
- Brand-only test uses trimmed length but title.includes on the untrimmed value; harmless in practice.
- Generic patterns are whole-string matches only; 'Home | Brand' is not generic.

### `meta.description` - Meta Description (5 pts)

Parity: Exact when the description is a literal in HTML or front matter. Differs when the value is computed at runtime (JS-injected via react-helmet/SPA, CMS-fetched data, generateMetadata with remote data), when a title template suffix changes document.title (affects the title-equality rule), or when a framework adds a default description. HTML entities must be decoded before measuring length.

- Status uses the decimal score while the reported score is floored, so status and points can look inconsistent (4.5 => pass/4, 2.5 => warning/2).
- Length thresholds use the trimmed length, but generic/title/stuffing checks use the untrimmed description in some places (stuffing splits untrimmed text; a leading space yields an empty first token, harmless).
- Only the first meta[name="description"] is examined; selector value 'description' is case-sensitive, so name="Description" is treated as missing.
- Header comment says 150-160 is optimal but code gives full marks for 120-160.

### `meta.open-graph` - Open Graph (3 pts)

Parity: Exact for literal tags. Differs for runtime-injected tags, framework or plugin defaults not visible in source (Hugo internal templates, Next.js metadata merging and metadataBase absolutization), template values empty at build time, and og:url vs canonical comparison when either depends on deployment base URL or trailing-slash settings of the host.

- Tags using name="og:title" instead of property= are treated as missing (unlike the Twitter checker which accepts both).
- A relative or invalid og:image URL is reported but not penalized.
- normalizeUrl lowercases the whole URL including path and query, and drops port, so case-only or port differences are not flagged.
- Status uses the decimal score while reported points are floored (2.75 and 2.5 both show pass with 2 points).

### `meta.twitter-cards` - Twitter Cards (3 pts)

Parity: Exact for literal tags. Differs for tags injected at runtime (react-helmet in SPAs), SEO plugins/framework defaults that emit tags not visible in source (Hugo internal templates, Next.js metadata merging, Astro SEO integrations), and template values that may render empty at build time.

- OG fallback only triggers when all four twitter tags are absent; twitter:site/twitter:creator alone do not prevent it. If even one twitter tag exists, OG fallbacks give no credit (only affect the message).
- An empty twitter:image is not penalized (only null is), unlike empty required tags.
- Status uses the decimal score while reported points are floored (e.g. 2.5 => pass with 2 points).
- Card type validation is case-sensitive; 'Summary' would be -0.25.

### `meta.language` - Language Tags (3 pts)

Parity: Exact for literal lang values. Differs when lang is a template variable resolved at build/runtime, set by client-side i18n libraries after load, or added by a framework automatically (Next.js i18n). hreflang has no score impact so mismatches there do not matter.

- Any lang issue (format, unknown language, unknown region) leaves status 'pass' but drops reported points from 3 to 2, so status and points diverge; 'warning' can never occur.
- Valid BCP 47 tags with script or numeric region subtags (zh-Hans, zh-Hant-TW, es-419) are penalized as invalid format.
- Language list is a limited 'common' subset; valid ISO 639 codes outside it (e.g. 'la', 'eo', 'yo') are penalized.
- The x-default hreflang issue is added to the recommendation but costs no points.
- Header comment mentions hreflang checking as a criterion, but it is informational only.

### `meta.viewport` - Mobile Friendly (3 pts)

Parity: Viewport is almost always a static literal in the head layout. Only framework-injected defaults (Next.js) and client-side modification are not directly visible; account for Next.js defaults explicitly.

- Result title is 'Viewport Config' (shown in the popup) while getCheckTitle says 'Mobile Friendly'. Used getCheckTitle per spec.
- Viewport parts separated by ';' instead of ',' are misparsed: 'width=device-width; initial-scale=1' becomes one part whose split('=') gives key 'width' and value 'device-width; initial-scale', so it scores as a fixed width (-1.5) plus missing initial-scale (-0.5) => 1 fail. Keys are case-sensitive.
- user-scalable=no and low maximum-scale are flagged but not scored.

### `content.headings` - Semantic Headings (8 pts)

Parity: The extension counts every h1-h6 in the live DOM, including visually hidden ones, headings in cookie banners, chat widgets, modals and client-rendered content. Source analysis must resolve component composition order and Markdown-to-HTML heading mapping; headings rendered from CMS data or conditionally are uncertain. Text from template variables affects the generic-heading rule.

- The first heading is never flagged as a skip even if it is an H3 or H4 (lastLevel starts at 0).
- The 'issues' count in the message only counts H1 errors, not hierarchy or generic issues.
- Generic heading detection is exact equality to the list (so 'About us' is not generic) plus length < 3.

### `content.quality` - Content Quality (5 pts)

Parity: The extension counts words from the rendered DOM using innerText, which excludes hidden (display:none) text and includes JS-rendered content; source counting may include hidden text and miss client-rendered or CMS-fetched content. Page type depends on the live URL (permalinks, trailing slashes, i18n prefixes) and document.title after templating. The paragraph count is document-wide including nav/footer <p>. Templates with variables or components make exact word counts approximate.

- hasGoodStructure, lists, headings and qualityIndicators are computed but never affect the score (dead scoring code); the header comment lists list and heading checks that are informational only.
- Status uses the unfloored finalScore while the reported score is floored, so status and score can disagree (4.5 -> pass with score 4; 2.5 -> warning with score 2).
- Schema page-type detection only reads the FIRST JSON-LD block and requires the exact no-space substring '"@type":"Article"'; pretty-printed JSON-LD ('"@type": "Article"') or @graph arrays are missed.
- URL rules are substring matches, e.g. '/about' matches '/aboutface', '/help' matches '/helpers', '/policy' matches any path containing it; '/blog/' (listing with trailing slash) is typed article, not blog.
- '/about-us' and '/uber-uns' checks are redundant with or unreachable relative to earlier includes (/about-us already contains /about).
- The paragraph check counts <p> across the whole document, not only the main content, so footer/nav paragraphs count.
- Main content picks the FIRST 'main' etc.; if a page has multiple <article> (cards) and no <main>, only the first article is counted.
- The very thin threshold uses floor(minimum*0.33), e.g. general 66, thin 132; homepage 49 and 99; contact 16 and 33.

### `content.freshness` - Content Freshness (5 pts)

Parity: Signals are usually template-driven and conditional (only on article pages, only when front matter has dates), so source analysis must resolve which templates apply to which pages. JSON-LD or <time> elements injected by JS, CMS content, or third-party widgets (e.g. comment timestamps with <time datetime>) are visible to the extension but not the repo. Any <time datetime> anywhere on the page (even in a footer or widget) counts as a modified date.

- Any <time datetime> element counts as a modified-date signal regardless of what it represents; a page whose only date is a published <time> gets 'modified found, publish missing'.
- Date values are never validated or checked for age; any truthy string passes.
- findPropertyInObject uses obj.hasOwnProperty, which would throw for objects without a prototype, but JSON.parse objects always have one; errors are caught per script anyway.
- Header comment says 'Check 13' while CLAUDE.md lists Content Freshness as check 9.

### `content.author` - Author Signals (5 pts)

Parity: Meta tags, JSON-LD, microdata and trust links in templates are reliably detectable from source. Divergence comes from: JSON-LD or meta injected client side (SPA, tag managers, Yoast-like plugins at runtime); template variables whose values live in CMS/frontmatter; the expertise scan and text-pattern detection run on rendered innerText (first 5000 chars, which includes nav/header text) that source can only approximate; href substring matching runs on raw attribute values after framework rendering (e.g. Next.js <Link href="/about">, Hugo relURL output); navigation built from data files or fetched menus. The extension evaluates a single page; source audits must choose which templates represent it.

- Header comment says trust needs "3+ trust pages", code counts 5 signals including <address>/PostalAddress, threshold >= 3. Code followed.
- Expertise patterns are case-insensitive and very broad: /\b(DO|...)\b/i matches the English word "do", /\b(MA|MS|BA|BS)\b/i, /\b(RN|NP|...)\b/i, /\b(Author|Writer|Contributor)\b/i, /\b(Professional|Expert)\b/i, /\b(Member of)\b/i, /\b(Lead|Senior|Staff) \w+/i and /\b(CIA|CMA|PMI)\b/i all hit ordinary prose, and the scan includes the first 5000 chars of body innerText. In practice the expertise point is almost always awarded; a faithful plugin should reproduce this rather than judge real credentials.
- authorSectionPatterns carry the /i flag, so /about\s+[A-Z][a-z]+/i matches "about us" or "about this" and /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/i matches "by the way"; they are not capitalization-sensitive despite the comment.
- The container-name regex lacks a leading word boundary: "Nearby Coffee Shop" or "Standby Mode Enabled" yields a spurious author name (verified with node). The first matching element in document order is usually a large wrapper div, so bio text is often skipped (>= 3000 chars) while a name may still be extracted from it.
- hasSchemaAuthor is only set when a schema author name is found, so the +1 "author marker without name" branch can never be reached via JSON-LD (e.g. Article.author present as {"@id": ...} only). Only empty meta author or nameless microdata can reach it.
- Any JSON-LD Person anywhere (e.g. Organization.founder) is treated as the page author.
- a[href*="/about"] counts simultaneously for authoritativeness (author link) and trust, so a single About link can earn 1 point in each.
- Relative hrefs without a leading slash (href="about.html") do not match the "/about" substring; absolute URLs do (https://x.com/about).
- The aeo-checker getCheckTitle title is "Author Signals" but the check itself returns title "Author & E-E-A-T".
- hasSocialProfiles and experience signals are computed but unused in scoring.

### `content.image-alt` - Image Alt Text (5 pts)

Parity: Literal templates and built HTML give exact parity. Differences arise from images injected by JavaScript (carousels, lazy loaders, third-party widgets, tracking pixels), CMS content images, components that conditionally render images, and dynamic alt expressions that may evaluate to empty strings. The extension counts every img in the live DOM including tracking pixels and widget images the repo does not contain.

- The recommendation says "Use empty alt=\"\" for decorative images" but the scoring counts alt="" as missing, so following the advice lowers the score. Faithful reproduction should count alt="" as missing and flag the contradiction.
- role="presentation" / aria-hidden images are not exempted; svg, picture sources, CSS background images and input[type=image] are ignored.
- Header comment calls scoring proportional "percentage * maxScore"; exact implementation double-rounds (percentage rounded to integer first).

### `content.internal-links` - Internal Linking (4 pts)

Parity: The extension sees the rendered DOM including JS-injected links (menus, related posts widgets, CMS content) and uses innerText (hidden text excluded, CSS text-transform can apply). Link hrefs built from variables or data files need resolution. Exact hostname comparison depends on the live host (www vs apex, preview domains), so absolute links to the canonical domain can count as external when the audited URL uses a different host.

- Image-only links (e.g. logo or card images with alt text) have empty innerText and count as generic, so content cards with images can be penalised although they have accessible names.
- Exact hostname equality treats www.example.com and example.com (and subdomains) as external.
- The -1 low-count rule requires BOTH contentLinks < 3 AND total < 5, so a page with 5+ nav links but zero content links is not penalised.
- genericLinks already excludes nav links, so the second filter (genericInContent) and the contentLinkCount > 0 guard are redundant.
- Status uses the unfloored score while the reported score is floored (e.g. 3.75 reported as 3 with pass).
- The '→', '»', '>' patterns are unreachable as they are single characters already caught by the length < 2 rule.
- uniqueDestinations and descriptivePercentage are computed but have no score effect; the header comment lists link diversity as a check.

### `content.accessibility` - Accessibility (4 pts)

Parity: The extension counts elements in the live DOM after JavaScript, including third-party widgets (cookie banners, chat widgets with unlabeled inputs) that are not in the repo. Component frameworks may render <main>/<nav> from library components whose names do not reveal the tag. Conditionally rendered elements may be present or absent at runtime.

- The result object's title is 'Semantic Structure', which the popup displays; getCheckTitle maps the key to 'Accessibility'. Used getCheckTitle per spec.
- The semantic-count deduction only applies when main is also missing, so with a <main> present the count never matters.
- Form label rule does not consider placeholder, title attribute, or implicit button labels; label[for] lookup is built by string interpolation into a selector, so ids with quotes or special characters could throw (caught by orchestrator as check error).
- Inputs of type submit/button/image/reset are counted as inputs needing labels.
- Skip link and ARIA counts are computed but never scored.

### `agent-readiness.server-rendered` - Server-Rendered Content (6 pts)

Parity: The extension diffs a live fetch against the live DOM; from source, the rendered DOM must be estimated. Middleware, edge rendering, A/B scripts, CMS content, consent walls, bot-specific responses and host behavior (redirects, 404/401 pages, compression) are invisible to source analysis. Building the site gives near-exact raw HTML for static generators, but the rendered word count still needs estimation when client JS adds content.

- The empty app root rule forces score 0 even when the ratio is high, e.g. a server-rendered page that also contains an empty <div id="app"> widget mount or an empty [data-reactroot] would fail.
- findEmptyAppRoot uses the first element per selector and checks textContent only, so a root containing only images or an empty loader is treated as empty regardless of child elements.
- h1Missing requires raw HTML to have no <h1> at all; a raw <h1> with different or empty text passes.
- Word counts use textContent (includes hidden elements) for both raw and rendered, unlike contentQuality which uses innerText.
- Any non-200 final status (including 404, 500) is treated as inconclusive warning 3, not a fail.
- Missing Content-Type header is treated as HTML; a non-HTML Content-Type gets a full pass without inspection.
- Redirected/truncated rescue only applies to fail; a warning or pass on a redirected fetch is reported as-is.

### `agent-readiness.markdown` - Markdown for Agents (5 pts)

Parity: Content negotiation is a runtime server/CDN property (often a Cloudflare dashboard toggle) and usually invisible in the repo, so source can under-report tier 1. DOM alternate links injected by JavaScript are seen by the extension but not in static templates. The .md probe depends on the host serving .md files with a non-HTML content type and on SPA fallbacks not returning index.html. Unreachable/WAF cases (inconclusive 3) cannot be reproduced from source.

- Link header detection tests /text\/markdown/i and /rel="?alternate"?/i independently over the whole header, so a Link header with an unrelated rel=alternate plus some other link mentioning text/markdown would count.
- The unreachable branch fires before the negotiated/alternate branches, so a site with a DOM markdown alternate still gets 3 (same number) but also with inconclusive flag; a site with only a .md probe gets 3 instead of 2 when negotiation is unreachable.
- Probe URL is skipped whenever the last path segment contains a dot (e.g. /page.html), so /page.html never probes /page.md.
- varyAccept and xMarkdownTokens are collected but never affect score.
- The DOM alternate check uses the live rendered DOM (document.querySelector) while negotiation uses a network fetch; a fully JS-injected link still counts.

### `agent-readiness.controls` - Agent-Usable Controls (4 pts)

Parity: The extension sees the live DOM, including controls rendered by client JS, third-party widgets (chat bubbles, cookie banners, embeds) and CMS content, all of which are absent from source. Per-page percentages depend on how components compose into a page, so component-level source scans can differ from the per-URL result. CSS-hidden elements are counted by both (only hidden/aria-hidden are excluded).

- fakeClickables excludes any element with ANY role attribute (e.g. role="presentation"), not just role="button"; the comment says role=button only.
- An element with role="button" plus onclick is counted in buttons, and a div with onclick plus tabindex is accepted even though it has no role.
- Autocomplete name pattern is prefix-anchored only: plain name="name" is not a candidate (needs fname/firstname/lname/lastname/fullname), while 'statement', 'telemetry', 'cityscape' or 'company_logo' are candidates. textarea and select are never checked.
- Anchors with href="#" but aria-expanded/aria-haspopup are exempt; anchors with id and no text are exempt as named anchors, but <a id="x">Text</a> without href is a problem.
- Accessible name uses textContent, so text hidden with CSS or a nested aria-hidden span still counts as a name; aria-labelledby resolves ids with textContent.

### `agent-readiness.protocols` - Agent Protocol Discovery (6 pts)

Parity: Artifacts can be served dynamically (edge functions, reverse proxies to an API host, framework route handlers) or set by the host, and Content-Type (relevant for api-catalog linkset and HTML detection) is decided by the server. API evidence in the extension is evaluated on the single rendered page, so links injected by JS or present only on other pages differ. WebMCP attributes added at runtime by JS are visible to the extension (rendered DOM) but may not be in source. The 'all probes unreachable' na branch cannot be reproduced from source.

- api-catalog and openapi entries share category 'api', and both MCP paths share 'mcp', so publishing multiple files in one category does not raise the score.
- /.well-known/ai accepts any non-empty non-HTML body (e.g. plain text or even a JSON 404 error body served with 200); it is the loosest validator.
- A 2xx JSON catch-all (e.g. an API gateway returning {} for any path) would satisfy the MCP validators (any object) and the skills validator, inflating the score.
- Validator for api-catalog passes on content-type /linkset/i even if the body is not JSON (json null).
- The all-unreachable branch returns 'na' rather than the 'warning at half weight' pattern the project CLAUDE.md prescribes for unreachable resources; intentional per code comment but inconsistent with the rule.
- isSameSite suffix matching means a page on sub.example.com treats example.com and any other *.example.com as same site; public suffix is not consulted (a page on co.uk itself is not a realistic case).
- findApiEvidence caps anchor samples at 5 but service-desc and WebAPI entries are appended while evidence.length < 6; harmless.
