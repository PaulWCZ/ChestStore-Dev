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
  read-only (they may take it back). From Friday the week says "Done with
  this week? Send it to a manager"; before, only "Away at the end of the
  week? You can send it early" (a quiet button). A manager approves it — it
  locks: no one changes it any more — or sends it back with a word, which
  the person reads on their week. **Nobody approves (or sends back) their
  own week**: a manager's week shows on the Team page with "another
  manager approves it", no button, and the server refuses (`self_approval`);
  the only manager is told to give someone the Manager role. The bell and
  an email ask the **leads of the projects the week holds** (every other
  manager when none has a lead), and tell the person of the answer. The
  company may turn approvals off.
- **Project leads**: each project may have a lead, one of the managers
  (*Projects → a project → Lead*). The lead gets its budget alerts and is
  asked for the weeks holding its time, marked "Your project" on the Team
  page (listed first). Without a lead, every manager, as before.
- **The day list**: each entry with its project, task, note, time of day
  (from the timer) and billable mark; add, *Change*, *Delete* (words beside
  the icons, on a phone too) with *Undo*. **On a
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
  never rewrites last year's amounts. A new rate cannot start inside the
  locked period: the form says so before saving ("Locked up to 31 August
  2026: a new rate starts on 1 September 2026 at the earliest…") and saves
  nothing — a typed day is never replaced by today. Under each person's
  usual rate, *People* says **where it is used**: "Used on all 3 of their
  projects", "Used on 1 of their 3 projects (Refonte). The others have a
  rate of their own, which wins", or "Not used now: their 2 projects each
  have a rate of their own" (their billable projects of the last 90 days). An entry's rates are written on it for good once it is
  invoiced, imported with the old tool's rates, or its author erased.
- **Budget alerts**: when a project crosses 80 % and then 100 % of its
  budget (hours, or billable amount), its lead (every manager without one)
  gets one bell item each time (checked when time or a budget changes).
- **Team** (managers): the weeks to approve — each line says when a week is
  **short or not over** ("week not over · 10:00 of 35:00"); approving such
  a week asks first ("… Approve it as it is? It locks the week" → *Approve
  anyway*, also checked on the server), and the bulk action takes only the
  complete weeks ("Approve the 2 complete weeks"), naming those it leaves
  out. Everyone's hours over four weeks against their usual week (the
  company's 35 h, or their own), who is short in red, and *Remind* — one
  bell item in each person's language. Weeks **before a person's start**
  (their first entry, else the first day they opened the tool, never
  before the tool's first project or entry) show "—": never "short", never
  reminded; an empty tool expects nothing of anyone. *Remind N people*
  never counts the manager who presses it ("Your own week is short too"
  is said beside it), and reaches each person by bell and by email. A
  person's week opens read-only with every note.
- **Reports**: this week, last week, this month, last month or chosen days;
  grouped by project, client, person or task; billable or not, or
  billable and not invoiced yet; for managers the amount, the cost and the
  **margin** (at the rates in force on each day); a warning for billable
  time without a note; a bar per day (per week beyond two months); budgets.
  Hours written 4:05 or 4.08, as the company chooses.
- **Search the notes** (Reports): words of a note ("Feyssine") narrow the
  report, list the entries found (the 100 most recent: day, person,
  project, note, time) and the CSV. A member searches their own.
- **Draft invoices in Quotes** (managers, when Quotes is installed): in
  "Billable, not invoiced", each project's billable time of the period is
  offered as one draft invoice — *Draft invoice in Quotes* — sent through
  events between tools (the contract below). Sent once: the entries wait
  for their invoice, locked; Quotes' answer marks them invoiced (rates
  written on them), with the invoice's number and a link to it; *Take
  back* frees them before that. On a Chest that cannot tell Quotes, the
  page says so and nothing changes.
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
instrument panel (header and timer) keeps its own dark colour in light and
dark (the theme's `--inverse`). Its components — shell and tabs, toasts with an
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

**A manager's first visit** on an empty tool: the panel's *Add a project*,
and the week says "Start with a project — nobody can record time until
there is a project" (a member reads that a manager opens projects).

## Routes

| Route | What |
|---|---|
| `/` | Public host: says the tool lives in the Chest (language switch) |
| `/chest` | My week (`?week=` a Monday, `?day=` the day listed) |
| `/chest/reports` | Reports (`preset`, `from`, `to`, `group`, `person`, `kind`: `all`, `billable`, `non`, `uninvoiced`; `q`: words of the notes) |
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
  Proposals (`chest.proposals.json`): `mail: {send: true}`, `emits:
  ["timesheets.billable", "timesheets.billable_cancelled"]`, `receives:
  ["quotes.invoiced"]`, the `friday` schedule.
- **Someone leaves** (or loses access): their running timer stops and
  becomes an entry when plausible (under 10 hours, in an open day; dropped
  otherwise), they leave the projects they were named on, their grid rows
  go. Their time and rates stay — reports and invoices need them — and read
  "Camille Martin (former member)"; their week's page (*Team → a person*)
  says "Left the Chest on 30 September 2026" (`leftAt`, SDK studio.15;
  nothing on a Chest that does not say it, nor for people who came with an
  import). **An erasure**: the same, then their
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
- **Events between tools** — **Proposal (studio)**: billable time to Quotes
  (below). Without it the page says Quotes cannot be told; *Mark invoiced*
  by hand still works.
- `mail` — **Proposal (studio)**: Remind, the Friday reminder and a week
  sent to approve also go by email. Without it, the bell only. Keys are
  given whole (`week:<member>:<monday>:<sent at>:<recipient>`; the SDK
  sends one longer than the Chest keeps as its digest, studio.15). **None
  of these emails is transactional**: each asks someone to act (fill in a
  week, approve one) — a reminder, like Hiring's interviewers' — so the
  choice each person made in the Chest (`member.mailPreference`: all, one
  a day, none; applied by `mail.send`, studio.15) always holds; the bell
  still tells them. An approval or a return is told by the bell only.
- **Wished — a start-timer event from Tasks**: Toggl and Clockify users start
  timers from their task tool; with events between tools, Tasks could send
  `tasks.timer.start` (a task's title as the note).
- **Wished**: `members.list({ q })` matching on full names returns
  candidates, but an import needs "who is *exactly* this name" for
  thousands of rows; today the tool lists everyone once (2,000 people at
  most) and matches itself. A `members.match(names[])` answering
  `{name → id | ambiguous | none}` would keep names out of the tool.

## With the other tools

**Timesheets → Quotes: `timesheets.billable`, version 1.** Published when a
manager presses *Draft invoice in Quotes*, one per project and period, under
the key `timesheets:billable:<handoff>:<made>` (`<made>`: when the hand-off
was made, in milliseconds — the same hand-off is never two events, and a
hand-off id given again after a restore from a backup is not taken for an
earlier one: sdk/README, "Put the recipient in the key"), with
`occurredAt` the moment it was made (studio.16). Taken back:
`timesheets.billable_cancelled` under `<that key>:cancelled`, `occurredAt`
the moment it was taken back. `data`:

```jsonc
{
  "version": 1,
  "handoff": "12",                       // Timesheets' id: quote it back
  "project": { "id": "3", "name": "Site vitrine" },
  "client": { "id": "2", "name": "Boulangerie Durand" },   // or null
  "period": { "from": "2026-09-01", "to": "2026-09-30" },
  "currency": "EUR",
  "minutes": 1830,
  "amount": 274500,                      // cents; null when a line has no rate
  "entries": 42,
  "lines": [                             // one per task and hourly rate, largest first
    { "label": "Design", "task": { "id": "7", "name": "Design" }, "minutes": 450,
      "rate": 9000, "amount": 67500, "entries": 12 }   // rate: cents per hour, or null
  ],
  "source": { "tool": "timesheets", "path": "/chest/projects/3" }   // the project, in Timesheets
}
```

People are never named (no member id either: an invoice line is per task
and rate). **What Quotes must do** (its side is built in another round):
receive `timesheets.billable` (declare it in `receives`), make one **draft
invoice** per `handoff` (a second delivery of the same `handoff` changes
nothing) for the client (matched by name, or asked), one line per `lines[]`
item (label, quantity `minutes / 60` hours, unit price `rate`), link back
with `chest.toolLink("timesheets", source.path)`; on
`timesheets.billable_cancelled {version: 1, handoff}` drop that draft if it
was not issued (else ignore it); and when the invoice is **issued**, publish
**`quotes.invoiced`** `{ handoff: "12", invoice: "F2026-014", path:
"/chest/invoices/14", by?: "mbr_…" }` (key `quotes:invoiced:<handoff>`).
Timesheets receives it (`app/chest-events/route.ts`): the hand-off's
entries become invoiced, their rates written on them, the report shows
"Invoiced: F2026-014" with a link; delivered twice, nothing more.

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

- **Invoices**: it writes no invoice itself. The hand-off to Quotes is
  built on Timesheets' side; Quotes' side (the draft invoice, and its
  `quotes.invoiced` answer) is not built yet, so today the time waits
  "for its invoice" until a manager takes it back or marks it invoiced.
  One hand-off per project and period; no grouping of several projects of
  a client in one invoice, no notes on the invoice lines.
- **No integrations or browser extension**: no timer started from Jira,
  Asana, Trello or GitHub, no calendar sync. Time is recorded here, on the
  phone or the computer.
- No calendar/timeline view, no tags, no favourites; one running timer per
  person.
- A project's lead is a manager of the tool: there is no lead with rights
  limited to their projects (a lead sees every report like any manager).
  Budget alerts are checked when time or a budget changes, not when a
  person's rate changes.
- The notes' search is case-insensitive but not accent-insensitive, and
  searches notes only (not project or task names).
- Emails: no switch of the tool's own — the person's choice in the Chest
  (all, one a day, none) applies to every email Timesheets sends.
- Members' reports show a project's whole budget ("251:15 of 230:00 used"),
  not only their share (seen by the critic as harmless; not changed).
- Approval is weekly and by the whole week (a lead is asked first, any
  other manager may approve; no approval line by line, no monthly periods).
- No export of the projects and clients themselves (their time exports as
  CSV); no Toggl JSON data export import; no entry edit history;
  punch-in/out for legal working hours is not this tool.
- Never: screenshots, activity or idle tracking.
