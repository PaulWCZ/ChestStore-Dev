# Leave (Congés) — severe critique

Tested 2026-09-29 (Paris) on `--prod --reset`, port 7200, as Hugo (employee), Inès (manager), Camille (HR), Nora (employee, FR, phone); dark; keyboard; empty data (tables truncated by hand: the harness has no `--empty`, `--reset` always loads the seed); a member removed through `/_dev`. Screenshots are in `critique/hr/shots/lv-*`.

## Verdict

**Can a 50-person French company cancel Lucca Absences / Factorial time off tomorrow? Not yet.** Asking and approving are better than Lucca: fast, clear, and the French public holidays are right. What stops a switch is the paid-leave counting behind the numbers. There is no split between leave already earned and leave still being earned (N-1 / N), no reference-period close, no work schedule for each person (part-time or a 4-day week), and accrual never stops for someone who has left. So the payroll accountant cannot trust the balance that ends up on the pay slip or the final pay (solde de tout compte).
**Completeness 5/10 · UX 8/10.**

## Blockers

1. **No "acquired / being acquired" (N-1 / N) split, and no year-end close.** Where: the balance model (`lib/balances.ts`, `compute()`) keeps one running `left` number, and the README says "days not taken … the balance simply continues". Why it matters: every French pay slip, and Lucca and PayFit, show *CP N-1 (acquis, à poser avant le 31 mai)* apart from *CP N (en cours d'acquisition)*. Employees ask "how many do I have to take before May?", payroll needs both numbers, and taking leave early (by anticipation) is a separate company decision. Fix: keep two buckets for each leave kind that has a reference period. On the period start date, earned-in-progress moves to acquired, with a ledger line "Fin de période" computed when read, so no job is needed. The card shows "12 à poser avant le 31 mai · 8,33 en cours". HR decides what happens to unused days: lost, carried over, or paid. Effort L.
2. **Accrual never stops for people who left.** Where: `compute()` earns from `since` to `on` with no end date. Seen: Inès, removed, still shows "14.75 left · 3 months × 2.08" on `/chest/people/mbr_ines…` (`lv-cam-former-…png`), and the number will keep growing every month. Why it matters: the paid-leave compensation in the final pay (indemnité compensatrice) comes from this number. Fix: an `end_date` on `staff`, set by `member.removed` / `access.revoked` (or by HR as "Last day"). Accrual stops there. Former people get an "Anciens" filter on People, showing their final balance and a "Solde de départ" CSV. Effort M.
3. **No work schedule for each person.** Everyone is Monday–Friday or Monday–Saturday at company level. Why it matters: a part-timer off on Wednesdays who asks for Monday–Friday is charged 5 working days. In jours ouvrés that is wrong, and in any case the calendar shows them "in" on their day off. 20–30 % of staff in SMEs work part-time or 4/5. Lucca and Factorial both have work cycles ("cycles de travail"). Fix: a weekly pattern for each person (checkboxes Mon–Sun, with half days), used by the cost counting, the calendar shading and accrual (part-time staff earn the same). Effort M.
4. **Migration from Lucca fails at the first column.** Seen: a Lucca-style file `Nom;Prénom;CP N-1;CP N;RTT` → "Colonnes non reconnues : Prénom, CP N-1, CP N" and both people "Personne de ce nom n'a Congés" (`lv-import-lucca.png`). Only "Nom complet;Congés payés;RTT" works. Also, **approved future leave cannot be imported**: every holiday already approved in Lucca for Christmas has to be typed in again, and **start dates** cannot be imported either (50 page visits). Fix: join `Nom`+`Prénom`; recognise `CP`, `CP N-1`, `CP N`, `Congés payés acquis`, `RTT` and similar headers; add a column-mapping step when a header is unknown; add a second import for approved requests (person, kind, first/last day, halves) and a `Date d'entrée` column. Effort M.

## Major

5. **Home and ask form show two different "left" numbers.** The home says "7.25 days of paid leave left" (`lv-hugo-_chest.png`); the ask form says "Paid leave 5.25 left" for the same balance (`lv-ask-holiday.png`), because it takes off pending days. In the shipped screenshots the numbers are 7.25 / 6.25. An employee thinks they lost 2 days. Fix: one definition everywhere. Show "7.25 left · 2 waiting" on the card and the same two numbers on the form's radio card. Effort S.
6. **"Balance after" on approval cards ignores the person's other pending requests.** Hugo's 8–9 Oct shows "Balance after 5.25" and his 9–13 Nov shows "3.25" at the same time; approving both leaves 1.25 (`lv-ines-approvals` output). A manager approves two requests they think are covered, and the second one takes the balance lower than shown. Fix: count earlier pending requests (by start date) in "balance after", or show "if all waiting requests are approved: 1.25". Effort S.
7. **"Coming up" is sorted furthest-first.** `lib/requests.ts:257` `order by start_date desc`. Seen: 9 Nov, then 12 Oct, then 8 Oct (`lv-after-send.png`). The next holiday, the one people care about, is at the bottom. Fix: sort ascending for upcoming requests and descending for earlier ones. Effort S.
8. **No iCal / Outlook / Google feed.** Lucca and Factorial both offer one. Managers plan meetings in Outlook, not in a separate grid. Fix: the SDK "per-member secret URL" proposal plus an `ics` feed ("my team's absences", "my absences"). Effort M (plus SDK).
9. **No email.** An approver who does not open the Chest never learns there is a request. This is the SDK mail proposal. Until it ships, say it on the tile and in the README. Effort (SDK).
10. **HR cannot record leave for someone.** The README says so: HR can only add an adjustment. Real cases: the warehouse worker without a computer, sick leave phoned in, retroactive corrections. Lucca lets a manager or HR enter an absence "pour le compte de". Fix: a "For" person picker on `/chest/new` for HR (and for approvers over their people), recorded as already approved. Effort M.
11. **HR has no first-run setup.** Empty tool as Camille: the same employee home, "Not set up yet. HR will enter your balance." (`lv-empty-cam-_chest.png`), and People shows "Not set" everywhere. HR is not told that *they* are HR, or what the three steps are. Fix: an HR banner "Set up Leave: 1. counting rule 2. import balances and start dates 3. approvers", with ticks. Effort S.
12. **Phone "Who's away" is one card per person per day.** Tom's one-week leave becomes 5 cards (`calendar-fr-phone.png`); with 50 people a month is hundreds of cards. The list also starts on the 1st, not today. Fix: one card per absence ("Tom Walker · lun 7 – ven 11 sept"), grouped by week, starting at today. Effort S.
13. **Calendar has only a month view and no "today" jump.** The phone view also has 2 rows of filter chips above the fold. Add a week view and a "Today" button. Effort S.
14. **No blackout periods, overlap warnings or minimum staffing.** "3 people from Sales already off" is in the research's "later" list. Managers of shops and small teams use it weekly. Effort M.
15. **Settings: each leave kind has its own Save button** inside one long page (`lv-hr-settings-bottom.png`). Change two kinds, save one, leave the page, and the other change is lost silently. Fix: one form with a sticky "Save changes", or autosave per field with a toast. Effort S.

## Minor

16. The "Earns leave since" field shows 06/09/2021 while the card says "3 months × 2.08 since 1 Jun 2026" (`lv-cam-former-…png`). Two dates, and the user cannot tell which one counts. Label the card "since the opening balance of 1 Jun 2026".
17. French: "Acquiert depuis le" (person page) is not natural; use "Date d'entrée" or "Acquisition depuis le". "Personne de ce nom n'a Congés" reads as broken; use "Aucun membre de ce nom n'a accès à Congés".
18. Two "Ask for time off" buttons on an empty home (the hero and the empty state).
19. The overbalance warning "That is 38.75 more than you have" does not stop 40-day requests; the tool offers no rule to limit early leave.
20. Unpaid leave and "Other absence" count working days and need approval, but "Other absence" has no sub-kinds for family events (congés pour événements familiaux: marriage 4 days, birth 3 days, death, PACS), which the law fixes. Ship them as default kinds with their legal amounts.
21. No telework (télétravail) kind. Many French companies use Lucca Absences to declare telework days. Add a "Télétravail" kind (not counted, no approval, shown as "Remote" in the calendar).

## Bugs

- B1 (Blocker 2) Accrual continues after departure. Steps: `/_dev` → member.removed for Inès → `/chest/people/mbr_ines…` → the balance keeps "3 months × 2.08" and will keep growing.
- B2 Initials of former members use "member)" as the surname: `lib/initials.ts` takes the last word of "Inès Moreau (former member)". Inès shows "IM" only by chance; any "Léa Dubois (former member)" shows "LM". Fix: compute initials before adding the suffix.
- B3 (Major 7) "Coming up" order.
- B4 (Major 5) Inconsistent "left".
- B5 Lucca-format import rejected (Blocker 4).

## Migration in / out

- **In:** balances only, and only in the tool's own column naming (`lv-import-simple` works, `lv-import-lucca` fails). No approved leave, no start dates, no history. For a Lucca customer, that means their Christmas bookings and the N-1 balance are typed in again by hand.
- **Out:** payroll CSV for each month (approved absences, split across months, FR/EN). It has no employee number (matricule), which Silae, PayFit and Sage import by. There is no balances export (the pay slip needs acquis, pris and solde for N-1 and N) and no full history export. Fix: add a `Matricule` field on staff and in the CSV, and a "Soldes au <date>" CSV.

## UX notes

Strong: 2 clicks to ask, a live cost with the holiday explained ("Wed 11 Nov is a public holiday: not counted"), 1-click approve with Undo, good empty state for employees, natural French in the main flows, clean dark mode, and a logical tab order on the home (skip link → nav → Ask → requests). Pages load in 0.6–1.1 s.
Weak: native date inputs with no range calendar showing holidays or colleagues who are already away (Lucca's picker shows both); numbers change meaning between screens; HR tools live under "People" (Import, Give days, Month, Payroll export are four buttons with a date picker between them, `lv-hr-*`); the phone month-list is unusable at company scale.

## Fix plan (ordered)

1. One definition of "left", with "balance after" counting other pending requests — S
2. "Coming up" ascending; phone calendar one card per absence, starting today — S
3. Stop accrual at departure; former members filter; departure balance CSV — M
4. N-1 / N buckets with period close and an HR choice for unused days — L
5. Work schedule for each person, used by counting and the calendar — M
6. Import: Nom+Prénom, CP N-1/N headers, a mapping step, approved-requests import, start dates — M
7. HR/manager records leave for someone — M
8. HR first-run checklist; settings single save — S
9. Matricule plus balances export — S
10. iCal feed and email (SDK proposals) — M
11. Default French family-event and telework kinds; overlap warning — S/M
12. Fix initials of former members — S
