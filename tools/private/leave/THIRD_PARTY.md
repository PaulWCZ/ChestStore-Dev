# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Nunito (font) | [googlefonts/nunito](https://github.com/googlefonts/nunito), via `@fontsource-variable/nunito` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-nunito.txt` |
| Nunito Sans (font) | [googlefonts/NunitoSans](https://github.com/googlefonts/NunitoSans), via `@fontsource-variable/nunito-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-nunito-sans.txt` |
| Easter date (algorithm) | the anonymous Gregorian algorithm (Meeus/Jones/Butcher), public knowledge | — | `lib/calendar.ts`, written for this tool |
| Half-day requests, per-contract non-working days (ideas) | Jorani, [bbalet/jorani](https://github.com/bbalet/jorani) | MIT | ideas only; **no code copied** |
| Wall-chart team calendar (idea) | TimeOff.Management, [timeoff-management/timeoff-management-application](https://github.com/timeoff-management/timeoff-management-application) | MIT | idea only; **no code copied** |
| Balance ledger, monthly earned leave (ideas) | Frappe HR, [frappe/hrms](https://github.com/frappe/hrms) | GPL-3.0 | ideas only (licence forbids copying here) |

`lib/csv.ts` comes from the studio's Tasks tool (same licence and authors).
Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). Icons and the mark are drawn for this
tool (`components/icons.tsx`, `components/mark.tsx`).
