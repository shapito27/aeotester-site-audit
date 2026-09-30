---
name: fix
description: Apply AEOTester fixes in the current repo - JSON-LD schema markup, llms.txt, robots.txt AI crawler rules, Content Signals, meta and social tags, heading hierarchy, language and viewport tags. Shows a diff and asks before writing anything, then re-audits to show the score change.
argument-hint: "[check-id ...] [--yes]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Bash(node:*)
---

# AEOTester fix

Fixes the problems `/aeotester:audit` found, in the site's source files.

## Non-negotiable rules

1. **Diff first, then ask.** Show every planned change as a diff and get the user's approval before the first Edit or Write. The only exception is `--yes` in the arguments: then the user has approved in advance, but you still show the diffs, before applying them.
2. **Never commit, push, stash or change git state.** Never delete files.
3. **Only touch files inside the current repo.** Never edit build output (`dist/`, `_site/`, `out/`, `.next/`, Hugo's `public/`). Fix the source that produces it.
4. **Never invent facts.** Names, people, job titles, credentials, prices, ratings, dates, addresses and social profiles come from the repo (`page-facts.mjs`) or from the user. If a fix needs a fact you do not have, ask, or skip that fix and say why.
5. **Policy choices belong to the user:** which AI bots to allow, and the Content-Signal values (search, ai-input, ai-train). Propose a default and ask.
6. **No network calls.**

## Steps

### 1. Audit

Check `node --version` (Node 18+ needed). Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" . --no-report --json -
```

Read `site.mode` and `site.stack.id`:

- `report-only` (WordPress and other CMSs): stop. Content lives in the database; point the user to the fix list in `aeotester-report.md` (run `/aeotester:audit` first if it is missing). Do not edit files.
- `needs-build`: ask whether to run the build command from `site.notes`. Only build if they agree, then audit again.
- `nextjs`: every fix is assisted. Show the diffs as proposals and apply only the ones the user explicitly approves. Never use `--yes` shortcuts for Next.js.
- `full`: continue.

### 2. Choose what to fix

- With check ids in the arguments: fix exactly those, auto or assisted.
- Without: every check where `fixable` is `auto` and `lost` > 0, sorted by points lost. Skip `inconclusive` checks unless the finding is concrete.
- List assisted checks that lost points at the end, as "needs your input", with the command to run them (`/aeotester:fix content.author`). Do not attempt them unasked.

### 3. Gather facts and recipes

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/fix/scripts/page-facts.mjs" . [--pages file1.html,file2.html]
```

For each chosen check, read its recipe: `${CLAUDE_SKILL_DIR}/references/fix-recipes/<check-id>.md`. Read only the recipes you need. For llms.txt, draft with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/fix/scripts/generate-llms-txt.mjs" .
```

Review the draft before proposing it: drop weak lines (for example "Click here to learn more"), keep links useful.

### 4. Find the source

For static HTML the flagged file is the source. For generated sites (Astro, Hugo, Eleventy, Vite, Next.js), findings point at built HTML; find the layout, partial, component or content file that produces it (Grep for the flagged text or tag). Prefer one change in a shared layout over the same change in many pages.

### 5. Plan and show the diff

Prepare all changes, then show them in one message:

- a table: file | check | what changes | expected points,
- one fenced `diff` block per file (unified diff, a few lines of context),
- for new files (llms.txt), the full content.

Then ask with AskUserQuestion: **Apply all**, **Let me choose** (then ask per file or per check), or **Cancel**. With `--yes`, skip the question and apply.

### 6. Apply

Use Edit for existing files and Write only for new files. Match the file's existing indentation and style. Apply only what the user approved.

### 7. Re-audit and report

For generated sites, ask whether to rebuild before re-auditing (a re-audit without a rebuild reads the old output). Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" .
```

This rewrites `aeotester-report.md`. Report in chat:

- score before -> after (and the percentage),
- what was fixed, per check,
- what was skipped and why,
- assisted items still open,
- a reminder that nothing was committed: review with `git diff`.
