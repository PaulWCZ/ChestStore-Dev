# Timesheets — record time on projects and see where it went

A store tool of the Chest (private part only; interface name "Temps" in
French). It replaces **Harvest, Toggl Track and Clockify** for a service
company — an agency, a consultancy, a studio — that bills its clients by
the hour and wants to know where its time goes.

## What it does

- **A timer on top of every page**: "What are you working on?", a project
  (and task), *Start*. One timer per person, kept on the server (its start
  instant): it survives a reload, a closed tab, another device (pages
  re-read it every minute and when they come back into view). *Stop* turns
  it into an entry of the day it started, in the Chest's time zone. A timer
  left running more than 10 hours is **forgotten**: on the next visit a
  dialog asks when it really stopped (quarter-hour choices), or discards it.
- **My week**: a grid of projects/tasks × 7 days where one types hours —
  `1:30`, `1.5`, `1,5`, `90m`, `1h30` are all understood (`lib/duration.ts`,
  tested). Totals per day, row and week; *Copy last week's rows*; rows
  added and removed (with *Undo*). Enter and the arrows move down and up the
  column, Tab to the right. A cell holding several entries opens the day.
- **The day list**: each entry with its project, task, note, time of day
  (from the timer) and billable mark; add, change, delete with *Undo*. **On a
  phone the day list replaces the grid**, with a strip of the week's days.
- **Clients and projects** (managers): client, colour, billable by default,
  optional hourly rate, a budget in hours or money with its progress
  ("203:45 of 220:00 — Almost spent"), tasks (Design, Development,
  Meetings…), closed projects, and who records time on it: everyone, or
  chosen people (only their projects are offered to them).
- **Reports**: this week, last week, this month, last month or chosen days;
  grouped by project, client, person or task; billable or not; amounts from
  the rates (managers); a bar per day (per week beyond two months); budgets.
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
  file twice adds nothing.
- **Friday reminder** (optional, a schedules proposal): on Friday at 15:30,
  whoever has fewer hours than the threshold (35 h by default) gets one bell
  item in their language — "Your week has 22 h — fill in the rest?". It can
  be turned off; everything else works without it.

It is **not** your company's official working-hours register unless you
decide so, and it never watches anyone: no screenshots, no activity levels,
no idle detection.

## Roles

| Role | Can |
|---|---|
| `manager` (Manager / Responsable) | Everything a member can; clients, projects, tasks, rates, budgets, who works on what; everyone's reports, amounts and CSV; locking; import; the reminder's setting |
| `member` (Member / Membre) | Their own time (timer, week, day) on the projects open to them; their own reports and CSV (no rates) |

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
- **A mistake**: a wrong duration is refused with an example of what works
  and the cell keeps its old value; a deleted entry or row comes back with
  *Undo*; a discarded timer too; a forgotten timer asks instead of counting
  a night; a locked day says why and who to ask.
- **A new manager**: *Projects* is empty and offers *New project* or *Add an
  example project*, and the import from Toggl, Clockify or Harvest.

## Routes

| Route | What |
|---|---|
| `/` | Public host: says the tool lives in the Chest (language switch) |
| `/chest` | My week (`?week=` a Monday, `?day=` the day listed) |
| `/chest/reports` | Reports (`preset`, `from`, `to`, `group`, `person`, `kind`) |
| `/chest/reports/export` | The report's entries as CSV |
| `/chest/projects`, `/new`, `/[id]` | Clients and projects (managers) |
| `/chest/settings` | Locked period, Friday reminder (managers) |
| `/chest/import` | Import from Toggl, Clockify, Harvest (managers) |
| `/chest-events` | Members' lifecycle (signed by the Chest) |
| `/chest-jobs/friday` | The Friday reminder (schedules proposal, signed) |

## On a Chest

- `capabilities`: `database`, `members` (names; people for projects and
  imports), `notifications` (the Friday reminder); `receives: ["member.*"]`.
- **Someone leaves** (or loses access): their running timer stops and
  becomes an entry when plausible (under 10 hours, in an open day; dropped
  otherwise), they leave the projects they were named on, their grid rows
  go. Their time stays — reports and invoices need it — and reads "Camille
  Martin (former member)". **An erasure**: the same, then their entries stay
  for the company's accounts with the author `erased` ("Former member") and
  their notes cleared; a lock they set forgets who set it; the erasure is
  acknowledged.
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

Invoicing (the Quotes tool's job), weekly submission and approval, rates
per person or rate history (a changed rate changes past amounts), a
calendar/timeline view, tags, punch-in/out for legal working hours, Toggl's
JSON data export, an entry's edit history, several running timers. Never:
screenshots, activity or idle tracking.
