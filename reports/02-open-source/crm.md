# Clients — open-source research
_Read on 2026-09-28. Replaces: HubSpot CRM, Pipedrive, Axonaut CRM, Sellsy CRM, folk._

## The job
A small sales team keeps one shared address book of **companies** and the **people** who work there,
follows each **deal** through a short pipeline (new → qualified → proposal → won/lost), and logs what
happened (call, meeting, note) so anyone can pick up a client. The 80 % core: find a contact fast, see
its history on one page, drag a deal to the next stage, and get reminded of the next follow-up.

## Projects
Stars and release dates come from the GitHub repository/releases pages as summarised by WebFetch (not the API, which is blocked here); GitHub shows current-year dates without a year, so "2026" is inferred where marked. Licences were read from the raw LICENSE files unless noted.


### Twenty
| Field | Content |
|---|---|
| Project | Twenty — https://github.com/twentyhq/twenty — ~57.7k stars (as read). Latest release `twenty/v2.43.0`, shown as "Sep 28" on the releases page (GitHub omits the year for current-year dates; 2026 inferred). Very active (40+ contributors on that release). |
| Licence | **AGPL-3.0** for the core, with files headed `/* @license Enterprise */` under the proprietary "Twenty.com Commercial License"; some packages (`twenty-ui`, `twenty-sdk`, `twenty-shared`, `packages/twenty-apps`) are **MIT** (confirmed: `packages/twenty-ui/package.json` declares `"license": "MIT"`, version 2.44.0 on `main`). LICENSE: https://github.com/twentyhq/twenty/blob/main/LICENSE |
| Reuse | **Ideas only** for the CRM itself (AGPL + commercial files). The MIT packages (`twenty-ui`, `twenty-shared`) could in principle be copied with attribution, but each file's header must be checked (not verified file by file). |
| Stack | TypeScript, NestJS + BullMQ, PostgreSQL, Redis; React (Jotai, Linaria, Lingui). Closest stack to ours (Node + Postgres), but it needs Redis and a worker process, which Chest does not provide. |
| What it does best | Modern, Notion-like record pages; table views with saved filters/sorts per object; Kanban by any select field; timeline of activity on each record; "company ↔ people ↔ opportunities" relations; clean CSV import with a column-mapping step. |
| What to avoid | Its "build your own CRM" layer (custom objects, workflows, AI agents) is far beyond a non-technical user's need. Self-hosting pain: worker needs `REDIS_URL`, blank UI after upgrades, update process (https://github.com/twentyhq/twenty/issues/8821, https://github.com/twentyhq/twenty/issues/14705, https://github.com/twentyhq/twenty/issues/12858). |

### Krayin CRM
| Field | Content |
|---|---|
| Project | Krayin — https://github.com/krayin/laravel-crm — ~24.0k stars (as read). Latest release v2.2.6, shown as "Sep 10" (year inferred 2026). Active. |
| Licence | **MIT** (Copyright Webkul Software 2010-2025). LICENSE: https://github.com/krayin/laravel-crm/blob/master/LICENSE |
| Reuse | **Code** (MIT, with attribution) — but it is PHP/Vue, so in practice we reuse data model and UX ideas, maybe translation strings. |
| Stack | PHP 8.3 / Laravel, Vue.js, MySQL/MariaDB. Data model (leads, persons, organizations, pipelines/stages, activities, products, quotes) transposes directly to Postgres. |
| What it does best | Lead = deal with pipeline Kanban and a stage "probability"; activities (call, meeting, lunch) with schedule; custom attributes; lead → quote link; dashboard of won/lost value. |
| What to avoid | Admin-panel look (sidebar with a dozen modules); email parsing via Sendgrid and WhatsApp/VoIP extensions — outbound integrations we cannot offer. |

### EspoCRM
| Field | Content |
|---|---|
| Project | EspoCRM — https://github.com/espocrm/espocrm — ~3.4k stars (as read). Latest release 10.0.8, shown as "Sep 8" (year inferred 2026). Active. |
| Licence | **AGPL-3.0** — LICENSE.txt read: "GNU AFFERO GENERAL PUBLIC LICENSE Version 3". https://raw.githubusercontent.com/espocrm/espocrm/master/LICENSE.txt |
| Reuse | **Ideas only**. |
| Stack | PHP 8.3+, custom SPA front-end (partly TypeScript); MySQL/MariaDB/PostgreSQL 15+. |
| What it does best | Very complete classic CRM: Accounts / Contacts / Leads / Opportunities / Cases; "stream" per record (who changed what); duplicate check on create; lead conversion to account+contact+opportunity in one step. |
| What to avoid | Entity Manager / layout editor complexity; too many modules for a 10-person team. |

### Frappe CRM
| Field | Content |
|---|---|
| Project | Frappe CRM — https://github.com/frappe/crm — ~3.6k stars (as read). Latest release v1.85.1, shown as "Sep 28" (year inferred 2026). Very active. |
| Licence | **AGPL-3.0** — LICENSE read. https://raw.githubusercontent.com/frappe/crm/develop/LICENSE |
| Reuse | **Ideas only**. |
| Stack | Python (Frappe Framework) + Vue 3 (Frappe UI). Does not transpose as code. |
| What it does best | The best "one page per deal" UX of the list: activities, emails, comments, notes and tasks in tabs on the same page; Kanban drag-and-drop; per-user saved views with quick filters; side panel with editable fields. |
| What to avoid | Telephony/WhatsApp integrations (Twilio, Exotel) that need outbound network; ERPNext coupling. |

### SuiteCRM
| Field | Content |
|---|---|
| Project | SuiteCRM — https://github.com/salesagility/SuiteCRM — ~5.8k stars (as read). Latest release 7.15.2, shown as "Jul 31" (year inferred 2026). Maintained (7.x line; 8.x is a separate repo). |
| Licence | **AGPL-3.0** — LICENSE.txt read. https://raw.githubusercontent.com/salesagility/SuiteCRM/master/LICENSE.txt |
| Reuse | **Ideas only**. |
| Stack | PHP 8.1–8.4, MySQL/MariaDB (SugarCRM heritage). |
| What it does best | Everything an enterprise CRM has (campaigns, cases, contracts, quotes, workflows) — useful as a "never" list. |
| What to avoid | The UX is dated and many users report slowness (https://community.suitecrm.com/t/fresh-suitecrm-8-feels-slow/83612, https://community.suitecrm.com/t/suitecrm-8-3-very-slow/89552). Exactly the heaviness we sell against. |

### Monica (personal CRM) and Odoo CRM (ideas)
| Field | Content |
|---|---|
| Project | Monica — https://github.com/monicahq/monica — ~25.4k stars; latest stable v4.1.2 (4 May 2024), pre-release v5.0.0-beta.5 (21 Apr 2025) — slow cadence. Odoo — https://github.com/odoo/odoo (CRM module, stars not read). |
| Licence | Monica **AGPL-3.0** — https://raw.githubusercontent.com/monicahq/monica/main/LICENSE.md read. Odoo Community **LGPL-3.0** (https://github.com/odoo/odoo/blob/master/LICENSE). |
| Reuse | **Ideas only** for both. |
| Stack | Monica: PHP/Laravel. Odoo: Python + OWL, PostgreSQL. |
| What it does best | Monica: warm, human record page — "how we met", important dates, reminders ("birthday in 3 days"), relationships between people, labels, favourites. Odoo CRM: the reference pipeline Kanban (column totals, drag to Won, "lost reason" prompt, star priority, activity clock icon red/amber/green on each card); "next activity" planning as the core loop. |
| What to avoid | Monica's pets/diary/life-events long tail; Odoo's coupling to its ERP (quotations, marketing automation, lead scoring). |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Companies and people, linked (a person belongs to 0..1 company) | MVP | All; Twenty, folk | Fields: name, email(s), phone(s), role, website, address, tags, owner (member id). |
| One page per company / person with its timeline (notes, calls, meetings, deals) | MVP | Frappe CRM, Twenty, EspoCRM stream | The central screen. |
| Deals pipeline as Kanban with drag-and-drop, column totals | MVP | Odoo, Pipedrive, Krayin | One pipeline with editable stages; won/lost with optional reason. |
| Log an activity (call / meeting / note / email summary) in one click | MVP | Pipedrive, Frappe CRM | Stored with author = `member(request)`. |
| "Next step" reminder on a deal or contact (date + text), overdue list | MVP | Odoo activities, Monica reminders | Shown as a "To do today" list in the tool; push to the Chest shared inbox needs the notifications primitive; a reminder that fires at a date with no one opening the tool needs **cron** (SDK proposal). |
| Search everything (name, email, company, phone) | MVP | All | Postgres `ILIKE`/trigram; no external search engine. |
| Owner / "my clients" filter; saved list filters | MVP | Twenty views, Frappe quick filters | Owner is a `mbr_…` id from the platform; no user management in the tool. |
| Import CSV from HubSpot and Pipedrive, with a column-mapping preview | MVP | Twenty import, Pipedrive | HubSpot exports CSV/XLS/XLSX; with all properties, columns are alphabetical and **Record ID is the first column**, associations (e.g. associated company) at the end; CSV >2 MB is zipped (https://knowledge.hubspot.com/import-and-export/export-records, read via search snippet — page blocked by our proxy). Pipedrive exports CSV or Excel per entity (deals, persons, organizations, activities, notes, leads, products) from Tools and apps → Export data, admin only, files expire after a month; activities/notes are separate files (https://support.pipedrive.com/en/article/exporting-data-from-pipedrive, read via search snippet). Link rows by name or by the exported ids. |
| Import / export vCard (.vcf) | MVP | Monica, phone address books | vCard 4.0 (RFC 6350): FN, N, ORG, TITLE, EMAIL, TEL, ADR, NOTE, UID; CRLF lines folded at 75 octets. Accept 3.0 (RFC 2426) on import, which most phones/Google/Apple still emit. |
| Export CSV of any list | MVP | All | Leaving must be easy — part of the pitch. |
| Duplicate detection (same email / same company domain) on create and import | MVP | EspoCRM | Merge in "later". |
| French and English UI | MVP | Chest rule | |
| Attach files to a record (proposal PDF, contract) | later | Twenty, Frappe | Needs the Chest file API. |
| Merge duplicates | later | HubSpot, EspoCRM | |
| Custom fields (text/number/date/select) per object | later | Krayin, Twenty | Keep to 4 types. |
| Link a deal to a quote in the **Quotes** tool | later | Krayin lead→quote, Axonaut | Needs a cross-tool API / intents in the SDK. |
| Simple dashboard: pipeline value by stage, won this month | later | Krayin, Pipedrive | |
| Several pipelines | later | Pipedrive, Odoo | |
| Send email from the CRM / log emails automatically (BCC address, IMAP sync) | later | HubSpot, Frappe | Needs outbound email and inbound mail primitives (SDK proposal). |
| Mailing campaigns, newsletters | never | SuiteCRM, HubSpot Marketing | Consent management, deliverability — out of scope. |
| Telephony, WhatsApp, LinkedIn enrichment | never | Frappe, Krayin, folk | External paid APIs. |
| Workflow builder, AI agents, custom objects | never | Twenty | Anti-simplicity. |
| Support tickets / cases | never | SuiteCRM, EspoCRM | Belongs to a helpdesk tool. |

## Reusable pieces
- **papaparse** 5.7.0, MIT — CSV parsing in browser/Node, handles quotes, BOM, delimiter sniffing (`;` from French Excel). https://github.com/mholt/PapaParse
- **csv-parse** 7.0.3, MIT — streaming server-side alternative. https://github.com/adaltas/node-csv
- **vcard4** 4.0.5, ISC — vCard 4.0 generate/parse. https://github.com/kelseykm/vcard4 (for 3.0 import we may write our own small parser; RFC grammar is simple).
- **libphonenumber-js** 1.13.14, MIT — parse/format/validate phone numbers (FR default). https://gitlab.com/catamphetamine/libphonenumber-js
- **@dnd-kit/core** 6.3.1, MIT — accessible drag-and-drop for the Kanban (keyboard support). https://github.com/clauderic/dnd-kit (last release Dec 2024 — stable but slow cadence).
- **validator** 13.15.35, MIT — email/URL validation. https://github.com/validatorjs/validator.js
- Krayin (MIT) — data model and FR strings could be consulted and copied with attribution if useful.

All versions/licences read from registry.npmjs.org on 2026-09-28.

## Legal and security notes
- **GDPR**: a CRM is a processing of personal data (clients/prospects). The CNIL "clients et prospects" referential recommends keeping **prospect** data at most **3 years from collection or the last contact coming from the prospect**; opening an email does not count as a contact (https://www.cnil.fr/fr/questions-reponses-sur-les-referentiels-relatifs-la-gestion-des-activites-commerciales-et-des, https://www.cnil.fr/sites/cnil/files/atoms/files/guide_durees_de_conservation.pdf — read via search snippets; CNIL site not fetched). → MVP: store `last_contact_at`; "later": a "stale prospects (3 years)" list with bulk delete/anonymise.
- Right of access / erasure: a person's full record must be exportable (vCard/CSV) and deletable, including its activity notes.
- Free-text notes can contain sensitive data; UI hint "do not write health, political or other sensitive information".
- Security: identity from `member(request)` only; `owner_id` and `author_id` are `mbr_…`. All members see all clients in MVP (small team); per-group visibility is "later" and needs platform groups. CSV import must neutralise formula injection on **export** (prefix `=`, `+`, `-`, `@` cells) since the file is opened in Excel.
- B2B email prospecting in France is opt-out based, but campaigns are out of scope ("never").

## Sources
- https://github.com/twentyhq/twenty ; https://github.com/twentyhq/twenty/blob/main/LICENSE ; https://github.com/twentyhq/twenty/releases
- https://github.com/twentyhq/twenty/issues/8821 ; https://github.com/twentyhq/twenty/issues/14705 ; https://github.com/twentyhq/twenty/issues/12858 ; https://github.com/twentyhq/twenty/issues/11979
- https://github.com/krayin/laravel-crm ; https://github.com/krayin/laravel-crm/blob/master/LICENSE ; https://github.com/krayin/laravel-crm/releases
- https://github.com/espocrm/espocrm ; https://github.com/espocrm/espocrm/releases
- https://github.com/frappe/crm ; https://github.com/frappe/crm/releases
- https://github.com/salesagility/SuiteCRM ; https://github.com/salesagility/SuiteCRM/releases
- https://community.suitecrm.com/t/fresh-suitecrm-8-feels-slow/83612 ; https://community.suitecrm.com/t/suitecrm-8-3-very-slow/89552
- https://github.com/monicahq/monica ; https://github.com/monicahq/monica/releases
- https://github.com/odoo/odoo/blob/master/LICENSE
- https://knowledge.hubspot.com/import-and-export/export-records (search snippet; direct fetch blocked by proxy)
- https://support.pipedrive.com/en/article/exporting-data-from-pipedrive (search snippet; direct fetch blocked by proxy)
- https://datatracker.ietf.org/doc/html/rfc6350 (search snippet)
- https://www.cnil.fr/fr/questions-reponses-sur-les-referentiels-relatifs-la-gestion-des-activites-commerciales-et-des ; https://www.cnil.fr/sites/cnil/files/atoms/files/guide_durees_de_conservation.pdf (search snippets)
- https://registry.npmjs.org/ (papaparse, csv-parse, vcard4, libphonenumber-js, @dnd-kit/core, validator)
