# Adapting Rooms — a guide for AI agents

`README.md` says what Rooms does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `admin`, `member`; `database`, `files`, `members`, `notifications`; `receives` |
| `migrations/0001_rooms.sql` | Schema. **The exclusion constraints** (`desk_taken`, `desk_already`, `room_taken`) are what prevents double booking; `btree_gist` is required. Never edit a shipped file; add `0002_…` |
| `lib/access.ts` | **Who may do what**: abilities (`can`) and `mayChange` (the booker or an admin) |
| `lib/model.ts` | Bounds, keys (equipment, features, statuses, parts), days, quarter hours, free slots, desk numbering — pure, browser-safe |
| `lib/booking-rules.ts` | What every booking is held to (past, closed day, how far ahead), the time range built by PostgreSQL in the Chest's zone, constraint errors → codes |
| `lib/settings.ts` | The rules (one row) and the purge of old data |
| `lib/places.ts` | Offices, floors, areas, rooms, desks; removing cancels coming bookings |
| `lib/desk-bookings.ts`, `lib/room-bookings.ts` | Booking, changing, cancelling, undoing; the day views |
| `lib/presence.ts` | Office / remote / off per day; who is at an office |
| `lib/tell.ts`, `lib/notify.ts` | The bell, in each recipient's language (no badge, on purpose) |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/export.ts`, `lib/csv.ts` | CSV downloads (formula-safe) |
| `lib/context.ts`, `lib/zone.ts` | What every page starts from; the Chest's time zone |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser (days, times, plurals) |
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
  `lib/app-error.ts`, `lib/initials.ts` and types. Never the SDK, `lib/db.ts`,
  `lib/session.ts`.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **Whoever loses a booking they did not cancel is told** (`lib/tell.ts`);
  booking for oneself is silent.
- **No network, no disk, no background work.** Old data is purged when My
  week is read.
