# Leave (Congés) — severe critique, round 2

Tested 2026-09-29 on `--prod --reset` and `--prod --reset --empty`, port 7200. Roles used: Hugo (employee), Inès (manager), Camille (HR) and Nora (employee, made part-time Mon–Wed). Also checked: phone 390 px, French, dark, keyboard, and five looks (own, Chest, sample brand, High contrast dark, Confetti), each in light and dark. Other checks: a member removed through `/_dev`, a Lucca balances import, a Lucca absences import, and both payroll CSVs fetched. Scripts and screenshots are in `critique2/hr/` (`lv*.mjs`, `shots/lv-*`).

## Verdict

**Can a 50-person French company cancel Lucca Absences / Factorial time off tomorrow? Not yet, but it is close.** What changed since round 1:
- the paid-leave counting a payroll accountant must trust: N-1 / N, the end of the year, accrual that stops on the last day, each person's working week (with the correct rule for part-time staff), a balances file for the final pay;
- a Lucca migration that works: I tested it, and both files import;
- HR can record leave for someone.

What still stops a switch is outside the tool, and every Lucca customer uses it weekly: approvers are only reached by the Chest bell (no email, no push), and no absence reaches Outlook or Google. I also found one real payroll bug: approved leave after someone's last day keeps counting against their final balance.

**Completeness 5 → 7.5 /10 · UX 8 → 8.5 /10.**

Strength (one line): asking for leave is the clearest flow in the store — 2 clicks, a live cost that explains holidays and part-time rules, and one "left" figure everywhere.

## Round-1 findings

| # | Round 1 | Now |
|---|---|---|
| B1 | No N-1 / N split, no year close | **Fixed.** The card shows "1 to take now (N-1) · 6.25 being earned (N)". The HR ledger adds up (+6 opening, 3 × 2.08, −5 taken). The balances CSV has N-1 / N earned, taken and left, plus carried over. Carried over or lost is chosen per kind. I did not run a real year-end date: this is trusted from `test/years.test.ts`. |
| B2 | Accrual never stops after leaving | **Fixed**, with a new bug (see N1). After member.removed, Inès's last day is set, "Former (1)" lists her final balance, and her pending unpaid leave is cancelled. |
| B3 | No per-person work schedule | **Fixed.** Mon–Sun checkboxes on the person's page. With Nora on Mon–Wed: paid leave Mon–Wed costs 5 (the legal rule, explained on screen); RTT Mon–Fri costs 3; remote work on a Thursday she does not work costs 0. Round 1 was wrong to call "5" wrong: the law counts it that way. |
| B4 | Lucca import fails | **Fixed.** `Matricule;Nom;Prénom;Date d'entrée;CP N-1;CP N;RTT;Compteur CET` is recognised. An unknown column (CET) is asked about. The unknown person is shown and not imported. The Lucca absence export (`employeeNumber…isApproved`, AM/PM flags) imports: a non-approved line is skipped, and an unknown account id is asked about. |
| M5 | Two different "left" numbers | **Fixed.** "7.25 left · 2 waiting" on the home and the form, and "left after, counting your requests still waiting". |
| M6 | "Balance after" ignores other pending requests | **Fixed.** "Balance after: 1.25 · counting 1 earlier request still waiting". |
| M7 | "Coming up" furthest first | **Fixed.** 8 Oct, then 12 Oct. |
| M8 | No iCal feed | **Not fixed** (platform). |
| M9 | No email | **Not fixed** (platform). The tile and README say so. |
| M10 | HR cannot record for someone | **Fixed.** *Record leave* on the person's page, `?for=`. |
| M11 | No HR first run | **Fixed.** On an empty tool, HR gets "Set up Leave: 3 steps" with to-do marks, and the employee's copy is fine. |
| M12 | Phone Who's away: one card per day | **Fixed**, with a new bug (N2). One card per absence, grouped by week, from today. |
| M13 | No week view, no Today jump | **Not fixed.** Still a month view only. |
| M14 | No blackout, overlap or minimum staffing | **Partly.** "Also away: Inès Moreau" on the approver's card; nothing when asking, no blackout. |
| M15 | Settings saved per kind | **Fixed.** Autosave with a toast. |
| Minors | Family events, remote work, initials, French wording | **Fixed.** Family events list the legal events; remote work exists; a former member's initials are right ("IM"). |

## Still blocking (what a Lucca customer misses weekly)

1. **Approvers are not reached outside the Chest.** Lucca sends an email, a mobile push and Slack/Teams messages. Here a manager who does not open the Chest never sees a request. Platform: `mail` + web push (SDK report, "reaching people outside the tab").
2. **No absence in Outlook or Google Calendar.** Managers plan in their calendar. Platform: per-member signed feed (`feeds.url / feeds.verify`).
3. **Automatic French edge cases are manual:** leave earned during sick leave (loi 2024-364), fractionnement days, rounding. Each monthly close means HR adjustments that Lucca computes for them. Documented honestly, but a real weekly/monthly cost for HR.
4. **No blocking rules when asking** (blackout weeks, "2 of 3 in Sales already away"). Shops and small teams use them.
5. **Payroll CSV has no pay code per kind.** Silae, PayFit and Sage import absences by a code ("CP", "RTT", "MAL"), not by the display name "Congés payés". The accountant still maps by hand.

## New problems found this round

- **N1 — Bug, payroll: approved leave after the last day still counts, and the final balance is wrong.**
  Steps: seed → `/_dev` member.removed for Inès → `/chest/people/<ines>` (as HR). Her last day is set to 29 Sept, but her approved paid leave of Wed 7 Oct (afternoon) is still "Validé" and still in the ledger (−0.5). The Former list shows 14.75, when it should be 15.25. The calendar still shows "Inès Moreau (former member): Paid leave, Wed 7 Oct". The indemnité compensatrice is computed from this number.
  Fix: when the last day is set (by the event or by HR), cancel the approved leave that starts after it, or cut it at the last day. The days come back in the ledger with the line "After their last day", and HR is told.
- **N2 — Bug: the phone list drops absences that cross the month.** Phone, `/chest/calendar` in September. The card "Semaine du 28 septembre" lists only Sofia. Léa (approved Thu 1 – Fri 2 Oct) is missing, although the home page lists her under "Away this week". The phone list must show the whole current week, even past the month's end.
- **N3 — Doubtful rule: family events for part-timers use the paid-leave rule.** Nora (Mon–Wed) asking "Family event" Mon 2 – Thu 5 Nov is charged **5 days**, with the paid-leave text "counted from your first working day to the day before you are back". Event leave (L3142-4) covers days the person would have worked. It should count her working days (here 3) or the calendar days of the event, not run to the day before she is back. Check with a payroll expert.
- **N4 — "Away this week: Léa Dubois until Fri 2 Oct" on Tuesday**, when she only starts Thursday. It reads as "away now". Write "Thu 1 – Fri 2 Oct".
- **N5 — Seeded ledger reasons are English text in the French UI** ("Opening balance (spreadsheet)", "RTT for the year"): the store rule _store.md §2.11. French date typography: "depuis le solde fixé au 1 juin 2026" should be "1er juin".
- **N6 — The Chest theme cannot tell kinds apart:** paid leave and RTT cards are the same grey (the README says kinds are "told by their name"). This is acceptable, but in the calendar grid the kinds are indistinguishable for HR in that look.
- Looks: nothing broken or unreadable in own, Chest, brand (light and dark, phone), High contrast dark or Confetti. No horizontal overflow at 390 px. Keyboard: a logical tab order on the ask form, radio groups as one stop, visible focus.

## Platform-dependent

- Email to approvers and requesters: the SDK `mail` proposal must ship.
- Web push, daily digest: "reach people outside the Chest" (report §1.3).
- iCal / Outlook feed: `feeds.url(memberId, name)` + `feeds.verify` (not yet in `sdk/`: to be built).
- Manager relation from the Chest, time zone, employee number and start date from People: the events between tools proposal (People → Leave `people.leaving` would also set the last day before the member is removed).

## Top 3 fixes now

1. **Cancel or cut approved leave that falls after the last day**, give the days back in the ledger, and correct the Former balance and the calendar. **S.**
2. **Pay codes per kind of leave** (a "Payroll code" field in Settings, a column in both CSVs), with defaults CP / RTT / CSS / MAL / EVF. And the phone "Who's away" cards covering the whole current week across the month end. **S.**
3. **Family event counting**: a kind setting "count only the days the person works" as the default for family events, plus a warning when asking if the days exceed the legal amount for the chosen event. **S.**
