# Adapting Rooms — a guide for AI agents

`README.md` says what Rooms does; this page says where things are and what
must not break.

## Map

How a tool is built on `@argentic/chest-app` (pages, islands, actions,
words, the database, tests) is `node_modules/@argentic/chest-app/AGENTS.md`:
read it first. Here, what is Rooms' own.

| Path | What it is |
|---|---|
| `chest.json` | Manifest (contract 0.4): roles `admin`, `manager` (office manager), `member`; `database`, `files`, `members`, `notifications`; `receives`; the `quarter` schedule; `build.static: ["/assets/"]` |
| `chest.proposals.json` | Studio proposals: `calendar`, `capabilities: ["members.groups"]`, `mail.send` (visitors' invitations only), `receives` Leave's events and `group.*`, `translations` |
| `migrations/0001_rooms.sql` | Schema. **The exclusion constraints** (`desk_taken`, `desk_already`, `room_taken`) are what prevents double booking; `btree_gist` is required. Never edit a shipped file; add the next one |
| `migrations/0003_…` – `0007_…` | Calendar queue, usual week, lent desks, groups, check-in, presets, example, import, visitors, Leave's words |
| `migrations/0008_calendar_uids.sql` | `room_bookings.uid_salt` (a booking's calendar key `room:<id>:<salt>`; null: a booking made before, key `room:<id>`), `calendar_sent.published` (the key the Chest holds) |
| `migrations/0009_change_stamp.sql`, `0011_chest_changes.sql` | The pages' version: 0009's sequence, replaced by 0011's package change log (`chest_watch` a new table there) |
| `migrations/0012_visitor_invitations.sql` | `settings.mail` dropped (members are never mailed); a visit's optional `email`, `language`, `invitation` (sent / not_sent) and `mail_sequence` |
| `src/app.tsx` | **Every route**: the pages, the files (`download()`), the room photo link, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | **Every change**, by name (`call()` from the islands); the bell and the calendars go `after()` the answer; imports are `parallel` |
| `src/pages/` | `Week`, `Desks`, `Rooms`, `People`, `Visitors`, `Places` (offices, rules, export), `PublicHome` |
| `src/islands/` | `WeekView`, `DeskView`, `BookFor`, `RoomsView` (the grid, the phone list, the booking form; props sent compact: `SentBooking`, `Who`), `VisitorsView`, `PlacesView`, `RulesForm`, `Period`, `Search`, `AutoRefresh`; `index.ts` lists them |
| `src/components/` | Shared by pages and islands: icons, the mark, `DayPicker`, `OfficePicker`, `ExampleButton`, `StayLink` (a link opened in place, scroll kept), date problems |
| `src/layout.tsx` | The kit's shell, the sections, the toasts |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css`, `src/grid.css` | Blueprint and the company's choice as `/chest/look.css`; Rooms' tokens; its components; the grid's places as classes (`at-N`, `len-N`, `rows-N`: no style attribute) |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts`, the cached formatters (the only place an `Intl` object is made, with `src/lib/wall-clock.ts`); the kit's words under `kit` |
| `src/shared/model.ts`, `src/shared/app-error.ts` | Bounds, keys, days, quarter hours, free slots — pure, browser-safe (islands import these, never `src/lib/`) |
| `src/lib/access.ts` | **Who may do what**: abilities (`can`) and `mayChange` |
| `src/lib/booking-rules.ts` | What every booking is held to, the time range built by PostgreSQL in the Chest's zone, constraint errors → codes |
| `src/lib/context.ts`, `src/lib/zone.ts`, `src/lib/stamp.ts` | What every page starts from; the Chest's time zone; a page's version |
| `src/lib/places.ts`, `desk-bookings.ts`, `room-bookings.ts`, `presence.ts`, `visits.ts`, `usual.ts`, `check-in.ts`, `settings.ts` | The office and its bookings, presence, visitors, the usual week, check-in, the rules |
| `src/lib/calendar.ts`, `invitations.ts`, `tell.ts`, `notify.ts` | The calendar feeds (`enqueue` in the changing transaction, `flush` from the database's state), visitors' invitations by email (outside people only), the bell (one notice with its translations) |
| `src/lib/groups.ts`, `people.ts`, `directory.ts`, `match.ts` | The Chest's groups (kept a minute, forgotten on events), names, the pickers' people, matching imported names and addresses |
| `src/lib/lifecycle.ts`, `away.ts` | Leaving and erasure; Leave's events; the deliveries kept (`seen`, forgotten after 30 days) |
| `src/lib/import.ts`, `calendar-import.ts`, `ical.ts`, `wall-clock.ts`, `windows-zones.ts` | Moving in: resources and desk CSVs, a room calendar's `.ics` |
| `src/lib/example.ts`, `mine.ts`, `export.ts`, `csv.ts`, `photos.ts` | The example office; a member's files; the admins' CSVs; room photos |
| `seed/sample.sql` | The sample office and week (dates relative to this Monday) |
| `test/` | `app.test.ts` (the built server: pages, look, actions, files, schedules, races on PostgreSQL), `scale.test.ts` (200 rooms, 500 desks, 300 people), `sources.test.ts`, `units.test.ts`, and the rules' own tests |

## Commands

```sh
npm ci && npm run build && npm test     # all must pass (Node 24)
TEST_DATABASE_URL=postgres://… npm test  # also plays two people booking the same desk or room at once
NODE_ENV=development npm test            # as the workbench runs them
```

## Rules

- **Names the tool creates are keys** (`floors.preset`, `areas.preset`):
  never seed or create a floor or area name without its preset; render it
  with `placeName(name, preset, t.presets)` (or `offices(…, t.presets)`);
  a rename clears the preset.
- **Decoration steps aside** (`--decor`, kit 0.2.3): the drafting paper is
  keyed on it; the rooms' hour lines are information and stay.

- **Visitors are third parties**: never show a visit to a member who is not
  its host or announcer, unless `can(actor, "visitors.all")`; keep only a
  name and a company, and an invitation's address until the visit's day
  is over (never shown in a page).
- **Never mail a member**: tell them with `notify` (lib/notify.ts); the
  Chest mails notifications by each member's choice. `mail.send` is for
  visitors only.
- **Addresses**: Rooms never reads the members' addresses; `matchable(text)`
  sends the addresses an imported file carries to `members.matchEmails`,
  for importers only; never pass them to a client component (`directory()`
  has none).
- **Identity only from `member()`** (the page's or action's `member`); store `mbr_…` ids.
- **A member's groups come from `lib/groups.ts`** (`groupsOf` for one,
  `membership` for many, through `members.get` and `members.list({ group
  })` with `members.groups`), never from the request's `member.groups`,
  which an older assertion may leave short. Ask them
  before a transaction, not inside it.
- **Never check availability in code and then insert**: insert, and let the
  constraint refuse (`conflict()` turns SQLSTATE 23P01 into `taken` /
  `already_booked`). Insert inside a savepoint when the transaction must go on.
- **Times**: build ranges with `span()` (PostgreSQL, the Chest's zone) and read
  them back as minutes of the booking's `day`; never do zone arithmetic in
  JavaScript. Test daylight-saving days.
- **Every service function takes `(sql, actor, …)`**, checks rights first and
  throws `AppError(code)`. Add an ability → a line in `test/access.test.ts`.
- **Islands and `src/components/` import only** `src/i18n/format.ts`,
  `src/shared/`, `@argentic/chest-app/client`, `@argentic/chest-ui/components`
  (and `/components/logic`) and types. Never the SDK nor `src/lib/`.
- **No style attribute**: a place from data is a class (`src/grid.css`), an
  SVG attribute, or set through a ref in an island.
- **Island props stay small** (under 256 KB at 200 rooms and 300 people:
  `test/scale.test.ts`): name people once, send rows, bound lists.
- **The kit's components first** (`@argentic/chest-ui/components`): `AppShell`
  (labelled tabs, never icons alone), `Toasts`/`useToast` (one toast per
  action id; `undo` returns `true` or the reason it failed), `Dialog` with
  `dirty` for any form, `Confirm` for what cannot be undone (never
  `window.confirm`), `PeoplePicker` (guests, "book for", a desk's holder),
  `TimeSelect` + `moveStart`/`moveEnd`, `DayStrip`/`DateField` (never
  `type="date"`), `Segmented`, `Tabs`, `Filters`, `SearchBox`, `Avatar`,
  `AvatarStack`, `EmptyState`, `PageHeader`, `NoAccess`, `BrandMark`; since
  kit 0.2.2 also the desk features as a `Filters` group with `multiple`
  (`f=screen,dock`), the export's period as a `DateRangeField`, and
  `clearable` on the single pickers that may be left empty ("book for",
  a desk's holder). A `link` prop takes `StayLink` (in place, the scroll
  kept) where a choice stays on the page; plain links open in place anyway. Kept on purpose: the
  Office/Remote/Off radio row of a day (arrows move without choosing:
  choosing frees a desk), the room finder's equipment chips (toggle
  buttons in the page, not the address), the desk tiles and the rooms'
  grid.
- **CSS names only contract tokens** (and Rooms' own, `src/tokens.css`,
  defined from them); never a colour (`test/theme.test.ts`); decorative
  mixes in `oklab`, never `oklch`; chips take `--radius-chip`. A colour of
  the identity changes in `lib/theme.ts`.
- **Words follow the store's glossary** (`node scripts/lint-words.mjs
  tools/private/rooms`, 0 errors): Delete (a place, gone) vs Remove (a guest
  from a list), Undo = « Annuler l’action », a narrow no-break space before
  `: ; ? !` in French.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **Whoever loses a booking they did not cancel is told** (`lib/tell.ts`);
  booking for oneself is silent.
- **No network, no disk.** Background work is only the `quarter` schedule;
  old data is purged by it too (never by a page: a page's write would
  move every page's version); usual weeks and calendar
  flushes run when pages are read and after each action.
- **Anything that changes a booking or a day enqueues its calendar keys**
  (`enqueue(tx, …)` with `roomKey`/`dayKey`) in the same transaction; never
  call `calendar.put`/`putMany` directly (`flush` does, in one batch).
- **A day the member set themselves is never touched by the usual week**:
  write `usual_applied` when a person says a day, `usual = false` on their
  own presence and desk rows.
