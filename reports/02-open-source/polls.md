# Polls — open-source research
_Read on 2026-09-28. Replaces: Doodle, Slack polls (Polly), Officevibe pulse surveys, SurveyMonkey / Google Forms for internal use._

## The job
Someone asks the team a question and gets an answer by the end of the day: "Which evening for
the team dinner?" (date poll), "Pizza or sushi?" (single/multiple choice), "How was your week,
1 to 5?" (anonymous pulse). Voters open a link, tap their answers in under 30 seconds, and
see the result; the organiser closes the poll and announces the winner.

## Projects

### Rallly
| Field | Content |
|---|---|
| Project | Rallly — https://github.com/lukevella/rallly — ~5,277 stars (GitHub search API, 2026-09-28); v4.15.2, 2026-09-21 (releases feed); very active, 5 open issues |
| Licence | AGPL-3.0 (LICENSE: https://github.com/lukevella/rallly/blob/main/LICENSE; README says "AGPLv3 or any later version" → AGPL-3.0-or-later) |
| Reuse | **Ideas only** |
| Stack | Next.js, Prisma, tRPC, PostgreSQL, Tailwind, i18next — same family as ours |
| What it does best | The best date-poll UX: propose dates/times, **availability grid** (participants × options) with yes / if-need-be / no, vote without an account, comments on the poll, notifications when people respond, **finalise** the chosen option and notify everyone, 10+ languages (README). Hidden-participants mode anonymises names in the grid instead of dropping rows (#2422, release notes) |
| What to avoid | Security advisory "IDOR in Vote Update Endpoint Allows Unauthorized Manipulation of Participant Votes" (https://github.com/lukevella/rallly/security/advisories/GHSA-pchc-v5hg-f5gp) — votes must be bound to the member from `member(request)`, never to an id in the body. Public-link/no-account model is not needed inside Chest |

### Framadate → Pollaris
| Field | Content |
|---|---|
| Project | Framadate — https://github.com/framasoft/framadate (GitHub mirror, ~103 stars, **archived 2025-11-20**, "no longer maintained"; upstream on framagit.org, not reachable from here). Framasoft replaced it in Nov 2025 with **Pollaris** (framadate.org now runs Pollaris; old polls deleted after Sept 2026 per https://docs.framasoft.org/fr/pollaris/, via search result) |
| Licence | Framadate: CeCILL-B (per mirror page and LICENCE files https://framagit.org/framasoft/framadate/framadate/blob/develop/LICENSE.en.txt, via search result). Pollaris: AGPL-3.0-or-later (read on a GitHub copy https://github.com/danielyepezgarces/pollaris; upstream repo not verified) |
| Reuse | **Ideas only** (CeCILL-B is BSD-like but not on our allow-list; Pollaris is AGPL) |
| Stack | Framadate: PHP 7.3, Smarty, MySQL. Pollaris: PHP / Symfony, Doctrine, Stimulus |
| What it does best | The French reference everyone knows: two poll types — **dates** and **classic** — yes / maybe / no, admin link vs vote link, optional hidden results, expiry date, comments, CSV export. Pollaris rewrite focused on mobile, readability and accessibility |
| What to avoid | Unmaintained codebase; anonymous edit-anyone-row model (anyone with the link could change others' votes in Framadate) |

### Nextcloud Polls
| Field | Content |
|---|---|
| Project | Polls — https://github.com/nextcloud/polls — ~285 stars (GitHub search API); latest release not verified; active (updated 2026-09-28) |
| Licence | AGPL-3.0-or-later (COPYING https://github.com/nextcloud/polls/blob/main/COPYING; SPDX header in README) |
| Reuse | **Ideas only** |
| Stack | PHP + Vue (Nextcloud app) |
| What it does best | Closest to our situation (polls inside a company platform with known users/groups): hide results until the owner reveals them, obfuscate participant names or strict anonymous mode, automatic expiry date, let participants add options, limit votes per option/user (sign-up sheet), confirm options after closing, export to spreadsheet/HTML, reminders to invited users, **calendar conflict hints** next to date options (README) |
| What to avoid | Many toggles on one settings panel; reminders rely on Nextcloud background jobs |

### Formbricks
| Field | Content |
|---|---|
| Project | Formbricks — https://github.com/formbricks/formbricks — ~13,037 stars (GitHub search API); 6.0.0, 2026-09-21 (releases feed); very active |
| Licence | AGPL-3.0 for the core; `apps/web/modules/ee` under an Enterprise licence; `packages/js`, `packages/api`, `packages/android`, `packages/ios` MIT (LICENSE https://github.com/formbricks/formbricks/blob/main/LICENSE) |
| Reuse | **Ideas only** (core); MIT SDK packages irrelevant to us |
| Stack | TypeScript, Next.js, Prisma, PostgreSQL |
| What it does best | Modern survey editor (question types, logic), link surveys, targeting groups, response analysis; clean one-question-per-screen UX |
| What to avoid | Product/customer-research orientation; enterprise features behind a key; far beyond "quick poll" |

### LimeSurvey
| Field | Content |
|---|---|
| Project | LimeSurvey — https://github.com/LimeSurvey/LimeSurvey — ~3,737 stars (GitHub search API); tag 7.3.0+260922, 2026-09-28 (tags feed); very active |
| Licence | GPL-2.0-or-later (LICENSE: https://github.com/LimeSurvey/LimeSurvey/blob/master/LICENSE, "either version 2 of the License, or (at your option) any later version") |
| Reuse | **Ideas only** |
| Stack | PHP (Yii), MySQL/PostgreSQL/MSSQL, React editor |
| What it does best | Serious anonymous surveys: token-based participation where the token is not linked to answers ("anonymized responses"), quotas, question logic, statistics, exports |
| What to avoid | Reviews: steep learning curve, overwhelming for quick polls, complicated user/group setup (https://www.capterra.com/p/145614/LimeSurvey/reviews/, https://www.trustradius.com/products/limesurvey/reviews?qs=pros-and-cons, via search results) |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Create a poll in one screen: question, options, type (choice / dates) | MVP | Framadate, Rallly | Two types only in MVP |
| Single or multiple choice | MVP | Polly, Framadate classic | |
| Date poll with yes / if needed / no, availability grid | MVP | Rallly, Framadate | Grid = members × options, best option highlighted |
| Who can vote: everyone, or a group | MVP | Nextcloud Polls | Groups from the platform |
| Vote once per member, change my vote until closed | MVP | all | Vote keyed on `member(request)`; unique (poll, member) — see Rallly IDOR |
| Live results as bars, or hidden until closed | MVP | Nextcloud Polls, Polly | Polling refresh (no WebSocket) every ~10 s while open |
| Anonymous poll: names never shown, not even to the creator | MVP | Officevibe, LimeSurvey | Store votes without member id + a separate "has voted" table; results shown only from N ≥ 5 voters (see legal) |
| Close date / close now, then "chosen option" announced | MVP | Rallly finalise | Closing at a date is evaluated on read (no cron needed) |
| Poll list: open (to answer), mine, closed | MVP | — | "Waiting for your vote" badge |
| Comments on a poll | later | Rallly, Framadate | |
| Notify the team when a poll opens / closes | later | Rallly, Polly | **Needs notifications to the shared inbox**; reminders need **scheduled jobs** |
| Recurring pulse survey (every Friday, same questions, trend chart) | later | Officevibe | **Needs scheduled jobs**; trend = aggregated per week |
| Rating / scale 1–5 and free-text question | later | Officevibe, Formbricks | Free text in anonymous mode needs N ≥ 5 threshold |
| Participants add options | later | Nextcloud Polls | |
| Limit votes per option (sign-up sheet, "3 places per slot") | later | Nextcloud Polls, Doodle sign-up | |
| Calendar conflict hints on date options | never | Nextcloud Polls | Needs calendar integration |
| External (non-member) voters via public link | never (for now) | Rallly, Framadate | Would need the public part of the Chest; revisit |
| Multi-page surveys with logic | never | LimeSurvey, Formbricks | Long tail |
| Export results to CSV | MVP | Doodle, Nextcloud Polls | For anonymous polls: aggregated counts only |
| Import from Doodle | never | Doodle | Doodle only exports an Excel file of participants and responses, and only on paid plans (https://help.doodle.com/en/articles/9457344-how-do-i-export-a-group-poll-to-excel, via search result). Polls are short-lived: nothing worth importing |

## Reusable pieces
- `date-fns` 4.4.0 — MIT — date options formatting and grouping by day.
- `recharts` 3.10.1 — MIT — https://github.com/recharts/recharts — only if a trend chart is needed for pulses; simple CSS bars suffice for MVP.
- No poll-specific library worth depending on; the logic is small.

## Legal and security notes
- **Anonymity is a promise, make it true.** CNIL distinguishes anonymous (answers cannot be linked to a person) from confidential (identifying but restricted access) surveys, recommends anonymity from collection, warns about re-identification by cross-checking, and suggests keeping individual answers no longer than ~6 months after the survey closes before keeping only aggregates (CNIL recommendation on workplace surveys, https://www.cnil.fr/sites/cnil/files/2025-06/recommandation_mesure_de_la_diversite_au_travail.pdf, via search result). In our anonymous mode: no member id on the vote row, no timestamp precise enough to correlate (store the day), the Chest admin cannot de-anonymise from the tool's tables, and the UI says exactly what is and is not anonymous.
- **Small-group threshold.** Officevibe shows scores only from 3 responses and written feedback only from 5 (https://help.workleap.com/en/articles/10281693-understand-workleap-officevibe-scores-and-survey-reports, https://help.officevibe.com/hc/en-us/articles/360028520452-Workleap-Officevibe-Anonymity, via search result). We adopt: anonymous results hidden until 5 votes.
- **Evaluation.** A pulse survey must not be used to evaluate individuals; if it were, Code du travail L1222-3 (prior information on evaluation methods) would apply (https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900860/).
- **Security.** Votes bound to `member(request)` only (Rallly IDOR advisory); unique constraint per (poll, member); only the creator (or an admin role) closes or deletes.

## Sources
- https://github.com/lukevella/rallly (README), https://raw.githubusercontent.com/lukevella/rallly/main/LICENSE, https://github.com/lukevella/rallly/releases.atom, https://github.com/lukevella/rallly/releases
- https://github.com/lukevella/rallly/security/advisories/GHSA-pchc-v5hg-f5gp (via search result)
- https://github.com/framasoft/framadate (archived mirror page), https://framagit.org/framasoft/framadate/framadate/blob/develop/LICENSE.en.txt (via search result; framagit blocked)
- https://framablog.org/2025/11/25/framadate-fait-peau-neuve/, https://docs.framasoft.org/fr/pollaris/ (via search result; direct fetch blocked)
- https://github.com/danielyepezgarces/pollaris (Pollaris copy: licence and stack)
- https://github.com/nextcloud/polls (README), https://raw.githubusercontent.com/nextcloud/polls/main/COPYING
- https://github.com/formbricks/formbricks (README), https://raw.githubusercontent.com/formbricks/formbricks/main/LICENSE, https://github.com/formbricks/formbricks/releases.atom
- https://github.com/LimeSurvey/LimeSurvey, https://raw.githubusercontent.com/LimeSurvey/LimeSurvey/master/LICENSE, https://github.com/LimeSurvey/LimeSurvey/tags.atom
- https://www.capterra.com/p/145614/LimeSurvey/reviews/, https://www.trustradius.com/products/limesurvey/reviews?qs=pros-and-cons (via search result)
- https://help.doodle.com/en/articles/9457344-how-do-i-export-a-group-poll-to-excel (via search result)
- https://help.workleap.com/en/articles/10281693-understand-workleap-officevibe-scores-and-survey-reports, https://help.officevibe.com/hc/en-us/articles/360028520452-Workleap-Officevibe-Anonymity (via search result)
- https://www.cnil.fr/sites/cnil/files/2025-06/recommandation_mesure_de_la_diversite_au_travail.pdf (via search result)
- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900860/ (via search result)
- https://registry.npmjs.org/date-fns, https://registry.npmjs.org/recharts, https://raw.githubusercontent.com/recharts/recharts/main/LICENSE
