# Adapting Goals — a guide for AI agents

`README.md` says what the tool does; this page says where things are and
what must not break.

## Map

How a tool of the studio is built — pages, islands, actions, words, the
database, tests, recipes — is `node_modules/@argentic/chest-app/AGENTS.md`:
read it first. Goals' own:

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Contract 0.4 (`"chest": "0.4"`, schedules `reminder` and `week`, `build.static: ["/assets/"]`); the proposals (studio): capability `members.groups` (+ `group.*`), `receives` of Clients', Tasks', Support's and Hiring's events, `translations` |
| `src/app.tsx` | Every route: the pages (a member without a role sees why), the downloads (a cycle as CSV, every update, the import's example), `/chest-events`, `/chest-schedules`; each page's version (`src/lib/stamp.ts`: a refresh with nothing new is a 304) |
| `src/actions.ts` | Every change, by name; fields read at the boundary (a key result part by part); what only tells people runs in `after()` |
| `src/pages/` | Pages rendered on the server; `chase-list.tsx` (who waits for an update), `cycle-group.ts` (the cycle filter) |
| `src/islands/` | What runs in the browser: the update form's list, the objective form, a key result's card, comments, retrospective, cycles' admin, settings, import, the Company tools (filters folding on a phone), Remind, AutoRefresh (the package's `useAutoRefresh`) |
| `src/components/` | Shared by pages and islands (no server code): the tree (server only, folds with `<details>`), progress and confidence (SVG bars), the chart, the update form, key-result fields and dialog, icons, the mark, contours |
| `src/layout.tsx`, `src/theme.ts` | The shell; the look (Trail map, `pageLook()`: the company's choice, the dark header in the Trail map only) |
| `src/lib/access.ts` | **Who may do what** — roles, `mayCreate`, `mayEdit`, `mayCheckIn`: the only place rights are decided |
| `src/lib/groups.ts` | Every group a member is in (`member.groups`, every group with `members.groups`), and `readerFor` |
| `src/lib/model.ts` | Pure rules: bounds, values ("12,5"), measures, progress, confidence, cycles' time, scores |
| `src/lib/read.ts` | Read models; `visibleTo(reader)`: **the one filter of confidential objectives** |
| `src/lib/cycles.ts`, `teams.ts`, `objectives.ts`, `key-results.ts`, `comments.ts`, `orphans.ts` | Services `(sql, actor, …input)`: rights first, bounds, parameterised SQL, codes |
| `src/lib/tell.ts`, `notify.ts`, `remind.ts` | Notifications (one notice per event, French in `translations`), badges, the Friday reminder, Remind — never a mail |
| `src/lib/lifecycle.ts` | Leaving, losing access, erasure; `seen` (deliveries already handled, table `chest_events`) |
| `src/lib/sources.ts`, `crm.ts` | Key results fed by the other tools' events |
| `src/lib/import.ts`, `export.ts`, `csv.ts` | CSV import (presets, mapping, plan, Undo) and exports |
| `src/lib/views.ts`, `page-data.ts`, `form-data.ts`, `cycle-names.ts`, `time.ts`, `zone.ts`, `stamp.ts` | What pages hand to views, written on the server; the Chest's calendar; a page's version |
| `src/shared/` | Browser-safe: `format.ts` (**the only place Intl objects are made**, kept), `values.ts` |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`, `index.ts` |
| `migrations/` | The schema, run by the Chest in order (`0006_chest_changes.sql`: the package's change log the pages' versions read — `chest_watch` a new table there) |
| `test/` | `app.test.ts` and `scale.test.ts` (the built server), services, units, words, sources |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
TEST_DATABASE_URL=postgres://… npm test   # on a real PostgreSQL (concurrent updates overlap there)
```

## Rules

- **Identity comes only from the Chest's assertion** (`member` in `page()`/`action()`). Store `mbr_…`
  ids, never names or emails; `'erased'` stands for an erased person.
- **Confidential objectives**: any new query that lists objectives for a
  person adds `visibleTo(sql, readerOf(actor))` (src/lib/read.ts); a test in
  `test/chase.test.ts` shows each place.
- **Rights live in `src/lib/access.ts`**; every service checks before acting; a
  test in `test/access.test.ts` or `test/goals.test.ts` for each new right.
- **A closed cycle is frozen** (`openCycle()`): only retrospectives and
  comments change. Keep it so in any new service.
- **Services return codes, never sentences**; words go in every catalogue.
- **Never add ratings of people, reviews or links to pay**: see the legal
  note in `README.md`. Personal objectives stay off by default.
- **Dates**: "today" and "this week" come from `src/lib/time.ts` (the
  Chest's zone); format instants on the server; days with `formatDay`; a
  date not of this year says its year.
- **Islands and components never import the SDK or `src/lib/`** (types
  only); `checkSources` refuses it.
- **No `style={}`**: a size from data is an SVG attribute (the bars);
  **no `new Intl.…`** outside `src/shared/format.ts`; lists grouped in one
  pass (`test/scale.test.ts`: 500 objectives).
- **Concurrent writes**: an update locks its key result row
  (`src/lib/key-results.ts`); keep any rule that reads then writes safe
  in SQL.
- **Fed values**: a new source is a value of `sources` (src/lib/sources.ts),
  the migration's check, its handler (read every field, keep only what a
  count needs, ignore any other shape), its words (`form.sources`,
  `form.mine`, `tools`), and its contract in README "With the other tools".
  Never keep a title, a customer's words or a candidate's name.
- **Units** carry the language they were written in (`unit_locale`, set
  from the writer on every write); `unitFor` uses that rule, never the
  reader's.
- **Schema changes are new migration files.** Never edit one that shipped.
- **No network, no disk, no background work** outside the Chest's signed
  schedules and events; the tool must stay useful without them. **No
  email to members**, ever: a notification, which the Chest mails by the
  member's choice; no digest, no reminder mail, no "email me" setting.
- **Keep the policy strict**: no inline script or style (the package sets it).
- **The look**: the CSS names only the kit's contract tokens (and Goals'
  own of `src/tokens.css`, defined from them) — never a colour
  (`test/theme.test.ts` checks it). A state always has its word and its
  shape; text sits only on measured pairs (`ui/AGENTS.md` in the studio).
- **The kit first** (`@argentic/chest-ui/components`): toasts (`toast()` of `@argentic/chest-app/client`,
  one `id` per act, `undo` that returns `true` or why not, `sent: true`
  once a notification left), `Dialog` with `dirty`, `Confirm` for
  what cannot be undone (never `window.confirm`), `PeoplePicker`,
  `DateField` (never `type="date"`), `FilePicker`, `Filters`, `Menu`,
  `DataTable`, `EmptyState`, `Avatar`, `StatusBadge`, `AppShell`. Their
  words are the catalogues' `toast`, `dialog`, `peoplePicker`, `date`,
  `files`, `filters`, `tables` sections; `node scripts/lint-words.mjs`
  (studio) must report 0 errors. Kit 0.2.3 (re-vendored 2026-09-29): the
  header is the map's dark margin (`--inverse`, its tab mark
  `--inverse-signal`) **in the Trail map only** (`ownHeader` added to the look's
  stylesheet, `src/theme.ts`); every other look (a catalogue theme, the Chest's
  sheet, a brand) gets the kit's normal header, like Tasks and Wiki. No
  colour changes in a `prefers-color-scheme: dark` block; the contour lines
  are decoration, drawn at `opacity: var(--decor)`. Links between pages are plain `<a>`:
  the package follows them in place. The kit's toasts are the package's
  `toast()` (`useToast()` sees no host inside an island).
