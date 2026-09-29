# Timesheets (Temps) — severe critique, round 3

Tested 2026-09-29, port 11300: `--prod --reset` and `--prod --reset --empty`. I ran the builders' own browser flow (`lab/chest-dev/flows/timesheets.mjs`: 18 of 18 passed, including the locked-period rate refusal). Then my own checks: Hugo (member, week), Camille (manager: team, people rates, reports FR), Sofia (manager: sent her own week, then the team page), Léa (FR phone dark), Camille (FR phone, brand:port), Hugo in the Chest look. Scripts and shots: `critique3/hr/ts*.mjs`, `hr/shots/ts*`.

## Verdict

**Can a 50-person agency cancel Harvest tomorrow? Not yet: there is still no invoice from time. Toggl Track or Clockify: yes.** All three round-2 fixes are in:
- a rate can't start silently in a locked period;
- a person's rate says where it applies;
- approval shows short or unfinished weeks;
- the team view starts at each person's first week.

What round 2 missed: the Harvest blocker is labelled "wished, platform", but the events-between-tools proposal is built and used. Forms → Clients/Support and Leave → People/Rooms both run on it, with SDK studio.14 `toolLink`. So "billable, not invoiced → a draft invoice in Quotes" is tool work now, not platform work.

**Completeness 5 → 7.5 → 8 /10 · UX 8 → 8 → 8.5 /10.**

Strength: capture is still the best in the store. A timer survives everything, and the phone day list with its week strip is fast.

## Round-2 top fixes and blockers

- N1, a rate dated in the locked period saved from today: **fixed.** The builders' flow step "lock a period" asserts the refusal with a sentence, and it passed when I ran it. A lock after today is refused as typed.
- N2, a person's rate silently unused: **fixed.** "Not used now: their 2 projects each have a rate of their own, which wins (Signalétique, Site vitrine)."
- N3, approving a week not over: **fixed.** "week not over · 15:26 of 35:00" on each line. The server refuses without `anyway` (`week_short`).
- N4, blame for weeks before the tool: **fixed.** An empty tool shows "—" everywhere and "les semaines comptent à partir du premier temps noté par chacun".
- N5, member copy on the manager's empty home: **fixed** ("Ajoutez un projet pour commencer…").
- N6, "1er octobre": **fixed** ("jeudi 1er octobre" in reports).
- Blocker, invoices from time / Quotes hand-off: **not fixed**, and wrongly filed as platform (see above).
- Blocker, timers from other tools (Tasks): **not fixed.** This is also possible on the events proposal (`tasks.timer.start`).
- Blocker, reminders outside the Chest: **not fixed.** `mail` exists in `sdk/`, and Timesheets does not declare it.
- Blocker, a project manager per project: **not fixed.** Budget alerts and approvals still go to every manager.

## Still blocking (what a Harvest customer misses weekly)

1. **Invoice from time.** Harvest: "billable, not invoiced" → an invoice in two clicks. Here the manager copies totals into Quotes by hand and comes back to *Mark as invoiced*.
2. **Project managers.** In a 50-person agency with 6 project leads, every manager gets every budget alert and approves everyone. There is no "my projects' time" view.
3. **Search and detailed report.** No search on notes ("Repérage au parc" last spring). Harvest's detailed time report filters by text.
4. **Reminders by email.** *Remind 4 people* and the Friday reminder reach only the bell.
5. **Timer from the task tool** (Tasks card → Start).

## New problems

- **N1 — A manager approves their own week.** Steps: Sofia (manager) → *Send my week* (7:15) → *Team*: "Sofia Rossi · week not over · 7:15 of 35:00 · Approve". `approveWeek` (`lib/weeks.ts`) has no check that the approver is not the week's owner; it only skips the bell when they are the same person. The time is billed to clients from these approved weeks. Leave out one's own week unless no other manager exists, and mark it "self-approved" in reports and the CSV.
- **N2 — *Remind 4 people* includes the manager who presses it.** Camille is "incomplète" for 21 Sept, and the count includes her. Say "Remind 3 people (and you are short too)".
- **N3 — "Semaine terminée ? Envoyez-la à un responsable" on a Tuesday** (Léa, phone). The prompt suggests sending a week that is not over. The manager then sees "week not over". Say "Send my week" only from Friday, or "Send it early?" before that.
- **N4 — Icon-only edit and delete on each phone entry** (pencil, bin). Flagged store-wide in round 2 (§2, "Timesheets phone entry edit/delete") and **still there**. Label them, or open the entry on tap.
- **N5 — Phone nav with 5 tabs in brand:port wraps "Ma semaine" on two lines.** It is readable but cramped. The instrument band then takes a third of the screen above the page title.
- Looks: the instrument band keeps its dark identity in every look (by design). Chest look, brand:port phone and FR dark phone are readable. No overflow at 390 px.

## Platform-dependent

- **None of the top blockers is platform-only any more:**
  - events between tools (Quotes, Tasks) is built in `sdk/`;
  - `mail` is built in `sdk/`;
  - `schedules` is built (the Friday reminder).
- Only a browser extension or third-party integrations (Jira, Asana) are outside the Chest.
- `members.match(names[])` for big imports (still wished).

## Top 3 fixes now

1. **Hand billable time to Quotes on the events proposal.** Emit `timesheets.billable {client, lines[]}` from "Billable, not invoiced → Make an invoice in Quotes". Quotes receives it as a draft invoice and answers `quotes.invoiced`, which marks the entries invoiced, with a `toolLink` back. **M** (Timesheets + Quotes).
2. **Project leads:** a "lead" per project (PeoplePicker). Budget alerts go to the lead, the lead approves their project's time, and no one approves their own week unless they are the only manager. **M.**
3. **Search notes in Reports**, plus labelled Edit/Delete on phone entries and the correct "Send my week" wording before Friday. Declare `mail` so *Remind* also emails. **S.**
