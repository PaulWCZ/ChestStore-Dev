# Adapting Leave — a guide for AI agents

`README.md` says what Leave does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `hr`, `manager`, `employee`; `database`, `members`, `notifications`; `receives` |
| `chest.proposals.json` | Manifest keys of SDK proposals (the `morning` schedule) |
| `lib/access.ts` | **Who may do what**: abilities (`can`), what one sees of someone's leave (`sightOf`: own, approver, team), who may answer (`mayDecide`) |
| `lib/calendar.ts` | **Pure**, browser-safe: days, French public holidays, the cost of a span (ouvrés, ouvrables, worked days, calendar — with the person's week: from the first day they would have worked to the day before they are back), overlaps, months earned |
| `lib/rules.ts` | The company's settings and kinds of leave |
| `lib/requests.ts` | Asking (for oneself, or recorded for someone by HR / their approver), answering, undoing, cancelling, importing approved leave; lists (mine, waiting, pending, calendar entries) |
| `lib/balances.ts` | The ledger and balances: `compute` (pure) — years (N-1 / N, calendar year, running), oldest days first, the end of a year (carried over or lost), the last day; adjustments, openings (two parts for paid leave) |
| `lib/left.ts`, `lib/balance-words.ts` | **The one "days left"** and "balance after" (pure, browser-safe); a balance in words, the same on every screen |
| `lib/staff.ts` | Each person's approver, start date, last day, week (work days) and employee number; who left |
| `lib/setup.ts` | HR's first-run checklist |
| `lib/routing.ts` | Who answers a person's requests, given the directory (pure) |
| `lib/directory.ts` | The members who have the tool, from the Chest |
| `lib/import.ts`, `lib/normalize.ts`, `lib/csv.ts` | The two imports (pure plans: people and balances; approved leave), header recognition and HR's mapping, Lucca's columns; CSV read/write (formula-safe). Fixtures in `test/fixtures/` |
| `lib/payroll.ts` | The month's approved absences for payroll (`app/chest/people/balances/route.ts`: everyone's balances on a day) |
| `lib/tell.ts`, `lib/notify.ts` | The bell (each recipient's language) and approvers' tile numbers |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/morning.ts` | The weekday reminder (schedule proposal) |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` (dates, days, spans) for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/**/page.tsx` | Pages (server): read, resolve names, hand words to views |
| `app/chest/new/request-form.tsx` | The request form (client): the live cost uses `lib/calendar.ts` |
| `app/chest/calendar/page.tsx` | The month grid and the phone's day list (server-rendered) |
| `app/chest/people/export/route.ts` | The payroll CSV |
| `migrations/` | Schema: `0001` the tool, `0002` years, weeks, last days, employee numbers, family events, remote work. Never edit a shipped file; add `0003_…` |
| `seed/sample.sql` | A seven-person company, dates around today |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids,
  never names or addresses (the import matches names, stores ids).
- **Every service function takes `(sql, actor, …input)`**, checks rights
  first and throws `AppError(code)`. Someone's leave the actor may not see is
  `not_found`, never `forbidden`. **Colleagues never learn the kind of
  someone's leave** (`between()` hides it): keep it so, it is health data for
  sick leave.
- **One "days left"**: `Balance.left` (approved leave deducted, waiting days beside it). Never show `left − pending` as "left"; use `leftIfApproved`/`afterRequest` (`lib/left.ts`) and say what they count.
- **Years are computed, never stored**: no job closes a period; `compute` classifies days by the dates. A new rule is a change there, with its test in `test/years.test.ts`.
- **The ledger is append-only** (a trigger refuses updates and deletes, but
  the erasure's anonymisation). Correct a balance by adding a line.
- **A request's cost is fixed when asked** (`requests.days`); counting rules
  live in `lib/calendar.ts` only, shared by the form and the server. A
  change of rule is a change there, with its test in `test/calendar.test.ts`.
- **No note on a kind with `notes = false`** (sick leave): never add a field
  that could hold a diagnosis.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role and its refusals.
- **Client components import only** `lib/calendar.ts`, `lib/i18n/format.ts`,
  `lib/app-error.ts`, `lib/initials.ts`, `lib/type-name.ts`, `lib/left.ts`,
  `lib/normalize.ts` and types.
  Never the SDK, `lib/db.ts`, `lib/session.ts`.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Earned leave is computed on
  read; reminders only through the schedule proposal.
