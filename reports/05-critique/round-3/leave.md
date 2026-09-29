# Leave (Congés) — severe critique, round 3

Tested 2026-09-29, port 11300: `--prod --reset` and `--prod --reset --empty`. Hugo (employee), Tom (employee, Mon–Thu week), Nora (employee, phone, dark, FR), Inès and Léa (managers, phone, brand dark), Camille (HR). Looks: own, Chest, brand:sample, brand:port, High contrast dark. Keyboard on the ask form. `member.removed` for Hugo via /_dev. Both payroll CSVs fetched. Scripts and shots: `critique3/hr/lv*.mjs`, `hr/shots/lv*`.

## Verdict

**Can a 50-person French company cancel Lucca Absences / Factorial time off tomorrow? Not yet.** The payroll arithmetic is now trustworthy, and every round-2 fix landed. What a Lucca customer still misses every week: approvers are reached only by the Chest bell (no email or push), and no absence reaches Outlook or Google. Round 2 filed email as "platform"; that is only half true. The `mail` proposal is built in `sdk/` and Equipment already uses it. **Leave does not declare it** (README: "this tool does not use it yet"). So the biggest weekly gap is a tool gap too.

**Completeness 5 → 7.5 → 8 /10 · UX 8 → 8.5 → 8.5 /10.**

Strength: still the clearest flow in the store. Asking takes 2 clicks, and the live cost now also counts correctly for part-timers on family events.

## Round-2 top fixes and blockers

- N1, approved leave after the last day still counted: **fixed.** Hugo was removed with approved leave 12–16 Oct and a pending 8–9 Oct. Both are Cancelled, the ledger shows "+5 Given back · After their last day", the Former balance is 12.25, and HR's bell says "1 congé annulé ou raccourci, 5 jours rendus".
- Pay codes per kind: **fixed.** The month CSV has a "Code paie" column (CP, RTT, MAL). Balance columns read "Congés payés (CP) …".
- N2, the phone list dropped absences across the month end: **fixed.** In September, the week of 28 Sept lists Léa's 1–2 Oct.
- N3, family events for part-timers: **fixed.** Tom (Mon–Thu), wedding Mon–Fri: charged 4 days, "Counted in the days you work", "The law gives 4 days".
- N4, "until Fri 2 Oct" read as away now: **fixed** ("Thu 1 Oct – Fri 2 Oct").
- N5, English seed reasons and "1 juin": **fixed** ("Solde d'ouverture (tableur)", "1er juin").
- N6, Chest theme greys: **not changed.** The calendar is still all one grey for kinds in the Chest look. Accepted by design.
- Blocker, email to approvers: **not fixed, and not attempted.** `chest.proposals.json` has no `mail`, although the proposal exists and Equipment uses it.
- Blocker, calendar feed: **not fixed** (feeds proposal not built).
- Blocker, blackout or minimum-staffing rules when asking: **not fixed.**
- Week view or Today jump: **not fixed.**

## Still blocking (what a Lucca customer misses weekly)

1. **Approvers and requesters are not reached outside the Chest.** This is buildable now on the `mail` proposal: "Hugo asks 8–9 Oct" with an Approve link, and "Approved" back to Hugo.
2. **Absences do not reach Outlook or Google.** Managers plan in their calendar.
3. **No staffing guard when asking.** Nothing warns "2 of 3 in Sales already away" or blocks a blackout week. The approver sees "Also away"; the requester sees nothing.
4. **People and Leave do not talk.** People emits `people.leaving` (last day) and holds contract type and weekly hours. Leave receives neither, so HR types the last day, start date and working week twice. It also types the employee number (matricule), which People's HR record does not even have. Lucca Core HR + Absences is one record.
5. **Month-end payroll timing** (new, see N1): balances can't be taken at the month's last day before that day.

## New problems

- **N1 — Payroll: balances "on" a future day are refused.** Steps: *People → Payroll files → Soldes à une date*, type 30/09/2026 on 29 Sept. The field says "Choisissez le mardi 29 septembre 2026 ou avant", and `/chest/people/balances?on=2026-09-30` returns the bare text "Vérifiez ce que vous avez saisi." French payroll is prepared around the 20th–25th for the month end, so the accountant needs balances at the 30th, including that month's +2.08. Allow any day up to the end of next month and compute it (accrual is already computed when read). Say "projected" in the file name.
- **N2 — The payroll balances CSV writes "Hugo Bernard (ancien membre)"** in the Personne column. The same suffix on legal/payroll files was fixed in People and Equipment this round. Payroll tools that match on name break. Write the name, and add the last day in its own column (already there).
- **N3 — End before start: the form shows one date and counts another.** Type first day 10/11 and last day 03/11. The field keeps "03/11/2026" with an error in red, but the line under it reads "Mardi 10 novembre 2026", and the cost card says "1 jour · 12,75 restants ensuite". The button is off, so nothing is saved, but the screen contradicts itself. Hide the cost while a field is refused.
- **N4 — HR's own first-run card tells HR to wait for HR.** Empty tool as Camille (HR): "Pas encore renseigné. Les RH vont saisir votre solde." Say "Set your balance" with a link.
- **N5 — Paid leave may go 28 days negative without a block by default.** Tom asks 1 Feb–31 Mar: 42 days, "-28.25 left after", and it can be sent. Lucca blocks by default. Offer "may go below zero" off by default for paid leave, or cap it at N-being-earned.
- **N6 — README is stale.** "What it does not do" still says "native date fields"; the form uses the kit's DateField with Today/Tomorrow.
- **N7 — French typography, store-wide:** "Quel type de congé?" and "Note:" lack the space before ? and :. The role label "Salarié" shows for Nora. Decide once for the store.
- Looks: nothing broken in own, Chest, brand:sample (dark phone), brand:port (phone) or High contrast dark. No horizontal overflow at 390 px. Keyboard: a logical order, kind radios as one stop, visible focus.

## Platform-dependent

- `mail`: **already in the SDK working copy.** Leave just has to declare and use it (tool work, not platform).
- Per-member iCal feed (`feeds.url` / `feeds.verify`): not built in `sdk/`, still needed.
- Events between tools: built. Leave should also **receive** `people.leaving` (and a future `people.updated` for start date, hours and matricule).
- Web push / daily digest: platform only.

## Top 3 fixes now

1. **Email approvers and requesters through the `mail` proposal** (request sent, answer, cancellation asked), each in the reader's language with a deep link. Declare `mail` in `chest.proposals.json`, as Equipment did. **M.**
2. **Receive `people.leaving` (last day) from People**, and ask People to emit start date, weekly hours and matricule on its record changes. Leave pre-fills from them, so HR stops typing twice. **M.**
3. **Month-end payroll:** allow the balances file on any day up to next month's end (projected accrual), drop "(ancien membre)" from both CSVs, and hide the cost card while a date is refused. **S.**
