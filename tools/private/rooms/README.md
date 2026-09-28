# Rooms — desks, meeting rooms, and who is in the office

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. French interface name: **Salles**.

**Replaces** Robin, deskbird, Joan, Skedda, and the shared calendar of
meeting rooms: hybrid work's two daily questions — *where do I sit on
Thursday?* and *is the small room free at 2 pm?* — plus *who else is coming
in?*

## What it does

- **My week** (home): each working day of this week and the next, where I
  am — *Office*, *Remote*, *Off* — in one tap; who else is at the office
  that day (faces and a count); my desk and my meetings under each day.
  Saying *Office* offers my usual desk in one tap (the one given to me, or
  the one I booked last); saying *Remote* or *Off* frees the desk I had
  that day, with *Undo*.
- **Desks**: pick a day and *whole day / morning / afternoon*; tap a free
  desk on the plan (each floor's areas as tiles) or in the list of free
  desks; filter by what a desk offers (screen, dock, standing, window,
  quiet). Tapping another desk moves my booking there. A desk *given* to
  someone is theirs: nobody else books it.
- **Rooms**: the day's grid (rooms × quarter hours, 07:00–20:00 by
  default); click or drag an empty stretch, or press *Book a room*. Title
  and guests optional; guests hear it in the Chest's bell, in their own
  language. Change the time, room or guests; cancel with *Undo*; repeat
  *every week on this day for N weeks* (each occurrence is a booking of its
  own, cancelled one by one or "this and the next ones"). On a phone the
  grid becomes a list of rooms with their free slots.
- **No double booking, enforced by PostgreSQL**: exclusion constraints on
  time ranges (`tstzrange`) refuse two live bookings of one desk or one room
  that overlap, and two desks for one person at once — whatever runs at the
  same moment. The second person is told *Someone just took it*.
- **Who's where**: everyone on a day, grouped *at the office / remote / off
  / not said*, with their desk; search a name — *Where is Léa today?* — to
  see that person's coming days too.
- **Places** (admins): offices (name, address), floors, meeting rooms
  (seats, equipment, a note, a photo), desk areas and desks (added by the
  dozen, numbered on: D-07, D-08…), a desk given to someone. **Rules**: how
  many days ahead (14), desk days per person and week (no limit), how long a
  weekly booking lasts (12 weeks), the rooms' hours, the working days, how
  long past bookings are kept (12 months). **Export**: every booking of a
  period, and the occupancy per day (counts only), as CSV.

| Role (`chest.json`) | Label | May |
|---|---|---|
| `admin` | Admin | everything: places, rules, export; sees and cancels any booking; not held to the booking limits |
| `member` | Member | says where they are; books desks and rooms for themselves; changes and cancels their own bookings |
| (none) | — | sees a "you can't use this tool yet" page |

Everyone with a role sees who is at the office and who booked which room:
organising the office together is the point. The owner, the admins and the
tool's builders come in with the first role.

## First minute

- **What a new user sees:** *My week*: ten day cards, each with three
  buttons *Office / Remote / Off*, the faces of colleagues coming in, and
  their bookings. Before an admin sets up the office: "No office yet" and,
  for an admin, *Set up the office*.
- **The first thing they do:** tap *Office* on Thursday. The card offers
  *Book D-04* (their usual desk) — one more tap.
- **Clicks for the main jobs:** presence 1; a desk 1 from the plan (2 from
  home); a room 2–4 (drag, *Book*; title and guests optional).
- **A mistake:** every booking, cancellation and desk freed shows a toast
  with *Undo* (8 s). A slot someone took meanwhile is refused in plain words;
  the form stays open to pick another time. Removing a room or a desk asks
  a second click and says how many bookings were cancelled (their people are
  told).

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | members | My week (`?day=` highlights a day: the bell's links) |
| `/chest/desks` | members | Book a desk (`?day`, `part`, `view=list`, `f=screen,window`, `office`) |
| `/chest/rooms` | members | The rooms' day (`?day`, `booking=<id>` opens one, `office`) |
| `/chest/people` | members | Who's where (`?day`, `q`) |
| `/chest/places`, `/rules`, `/export` | admins | Offices; rules; downloads |
| `/chest/export?kind=bookings\|occupancy&from&to` | admins | CSV |
| `/chest/api/rooms/<id>/photo` | admins | Authorise (POST) and record (PUT) a room photo upload |
| `/chest/files/rooms/<id>` | members | A room photo: a fresh signed thumbnail link |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/` | anyone (public host) | "This tool lives in your Chest", with a language switch |

## On a Chest

- `capabilities`: `database`, `files` (room photos), `members` (names,
  photos, the guest picker, *Who's where*), `notifications` (guests told);
  `receives: ["member.*"]`.
- **PostgreSQL extension `btree_gist` is required.** The first migration
  runs `create extension if not exists btree_gist`: PostgreSQL marks it
  *trusted*, so the database's owner (the tool's role on a Chest) may create
  it; the Chest's PostgreSQL must ship the contrib extensions (standard
  packages do).
- **Time zone**: every office lives in the Chest's time zone
  (`CHEST_TIMEZONE`, Europe/Paris by default, read through the SDK's
  `schedules.timeZone()`). Bookings are stored as instants; days and hours
  are computed by PostgreSQL in that zone (daylight saving tested).
- **The bell**: guests of a room booking hear of it, of its changes and of
  its cancellation (one item per booking, replaced as it changes; one per
  weekly series). Booking a desk for oneself is silent; a desk or room an
  admin cancels for you, or a desk given to someone else, is told to you.
- **No badge**, on purpose: a badge means "something waits for you", and
  nothing here does (no check-in, no approval). A count of today's bookings
  would sit on the tile every day and mean nothing; keeping it right would
  also need a schedule every morning.
- **No schedule** needed: bookings in the past are simply past. What the
  rules no longer keep (bookings and presence older than N months;
  cancellations after a day) is deleted when *My week* is next read.
- **Lifecycle**: someone who loses access or leaves — their coming bookings
  are cancelled (rooms free, guests told "the organiser left"), they leave
  the meetings they were invited to, their given desk is free, their coming
  presence goes; the past stays for the export. An erasure then anonymises
  the past (`'erased'`, "Former member"), deletes presence and preferences,
  and is acknowledged.
- Private part in the member's language (`member.locale`), English first,
  French second (`lib/i18n/`); dates as in Europe (24-hour clock).
- No network, no disk writes, nothing in the background; pages that others
  change re-read themselves every 20–30 s while visible.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in the working copy packed in
  `vendor/`. Without it, everyone reads English.
- `schedules.timeZone()` — **Proposal (studio)**: the Chest's time zone.
  Without it the tool would have to assume Europe/Paris.
- Would help (not used): a way to hold **one room booking across tools**
  (Booking, a future Calendar) and an **iCal feed per member** (a signed
  per-member URL the Chest serves) — see "What it does not do yet".

## Develop

```sh
npm ci
npm test          # node:test; PGlite (with btree_gist) unless TEST_DATABASE_URL names a PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/rooms --port 5000`
runs it against a fake Chest with the sample office (`seed/sample.sql`);
`node lab/chest-dev/flows/rooms.mjs 5000` drives it in a browser;
`node lab/chest-dev/screens.mjs tools/private/rooms --port 5000` takes the
screenshots in `docs/screens/`.

## What it does not do (yet)

- A **floor-plan image** with desks placed on it (the plan is tiles by area
  today): later, with drag-and-drop placement.
- **Check-in** and releasing no-shows, reminders before a meeting: they need
  scheduled tasks and, for check-in, a reason to exist (no sensors here).
- Booking **for someone else**; rooms or areas **reserved to a group**;
  releasing a given desk when its owner is away.
- **iCal feed**, Outlook/Google room resources, door tablets.
- **Importing** rooms from a Google Workspace resources CSV or desk
  assignments from Robin/deskbird: setting up an office takes minutes here.
- Offices in **different time zones** within one Chest.
