# Tasks — open-source research
_Read on 2026-09-28. Replaces: Trello, Asana, Monday.com, Jira (for non-dev teams)._

## The job
A team keeps its shared work visible: boards per team or project, columns such as "To do / Doing / Done",
cards that say who does what by when. Daily, 80 % of use is: open "my tasks", add a card in one line,
drag it to the next column, assign someone, set a due date, tick a checklist, leave a comment.

## Projects

### Kanboard
| Field | Content |
|---|---|
| Project | Kanboard, https://github.com/kanboard/kanboard — ~9.9k stars; latest release Kanboard 1.2.54, 29 Aug (2026, year shown as current on the releases page). README says **maintenance mode**: "not actively developing any new major features (only small fixes)". |
| Licence | `MIT` — https://raw.githubusercontent.com/kanboard/kanboard/master/LICENSE |
| Reuse | **Code** (MIT, with attribution) |
| Stack | PHP, server-rendered, MySQL/PostgreSQL/SQLite. Data model (projects, columns, swimlanes, tasks, subtasks, comments) transposes directly to Postgres; code itself does not transpose to Node, only its logic. |
| What it does best | Radical simplicity; WIP limits per column; swimlanes; subtasks with time; automatic actions ("when a task moves to Done, close it"); CSV task import; per-project permissions; keyboard shortcuts. |
| What to avoid | Dated, dense UI; feature sprawl through plugins; settings pages that non-technical users do not understand. Development pace is low (maintenance mode). |

### WeKan
| Field | Content |
|---|---|
| Project | WeKan, https://github.com/wekan/wekan — ~21.1k stars; latest release v12.08, 27 Sep 2026 (several releases per week). |
| Licence | `MIT` — https://raw.githubusercontent.com/wekan/wekan/master/LICENSE |
| Reuse | **Code** (MIT). Most valuable: its Trello importer `models/trelloCreator.js` (maps Trello JSON: `board.lists/cards/checklists/labels/actions/members`, `card.idList/idLabels/idMembers/due/dueComplete/closed/pos/desc`, `checkItems[].state === 'complete'`) and `models/csvCreator.js`. |
| Stack | Meteor (Node) + MongoDB, real-time via DDP (WebSocket). Logic is Node, but storage and live sync do not transpose; we poll. |
| What it does best | Closest Trello clone: lists, cards, labels, checklists, due/start dates, card covers, swimlanes, archive, board templates, 234 languages; Trello + CSV import. |
| What to avoid | Huge surface (custom fields, rules, integrations, many auth backends) — UI cluttered with menus; very frequent releases with regressions; a recent release note cites an LDAP empty-password bypass fix (v12.08 release notes), sign of a wide attack surface. |

### Vikunja
| Field | Content |
|---|---|
| Project | Vikunja, https://github.com/go-vikunja/vikunja — ~5.5k stars; latest v2.6.0, 31 Aug 2026 (v2.5.0 4 Aug, v2.4.0 19 Jul 2026); active. |
| Licence | `AGPL-3.0-or-later` — https://raw.githubusercontent.com/go-vikunja/vikunja/master/LICENSE |
| Reuse | **Ideas only** |
| Stack | Go API + Vue front-end, Postgres/MySQL/SQLite. |
| What it does best | One task, four views: **List, Kanban, Table, Gantt**; "quick add magic" (labels, assignee, due date parsed from the one-line title; exact syntax not verified, docs domain blocked); saved filters; reminders; repeating tasks; migration modules for Trello, Todoist, TickTick, CSV and Planka (folders under `pkg/modules/migration/` read on raw.githubusercontent.com). |
| What to avoid | Personal-todo roots show: team features (permissions, sharing) feel bolted on; Trello import needs OAuth on the self-hosted side, which trips users (https://community.vikunja.io/t/self-hosted-importing-from-trello/3712, https://community.vikunja.io/t/import-trello-json-how/4766) — we must import a **file**, not an API. A Pro tier appeared in v2.4.0. |

### Planka
| Field | Content |
|---|---|
| Project | PLANKA, https://github.com/plankanban/planka — ~12.6k stars; latest v2.2.1, 10 Aug (2026, current year on the releases page) — security fix for a path traversal in static file routes. |
| Licence | **PLANKA Community License / "Fair Use License" v1.1** (fair-code, not OSI; no SPDX id) — https://raw.githubusercontent.com/plankanban/planka/master/LICENSE.md. Was MIT, then AGPL-3.0 (2023), fair-code since 2.0 (per search result, https://prohoster.info/en/blog/novosti-interneta/proekt-planka-perehodit-na-nesvobodnuyu-liczenziyu). AGPL forks of v1.26.3 exist (e.g. https://github.com/orneiavso/planka). |
| Reuse | **Ideas only** (fair-code; also forbids hosting for third parties for commercial gain) |
| Stack | Node (Sails.js) + React/Redux + PostgreSQL — the closest stack to ours, but licence blocks code reuse. |
| What it does best | The cleanest Trello-like UX of the group: projects → boards → lists → cards; drag and drop; labels, members, due date, stopwatch, checklists (task lists), attachments, comments, activity; Markdown descriptions; Trello JSON import (one board at a time). |
| What to avoid | Trello import drops users and attachments and "can only import one checklist per card" (https://docs.planka.cloud/docs/configuration/importing-from-trello/); calendar/timeline views, templates and SSO moved to the paid Pro edition; licence churn. |

### Plane
| Field | Content |
|---|---|
| Project | Plane, https://github.com/makeplane/plane — ~60k stars; latest v1.4.2, 23 Aug (2026). Very active. |
| Licence | `AGPL-3.0` — https://raw.githubusercontent.com/makeplane/plane/master/LICENSE.txt |
| Reuse | **Ideas only** |
| Stack | Django + PostgreSQL + Redis, React/TypeScript front-end. |
| What it does best | Polished modern UI; "work items" with states grouped into categories (backlog / unstarted / started / completed / cancelled) — good model for "Done" semantics independent of column names; display filters and saved views; features you can switch off per project. |
| What to avoid | Jira/Linear-shaped (cycles, modules, estimates, Gantt, analytics): too much vocabulary for a sales or HR team. Heavy to run (Redis, workers). |

### Focalboard (for completeness)
| Field | Content |
|---|---|
| Project | Focalboard, https://github.com/mattermost-community/focalboard — ~26.5k stars; last release v8.0.0 (plugin only), 13 Jun 2024. README: "This repository is currently not maintained." |
| Licence | Dual: `AGPL-3.0` for source (or Mattermost commercial), `MIT` for compiled builds; some parts Apache-2.0 — https://raw.githubusercontent.com/mattermost-community/focalboard/master/LICENSE.txt |
| Reuse | **Ideas only** (source is AGPL) |
| Stack | Go + React/TypeScript. |
| What it does best | Notion-style boards: cards with typed properties (select, person, date), board / table / gallery / calendar views over the same cards, group-by any select property. |
| What to avoid | Unmaintained; typed-property flexibility confuses non-technical users. |

Taiga (https://github.com/taigaio/taiga-back, `MPL-2.0` back-end, https://raw.githubusercontent.com/taigaio/taiga-back/master/LICENSE; front-end `AGPL-3.0`, https://raw.githubusercontent.com/taigaio/taiga-front/master/LICENSE; ~854 stars on taiga-back) was reviewed and left out: Scrum/agile vocabulary (user stories, sprints, points), Python/Django.

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Boards with columns (lists), default "To do / Doing / Done" | MVP | Trello, Planka, Kanboard | Board created from a template in one click. |
| Cards: title, description (Markdown-lite), assignees (member ids), due date, labels (colour + name) | MVP | Trello, Planka | Assignees are Chest members `mbr_…`, never names. |
| Drag and drop cards between/within columns, keyboard alternative | MVP | all | Fractional ordering (`pos` as in Trello) to avoid renumbering. |
| Quick add: one-line input at the bottom of each column | MVP | Trello, Vikunja | |
| Checklist inside a card (several checklists allowed) | MVP | Trello, WeKan | Planka's one-checklist limit is a known complaint. |
| Comments on a card, with activity history | MVP | Trello, Planka | |
| "My tasks" view across all boards, sorted by due date | MVP | Asana, Vikunja | The daily entry point. |
| List view (table) of a board, filter by assignee/label/due | MVP | Vikunja, Plane | |
| Archive cards and boards (never hard-delete by default) | MVP | Trello, WeKan | |
| Board visibility: whole team, or a group; per-board admin | MVP | Kanboard, Planka | Groups/roles from the platform, not in-tool user management. |
| Notify assignee on assignment / mention / due soon | MVP (assign, mention) / later (due soon) | Trello, Asana | Assign/mention → Chest shared inbox. "Due soon" needs a **scheduler (missing primitive, SDK proposal)**. Email digest needs **outbound email (proposal)**. |
| Import Trello board JSON | MVP | WeKan importer (MIT), Planka | Trello JSON: one object with `lists`, `cards`, `checklists`, `labels`, `members`, `actions` (comments are `actions` of type `commentCard`), fields listed in WeKan's `trelloCreator.js`. Per-board JSON export is what Planka's and Vikunja's importers consume (plan availability not verified); workspace-wide CSV/JSON export with optional raw attachments needs Premium (per search result, https://support.atlassian.com/trello/docs/exporting-data-from-trello/, not read first-hand: domain blocked). Members mapped manually to Chest members at import. |
| Import Trello CSV / Asana CSV | MVP | Kanboard, WeKan csvCreator | Asana project CSV columns: Task ID, creation date, completion date, last modified date, Name, Assignee, Due Date, Tags, Notes, project name, Parent Task, plus section and every custom field; exact header spellings to be checked on a real file (per search result summarising https://asana.com/inside-asana/export-to-csv, not read first-hand). Trello CSV requires Premium and omits comments (per search result). Column mapping screen with preview. |
| Attachments on a card | MVP | Trello | Through the Chest file API. |
| Export board to CSV and JSON | MVP | Trello | Reversibility is part of the pitch. |
| Polling refresh (e.g. every 10–20 s while visible) | MVP | — | No WebSocket on Chest; last-write-wins with a version column + conflict message. |
| Calendar view of due dates | later | Vikunja, Planka Pro | |
| Recurring tasks | later | Vikunja, Asana | Needs **scheduler** primitive, or create-on-completion. |
| Board templates (onboarding, hiring, event) | later | Trello, WeKan | |
| Quick-add parsing ("tomorrow @alice #urgent") | later | Vikunja | FR + EN date words. |
| Automation rules ("when moved to Done, …") | later | Kanboard, Trello Butler | Keep to 3–4 fixed recipes. |
| Custom fields, WIP limits, swimlanes | later | Kanboard, WeKan | |
| Gantt/timeline, dependencies | later | Vikunja, Plane | |
| Time tracking, sprints, story points, estimates | never | Taiga, Plane | Leave to dev tools/forks. |
| Public boards (anonymous read) | never (for now) | Trello | Private tool. |

## Reusable pieces
- **WeKan Trello/CSV importers** — `models/trelloCreator.js`, `models/csvCreator.js`, MIT, https://github.com/wekan/wekan — copy the mapping logic with attribution (rewrite against our schema).
- **@dnd-kit/core** 6.3.1, MIT — https://github.com/clauderic/dnd-kit (LICENSE: https://raw.githubusercontent.com/clauderic/dnd-kit/master/LICENSE); accessible drag and drop with keyboard sensors, works with React.
- **@atlaskit/pragmatic-drag-and-drop** 4.0.0, Apache-2.0 — https://github.com/atlassian/pragmatic-drag-and-drop (the engine behind Trello/Jira boards); alternative to dnd-kit.
- **papaparse** 5.7.0, MIT — CSV parsing for Trello/Asana CSV import and CSV export.
- **date-fns** 4.4.0, MIT — due-date arithmetic and FR/EN locales.
- **rrule** 2.8.1, BSD-3-Clause — recurring tasks (later).
- **fractional-indexing** idea (ordering keys between two cards) — implement ourselves, a few lines.
- Versions/licences above read from the npm registry (`registry.npmjs.org/<pkg>/latest`) on 2026-09-28.

## Legal and security notes
- **GDPR**: tasks contain personal data (assignees, comments). Store member ids only; export and deletion of a member's data must be possible (Art. 15/17). Comments may contain sensitive data (HR, health) — warn in docs, keep boards private to groups when needed.
- **Employee monitoring (France)**: using task data to measure individual productivity is employee activity control; CNIL requires proportionality, prior information of employees and consultation of staff representatives (CSE) — https://www.cnil.fr/fr/controle-de-lactivite-des-personnes-employees (per search result). Consequence: no per-person productivity dashboards, no "time online" tracking; activity history exists only to explain a card's changes.
- **Import security**: Trello/Asana files are untrusted — cap file size, validate JSON schema, sanitize Markdown/HTML descriptions (no raw HTML), never follow attachment URLs server-side (would need declared outbound network; attachments are re-uploaded by the user or omitted).
- **Attachments**: via Chest file API with access checks tied to the board's visibility.
- No sector regulation (invoicing, labour-time law) applies to a task board.

## Sources
- https://github.com/kanboard/kanboard, https://github.com/kanboard/kanboard/releases, https://raw.githubusercontent.com/kanboard/kanboard/master/LICENSE
- https://github.com/wekan/wekan, https://github.com/wekan/wekan/releases, https://raw.githubusercontent.com/wekan/wekan/master/LICENSE, https://raw.githubusercontent.com/wekan/wekan/master/models/trelloCreator.js
- https://github.com/go-vikunja/vikunja, https://github.com/go-vikunja/vikunja/releases, https://raw.githubusercontent.com/go-vikunja/vikunja/master/LICENSE
- https://community.vikunja.io/t/self-hosted-importing-from-trello/3712, https://community.vikunja.io/t/import-trello-json-how/4766, https://vikunja.io/docs/migration-from-third-party-services/
- https://github.com/plankanban/planka, https://github.com/plankanban/planka/releases, https://raw.githubusercontent.com/plankanban/planka/master/LICENSE.md
- https://docs.planka.cloud/docs/configuration/importing-from-trello/
- https://prohoster.info/en/blog/novosti-interneta/proekt-planka-perehodit-na-nesvobodnuyu-liczenziyu, https://github.com/orneiavso/planka
- https://github.com/makeplane/plane, https://github.com/makeplane/plane/releases, https://raw.githubusercontent.com/makeplane/plane/master/LICENSE.txt
- https://github.com/mattermost-community/focalboard, https://github.com/mattermost-community/focalboard/releases, https://raw.githubusercontent.com/mattermost-community/focalboard/master/LICENSE.txt
- https://github.com/taigaio/taiga-back, https://raw.githubusercontent.com/taigaio/taiga-back/master/LICENSE, https://raw.githubusercontent.com/taigaio/taiga-front/master/LICENSE
- https://support.atlassian.com/trello/docs/exporting-data-from-trello/, https://support.atlassian.com/trello/docs/making-sense-of-trellos-json-export/ (search results only; domain blocked)
- https://asana.com/inside-asana/export-to-csv, https://help.asana.com/s/article/preparing-data-for-csv-import?language=en_US (search results only; domain blocked)
- https://raw.githubusercontent.com/clauderic/dnd-kit/master/LICENSE, https://raw.githubusercontent.com/atlassian/pragmatic-drag-and-drop/master/LICENSE
- https://registry.npmjs.org/ (package versions and licences: @dnd-kit/core, @atlaskit/pragmatic-drag-and-drop, papaparse, date-fns, rrule)
- https://www.cnil.fr/fr/controle-de-lactivite-des-personnes-employees
