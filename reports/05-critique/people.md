# People (Équipe) — severe critique

Tested 2026-09-29 on `--prod --reset`, port 7200 (built by me, `.next` removed after): Hugo (member), Camille (HR), Nora (member, FR, phone); search; a leaving checklist; member.removed of a manager; Lucca and BambooHR CSV imports; empty data (tables truncated by hand). Screenshots are in `critique/hr/shots/pp-*`.

## Verdict

**Can a 50-person company cancel BambooHR / Factorial / Lucca Poplee tomorrow? No. It can cancel the Notion "who's who" page and the onboarding spreadsheet.** People is a lovely directory and org chart with good arrival and departure checklists. But BambooHR, Factorial and Lucca Core HR are sold as the **employee record**: contract, salary history, documents, emergency contacts, and in France the legally required staff register (*registre unique du personnel*). People deliberately stores none of it. The store tile must not say it "replaces BambooHR", or the buyer will feel misled. Say "replaces the directory, org chart and onboarding parts", which is what the README says, and add the missing record fields, or plan a separate "Dossier salarié" tool.
**Completeness 4/10 as a BambooHR replacement (8/10 as a directory) · UX 8/10.**

## Blockers (for the claim "cancel BambooHR / Factorial")

1. **No employee record.** Missing: contract type (CDI/CDD/alternance), end of trial period (période d'essai), working time, salary and its history, personal address, emergency contact, date of birth, nationality, social security number. The staff register (registre unique du personnel) is mandatory in France, and Lucca and Factorial produce it. Fix: either (a) a clearly separate, HR-only "Dossier" tab with restricted fields, encrypted at rest, with an audit log, the register CSV and alerts (end of trial period, CDD end); or (b) remove "BambooHR, Factorial" from the positioning and name the tool "Annuaire". Decide before launch. Effort L (a) / S (b).
2. **HR cannot prepare an arrival without the Hiring tool.** An arrival (someone not yet a Chest member) exists **only** from `hiring.hired` events. A company that hires through LinkedIn and email cannot record "Lucie joins on 2 Nov" and start the checklist before day 1, which is the core onboarding job. Fix: "+ Expected arrival" on Checklists (name, job, team, manager, start date), the same object the Hiring event creates. Effort S.
3. **No work email in the directory or profile.** The profile has a phone button only (`pp-hugo-_chest_people_mbr_ines….png`), because the Chest gives no addresses. The first thing people look up in a directory is the email. Fix: an SDK proposal `members` with `email` for tools that declare `members:email` (the Leave README already wishes for email), then a *Write* button next to *Call*. Until then, a "Work email" profile field that HR imports. Effort S (field) / SDK.

## Major

4. **No bulk editing for HR.** With an empty tool (`pp-empty-cam-_chest.png`), setting job, team, manager and office for 50 people means 50 profile edits, or building a CSV. BambooHR and Lucca have a table view. Fix: an HR "Edit as a table" view (person rows; job, team, manager, office, start date as inline cells; autosave). Effort M.
5. **A departing manager's reports fall out of the chart.** After member.removed for Léa, Tom goes to "Not in the chart yet" (`pp-after-lea2-_chest_chart.png`) and her checklist steps become "Nobody yet" (`pp-after-lea2-_chest_checklists_2.png`). HR is told in the bell, but a 50-person chart silently loses a branch. Fix: on a manager's departure, move their reports to the manager's own manager (Camille) and say so in the bell ("Tom now reports to Camille — change"), and send the "their manager" steps to that person. Effort S.
6. **BambooHR's export does not import.** "First Name, Last Name, Reporting to, Hire Date" with an "Employee #" first column: the ID is taken as the name → "1 — Personne de ce nom ici", and "Reporting to" is not recognised (`pp-import-bamboo.png`). The README names BambooHR's report as supported. Fix: recognise `First Name`+`Last Name`, `Reporting to`, `Supervisor`, `Hire Date`, `Employee #` (ignored); add a column-mapping step for unknown headers; ask for the date order when it is ambiguous and the source is US (10/03/2023 was read day-first). Lucca's `Nom;Prénom;…;Date d'entrée` works (`pp-import-lucca.png`). Effort S.
7. **No custom fields.** Languages spoken, desk, T-shirt size, LinkedIn, Slack handle. BambooHR customers use them, and the README lists them as "not yet". A small list of HR-defined text fields would cover 90 %. Effort M.
8. **Checklist step texts are single-language.** Nora (FR) sees "Fill in your profile in People" and "Read the handbook" in English (`pp-nora-fr-phone-_chest_todo.png`). Templates made by the "two examples in one click" should be created in HR's language at least, ideally with an EN/FR text for each step. Effort S.
9. **Steps never complete themselves.** "Fill in your profile" stays late even after Nora fills her profile; "Return the laptop" is not linked to Equipment's take-back. Fix: an auto-tick for the profile step; an Equipment "all taken back" event ticking the return step (SDK events). Effort S / M.
10. **No reports.** Headcount by team or office, arrivals and departures per month, turnover. HR needs these every month, and every SaaS it replaces has them. Effort M.

## Minor

11. The phone top navigation is icons only (people, tree, checklist) with no labels (`pp-nora-fr-phone-*.png`). Add labels or a bottom bar like the other tools.
12. Search with no result shows "Nobody matches" twice (heading plus a duplicated live region, seen in the text dump for "invoic").
13. The CSV export prefixes phones with `'` (`'+33 6 98 …`) to block formulas. That corrupts the data for anything but Excel, and the round-trip adds the quote again. Only escape `=`, `@`, and `+`/`-` when followed by a non-digit, or quote the field.
14. French typography: "Colonnes trouvées:" needs a narrow no-break space before the colon (" :").
15. Org chart connectors: short stray vertical stubs at the right end of each sibling bar (`pp-hugo-_chest_chart.png`, x≈944 and x≈536).
16. "Joins on Saturday 10 October" — the arrival start date accepts a weekend without a hint (seed data, but the form should warn).

## Bugs

- B1 (Major 6) BambooHR export: ID column taken as the name; "Reporting to" ignored; US dates read day-first.
- B2 (Minor 12) Duplicated "Nobody matches".
- B3 (Minor 13) Export corrupts phone numbers with a leading apostrophe.
- (My own mistake, not the tool's: a malformed member id sent from `/_dev` got a correct 401.)

## Migration in / out

- **In:** a CSV of name plus title, team, manager, phone, office and start date. Lucca's format works; BambooHR's does not. No photos (the Chest's), no custom fields, no documents.
- **Out:** a directory CSV that round-trips (apart from the phone quoting). There is no export of checklists or their history.

## Trust

Good: no sensitive data stored, birthdays opt-in, a departed profile kept 30 days, undo on ticks. Missing for an HR buyer: an audit log of who changed a manager or title, and field-level visibility (for example, hide the phone from everyone except the team).

## UX notes

Strong: the portrait wall with instant search on name, job and topics ("CRM" finds Hugo), the "Say hello to Nora" welcome, a readable org chart, and a checklist that is clear and dated with owners. Natural French ("Toute l'équipe", "Présentez-vous en quelques mots"). Pages load in 0.6–0.9 s.
Weak: HR setup at scale (Major 4); the phone navigation.

## Fix plan (ordered)

1. Decide the positioning (directory vs employee record); if the record, the HR-only Dossier plus the staff register — S / L
2. Manual expected arrival — S
3. Work email (profile field now, SDK later) — S
4. Import: BambooHR headers, a mapping step, date-order question; fix phone escaping — S
5. Reassign reports to the next manager up — S
6. HR table editing — M
7. Localised example templates; auto-tick the profile step — S
8. Custom fields; headcount and turnover reports — M
9. Phone nav labels; duplicate empty text; French colon spacing; chart stubs — S
