# AEOTester Site Audit

Audit and auto-fix your website for AI search (AEO) - right inside Claude Code. 26 checks, 138 points: schema markup, llms.txt, AI crawler rules.

> Status: early development (v0.1 scaffold). The commands exist but do not do anything useful yet.

## Install

```bash
claude plugin marketplace add shapito27/aeotester-site-audit
claude plugin install aeotester@aeotester
```

Or from inside a Claude Code session:

```
/plugin marketplace add shapito27/aeotester-site-audit
/plugin install aeotester@aeotester
```

## Commands

| Command | What it does |
|---|---|
| `/aeotester:audit` | Runs the 138-point AEO checklist on your site source and writes `aeotester-report.md` |
| `/aeotester:fix` | Applies fixes in your repo (schema, llms.txt, headings, robots.txt, meta). Always shows a diff and asks first |

## Local development

```bash
claude --plugin-dir ./aeotester-site-audit
claude plugin validate --strict ./aeotester-site-audit
```

Inside a session, `/reload-plugins` picks up edits.

## Privacy

No network calls. Nothing is sent to aeotester.com or anywhere else. See [SECURITY.md](SECURITY.md).

## License

Code: [MIT](LICENSE). Rubric (`rubric.json`): [CC BY 4.0](LICENSE-RUBRIC), attribution to [aeotester.com](https://aeotester.com/?utm_source=github&utm_medium=plugin).

---

Check a live URL: [aeotester.com](https://aeotester.com/?utm_source=github&utm_medium=plugin)
