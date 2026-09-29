# Leave — open-source research
_Read on 2026-09-28. Replaces: Lucca Absences (ex-Figgo), Factorial time off, PayFit absences, the shared leave spreadsheet._

## The job
An employee asks for days off ("Mon 3 → Fri 7, paid leave"), sees at once how many days it costs and what
is left, and gets a yes or no from their manager. Daily, 80 % of use is: "how many days do I have?",
"request days", "approve / refuse", "who is off this week?" on a team calendar, and — once a month —
the HR or office manager exporting the month's absences for payroll.

## Projects

### Jorani
| Field | Content |
|---|---|
| Project | Jorani, https://github.com/bbalet/jorani — ~411 stars; latest release "Security and PHP8.5 support" (v1.0.4), feed entry updated 2026-04-03 (https://github.com/bbalet/jorani/releases.atom); previous release v1.0.2 in 2023. 14 open issues. Slow, single-maintainer, but alive. |
| Licence | `MIT` — https://raw.githubusercontent.com/bbalet/jorani/master/LICENSE ("Copyright (c) 2012-2026, Benjamin BALET"). The v1.0.4 release notes say the licence was changed to MIT (it was AGPL before); only code from the MIT-licensed tree may be reused. |
| Reuse | **Code** (MIT, with attribution) — mostly its leave-balance logic and French/English translation strings as a vocabulary reference; PHP code does not transpose line by line. |
| Stack | PHP 8.1+ (CodeIgniter), MySQL 8. Data model (leave types, entitled days per period, leaves with half-day start/end, organisation tree, non-working days per contract) transposes cleanly to Postgres. |
| What it does best | Written by a French author for French SMEs: leave types with "entitled days" per contract and period; **half days** (start/end "morning/afternoon"); non-working days (weekends, public holidays) defined **per contract**; individual + team calendars; monthly presence report and balance report exportable to a spreadsheet; overtime requests with the same approval flow; 15 languages including French. |
| What to avoid | Dated Bootstrap UI with admin screens full of jargon; single-validator approval only (#240 asks for multi-step); open bugs on half-day entitlements and balance periods (https://github.com/bbalet/jorani/issues — #437 "Entitled days does not save half-days", #375 periods in `entitleddays`, #291 balance report). |

### TimeOff.Management
| Field | Content |
|---|---|
| Project | TimeOff.Management community edition, https://github.com/timeoff-management/timeoff-management-application — ~1.0k stars; no tagged releases; last commit 2024-01-30 ("Update default bank holidays (#574)"). 218 open issues. Effectively unmaintained. |
| Licence | `MIT` — https://raw.githubusercontent.com/timeoff-management/timeoff-management-application/master/LICENSE |
| Reuse | **Code** (MIT) — the only candidate on our stack (Node.js + Sequelize), but its code quality and security record make it a source of logic and UX ideas rather than code. |
| Stack | Node.js, Express, Handlebars, Sequelize, SQLite by default. Transposes to Node + Postgres directly. |
| What it does best | The simplest UX of the group: a **wall-chart team view** (one row per person, one column per day), calendar and list views; absence types with a colour and an optional per-type day limit; pro-rated allowance for people who join mid-year; public holidays + company days off; supervisor per department; iCal feed of absences for Outlook/Google; CSV export. |
| What to avoid | Security: open issues "Leave revoke workflow bypass + hardcoded session secret" (#587) and "whole project vulnerable to CSRF" (#563); carry-over from previous year broken (#572); bank holidays missing from team view (#571) — https://github.com/timeoff-management/timeoff-management-application/issues. Email is the only notification channel. |

### Frappe HR (leave module)
| Field | Content |
|---|---|
| Project | Frappe HR / HRMS, https://github.com/frappe/hrms — ~8.8k stars (as read on the repo page); v16.20.0 released 2026-09-23 (https://github.com/frappe/hrms/releases.atom). Very active. |
| Licence | `GPL-3.0` — https://raw.githubusercontent.com/frappe/hrms/develop/license.txt |
| Reuse | **Ideas only** |
| Stack | Python, Frappe framework, MariaDB; tightly coupled to ERPNext. Does not transpose. |
| What it does best | Leave **policies** (a named bundle of leave types + yearly allocation) assigned to groups of employees; **earned leave** allocated monthly (our 2.5 days/month); carry-forward with a maximum; compensatory leave for days worked on holidays; a **Holiday List** you fill "with a click" from regional holidays; leave ledger (every change to a balance is a line — the right model for audit). |
| What to avoid | ERP vocabulary (doctypes, allocations, ledger entries, encashment) and dozens of fields per form; needs an HR expert to configure. Recent fix restricting who can read leave applications (v15.64.2 notes) shows permission leaks are a real risk in this domain. |

### OrangeHRM (leave module)
| Field | Content |
|---|---|
| Project | OrangeHRM Starter, https://github.com/orangehrm/orangehrm — ~1.1k stars; OrangeHRM 5.9 released 2026-06-28 (https://github.com/orangehrm/orangehrm/releases.atom). Active, open-core (paid "Advanced" edition). |
| Licence | `GPL-3.0` — https://raw.githubusercontent.com/orangehrm/orangehrm/main/LICENSE |
| Reuse | **Ideas only** |
| Stack | PHP (Symfony components) + Vue front-end, MySQL/MariaDB. |
| What it does best | Classic HRIS leave module: leave periods, entitlements per type, "assign leave" by an admin on behalf of an employee, leave list with status filters, work-week and holiday configuration, half-day and specific-time requests; 5.9 adds Slack/Google Chat notifications. |
| What to avoid | Enterprise form-heavy UX (menus "Leave > Entitlements > Add Entitlements"); a leave request takes several screens. |

### IceHrm (for the record — not usable)
| Field | Content |
|---|---|
| Project | IceHrm, https://github.com/gamonoid/icehrm — stars not verified. |
| Licence | **Elastic License 2.0** (not open source) — https://raw.githubusercontent.com/gamonoid/icehrm/master/LICENSE ("Copyright (c) Ice Hrm Pty Ltd … Elastic License 2.0 (ELv2)"). Search results still describe it as GPLv3; the repository says otherwise. Per search result (not read first-hand, https://icehrm.com/icehrm-open-source), the leave module is only in the paid Pro/Enterprise editions. |
| Reuse | **Ideas only** — nothing to take. |
| Stack | PHP, MySQL. |
| What it does best | n/a |
| What to avoid | Licence change and open-core gating of exactly the module we need. |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| "My balance" card: days left per type, big number, "request days" button | MVP | Lucca, TimeOff.Management | First screen of the tool. |
| Request: pick dates on a calendar, half-day start/end, type, optional note; shows "costs 4 days, 21 left" before sending | MVP | Jorani (half days), Lucca | Cost computed server-side with the company's counting rule and holidays. |
| Approve / refuse by the member's manager, with a one-line reason | MVP | all | Manager = a platform role/group; **needs the SDK to say who manages whom** (group "managers of X" or a manager attribute) — propose in SDK if missing. |
| Cancel a request (by employee before start; by manager/HR after) | MVP | TimeOff.Management (#587 shows the risk) | Every change writes a ledger line. |
| Team calendar ("who is off"): wall chart, one row per member, week/month | MVP | TimeOff.Management | Visible to the team; the **type** is shown only to the person, their manager and HR ("Absent" for others) — privacy. |
| Leave types: paid leave (CP), RTT, unpaid, sick leave, family events, other; colour; counted or not | MVP | Frappe HR, TimeOff.Management | Sick leave is recorded as an absence without any medical detail. |
| Counting rule per company: working days (jours ouvrés, Mon–Fri) or *jours ouvrables* (Mon–Sat) | MVP | French law (L3141-3) | Default: jours ouvrés, 25 days/year. |
| French public holidays computed per year, Alsace-Moselle option (Good Friday, 26 Dec) | MVP | Frappe HR "pull regional holidays", date-holidays | Holidays are not deducted. Company can add "company days off" (e.g. bridge days). |
| Accrual: 2.5 jours ouvrables (≈2.08 ouvrés) per month worked, reference period 1 June–31 May, "acquired / being acquired" shown separately | MVP | French law, Lucca UI | Computed on read (no cron needed): balance = opening + months elapsed × rate − taken. |
| Manual adjustment by HR (opening balance, correction, sick-leave accrual at 2 days/month) with a reason | MVP | Frappe HR ledger | This is how the 2024 sick-leave rule is applied in MVP (HR enters it). |
| Import opening balances from CSV (member email → type → days) | MVP | Jorani, spreadsheet users | Lucca/Factorial/PayFit export formats are not public (not verified); a simple template CSV is the realistic path. Emails matched to `mbr_` ids via the SDK, never stored. |
| Monthly export for payroll (CSV: member, type, start, end, days) | MVP | Jorani, TimeOff.Management | The payroll provider (PayFit, accountant) re-keys or imports it. |
| Notification to the manager on a new request, and to the employee on decision | MVP | all | Through the Chest shared inbox; **email is a missing primitive** (SDK proposal). |
| iCal feed of team absences (Outlook, Google Calendar) | later | TimeOff.Management | Needs a per-member secret URL token from the SDK. |
| RTT allocation (fixed N days per year, per group) and forfait-jours count (218 days) | later | Lucca, French practice | RTT rules come from each company's collective agreement — configurable yearly amount only. |
| Automatic sick-leave accrual (2 days/month, cap 24) and carry-over of 15 months with the legal notice to the employee | later | Loi 2024-364 | Needs sick-leave dates entered reliably; see legal notes. |
| Fractionnement days (+1 / +2) | later | L3141-23 | Often waived by agreement; compute and suggest, HR confirms. |
| Leave taken during sick leave → deferral | later | Cass. soc. 10 Sept 2025 | HR action "sick during leave": converts days back to balance. |
| Multi-step approval, delegation during manager's absence | later | Jorani #240, Frappe HR | |
| Overlap warning ("3 people from Sales already off") | later | TimeOff.Management #575 | Warning only, never a block. |
| Year-end reminders ("you still have 8 days to take before 31 May") | later | Lucca | Needs **scheduled jobs** (SDK proposal). |
| Attachments (sick note) | never (MVP) / later | Jorani #308 | Health data: better kept with payroll; if added, via the Chest file API, visible to HR only. |
| Payroll integration (DSN, PayFit API), leave encashment, overtime banking, shift planning | never | Frappe HR, OrangeHRM | Long tail; leave to forks. |

## Reusable pieces
- **French public holidays**: the computation is small (Easter by the anonymous Gregorian / Meeus–Jones–Butcher algorithm, then Easter Monday +1, Ascension +39, Whit Monday +50; fixed dates 1 Jan, 1 May, 8 May, 14 Jul, 15 Aug, 1 Nov, 11 Nov, 25 Dec; Alsace-Moselle adds Good Friday −2 and 26 Dec). We should write it ourselves (~40 lines, tested) rather than depend on:
  - `@socialgouv/jours-feries` 2.0.0 — `Apache-2.0`, supports `{ alsace: true }`, but last published 2020-05-11 and returns local-time `Date` objects (timezone trap) — https://registry.npmjs.org/@socialgouv/jours-feries (tarball read). Copying its code with attribution is allowed.
  - `date-holidays` 3.37.0 (2026-09-20) — code `ISC`, but its holiday data `holidays.yaml` is `CC-BY-SA-3.0` (share-alike) — https://raw.githubusercontent.com/commenthol/date-holidays/master/LICENSE. Usable as a dependency; heavy for one country.
  - Official source to test against: `calendrier.api.gouv.fr/jours-feries/{zone}/{year}.json` (Etalab API; not reachable from this environment — not verified today). We must not call it at runtime (no outbound network).
- `date-fns` 4.4.0 — `MIT` (npm registry, 2026-05-29): day arithmetic, week boundaries. Or `temporal-polyfill` 1.0.5 — `MIT` (2026-09-11): `Temporal.PlainDate` avoids timezone bugs for all-day dates (preferred: leave dates are dates, not instants).
- `csv-parse` 7.0.3 — `MIT` (2026-09-25) or `papaparse` 5.7.0 — `MIT` (2026-08-24): balance import.
- `ics` 3.12.0 — `ISC` / `ical-generator` 11.1.1 — `MIT`: iCal feed (later).
- `@fullcalendar/core` 7.1.0 — `MIT` (2026-09-05): only if the team wall chart gets too complex to draw ourselves (a CSS grid is probably enough).

## Legal and security notes
- **Acquisition**: 2.5 *jours ouvrables* per month of actual work, total capped at 30 jours ouvrables (5 weeks) — Code du travail art. L3141-3 (per search result, https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020826; Légifrance is not reachable from this environment). Reference period by default 1 June – 31 May (per search results; a collective agreement may set another, e.g. the calendar year).
- **Ouvrables vs ouvrés**: *jours ouvrables* = every day except the weekly rest day (Sunday) and public holidays not worked → Saturday counts; *jours ouvrés* = days the company works (usually Mon–Fri) → 25 days a year. Counting in jours ouvrés must never give the employee less than counting in jours ouvrables (e.g. a public holiday falling on a Saturday). A public holiday that is not worked is never deducted (per search results: https://www.juritravail.com/Actualite/decompte-du-nombre-de-jours-de-conges-payes-les-jours-ouvrables-et-les-jours-ouvres-comment-faire/Id/2161, https://support.luccasoftware.com/s/article/samedi-f%C3%A9ri%C3%A9-et-son-impact-sur-le-d%C3%A9compte-des-cong%C3%A9s-pay%C3%A9s?language=fr). The tool stores balances in the company's unit and shows the unit.
- **Main leave and fractionnement**: 12 continuous jours ouvrables must be taken between 1 May and 31 October; +2 days if ≥ 6 days are taken outside that window, +1 if 3–5 (only the first 24 days count) — art. L3141-23 (per search result, https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020705).
- **Sick leave (loi n° 2024-364 of 22 April 2024, "DDADUE", art. 37)**: since 24 April 2024 a non-work-related sick leave earns **2 jours ouvrables per month, capped at 24 per reference period**; a work accident / occupational illness earns the normal 2.5 days with no one-year limit; leave that could not be taken because of illness can be **carried over for 15 months**; the employer must inform the employee of their balance and deadline within one month after return. Retroactive to 1 December 2009 for non-work-related illness, subject to the 3-year wage prescription (art. L3245-1) — per search results: https://entreprendre.service-public.gouv.fr/actualites/A17308, https://kleinwenner.eu/actualites/analyse-juridique/conges-payes-et-arret-maladie-la-loi-n2024-364-met-en-conformite-le-droit-francais-avec-le-droit-de-lue/, https://www.lemondedudroit.fr/decryptages/99410-conges-payes-et-arret-maladie-professionnelle-pas-de-retroactivite.html. The service-public.fr page itself could not be opened (egress blocked); a 2-year claim window for employees still employed is often quoted but was **not verified**.
- **Sick during paid leave**: Cour de cassation, 10 Sept 2025, n° 23-22.732 — an employee who falls sick during paid leave and notifies the employer can have the overlapping days deferred (per search result, https://www.courdecassation.fr/decision/68c13314021d8d629a161218).
- **RTT**: exist only through a collective agreement (company or branch), which sets the number of days, who chooses the dates, and what happens to days not taken; forfait-jours cap 218 days/year (per search results: https://www.lucca.fr/magazine/administration/conges-et-absences/rtt-forfait-jours, https://www.legalplace.fr/guides/rtt/). The tool therefore makes RTT a configurable type, never a computed legal right.
- **Public holidays**: 11 in the Code du travail (art. L3133-1); Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle) adds Good Friday and 26 December (art. L3134-13) — per search results (https://www.metz-metropolitain.fr/beneficie-jours-feries-alsace-moselle.html, https://www.senat.fr/questions/base/2023/qSEQ23040608S.html). Only 1 May is compulsorily not worked; which holidays the company does not work (and the "journée de solidarité") is a company setting. Overseas departments have an extra abolition-of-slavery day with a different date per territory — later, not verified.
- **GDPR / health data**: the tool must not store the reason or diagnosis of a sick leave (art. 9 GDPR special category). The type of absence is visible only to the employee, their manager and HR; colleagues see "Absent". Retention: follow the CNIL HR retention referential published 2 April 2026 (https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf — per search result, PDF not opened). Payroll-related absence data is typically kept for the wage prescription (3 years) — confirm against the referential before shipping.
- **Security**: identity only from `member(request)`; approval must check server-side that the approver manages the requester (TimeOff.Management #587 is exactly this bug); every balance change is an append-only ledger line with author `mbr_…` and timestamp; CSRF protection on all mutations (TimeOff.Management #563).

## Sources
- https://github.com/bbalet/jorani · https://github.com/bbalet/jorani/releases.atom · https://raw.githubusercontent.com/bbalet/jorani/master/LICENSE · https://github.com/bbalet/jorani/issues
- https://github.com/timeoff-management/timeoff-management-application · https://raw.githubusercontent.com/timeoff-management/timeoff-management-application/master/LICENSE · https://github.com/timeoff-management/timeoff-management-application/commits/master · https://github.com/timeoff-management/timeoff-management-application/issues
- https://github.com/frappe/hrms · https://github.com/frappe/hrms/releases.atom · https://raw.githubusercontent.com/frappe/hrms/develop/license.txt
- https://github.com/orangehrm/orangehrm · https://github.com/orangehrm/orangehrm/releases.atom · https://raw.githubusercontent.com/orangehrm/orangehrm/main/LICENSE
- https://raw.githubusercontent.com/gamonoid/icehrm/master/LICENSE · https://icehrm.com/icehrm-open-source (search result)
- https://registry.npmjs.org/@socialgouv/jours-feries · https://registry.npmjs.org/date-holidays · https://raw.githubusercontent.com/commenthol/date-holidays/master/LICENSE
- https://registry.npmjs.org/date-fns · https://registry.npmjs.org/temporal-polyfill · https://registry.npmjs.org/csv-parse · https://registry.npmjs.org/papaparse · https://registry.npmjs.org/ics · https://registry.npmjs.org/ical-generator · https://registry.npmjs.org/@fullcalendar/core
- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020826 (L3141-3, search result) · https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020705 (L3141-23, search result)
- https://entreprendre.service-public.gouv.fr/actualites/A17308 (search result) · https://kleinwenner.eu/actualites/analyse-juridique/conges-payes-et-arret-maladie-la-loi-n2024-364-met-en-conformite-le-droit-francais-avec-le-droit-de-lue/ · https://www.lemondedudroit.fr/decryptages/99410-conges-payes-et-arret-maladie-professionnelle-pas-de-retroactivite.html · https://pro.apicil.com/prevoyance/arret-maladie-et-conges-payes/
- https://www.courdecassation.fr/decision/68c13314021d8d629a161218 · https://www.village-justice.com/articles/conges-payes-arrets-maladie-heures-supplementaires-deux-arrets-septembre-2025,55004.html
- https://www.juritravail.com/Actualite/decompte-du-nombre-de-jours-de-conges-payes-les-jours-ouvrables-et-les-jours-ouvres-comment-faire/Id/2161 · https://support.luccasoftware.com/s/article/samedi-f%C3%A9ri%C3%A9-et-son-impact-sur-le-d%C3%A9compte-des-cong%C3%A9s-pay%C3%A9s?language=fr
- https://www.lucca.fr/magazine/administration/conges-et-absences/rtt-forfait-jours · https://www.legalplace.fr/guides/rtt/
- https://www.metz-metropolitain.fr/beneficie-jours-feries-alsace-moselle.html · https://www.senat.fr/questions/base/2023/qSEQ23040608S.html
- https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf (search result)

Note: service-public.fr, legifrance.gouv.fr, urssaf.fr and most French sites are blocked by this environment's egress policy; every French-law statement above comes from search-result summaries and must be re-checked against Légifrance before the tool ships.

## Addendum 2026-09-29 — rules re-read for the fix after the critique

Read on 2026-09-29 through search-result summaries (service-public.fr,
legifrance.gouv.fr, code.travail.gouv.fr and lucca.fr are still blocked by
the network egress policy; nothing below was read first-hand):

- Part-time paid leave is counted like full time: from the first day the
  person would have worked to the last jour ouvrable before they are back
  (a Monday–Wednesday worker off 20–22 October, back 27 October, is charged
  6 days) — https://www.ghr.fr/social/actualites/conges-payes-des-salaries-a-temps-partiel-piqure-de-rappel-sur-le-decompte,
  https://www.skello.io/blog/decompte-des-conges-payes-a-temps-partiel,
  https://www.l-expert-comptable.com/a/532462-les-conges-payes-des-salaries-temps-partiel.html.
- Reference period 1 June N-1 – 31 May N, 2.5 jours ouvrables a month, leave
  open from hiring — https://www.service-public.gouv.fr/particuliers/vosdroits/F2258?lang=en (summary),
  https://www.urssaf.fr/accueil/particulier/particulier-employeur/gerer-les-absences/gestion-conges-payes.html.
- Unused days are lost in principle unless the person could not take them
  or an agreement carries them over; paid only at the end of the contract —
  https://www.legisocial.fr/actualites-sociales/7953-jours-conges-pris-31-mai-2026.html,
  https://www.juritravail.com/Actualite/report-des-conges-payes-motifs-delai-demarches/Id/378240.
- Family events (art. L3142-4): wedding/PACS 4, birth/adoption 3, death of a
  child 12 (14 under 25), spouse 3, child's disability or cancer 5, counted
  in jours ouvrables in principle — https://code.travail.gouv.fr/code-du-travail/l3142-4,
  https://code.travail.gouv.fr/contribution/les-conges-pour-evenements-familiaux.
- Lucca's absence import/export columns: employeeNumber, lastName,
  firstName, accountId, startDate (DD/MM/YYYY), flagStartDate (AM/PM),
  endDate, flagEndDate, isApproved — https://developers.lucca.fr/api-reference/legacy/timmi-absences/imports/import-leaves
  (summary). Lucca's balance counters (Acquis, Pris, Solde, Congés payés
  N-1) — https://support.luccasoftware.com/s/article/configurer-un-export-paie-dans-lucca-absences?language=fr
  (summary); the exact CSV headers of a balances export are not public.
