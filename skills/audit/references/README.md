# references

- `rubric.json` - the AEOTester checklist: 26 checks, 138 points (132 when the conditional agent protocol check does not apply). Single source of truth for scoring. Licensed CC BY 4.0, see `LICENSE-RUBRIC` at the repo root.
- `rubric.schema.json` - JSON schema for editors. `scripts/validate-rubric.mjs` enforces the rest (point totals, category sums, unique ids).

The rubric is data only. Scripts and skills look checks up by `id`, so scoring can later move behind an API without changing the skills.
