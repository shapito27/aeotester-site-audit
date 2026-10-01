# references

- `rubric.json` - the AEOTester checklist: 26 checks, 133 points (127 when the conditional agent protocol check does not apply; Content Signals is advisory and never scored). Single source of truth for scoring. Licensed CC BY 4.0, see `LICENSE-RUBRIC` at the repo root.
- `rubric.schema.json` - JSON schema for editors. `scripts/validate-rubric.mjs` enforces the rest (point totals, category sums, unique ids).

The rubric is data only. Scripts and skills look checks up by `id`, so scoring can later move behind an API without changing the skills.
