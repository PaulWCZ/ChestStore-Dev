# Adapting People — a guide for AI agents

`README.md` says what People does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `hr`, `member`; `database`, `members`, `notifications`; `receives` |
| `chest.proposals.json` | Proposal keys (the `morning` schedule) — kept apart, a Chest refuses unknown keys |
| `lib/access.ts` | **Who may do what**: abilities (`can`), who sees a checklist (`seesJourney`), who ticks a step (`ticks`) |
| `lib/model.ts` | Bounds, text cleaning, days, phones, topics, birthdays, checklist roles and offsets — pure |
| `lib/profiles.ts` | Profiles: read, own edits, HR's job edits, the loop check (`wouldLoop`), purge of departed people |
| `lib/directory.ts` | The directory: the Chest's members + profiles |
| `lib/tree.ts`, `lib/calendar.ts` | The org chart from managers; newcomers, arrivals, birthdays, anniversaries — pure, used in pages |
| `lib/journeys.ts` | Templates and checklists (called *journeys* in code): start, tick, edit steps, stop, lists, counts |
| `lib/examples.ts` | The two example templates, in the reader's words |
| `lib/importer.ts`, `lib/export.ts`, `lib/csv.ts` | CSV import (header aliases, name matching, dates), export, CSV reading/writing (formula-safe) |
| `lib/people.ts` | Names and photos from ids (`people`, `nameOf`), everyone (`everyone`), who is here (`present`) |
| `lib/tell.ts`, `lib/notify.ts` | The bell (each recipient's language, keyed per checklist) and badges |
| `lib/lifecycle.ts`, `lib/morning.ts` | Leaving and erasure; the scheduled morning (proposal) |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes; the bell after a change |
| `app/chest/**/page.tsx` | Pages (server): read, resolve names, hand words to views |
| `app/chest/**/*-view.tsx`, `*-form.tsx`, `*-editor.tsx`, `org-chart.tsx`, `todo-list.tsx`, `importer.tsx` | Client views |
| `app/chest-events/route.ts`, `app/chest-jobs/[name]/route.ts` | Lifecycle events; scheduled runs |
| `migrations/` | Schema. Never edit a shipped file; add `0002_…` |
| `seed/sample.sql` | A sample company for local runs and screenshots |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids,
  never names or emails. The directory is `members.list`: never keep a copy
  of names.
- **Every service function takes `(sql, actor, …)`**, checks rights through
  `lib/access.ts` and throws `AppError(code)`. A checklist the actor may not
  see is `not_found`, never `forbidden`.
- **Managers never loop**: every write of `manager_id` goes through
  `wouldLoop` inside a transaction holding the `people.managers` advisory
  lock (profiles, import, lifecycle).
- **Birthdays are opt-in**: stored only while the person shows it; never
  written by HR nor by the import.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role; a lifecycle change → `test/lifecycle.test.ts`.
- **Client components import only** `lib/i18n/format.ts`, `lib/app-error.ts`,
  `lib/model.ts`, `lib/tree.ts`, `lib/calendar.ts`, `lib/tint.ts`,
  `lib/initials.ts` and types. Never the SDK, `lib/db.ts`, `lib/session.ts`.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Deferred work runs on the
  next request (badges on *My to-dos*, the purge on the directory) or in the
  `morning` schedule when the Chest has schedules.
