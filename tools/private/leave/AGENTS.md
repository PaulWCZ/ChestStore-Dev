# Adapting Leave — a guide for AI agents

`README.md` says what Leave does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `hr`, `manager`, `employee`; `database`, `members`, `notifications`; `receives` |
| `chest.proposals.json` | Manifest keys of SDK proposals (the `morning` schedule) |
| `lib/access.ts` | **Who may do what**: abilities (`can`), what one sees of someone's leave (`sightOf`: own, approver, team), who may answer (`mayDecide`) |
| `lib/calendar.ts` | **Pure**, browser-safe: days, French public holidays, the cost of a span (ouvrés, ouvrables, calendar), overlaps, earned leave |
| `lib/rules.ts` | The company's settings and kinds of leave |
| `lib/requests.ts` | Asking, answering, undoing, cancelling; lists (mine, waiting, calendar entries) |
| `lib/balances.ts` | The ledger and balances (`compute` is pure); adjustments, openings |
| `lib/staff.ts` | Each person's approver and start date |
| `lib/routing.ts` | Who answers a person's requests, given the directory (pure) |
| `lib/directory.ts` | The members who have the tool, from the Chest |
| `lib/import.ts`, `lib/csv.ts` | Balance import (pure plan), CSV read/write (formula-safe) |
| `lib/payroll.ts` | The month's approved absences for payroll |
| `lib/tell.ts`, `lib/notify.ts` | The bell (each recipient's language) and approvers' tile numbers |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/morning.ts` | The weekday reminder (schedule proposal) |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` (dates, days, spans) for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/**/page.tsx` | Pages (server): read, resolve names, hand words to views |
| `app/chest/new/request-form.tsx` | The request form (client): the live cost uses `lib/calendar.ts` |
| `app/chest/calendar/page.tsx` | The month grid and the phone's day list (server-rendered) |
| `app/chest/people/export/route.ts` | The payroll CSV |
| `migrations/` | Schema. Never edit a shipped file; add `0002_…` |
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
  `lib/app-error.ts`, `lib/initials.ts`, `lib/type-name.ts` and types.
  Never the SDK, `lib/db.ts`, `lib/session.ts`.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Earned leave is computed on
  read; reminders only through the schedule proposal.
