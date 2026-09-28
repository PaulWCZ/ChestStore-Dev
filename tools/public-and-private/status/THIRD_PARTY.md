# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Red Hat Text (font) | [RedHatOfficial/RedHatFont](https://github.com/RedHatOfficial/RedHatFont), via `@fontsource-variable/red-hat-text` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-red-hat-text.txt` |
| Red Hat Mono (font) | [RedHatOfficial/RedHatFont](https://github.com/RedHatOfficial/RedHatFont), via `@fontsource-variable/red-hat-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-red-hat-mono.txt` |
| Colour-blind safe palette (idea) | Okabe & Ito, *Color Universal Design* (2002/2008) | a published palette, no code | `app/tokens.css` (tones darkened for contrast) |

Code from the studio's own tools (same licence, MIT, © 2026 Argentic):
`lib/ics.ts`, `lib/zone.ts`, `lib/public-origin.ts`, `lib/i18n/format.ts`
(adapted), `lib/people.ts`, `lib/notify.ts` from Booking and the template.

Ideas only, no code copied (see `reports/02-open-source/status.md`):
the component and incident model and statuses of Cachet (MIT on its 2.4
branch), the heartbeat bar of Uptime Kuma (MIT), the incident history of
Statusfy (Apache-2.0), Atlassian Statuspage and Instatus (proprietary,
features only).

Dependencies (`next`, `react`, `postgres`, `@argentic/chest-sdk`) are
installed from npm under their own licences.
