# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Public Sans (font) | [uswds/public-sans](https://github.com/uswds/public-sans), via `@fontsource-variable/public-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-public-sans.txt` |
| JetBrains Mono (font) | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono), via `@fontsource-variable/jetbrains-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-jetbrains-mono.txt` |
| ZIP writer | **Written for this tool** (`lib/zip.ts`): stored entries, CRC-32, from PKWARE's APPNOTE.TXT (the ZIP file format specification). No code copied; fflate (MIT) was considered and not needed | MIT (this tool) | `lib/zip.ts`, tested in `test/zip.test.ts` |
| Workflow ideas | Odoo `hr_expense` (LGPL-3.0): draft → submitted → approved → paid, "paid by employee / company", duplicate and same-receipt warnings. Frappe HR (GPL-3.0): mileage claims. **Ideas only, no code copied** | — | `lib/expenses.ts` |
| Mileage scale figures | French tax administration's *barème kilométrique* (public data), as read in search results on 2026-09-28 — see `reports/02-open-source/expenses.md` | public data | `migrations/0001_expenses.sql` |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). Development only: `@electric-sql/pglite`,
`@electric-sql/pglite-socket` (Apache-2.0), `typescript` (Apache-2.0),
`@types/*` (MIT). Icons are drawn for this tool (`components/icons.tsx`).
