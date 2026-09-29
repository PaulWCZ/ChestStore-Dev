# Adapting Rooms — a guide for AI agents

`README.md` says what Rooms does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `admin`, `manager` (office manager), `member`; `database`, `files`, `members`, `members.email`, `notifications`; `receives` |
| `migrations/0003_…`, `0004_check_in.sql` | Calendar queue, usual week, lent desks, groups, check-in |
| `migrations/0001_rooms.sql` | Schema. **The exclusion constraints** (`desk_taken`, `desk_already`, `room_taken`) are what prevents double booking; `btree_gist` is required. Never edit a shipped file; add `0002_…` |
| `lib/access.ts` | **Who may do what**: abilities (`can`) and `mayChange` (the booker or an admin) |
| `lib/model.ts` | Bounds, keys (equipment, features, statuses, parts), days, quarter hours, free slots, desk numbering — pure, browser-safe |
| `lib/booking-rules.ts` | What every booking is held to (past, closed day, how far ahead), the time range built by PostgreSQL in the Chest's zone, constraint errors → codes |
| `lib/settings.ts` | The rules (one row) and the purge of old data |
| `lib/places.ts` | Offices, floors, areas, rooms, desks; removing cancels coming bookings |
| `lib/desk-bookings.ts`, `lib/room-bookings.ts` | Booking, changing, cancelling, undoing; the day views |
| `lib/presence.ts` | Office / remote / off per day; who is at an office (said so, a desk, or a meeting in one of its rooms, unless they said otherwise; `null`: no office yet); `inMeetings`; `borrowed` when a desk's holder comes back |
| `lib/visits.ts`, `app/chest/visitors/`, `migrations/0006_visits.sql` | Visitors: announced by their host or the reception (`visitors.all`), arrival → host's bell (`tell.visitorHere`); seen only by host, announcer, reception; purged with past bookings; lifecycle cancels/anonymises |
| `lib/match.ts` | Matching a file's person (organiser, guest, desk holder) by address (`members.email`), then name in any export form ("Martin, Camille"); ambiguous → nobody |
| `lib/tell.ts`, `lib/notify.ts` | The bell, in each recipient's language (no badge, on purpose) |
| `lib/lifecycle.ts` | Leaving and erasure (calendar keys naming the person go too) |
| `lib/calendar.ts` | The members' calendar feeds (Proposal: calendar): `enqueue` keys in the transaction that changes them, `flush` puts/removes from the database's state, `icsFile` for downloads |
| `lib/usual.ts` | "My usual week": saved per weekday, applied once per (member, day) within the booking window when pages are read (`usual_applied`) |
| `lib/check-in.ts`, `app/chest-jobs/[name]/route.ts` | The `quarter` schedule: reminders, check-in, freeing unclaimed rooms |
| `lib/mail.ts` | Guests' emails with the `.ics` (Proposal: mail) |
| `lib/groups.ts` | The Chest's groups (teams in Who's where, rooms/areas kept for a group) |
| `lib/import.ts` | Moving in: Google Workspace resources CSV, desk owners CSV (tolerant headers) |
| `lib/calendar-import.ts`, `lib/ical.ts`, `lib/wall-clock.ts`, `lib/windows-zones.ts` | Bookings already made: a room calendar's `.ics` read (the reader copied from Booking, THIRD_PARTY), weekly series kept, conflicts from the exclusion constraint itself; the preview is the same work rolled back; `source` (UID + start) makes a second import add nothing; `import_batch` is its Undo |
| `lib/example.ts`, `components/example-office.tsx` | "Start with an example": an office marked `example`, deleted whole while unused |
| `migrations/0005_presets_example_import.sql` | `floors.preset`, `areas.preset` (names the tool gave, read in each reader's language: `model.ts placeName`, `offices(sql, actor, t.presets)`, CSV exports through `::text::jsonb`), `offices.example`, `room_bookings.source`/`import_batch` |
| `lib/mine.ts`, `app/chest/calendar/**`, `app/chest/mine/route.ts` | A member's `.ics` files and their own data (CSV) |
| `lib/export.ts`, `lib/csv.ts` | CSV downloads (formula-safe) |
| `lib/context.ts`, `lib/zone.ts` | What every page starts from; the Chest's time zone |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser (days, times, plurals); the kit's word sections (`toast`, `dialog`, `peoplePicker`, `date`, `filters`, `search`) |
| `lib/theme.ts` | The identity, Blueprint (`defineTheme`, equal to the catalogue's `blueprint`), and `currentLook()` (the company's choice, else the identity) |
| `app/layout.tsx`, `app/tokens.css`, `app/globals.css` | `<ThemeStyle>` with the page's nonce; Rooms' own tokens (from contract tokens only); its components (contract tokens only) |
| `components/shell.tsx`, `components/day-picker.tsx`, `components/auto-refresh.tsx` | Thin client wrappers over the kit: `AppShell` with Next's `Link` and path; `DayStrip` + `DateField` ("Another day…"); `useAutoRefresh` |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes; send the bell |
| `app/chest/page.tsx` + `week-view.tsx` | My week |
| `app/chest/desks/` | Desk plan and list |
| `app/chest/rooms/` | The rooms' grid (drag to select), the phone list, the booking form and details |
| `app/chest/people/page.tsx` | Who's where (server only) |
| `app/chest/places/` | Admins: offices, rules, export |
| `app/chest/api/rooms/[id]/photo`, `app/chest/files/rooms/[id]` | Room photos: authorise, record, open |
| `seed/sample.sql` | The sample office and week (dates relative to this Monday) |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite with btree_gist, or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
TEST_DATABASE_URL=postgres://… npm test   # also plays two people booking the same desk at once
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
  name and a company.
- **Addresses** (`members.email`) are read by `matchable()` for importers
  only; never pass them to a client component (`directory()` has none).
- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids.
- **Never check availability in code and then insert**: insert, and let the
  constraint refuse (`conflict()` turns SQLSTATE 23P01 into `taken` /
  `already_booked`). Insert inside a savepoint when the transaction must go on.
- **Times**: build ranges with `span()` (PostgreSQL, the Chest's zone) and read
  them back as minutes of the booking's `day`; never do zone arithmetic in
  JavaScript. Test daylight-saving days.
- **Every service function takes `(sql, actor, …)`**, checks rights first and
  throws `AppError(code)`. Add an ability → a line in `test/access.test.ts`.
- **Client components import only** `lib/i18n/format.ts`, `lib/model.ts`,
  `lib/app-error.ts`, `@argentic/chest-ui/components` (and `/components/logic`)
  and types. Never the SDK, `lib/db.ts`, `lib/session.ts`.
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
  a desk's holder). A `link` prop takes Next's `Link` as it is; a wrapper
  stays only where it adds `scroll={false}`. Kept on purpose: the
  Office/Remote/Off radio row of a day (arrows move without choosing:
  choosing frees a desk), the room finder's equipment chips (toggle
  buttons in the page, not the address), the desk tiles and the rooms'
  grid.
- **CSS names only contract tokens** (and Rooms' own, `app/tokens.css`,
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
  old data is purged when My week is read; usual weeks and calendar
  flushes run when pages are read and after each action.
- **Anything that changes a booking or a day enqueues its calendar keys**
  (`enqueue(tx, …)` with `roomKey`/`dayKey`) in the same transaction; never
  call `calendar.put` directly.
- **A day the member set themselves is never touched by the usual week**:
  write `usual_applied` when a person says a day, `usual = false` on their
  own presence and desk rows.
