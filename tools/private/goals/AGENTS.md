# Adapting Goals — a guide for AI agents

`README.md` says what the tool does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | The manifest; the proposals (studio): `schedules`, `mail.send`, `receives` of Clients' deal events |
| `lib/access.ts` | **Who may do what** — roles, `mayCreate`, `mayEdit`, `mayCheckIn`: the only place rights are decided |
| `lib/model.ts` | Pure rules: bounds, values ("12,5"), measures, progress, confidence, cycles' time, scores |
| `lib/read.ts` | Read models: cycles, objectives with key results, progress, stale, "this week", waiting counts and list, check-ins, key results' changes; `visibleTo(reader)`: **the one filter of confidential objectives** — every read of objectives for a person goes through it |
| `lib/cycles.ts`, `lib/teams.ts`, `lib/objectives.ts`, `lib/key-results.ts`, `lib/comments.ts`, `lib/orphans.ts` | Services `(sql, actor, …input)`: rights first, bounds, parameterised SQL, codes |
| `lib/tell.ts`, `lib/notify.ts` | The bell (each recipient's language), badges, the Friday reminder, admins told of orphans |
| `lib/lifecycle.ts` | Leaving, losing access, erasure |
| `lib/export.ts`, `lib/csv.ts` | A cycle as CSV, and every check-in, in the reader's language |
| `lib/cycle-names.ts` | A cycle's name when the tool wrote it (`periodName`: "Q1 2027"/"T1 2027", or its months), in the reader's language; `generated` in `cycles` says so (`migrations/0003_names_and_words.sql`). Read cycles with the reader's locale (`cycles(sql, locale)`, `readCycle` uses the actor's) |
| `lib/import.ts` | CSV import: headers guessed (Goals' export, Lattice, spreadsheets), mapping, owners by name, plan (dry run), run in one transaction, undo |
| `lib/remind.ts`, `lib/mail.ts` | Who waits for a check-in (admins: all; an objective's owner: its key results), *Remind* once a day; email beside the bell with a per-person switch |
| `lib/crm.ts` | Key results fed by Clients' `crm.deal.won` / `crm.deal.reopened` events |
| `lib/views.ts`, `lib/page-data.ts`, `lib/form-data.ts` | What pages hand to views: words, names, dates and values already written |
| `lib/time.ts`, `lib/zone.ts` | The Chest's today and this week (its time zone) |
| `lib/values.ts`, `lib/i18n/format.ts` | Browser-safe formatting |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts` |
| `app/chest/` | Pages (server) and views (client); `actions.ts` thin server actions |
| `app/chest-events/`, `app/chest-jobs/[name]/` | The Chest's signed calls |
| `lib/theme.ts` | The identity, **Trail map** (`defineTheme`, the catalogue's `trail` theme value for value) and `currentLook()` (the company's choice first) |
| `app/layout.tsx`, `app/tokens.css`, `app/globals.css` | `<ThemeStyle>` with the page's nonce; Goals' own tokens (from contract tokens only); its styles |
| `components/` | Goals' own pieces: the shell's client part (`shell.tsx`), progress and confidence (the kit's `StatusBadge`), the chart, contours and the map-like empty state, icons, the mark, cards |
| `migrations/` | The schema, run by the Chest in order |
| `seed/sample.sql` | Atelier Martin (never run by the Chest) |
| `test/` | `node:test` with the SDK's `fakeChest`; PGlite or `TEST_DATABASE_URL` |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity comes only from `member()`** (`lib/session.ts`). Store `mbr_…`
  ids, never names or emails; `'erased'` stands for an erased person.
- **Confidential objectives**: any new query that lists objectives for a
  person adds `visibleTo(sql, readerOf(actor))` (lib/read.ts); a test in
  `test/chase.test.ts` shows each place.
- **Rights live in `lib/access.ts`**; every service checks before acting; a
  test in `test/access.test.ts` or `test/goals.test.ts` for each new right.
- **A closed cycle is frozen** (`openCycle()`): only retrospectives and
  comments change. Keep it so in any new service.
- **Services return codes, never sentences**; words go in every catalogue.
- **Never add ratings of people, reviews or links to pay**: see the legal
  note in `README.md`. Personal objectives stay off by default.
- **Dates**: "today" and "this week" come from `lib/time.ts` (the Chest's
  zone); format instants on the server; days with `formatDay`.
- **Client components never import the SDK**, `lib/session.ts`,
  `lib/people.ts`, `lib/db.ts` or services.
- **Schema changes are new migration files.** Never edit one that shipped.
- **No network, no disk, no background work** outside the Chest's signed
  schedules and events; the tool must stay useful without them (and
  without mail).
- **Keep the CSP** in `proxy.ts`.
- **The look**: the CSS names only the kit's contract tokens (and Goals'
  own of `app/tokens.css`, defined from them) — never a colour
  (`test/theme.test.ts` checks it). A state always has its word and its
  shape; text sits only on measured pairs (`ui/AGENTS.md` in the studio).
- **The kit first** (`@argentic/chest-ui/components`): toasts (`useToast`,
  one `id` per act, `undo` that returns `true` or why not, `sent: true`
  once a bell item or an email left), `Dialog` with `dirty`, `Confirm` for
  what cannot be undone (never `window.confirm`), `PeoplePicker`,
  `DateField` (never `type="date"`), `FilePicker`, `Filters`, `Menu`,
  `DataTable`, `EmptyState`, `Avatar`, `StatusBadge`, `AppShell`. Their
  words are the catalogues' `toast`, `dialog`, `peoplePicker`, `date`,
  `files`, `filters`, `tables` sections; `node scripts/lint-words.mjs`
  (studio) must report 0 errors. Kit 0.2.3 (re-vendored 2026-09-29): the
  header is the map's dark margin (`--inverse`, its tab mark
  `--inverse-signal`) **in the Trail map only** (`<html data-look="own">`,
  `app/tokens.css`); every other look (a catalogue theme, the Chest's
  sheet, a brand) gets the kit's normal header, like Tasks and Wiki. No
  colour changes in a `prefers-color-scheme: dark` block; the contour lines
  are decoration, drawn at `opacity: var(--decor)`. Server pages pass Next's `Link` to
  `Filters` through `components/link.tsx` (a `"use client"` re-export),
  so the `LinkFilters` wrapper is gone.
