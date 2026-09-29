# Adapting Timesheets — a guide for AI agents

Timesheets is a Next.js (App Router) tool of the Chest. Read `README.md`
first; this page is the map and the rules.

## Map

| Where | What |
|---|---|
| `lib/access.ts` | Roles (`manager`, `member`), abilities, `offered()` (which projects someone may record on) |
| `lib/model.ts` | Bounds and checks: `clean`, `id`, `day`, `minutes`, `cents`, colours |
| `lib/duration.ts` | What people type → minutes (`parseDuration`), and back (browser-safe) |
| `lib/days.ts`, `lib/periods.ts` | Days, weeks (Monday), wall clocks in a zone, report periods (browser-safe) |
| `lib/clock.ts` | The Chest's time zone and currency (`@argentic/chest-sdk/chest`), `clock.now` (tests move it) |
| `lib/projects.ts` | Clients, projects, tasks, people, budgets; `offeredProjects`, `writable` |
| `lib/entries.ts` | Entries, the week grid (`week`, `saveCell`, `setNote`, rows), the day list; the 24-hour rule; `checkOpen` (lock + closed week) |
| `lib/rates.ts` | Rates with a history (billable per project / person / person on a project, cost per person); SQL `bill_rate()`/`cost_rate()` resolve by the entry's day; `fixRates` writes them on entries for good |
| `lib/weeks.ts` | Send / take back / approve / send back a week (`weekLock`), the team's weeks, usual weeks (`capacities`), *Remind*, a person's week for a manager |
| `lib/budgets.ts` | Budget alerts at 80 and 100 %, once per threshold (`budget_alerts`) |
| `lib/invoicing.ts` | Mark a report's billable time invoiced (locks it, fixes its rates), and undo |
| `lib/handoff.ts`, `app/chest/reports/quotes-panel.tsx` | Billable time to Quotes: `sendBillable` (event `timesheets.billable` v1), `cancelHandoff` (`timesheets.billable_cancelled`), `invoiced` (Quotes' `quotes.invoiced`, from `app/chest-events/route.ts`), `sendable`, `recentHandoffs` |
| `lib/mail.ts` | Email beside the bell (mail proposal): Remind, the Friday reminder, a week sent to approve |
| `lib/tx.ts` | `transaction()` (one transaction, or the caller's) |
| `lib/timer.ts` | The running timer; forgotten timers; the leaver's timer |
| `lib/reports.ts` | Reports and export rows, scoped to the actor in SQL; the notes' search (`q`, `foundEntries`) |
| `lib/settings.ts` | Locked period, usual week and reminder, approvals on/off, hours style |
| `lib/import-formats.ts`, `lib/import.ts` | Toggl/Clockify/Harvest CSV → plan → import (idempotent by fingerprint); former people (`imp_…` authors, `former_people`); locked rows only when asked; the old tool's rates |
| `lib/reminder.ts`, `app/chest-jobs/` | The Friday reminder (schedules proposal) |
| `lib/lifecycle.ts`, `app/chest-events/` | Leave, erasure |
| `app/chest/actions.ts` | Server actions: thin, `act(actor => service(...))` |
| `app/chest/**` | Pages (server) and views (`"use client"`) |
| `lib/i18n/en.ts`, `fr.ts` | Every word (with the UI kit's sections: `toast`, `dialog`, `date`, `files`, `table`); `format.ts` for dates, numbers, money |
| `lib/theme.ts` | The identity (the kit's catalogue theme *Instrument*, `identityOf("timesheets")`) and `currentLook()` (the Chest's choice, else the identity) |
| `app/layout.tsx` | `<ThemeStyle>` with the page's nonce; `@argentic/chest-ui/components.css`, then `app/tokens.css` (the tool's own tokens, from contract tokens) and `app/globals.css` |
| `components/shell.tsx`, `app/chest/layout.tsx` | The kit's `AppShell` (tabs, member chip, `BrandMark`, `NoAccess`), the timer, `Toasts` |
| `components/work-picker.tsx` | The project picker: the tool's own combobox (the kit has no picker of records), with the kit's keys (`listKey`) and search (`matches`) |

## Rules added after the second critique (2026-09-29)

- **A rate's first day** is checked in the form (`components/rate-day.ts`,
  the lock's sentence from `rateLock()` in `lib/rates.ts`) and on the
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
  invoiced in `lib/entries.ts`) until Quotes answers or a manager takes it
  back. The event's contract is in README "With the other tools": change it
  only with a new `version`.
- **Emails** leave through `lib/mail.ts` with a short key (the recipient is
  appended; 64 characters in all).

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test
```

## The UI kit (`@argentic/chest-ui`, in `vendor/`)

Used: `AppShell`/`Nav` (via `components/shell.tsx`), `BrandMark`, `NoAccess`,
`PageHeader`, `Toasts`/`useToast`, `Dialog` (the forgotten timer),
`Confirm` (forgetting a former member's name), `DateField` (lock date, rate
dates), `DateRangeField` (a report's own dates), `Segmented`, `FilePicker` (import), `DataTable`
(the team's weeks, the report's breakdown), `StatusBadge`, `Avatar`,
`EmptyState`, `LanguageSwitch`, `useAutoRefresh`, `useFloat` (the project
picker's list over a box that scrolls); `listKey`/`matches` from
`/components/logic`. `link={Link}` is Next's `Link` as it is. The panel is
`--inverse` with its own pairs (`app/tokens.css`): put only `--panel-ink`
/ `--panel-ink-2` text on it, never the signal. Kept on purpose: the week grid (an editable
spreadsheet of cells, not a list of records), the day strip (totals under
each day), the period chips of the reports (radios of the report's one GET form,
sent with its other fields — the kit's `Filters` are links, each group its
own form), the project picker (above).

## Rules

- **Looks**: the CSS names only contract tokens (`ui/tokens/CONTRACT.md`) and
  the tool's tokens of `app/tokens.css`, which are defined from them — never
  a colour (`test/theme.test.ts` checks it, and that every `var()` is
  defined). Text only on measured pairs; `color-mix()` for decoration only.
- **Kit first**: a toast, dialog, confirm, date field, file picker, table,
  badge, avatar, empty state is the kit's. `window.confirm` and
  `<input type="date">` never. Reversible → toast with `undo`; the bell
  already rang → `sent: true`; irreversible → `Confirm`.
- **Words**: `node scripts/lint-words.mjs tools/private/timesheets` stays at
  0 (the store's glossary: Undo is « Annuler l’action », a narrow no-break
  space before `: ; ? !` and inside « »).

- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids
  (or `erased`), never names.
- **Every service takes `(sql, actor, …input: unknown)`**, checks rights
  first, validates every input, throws `AppError(code)`; never a sentence.
- **Time is only ever one's own**: entry queries filter on `member_id =
  actor.id`; reports force the member's own id unless `reports.all`.
- **Writes that touch a person's day** take the person's advisory lock and
  end with `checkDayTotal` inside the same transaction.
- **Locked days**: every write to a person's day goes through
  `checkOpen(tx, memberId, day)` (locked period, week sent or approved) for
  the old *and* the new day, and refuses an invoiced entry (`invoiced`).
- **Money**: never read `projects.rate_cents` for an amount (it is only a
  mirror for the previous version); use `revenueOf`/`costOf`/`billRateOf`
  from `lib/rates.ts`. Amounts and costs are computed for managers only.
- **After a write that changes time or a budget**, call `checkBudgets`
  (outside the transaction; it never fails the write).
- **Authors**: an entry's `member_id` is `mbr_…`, `erased`, or `imp_<n>` (a
  former person of an import, named in `former_people`); `people()` resolves
  all three.
- **Days vs instants**: an entry has a `day` (the Chest's calendar day) and
  optional instants; format days with `formatDay` (UTC), instants with the
  zone from `lib/clock.ts`. Never hard-code a zone or a currency.
- **Client components import only** browser-safe modules (`lib/duration.ts`,
  `lib/days.ts`, `lib/work.ts`, `lib/amounts.ts`, `lib/i18n/format.ts`,
  `lib/import-formats.ts`, `lib/model.ts`, `lib/app-error.ts`) and types.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders and look for words in `.tsx` files).
- **Add an ability → `test/access.test.ts`. Add a service → tests for each
  role and each refusal.**
- **No network, no disk, no background work.** Never add tracking of
  people's activity.
