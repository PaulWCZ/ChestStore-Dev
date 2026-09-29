# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Fredoka (font) | [hafontia/Fredoka](https://github.com/hafontia/Fredoka), via `@fontsource-variable/fredoka` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-fredoka.txt` |
| Plus Jakarta Sans (font) | [tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans), via `@fontsource-variable/plus-jakarta-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-plus-jakarta-sans.txt` |
| iCalendar writer | The studio's Booking tool (`lib/ics.ts`, MIT, © 2026 Argentic), adapted: whole days added, the `;` escape fixed | MIT | `lib/ics.ts` |
| Ideas only | Rallly (AGPL-3.0), Framadate (CeCILL-B) / Pollaris (AGPL-3.0), Nextcloud Polls (AGPL-3.0), Formbricks (AGPL-3.0), LimeSurvey (GPL-2.0-or-later) — see `reports/02-open-source/polls.md` in the studio | — | Feature ideas: the yes / if need be / no grid and the final date (Rallly, Framadate), hidden results and strict anonymity (Nextcloud Polls, LimeSurvey), the five-answer threshold (Officevibe). Rallly's vote IDOR advisory is why votes bind to the Chest's member only. **No code copied** |
| Ideas only: the weekly pulse | Officevibe (Workleap, proprietary) — a recurring anonymous pulse, its trend over time, eNPS | — | The pulse tile, repeating surveys, the trend card. **No code, no wording copied** |
| eNPS (definition) | The Net Promoter method (F. Reichheld, "The One Number You Need to Grow", *Harvard Business Review*, December 2003), applied to employees: share answering 9–10 minus share answering 0–6 on a 0–10 scale. "Net Promoter" and "NPS" are trademarks of Bain & Company, Satmetrix and Fred Reichheld: the tool says "eNPS" only, as the HR trade does | — | `lib/model.ts` (`enps`) |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`), `@argentic/chest-ui` (MIT, the
studio's UI kit: themes, the shell, toasts, dialogs, people picker, date
and time fields — packed in `vendor/`). Icons are drawn for this tool
(`components/icons.tsx`). The time helpers (`lib/time.ts`, `lib/zone.ts`),
CSV writer (`lib/csv.ts`) and i18n helpers come from the studio's own tools
(MIT, same authors).
