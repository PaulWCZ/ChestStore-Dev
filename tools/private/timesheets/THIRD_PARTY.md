# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Manrope (font) | [sharanda/manrope](https://github.com/sharanda/manrope), via `@fontsource-variable/manrope` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-manrope.txt` |
| Martian Mono (font) | [evilmartians/mono](https://github.com/evilmartians/mono), via `@fontsource-variable/martian-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-martian-mono.txt` |
| Export column names of Toggl Track, Clockify, Harvest (facts) | solidtime's importers, [solidtime-io/solidtime](https://github.com/solidtime-io/solidtime) `app/Service/Import/Importers/` (read 2026-09-28) | AGPL-3.0 | `lib/import-formats.ts` knows the same column names; **no code copied**, the parser is our own |
| Harvest's detailed time export money columns (facts): `Billable Rate`, `Billable Amount`, `Cost Rate`, `Cost Amount`, `Currency`, `Invoiced?`, `Approved?` | Harvest Help Center, "Detailed time and detailed expense reports", https://support.getharvest.com/hc/en-us/articles/360048687171-Detailed-time-and-detailed-expense-reports (read through search results 2026-09-29; the page itself is blocked by this environment's egress) | facts | `lib/import-formats.ts`, the realistic file in `test/import.test.ts` |
| Ideas: weekly submit and approve, per-person billable and cost rates, team capacity view, budget alerts at 80/100 % (Harvest, Clockify) | their public feature pages, as the critique `reports/05-critique/timesheets.md` lists them | — | features only |
| Ideas: lock dates, budgets (Kimai); timer line, importers (solidtime); weekly grid (Harvest) | see `reports/02-open-source/timesheets.md` in the studio | AGPL-3.0 (Kimai, solidtime) | features only, no code |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). Icons and the mark are drawn for this
tool (`components/icons.tsx`, `components/mark.tsx`).
