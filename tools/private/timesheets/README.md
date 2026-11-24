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
  re-read it when they come back into view). *Stop* turns
  it into an entry of the day it started, in the Chest's time zone. A timer
  left running more than 10 hours is **forgotten**: on the next visit a
  dialog asks when it really stopped (quarter-hour choices), or discards it.
  A stop under a minute records nothing: *Undo* puts the timer back, or the
  timer's line offers *Keep 1 min*.
- **My week**: a grid of projects/tasks × 7 days where one types hours —
  `1:30`, `1.5`, `1,5`, `90m`, `1h30` are all understood (`src/shared/duration.ts`,
  tested; the cell sends what was typed, the server reads it again). Totals per day, row and week; *Copy last week's rows*; rows
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
  the only manager is told to give someone the Manager role. A notification
  asks the **leads of the projects the week holds** (every other
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
  is said beside it), and reaches each person by a notification that names
  who asks. A
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
- **Draft invoices in Quotes** (managers, when Quotes is installed and the
  owner approved the link to Timesheets): in "Billable, not invoiced", each
  project's billable time of the period is offered as one draft invoice —
  *Draft invoice in Quotes* — sent through events between tools (the
  contract below). Sent once: the entries wait for their invoice, locked,
  **their rates written on them at that moment** (a rate changed later
  never makes the invoice and Timesheets disagree); Quotes' answer marks
  them invoiced, with the invoice's number and a link to it; *Take back*
  frees them (and their rates) before that. The Chest says which tools an
  event reached only once it is sent: a hand-off that reaches no tool
  (Quotes not linked yet) is undone at once and said so — the time never
  waits for an invoice nobody makes. Quotes not installed: the panel says
  so.
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
  Toggl's Amount) come along when in Timesheets' currency, so past amounts
  match the old invoices; Harvest rows marked invoiced come in invoiced.
- **One currency, the tool's own** (*Settings → Money*): the Chest has no
  currency (SDK 0.7.0), so Timesheets keeps its own — EUR until a manager
  picks another (currencies with cents). Every rate, project budget,
  invoiced entry's rates and hand-off carries that ISO 4217 code beside its
  amount, and they are always the same one, so no total ever adds two
  currencies. Changing it **relabels** (80 EUR becomes 80 GBP — a
  correction, never a conversion), which the page says; once time was
  invoiced or handed to Quotes, it stays. Moving from an older Timesheets,
  the currency is the one its hand-offs to Quotes were told in (the
  Chest's then, `migrations/0008`), else EUR.
- **Friday reminder** (optional, the schedule `friday` of `chest.json`): on Friday at 15:30,
  whoever is short of their usual week and has not sent it gets one bell
  item in their language — "Your week has 22 h — fill in the rest?". It can
  be turned off; everything else works without it (the Team page's
  *Remind* works on any Chest).

## Notifications, and mail

Timesheets tells its team through the Chest's notifications only, each in
its reader's language: a week sent to approve (to the projects' leads),
approved or sent back (to its person), *Remind* (to each person short of
their usual week, saying who asks), the Friday reminder at 15:30 (the
Chest’s zone), a project at 80 % and 100 % of its budget (to its lead, or
every manager when it has none). The tool mails nobody: the Chest mails
each member their notifications by their own choice (each one, once or twice a day, or never; off per tool), set in
the Chest — Timesheets has no email setting.

**Mail to people outside the company**: none. Timesheets is for the team
only; billable time reaches clients through Quotes, which sends the
invoice.

**Changed on 6 October 2026** (the owner's mail decisions): Remind, the
Friday reminder and a week sent to approve also went by email; those
emails are gone (the notifications stay, at the same moments). The `mail`
proposal is no longer declared.

## Looks

The tool wears **any look the company chooses in its Chest**, with the same
features: its own identity (*Instrument*: ink green, cool paper, a lime
signal, tabular figures — `DESIGN.md`), any theme of the UI kit's catalogue
(the store's identities, *Chest*, *High contrast*), or the **company's
brand** (its colours, fonts, corners — and its logo in the header where
the tool shows its stopwatch). The choice is for all tools or for this one;
the page follows it on the next request (`src/theme.ts`, `chest.theme()`, served as the stylesheet `/chest/look.css`),
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

Nobody changes another person's time. The rules live in `src/lib/access.ts`;
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
| `/` | Outside a Chest: says the tool lives in the Chest (language switch); a Chest answers 404 on the public host itself |
| `/chest` | My week (`?week=` a Monday, `?day=` the day listed) |
| `/chest/reports` | Reports (`preset`, `from`, `to`, `group`, `person`, `kind`: `all`, `billable`, `non`, `uninvoiced`; `q`: words of the notes) |
| `/chest/reports/export` | The report's entries as CSV (the same parameters; `preset` alone works) |
| `/chest/projects`, `/new`, `/[id]` | Clients and projects, rates by person on a project (managers) |
| `/chest/team` | Weeks to approve, hours per week against the usual week, Remind (managers; `until` a Monday) |
| `/chest/team/[member]` | One person's week, read-only, with notes; approve or send back (`week` a Monday) |
| `/chest/people` | Rates, cost rates and usual weeks of each person; former people of imports (managers) |
| `/chest/settings` | Locked period, weekly approval, usual week and Friday reminder, hours style (managers) |
| `/chest/import` | Import from Toggl, Clockify, Harvest (managers) |
| `/chest-events` | Members' lifecycle, and Quotes' `quotes.invoiced` (signed by the Chest) |
| `/chest-schedules` | The runs of `chest.json`'s schedules: `friday`, the Friday reminder (signed `Chest-Schedule`) |

## On a Chest

- `chest.json` (contract **0.7**, `chest check` OK): `capabilities`:
  `database`, `members` (names; people for projects and imports),
  `notifications` (the Friday reminder), `realtime` (pages left open);
  `receives: ["member.*", "quotes.invoiced"]`; `emits`:
  `timesheets.billable` and `timesheets.billable-cancelled`, each with its
  fields (below); `realtime`: channels `mine:{member}` and `team`
  (managers), feeds of `entries` and `weeks` on `team`;
  `schedules: [{"name": "friday", "cron": "30 15 * * 5"}]` (the company's
  zone); `build.static: ["/assets/"]` (the script, the stylesheet, the
  fonts, the icon — everything the tool serves outside `/chest`).
  Proposal left in `chest.proposals.json`: the French `translations`.
- **Someone leaves** (or loses access): their running timer stops and
  becomes an entry when plausible (under 10 hours, in an open day; dropped
  otherwise), they leave the projects they were named on, their grid rows
  go. Their time and rates stay — reports and invoices need them — and read
  "Camille Martin (former member)"; their week's page (*Team → a person*)
  says "Left the Chest on 30 September 2026" (`leftAt`, a studio proposal;
  nothing on a Chest that does not say it, nor for people who came with an
  import). **An erasure**: the same, then their
  entries stay for the company's accounts with their rates written on them
  (the amounts do not move), the author `erased` ("Former member") and
  their notes cleared; their own rates, usual week and approval rows go; a
  lock, rate, approval or invoicing they did forgets who did it; the
  erasure is acknowledged.
- **Nothing runs in the background**: deleted entries are purged after 30
  days on a later request. **Pages left open follow the Chest's
  realtime, never a timer**: every page joins its member's channel
  `mine:<id>`, where the tool publishes "time.changed" when that member's
  time changes (a timer started on another device, an entry saved
  elsewhere, a week approved or sent back by a manager); a manager's pages
  also join `team`, the feeds of the tables `entries` and `weeks` (their
  keys only: the page reads the rest, as its reader may). The Chest holds
  the connections, so an open tab never keeps the tool awake. Each page
  has a version (the package's change log, `migrations/0006`): a read with
  nothing new is a 304, the Reports' and Team's queries not run again.
- A day holds 24 hours at most, per person, checked in one transaction per
  person (two tabs saving at once cannot overflow it).

## Needs from the SDK

Timesheets runs on SDK 0.7.0 + studio proposals (0.7.0-studio.2) and
`@argentic/chest-app` 0.1.0-studio.12, in `vendor/`. Official: `member(request)` with the member's `language` (the
interface and the bell in each member's language) and `timeZone` (when a
week was sent, approved or locked, shown at their own hour);
`chest.timeZone` and `chest.today()` — the company's zone and day (0.7.0:
captured once, set on no screen): the day an entry belongs to, "this
week", the hours of an entry; the database's `current_date` is that day
too. No Chest currency (0.7.0): the tool's own setting (above).
`schedules` — the Friday reminder on `POST /chest-schedules`; without it
the tool is complete; the setting says so. **Events between tools**
(official since 0.5): billable time to Quotes and its answer (below).
**Notices with translations** (0.5): one `notifications.notify` per
event, its English words with their French in `translations`; the Chest
shows each member their language (`src/lib/notify.ts`). **`realtime`**
(0.5): the pages left open (above).

- **`members.leftAt(ids)`** — **Proposal (studio)**: "Left the Chest on
  30 September 2026" on a former member's week. Nothing on a Chest that
  does not say it.
- **`chest.tools.get/link`** — **Proposal (studio)**: whether Quotes is
  installed (the panel), and the link to the invoice in Quotes. On 0.7.0,
  which says neither, the panel is offered (a send that reaches no tool
  says so) and the invoice's number is shown without a link.
- **Wished — a fake Chest that plays receivers**: 0.7.0's fake answers
  every emit "written for 0 tools", so a tool cannot test what it does
  when its event reaches one; Timesheets' tests wrap the SDK's emit
  (`handoff.outbox`) to play an installed Quotes.
- **Wished — a start-timer event from Tasks**: Toggl and Clockify users start
  timers from their task tool; with events between tools, Tasks could send
  `tasks.timer.start` (a task's title as the note).
- **Wished**: `members.list({ q })` matching on full names returns
  candidates, but an import needs "who is *exactly* this name" for
  thousands of rows; today the tool lists everyone once (2,000 people at
  most) and matches itself. A `members.match(names[])` answering
  `{name → id | ambiguous | none}` would keep names out of the tool.

## With the other tools

**Timesheets → Quotes: `timesheets.billable`** (declared in `chest.json`
`"emits"`, each field typed: 0.7.0's data is flat). Emitted when a manager
presses *Draft invoice in Quotes*, one per project and period, with the
subject `handoff:<handoff>` (delivered in order per hand-off) and the key
`timesheets:billable:<handoff>:<made>` (`<made>`: when the hand-off was
made, in milliseconds — the same hand-off is never two events, and a
hand-off id given again after a restore from a backup is not taken for an
earlier one), `occurredAt` the moment it was made, no audience (who sees
the draft is Quotes' rule: naming Timesheets' managers would hide it from a
billing team that manages no time). Taken back:
**`timesheets.billable-cancelled`** `{handoff}` (renamed from
`timesheets.billable_cancelled`: 0.7.0 refuses an underscore in a type),
same subject, key `<that key>:cancelled`. `data`:

```jsonc
{
  "handoff": "12",                 // id — Timesheets' id: quote it back
  "project": "3",                  // id
  "projectName": "Site vitrine",   // text
  "client": "2",                   // id?   (absent: no client)
  "clientName": "Boulangerie Durand", // text?
  "from": "2026-09-01", "to": "2026-09-30",   // date, date
  "currency": "EUR",               // text — ISO 4217, the amounts' own
  "minutes": 1830,                 // number
  "amount": 274500,                // number? — minor units; absent when a line has no rate
  "entries": 42,                   // number
  "lines": "[{\"label\":\"Design\",\"minutes\":450,\"rate\":9000,\"amount\":67500,\"entries\":12}]",
                                   // text — a JSON array, one per task and hourly rate, largest
                                   // first, at most 60; rate: minor units an hour, or null
  "path": "/chest/projects/3"      // text — the project, in Timesheets
}
```

People are never named (no member id either: an invoice line is per task
and rate). No `version` field: the Chest refuses a field not declared, and
a new shape would be a new type. Names travel without format characters
(a zero-width space, a byte-order mark, the joiner inside an emoji): the
Chest refuses them in a `text` field, so they are left out of the event
only. **What Quotes does** (its side changes with this shape; the
studio's agent that moves Quotes to 0.7.0 does it): it receives
`timesheets.billable` and `timesheets.billable-cancelled` (in its
`chest.json` `"receives"`), makes one **draft invoice** per `handoff` (a
second delivery of the same `handoff` changes nothing) for the client
(matched by `clientName`, or asked), one line per item of `lines` (label,
quantity `minutes / 60` hours, unit price `rate`); on
`timesheets.billable-cancelled` drops that draft if it was not issued
(else tells billing); and when the invoice is **issued**, emits
**`quotes.invoiced`** `{ handoff: "12", invoice: "F2026-014", path:
"/chest/invoices/14", by?: "mbr_…" }`. Timesheets receives it
(`src/calls.ts`, `/chest-events`): the hand-off's entries become invoiced,
their rates written on them, the report shows "Invoiced: F2026-014" with a
link — to the members of the event's audience only (all, or the list Quotes
named: kept on the hand-off); delivered twice, nothing more. Only from
Quotes: a type names no tool, so the same type told by another linked
tool (its `source`, stamped by the Chest) is ignored.

## How it is made

The studio's starter stack (`starter/`, `reports/06-perseus-starter.md`):
a Hono server that renders React pages (`src/pages/`), with islands
(`src/islands/`: the week's grid and day list, the timer, every form) that
call typed actions (`src/actions.ts`); the machinery is the vendored
package `@argentic/chest-app` (its `AGENTS.md`). The rules and the SQL
are `src/lib/` (every service `(sql, actor, …input)`), the pure rules the
browser shares are `src/shared/`, every word is `src/i18n/`. Vite builds
the browser's script and stylesheet into `dist/client/assets/` (served at
`/assets/`) and the server into `dist/server/`.

- **Typed input goes as typed**: a cell's `1,5` or `1.5`, a rate's
  `80,50`, a usual week's `35:30` are read again on the server
  (`src/shared/duration.ts`, `src/shared/amounts.ts` — the amount grammar
  is `field.money`'s, tested to agree).
- **No inline style or script**: bars and budget gauges are SVG shapes
  (`src/components/gauges.tsx`); the look is a stylesheet the tool serves
  (`/chest/look.css`, an ETag and a hash in its address). No `"csp"`
  permission.
- **The CSV streams** (`src/downloads.ts`): the rows are read through a
  cursor, 500 at a time, the names resolved once before.
- **Nothing kept in memory between requests** but cached `Intl` formatters
  (`src/i18n/format.ts`, the only place that makes one).

### Measured

By the studio's bench (`lab/measure/`, Node 24.21, the same way for
every tool: the repository as the Chest receives it, `npm ci` and the
build under 512 MiB and 1 CPU, 10 cold starts, 5 rests of 30 s with the
12 pages of `lab/measure/pages/timesheets.json`), 6 October 2026, before
(Next.js 16, 5 October) → after (this stack):

| | Before | After |
|---|--:|--:|
| Memory at rest, PSS of the process tree (median) | 138.8 MiB | 64.7 MiB |
| Peak PSS | 171.6 MiB | 69.0 MiB |
| First 200 after a cold start (median) | 676 ms | 573 ms |
| Image (repository + node_modules + build) | 458 MiB | 29 MiB |
| `npm ci` under 512 MiB, 1 CPU | killed (OOM) | 3.0 s, peak 289 MiB |
| Build under 512 MiB, 1 CPU | 35.4 s, peak 441 MiB | 3.8 s, peak 275 MiB |

The rests ran beside other agents' builds (load average up to 9.9): the
cold start is the noisiest number.

## Develop

```sh
npm ci
npm run build     # tsc, the browser's files, the server (no CHEST_* variable needed)
npm test          # tsc, the server built into dist/test, then the tests:
                  # PGlite, or TEST_DATABASE_URL for a real PostgreSQL
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test
npm start         # the built server, as the Chest runs it (PORT)
npm run dev       # rebuilds on every change
```

In the studio:

```sh
node lab/chest-dev/dev.mjs tools/private/timesheets --prod --build --reset --tools quotes --port 5200
node lab/chest-dev/flows/timesheets.mjs 5200
node lab/chest-dev/screens.mjs tools/private/timesheets --port 5200
node lab/chest-dev/audit.mjs tools/private/timesheets --port 5200
```

Atelier Martin comes from `seed/sample.sql`. **`--tools quotes` is needed
by the flow**: Quotes installed beside Timesheets, for the hand-off of
billable time (without it the Reports page says Quotes is not installed). Start the harness again
with `--reset` before running the flow a second time: it expects the
sample data as seeded.

## What it does not do (yet)

- **On SDK 0.7.0**: whether Quotes is installed is not said (the panel is
  offered and a send that reaches no tool says so), nor its address (the
  invoice's number shows without a link) — the studio's `chest.tools`
  proposal; the store's tile and role names stay in English for a French
  member (`translations`, a proposal); "Left the Chest on…" needs
  `members.leftAt` (a proposal); the company's theme falls back to
  Timesheets' own look. **One currency per Timesheets**: a client billed in
  another currency is invoiced by hand.
- **Invoices**: it writes no invoice itself — Quotes does, from the
  hand-off (both sides need the owner's approval of the link). One hand-off per
  project and period; no grouping of several projects of a client in one
  invoice, no notes on the invoice lines. **Amounts round per entry**: an
  entry's amount is its minutes at its rate, rounded to the cent; a
  report's totals, the CSV and the `amount` of each hand-off line add those
  up. Quotes prices a line itself (`minutes / 60` × `rate`), which may
  differ from the line's `amount` by a cent or so on a long line.
- **An entry's day is the company's day** (the Chest's zone): a timer started
  in Montréal after 18:00 for a Chest in Paris belongs to the next day, and
  a person's week is the Chest's Monday to Sunday.
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
- Members' reports show a project's whole budget: in hours as it is
  ("251:15 of 230:00 used"), in money as a share only ("64 % of the budget
  used") — never an amount, which beside their hours would give the rate.
- Approval is weekly and by the whole week (a lead is asked first, any
  other manager may approve; no approval line by line, no monthly periods).
- No export of the projects and clients themselves (their time exports as
  CSV); no Toggl JSON data export import; no entry edit history;
  punch-in/out for legal working hours is not this tool.
- Never: screenshots, activity or idle tracking.
