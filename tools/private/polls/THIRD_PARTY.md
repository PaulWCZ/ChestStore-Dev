# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Fredoka (font) | [hafontia/Fredoka](https://github.com/hafontia/Fredoka), via `@fontsource-variable/fredoka` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-fredoka.txt` |
| Plus Jakarta Sans (font) | [tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans), via `@fontsource-variable/plus-jakarta-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-plus-jakarta-sans.txt` |
| iCalendar writer | The studio's Booking tool (`lib/ics.ts`, MIT, © 2026 Argentic), adapted: whole days added, the `;` escape fixed | MIT | `lib/ics.ts` |
| Ideas only | Rallly (AGPL-3.0), Framadate (CeCILL-B) / Pollaris (AGPL-3.0), Nextcloud Polls (AGPL-3.0), Formbricks (AGPL-3.0), LimeSurvey (GPL-2.0-or-later) — see `reports/02-open-source/polls.md` in the studio | — | Feature ideas: the yes / if need be / no grid and the final date (Rallly, Framadate), hidden results and strict anonymity (Nextcloud Polls, LimeSurvey), the five-answer threshold (Officevibe). Rallly's vote IDOR advisory is why votes bind to the Chest's member only. **No code copied** |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). Icons are drawn for this tool
(`components/icons.tsx`). The time helpers (`lib/time.ts`, `lib/zone.ts`),
CSV writer (`lib/csv.ts`) and i18n helpers come from the studio's own tools
(MIT, same authors).
