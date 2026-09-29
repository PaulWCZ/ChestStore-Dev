# Adapting Rooms — a guide for AI agents

`README.md` says what Rooms does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `admin`, `member`; `database`, `files`, `members`, `notifications`; `receives` |
| `migrations/0003_…`, `0004_check_in.sql` | Calendar queue, usual week, lent desks, groups, check-in |
| `migrations/0001_rooms.sql` | Schema. **The exclusion constraints** (`desk_taken`, `desk_already`, `room_taken`) are what prevents double booking; `btree_gist` is required. Never edit a shipped file; add `0002_…` |
| `lib/access.ts` | **Who may do what**: abilities (`can`) and `mayChange` (the booker or an admin) |
| `lib/model.ts` | Bounds, keys (equipment, features, statuses, parts), days, quarter hours, free slots, desk numbering — pure, browser-safe |
| `lib/booking-rules.ts` | What every booking is held to (past, closed day, how far ahead), the time range built by PostgreSQL in the Chest's zone, constraint errors → codes |
| `lib/settings.ts` | The rules (one row) and the purge of old data |
| `lib/places.ts` | Offices, floors, areas, rooms, desks; removing cancels coming bookings |
| `lib/desk-bookings.ts`, `lib/room-bookings.ts` | Booking, changing, cancelling, undoing; the day views |
| `lib/presence.ts` | Office / remote / off per day; who is at an office |
| `lib/tell.ts`, `lib/notify.ts` | The bell, in each recipient's language (no badge, on purpose) |
| `lib/lifecycle.ts` | Leaving and erasure (calendar keys naming the person go too) |
| `lib/calendar.ts` | The members' calendar feeds (Proposal: calendar): `enqueue` keys in the transaction that changes them, `flush` puts/removes from the database's state, `icsFile` for downloads |
| `lib/usual.ts` | "My usual week": saved per weekday, applied once per (member, day) within the booking window when pages are read (`usual_applied`) |
| `lib/check-in.ts`, `app/chest-jobs/[name]/route.ts` | The `quarter` schedule: reminders, check-in, freeing unclaimed rooms |
| `lib/mail.ts` | Guests' emails with the `.ics` (Proposal: mail) |
| `lib/groups.ts` | The Chest's groups (teams in Who's where, rooms/areas kept for a group) |
| `lib/import.ts` | Moving in: Google Workspace resources CSV, desk owners CSV (tolerant headers) |
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
  `AvatarStack`, `EmptyState`, `PageHeader`, `NoAccess`, `BrandMark`. Kept on
  purpose: the Office/Remote/Off radio row of a day (arrows move without
  choosing: choosing frees a desk), the desk-feature chips (several at
  once; the kit's `Filters` take one per group), the desk tiles and the
  rooms' grid.
- **CSS names only contract tokens** (and Rooms' own, `app/tokens.css`,
  defined from them); never a colour (`test/theme.test.ts`). A colour of
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
