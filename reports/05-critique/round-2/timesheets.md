# Timesheets (Temps) — severe critique, round 2

Tested 2026-09-29 on `--prod --reset` and `--prod --reset --empty`, port 7200.

**Seeded tool:**
- Hugo (member): typed `1h30` in the grid, sent his week in French, opened manager pages (403);
- Camille (manager): Team, Reports with amount, cost and margin, Projects, People rates (changed Hugo's rate twice, once into the locked period), Settings;
- Léa (member): French, phone, timer started.

**Empty tool:** first visit as manager and as member.

**Looks:** own, Chest, sample brand, High contrast dark, Confetti; light and dark; phone.

Scripts and screenshots are in `critique2/hr/` (`ts*.mjs`, `shots/ts-*`).

## Verdict

**Can a 50-person agency cancel Harvest tomorrow? Not yet — it lacks invoices and integrations. Toggl Track or Clockify for time plus approval and margin: yes.**

Round 1's three blockers are fixed:
- rates now apply from a date, so a change never rewrites the past;
- weekly send and approve;
- billed and cost rates per person and per person on a project, with margin in reports.

Also new: a team view with *Remind*, budget alerts, notes in cells, "billable, not invoiced" with *Mark as invoiced*, and imports that keep people who left.

What Harvest customers still use weekly is the **invoice made from the time**, and timers started from their other tools. Both wait on events between tools.

**Completeness 5 → 7.5 /10 · UX 8 → 8 /10** (new manager screens are clear, but two silent behaviours below cost trust).

Strength (one line): still the best capture in the store: a timer that survives everything, a grid that understands `1h30`, and a phone day list with a week strip.

## Round-1 findings

| # | Round 1 | Now |
|---|---|---|
| B1 | A changed rate rewrites history | **Fixed.** I gave Hugo €120 from 28 Sept. Last month's amount stayed €5,142.50. The rate list reads "€70.00 since the start · €120.00 from 28 September 2026". But see N1 and N2. |
| B2 | No submit / approve | **Fixed.** "Send my week", read-only while waiting, "take it back", *Approve* / *Send back…* with a word, *Approve the 2 weeks*. A French toast with "Annuler l'action". |
| B3 | No per-person rates or margin | **Fixed.** Amount €2,796.25, cost €1,849.33, margin €946.92 (34 %), per project. |
| M4 | No team missing-time view | **Fixed.** Person × week, "short" / "sent" / "approved" / "sent back", *Remind 4 people*. |
| M5 | No budget alerts | **Fixed** (bell at 80 % and 100 %; I read it in the README and saw "Over budget", but did not trigger it). |
| M6 | Import drops people who left and locked rows | **Fixed.** "People who left before the Chest: Julien Roux 40:00, Forget the name"; locked rows are imported if the manager says yes (README; not run). |
| M7 | No invoice or Quotes link | **Partly.** "Billable, not invoiced", "14 billable entries not invoiced yet", *Mark as invoiced*. There is no invoice and no hand-off to Quotes (platform events). |
| M8 | No notes in the grid | **Fixed.** Shift+Enter; the cell label includes the note. |
| M9 | No integrations | **Not fixed** (stated). |
| Minors | Forbidden page, empty copy, three add buttons, double arrows, timer under a minute, hours format, preset | **Fixed:** 403 "This page is for managers", "A manager hasn't opened a project to you yet", one strip on the phone, *Keep 1 min*, a 4:05 / 4.08 setting, `preset=` works (values `lastMonth`, etc.). |

## Still blocking (what a Harvest customer misses weekly)

1. **Invoices from time.** Harvest turns "billable, not invoiced" into an invoice in two clicks. Here the manager copies totals into Quotes, then marks the entries invoiced. Platform: `timesheets.billable` → Quotes, `quotes.invoiced` → back (events between tools).
2. **Timers from other tools.** There is no browser extension and no "start from a Tasks card". Platform: events (`tasks.timer.start`); an extension is outside the Chest.
3. **No reminder outside the Chest.** The Friday reminder and *Remind* only reach the bell. Harvest emails. Platform: `mail`/push.
4. **No project manager per project.** Budget alerts and approvals go to every manager. Agencies with 5+ project leads get noise.

## New problems found this round

- **N1 — Bug: a rate dated inside the locked period is saved from *today* without a word.** Steps:
  1. The period is locked to 31 Aug. On People, open Hugo's *Change*.
  2. Rate 50, "from" typed `2026-08-01`, Enter, *Save*.
  3. The toast says **"Saved."** The list now reads "… · **€50.00 from 29 September 2026**".

  The date field has `min` set to the lock and dropped the typed date, falling back to today. The manager believes they back-dated a correction. What they did was change today's rate, and that overrode the €120 set a moment before. Fix: refuse with "Rates can't start before 31 Aug (locked). Unlock first or choose 1 Sept". Never change a typed value silently.
- **N2 — A person's rate is silently ignored when the project has its own.** I set Hugo to €120 and saved ("Saved."). This week's amount stayed €691.25, because every seeded project has a project rate and "a project's own rate wins". Nothing on the form says that none of his current projects will use it. Harvest makes the choice explicit per project ("bill by person / by project / by task"). Fix: under the rate, say "Used on: none of Hugo's 3 projects (they have their own rate)". Or add a per-project choice "Rate: the project's / each person's".
- **N3 — Approving a week that is not over.** Hugo sent his week on Tuesday with 10:00. The manager sees "Semaine du 28 sept. · 10:00" beside a 30:15 week, with one *Approve the 2 weeks*, and no "week not over / 25 h short" mark. Approving locks it. Fix: show "short: 10:00 of 35:00" on the line, and leave weeks that are not over, or are short, out of the bulk action.
- **N4 — The team view blames people for weeks before the tool existed.** On an empty tool, everyone is "incomplète" for the last three weeks, and the manager is offered *Remind N people*. In the seed, everyone is "short, 0:00" for 7 Sept. Weeks before a person's first entry, or before the tool was installed, should show "—".
- **N5 — The manager's own home on an empty tool** says "Aucun responsable ne vous a encore ouvert de projet". Camille *is* the manager, and the banner above already says "Ajoutez un projet". Show the manager's copy.
- **N6 — French dates:** the cell labels say "jeudi 1 octobre", where French typography wants "1er octobre". Members see budget hours of whole projects ("251:15 of 230:00 used · Over budget") in their reports. That is harmless, but it was not asked for.
- **Looks:** the instrument panel keeps its dark band in every look (by design). Chest, brand (dark, phone), High contrast and Confetti are all readable. No overflow at 390 px.

## Platform-dependent

- Events between tools: Quotes invoicing both ways; Tasks start timer.
- `mail` / push: Friday and *Remind* outside the Chest.
- `schedules`: the Friday reminder at all (without it, only *Remind*).
- `members.match(names[])` for large imports (wished in the README).

## Top 3 fixes now

1. **Never silently change a rate's start date.** Refuse dates in the locked period with a sentence. And say on each person's rate where it applies ("used on 0 of 3 projects"), or offer "bill by person" per project. **S.**
2. **Approval shows shortness:** "10:00 of 35:00, week not over" on each line, and the bulk *Approve* leaves out short or unfinished weeks (or asks). **S.**
3. **The team view starts at each person's first week in the tool,** with no "incomplète" and no *Remind* for weeks before. Show the manager's copy on the empty home. **S.**
