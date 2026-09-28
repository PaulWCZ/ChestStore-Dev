# Hiring — open-source research
_Read on 2026-09-28. Replaces: Welcome to the Jungle (ATS part), Teamtailor, Recruitee, Flatchr, Workable, the "jobs@" mailbox + spreadsheet._

## The job
The company publishes a job on its own careers page; candidates apply with a short form and a CV;
the hiring manager and colleagues move each candidate across stages (New → Screening → Interview →
Offer → Hired / Rejected), leave notes and a rating, and decide together. The 20 % used 80 % of the
time: a public job list and application form, a kanban per job, a candidate page with CV preview,
notes, ratings and team feedback, and a clean GDPR deletion after the retention period.

## Projects

### OpenCATS
| Field | Content |
|---|---|
| Project | OpenCATS — https://github.com/opencats/OpenCATS — 757 stars (GitHub search, 2026-09-28); v0.11.1 on 2026-09-03, v0.11.0 on 2026-08-27 (releases.atom); active modernisation roadmap (PHP 8.4/8.5, Bootstrap 5.3) |
| Licence | **MPL-2.0** for OpenCATS code + **CATS Public License 1.1a** (modified MPL) for original 2007 CATS code — https://raw.githubusercontent.com/opencats/OpenCATS/master/LICENSE.md |
| Reuse | **Whole files under MPL-2.0** in principle (MPL parts only; CPL 1.1a parts: ideas only). In practice PHP, so **ideas** |
| Stack | PHP, MySQL. Data model (candidate, job order, pipeline, activity) transposes to Postgres |
| What it does best | Pipeline statuses read from `constants.php`: No Contact (100), Contacted (200), Candidate Replied (250), Qualifying (300), Submitted (400), Interviewing (500), Offered (600), Not in consideration (650), Candidate declined (675), Client declined (700), Placed (800) — ordered numeric stages; a **Career Portal** for public applications; résumé attachments with text search; activity log per candidate |
| What to avoid | Built for staffing agencies (clients, contacts, "submitted to client") — too many concepts for an SME. The interface "is dated" (review https://www.glozo.com/blog/opencats-review, per search summary); UX modernisation still open (https://github.com/opencats/OpenCATS/issues/894, https://github.com/opencats/OpenCATS/issues/169) |

### Frappe HR — Recruitment
| Field | Content |
|---|---|
| Project | Frappe HR — https://github.com/frappe/hrms — 8,835 stars; v16.20.0 on 2026-09-23 (releases.atom); repo topic `recruitment` |
| Licence | **GPL-3.0** — https://raw.githubusercontent.com/frappe/hrms/develop/license.txt |
| Reuse | **Ideas only** (GPL) |
| Stack | Python, Frappe Framework, Vue, MariaDB |
| What it does best | Staffing plan → **Job Requisition** (manager asks to hire; README screenshot "hrms-requisition") → Job Opening published on the website → Job Applicant → Interview with **interview rounds and structured feedback per skill** → Job Offer → Employee (+ onboarding). The requisition-approval step and per-skill feedback are worth taking (chain beyond the README from product knowledge, not verified) |
| What to avoid | ERP forms; hiring a person touches 6 document types (observation, not cited) |

### OrangeHRM — Recruitment
| Field | Content |
|---|---|
| Project | OrangeHRM — https://github.com/orangehrm/orangehrm — 1,144 stars; OrangeHRM 5.9 on 2026-06-28 (releases.atom) |
| Licence | **GPL-3.0** — https://raw.githubusercontent.com/orangehrm/orangehrm/main/LICENSE |
| Reuse | **Ideas only** (GPL) |
| Stack | PHP, MySQL |
| What it does best | Simple linear statuses with **explicit actions** instead of drag-drop: Application Initiated → Shortlisted → Interview Scheduled → Interview Passed/Failed → Job Offered → Offer Declined / Hired, each action with a note and a history line (first four and "Hired" per search summary of https://help.orangehrm.com/hc/en-us/articles/360009019193-Shortlisting-and-Rejecting-Candidates; the others and the "consent to keep data" checkbox from product knowledge, not verified); hiring manager notified at each step |
| What to avoid | No kanban; one candidate ↔ one vacancy; admin-first screens |

### Horilla — Recruitment
| Field | Content |
|---|---|
| Project | Horilla — https://github.com/horilla/horilla-hr — 1,437 stars; 2.1.8 on 2026-09-26 (releases.atom) |
| Licence | **LGPL-2.1** — https://raw.githubusercontent.com/horilla/horilla-hr/2.0/LICENSE |
| Reuse | **Ideas only** (LGPL; we only take ideas) |
| Stack | Python, Django 5, HTMX; `spacy` imported at start (README) — used for résumé parsing (not verified) |
| What it does best | README: "Recruitment – End-to-end hiring process from job posting to onboarding". Kanban of **stages per recruitment** (each job may have its own stages), drag-and-drop, candidate **rating stars**, interview scheduling, application **survey questions** per job, "skill zone" talent pool, hand-over to onboarding |
| What to avoid | Many sub-menus; résumé AI parsing adds weight and GDPR questions (L.1221-8 below) |

### Huly — Recruiting module
| Field | Content |
|---|---|
| Project | Huly platform — https://github.com/hcengineering/platform — 27,804 stars; repo topics include `applicant-tracking-system`; release not verified |
| Licence | **EPL-2.0** — https://raw.githubusercontent.com/hcengineering/platform/develop/LICENSE |
| Reuse | **Ideas only** (EPL-2.0 is weak copyleft and not in our code list) |
| Stack | TypeScript, Svelte, MongoDB/CockroachDB — real-time (WebSocket) |
| What it does best | Modern UI: vacancies as projects, candidates as cards on a board with keyboard shortcuts, talents pool shared across vacancies, reviews as linked items (from product knowledge, not verified) |
| What to avoid | All-in-one workspace; real-time model we cannot use; heavy |

### Nueno
| Field | Content |
|---|---|
| Project | Nueno — https://github.com/nueno-co/nueno — 268 stars; no GitHub releases published (releases.atom empty on 2026-09-28) |
| Licence | **AGPL-3.0** — https://raw.githubusercontent.com/nueno-co/nueno/main/LICENSE |
| Reuse | **Ideas only** (AGPL) |
| Stack | TypeScript, Node, Next-style dev server on `localhost:3000`, Docker Postgres (README) — closest stack to ours |
| What it does best | Small-team ATS scope, TDD'd `business-logic` folder separate from UI — a good structure to imitate |
| What to avoid | Early-stage, little documentation of features; do not copy (AGPL) |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Public careers page: list of open jobs, job page | MVP | OpenCATS Career Portal, Teamtailor, WTTJ | Public part of the Chest (`tools/public-and-private/`) |
| Application form: name, email, phone (optional), CV upload (PDF), cover message, consent text | MVP | all | CV via **Chest file API**; size/type limits; no account for candidates |
| Job editor: title, team, location, contract type, remote, **salary range**, description | MVP | Welcome to the Jungle, pay-transparency directive | Salary range field required-by-default (see legal) |
| Kanban per job with fixed default stages (New, Screening, Interview, Offer, Hired, Rejected), drag or "Move to…" button | MVP | Horilla kanban, OrangeHRM actions, OpenCATS statuses | Keyboard-accessible "Move to" as the primary action |
| Candidate page: CV preview, contact, history of stage changes | MVP | OpenCATS activity log | pdf.js preview |
| Notes and 1–5 rating per team member, hidden until you rated (avoid bias) | MVP | Horilla stars, Frappe interview feedback, Teamtailor | Author = `member(request)` |
| Invite colleagues to give feedback on a candidate | MVP | Workable, Recruitee | Notification in Chest inbox |
| Reject with reason (internal) | MVP | OrangeHRM | Candidate message: copy-to-clipboard template until email exists |
| Email candidates from the tool (acknowledgement, rejection, invitation) | later | Teamtailor, Workable | **Outbound email is a missing primitive** — MVP shows a ready-to-send text + mailto link |
| GDPR retention: auto-delete/anonymise rejected candidates 2 years after last contact, with "extend with consent" | MVP (at read time) / later (scheduled) | CNIL, Welcome to the Jungle | Needs **scheduler primitive**; MVP: purge job runs when an admin opens the tool, plus a "to delete" list |
| Candidate data export / erasure on request (GDPR access & erasure) | MVP | WTTJ "Download in CSV" per candidate | |
| Interview slot + `.ics` download | later | Frappe interview rounds, OrangeHRM | ics lib |
| Custom stages per job | later | Horilla | |
| Screening questions per job | later | Horilla survey, Teamtailor | |
| Hiring request approval (manager asks, director approves) | later | Frappe Job Requisition | |
| Talent pool across jobs (only with candidate consent) | later | Huly talents, Teamtailor pool | Consent + 2-year limit |
| Hand-over to People onboarding when Hired | later | Frappe, Horilla | Inter-tool call = SDK proposal |
| Anti-spam on public form (honeypot + rate-limit) | MVP | — | No third-party captcha (no outbound network) |
| Import from Teamtailor / Workable / WTTJ CSV exports | later | exports below | Candidates + stage; CVs only if the export includes them |
| Multi-posting to job boards (Indeed, LinkedIn, WTTJ) | never (for now) | Teamtailor, Flatchr | Needs outbound network + partner APIs |
| AI CV parsing / scoring | never | Horilla (spacy), Resume-Matcher | L.1221-8 transparency, AI Act high-risk category — not worth it |
| Agency features (clients, submissions) | never | OpenCATS | |

Export formats of the SaaS we replace:
- **Teamtailor**: bulk-select candidates → Export → **.csv sent by email** (per search summary of https://support.teamtailor.com/en/articles/119099-export-your-candidates).
- **Workable**: "Candidate details" report → **CSV or PDF** (no résumés); full account export for paid plans = **ZIP with one CSV per area (candidates, comments, events, ratings, messages, jobs) and résumés in per-job folders**, requested from support (per search summary of https://help.workable.com/hc/en-us/articles/115014887828-How-do-I-export-candidate-data).
- **Welcome to the Jungle Solutions ATS**: per-candidate "Download in **CSV**" in Personal Data Management, admins only (per search summary of https://help.welcometothejungle.com/en/export-your-applications-from-welcome-to-the-jungle-solutions-ats).
Column sets were not read first-hand; the importer needs a mapping step.

## Reusable pieces
- **pdfjs-dist** 6.3.289 (npm 2026-08-29) — Apache-2.0 — https://github.com/mozilla/pdf.js — in-browser CV preview (render inside our origin, no third-party viewer).
- **file-type** 22.1.1 (npm 2026-09-17) — MIT — https://github.com/sindresorhus/file-type — sniff real type of uploaded CVs (reject non-PDF/DOCX).
- **@dnd-kit/core** 6.3.1 (npm 2024-12-05) — MIT — https://github.com/clauderic/dnd-kit — accessible kanban drag-and-drop (keyboard sensor built in).
- **ics** 3.12.0 — ISC — interview invitations as `.ics`.
- **papaparse** 5.7.0 — MIT — CSV import/export.
- **libphonenumber-js** 1.13.14 — MIT — phone validation.
- **sanitize-html** 2.17.7 — MIT / **markdown-it** 15.0.2 — MIT — job descriptions.
- OpenCATS MPL-2.0 files: PHP, nothing worth copying.

## Legal and security notes
- **Retention (France, CNIL)**: data of unsuccessful candidates may be kept **2 years after the last contact**, then deleted or irreversibly anonymised unless the candidate consents to stay in the pool; a longer restricted "intermediate archive" (up to 5 years, for discrimination litigation) is mentioned by secondary sources. CNIL published an HR retention référentiel in April 2026 (https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf). All per search summaries (donneespersonnelles.fr, legisocial.fr, village-justice.com); cnil.fr is blocked from here, **not read first-hand**.
- **Information collected** (Code du travail, per search summary of code.travail.gouv.fr, not read first-hand): **L.1221-6** — questions must only assess ability for the job and have a "direct and necessary link" with it (so no age, family status, photo required); **L.1221-8** — candidates must be told beforehand which recruitment methods/techniques are used, and they must be relevant; **L.1221-9** — no personal data collected by a device not disclosed to the candidate. Our form: no date of birth, no photo, no nationality; privacy notice on the form.
- **Non-discrimination** (Code du travail L.1132-1, not read first-hand): rating comments are discoverable in a dispute — hint to reviewers to write job-related feedback only.
- **CSE**: recruitment methods/techniques must be presented to the CSE before use (L.2312-38, per search summary) — our docs provide a one-page description for that.
- **Pay transparency**: EU Directive **2023/970** (transposition deadline 2026-06-07) requires the initial pay or pay range in the job ad or before the interview, and bans asking about salary history. France: bill presented to the Council of Ministers on 2026-09-10, entry into force expected 2028-01-01, applies to all company sizes (per search summaries of bpw.fr, la-recrue.fr, payfit.com — not read first-hand). Our tool: salary range field on by default; no "current salary" field on the form.
- **Security**: public form is the attack surface — size limit, MIME sniffing, store CVs through the file API only, never serve them from the public part; rate-limit per IP; CSRF; sanitise job HTML; private pipeline requires Chest membership and a "recruiter" role or job-level membership. Candidate emails are not Chest members: never use them as identity.

## Sources
- https://github.com/opencats/OpenCATS ; https://raw.githubusercontent.com/opencats/OpenCATS/master/LICENSE.md ; https://raw.githubusercontent.com/opencats/OpenCATS/master/README.md ; https://raw.githubusercontent.com/opencats/OpenCATS/master/constants.php ; https://github.com/opencats/OpenCATS/releases.atom
- https://github.com/opencats/OpenCATS/issues/894 ; https://github.com/opencats/OpenCATS/issues/169 (search summary)
- https://www.glozo.com/blog/opencats-review (search summary)
- https://github.com/frappe/hrms ; https://raw.githubusercontent.com/frappe/hrms/develop/license.txt ; https://raw.githubusercontent.com/frappe/hrms/develop/README.md ; https://github.com/frappe/hrms/releases.atom
- https://github.com/orangehrm/orangehrm ; https://raw.githubusercontent.com/orangehrm/orangehrm/main/LICENSE ; https://github.com/orangehrm/orangehrm/releases.atom
- https://help.orangehrm.com/hc/en-us/articles/360009019193-Shortlisting-and-Rejecting-Candidates (search summary)
- https://github.com/horilla/horilla-hr ; https://raw.githubusercontent.com/horilla/horilla-hr/2.0/LICENSE ; https://raw.githubusercontent.com/horilla/horilla-hr/2.0/README.md ; https://github.com/horilla/horilla-hr/releases.atom
- https://github.com/hcengineering/platform ; https://raw.githubusercontent.com/hcengineering/platform/develop/LICENSE
- https://github.com/nueno-co/nueno ; https://raw.githubusercontent.com/nueno-co/nueno/main/LICENSE ; https://raw.githubusercontent.com/nueno-co/nueno/main/README.md ; https://github.com/nueno-co/nueno/releases.atom
- https://support.teamtailor.com/en/articles/119099-export-your-candidates (search summary)
- https://help.workable.com/hc/en-us/articles/115014887828-How-do-I-export-candidate-data (search summary)
- https://help.welcometothejungle.com/en/export-your-applications-from-welcome-to-the-jungle-solutions-ats (search summary)
- https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf (search summary)
- https://www.donneespersonnelles.fr/quelle-duree-conservation-cv-candidats (search summary)
- https://www.legisocial.fr/actualites-sociales/7875-recrutement-duree-conservation-donnees-personnelles-candidat.html (search summary)
- https://www.village-justice.com/articles/referentiel-cnil-sur-les-durees-conservation-2026-que-les-equipes-doivent,57686.html (search summary)
- https://code.travail.gouv.fr/code-du-travail/l1221-6 ; https://code.travail.gouv.fr/code-du-travail/l1221-8 ; https://code.travail.gouv.fr/code-du-travail/l1221-9 ; https://code.travail.gouv.fr/code-du-travail/l2312-38 (search summaries)
- https://bpw.fr/transparence-salariale-projet-de-loi-9-septembre-2026 ; https://www.la-recrue.fr/veille-rh/transparence-salariale-obligations/ ; https://payfit.com/fr/fiches-pratiques/transparence-des-salaires/ (search summaries)
- https://registry.npmjs.org/ (pdfjs-dist, file-type, @dnd-kit/core, ics, papaparse, libphonenumber-js, sanitize-html, markdown-it)
