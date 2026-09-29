# Goals — open-source research
_Read on 2026-09-28. Replaces: Lattice Goals, Perdoo, Weekdone, 15Five OKRs, Tability, spreadsheets._

## The job
Once a quarter, the company and each team write 2–5 objectives, each with 2–4 measurable key
results ("Sign 20 new customers": 0 → 20). Every week or two, each key-result owner does a
30-second **check-in**: new value, how confident they are, one line of comment. Everybody can
open one page and see where the company stands: progress bars, what is on track, what is at risk.

## Projects

### OKR Tracker (Oslo kommune)
| Field | Content |
|---|---|
| Project | okr-tracker — https://github.com/oslokommune/okr-tracker — ~91 stars (GitHub search API, 2026-09-28); no releases read; last commit 2026-09-28 (commits feed); active, used in production by the City of Oslo |
| Licence | MIT (LICENCE file: https://github.com/oslokommune/okr-tracker/blob/main/LICENCE, "Copyright © 2020 Oslo kommune") |
| Reuse | **Code** (with attribution) |
| Stack | Vue 3 + Vite, Firebase (Firestore, Cloud Functions, Auth). UI components and data model can be read; the Firebase backend does not transpose, the Postgres schema must be ours |
| What it does best | OKRs **and KPIs** side by side for product teams; organisation hierarchy (organisation → department → product team) managed in an admin panel; key results fed manually or via API gateway; import/export of data; demo site (README) |
| What to avoid | Tied to Firebase (Blaze plan) and Google Cloud API Gateway; Norwegian public-sector hierarchy is heavier than a 30-person company needs |

### Operately
| Field | Content |
|---|---|
| Project | Operately — https://github.com/operately/operately — ~562 stars (GitHub search API); Operately 1.9.0, 2026-09-01 (releases feed); very active |
| Licence | Apache-2.0, except files in an `ee` directory under the "Operately Enterprise Edition License" (LICENSE: https://github.com/operately/operately/blob/main/LICENSE; `ee/LICENSE` returned 404 on main, so no ee code was found) |
| Reuse | **Code** (Apache-2.0 part, with attribution and NOTICE); never anything under `ee/` |
| Stack | Elixir / Phoenix backend, React + TypeScript front end, PostgreSQL. Front-end components (TS/React) are closest to reusable; backend is not |
| What it does best | Opinionated "company operating system" for 5–100 people: goals/OKRs linked to projects, team spaces, **built-in check-in cadence** ("execution cadence") and goal reviews, flat-price positioning against per-seat tools (README) |
| What to avoid | Scope is a whole work-management suite (projects, docs, messages) — we take only the goal + check-in loop |

### BurningOKR
| Field | Content |
|---|---|
| Project | BurningOKR — https://github.com/BurningOKR/BurningOKR — ~170 stars (GitHub search API); last commit 2023-12-04 (commits feed) → **dormant** |
| Licence | Apache-2.0 (LICENSE.txt: https://github.com/BurningOKR/BurningOKR/blob/master/LICENSE.txt) |
| Reuse | **Code** (with attribution), but nothing worth copying into a Node app |
| Stack | Java Spring Boot, Angular, PostgreSQL |
| What it does best | Classic company → department → team OKR tree, cycles (quarters), key results with start/target/current values, comments on key results, Azure AD sign-in |
| What to avoid | Unmaintained since 2023; Angular/Java stack; enterprise-style navigation |

### Thrive (personal goals, ideas only)
| Field | Content |
|---|---|
| Project | Thrive — https://github.com/get-thriving/thrive — ~175 stars (GitHub search API); active (updated 2026-09-28); release not verified |
| Licence | MIT (LICENSE: https://github.com/get-thriving/thrive/blob/develop/LICENSE) |
| Reuse | **Code** allowed, little relevant |
| Stack | Python |
| What it does best | Personal "life management" goals with recurring reviews — shows how a check-in ritual keeps goals alive |
| What to avoid | Personal, not team, scope |

### SaaS references (ideas only, no code)
- **Tability / Weekdone / Perdoo / Lattice**: weekly check-in with confidence, on track / at risk / off track colour, quarterly cycle, alignment tree. Weekdone is criticised for a clunky, dated UI and many clicks to set up (https://mooncamp.com/blog/tability-vs-weekdone, https://www.tability.io/compare/best-weekdone-alternatives, via search results).
- **Google-style grading**: aim for ~0.7 on stretch goals; confidence starts around 5/10 and should rise; the end-of-quarter score must never be a surprise if weekly check-ins happen (https://www.tability.io/okrs/how-to-score-your-okrs, https://mooncamp.com/blog/okr-scoring, via search results).

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Cycles (quarters) with a current cycle selector | MVP | BurningOKR, Perdoo | Default: calendar quarters; custom dates later |
| Objective: title, owner (member or team/group), level: company or team | MVP | all | Teams = platform groups |
| Key result: title, owner, start value, target, unit (number, %, €, yes/no) | MVP | Lattice types binary/digit/dollar/percent | Progress = (current − start) / (target − start), also works for decreasing targets |
| Check-in: new value + confidence (on track / at risk / off track) + comment | MVP | Tability, Weekdone | One small form; history kept per key result |
| Objective progress = average of its key results | MVP | Perdoo, BurningOKR | Optional weights later |
| Company page: all objectives with bars and colours, filter by team | MVP | okr-tracker, Perdoo | The page everyone opens |
| "My key results" with "check-in due" badge (last check-in older than 7 days) | MVP | Tability ritual | Computed on read; no cron |
| Link team objective to a company objective (alignment, one level) | MVP | Perdoo, BurningOKR tree | One parent max; tree view later |
| Close a cycle: final score per key result, copy unfinished to next cycle | MVP | Google grading | |
| Chart of a key result's value over time | later | Perdoo, okr-tracker | Line chart from check-ins |
| Weekly reminder to check in; digest to managers | later | Weekdone, Tability | **Needs scheduled jobs** + notifications to the inbox (email later) |
| KPIs (health metrics without target date) | later | okr-tracker | |
| Automatic values from another tool (e.g. CRM deals won) | later | okr-tracker API gateway | **Needs an SDK inter-tool data API** |
| Private individual goals (visible to owner + manager) | later | Lattice private goals | Needs a manager relation from the platform; sensitive (see legal) |
| Weights, stretch flags, multi-level trees | later | Perdoo | |
| Link goals to performance reviews / pay | never | Lattice, 15Five | Legal weight (L1222-3), different product |
| AI-generated OKRs | never | Perdoo import with AI | |
| Import from Lattice CSV | MVP | Lattice bulk upload template | Columns: owner email, OKR type (objective / key result), type (binary / digit / dollar / percent), start date, end date (yyyy-mm-dd), private, description, starting amount, goal amount; parent/child links are not in the file and must be re-attached (https://help.lattice.com/hc/en-us/articles/5673818109207-Bulk-Upload-Active-Goals-via-CSV, via search result). Lattice export: Goals > CSV (https://help.lattice.com/hc/en-us/articles/12929808069399-Export-Goals-as-a-CSV, via search result) — exact export columns not verified; we offer a column-mapping step |
| ↳ built (2026-09-29, after the critique) | — | — | `lib/import.ts`: a column-mapping step reads Lattice's template columns (Owner email, OKR Type, Type binary/digit/dollar/percent, Description, Starting/Progress/Goal amount; https://help.lattice.com/hc/en-us/articles/5673818109207-Bulk-Upload-Active-Goals-via-CSV, read 2026-09-29 via search results, the page itself unreachable from the studio), Goals' own export in both languages, and any spreadsheet; Perdoo's export has user-chosen columns (https://support.perdoo.com/en/articles/2630593-export-data, read 2026-09-29 via search results) so it goes through the same mapping |
| Import from spreadsheet (generic CSV: objective, key result, owner email, start, target, current) | MVP | spreadsheets, Perdoo CSV import | Most small companies keep OKRs in a sheet; owner email → member id |
| Export CSV | MVP | Perdoo "Export data" | https://support.perdoo.com/en/articles/2630593-export-data (via search result) |

## Reusable pieces
- `recharts` 3.10.1 — MIT — https://github.com/recharts/recharts — key-result value over time (later).
- `papaparse` 5.7.0 — MIT — CSV import with mapping.
- `date-fns` 4.4.0 — MIT — quarters (`startOfQuarter`, `endOfQuarter`) and "days since last check-in".
- okr-tracker (MIT) and Operately (Apache-2.0, non-`ee` part) — progress-bar / check-in component ideas can be adapted with attribution; we will more likely re-implement in our own design system.

## Legal and security notes
- **Evaluation of employees (French labour law).** If goals are used to evaluate individuals, the employee must be informed beforehand of the evaluation methods, results are confidential, and methods must be relevant to the purpose (Code du travail art. L1222-3, https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900860/). Criteria must be objective and transparent (https://www.legisocial.fr/actualites-sociales/7593-entretien-evaluation-criteres-doivent-precis-objectifs-pertinents.html, via search result). Our MVP stays on **team and company** goals, visible to all members; individual private goals (later) must be marked as not an evaluation tool unless the company has done this information step. Introducing a new evaluation tool can also require CSE consultation in 50+ companies (L2312-8, general working-conditions consultation; not verified specifically for OKR tools).
- **GDPR.** Check-in comments can contain personal opinions about people; keep history for the cycle plus a retention period set by the admin; member ids only.
- **Security.** Only the owner (or a role such as "goals admin") edits a key result or checks in; identity from `member(request)`; history is append-only so progress cannot be rewritten silently.

## Sources
- https://github.com/oslokommune/okr-tracker (README, repo page), https://raw.githubusercontent.com/oslokommune/okr-tracker/main/LICENCE, https://github.com/oslokommune/okr-tracker/commits/main.atom
- https://github.com/operately/operately (README), https://raw.githubusercontent.com/operately/operately/main/LICENSE, https://github.com/operately/operately/releases.atom
- https://github.com/BurningOKR/BurningOKR (README), https://raw.githubusercontent.com/BurningOKR/BurningOKR/master/LICENSE.txt, https://github.com/BurningOKR/BurningOKR/commits/master.atom
- https://github.com/get-thriving/thrive, https://raw.githubusercontent.com/get-thriving/thrive/develop/LICENSE
- https://mooncamp.com/blog/tability-vs-weekdone, https://www.tability.io/compare/best-weekdone-alternatives (via search result)
- https://www.tability.io/okrs/how-to-score-your-okrs, https://mooncamp.com/blog/okr-scoring, https://www.tability.io/okrs/a-simple-weekly-ritual-to-track-okrs (via search result)
- https://help.lattice.com/hc/en-us/articles/5673818109207-Bulk-Upload-Active-Goals-via-CSV, https://help.lattice.com/hc/en-us/articles/12929808069399-Export-Goals-as-a-CSV (via search result)
- https://support.perdoo.com/en/articles/2630593-export-data (via search result)
- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900860/, https://www.legisocial.fr/actualites-sociales/7593-entretien-evaluation-criteres-doivent-precis-objectifs-pertinents.html (via search result)
- https://registry.npmjs.org/recharts, https://registry.npmjs.org/papaparse, https://registry.npmjs.org/date-fns
