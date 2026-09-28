# People — open-source research
_Read on 2026-09-28. Replaces: BambooHR / Factorial / Lucca Poplee (directory, org chart, onboarding parts), the Google Workspace directory, a Notion "team" page, the shared "who's who" spreadsheet._

## The job
Every employee looks someone up: "who handles invoices?", "what is Marc's phone?", "who is the new
person in marketing?", "who is Julie's manager?". HR or the manager adds a newcomer and ticks an
onboarding checklist during their first weeks. The 20 % used 80 % of the time: a searchable
directory of cards (photo, job title, team, contact, what I do / skills), a manager→report org chart,
and a per-newcomer checklist.

## Projects

### Frappe HR
| Field | Content |
|---|---|
| Project | Frappe HR — https://github.com/frappe/hrms — 8,835 stars (GitHub search, 2026-09-28); v16.20.0 on 2026-09-23 (releases.atom); very active |
| Licence | **GPL-3.0** — https://raw.githubusercontent.com/frappe/hrms/develop/license.txt |
| Reuse | **Ideas only** (GPL) |
| Stack | Python, Frappe Framework, Vue (Frappe UI), MariaDB. Not transposable as code; data model ideas transpose |
| What it does best | README: "Employee Lifecycle: From onboarding employees, managing promotions and transfers … exit interviews". Onboarding done with reusable **templates of activities**, each assigned to a role/person (template details from product knowledge, not verified); employee record with `reports_to` building the org chart; a mobile PWA for the employee |
| What to avoid | It is an ERP module: 13 modules, doctypes and forms everywhere; a non-technical employee does not find "who is Marc" quickly (observation, not cited) |

### OrangeHRM (Starter)
| Field | Content |
|---|---|
| Project | OrangeHRM — https://github.com/orangehrm/orangehrm — 1,144 stars; OrangeHRM 5.9 on 2026-06-28 (releases.atom) |
| Licence | **GPL-3.0** — https://raw.githubusercontent.com/orangehrm/orangehrm/main/LICENSE |
| Reuse | **Ideas only** (GPL) |
| Stack | PHP, MySQL (front-end framework not verified) |
| What it does best | A dedicated **Directory** module separate from the PIM (HR file): only public fields (name, job title, location, phone, email, photo) are shown to everyone, filterable by job title and location — a good privacy split between "directory" and "HR record" (from product knowledge; field list not verified) |
| What to avoid | Admin-heavy setup (job titles, locations, sub-units configured before anything shows); dated look (observation) |

### Horilla HRMS
| Field | Content |
|---|---|
| Project | Horilla — https://github.com/horilla/horilla-hr — 1,437 stars; 2.1.8 "Security release" on 2026-09-26 (releases.atom); default branch `2.0` |
| Licence | **LGPL-2.1** — https://raw.githubusercontent.com/horilla/horilla-hr/2.0/LICENSE |
| Reuse | **Ideas only** (LGPL) |
| Stack | Python 3.12+, Django 5, HTMX, jQuery. Server-rendered + small interactions — close to what we do with Next.js server components |
| What it does best | README: "Onboarding & Offboarding – Structured workflows for employee lifecycle"; onboarding as **stages + tasks** on a kanban per newcomer; employee cards view vs list view toggle; LDAP import |
| What to avoid | Everything-in-one HRMS (payroll, biometrics, helpdesk…); many menus |

### IceHrm
| Field | Content |
|---|---|
| Project | IceHrm — https://github.com/gamonoid/icehrm — 728 stars; v36.0.0 on 2026-09-14 (releases.atom) |
| Licence | **Elastic-2.0** (source-available, not open source) — https://raw.githubusercontent.com/gamonoid/icehrm/master/LICENSE |
| Reuse | **Ideas only** (Elastic License 2.0) |
| Stack | PHP, JavaScript |
| What it does best | Company structure tree (company → department → team) separate from reporting lines; employee skills/education/certifications as lists |
| What to avoid | Licence change to ELv2; do not copy anything |

### d3-org-chart (library)
| Field | Content |
|---|---|
| Project | d3-org-chart — https://github.com/bumbeishvili/org-chart — 1,214 stars; npm `d3-org-chart` 3.1.1 published 2023-09-18 (registry.npmjs.org) — library is stable but no release for 3 years; 138 open issues |
| Licence | **MIT** — https://raw.githubusercontent.com/bumbeishvili/org-chart/master/LICENSE.md |
| Reuse | **Code** (dependency or copy, with attribution) |
| Stack | JavaScript, d3 v7; works in React via a ref |
| What it does best | Custom HTML node content (photo + name + title), expand/collapse, zoom/pan, "fit", highlight path to root, export PNG/SVG |
| What to avoid | Pulls in d3; heavy for a 20-person company. For small orgs a plain nested HTML/CSS tree is more accessible (keyboard, screen readers) |

### OrgChart (dabeng, library)
| Field | Content |
|---|---|
| Project | OrgChart — https://github.com/dabeng/OrgChart — 3,041 stars; npm `orgchart` 6.0.0 published 2026-08-06; 408 open issues |
| Licence | **MIT** — https://raw.githubusercontent.com/dabeng/OrgChart/master/LICENSE |
| Reuse | **Code** (with attribution) |
| Stack | JavaScript; historically a jQuery plugin (repo topic `jquery`); whether 6.0 still needs jQuery not verified |
| What it does best | Pure DOM/CSS tree rendering (not SVG), drag-and-drop to re-parent, export to PNG/PDF |
| What to avoid | jQuery dependency (if still present) — we would rather copy the CSS-tree idea |

Not found: Sentrifugo (`sentrifugo/sentrifugo` did not come up in GitHub search on 2026-09-28; status not verified). BALKANGraph OrgChartJS (282 stars) is a commercial-licensed library — skipped.

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Directory: cards with photo, name, job title, team, location, work phone, work email | MVP | OrangeHRM Directory, BambooHR, Poplee | Identity from Chest `member(request)`; name/email come from the platform, stored by `mbr_…` id |
| Instant search across name, title, team, skills, "ask me about" | MVP | Google directory, Notion team page | Postgres full-text / trigram, accent-insensitive (FR) |
| Filter by team and location | MVP | OrangeHRM | Teams can map to Chest groups |
| Profile "What I do" + skills/tags + languages spoken | MVP | IceHrm skills, Notion | Everyone edits their own card |
| Manager field → org chart (tree) | MVP | Frappe `reports_to`, BambooHR org chart | HTML/CSS tree first, d3-org-chart if > ~80 people |
| New-joiner flag ("joined 3 days ago") | MVP | Workvivo, Lucca | Link to a News welcome post if News is installed |
| Onboarding checklist per newcomer from a reusable template (task, owner, due "day −7 / day 1 / week 2") | MVP | Frappe onboarding template, Horilla stages | Owner = member id; reminders go to the Chest inbox |
| Birthdays and work anniversaries, **opt-in**, day/month only (no year) | MVP | BambooHR, Lucca | Off by default per person; see legal notes |
| Out-of-office / "away until" badge | later | Lucca, Slack status | Could read from a Leave tool when one exists (inter-tool API = SDK proposal) |
| Import from CSV (BambooHR "Employee Directory" report CSV, Google Workspace users CSV, Lucca Excel/CSV export) with column mapping | MVP | BambooHR / Google / Lucca exports | Export formats below |
| Export directory to CSV and vCard | later | Google directory | vcards-js |
| Offboarding checklist | later | Frappe, Horilla | Same engine as onboarding |
| Reminders for overdue onboarding tasks | later | Frappe | Needs **scheduler primitive**; MVP computes "overdue" at read time |
| Email the newcomer before day 1 | later | BambooHR onboarding | **Outbound email missing** in Chest |
| Custom profile fields defined by admin | later | HumHub, OrangeHRM | Keep few |
| Drag-and-drop re-organisation in the org chart | later | dabeng OrgChart | |
| Sensitive HR file (salary, contract, ID, bank details) | never | BambooHR PIM | Not a directory's job; high GDPR risk |
| Payroll, time tracking, performance reviews | never | Frappe, Horilla | Other tools |
| LDAP / SCIM sync | never (platform's job) | Horilla, OrangeHRM | Members come from Chest |

Export formats of the SaaS we replace:
- **BambooHR**: any standard or custom report (e.g. "Employee Directory") exports to **CSV or Excel**, columns = the fields chosen (per search summary of https://support.humi.ca/hc/en-us/articles/360024346314-Exporting-your-employee-data-from-Bamboo-HR and https://help.bamboohr.com/s/article/587751).
- **Google Workspace**: Admin console → Directory → Users → Download → **CSV**, "all user info columns" or selected columns (per search summary of https://support.google.com/a/answer/7348070).
- **Lucca (Poplee / Collaborateurs)**: Excel export of the directory and a configurable **CSV** export (per search summary of https://www.lucca.fr/actualites/poplee-lannuaire-interactif/ and https://support.lucca.fr/hc/fr/articles/115002415852).
Column names differ per customer, so the importer must offer a mapping step (first name, last name, email, title, team, manager email, phone, start date).

## Reusable pieces
- **d3-org-chart** 3.1.1 — MIT — https://github.com/bumbeishvili/org-chart (npm 2023-09-18).
- **orgchart** (dabeng) 6.0.0 — MIT — https://github.com/dabeng/OrgChart (npm 2026-08-06).
- **d3-hierarchy** 3.1.2 — ISC — https://github.com/d3/d3-hierarchy — just the tree layout if we draw our own SVG.
- **papaparse** 5.7.0 (npm 2026-08-24) — MIT — https://github.com/mholt/PapaParse — CSV import.
- **libphonenumber-js** 1.13.14 (npm 2026-09-24) — MIT — https://www.npmjs.com/package/libphonenumber-js — format/validate FR and international phones.
- **vcards-js** 2.11.1 (npm 2026-06-21) — MIT — "save contact" (.vcf).
- **date-fns** 4.4.0 — MIT — anniversaries and "joined 3 days ago".
- Avoid **d3-flextree** (WTFPL — not in our allowed list).

## Legal and security notes
- **Legal basis**: the CNIL HR framework puts internal directories and org charts under the employer's **legitimate interest**; consent is generally not a valid basis between employer and employee (per search summaries of https://www.cnil.fr/fr/les-regles-pour-la-gestion-du-personnel and the 2019 référentiel https://www.cnil.fr/sites/default/files/atoms/files/referentiel_grh_novembre_2019_0.pdf; cnil.fr is blocked here, not read first-hand). So: professional fields (name, title, team, work phone/email, manager) can be shown without consent, with information to employees.
- **Photos**: French sources summarising CNIL guidance say a **photo in the directory, even internal, needs the employee's agreement** (right to image), ideally written and revocable (per search summaries of https://www.inkivari.com/blog/…/trombinoscope-employe-consentement-ecrit-rgpd-28 and https://www.donneespersonnelles.fr/rgpd-photos-salaries; one DPO blog, https://www.dpo-partage.fr/…, argues consent is a myth — sources disagree). Design: each person uploads their own photo; initials avatar by default; admins cannot upload someone else's photo without that person accepting.
- **Birthdays**: date of birth is not needed for a directory; show only day/month and only if the person opts in (off by default). Opt-in is a per-person setting, reversible anytime.
- **Personal phone / address**: never mandatory; optional field visible to chosen audience only.
- **Former employees**: remove the card when the member leaves the Chest (platform event) and purge profile data after a set delay; keep the onboarding record only as long as needed. The 2026 CNIL HR retention référentiel (https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf, per search summary) should set exact durations — not read first-hand. Automatic purge needs the **scheduler primitive**; MVP: purge on the next admin visit or on member-removed hook.
- **Security**: the directory is team-only (`tools/private/`); never expose it on the public part; rate-limit CSV export; import validates emails and treats CSV cells starting with `=`, `+`, `-`, `@` as text on re-export (CSV injection).

## Sources
- https://github.com/frappe/hrms ; https://raw.githubusercontent.com/frappe/hrms/develop/license.txt ; https://raw.githubusercontent.com/frappe/hrms/develop/README.md ; https://github.com/frappe/hrms/releases.atom
- https://github.com/orangehrm/orangehrm ; https://raw.githubusercontent.com/orangehrm/orangehrm/main/LICENSE ; https://github.com/orangehrm/orangehrm/releases.atom
- https://github.com/horilla/horilla-hr ; https://raw.githubusercontent.com/horilla/horilla-hr/2.0/LICENSE ; https://raw.githubusercontent.com/horilla/horilla-hr/2.0/README.md ; https://github.com/horilla/horilla-hr/releases.atom
- https://github.com/gamonoid/icehrm ; https://raw.githubusercontent.com/gamonoid/icehrm/master/LICENSE ; https://github.com/gamonoid/icehrm/releases.atom
- https://github.com/bumbeishvili/org-chart ; https://raw.githubusercontent.com/bumbeishvili/org-chart/master/LICENSE.md ; https://raw.githubusercontent.com/bumbeishvili/org-chart/master/README.md
- https://github.com/dabeng/OrgChart ; https://raw.githubusercontent.com/dabeng/OrgChart/master/LICENSE
- https://github.com/BALKANGraph/OrgChartJS
- https://registry.npmjs.org/ (d3-org-chart, orgchart, d3-hierarchy, d3-flextree, papaparse, libphonenumber-js, vcards-js, date-fns)
- https://support.humi.ca/hc/en-us/articles/360024346314-Exporting-your-employee-data-from-Bamboo-HR (search summary)
- https://help.bamboohr.com/s/article/587751 (search summary)
- https://support.google.com/a/answer/7348070 (search summary)
- https://www.lucca.fr/actualites/poplee-lannuaire-interactif/ (search summary)
- https://support.lucca.fr/hc/fr/articles/115002415852-Configurer-un-export-des-donn%C3%A9es-modifi%C3%A9es (search summary)
- https://www.cnil.fr/fr/les-regles-pour-la-gestion-du-personnel (search summary)
- https://www.cnil.fr/sites/default/files/atoms/files/referentiel_grh_novembre_2019_0.pdf (search summary)
- https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf (search summary)
- https://www.inkivari.com/blog/le-quizz-hebdomadaire-d-inkivari-7/trombinoscope-employe-consentement-ecrit-rgpd-28 (search summary)
- https://www.donneespersonnelles.fr/rgpd-photos-salaries (search summary)
- https://www.dpo-partage.fr/faut-il-demander-le-consentement-des-salaries-pour-utiliser-leur-photo-en-interne-un-mythe-a-deconstruire/ (search summary)
