# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Manrope (font) | [sharanda/manrope](https://github.com/sharanda/manrope), via `@fontsource-variable/manrope` 5.3.0 | OFL-1.1 | `public/assets/fonts/`, licence in `public/assets/fonts/LICENSE-manrope.txt` |
| Martian Mono (font) | [evilmartians/mono](https://github.com/evilmartians/mono), via `@fontsource-variable/martian-mono` 5.3.0 | OFL-1.1 | `public/assets/fonts/`, licence in `public/assets/fonts/LICENSE-martian-mono.txt` |
| Export column names of Toggl Track, Clockify, Harvest (facts) | solidtime's importers, [solidtime-io/solidtime](https://github.com/solidtime-io/solidtime) `app/Service/Import/Importers/` (read 2026-09-28) | AGPL-3.0 | `src/shared/import-formats.ts` knows the same column names; **no code copied**, the parser is our own |
| Harvest's detailed time export money columns (facts): `Billable Rate`, `Billable Amount`, `Cost Rate`, `Cost Amount`, `Currency`, `Invoiced?`, `Approved?` | Harvest Help Center, "Detailed time and detailed expense reports", https://support.getharvest.com/hc/en-us/articles/360048687171-Detailed-time-and-detailed-expense-reports (read through search results 2026-09-29; the page itself is blocked by this environment's egress) | facts | `src/shared/import-formats.ts`, the realistic file in `test/import.test.ts` |
| Ideas: weekly submit and approve, per-person billable and cost rates, team capacity view, budget alerts at 80/100 % (Harvest, Clockify) | their public feature pages, as the critique `reports/05-critique/timesheets.md` lists them | — | features only |
| Ideas: lock dates, budgets (Kimai); timer line, importers (solidtime); weekly grid (Harvest) | see `reports/02-open-source/timesheets.md` in the studio | AGPL-3.0 (Kimai, solidtime) | features only, no code |

Dependencies installed from npm under their own licences: `hono` and
`@hono/node-server` (MIT), `react`, `react-dom` (MIT), `postgres`
(Unlicense); for the build and the tests only `vite` (MIT), `typescript`
(Apache-2.0), `@electric-sql/pglite` and `@electric-sql/pglite-socket`
(Apache-2.0 / PostgreSQL). The studio's packs in `vendor/` (MIT):
`@argentic/chest-sdk` (the SDK, 0.4.1 and the studio's proposals),
`@argentic/chest-ui` (the UI kit: themes, the look's runtime, shared
components), `@argentic/chest-app` (the server and browser machinery:
pages, islands, actions, the policy, tests). Next.js is no longer used.
Icons and the mark are drawn for this tool (`src/components/icons.tsx`,
`src/components/mark.tsx`). `src/shared/amounts.ts` reads an amount with
the same grammar as `@argentic/chest-app`'s `field.money` (the studio's
own code, MIT).
