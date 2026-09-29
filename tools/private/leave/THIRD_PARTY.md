# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Nunito (font) | [googlefonts/nunito](https://github.com/googlefonts/nunito), via `@fontsource-variable/nunito` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-nunito.txt` |
| Nunito Sans (font) | [googlefonts/NunitoSans](https://github.com/googlefonts/NunitoSans), via `@fontsource-variable/nunito-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-nunito-sans.txt` |
| Easter date (algorithm) | the anonymous Gregorian algorithm (Meeus/Jones/Butcher), public knowledge | — | `lib/calendar.ts`, written for this tool |
| Half-day requests, per-contract non-working days (ideas) | Jorani, [bbalet/jorani](https://github.com/bbalet/jorani) | MIT | ideas only; **no code copied** |
| Wall-chart team calendar (idea) | TimeOff.Management, [timeoff-management/timeoff-management-application](https://github.com/timeoff-management/timeoff-management-application) | MIT | idea only; **no code copied** |
| Balance ledger, monthly earned leave (ideas) | Frappe HR, [frappe/hrms](https://github.com/frappe/hrms) | GPL-3.0 | ideas only (licence forbids copying here) |

| Import columns (formats only, no code) | Lucca Absences' documented absence import/export columns — `legalEntity`, `employeeNumber`, `lastName`, `firstName`, `accountId`, `startDate` (DD/MM/YYYY), `flagStartDate` (AM/PM), `endDate`, `flagEndDate`, `isApproved` — as quoted by search results for [developers.lucca.fr, "Import leaves"](https://developers.lucca.fr/api-reference/legacy/timmi-absences/imports/import-leaves) and [support.lucca.fr, "Les formats d'export d'absences disponibles"](https://support.lucca.fr/hc/fr/articles/360028297632-Les-formats-d-export-d-absences-disponibles-ancien-module-d-export-paie-), read on 2026-09-29 (both pages themselves are blocked by this environment's network; **not verified first-hand**). Lucca's balance counters ("Acquis", "Pris", "Solde", "Congés payés N-1") per search results for [support.luccasoftware.com, "Configurer un export paie"](https://support.luccasoftware.com/s/article/configurer-un-export-paie-dans-lucca-absences?language=fr), same date; their exact CSV headers are **not public**: the importer recognises the usual pay-slip labels (CP N-1, CP N, acquis, en cours…) and asks HR about any other column | — | `lib/import.ts`, `test/fixtures/lucca-*.csv` (files written for the tests in that shape) |

`lib/csv.ts` comes from the studio's Tasks tool (same licence and authors).
Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` and `@argentic/chest-ui` (MIT, the
studio's working copies in `vendor/`: the SDK, and the UI kit's themes
and components). Icons and the mark are drawn for this
tool (`components/icons.tsx`, `components/mark.tsx`).
