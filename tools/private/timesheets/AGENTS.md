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
| `lib/entries.ts` | Entries, the week grid (`week`, `saveCell`, rows), the day list; the 24-hour rule |
| `lib/timer.ts` | The running timer; forgotten timers; the leaver's timer |
| `lib/reports.ts` | Reports and export rows, scoped to the actor in SQL |
| `lib/settings.ts` | Locked period, reminder |
| `lib/import-formats.ts`, `lib/import.ts` | Toggl/Clockify/Harvest CSV → plan → import (idempotent by fingerprint) |
| `lib/reminder.ts`, `app/chest-jobs/` | The Friday reminder (schedules proposal) |
| `lib/lifecycle.ts`, `app/chest-events/` | Leave, erasure |
| `app/chest/actions.ts` | Server actions: thin, `act(actor => service(...))` |
| `app/chest/**` | Pages (server) and views (`"use client"`) |
| `lib/i18n/en.ts`, `fr.ts` | Every word; `format.ts` for dates, numbers, money |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids
  (or `erased`), never names.
- **Every service takes `(sql, actor, …input: unknown)`**, checks rights
  first, validates every input, throws `AppError(code)`; never a sentence.
- **Time is only ever one's own**: entry queries filter on `member_id =
  actor.id`; reports force the member's own id unless `reports.all`.
- **Writes that touch a person's day** take the person's advisory lock and
  end with `checkDayTotal` inside the same transaction.
- **Locked days**: check `isLocked` for the old *and* the new day of any
  change.
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
