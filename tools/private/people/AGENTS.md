# Adapting People — a guide for AI agents

`README.md` says what People does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `hr`, `member`; `database`, `files`, `members`, `members.email`, `notifications`; `receives` |
| `chest.proposals.json` | Proposal keys (the `morning` schedule, `emits`, `receives` of other tools' events) — kept apart, a Chest refuses unknown keys |
| `lib/access.ts` | **Who may do what**: abilities (`can`), who sees a checklist (`seesJourney`), who ticks a step (`ticks`) |
| `lib/model.ts` | Bounds, text cleaning, days, phones, topics, birthdays, checklist roles and offsets — pure |
| `lib/profiles.ts` | Profiles: read, own edits, HR's job edits, the loop check (`wouldLoop`), purge of departed people |
| `lib/directory.ts` | The directory: the Chest's members + profiles |
| `lib/tree.ts`, `lib/calendar.ts` | The org chart from managers; newcomers, arrivals, birthdays, anniversaries — pure, used in pages |
| `lib/journeys.ts` | Templates and checklists (called *journeys* in code): start, tick, edit steps, stop, lists, counts |
| `lib/arrivals.ts` | Arrivals written by HR (`manual`) or told by Hiring (events between tools): read and check each event, add and correct by hand, cancel, link to a member, remove, purge after 90 days, suggestions (work email, then name) |
| `lib/away.ts` | Leaves told by Leave (events between tools): read and check each event, "away today and back when" (`awayToday`, pure), the badge's words, purge once past |
| `lib/share.ts` | What People tells other tools: departures (`people.leaving`, `people.leaving_cancelled`) around a leaving checklist's start, stop and restart (`around`) |
| `lib/zone.ts` | The Chest's time zone and today (the `chest` module) — server only |
| `lib/examples.ts` | The two example templates; their steps' phrases, shown in each reader's language (`stepText`) until reworded (`samePhrase`) |
| `lib/importer.ts`, `lib/export.ts`, `lib/csv.ts` | CSV import (header aliases, HR's column mapping, email then name matching, date order asked when ambiguous), export, CSV reading/writing (formula-safe, phones untouched, `unquote` on the way back) |
| `lib/records.ts` | **HR records**: read (journal), create (one, for everyone), edit (field by field), link, delete a mistake, documents (upload through the Chest, open by signed link), what is coming up, purge after five years, erasure |
| `lib/register.ts` | The staff register (registre unique du personnel) from the records, its mentions and its CSV |
| `lib/journal.ts` | Who read or changed a record, the register, someone's job details — field names only; kept two years |
| `lib/fields.ts` | HR's extra profile fields and their values |
| `lib/numbers.ts` | Headcount, arrivals and departures by month, turnover — pure |
| `lib/people.ts` | Names and photos from ids (`people`, `nameOf`), everyone (`everyone`), who is here (`present`) |
| `lib/tell.ts`, `lib/notify.ts` | The bell (each recipient's language, keyed per checklist) and badges |
| `lib/lifecycle.ts`, `lib/morning.ts` | Leaving and erasure; the scheduled morning (proposal) |
| `lib/theme.ts` | The identity (`defineTheme`, = the catalogue's "Portrait gallery") and `currentLook` (the company's choice, else the identity) |
| `app/tokens.css`, `app/globals.css` | The tool's own tokens (from contract tokens) and its CSS (contract tokens only; dresses the kit's components in the gallery; the neutral print style) |
| `components/shell.tsx` | The kit's `AppShell` with Next's `Link` and the current path; the member chip links to one's profile |
| `components/portrait.tsx`, `lib/tint.ts` | The portrait in its arch (a categorical slot per team) — only where the face is the point; the kit's `Avatar` elsewhere |
| `lib/choices.ts` | What a person picker offers before anything is typed |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes; the bell after a change |
| `app/chest/**/page.tsx` | Pages (server): read, resolve names, hand words to views |
| `app/chest/**/*-view.tsx`, `*-form.tsx`, `*-editor.tsx`, `org-chart.tsx`, `todo-list.tsx`, `importer.tsx` | Client views |
| `app/chest-events/route.ts`, `app/chest-jobs/[name]/route.ts` | Lifecycle events; scheduled runs |
| `migrations/` | Schema (`0004_records.sql`: manual arrivals, manager left, phrases, extra fields, records, documents, journal). Never edit a shipped file; add the next number |
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
- **Arrivals hold personal data of people who are not members**: never
  store their email; clear everything when linked; keep the 90-day purge.
  A tool event is validated field by field and ignored when it does not fit.
- **Leaves keep only dates**: never a kind of leave nor a note; only for
  members; forgotten once past and when the person leaves. The badge is
  written on the server (dates in the Chest's zone).
- **A departure is a running leaving checklist**: every change of one
  (start, stop, restart) goes through `share.around`, which publishes only
  when the last day actually changed. Never publish more than
  `{member, lastDay}`.
- **HR records are HR's and their person's only**: every read goes through
  `recordAccess` (lib/access.ts); anyone else gets `not_found` — a manager
  included. Every opening by someone else than the person, every change,
  every document and register read goes through `journal.note`, with field
  names, never values. Never add salary or a social security number (README,
  "HR records"). The legal name in a record is the one deliberate copy of a
  name (the register outlives the Chest's memory); keep it HR-written.
- **A record of someone who worked here is not deleted** before five years
  after their last day (R1221-26); an erasure keeps only the register's
  fields and legal documents, detached (`eraseRecords`).
- **A manager who leaves stays their reports' manager, flagged**
  (`profiles.manager_left`) until HR names someone; steps never go to
  nobody (`leave()` gives them to HR; `startJourney` gives a missing
  manager's step to HR).
- **Example steps keep their phrase** while their text is a catalogue's
  words; rewording drops it. New example steps need a key in every
  catalogue.
- **Birthdays are opt-in**: stored only while the person shows it; never
  written by HR nor by the import.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role; a lifecycle change → `test/lifecycle.test.ts`.
- **Client components import only** `lib/i18n/format.ts`, `lib/app-error.ts`,
  `lib/model.ts`, `lib/tree.ts`, `lib/calendar.ts`, `lib/tint.ts`,
  `lib/choices.ts`, `@argentic/chest-ui/components` (and `/components/logic`)
  and types. Never the SDK, `lib/db.ts`, `lib/session.ts`.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Deferred work runs on the
  next request (badges on *My to-dos*, the purge on the directory) or in the
  `morning` schedule when the Chest has schedules.
- **Looks: the CSS names only contract tokens** (`ui/tokens/CONTRACT.md`)
  and the tool's tokens of `app/tokens.css`, themselves defined from
  contract tokens; never a colour (`test/theme.test.ts`). Text on a ground
  only on measured pairs (`--ink` on `--bg` for the plum, `--cat-N-ink` on
  `--cat-N-soft`…). The identity stays equal to the catalogue's `gallery`
  (the test says so): change both together. Show `look.logo` (BrandMark)
  where the mark is.
- **Use the kit's components** before writing one: `Toasts`/`useToast`
  (an Undo returns `true` or a sentence saying why not), `Confirm` for
  what is for good (never `window.confirm`), `PeoplePicker`, `DateField`
  (never `type="date"`; `today` from the server), `SearchBox`,
  `FilePicker`, `DataTable`, `EmptyState`, `Avatar`, `StatusBadge`,
  `Segmented`, `AppShell` (Next's `Link` passed as it is). A single
  picker that may stay empty (a manager, who does a step) is `clearable`;
  the register's rows open the record (`rowHref`); HR's sheet dates are
  the compact `DateField`; chips take `--radius-chip`. Kept on purpose:
  the directory's team and office selects (the directory filters in the
  page as one types; the kit's `Filters` are links in the address), HR's
  sheet (a grid of fields saved one by one, not a `DataTable`), the
  template's "Who" select (roles and people in one list), the birthday's
  day and month selects (no year), the birthday's own switch (it waits
  for Save: the kit's `Switch` takes effect at once). `--chosen` (not the
  contract's `--inverse`) is the inverse pair for a chosen state.
- **Words:** the kit's sections (`toast`, `dialog`, `peoplePicker`, `date`,
  `files`, `tables`, `search`) live in both catalogues; `node
  scripts/lint-words.mjs tools/private/people` must stay at 0 (Undo is
  « Annuler l'action »; Delete/Supprimer for what is gone for everyone).
