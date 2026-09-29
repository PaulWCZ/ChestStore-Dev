# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Red Hat Text (font) | [RedHatOfficial/RedHatFont](https://github.com/RedHatOfficial/RedHatFont), via `@fontsource-variable/red-hat-text` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-red-hat-text.txt` |
| Red Hat Mono (font) | [RedHatOfficial/RedHatFont](https://github.com/RedHatOfficial/RedHatFont), via `@fontsource-variable/red-hat-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-red-hat-mono.txt` |
| Colour-blind safe palette (idea) | Okabe & Ito, *Color Universal Design* (2002/2008) | a published palette, no code | `lib/states.ts` (tones darkened for contrast) |

Code from the studio's own tools (same licence, MIT, © 2026 Argentic):
`lib/ics.ts`, `lib/zone.ts`, `lib/public-origin.ts`, `lib/i18n/format.ts`
(adapted), `lib/people.ts`, `lib/notify.ts` from Booking and the template.

Ideas only, no code copied (see `reports/02-open-source/status.md`):
the component and incident model and statuses of Cachet (MIT on its 2.4
branch), the heartbeat bar of Uptime Kuma (MIT), the incident history of
Statusfy (Apache-2.0), Atlassian Statuspage and Instatus (proprietary,
features only).

Formats and rules followed, no code copied (read on 2026-09-29; the
Atlassian pages could not be opened from the studio — egress denied — so
they were read through web search results, and the shapes checked against
code that reads them):

- **Statuspage public status API** (paths `/api/v2/summary.json`,
  `status.json`, `components.json`, `incidents.json`,
  `incidents/unresolved.json`, `scheduled-maintenances.json`,
  `…/upcoming.json`, `…/active.json`; fields as documented on each page's
  `/api`, e.g. https://status.atlassian.com/api, https://metastatuspage.com/api,
  https://status.temporal.io/api — search results). Checked against
  Atlassian's own widget `@statuspage/status-widget` 1.0.5 (Apache-2.0,
  npm; reads `status.indicator`, `status.description` of
  `/api/v2/summary.json`) and `@universityofwarwick/statuspage-widget`
  0.2.0 (ISC; reads `incidents[].impact`, `name`, `shortlink`,
  `components[].id`, `scheduled_maintenances[].status`, `page.url`).
  `test/fixtures/statuspage-*.json` are written by us in that shape.
- **Uptime rule** — "Display historical uptime of components",
  https://support.atlassian.com/statuspage/docs/display-historical-uptime-of-components/
  (major outage counts fully, partial outage 30 %, degraded and
  maintenance not counted).
- **Indicator and impact rule** — "Top-level status and incident impact
  calculations",
  https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations/.
- **Heartbeats** — the idea of Uptime Kuma's push monitors (MIT) and
  Better Stack's heartbeats; no code.

Dependencies (`next`, `react`, `postgres`, `@argentic/chest-sdk`,
`@argentic/chest-ui` — the studio's UI kit, vendored: the look and the
shared components) are installed from npm or `vendor/` under their own licences.
