# Timesheets — record time on projects and see where it went

A store tool of the Chest (private part only; interface name "Temps" in
French). It replaces **Harvest, Toggl Track and Clockify** for a service
company — an agency, a consultancy, a studio — that bills its clients by
the hour and wants to know where its time goes.

## What it does

- **A timer on top of every page**: "What are you working on?", a project
  (and task) found by typing a few words of it (a searchable picker, also
  in the grid and the day list), *Start*. One timer per person, kept on the server (its start
  instant): it survives a reload, a closed tab, another device (pages
  re-read it every minute and when they come back into view). *Stop* turns
  it into an entry of the day it started, in the Chest's time zone. A timer
  left running more than 10 hours is **forgotten**: on the next visit a
  dialog asks when it really stopped (quarter-hour choices), or discards it.
  A stop under a minute records nothing: *Undo* puts the timer back, or the
  timer's line offers *Keep 1 min*.
- **My week**: a grid of projects/tasks × 7 days where one types hours —
  `1:30`, `1.5`, `1,5`, `90m`, `1h30` are all understood (`lib/duration.ts`,
  tested). Totals per day, row and week; *Copy last week's rows*; rows
  added and removed (with *Undo*). Enter and the arrows move down and up the
  column, Tab to the right. A cell holding several entries opens the day.
  **Each cell has its note** (the note icon, or Shift+Enter): what the
  time was for, as the client's invoice will say it.
- **Send my week, approval**: a person sends their week; it waits
  read-only (they may take it back). A manager approves it — it locks: no
  one changes it any more — or sends it back with a word, which the person
  reads on their week. The bell tells the managers of a week to approve,
  and the person of the answer. The company may turn approvals off.
- **The day list**: each entry with its project, task, note, time of day
  (from the timer) and billable mark; add, change, delete with *Undo*. **On a
  phone the day list replaces the grid**, with a strip of the week's days.
- **Clients and projects** (managers): client, colour, billable by default,
  optional hourly rate, a budget in hours or money with its progress
  ("203:45 of 220:00 — Almost spent"), tasks (Design, Development,
  Meetings…), closed projects, and who records time on it: everyone, or
  chosen people (only their projects are offered to them).
- **Rates with a history** (managers): a billable rate per project, per
  person (their usual rate) and per person on a project (a senior billed
  more), and a **cost rate** per person. Every rate applies **from a day**:
  an entry's amount uses the rate in force on its day, so raising a rate
  never rewrites last year's amounts (a new rate cannot start inside the
  locked period). An entry's rates are written on it for good once it is
  invoiced, imported with the old tool's rates, or its author erased.
- **Budget alerts**: when a project crosses 80 % and then 100 % of its
  budget (hours, or billable amount), the managers get one bell item each
  time (checked when time or a budget changes).
- **Team** (managers): the weeks to approve (one by one, or all); everyone's
  hours over four weeks against their usual week (the company's 35 h, or
  their own), who is short in red, and *Remind* — one bell item in each
  person's language. A person's week opens read-only with every note.
- **Reports**: this week, last week, this month, last month or chosen days;
  grouped by project, client, person or task; billable or not, or
  billable and not invoiced yet; for managers the amount, the cost and the
  **margin** (at the rates in force on each day); a warning for billable
  time without a note; a bar per day (per week beyond two months); budgets.
  Hours written 4:05 or 4.08, as the company chooses.
- **Invoiced time** (managers): in "Billable, not invoiced", *Mark N
  entries as invoiced* once the invoice is out; that time locks and keeps
  its rates; *Undo* puts it back.
  **CSV export in the reader's language** (French: `;` and decimal commas),
  protected against formula injection. Members see only their own time.
- **Locked periods**: a manager locks everything up to a date (after
  invoicing or payroll). Locked days cannot be changed by anyone; the grid
  shows them hatched and says who locked them and why.
- **Import** (managers) from the detailed time-entries CSV of **Toggl
  Track, Clockify and Harvest**: people matched by full name (accents, case
  and word order aside), clients, projects and tasks created as needed, a
  preview first (who was found, what will be created, what is left out and
  why, day/month order when the dates are ambiguous). Importing the same
  file twice adds nothing. **People who left before the Chest are kept**
  as former members (their name, their time, read-only; a manager may
  forget the name later). Rows in the locked period (or an approved week)
  are imported **only if the manager answers "Yes, it's history"** — the
  page asks. Harvest's Billable/Cost Rate and Clockify's rate columns (and
  Toggl's Amount) come along when in the Chest's currency, so past amounts
  match the old invoices; Harvest rows marked invoiced come in invoiced.
- **Friday reminder** (optional, a schedules proposal): on Friday at 15:30,
  whoever is short of their usual week and has not sent it gets one bell
  item in their language — "Your week has 22 h — fill in the rest?". It can
  be turned off; everything else works without it (the Team page's
  *Remind* works on any Chest).

## Looks

The tool wears **any look the company chooses in its Chest**, with the same
features: its own identity (*Instrument*: ink green, cool paper, a lime
signal, tabular figures — `DESIGN.md`), any theme of the UI kit's catalogue
(the store's identities, *Chest*, *High contrast*), or the **company's
brand** (its colours, fonts, corners — and its logo in the header where
the tool shows its stopwatch). The choice is for all tools or for this one;
the page follows it on the next request (`lib/theme.ts`, `chest.theme()`),
light and dark, every text readable (the kit checks every pair). The
instrument panel (header and timer) is the page's inverse: dark in a light
look, light in a dark one. Its components — shell and tabs, toasts with an
*Undo* that says whether it worked, dialogs, date fields in the reader's
language, file picker, tables, badges — are the store's shared UI kit
(`@argentic/chest-ui`, in `vendor/`), so they behave as in every other tool.

It is **not** your company's official working-hours register unless you
decide so, and it never watches anyone: no screenshots, no activity levels,
no idle detection.

## Roles

| Role | Can |
|---|---|
| `manager` (Manager / Responsable) | Everything a member can; clients, projects, tasks, rates and cost rates, usual weeks, budgets, who works on what; approving weeks and reminding; everyone's reports, amounts, costs, margins and CSV; marking time invoiced; locking; import; settings |
| `member` (Member / Membre) | Their own time (timer, week, day, notes) on the projects open to them; sending their week; their own reports and CSV (never a rate or an amount) |

Nobody changes another person's time. The rules live in `lib/access.ts`;
every service checks them on the server.

## First minute

- **What a new member sees first**: the dark timer line "What are you
  working on?" with a project already chosen (their last one) and a lime
  *Start*; below, their week. If no project is open to them yet, the line
  says so (a manager sees *Add a project*).
- **The first thing they do**: type what they do, press Enter or *Start*.
  Or type `1:30` in a cell of the week.
- **Clicks for the main job**: 1 (Start), 1 (Stop). Filling a day in the
  grid: a click and a few keys per cell.
- **Friday**: *Send my week* above the grid; the answer comes in the bell.
- **A mistake**: a wrong duration is refused with an example of what works
  and the cell keeps its old value; a deleted entry or row comes back with
  *Undo*; a discarded timer too; a forgotten timer asks instead of counting
  a night; a locked day says why and who to ask.
- **A new manager**: *Projects* is empty and offers *New project* or *Add an
  example project*, and the import from Toggl, Clockify or Harvest. A
  member who asks a managers' page reads "This page is for managers"
  (HTTP 403), not an error.

## Routes

| Route | What |
|---|---|
| `/` | Public host: says the tool lives in the Chest (language switch) |
| `/chest` | My week (`?week=` a Monday, `?day=` the day listed) |
| `/chest/reports` | Reports (`preset`, `from`, `to`, `group`, `person`, `kind`: `all`, `billable`, `non`, `uninvoiced`) |
| `/chest/reports/export` | The report's entries as CSV (the same parameters; `preset` alone works) |
| `/chest/projects`, `/new`, `/[id]` | Clients and projects, rates by person on a project (managers) |
| `/chest/team` | Weeks to approve, hours per week against the usual week, Remind (managers; `until` a Monday) |
| `/chest/team/[member]` | One person's week, read-only, with notes; approve or send back (`week` a Monday) |
| `/chest/people` | Rates, cost rates and usual weeks of each person; former people of imports (managers) |
| `/chest/settings` | Locked period, weekly approval, usual week and Friday reminder, hours style (managers) |
| `/chest/import` | Import from Toggl, Clockify, Harvest (managers) |
| `/chest-events` | Members' lifecycle (signed by the Chest) |
| `/chest-jobs/friday` | The Friday reminder (schedules proposal, signed) |

## On a Chest

- `capabilities`: `database`, `members` (names; people for projects and
  imports), `notifications` (the Friday reminder); `receives: ["member.*"]`.
- **Someone leaves** (or loses access): their running timer stops and
  becomes an entry when plausible (under 10 hours, in an open day; dropped
  otherwise), they leave the projects they were named on, their grid rows
  go. Their time and rates stay — reports and invoices need them — and read
  "Camille Martin (former member)". **An erasure**: the same, then their
  entries stay for the company's accounts with their rates written on them
  (the amounts do not move), the author `erased` ("Former member") and
  their notes cleared; their own rates, usual week and approval rows go; a
  lock, rate, approval or invoicing they did forgets who did it; the
  erasure is acknowledged.
- **Nothing runs in the background**: deleted entries are purged after 30
  days on a later request. No WebSocket: pages re-read themselves every
  minute while visible (the timer's state from another device).
- A day holds 24 hours at most, per person, checked in one transaction per
  person (two tabs saving at once cannot overflow it).

## Needs from the SDK

- `member.locale` — **Proposal (studio)**: the interface and the bell in
  each member's language.
- `@argentic/chest-sdk/chest` — **Proposal (studio)**: `timeZone()` (the
  day an entry belongs to, "this week"), `currency()` (rates and amounts).
- `schedules` — **Proposal (studio)**, `chest.proposals.json`: the Friday
  reminder. Without it the tool is complete; the setting says so.
- **Wished — events between tools, for invoicing**: the hand-off of
  "Billable, not invoiced" time to the Quotes tool (a draft invoice per
  client) is a suite link for later: `events.publish("timesheets.billable",
  {client, lines[]})` and Quotes answering `quotes.invoiced` so the time is
  marked invoiced by itself. Today a manager marks it by hand.
- **Wished — a start-timer event from Tasks**: Toggl and Clockify users start
  timers from their task tool; with events between tools, Tasks could send
  `tasks.timer.start` (a task's title as the note).
- **Wished**: `members.list({ q })` matching on full names returns
  candidates, but an import needs "who is *exactly* this name" for
  thousands of rows; today the tool lists everyone once (2,000 people at
  most) and matches itself. A `members.match(names[])` answering
  `{name → id | ambiguous | none}` would keep names out of the tool.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/timesheets --prod --reset --port 5200`
(Atelier Martin from `seed/sample.sql`), `node lab/chest-dev/flows/timesheets.mjs 5200`,
`node lab/chest-dev/screens.mjs tools/private/timesheets --port 5200`,
`node lab/chest-dev/audit.mjs tools/private/timesheets --port 5200`.

## What it does not do (yet)

- **Invoices**: it marks time invoiced, it does not write the invoice; the
  hand-off to the Quotes tool waits for events between tools (above).
- **No integrations or browser extension**: no timer started from Jira,
  Asana, Trello or GitHub, no calendar sync. Time is recorded here, on the
  phone or the computer.
- No calendar/timeline view, no tags, no favourites; one running timer per
  person.
- Budget alerts go to every manager (there is no "project manager" per
  project yet) and are checked when time or a budget changes, not when a
  person's rate changes.
- Approval is weekly and for every person alike (no approval by project
  manager, no monthly periods).
- No export of the projects and clients themselves (their time exports as
  CSV); no Toggl JSON data export import; no entry edit history;
  punch-in/out for legal working hours is not this tool.
- Never: screenshots, activity or idle tracking.
