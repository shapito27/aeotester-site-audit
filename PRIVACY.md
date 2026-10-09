# Privacy policy: AEOTester plugin

Effective 2026-10-09. Publisher: Ruslan Saifullin ("I").

This policy covers the AEOTester plugin (the `audit` and `fix` skills) when you run it in Claude Code, Codex or the ChatGPT desktop app. The AEOTester website and Chrome extension are separate products and are not covered here.

**In short:** the plugin has no server, no accounts and no telemetry. I do not collect, receive or store any personal data. Everything runs on your computer, and the only network requests are the ones you ask for by naming a website to audit.

## 1. Personal data I collect

None. Categories of personal data collected by me: none. The plugin sends nothing to me, to aeotester.com, or to any analytics, advertising or tracking service. There is no sign-in, no cookie, no device or usage identifier, and no crash reporting.

## 2. Data the plugin handles on your computer, and why

The plugin works on data you point it at. It handles it locally, only to do the task you asked for.

| What | Purpose |
|---|---|
| Files of the website in your project folder: HTML pages, `robots.txt`, `llms.txt`, sitemaps and host config such as `_headers`, `vercel.json` or `netlify.toml`. These files may contain personal data you already publish, for example an author name or a contact address on a page. | Scoring the 26 checks, and writing fixes (titles, schema markup, `llms.txt` and so on) that you approve |
| In URL mode, the public pages and discovery files of the site you name (see section 3) | Scoring the same checks against the live site |
| What it writes: `aeotester-report.md` (and a JSON file only if you ask for one) in your project folder, and the source file edits you approve | Giving you the result of the audit and the fixes |

The plugin does not ask for, and has no use for, passwords, API keys, payment card details, health information or government identifiers. It does not run in the background: it acts only when you ask for the audit or fix skill.

## 3. Who receives data (categories of recipients)

- **The AI service you run the plugin in** (for example Anthropic for Claude Code, or OpenAI for Codex and ChatGPT). The plugin runs inside your conversation with that service, so the files it reads, the report and the diffs become part of that conversation and are handled under that service's own privacy policy and your settings with it. I do not receive them.
- **The website you audit, in URL mode only.** The plugin sends plain `GET` requests, a few at a time, to the site you name: its pages, `robots.txt`, `llms.txt`, sitemaps, the `/.well-known/` discovery files, one made-up URL to test the 404 response, and the `http://` version of the homepage to test the redirect. Pages and files used for scoring must come from that site's own origin; if that site redirects a request (for example `http` to `https`), the redirect is followed. The requests identify themselves with the user agent `AEOTester-Audit/0.2`. That site's server can log them, including your IP address, the URLs requested and the time. The plugin skips pages that `robots.txt` disallows unless you pass `--ignore-robots`. In repo mode and in the fix skill the plugin makes no network requests at all.
- **No one else.** I do not sell or share personal data, and there are no other recipients.

## 4. Retention

- **Me:** I hold no data, so there is nothing to retain.
- **On your computer:** the report and any edits stay in your project folder until you delete them. The plugin never commits, pushes or changes git state, so nothing enters your repository history unless you commit it yourself.
- **The AI service and the audited website:** they keep data for the periods in their own policies and server settings. I do not control those.

## 5. Your controls

- You choose whether to install, enable or remove the plugin. Removing it leaves no data with me, because I have none.
- You choose what it works on: a folder, or a URL you name. Without a URL it makes no network request.
- The fix skill shows every change as a diff and asks before writing. In Codex and ChatGPT it runs only when you ask for it by name.
- You can delete `aeotester-report.md` at any time, and undo any edit with your usual version control.
- Your AI service's own settings control how it stores and uses your conversation.

Because I hold no personal data, there is nothing for me to access, correct or delete on request. If you think the plugin does something this policy does not describe, tell me and I will fix the plugin or this policy.

## 6. Children

The plugin is a developer tool and is not directed to children under 13. It collects no personal data from anyone.

## 7. Changes to this policy

I will update this file in the [repository](https://github.com/shapito27/aeotester-site-audit) and change the effective date above. The history is public in git. If a change would make the plugin collect data, I will say so in the plugin's listing and release notes before it takes effect.

## 8. Contact

Questions about this policy, or support: [open an issue](https://github.com/shapito27/aeotester-site-audit/issues). Security problems: use GitHub's private vulnerability reporting on the repository (see [SECURITY.md](SECURITY.md)).
