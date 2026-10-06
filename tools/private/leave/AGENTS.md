# Adapting Leave — a guide for AI agents

`README.md` says what Leave does; this page says where things are and what
must not break. How a tool on this stack is built — pages, islands,
actions, words, the database, tests, recipes, pitfalls — is
`node_modules/@argentic/chest-app/AGENTS.md`: read it first. The SDK's is
`node_modules/@argentic/chest-sdk/AGENTS.md`, the kit's
`node_modules/@argentic/chest-ui/AGENTS.md`.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest (contract 0.4): roles `hr`, `manager`, `employee`; `database`, `members`, `notifications`; `receives`; the `morning` schedule; `build.static: ["/assets/"]` |
| `chest.proposals.json` | Manifest keys of SDK proposals (`mail`, `calendar`, `groups`, `emits` incl. `leave.busy`, `receives` from People, `translations`) |
| `src/app.tsx` | **Every route**: the pages (`members()` runs a page only for a member with a role, and counts what waits for an approver: the layout's "To answer"), payroll's two downloads, `/chest-events`, `/chest-schedules`, the host's root |
| `src/actions.ts` | **Every mutation**, by name (`call("askLeave", …)` from an island). Thin: the services check everything; `keepInLine()` after each change |
| `src/calls.ts` | What the Chest posts by itself: events (`events.handle`) and schedule runs (`schedules.handle`, `morning`), with the durable `seen` |
| `src/downloads.ts` | Payroll's CSVs: the month's absences, everyone's balances on a day |
| `src/pages/` | The pages, rendered on the server: Home, NewRequest, Request, Approvals, Calendar, People, Person, Import, Payroll, Settings, PublicHome |
| `src/islands/` | What runs in the browser (`index.ts` lists them): the request form, the approval cards, a request's actions, my requests (Cancel + Undo), HR's forms, the people table, the settings, the email switch, AutoRefresh |
| `src/layout.tsx` | The kit's shell and sections, NoAccess, the toasts; the public layout |
| `src/shared/` | **Browser-safe rules** islands share with the server: `calendar.ts` (days, French public holidays, the cost of a span with the person's week, overlaps, months earned), `left.ts` (the one "days left"), `model.ts` (input rules, limits, colours), `normalize.ts`, `status.ts`, `type-name.ts` |
| `src/lib/access.ts` | **Who may do what**: abilities (`can`), what one sees of someone's leave (`sightOf`: own, approver, team), who may answer (`mayDecide`) |
| `src/lib/rules.ts` | The company's settings and kinds of leave |
| `src/lib/requests.ts` | Asking (for oneself, or recorded for someone by HR / their approver), answering, undoing, cancelling, importing approved leave; lists (mine, waiting, pending, calendar entries) |
| `src/lib/balances.ts` | The ledger and balances: `compute` (pure) — years (N-1 / N, calendar year, running), oldest days first, the end of a year (carried over or lost), the last day; adjustments, openings (two parts for paid leave) |
| `src/shared/left.ts`, `src/lib/balance-words.ts` | **The one "days left"** and "balance after" (pure, browser-safe); a balance in words, the same on every screen |
| `src/lib/staff.ts` | Each person's approver, start date, last day, week (work days) and employee number; who left |
| `src/lib/last-day.ts` | A last day set: leave after it cancelled, leave across it cut, days given back (reason key `afterLastDay`) — by the Chest's leaving event and by HR |
| `src/lib/setup.ts` | HR's first-run checklist |
| `src/lib/routing.ts` | Who answers a person's requests, given the directory (pure) |
| `src/lib/directory.ts` | The members who have the tool, from the Chest; the Chest's groups for *Who's away* (`groups.all`/`groups.members` with the groups proposal, else the groups that give Leave) |
| `src/lib/import.ts`, `src/shared/normalize.ts`, `src/lib/csv.ts` | The two imports (pure plans: people and balances; approved leave), header recognition and HR's mapping, Lucca's columns; CSV read/write (formula-safe). Fixtures in `test/fixtures/` |
| `src/lib/payroll.ts` | The month's approved absences for payroll (`src/downloads.ts`: the CSVs) |
| `src/lib/tell.ts`, `src/lib/notify.ts` | The bell (each recipient's language) and approvers' tile numbers |
| `src/lib/lifecycle.ts` | Leaving and erasure; `tools()`: the handlers of other tools' events |
| `src/lib/from-people.ts` | People → Leave (events between tools): `people.record` (number, first day, week, last day), `people.leaving(_cancelled)`; checked field by field, older events ignored, a last day People set is the only one People clears (`staff.end_by`) |
| `src/lib/mail.ts` | Emails beside the bell (mail proposal): `email()` in each reader's language, the person's switch (`staff.email_off`); the Chest's choice (`mail.preference()`, `mailPreference()` for the home) applies in `mail.send`; only answers to one's own request are `transactional` |
| `src/lib/leave-calendar.ts`, `src/lib/spans.ts` | Approved leave in each person's Chest calendar feed (calendar proposal): `sync()` puts what changed (`putMany`, 100 a call) and takes back what no longer stands (`calendar_events`); title "Off", private, never the kind. `spans.ts`: a leave as instants in a zone (noon for halves); `src/lib/zones.ts`: each person's zone (members API, else the Chest's) for the hours of their days off |
| `src/lib/busy.ts`, `src/lib/busy-snapshot.ts` | `leave.busy` for Booking/Hiring: each member's approved leave, 90 days, times only, told when it changed (`shared_busy`). `busy-snapshot.ts` is the same file as Booking's and Hiring's — keep them equal |
| `src/lib/share.ts` | Events to Rooms and People (`leave.approved`/`cancelled`): `plan()` compares approved absences with what was told (`shared_leave`) and writes what differs to the outbox (`leave_outbox`), `publish()` sends it (retried at the next run); absences only (`away`), a cut is cancelled + approved. `keepInLine()`: these events, calendar and busy times after each change, event and morning |
| `src/lib/morning.ts` | The weekday reminder (schedule `morning` of `chest.json`, run by `src/calls.ts`) |
| `src/lib/today.ts` | **Today** = `chest.today()`, the Chest's day (= the database's `current_date`; server only). Never a day from UTC or the browser |
| `migrations/` | Schema: `0001` the tool, `0002` years, weeks, last days, employee numbers, family events, remote work; `0003` payroll codes, family events on worked days, ledger reason keys, `after_last_day`/`cut` history steps; `0004` who set a last day (`end_by`), when People last told, the email switch, paid leave not below zero by default; `0005` what is in the calendar feeds, the calendar's state, the busy times last told; `0006` what Rooms and People were told (`shared_leave`) and the events' outbox. Never edit a shipped file; add `0007_…` |
| `seed/sample.sql` | A seven-person company, dates around today |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (`TEST_DATABASE_URL`, else PGlite: one connection, `DATABASE_POOL_MAX=1`); `app.test.ts` asks the built server (`dist/test`), `sources.test.ts` runs the package's checks |
| `src/theme.ts` | **The look**: the identity "Seaside" (`defineTheme`, equal to the catalogue's) and `sheetOf()`/`lookFor()` (the company's choice from `chest.theme()`, else the identity, served as `/chest/look.css`) |
| `src/tokens.css`, `src/styles.css` | Leave's own tokens (kinds → categorical slots, calendar shades), defined from contract tokens only; its components |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`, `kit` (the kit's words); `format.ts` (days, spans, numbers — Intl objects cached; the year written when a day is in another one) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass (TEST_DATABASE_URL: a real PostgreSQL; else PGlite)
NODE_ENV=development npm test        # as the workbench runs them
```

## Rules

- **Identity only from `member`** of the page or action (the package reads
  the Chest's assertion); store `mbr_…` ids,
  never names or addresses (the import matches names, stores ids).
- **Every service function takes `(sql, actor, …input)`**, checks rights
  first and throws `AppError(code)`. Someone's leave the actor may not see is
  `not_found`, never `forbidden`. **Colleagues never learn the kind of
  someone's leave** (`between()` hides it): keep it so, it is health data for
  sick leave.
- **One "days left"**: `Balance.left` (approved leave deducted, waiting days beside it). Never show `left − pending` as "left"; use `leftIfApproved`/`afterRequest` (`src/shared/left.ts`) and say what they count.
- **Years are computed, never stored**: no job closes a period; `compute` classifies days by the dates. A new rule is a change there, with its test in `test/years.test.ts`.
- **Days are the company's, hours the person's**: "today" is `today()`
  (`src/lib/today.ts`, `chest.today()`), never `new Date().toISOString()`; in
  SQL `current_date` and a `date` compared with a `timestamptz` are in the
  Chest's zone too (the Chest sets the sessions' TimeZone; tests do the
  same, `testDatabase({timeZone})`). An instant shown to someone, or the
  hours of their day off (feed, busy times), are in their zone
  (`member.timeZone`, `src/lib/zones.ts`). `test/zones.test.ts` runs a Chest at
  UTC+14 with a member in Montréal.
- **A line the tool writes itself has a `reason_key`** (`opening`, `rttYear`, `afterLastDay`), written in the reader's language (`team.reasonKeys`); never write an English sentence into `reason` from code or seed.
- **A last day never leaves leave after it counting**: every way of setting one goes through `settleAfterLastDay` (`src/lib/last-day.ts`), in the same transaction.
- **Every bell item about a request goes through `tellBoth`** (lib/tell.ts):
  the same words by email, never the note.
- **What leaves the tool about approved leave says "Off", never why**: the
  calendar event's title is `feed.title` for every kind, private; the
  busy times are times only. A change to requests' status must be
  followed by `share.keepInLine` (actions do it through `keepInLine()`;
  lifecycle and People's handlers call it) — never put or publish from elsewhere:
  `keepInLine` finds every change itself (a last day that cuts or cancels
  leave included), so a new way of changing leave needs no event code.
  Only kinds with `away` are told to Rooms and People.
- **Mail keys are given whole** (the SDK hashes long ones; never
  `.slice`); `transactional` only for the answer to the person's own
  request.
- **A last day People told is People's**: set with `end_by` 'record' or
  'leaving'; People never clears 'hr' or 'chest'. HR's own setter writes
  'hr'.
- **Payroll files write names with `plainName`**, never "(former member)".
- **The ledger is append-only** (a trigger refuses updates and deletes, but
  the erasure's anonymisation). Correct a balance by adding a line.
- **A request's cost is fixed when asked** (`requests.days`); counting rules
  live in `src/shared/calendar.ts` only, shared by the form and the server. A
  change of rule is a change there, with its test in `test/calendar.test.ts`.
- **No note on a kind with `notes = false`** (sick leave): never add a field
  that could hold a diagnosis.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role and its refusals.
- **Islands import only** `src/shared/`, `src/i18n/format.ts`, types,
  `src/components/`, the kit and `@argentic/chest-app/client`
  (`checkSources` refuses `src/lib/` in an island). They call actions with
  `call()`; a refusal is the reader's sentence (`result.message`). Changes
  sent in a row from one island go one after the other (a queue), and the
  services serialise concurrent writes in SQL (`for update`): `call()`
  sends in parallel. An island whose subject can change is keyed by it
  (`<Island id={`ask-${who}`} …>`).
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Earned leave is computed on
  read; reminders only through the schedule proposal.
- **The look is the theme's**: never a colour in CSS or in a page — use the
  contract's tokens (`ui/tokens/CONTRACT.md`) or Leave's tokens in
  `src/tokens.css`, defined from them (`test/theme.test.ts` and `checkSources` fail on a
  literal). Text only on measured pairs: on a kind's `--k` the text is
  `--k-ink`; on `--accent`, `--accent-ink`. A new kind colour is a new
  categorical slot mapping in `src/tokens.css` (and `colors` in
  `src/shared/model.ts`). Weights come from `--display-weight` / `--weight-strong`.
- **The kit's components first** (`@argentic/chest-ui/components`): toasts
  through `toast()` (an Undo that returns whether it worked; `sent: true`
  when the bell already told someone and nothing is taken back), `Dialog`
  with `dirty`, `DateField` (never `type="date"`), `PeoplePicker`,
  `Segmented`, `DataTable` (`rowHref`, `phone="stack"`), `Filters`, `Tabs`,
  `StatusBadge`, `Avatar`, `EmptyState`, `FilePicker`, `Switch` (only for
  what takes effect at once), `MonthField`, `AppShell`. Their words are the
  catalogues' `kit`. Never `window.confirm`. No `style={}`, no inline
  script: the policy blocks them.
- **Words follow the store's glossary** (`lab/GLOSSARY.md`): `node
  scripts/lint-words.mjs tools/private/leave` must stay at 0 (French: a
  narrow no-break space before `: ; ? !`, Undo = « Annuler l’action »).
- In brand mode the company's logo stands where the mark is (`BrandMark`
  in `src/layout.tsx`).
