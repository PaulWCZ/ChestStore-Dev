# Timesheets (Temps) — severe critique

Tested 2026-09-29 on `--prod --reset`, port 7200: Hugo (member), Camille (manager), Léa (member, FR, phone), timer start/stop, grid typing (valid and invalid), reports, CSV, a Toggl-format import, and empty data (tables truncated by hand). Screenshots are in `critique/hr/shots/ts-*`.

## Verdict

**Can a 50-person agency cancel Harvest tomorrow? Not yet. Toggl or Clockify for time capture only: almost.** Capture is excellent: a timer that survives reloads, a keyboard grid that understands `1h30`, and a forgotten-timer dialog. What an agency uses Harvest for *after* capture is missing:
- weekly submit and approve;
- rates for each person, and rates that are frozen in time (changing a rate silently rewrites past amounts);
- a team view of who has not filled their week;
- budget alerts;
- invoicing from time;
- historical time of people who already left, which is dropped on import.

**Completeness 5/10 · UX 8/10.**

## Blockers

1. **A changed rate rewrites history.** The README says it: "a changed rate changes past amounts". An agency that raises its rate in January sees last year's invoiced amounts and project profitability change. Nobody will trust the reports. Fix: store the rate on each entry when it is created (or keep a rate history with a start date), and recompute only on an explicit "Apply the new rate to entries since …". Effort M.
2. **No timesheet submit / approve.** Harvest "Approvals" and Clockify "Approval" are weekly rituals in agencies above ~15 people: a member submits the week, the manager approves, and it locks. The tool has only a global "locked until" date. Fix: a *Submit my week* button on My week; a manager "To approve" list (week × person, with totals and a link to the grid); approving locks that person-week; a bell notification both ways. Effort M.
3. **No rates or cost rates per person, so no profitability.** Harvest customers bill a senior at €120 and a junior at €70 on the same project, and they read margin from cost rates. Here it is one rate per project. Fix: a billable rate per person (default) and per person × project (override), plus an optional cost rate for managers; reports show amount, cost and margin. Effort M.

## Major

4. **No team "missing time" view.** Managers need "who has fewer than 35 h last week" (Harvest's Team view). There is only a Friday bell to the person, and it is off without the schedules proposal. Fix: a Reports → People tab: a person × week table with their capacity, red below it, and a "Remind" button. Effort S.
5. **No budget alerts.** "Almost spent" appears only on the Projects page (`ts-cam-_chest_projects.png`). Harvest emails at 80 % or 100 %. Fix: a bell to the managers when a project crosses 80 % and 100 % (checked at entry save), with a threshold for each project. Effort S.
6. **Import drops people who left and anything before the lock.** A Toggl file with a departed employee: "Not in your Chest: their rows are left out" (`ts-import-preview.png`). Years of client history lose that person's hours, so the project totals no longer match past invoices. Fix: import unmatched people as "Name (former)" pseudo-authors (not members, read-only). Let a manager import into locked periods explicitly ("import history before 31 Aug"). Effort M.
7. **No invoice or Quotes link.** Harvest's second half is invoicing from tracked time. The tool says "Quotes tool's job", but nothing connects them yet. Fix: at least a "Billable, not yet invoiced" report plus "Mark as invoiced" (which locks those entries), then an event to Quotes (SDK events proposal). Effort M.
8. **No notes in the grid.** A cell holding a duration has no note. Harvest agencies need a note on every billable line for the client's invoice. The note exists only in the day list below. Fix: a note icon in the cell that opens a popover, and a warning "billable time without a note" in reports. Effort S.
9. **No integrations or browser extension.** Toggl and Clockify users start timers from Jira, Asana, Trello or GitHub. Say so plainly in the store description, and link the Chest's Tasks tool (start a timer from a task) through events. Effort (L, cross-tool).

## Minor

10. The page a member is not allowed to see says **"You can't use this tool yet — Your role does not allow this."** on `/chest/projects` (`ts-hugo-_chest_projects.png`), although the member uses the tool daily. It also returns HTTP 200. Say "Only managers see projects", and return 403/404.
11. An empty member week says "Start the timer above, or add a row and type your hours", but there is no timer ("No project is open to you yet") and no *Add a row* button (`ts-empty-hugo-_chest.png`). The text should follow the state: "A manager has not opened a project to you yet."
12. An empty manager Projects page shows three "add project" actions (banner, header button, empty state) (`ts-empty-cam-_chest_projects.png`). Keep one primary.
13. The phone week has two sets of ‹ › arrows (the week header and the day strip) (`ts-lea-fr-phone-_chest.png`). Keep the strip's.
14. Stopping a timer under a minute drops the typed description ("Under a minute: nothing recorded.") — acceptable, but offer "Keep 1 min" or Undo.
15. Hours and decimal are shown twice in reports ("4:05 / 4.08"). Pick one per locale (FR payroll likes decimals), with a setting.
16. The CSV export ignores `preset=` in the URL; it follows the page's current filters only (not a bug for UI users, but the route table says otherwise).
17. No tags, no calendar or timeline view (Toggl's calendar is a loved feature), no favourites.

## Bugs

- B1 (Minor 10) Wrong forbidden message and HTTP 200 on manager-only pages.
- B2 (Minor 11) Empty-state copy points to controls that are not there.
- B3 Rate change rewrites past amounts (Blocker 1): documented, still a data-integrity bug for a buyer.

## Migration in / out

- **In:** Toggl, Clockify and Harvest detailed CSV, with a good preview (people found or not found, created entities, left out and why). Loses departed people and locked-period rows (Major 6).
- **Out:** CSV in the reader's language, formula-safe. No per-client invoice export, and no export of projects or clients (the setup cannot be moved back out).

## UX notes

Strong: the best capture UX of the batch. One line to start, grid keyboard rules shown ("Enter goes down, Tab goes right"), a clear invalid-duration toast ("'abc' is not a duration. Write 1:30, 1.5 or 90m."), and the cell keeps its old value. Reports are clear, with budget bars. Natural French ("Sur quoi travaillez-vous ?"). Pages load in 0.6–0.8 s.
Weak: the manager value (approval, team view, margin) is thin. The timer's project select is a native `<select>` of "Client · Project · Task" strings; with 40 projects it needs type-to-search.

## Fix plan (ordered)

1. Freeze the rate on entries (or a rate history) — M
2. Submit / approve weeks — M
3. Team missing-time view and budget alerts — S
4. Per-person billable and cost rates, margin in reports — M
5. Grid cell notes — S
6. Import departed people and history into locked periods — M
7. "Not invoiced" report plus mark invoiced; Quotes link via events — M
8. Copy fixes (forbidden, empty member, three add buttons, double arrows) — S
9. Searchable project picker in the timer — S


## October 2026: after the move to the new stack

_Added 6 October 2026 from Timesheets's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.5,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **138.8 → 64.7 MiB**;
  image 458 → 29 MiB; first members' page 676 →
  573 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: a hand-off to Quotes offered and sent only when Quotes is installed **and** linked (`events.receivers`); rates frozen on a handed-off entry; reads before a change locked, so a save in flight never lands in what was just invoiced (race tests on PostgreSQL); members see a money budget as a share only; the Friday reminder skips weeks before a person's start; pages re-read only when their tab comes back (`bbd615b`).
- **Pending**: It vendors package studio.5 (the others studio.6).
