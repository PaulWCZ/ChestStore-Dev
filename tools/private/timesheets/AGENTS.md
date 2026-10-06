# Adapting Timesheets — a guide for AI agents

Timesheets is a tool of the Chest on the studio's starter stack: Hono,
React rendered on the server, islands, Vite, and the vendored package
`@argentic/chest-app` — read its `node_modules/@argentic/chest-app/AGENTS.md`
first (pages, islands, actions, words, tests, pitfalls), then `README.md`.
This page is the map and the tool's own rules.

## Map

| Where | What |
|---|---|
| `src/app.tsx` | Every route: the pages (`members()` adds the timer above each, or NoAccess), the CSV, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | Every mutation, by name; durations, amounts and hours as typed, read here (`duration`, `money`, `hours` fields) |
| `src/calls.ts` | `/chest-events` (lifecycle, `quotes.invoiced`) and `/chest-schedules` (`friday`, then old deliveries forgotten) |
| `src/downloads.ts` | The report's CSV, streamed through a cursor |
| `src/layout.tsx`, `src/timer-view.ts` | The kit's shell, the tabs, the timer island (fed by each page's `layout: { timer }`), the toasts |
| `src/pages/` | Week, Reports, Team, PersonWeek, People, Projects (list, new, one), Settings, Import, PublicHome |
| `src/islands/` | WeekView (+ DayPanel: one island keyed `week-<monday>`), TimerBar, Team (WaitingList, Decision, ApproveAll, RemindButton, TeamTable), People, Clients, ProjectForm (+ TasksEditor), PersonRates, ReportViews, QuotesPanel, MarkInvoiced, SettingsView, Importer, AutoRefresh, AutoSubmit; `index.ts` lists them |
| `src/components/` | Icons, the mark, the project picker (`work-picker.tsx`: the kit has no picker of records), SVG gauges (`gauges.tsx`), `useStep` (`step.ts`) |
| `src/lib/access.ts` | Roles (`manager`, `member`), abilities, `offered()` |
| `src/lib/clock.ts` | The Chest's zone and currency, today (= the database's `current_date`), `clock.now` (tests move it) |
| `src/lib/projects.ts` | Clients, projects, tasks, people, budgets; `offeredProjects`, `writable` |
| `src/lib/entries.ts` | Entries, the week grid (`week`, `saveCell`, `setNote`, rows), the day list; the 24-hour rule; `checkOpen` |
| `src/lib/rates.ts` | Rates with a history; SQL `bill_rate()`/`cost_rate()`; `fixRates` |
| `src/lib/weeks.ts` | Send / take back / approve / send back a week, the team's weeks, usual weeks, *Remind* |
| `src/lib/budgets.ts`, `invoicing.ts`, `handoff.ts` | Budget alerts; invoiced time; billable time to Quotes (`timesheets.billable` v1) |
| `src/lib/mail.ts`, `notify.ts`, `people.ts`, `directory.ts` | Email (proposal), the bell, names of stored ids (with `leftAt`, `no_access`), the Chest's members |
| `src/lib/timer.ts`, `reports.ts`, `settings.ts`, `import.ts`, `reminder.ts`, `lifecycle.ts`, `tx.ts`, `db.ts` | The timer; reports and export batches; settings; import; the Friday reminder; leave and erasure (and `seen`); transactions; the pool (`DATABASE_POOL_MAX`, `provide` for tests) |
| `src/shared/` | Pure rules both sides use: `duration.ts`, `amounts.ts`, `days.ts`, `periods.ts`, `work.ts`, `model.ts`, `csv.ts`, `import-formats.ts`, `rate-day.ts` — no SDK, no server code (`test/stack.test.ts`) |
| `src/i18n/` | Every word (`en.ts` source, `fr.ts`; `kit` is the UI kit's), `format.ts` the only place that makes `Intl` objects (cached) |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity *Instrument* and the look served as `/chest/look.css`; the tool's tokens and CSS |
| `public/assets/` | Fonts, icon (served at `/assets/`, the only `build.static` prefix) |
| `test/` | Services (one file each), `app.test.ts` (the built server), `stack.test.ts` (sources, words, Intl), `units.test.ts` |

## Rules added after the second critique (2026-09-29)

- **A rate's first day** is checked in the form (`components/rate-day.ts`,
  the lock's sentence from `rateLock()` in `src/lib/rates.ts`) and on the
  server (`rate_locked`): never fall back to today when a typed day is
  refused. The kit's `DateField` is not given `min` for it (its `min`
  drops a day typed before it, and the old value would be saved).
- **Approving** a week not over or under the usual week needs `anyway`
  (`weeks.approveWeek(…, { anyway: true })`, `week_short` otherwise);
  `fullness()`/`needsLook()` say it; the bulk action sends only complete
  weeks.
- **A person's start** (`startWeeks`: first entry, else `seen.first_seen`
  written once by `seenNow` in the members' layout, never before
  `toolStart`): cells before it are `before` ("—"), never short, never
  reminded (`isShort`). Erasure deletes the `seen` row.
- **The signal on the panel** is `--panel-signal` (the kit's
  `--inverse-signal`, 0.2.3), never `--signal`; decoration (the grid's
  ruler) is keyed on `--decor`.

## Rules added after the third critique (2026-09-29)

- **Nobody approves or sends back their own week** (`self_approval` in
  `approveWeek`/`returnWeek`); `waiting()` marks it `mine`, the bulk action
  and the Team page leave it out. Remind never includes the actor.
- **A project's lead** (`projects.lead_id`) must be a manager when named
  (`isManager`, `lead_invalid`); an update without `lead` keeps it. Budget
  alerts go to the lead (else every manager); a week sent goes to the leads
  of the projects it holds (`approversOf`), else every other manager.
  Leaving clears the lead.
- **A hand-off locks its entries** like an invoice (`handoff_id` counts as
  invoiced in `src/lib/entries.ts`) until Quotes answers or a manager takes it
  back. The event's contract is in README "With the other tools": change it
  only with a new `version`.
- **Emails** leave through `src/lib/mail.ts` with a key built from what names
  the email (the recipient is appended) and given **whole** — never cut:
  the SDK sends a long one as its digest. None is
  `transactional`: each asks someone to act, so the person's choice in the
  Chest (`mailPreference`) holds.

## Commands

```sh
npm ci && npm run build && npm test   # all must pass
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test
NODE_ENV=development npm test         # as a workbench runs them
```

## The UI kit (`@argentic/chest-ui`, in `vendor/`)

Used: `AppShell`/`Nav` (via `components/shell.tsx`), `BrandMark`, `NoAccess`,
`PageHeader`, `Toasts`/`useToast`, `Dialog` (the forgotten timer),
`Confirm` (forgetting a former member's name), `DateField` (lock date, rate
dates), `DateRangeField` (a report's own dates), `Segmented`, `FilePicker` (import), `DataTable`
(the team's weeks, the report's breakdown), `StatusBadge`, `Avatar`,
`EmptyState`, `LanguageSwitch`, `useFloat` (the project
picker's list over a box that scrolls); `listKey`/`matches` from
`/components/logic`. Links are plain `<a href>`: the package moves between pages in place. The panel is
`--inverse` with its own pairs (`src/tokens.css`): put only `--panel-ink`
/ `--panel-ink-2` text on it, never the signal. Kept on purpose: the week grid (an editable
spreadsheet of cells, not a list of records), the day strip (totals under
each day), the period chips of the reports (radios of the report's one GET form,
sent with its other fields — the kit's `Filters` are links, each group its
own form), the project picker (above).

## Rules

- **Looks**: the CSS names only contract tokens (`ui/tokens/CONTRACT.md`) and
  the tool's tokens of `src/tokens.css`, which are defined from them — never
  a colour (`test/theme.test.ts` checks it, and that every `var()` is
  defined). Text only on measured pairs; `color-mix()` for decoration only.
- **Kit first**: a toast, dialog, confirm, date field, file picker, table,
  badge, avatar, empty state is the kit's. `window.confirm` and
  `<input type="date">` never. Reversible → toast with `undo`; the bell
  already rang → `sent: true`; irreversible → `Confirm`.
- **Words**: `node scripts/lint-words.mjs tools/private/timesheets` stays at
  0 (the store's glossary: Undo is « Annuler l’action », a narrow no-break
  space before `: ; ? !` and inside « »).

- **Identity only from `member()`** (the package's `page()`/`action()` give it); store `mbr_…` ids
  (or `erased`), never names.
- **Every service takes `(sql, actor, …input: unknown)`**, checks rights
  first, validates every input, throws `AppError(code)` (the package's);
  never a sentence. An action passes what was sent (`sent<W>()`).
- **Time is only ever one's own**: entry queries filter on `member_id =
  actor.id`; reports force the member's own id unless `reports.all`.
- **Writes that touch a person's day** take the person's advisory lock and
  end with `checkDayTotal` inside the same transaction.
- **Reads before a write are locked reads**: an entry read to be changed
  is read `for update` (a hand-off or an invoicing marking it meanwhile is
  then seen: `invoiced`); the settings a write checks are read
  `settings(tx, { share: true })` (a period locked meanwhile waits for the
  write, or the write sees the lock). `test/races.test.ts` (PostgreSQL)
  holds both.
- **Amounts round per entry** (`entryAmount`, `revenueOf`, `costOf` in
  `src/lib/rates.ts`): each entry to the cent, then added — reports, the
  CSV and the hand-off's lines agree to the cent.
- **A hand-off writes its rates** on its entries (`handoff_fixed`); taken
  back (`release`), they are forgotten again. It is offered and sent only
  when `events.receivers("timesheets.billable")` names a tool (`linked()`);
  0 receivers undoes it (`quotes_unavailable`).
- **Members never see money**, not even derived: a money budget is a
  share for them (`kind: "share"` in `report()`).
- **Locked days**: every write to a person's day goes through
  `checkOpen(tx, memberId, day)` (locked period, week sent or approved) for
  the old *and* the new day, and refuses an invoiced entry (`invoiced`).
- **Money**: never read `projects.rate_cents` for an amount (it is only a
  mirror for the previous version); use `revenueOf`/`costOf`/`billRateOf`
  from `src/lib/rates.ts`. Amounts and costs are computed for managers only.
- **After a write that changes time or a budget**, call `checkBudgets`
  (outside the transaction; it never fails the write).
- **Authors**: an entry's `member_id` is `mbr_…`, `erased`, or `imp_<n>` (a
  former person of an import, named in `former_people`); `people()` resolves
  all three, with `leftAt` for a former member (null when the Chest does
  not say, and for imported people).
- **Days vs instants**: an entry has a `day` (the Chest's calendar day) and
  optional instants; format days with `formatDay` (UTC), an entry's hours
  with the zone from `src/lib/clock.ts` (they belong to the Chest's day), when
  something happened (sent, approved, locked, left) with the reader's
  `member.timeZone`. Never hard-code a zone or a currency.
- **Islands import only** `src/shared/`, `src/components/`,
  `src/i18n/format.ts`, the kit, `@argentic/chest-app/client`, and types.
- **No inline style**: a size from data is an SVG attribute
  (`src/components/gauges.tsx`); `checkPage` refuses `style=` in every
  page the tests render.
- **Words live in `src/i18n/`**, in every catalogue (tests compare keys and
  placeholders and look for words in `.tsx` files).
- **Add an ability → `test/access.test.ts`. Add a service → tests for each
  role and each refusal.**
- **No network, no disk, no background work.** Never add tracking of
  people's activity.
