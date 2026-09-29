# People (Équipe) — severe critique, round 2

Tested 2026-09-29 on `--prod --reset` and `--prod --reset --empty`, port 7200. Roles and people used:
- Camille (HR), Hugo (member), and Nora (member, French, phone), each reading her own HR record;
- Hugo trying to open HR routes;
- member.removed of a manager (Inès);
- a BambooHR-style CSV import.

Every screen was also checked in five looks (own, Chest, sample brand, High contrast dark, Confetti), in light and dark, on a phone, and with the keyboard. Scripts and screenshots are in `critique2/hr/` (`pp*.mjs`, `shots/pp-*`).

## Verdict

**Can a 50-person French company cancel BambooHR / Lucca Core HR (Poplee) tomorrow? Not yet — but the round-1 "No" is gone.** People now has a real employee record:
- contract, trial period, emergency contact and documents;
- the *registre unique du personnel*, printable and as a CSV, including people without the Chest (warehouse staff, interns);
- an HR-only journal;
- alerts for trial and fixed-term contract ends;
- headcount and turnover figures;
- editing as a table, custom fields, and manual arrivals.

For a small French company this covers the legal core, and it does it more simply than Lucca. What still stops a switch:
- a register that silently leaves out employees without a record;
- a Numbers page whose figures disagree with each other;
- no encryption at rest and no role the builders don't get. An HR buyer will ask about both, and only the SDK can answer.
- No document generation or e-signature, which BambooHR and Factorial customers use for every contract amendment.

**Completeness 4 → 7 /10 (as an HR record; 8 → 9 as a directory) · UX 8 → 8.5 /10.**

Strength (one line): the directory, org chart and "has left" handling are the best of the store. A leaving manager's reports are kept in the chart and flagged, and are not dropped.

## Round-1 findings

| # | Round 1 | Now |
|---|---|---|
| B1 | No employee record or staff register | **Fixed.** HR records (identity, contract, qualification, trial end, planned end, emergency contact, documents through `files`), the register ordered by hire date with mentions (CDD, part time, seconded with the employer's address, interns in their own part), print and CSV. The person reads their own record (Nora on a phone, read-only). Hugo gets **404** on another person's record, `/records`, the register, the CSV, `/numbers`, `/table` and `/import`. |
| B2 | No arrival without Hiring | **Fixed.** "Expected arrival" (Marc Lefèvre, "Added by HR"), with *Link* when the member appears. |
| B3 | No work email | **Fixed.** `members.email` (proposal) on the profile, with a mailto link. |
| M4 | No bulk editing | **Fixed.** *Edit as a table* saves each cell when you leave it, with Undo. The manager column is a native select (acceptable in a table). A long job title is cut ("Account manag"). |
| M5 | A departing manager's reports fall out of the chart | **Fixed.** A dashed "Inès Moreau · Has left · Choose a new manager" card keeps Hugo and Nora in place. The bell tells HR, in each HR person's language, to choose a manager and write the last day. |
| M6 | BambooHR import broken | **Mostly fixed.** "Employee #" is ignored, First and Last Name are joined, "Reporting to" and "Hire Date" are read, and month/day/year is detected. **But** unknown columns ("Division", "T-Shirt Size") are dropped silently: see N3. |
| M7 | No custom fields | **Fixed** (text only; 20 at most; filled by the person or by HR only). |
| M8 | Checklist steps in one language | **Fixed.** Nora sees "Remplir votre profil dans Équipe". |
| M9 | Steps never complete themselves | **Partly.** The profile step ticks itself. "Return the laptop" still needs an Equipment event (platform). |
| M10 | No reports | **Partly.** Numbers exist, but they are inconsistent (N2). |
| Minors | Phone nav icon-only, "Nobody matches" twice, phone apostrophe, colon spacing | **Fixed** where checked: the phone tabs have labels (Annuaire / Organigramme / Mes tâches), and the export writes phones as they are. The chart stubs were not re-checked. |

## Still blocking (what a BambooHR / Lucca Core HR customer misses)

1. **No encryption at rest, and the builders read records.** Birth dates, nationality, work permit numbers and home addresses sit in plain text in the tool's database and backups. Whoever builds the tool gets `hr`, so they can read them. The README is honest about it, but a CNIL-aware HR buyer will stop here. Platform: `secrets.seal/open` and "a role never given by default".
2. **No documents from templates and no e-signature.** Work certificates, contract amendments, the end-of-contract certificate (*attestation employeur*) and the *certificat de travail* are generated weekly in Factorial and Lucca. Here HR writes them in Word and uploads the PDF.
3. **No history of job and contract changes as data.** The journal names the fields, never the values. So "what was her job title in 2024, when was she moved to part time?" cannot be answered, and the register is only today's state (the README admits it). Lucca keeps dated contract amendments.
4. **Custom fields are text only** (no date, no choice list). "Medical visit date" (the *visite d'information et de prévention*), which French HR tracks, cannot raise an alert.

## New problems found this round

- **N1 — Legal: the register silently omits employees without an HR record.** Seed: Hugo (employee since Oct 2023) has no record. The records page says "1 person in the directory has no HR record", but the **register** page only says "1 person lacks details the register needs" (Tom's qualification), and Hugo is absent from it. An HR person who prints the register for a labour inspector hands over an incomplete legal document without being warned. Fix: on the register (screen, print and CSV), add "1 person works here without a record: Hugo Bernard — create it", and block "Print" behind that warning, or print it as a line marked "record missing".
- **N2 — Numbers disagree.** The headline says "7 People" (directory members), "By team" adds up to 7, but "By contract" adds up to 8 (CDI 5, CDD 1, internship 1, seconded 1). The register lists 8 employees plus 1 intern, and Hugo has no record. After Inès left, the headline is 6 while "By contract" still counts her. Turnover divides by "headcount a year ago" from records. Pick one population, "people employed" (records plus members without a record), and say it.
- **N3 — The import still drops unknown columns silently.** The mapping step exists, but it sits folded under "Columns found: …". That summary lists only the recognised columns, and the fold is closed when nothing is *missing*. Division and T-Shirt Size vanish without a word, which was round 1's CRM complaint. Leave does it right: it asks "Some columns are not recognised: what do they hold?". Fix: open the step, or add "2 columns left out: Division, T-Shirt Size — send them to an extra field?".
- **N4 — Printed legal documents carry the app's suffix.** The intern's tutor in the register reads "Inès Moreau (former member)". A register should show the name. The tool should also flag "tutor has left: name a new tutor" (an intern needs one).
- **N5 — Small data-display slips:**
  - "Temps plein · 35" on the record, with no "h";
  - the import preview shows start dates as ISO ("2023-10-03") in the English UI;
  - the French bell uses the point médian ("marquée « parti·e »"), which many SMEs' HR do not write. This is a house style decision to make once, store-wide.
- **N6 — Empty tool, HR first visit:** HR sees the member's own "Complete my profile" card, not a setup path ("Import your team · Edit as a table · Create their 7 records"). Leave and Expenses both have a first-run checklist now, so People is the odd one out.
- **Looks:** nothing broken in own, Chest, brand (light, dark, phone), High contrast dark or Confetti. One borderline pair: "Choose a new manager" on the chart in the sample brand measures 4.47:1, just under AA 4.5:1.
- **Coherence:** on sub-pages (records, import) the active tab turns into a pale mauve pill with white text, which is weaker than the plum of the top pages. It reads as "disabled".

## Platform-dependent

- **Sealed fields** (`secrets.seal/open`) and **a role not given to builders**: the only real answers to "who can read our employees' addresses?".
- **Events between tools:** Equipment's "everything back" ticks the return step; People → Leave `people.leaving` sets Leave's last day.
- **Email:** a welcome message before day 1; reminders to step owners who never open the Chest.
- **A Chest-wide audit journal** the owner reads.

## Top 3 fixes now

1. **The register never hides a missing employee.** Warn on screen and in the print for every member without a record, and every record without an entry date. Name the tutor-has-left case. **S.**
2. **One population for Numbers:** people employed = records plus members without a record, minus those who left. The headline, by team, by contract and turnover all use it, and each figure says what it counts. **S.**
3. **The import states what it leaves out** (open the mapping step whenever a column is unrecognised, as Leave does). Add **date and choice extra fields**, with an alert on a date field (medical visit, badge expiry). **S / M.**
