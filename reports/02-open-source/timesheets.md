# Timesheets — open-source research
_Read on 2026-09-28. Replaces: Harvest, Toggl Track, Clockify._

## The job
People record the time they spend on each client and project — either with a start/stop timer or by
filling a weekly grid ("Mon: 3 h on ACME website") — so the company can bill clients, check project
budgets and, in France, prove working hours. Daily, 80 % of use is: start/stop a timer or fill this week's
grid, re-use yesterday's project, and — weekly or monthly — a manager looks at "hours per project / per
person" and exports it for invoicing or payroll.

## Projects

### Kimai
| Field | Content |
|---|---|
| Project | Kimai, https://github.com/kimai/kimai — ~5.0k stars (as read); 2.67.0 released 2026-09-13, 2.66.0 on 2026-09-05 (https://github.com/kimai/kimai/releases.atom). Very active, 302 open issues. |
| Licence | `AGPL-3.0-or-later` — https://raw.githubusercontent.com/kimai/kimai/main/LICENSE, `composer.json` "license": "AGPL-3.0-or-later" |
| Reuse | **Ideas only** |
| Stack | PHP, Symfony, Tabler/Bootstrap, MySQL/MariaDB. |
| What it does best | The most complete model: customer → project → activity; timer and **punch-in/punch-out mode**; multiple running timers; tags; **money and time budgets** per customer/project with warnings; hourly rates at user/activity/project level; **lock dates** (2.66.0: projects can lock timesheet editing before a date) — the "close the month" feature; exports (CSV, XLSX, PDF), invoices, teams with permissions, 30+ languages. |
| What to avoid | Admin-heavy: roles, teams, plugins, many settings screens. Integrity bugs we must design against: "Concurrent timesheet creates bypass the no-overlap rule" (#6168), batch update skipping validation (#6169), "reporting endpoints leak cross-team financial data" (#6155), per-row query costs (#6173, #6175) — https://github.com/kimai/kimai/issues. Many useful features are paid plugins. |

### solidtime
| Field | Content |
|---|---|
| Project | solidtime, https://github.com/solidtime-io/solidtime — ~8.9k stars; v0.21.0 released 2026-09-22, v0.20.1 (security fixes) 2026-09-16 (https://github.com/solidtime-io/solidtime/releases.atom). Very active, 10 open issues. |
| Licence | `AGPL-3.0` — https://raw.githubusercontent.com/solidtime-io/solidtime/main/LICENSE.md |
| Reuse | **Ideas only** — its importers are the best documentation we have of the SaaS export formats (facts about column names are not copyrightable; we write our own parsers). |
| Stack | PHP, Laravel, Vue/Inertia, PostgreSQL. Postgres schema ideas transpose directly. |
| What it does best | Modern, calm UI: a timer bar at the top ("What are you working on?" + project + billable toggle + start), a list of entries grouped by day, a calendar view; clients, projects, tasks; billable rates per organisation/project/member; reports grouped by project/member/date/week with PDF export; **importers for Toggl (CSV and data-export ZIP), Clockify (CSV), Harvest (CSV) and generic CSV** (https://github.com/solidtime-io/solidtime/tree/main/app/Service/Import/Importers). |
| What to avoid | Open issues show where it is fragile: an update with only `end` can create negative durations (#1189), "Double import duplicates time entries" (#894), "Last 7 days" vs "This week" differ across day boundaries/timezones (#208) — https://github.com/solidtime-io/solidtime/issues. Invoicing is in a paid tier. |

### Traggo
| Field | Content |
|---|---|
| Project | Traggo, https://github.com/traggo/server — ~1.6k stars; v0.8.3, 2026-03-01 (https://github.com/traggo/server/releases.atom). Low activity. |
| Licence | `GPL-3.0` — https://raw.githubusercontent.com/traggo/server/master/LICENSE |
| Reuse | **Ideas only** |
| Stack | Go, GraphQL, React, SQLite/MySQL/Postgres. |
| What it does best | Tags only (`project:acme`, `type:meeting`) instead of a rigid hierarchy; customisable dashboards with charts; calendar and list views. |
| What to avoid | Tag syntax is powerful but not understood by non-technical staff; no approval or billing. |

### TimeTagger
| Field | Content |
|---|---|
| Project | TimeTagger, https://github.com/almarklein/timetagger — ~1.8k stars; v26.1.3, 2026-02-02 (https://github.com/almarklein/timetagger/releases.atom). |
| Licence | `GPL-3.0` — https://raw.githubusercontent.com/almarklein/timetagger/main/LICENSE |
| Reuse | **Ideas only** |
| Stack | Python (asgineer/uvicorn), SQLite (itemdb), client compiled from Python with PScript. |
| What it does best | Interactive **timeline** you can zoom (day → year) and drag to create/resize a block; `#tags` in descriptions; daily/weekly targets ("32 of 35 h this week"); PDF/CSV reports. |
| What to avoid | Individual-oriented (freelancer), no team management or projects. |

### ActivityWatch (ideas only, different model)
| Field | Content |
|---|---|
| Project | ActivityWatch, https://github.com/ActivityWatch/activitywatch — ~19k stars; latest stable v0.13.2, pre-release v0.14.0b9 on 2026-09-24 (https://github.com/ActivityWatch/activitywatch/releases.atom). |
| Licence | `MPL-2.0` — https://raw.githubusercontent.com/ActivityWatch/activitywatch/master/LICENSE.txt |
| Reuse | **Whole files under MPL-2.0** (MPL) — but nothing fits: it is a desktop agent. |
| Stack | Python + Rust desktop watchers, local REST API, Vue web UI. |
| What it does best | Automatic tracking of apps/windows/AFK, all data local; "categorise by rules" of window titles. |
| What to avoid | Automatic activity monitoring of employees is surveillance: in France this requires information, proportionality and works-council consultation, and CNIL has sanctioned intrusive monitoring. We do **not** build this. |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Timer: one line "What are you working on?", project picker, Start/Stop; one running timer per member | MVP | Toggl, solidtime | Timer state stored server-side (start time), UI ticks locally; no WebSocket needed. Other tabs pick up the running timer by **polling**. |
| Week grid: rows = project (+ task), columns = Mon–Sun, type hours (`1:30`, `1.5`, `1,5`) | MVP | Harvest, Clockify timesheet view | The fastest way for people who fill in on Friday. "Copy last week's rows". |
| Day list of entries: edit start/end or duration, description, project, billable | MVP | solidtime, Toggl | Validate end > start server-side (solidtime #1189); no overlap for timer entries, checked in a transaction (Kimai #6168). |
| Clients and projects (with colour, optional hourly rate and budget in hours) | MVP | Kimai, Harvest | Managed by members with a "manager" role from the platform. Tasks per project: optional. |
| Billable flag per project (default) and per entry | MVP | Toggl, Harvest | |
| Reports: hours by project / by person / by client for a period; budget used ("64 / 80 h") | MVP | Harvest, Kimai budgets | Visibility: a member sees own time; managers see their teams; admins see all (Kimai #6155 leak). |
| Export CSV (date, member, client, project, task, description, start, end, hours decimal, billable) | MVP | all | For invoicing and payroll. |
| Import from Toggl, Clockify, Harvest CSV exports | MVP | solidtime importers | Formats below. Members matched by email → `mbr_` id via the SDK; unknown people reported, not created. Idempotent: hash each row to avoid double import (solidtime #894). |
| Lock a period ("March is closed") so entries cannot change after invoicing/payroll | MVP | Kimai lock dates (2.66.0) | Admin action; a small but decisive trust feature. |
| Weekly submission and manager approval of timesheets | later | Harvest "Approvals", Clockify | |
| Reminders "you have not filled Thursday" | later | Harvest, Clockify | Needs **scheduled jobs** (SDK proposal) and ideally email. |
| Timeline / calendar view with drag to create | later | TimeTagger, solidtime | |
| Amounts (hours × rate) and export to an invoicing tool | later | Kimai, Harvest | Invoicing itself belongs to another store tool. |
| Punch-in/out for working-hours recording (arrival/departure, breaks) | later | Kimai punch mode | Different purpose (labour-law hours) — maybe a separate tool. |
| Toggl data-export ZIP (JSON) import | later | solidtime `TogglDataImporter` | ZIP contains `clients.json`, `projects.json`, … (read in solidtime code). |
| Tags | later | Traggo, Kimai | Projects cover 80 %. |
| Automatic activity tracking, screenshots, idle detection | never | ActivityWatch, Hubstaff | Surveillance; see legal notes. |
| Desktop/mobile native apps, browser extension | never | Toggl, Clockify | Responsive web (PWA later). |

### Export formats to import (column names read in solidtime's importers, not in the SaaS docs, which are blocked here)
- **Toggl Track — detailed report CSV**: `User, Email, Client, Project, Task, Description, Billable (Yes/No), Start date, Start time, End date, End time, Tags` (+ `Duration`, and `Client/Project External Reference` per search result on https://support.toggl.com/en-us/article/toggl-track-csv-import-guide-yx49tl/). Dates `YYYY-MM-DD`, times `HH:MM:SS` — https://raw.githubusercontent.com/solidtime-io/solidtime/main/app/Service/Import/Importers/TogglTimeEntriesImporter.php
- **Clockify — detailed report CSV**: `Project, Client, Description, Task` **or** `Activity` (depends on export version), `User, Email, Tags, Billable (Yes/No), Start Date, Start Time, End Date, End Time`, optional `Type` = `Break` for breaks — https://raw.githubusercontent.com/solidtime-io/solidtime/main/app/Service/Import/Importers/ClockifyTimeEntriesImporter.php. Date/time formats follow the exporting user's settings — our parser must detect them.
- **Harvest — detailed time report CSV**: `Date (YYYY-MM-DD), Client, Project, Task, Notes, Hours (decimal, comma or dot), Billable? (Yes/No), First Name, Last Name` — no start/end times, no email (people matched by name, then confirmed by the importer) — https://raw.githubusercontent.com/solidtime-io/solidtime/main/app/Service/Import/Importers/HarvestTimeEntriesImporter.php

## Reusable pieces
- `csv-parse` 7.0.3 — `MIT` (npm, 2026-09-25) or `papaparse` 5.7.0 — `MIT` (2026-08-24): streaming CSV import with header detection.
- `temporal-polyfill` 1.0.5 — `MIT` (2026-09-11): `Temporal.ZonedDateTime` / `PlainDate` for correct week boundaries across DST (solidtime #208 is exactly this bug); or `date-fns` 4.4.0 — `MIT`.
- `recharts` 3.10.1 — `MIT` (2026-07-25) or `chart.js` 4.5.1 — `MIT`: hours-per-project bars. A plain HTML bar list may be enough.
- `@fullcalendar/core` 7.1.0 — `MIT` (2026-09-05): week/day calendar view (later).
- Duration parsing (`1:30`, `1.5`, `1,5`, `90m`, `1h30`): small enough to write and test ourselves; none needed.

## Legal and security notes
- **Working-time records (France)**: the employer must be able to justify the hours actually worked in case of dispute (Code du travail art. L3171-4); records must be kept at least **1 year** (art. D3171-16), and 3 years is advisable because wage claims prescribe after 3 years (art. L3245-1) — per search result (https://www.preventionbtp.fr/droit-de-la-prevention/article-l3171-4-du-code-du-travail-duree-du-travail_PaK4EqbYx5NRedqxwRjjiM, https://code.travail.gouv.fr/code-du-travail/l3171-4; code.travail.gouv.fr and Légifrance are blocked here). An automatic recording system must be "reliable and tamper-proof": hence the lock-period feature and an append-only history of edits (who, when, before/after). The EU Court of Justice ruling of 14 May 2019 (C-55/18, CCOO) requiring an objective system to measure daily working time is relevant — **not re-read today**.
- A project timesheet is not automatically a legal hours register: the tool must say so plainly ("This records time per project; it is not your official working-hours register unless your company decides so").
- **No employee monitoring**: no screenshots, activity levels, keystrokes, idle detection or geolocation. Such monitoring requires prior information of employees and consultation of the CSE, and must be proportionate (GDPR art. 5/6/13, Code du travail L1222-4, L2312-38 — commonly cited, not re-read today).
- **GDPR**: time entries are personal data (they reveal how a person works). Access: the person, their managers, admins. Retention: follow the CNIL HR retention referential of April 2026 (https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf — per search result). Imported CSVs contain third-party emails: process in memory, keep only `mbr_` ids.
- **Security**: identity from `member(request)` only; server-side checks for every write (own entries only unless manager); overlap and end > start checked in one transaction; report queries scoped by team (Kimai #6155); CSV export protected against formula injection.

## Sources
- https://github.com/kimai/kimai · https://github.com/kimai/kimai/releases.atom · https://raw.githubusercontent.com/kimai/kimai/main/LICENSE · https://raw.githubusercontent.com/kimai/kimai/main/composer.json · https://github.com/kimai/kimai/issues
- https://github.com/solidtime-io/solidtime · https://github.com/solidtime-io/solidtime/releases.atom · https://raw.githubusercontent.com/solidtime-io/solidtime/main/LICENSE.md · https://github.com/solidtime-io/solidtime/issues · https://github.com/solidtime-io/solidtime/tree/main/app/Service/Import/Importers · raw importer files linked above · https://raw.githubusercontent.com/solidtime-io/solidtime/main/app/Service/Import/Importers/TogglDataImporter.php
- https://github.com/traggo/server · https://github.com/traggo/server/releases.atom · https://raw.githubusercontent.com/traggo/server/master/LICENSE
- https://github.com/almarklein/timetagger · https://github.com/almarklein/timetagger/releases.atom · https://raw.githubusercontent.com/almarklein/timetagger/main/LICENSE
- https://github.com/ActivityWatch/activitywatch · https://github.com/ActivityWatch/activitywatch/releases.atom · https://raw.githubusercontent.com/ActivityWatch/activitywatch/master/LICENSE.txt
- https://support.toggl.com/en-us/article/toggl-track-csv-import-guide-yx49tl/ · https://support.toggl.com/detailed-report (search results)
- npm registry: https://registry.npmjs.org/csv-parse · /papaparse · /temporal-polyfill · /date-fns · /recharts · /chart.js · /@fullcalendar/core
- https://www.preventionbtp.fr/droit-de-la-prevention/article-l3171-4-du-code-du-travail-duree-du-travail_PaK4EqbYx5NRedqxwRjjiM · https://code.travail.gouv.fr/code-du-travail/l3171-4 (search results)
- https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf (search result)

Note: Toggl/Clockify/Harvest help centres and French legal sites are blocked by this environment's egress policy; export columns come from solidtime's importer code (current `main`), legal points from search-result summaries.
