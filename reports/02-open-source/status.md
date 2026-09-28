# Status — open-source research
_Read on 2026-09-28. Replaces: Atlassian Statuspage, Instatus, Better Stack status pages._

## The job
When something breaks, the team tells customers **once, in public**: "Invoicing is down — we are on
it", then posts updates until "Resolved". Visitors open one page and see at a glance whether each
service is up, plus the last incidents and planned maintenance. The daily 20 %: a list of components
with a coloured status, "declare an incident" with a short update timeline, and "schedule
maintenance".

## Projects

### Cachet
| Field | Content |
|---|---|
| Project | Cachet — https://github.com/cachethq/cachet (~15,250 stars, GitHub search 2026-09-28), default branch `3.x`; the 3.x code lives in https://github.com/cachethq/core (~230 stars). Last tagged release of the classic app: `v2.4.1` on 2023-11-07 (releases feed). 3.x rebuild announced 2023-08-10 (https://github.com/cachethq/cachet/discussions/4342). |
| Licence | **Not open source any more on 3.x**: custom "Cachet license" (Alt Three Services Limited), `composer.json` says `"license": "proprietary"`; forbids distributing it "as a standalone product" — https://github.com/cachethq/cachet/blob/3.x/LICENSE.md and https://github.com/cachethq/core/blob/main/LICENSE.md (read raw). The old `2.4` branch is `MIT` — https://github.com/cachethq/cachet/blob/2.4/LICENSE (read raw). |
| Reuse | 2.4 branch: **Code** (MIT) — but PHP, so ideas in practice. 3.x / core: **Ideas only** (no licence we accept). |
| Stack | PHP / Laravel (3.x: Laravel + Filament), MySQL/PostgreSQL/SQLite. The data model transposes directly. |
| What it does best | The canonical model: **components** in **groups**, component status enum `operational, performance_issues, partial_outage, major_outage, under_maintenance, unknown`; incident status `investigating → identified → watching → fixed` (read in `cachethq/core` `src/Enums/ComponentStatusEnum.php`, `IncidentStatusEnum.php`); incidents with timeline updates; scheduled maintenance; subscribers; metrics graphs. |
| What to avoid | Licence drift; long rebuild with the classic app nearly unmaintained (announcement above). Metrics graphs nobody updates by hand. |

### Uptime Kuma (status pages)
| Field | Content |
|---|---|
| Project | Uptime Kuma — https://github.com/louislam/uptime-kuma — ~91,900 stars (GitHub search, 2026-09-28); `2.5.5` on 2026-09-16 (releases feed); very active |
| Licence | `MIT` — https://github.com/louislam/uptime-kuma/blob/master/LICENSE (read raw) |
| Reuse | **Code** (MIT, with attribution) |
| Stack | Node.js + Vue 3 + socket.io (WebSocket), SQLite/MariaDB. Node transposes; the real-time socket layer must become polling on Chest. |
| What it does best | The friendliest status page UI: groups of monitors, **heartbeat bar** (a row of small coloured ticks for recent checks), uptime percentage, a pinned incident banner in Markdown, maintenance windows, status badges; **push monitors** (an external job calls a URL to say "I'm alive"), which work without outbound network. |
| What to avoid | Incidents are an afterthought: only one incident shown, no update timeline or history — "is uptime kuma able to show muti incident event" (#4953, closed not planned), "Better Incident System" (#5967), "Manage incidents from the admin area" (#7873, open) — https://github.com/louislam/uptime-kuma/issues?q=is%3Aissue+status+page+incident+history. |

### Gatus
| Field | Content |
|---|---|
| Project | Gatus — https://github.com/TwiN/gatus — ~12,200 stars (GitHub search, 2026-09-28); `v5.37.0` on 2026-09-24 (releases feed) |
| Licence | `Apache-2.0` — https://github.com/TwiN/gatus/blob/master/LICENSE (read raw) |
| Reuse | **Code** (Apache-2.0, keep NOTICE/attribution) — Go, so ideas in practice |
| Stack | Go, config in YAML, SQLite/PostgreSQL. |
| What it does best | Condition-based checks (`[STATUS] == 200`, `[RESPONSE_TIME] < 300`); **external endpoints** — other systems push results to Gatus — and **announcements** on the page; maintenance windows per endpoint (README configuration table). |
| What to avoid | Developer-oriented: everything in YAML, no admin UI for incidents; not for a non-technical employee. |

### OpenStatus
| Field | Content |
|---|---|
| Project | OpenStatus — https://github.com/openstatusHQ/openstatus — ~9,150 stars (GitHub search, 2026-09-28); no GitHub releases/tags published (tags list empty, releases feed empty) — version not verified |
| Licence | `AGPL-3.0` — https://github.com/openstatusHQ/openstatus/blob/main/LICENSE (read raw) |
| Reuse | **Ideas only** |
| Stack | TypeScript, Next.js, Turso/libSQL, Tinybird — Next.js transposes; the data stack does not. |
| What it does best | Modern, clean status pages; maintenance windows; password-protected pages; subscriber notifications via email, RSS and webhooks; **"Status page importer"** from other providers (https://www.openstatus.dev/changelog/status-page-importer — per search result, not read) (README). |
| What to avoid | Monitoring-as-code, 28 regions, MCP: aimed at SRE teams, far beyond an SME's need. |

### Upptime and Statusfy (briefly)
| Field | Content |
|---|---|
| Project | Upptime — https://github.com/upptime/upptime — ~17,200 stars, template repo, last release `v2.0.0` 2020-10-13 (releases feed; code evolves in sub-packages). Statusfy — https://github.com/juliomrqz/statusfy — ~2,620 stars, **archived** (GitHub search). |
| Licence | Upptime `MIT` (https://github.com/upptime/upptime/blob/master/LICENSE, read raw); Statusfy `Apache-2.0` (https://github.com/juliomrqz/statusfy/blob/master/LICENSE, read raw) |
| Reuse | **Code** for both (permissive), ideas in practice |
| Stack | Upptime: GitHub Actions + GitHub Issues + static Svelte site. Statusfy: Nuxt static site, incidents as Markdown files. |
| What it does best | Upptime: **incidents are issues** with comments as updates — shows the minimal model is enough. Statusfy: incidents written as short Markdown posts with severity; clean incident history page. |
| What to avoid | Both need Git/CI knowledge; Statusfy is dead. |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Public status page: overall banner ("All systems operational") + components with status colour | MVP | Statuspage, Cachet, Uptime Kuma | Anonymous, cacheable, works without JS |
| Components and groups (name, description, order) | MVP | Cachet, Statuspage | |
| Component status: Operational / Degraded / Partial outage / Major outage / Maintenance | MVP | Cachet enum, Statuspage | Plain words + colour + icon (not colour only) |
| Declare an incident: title, affected components, impact, first message | MVP | Statuspage, Cachet | One screen, one button |
| Incident updates timeline: Investigating → Identified → Monitoring → Resolved | MVP | Cachet (`investigating/identified/watching/fixed`), Statuspage | Resolving an incident offers to set components back to Operational |
| Incident history (last 90 days) and incident page with permalink | MVP | Statuspage, Statusfy | |
| Scheduled maintenance (start, end, components) | MVP | Statuspage, Cachet, Gatus | Shown as "upcoming"; **automatic start/end needs scheduled tasks** — until then computed on read from the time window |
| Markdown in updates | MVP | Uptime Kuma, Statusfy | Sanitised |
| Private part: who posted each update (member id) | MVP | — | Identity only from `member(request)` |
| Bilingual public page (EN/FR per visitor) | MVP | — | Posts are written once in the company's language |
| RSS/Atom feed of incidents | MVP | OpenStatus, Statuspage | Lets customers subscribe with no email |
| Public JSON (`/api/status.json`) | later | Statuspage public API | For customers' own dashboards |
| Uptime bars per component (last 90 days) | later | Uptime Kuma heartbeat bar, Statuspage | Can be derived from incident history without monitoring |
| **Push / heartbeat endpoint** (a system calls a secret URL; silence → component degraded) | later — **needs scheduled tasks** to detect silence | Uptime Kuma push monitors, Gatus external endpoints | Avoids outbound network |
| Automatic HTTP monitoring of websites/APIs | later — **needs outbound network + scheduled tasks** | Uptime Kuma, Gatus, OpenStatus | SDK proposal |
| Email/SMS subscribers | later — **needs outbound email** | Statuspage, Cachet, OpenStatus | RSS first |
| Post-mortem write-up on resolved incident | later | Statuspage, Uptime Kuma #6303 request | |
| Private (team-only) status page for internal tools | later | Statuspage audience-specific pages | The Chest private part already serves this |
| Custom domain, custom CSS | never | Statuspage, OpenStatus | Platform concern |
| Monitoring as code, multi-region probes, on-call paging | never | OpenStatus, Gatus, Better Stack | Different product |
| **Import from Atlassian Statuspage** (components + incidents via its API JSON) | later | Statuspage | UI export covers only subscribers (CSV/JSON); incidents/components need the API — https://support.atlassian.com/statuspage/docs/export-subscribers/, https://community.atlassian.com/forums/Statuspage-questions/Export-Data-Report-on-historical-availability/qaq-p/1785703 (per search result). Needs outbound network or a pasted JSON file. |
| Import from Instatus / Better Stack | later | — | Export format not verified |

## Reusable pieces
- **Uptime Kuma** (MIT) — heartbeat-bar component and status-page layout could be copied with attribution (Vue → React port) — https://github.com/louislam/uptime-kuma.
- **markdown-it** (MIT) + **sanitize-html** (MIT) for incident text — https://github.com/markdown-it/markdown-it, https://github.com/apostrophecms/sanitize-html.
- **Luxon** (MIT) or **Day.js** (MIT) for "started 2 h ago" and maintenance windows in the visitor's time zone — https://github.com/moment/luxon, https://github.com/iamkun/dayjs.
- A feed generator is ~40 lines; no library needed (Atom is simple XML).

## Legal and security notes
- **Little personal data** on the public page: only component names and texts. Do not show who posted an update publicly (member names stay private).
- **No secrets in incident text** (hostnames, IPs, stack traces): add a hint in the editor; the page is indexed by search engines unless `noindex` is chosen.
- **Contractual weight.** Uptime and incident history may be used as evidence for SLA credits; history must be append-only (edits recorded, deletions leave a trace).
- **Future subscribers** (email) are personal data: consent, unsubscribe link, retention — GDPR art. 6/7; CNIL retention guidance (https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees — per search result).
- **Push endpoints** (later) are bearer URLs: random tokens, per-component, rate-limited.
- **Accessibility.** Status must not be conveyed by colour only (WCAG 1.4.1); European Accessibility Act since 2025-06-28 (https://www.degaullefleurance.com/en/actualites/digital-accessibility-new-obligations-for-the-private-sector/ — per search result).

## Sources
- https://github.com/cachethq/cachet — https://raw.githubusercontent.com/cachethq/cachet/3.x/LICENSE.md — https://raw.githubusercontent.com/cachethq/cachet/2.4/LICENSE — https://raw.githubusercontent.com/cachethq/cachet/3.x/README.md — https://github.com/cachethq/cachet/releases.atom
- https://github.com/cachethq/cachet/discussions/4342
- https://github.com/cachethq/core — https://raw.githubusercontent.com/cachethq/core/main/LICENSE.md — https://raw.githubusercontent.com/cachethq/core/main/composer.json — `src/Enums/ComponentStatusEnum.php`, `src/Enums/IncidentStatusEnum.php`
- https://github.com/louislam/uptime-kuma — https://raw.githubusercontent.com/louislam/uptime-kuma/master/LICENSE — https://github.com/louislam/uptime-kuma/releases.atom
- https://github.com/louislam/uptime-kuma/issues?q=is%3Aissue+status+page+incident+history
- https://github.com/TwiN/gatus — https://raw.githubusercontent.com/TwiN/gatus/master/LICENSE — README — https://github.com/TwiN/gatus/releases.atom
- https://github.com/openstatusHQ/openstatus — https://raw.githubusercontent.com/openstatusHQ/openstatus/main/LICENSE — README — https://github.com/openstatusHQ/openstatus/releases.atom
- https://www.openstatus.dev/changelog/status-page-importer
- https://github.com/upptime/upptime — https://raw.githubusercontent.com/upptime/upptime/master/LICENSE — https://github.com/upptime/upptime/releases.atom
- https://github.com/juliomrqz/statusfy — https://raw.githubusercontent.com/juliomrqz/statusfy/master/LICENSE
- https://support.atlassian.com/statuspage/docs/export-subscribers/
- https://support.atlassian.com/statuspage/docs/show-service-status-with-components/
- https://community.atlassian.com/forums/Statuspage-questions/Export-Data-Report-on-historical-availability/qaq-p/1785703
- https://github.com/markdown-it/markdown-it — https://github.com/apostrophecms/sanitize-html — https://github.com/moment/luxon — https://github.com/iamkun/dayjs
- https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- https://www.degaullefleurance.com/en/actualites/digital-accessibility-new-obligations-for-the-private-sector/
