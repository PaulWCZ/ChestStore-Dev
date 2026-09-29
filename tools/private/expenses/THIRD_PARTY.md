# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Public Sans (font) | [uswds/public-sans](https://github.com/uswds/public-sans), via `@fontsource-variable/public-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-public-sans.txt` |
| JetBrains Mono (font) | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono), via `@fontsource-variable/jetbrains-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-jetbrains-mono.txt` |
| ZIP writer | **Written for this tool** (`lib/zip.ts`): stored entries, CRC-32, from PKWARE's APPNOTE.TXT (the ZIP file format specification). No code copied; fflate (MIT) was considered and not needed | MIT (this tool) | `lib/zip.ts`, tested in `test/zip.test.ts` |
| Workflow ideas | Odoo `hr_expense` (LGPL-3.0): draft → submitted → approved → paid, "paid by employee / company", duplicate and same-receipt warnings. Frappe HR (GPL-3.0): mileage claims. **Ideas only, no code copied** | — | `lib/expenses.ts` |
| Mileage scale figures | French tax administration's *barème kilométrique* (public data), as read in search results on 2026-09-28 — see `reports/02-open-source/expenses.md` | public data | `migrations/0001_expenses.sql` |
| Receipt reading (OCR) | [tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 and tesseract.js-core 7.0.0 (Tesseract OCR compiled to WebAssembly, with Leptonica), npm registry read 2026-09-29. Used as a library, not modified; its worker and core are copied at build into `public/ocr/` with their licence files (`scripts/ocr-assets.mjs`) | Apache-2.0 (Tesseract: Apache-2.0; Leptonica: BSD-2-Clause, in the core's notice) | `components/ocr.ts`, `public/ocr/` (built) |
| French OCR model | `fra.traineddata` "best_int" from Tesseract's tessdata, packaged as `@tesseract.js-data/fra` 1.0.0 (0.7 MB gzip) | package MIT; tessdata Apache-2.0 | `public/ocr/fra.traineddata.gz` (built) |
| SEPA transfer file | Written for this tool (`lib/sepa.ts`) from the ISO 20022 message `pain.001.001.03` as French banks take it: the CFONB's *Guide d'utilisation du CustomerCreditTransferInitiation* (pain.001.001.03 & 09, V2.6, https://www.cfonb.org/…, found by search 2026-09-29, the site was not reachable from the studio) and the EPC's *SEPA Credit Transfer Customer-to-PSP Implementation Guidelines* EPC132-08 (https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-11/EPC132-08%20SCT%20C2PSP%20IG%202025%20V1.0.pdf, search 2026-09-29, not reachable either): service level SEPA, charges SLEV, EUR, BIC optional ("NOTPROVIDED" for the debtor's agent, https://www.sepavalidation.com/en/blog/when-bic-required-sepa-payments), the EPC basic Latin character set (EPC217-08). **Checked**: files the tool makes validate against the ISO 20022 schema `pain.001.001.03.xsd` (as distributed in https://raw.githubusercontent.com/raphaelm/python-sepaxml/master/sepaxml/schemas/pain.001.001.03.xsd, fetched 2026-09-29; not shipped) with `xmllint` — in the tests (`SEPA_XSD=…`) and the browser flow. **Not checked**: a real upload to a French bank | MIT (this tool) | `lib/sepa.ts`, `lib/payments.ts`, `test/payments.test.ts` |
| IBAN check | ISO 13616 mod-97 check digits and the SEPA countries' IBAN lengths (SWIFT IBAN registry, as known; not re-read) | — | `lib/iban.ts` |
| Journal layout | The column layout of the French *fichier des écritures comptables* (art. A47 A-1 LPF: 18 columns JournalCode … Idevise), per https://cabinet-osmose.fr/format-et-structure-du-fec-guide-technique-complet/ (search result, see `reports/02-open-source/expenses.md`). Not the company's legal FEC | — | `lib/journal.ts` |
| URSSAF flat rates 2026 | Meal 21,40 €, night and breakfast 76,60 € (Paris, 92, 93, 94) and 56,80 € (elsewhere) for employees working away, first three months — from search results quoting https://www.urssaf.fr/accueil/employeur/beneficier-exonerations/frais-professionnels.html, read 2026-09-29, **not re-read on urssaf.fr** | public data | `migrations/0002_after_critique.sql` (editable in Settings) |
| Import formats | Expensify's CSV exports are template-based ("Basic export": date, amount, merchant, category, receipt URL — https://help.expensify.com/articles/expensify-classic/spending-insights/Export-Expenses-And-Reports, search 2026-09-29); N2F's exports are configurable columns (https://n2f.freshdesk.com/en/support/solutions/articles/44001915963-how-to-customize-a-data-export-in-n2f-, search 2026-09-29). Hence a column-mapping importer. The two test files in `test/fixtures/` are **modelled on these descriptions, not files exported from those services** (the studio has no account) | — | `lib/csv-read.ts`, `lib/imports.ts`, `test/imports.test.ts` |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `tesseract.js` (Apache-2.0, with its
dependencies `tesseract.js-core` (Apache-2.0), `bmp-js`, `idb-keyval`, `is-url`,
`node-fetch` (with `whatwg-url`, `tr46`, `webidl-conversions`),
`regenerator-runtime`, `wasm-feature-detect`, `zlibjs` (MIT, Apache-2.0 or
BSD-2-Clause) and `opencollective-postinstall` (MIT, prints a message at
install)), `@tesseract.js-data/fra` (MIT), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`), `@argentic/chest-ui` (MIT, the
studio's UI kit, packed in `vendor/`: themes, runtime and components; its
catalogue fonts are served by the Chest, not shipped here). Development only: `@electric-sql/pglite`,
`@electric-sql/pglite-socket` (Apache-2.0), `typescript` (Apache-2.0),
`@types/*` (MIT). Icons are drawn for this tool (`components/icons.tsx`).
