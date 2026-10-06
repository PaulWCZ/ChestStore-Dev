# Adapting People — a guide for AI agents

`README.md` says what People does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest (contract 0.4): roles `hr`, `member`; `database`, `files`, `members`, `members.email`, `notifications`; `receives: ["member.*"]`; the `morning` schedule; `build.static: ["/assets/"]` |
| `chest.proposals.json` | Proposal keys (`mail`, `emits`, `receives` of other tools' events, `translations`) — kept apart, a Chest refuses unknown keys |
| `src/app.tsx` | **Every route**: `createApp({…})`, the pages (`people()`: a role, and the "My to-dos" number for the layout), downloads, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | **Every mutation**, by name (`call("tickItem", …)` from an island): thin; the services check rights and input; the bell after the answer (`after()`) |
| `src/pages/` | Pages rendered on the server: read, resolve names, write every word and date, hand plain data to islands (`parts.tsx`: back link, meter, the directory's foot) |
| `src/islands/` | What runs in the browser (`index.ts` lists them): the directory's search, forms, the table, checklists, imports, documents… Each imports React, the kit, `src/components/`, `src/shared/` and `@argentic/chest-app/client` only (types from `src/lib/` allowed) |
| `src/components/` | Shared by pages and islands: icons, the mark, the portrait (`s-<size>` classes), the kind badge, date fields' refusals (`date-problems.tsx`), `busy.ts` (`useBusy`, `useWorking`) |
| `src/layout.tsx` | The kit's shell (sections, member chip → one's profile), the toasts; the public layout |
| `src/theme.ts` | The identity (`identityOf("people")`, the catalogue's "Portrait gallery"), `currentLook` (the company's choice), `pageLook` (served as `/chest/look.css`) |
| `src/tokens.css`, `src/styles.css` | The tool's own tokens (from contract tokens) and its CSS (contract tokens only; the neutral print style; bars as `pct-0…pct-100` classes) |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`, `index.ts`; `tool`, `pages`, `errors`, `kit` are the package's |
| `src/shared/` | Rules and formats shared with islands, pure: `model.ts` (bounds, days, phones, roles, `percent`), `tree.ts`, `calendar.ts`, `tint.ts`, `choices.ts`, `format.ts` (**the only place an `Intl` object is made**, kept per language), `app-error.ts` (the package's `AppError` and People's codes) |
| `src/lib/access.ts` | **Who may do what**: abilities (`can`), who sees a checklist (`seesJourney`), who ticks a step (`ticks`) |
| `src/lib/profiles.ts` | Profiles: read, own edits, HR's job edits, the loop check (`wouldLoop`), purge of departed people |
| `src/lib/directory.ts` | The directory: the Chest's members + profiles |
| `src/lib/journeys.ts` | Templates and checklists (called *journeys* in code): start, tick, edit steps, stop, lists, counts |
| `src/lib/arrivals.ts` | Arrivals written by HR (`manual`) or told by Hiring (events between tools): read and check each event, add and correct by hand, cancel, link to a member, remove, purge after 90 days, suggestions (work email, then name) |
| `src/lib/away.ts` | Leaves told by Leave (events between tools): read and check each event, "away today and back when" (`awayToday`, pure), the badge's words, purge once past |
| `src/lib/share.ts` | What People tells other tools: departures (`people.leaving`, `people.leaving_cancelled`) around a leaving checklist's start, stop and restart (`around`); a record's number, days and week (`people.record`, `tellRecords`, only when changed: `records.told`) |
| `src/lib/zone.ts` | The Chest's time zone and today (`chest.timeZone`, `chest.today()`), a member's own zone and day (`zoneOf`, `todayOf`). Tests run the database in the fake Chest's zone (`testDatabase({timeZone})`) |
| `src/lib/examples.ts` | The two example templates; their steps' phrases and names, shown in each reader's language (`stepText`, `listName`) until reworded |
| `src/lib/importer.ts`, `export.ts`, `csv.ts` | CSV import (header aliases, HR's column mapping, email then name matching, date order asked when ambiguous), export, CSV reading/writing (formula-safe, phones untouched) |
| `src/lib/records.ts` | **HR records**: read (journal), create, edit field by field, link, delete a mistake, documents (upload through the Chest, open by signed link), what is coming up, purge after five years, erasure |
| `src/lib/register.ts` | The staff register from the records, its mentions and CSV; `registerGaps`: who it cannot list — shown, printed and in the CSV |
| `src/lib/changes.ts` | "Request a change": the person asks, HR accepts (through `writeRecord`) or declines |
| `src/lib/record-import.ts` | Import of HR records (Lucca, BambooHR, a spreadsheet) |
| `src/lib/letters.ts` | Letters from templates: merge fields (`fill`), the two examples, printing from a record |
| `src/lib/journal.ts` | Who read or changed a record, the register, someone's job details — field names only; kept two years |
| `src/lib/fields.ts` | HR's extra profile fields and their values (`valueFor`); `dueDates` for the morning bell |
| `src/lib/numbers.ts` | One population (`workersOf`): headcount, by team/office/contract, arrivals and departures by month, turnover — pure |
| `src/lib/people.ts` | Names and photos from ids (`people`, `nameOf` — former, no access, erased), everyone (`everyone`) |
| `src/lib/tell.ts`, `notify.ts` | The bell (each recipient's language, keyed per checklist) and badges |
| `src/lib/lifecycle.ts`, `morning.ts`, `deliveries.ts` | Leaving and erasure; the scheduled morning; what the Chest posts (`onEvent`, `onSchedule`, the delivered ids in `chest_events`) |
| `src/lib/db.ts` | The pool (`db()`, opened on first use; `provide()` for tests) |
| `migrations/` | Schema (`0004_records.sql`: manual arrivals, manager left, phrases, extra fields, records, documents, journal; `0005_field_kinds_and_names.sql`: field kinds, choices and reminders; example template names as phrases; `0006_privacy_permits_requests_letters.sql`: who sees a field (dates made private), employee number, permit end, days worked, `told`, asked changes, letters, journal actions). Never edit a shipped file; add the next number |
| `seed/sample.sql` | A sample company for local runs and screenshots |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (`TEST_DATABASE_URL`, else PGlite): the services directly; `app.test.ts` the built server (`dist/test/app.js`); `units.test.ts` the package's `checkSources` |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass (Node 24)
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # a real PostgreSQL
NODE_ENV=development npm test         # as the Perseus workbench runs them
npm run dev                           # rebuilds on change (the harness: lab/chest-dev)
```

How a page, an island, an action, a word or a test is written:
`node_modules/@argentic/chest-app/AGENTS.md` — read it first.

## Rules

- **Identity only from `member`** (the page's or the action's context); store `mbr_…` ids,
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
- **The staff register never leaves anyone out silently**: whoever works
  here and cannot be listed is named on screen, on paper and in the CSV
  (`registerGaps`); a printed document writes names with `plainName`,
  never `nameOf`'s "(former member)".
- **Numbers count one population** (`workersOf`): a new figure uses the
  same workers, and each list adds up to the headcount.
- **An import never drops a column silently** (`Plan.leftOut`): the page
  names it and offers an extra field.
- **A private extra field ("HR and the person") never leaves the server
  for anyone else**: `valuesOf(sql, actor, …)` filters it; any new reader
  of field values goes through it (the directory's search included).
- **`people.record` carries only** `{member, employeeNumber, startDate,
  lastDay, workDays, weeklyHours}`; every write of a record goes through
  `writeRecord` and then `tellRecords` (records.ts, record-import.ts).
- **Letters never print a blank silently**: `fill` returns what is
  missing, the page says it.
- **Birthdays are opt-in**: stored only while the person shows it; never
  written by HR nor by the import.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role; a lifecycle change → `test/lifecycle.test.ts`.
- **Islands import only** `src/shared/`, `src/components/`,
  `@argentic/chest-ui/components` (and `/components/logic`),
  `@argentic/chest-app/client` and types (`checkSources` refuses the rest).
  Props are plain data with their words; dates and numbers are written on
  the server (an import's preview gets its days written by the action).
  An island whose state belongs to one subject is keyed by it
  (`<Island id={"record-form-" + version}>`), so a refresh never carries a
  draft to another.
- **No style attribute, no inline script or style**: a bar's length is a
  `pct-N` class, a portrait's size an `s-N` class.
- **Words live in `src/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Deferred work runs on the
  next request (badges on *My to-dos*, the purge on the directory) or in the
  `morning` schedule when the Chest has schedules.
- **Looks: the CSS names only contract tokens** (`ui/tokens/CONTRACT.md`)
  and the tool's tokens of `src/tokens.css`, themselves defined from
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
  `Segmented`, `AppShell` (plain links: the package opens them in place). A single
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
