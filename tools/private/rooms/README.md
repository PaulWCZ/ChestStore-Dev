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
  that day (faces and a count, my teams first: "3 people at the office · 1
  from your team"); my desk and my meetings under each day. Saying
  *Office* offers my usual desk in one tap (the one given to me, the one of
  my usual week, or the one I booked last); saying *Remote* or *Off* frees
  the desk I had that day, with *Undo*. One Tab stop per day: the arrow
  keys move between *Office*, *Remote* and *Off*.
- **Presence agrees with meetings**: the people in a meeting in one of the
  office's rooms (its organiser and its guests) count among the people at
  the office that day — on My week, in *Who's where* and in the occupancy —
  unless they said *Remote* or *Off*. Someone who said *Remote* or *Off* on
  a day they have a meeting in a room reads "Meeting in Atlas at 10:00:
  coming to the office?" on that day, with a one-tap *Office*.
- **Before any office exists**, people already say *Office*, *Remote* or
  *Off* ("who is in on Thursday?" needs no floor plan); an admin sees
  *Set up the office* and *Start with an example* above the week.
- **My usual week**: for each working day, *Office*, *Remote*, *Off* or
  nothing, and the desk I want on office days. As days enter the booking
  window, Rooms says them for me and books that desk — once per day: a day
  I change myself is never changed again, and changing the usual week
  takes back only what the old one did. Nothing runs in the background:
  it is applied when any page of the tool is read.
- **In everyone's calendar** (**Proposal (studio)**: `calendar`): every
  room booking is an event in the Chest calendar feed of its organiser and
  its guests (each in their language), moved when it moves, gone when it
  is cancelled; every day at the office is a whole "free" day with the
  desk in the member's own feed. Each booking downloads as an `.ics` file
  (*Add to my calendar*), and so do all my coming bookings. Guests get an
  email with the `.ics` when the Chest can send email (**Proposal
  (studio)**: `mail`).
- **Desks**: pick a day and *whole day / morning / afternoon*; tap a free
  desk on the plan (each floor's areas as tiles) or in the list of free
  desks; filter by what a desk offers (screen, dock, standing, window,
  quiet). Tapping another desk moves my booking there. A desk *given* to
  someone is theirs: nobody else books it.
- **Rooms**: *Find a free room* — how many people, at what time, for how
  long, with what — lists the rooms free then (and how many are busy or too
  small); on today it starts at the current quarter hour: the rooms free
  now. Then the day's grid (rooms × quarter hours, 07:00–20:00 by
  default); click or drag an empty stretch, or press *Book a room*. Title
  and guests optional; guests hear it in the Chest's bell, in their own
  language. Change the time, room or guests; cancel with *Undo*; repeat
  *every week on this day for N weeks* (each occurrence is a booking of its
  own, cancelled one by one or "this and the next ones"). On a phone the
  grid becomes a list of rooms with their free slots ("Tap a free time").
  A tap outside a booking form someone started does not close it; moving
  the start keeps the length chosen. Days beyond how far ahead one may book
  say "Not open for booking yet: it opens on …" instead of offering desks
  and rooms that would then be refused.
- **Check-in** (off by default; **Proposal (studio)**: `schedules`): a
  reminder in the bell a quarter of an hour before each meeting; when an
  admin turns check-in on, people tap *I'm here* (from ten minutes before),
  and a room nobody checked in to is freed 15 to 30 minutes after its
  start — its people told. A room booked on the spot counts as checked in.
- **No double booking, enforced by PostgreSQL**: exclusion constraints on
  time ranges (`tstzrange`) refuse two live bookings of one desk or one room
  that overlap, and two desks for one person at once — whatever runs at the
  same moment. The second person is told *Someone just took it*.
- **Who's where**: everyone on a day, grouped *at the office / remote / off
  / not said*, with their desk; a team chip (the Chest's groups: Sales,
  Tech…; **Proposal (studio)**: `groups`) keeps that team; search a name —
  *Where is Léa today?* — to see that person's coming days too.
- **Given desks lent**: a desk given to someone is booked by others on the
  days its holder said *Remote* or *Off* (or Leave told Rooms they are
  away), unless the holder keeps it (*My usual week*). The holder sees
  "Your desk D-12 is lent to Léa that day".
- **For someone else** (admins and **office managers**): book a room or a
  desk for a person who has Rooms; they are told in the bell.
- **Visitors** (*Visitors* tab): a member announces their visitor — a
  name, a company, a time; the reception (office managers and admins) sees
  every visitor of the day, announces one for anyone, and taps *Mark
  arrived*: the host hears "Paul Durand (Client SA) is here to see you" in
  the bell. Cancelling a visit and marking an arrival both have *Undo*.
  My week shows my visitors on their day. Only the host, whoever announced
  the visit and the reception see a visitor's name; it goes with the past
  bookings (the rule "how long past bookings are kept").
- **When a desk's holder comes back** (says *Office* on a day their given
  desk was lent), whoever booked it that day hears it in the bell ("Sofia
  Rossi is coming in on Thursday 8 October: D-12 is their desk…"); the
  booking stays theirs, and the holder reads that they know.
- **Kept for a team**: a room or a desk area may be kept for one Chest
  group ("Sales only"); only its members and admins book there.
- **Moving in** (admins, *Places*): rooms from Google Workspace's resources
  CSV (floors made, seats and equipment read), and who has which desk from
  any sheet (desk, person's name, optional area); both only add what is
  missing and say line by line what they left out. **Bookings already
  made**: the `.ics` export of a room's calendar (Google Calendar,
  Outlook) — only what is still to come, up to a year ahead; a weekly
  meeting (every week, same weekday) becomes one weekly booking, other
  repeats their days one by one; the organiser and guests matched by name
  to the people who have Rooms by address (the `members.email`
  permission) and by name in the forms exports write them — Outlook's
  "Martin, Camille" too, a department in brackets aside (else the booking
  is in the admin's name: the preview says how many bookings, before
  anything is imported, and which guests it did not find). A **preview** says what comes in and, line by
  line of the file, what does not: the days already taken in Rooms (the
  database's own conflicts, not a guess), all-day events, times outside
  the rooms' hours, closed days. *Import* does it with **Undo** (the whole
  import goes); the same file again adds nothing. The room is guessed from
  the calendar's name. **My data**: a member downloads everything Rooms
  keeps about them (CSV).
- **Start with an example** (admins, the empty tool): an office in one
  click — two floors, three rooms, twelve desks — marked as an example on
  *Places*, with Undo and "Delete the example" (whole, while nobody booked
  in it).
- **Names the tool gives are keys**: the floors and areas of the sample and
  of the example ("Ground floor", "Quiet zone") read in each person's
  language ("Rez-de-chaussée", "Zone calme") until an admin renames them;
  CSV exports too. The name stored beside the key is in the Chest's
  language (a calendar event's location).
- **Places** (admins): offices (name, address), floors, meeting rooms
  (seats, equipment, a note, a photo), desk areas and desks (added by the
  dozen, numbered on: D-07, D-08…), a desk given to someone. **Rules**: how
  many days ahead (14), desk days per person and week (no limit), how long a
  weekly booking lasts (12 weeks), the rooms' hours, the working days, how
  long past bookings are kept (12 months), check-in. **Export**: how full
  the office is on each working day (a bar per day, counts only: the
  average **since the first day someone came**, eight weeks at most — the
  weeks before anyone used Rooms are no data, not zeros; the chart says
  "since 28 September", and a weekday not yet seen says so), every booking of a period, and the occupancy per
  day (counts only), as CSV.

| Role (`chest.json`) | Label | May |
|---|---|---|
| `admin` | Admin | everything: places, rules, export; sees and cancels any booking; not held to the booking limits; the reception |
| `manager` | Office manager | books desks and rooms for anyone, changes and cancels any booking, not held to the booking limits; the reception (every visitor, arrivals). Not places, rules or exports |
| `member` | Member | says where they are; books desks and rooms for themselves; changes and cancels their own bookings; announces their own visitors |
| (none) | — | sees a "you can't use this tool yet" page |

Everyone with a role sees who is at the office and who booked which room:
organising the office together is the point. The owner, the admins and the
tool's builders come in with the first role.

## First minute

- **What a new user sees:** *My week*: ten day cards, each with three
  buttons *Office / Remote / Off*, the faces of colleagues coming in, and
  their bookings. Before an admin sets up the office: "No office yet"
  above the same week (saying *Office* or *Remote* already works) and, for
  an admin, *Set up the office* and *Start with an example*.
- **The first thing they do:** tap *Office* on Thursday. The card offers
  *Book D-04* (their usual desk) — one more tap. Or once, *My usual week*:
  Monday to Thursday *Office*, a desk, *Save* — the coming weeks fill
  themselves.
- **Clicks for the main jobs:** presence 1; a desk 1 from the plan (2 from
  home); a room 2–4 (drag, *Book*; title and guests optional), or 2 from
  *Find a free room* (the room, *Book*).
- **A mistake:** every booking, cancellation and desk freed shows a toast
  with *Undo* (French « Annuler l’action », never the « Annuler » of a
  cancelled booking; 10 s, waiting while it is hovered or focused, Ctrl+Z
  too); it then says whether it was undone. A slot someone took meanwhile is refused in plain words;
  the form stays open to pick another time. Deleting a room or a desk
  cannot be undone (its bookings are cancelled, their people told): it asks
  first, in the page, and then says how many bookings were cancelled. A form
  someone started asks before it is closed (Escape, a tap outside).

## Looks

Rooms wears its own identity, **Blueprint** (drafting paper, navy ink, one
signal orange: `lib/theme.ts`, DESIGN.md), unless the company chose
otherwise in its Chest: any theme of the store's catalogue (the other
tools' identities, "Chest", "High contrast"), or **its own brand** (its
colours, fonts, corners and logo), for all its tools or for Rooms alone.
Every look has the same pages, words and features, and passes the same
contrast checks, light and dark. Screens: `docs/screens/week-chest-*`
(Chest), `week-theme-*` (Library), `rooms-theme-*` (Workshop),
`week-brand-*` and `desks-brand-dark-*` (a sample brand), `rooms-port-*`
(a second sample brand, Café du Port). The drafting paper is decoration:
in a brand, the Chest's sheet and High contrast it steps aside (kit
0.2.3 `--decor`), and the page is the company's.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | members | My week (`?day=` highlights a day: the bell's links) |
| `/chest/desks` | members | Book a desk (`?day`, `part`, `view=list`, `f=screen,window`, `office`) |
| `/chest/rooms` | members | The rooms' day (`?day`, `booking=<id>` opens one, `office`) |
| `/chest/people` | members | Who's where (`?day`, `q`, `team`) |
| `/chest/visitors` | members | Visitors of a day (`?day`, `office`): my own; the reception, everyone's |
| `/chest/calendar/room/<id>` | members | One booking as an `.ics` file |
| `/chest/calendar/mine` | members | All my coming bookings and office days, `.ics` |
| `/chest/mine` | members | Everything Rooms keeps about me, CSV |
| `/chest/places`, `/rules`, `/export` | admins | Offices; rules; downloads |
| `/chest/export?kind=bookings\|occupancy&from&to` | admins | CSV |
| `/chest/api/rooms/<id>/photo` | admins | Authorise (POST) and record (PUT) a room photo upload |
| `/chest/files/rooms/<id>` | members | A room photo: a fresh signed thumbnail link |
| `/chest-events` | the Chest only (signed) | members' lifecycle; Leave's events |
| `/chest-jobs/quarter` | the Chest only (signed) | every quarter of an hour: reminders, check-in |
| `/` | anyone (public host) | "This tool lives in your Chest", with a language switch |

## On a Chest

- `capabilities`: `database`, `files` (room photos), `members` (names,
  photos, the guest picker, *Who's where*), `members.email` (to match the
  organisers and guests of an imported calendar, and desk holders, by
  address: read on the server for matching, never shown nor kept),
  `notifications` (guests told);
  `receives: ["member.*"]`. Proposals in `chest.proposals.json`:
  `calendar`, `groups: "read"`, `mail.send`, `schedules` (`quarter`), and
  `receives` Leave's events.
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
- **One schedule** (**Proposal (studio)**, `chest.proposals.json`):
  `quarter`, every 15 minutes — reminders before meetings and, with
  check-in on, freeing unclaimed rooms. Everything else needs none: what
  the rules no longer keep is deleted when *My week* is next read; the
  usual weeks are applied and the calendars told when any page is read.
- **Calendar, email, groups** (**Proposals (studio)**): `"calendar": true`,
  `"mail": {"send": true}`, `"groups": "read"`. Each change writes the keys
  it touched in `calendar_queue` in its own transaction; the tool then puts
  or removes each event from what the database holds, so a Chest that did
  not answer is asked again at the next change or page read. An event
  leaves the calendars a month after it is over (the Chest keeps 5,000 per
  tool). On a Chest without these, the tool learns it, asks again hourly,
  and says only what is true ("They find it in their bell and in their
  week"); the `.ics` downloads always work.
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

## With the other tools

Rooms hears from **Leave** (**Proposal (studio)**: events between tools;
`chest.proposals.json` `"receives": ["leave.approved", "leave.cancelled"]`),
once an administrator linked the two: an approved leave marks its whole
days "Off" for the person (half days are left alone: they may come for the
other half) and frees their desk those days; a cancelled leave takes back
the days it marked — never what the person set themselves since — and
leaves them to the person's usual week again. A freed desk is not booked
again by itself; the days leave the person's calendar feed; a given desk
is lent to others on those days (`lib/away.ts`).

## Needs from the SDK

All in the SDK working copy packed in `vendor/` (0.3.0-studio.15):

- `member.locale`, `schedules.timeZone()` / `chest.teamUrl()` — **Proposal (studio)**.
- `calendar` (`putMany`, `put`, `remove`, `ics`, `uidOf`, `page`) — **Proposal (studio)**:
  the members' calendar feeds, the `.ics` files. What changed goes in one
  `putMany` (studio.15: up to 100 events, one write of the minute); when
  the Chest refuses the batch for one event, each goes alone and only that
  one is dropped.
- `mail.send` to `{member}` with attachments — **Proposal (studio)**: guests' emails,
  keyed by booking, revision and guest, passed whole (studio.15 hashes a key
  past 64 characters; before, one refused key stopped every later guest's
  email). Each guest's email preference in the Chest applies (none are
  marked transactional: an invitation is not the answer to their request).
- `members.groups.all`, all of `member.groups` — **Proposal (studio)** (`"groups": "read"`).
- `schedules` — **Proposal (studio)**: the quarter-hour reminders and check-in.
- Events between tools — **Proposal (studio)**: Leave's `leave.approved` / `leave.cancelled`.
- Would help, not built: a way for a tool to know the UID the Chest's feed
  gives one of its events (today the `.ics` files use the team host as
  domain, the feed the Chest's: a person who both imports a file and
  subscribes sees the event twice); a **higher calendar quota** or events
  that expire on their own (5,000 per tool is about 6 weeks of desk days at
  200 people — Rooms takes events back a month after they are over); a
  **free/busy and room-resources connector** for Google Workspace and
  Microsoft 365 (see below). What the `calendar` proposal would need to
  add for meeting rooms: (1) **free/busy read** of a company room resource
  in Google Workspace or Microsoft 365 (`calendar.busy(resource, from,
  to)` → busy ranges, through the Chest's OAuth), so Rooms shows and
  refuses what was booked in Outlook; (2) **write-back** (`calendar.book(
  resource, event)` / `calendar.cancel`) so a Rooms booking holds the room
  resource and appears in the invitations; (3) a **change notice** (an
  event such as `calendar.resource.changed`, delivered to `/chest-events`)
  so a meeting moved in Outlook moves in Rooms without polling.

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

- **Google Calendar / Outlook room resources are not synced.** A room
  booked in Google Calendar or Outlook does not reach Rooms, and Rooms
  bookings reach people's calendars only through the Chest's feed (which
  those apps refresh at their own pace — Google every several hours) and
  the `.ics` files. Two-way sync with room resources needs a **platform
  connector** (OAuth held by the Chest, declared network, Google Calendar
  API / Microsoft Graph): later, on the Chest's side. Until then, a company
  that keeps booking rooms in its calendar keeps two places to book.
- **Importing future bookings** reads a calendar's `.ics` export, once:
  it is a switching-day tool, not a sync (bookings made in Google or
  Outlook afterwards do not arrive). Robin's and deskbird's own exports
  are not read. A series that repeats every two weeks or monthly comes as
  separate days, not as a series of Rooms.
- Addresses are matched only when the Chest gives them (`members.email`);
  otherwise imports match by name (and by an address's `first.last` local
  part).
- **Visitors**: no email to the visitor (it would need `mail` and an
  address the tool does not keep), no badge printing, no sign-in tablet at
  the door, no NDA; a visit is not linked to a room booking. A visit is
  "here" but never "left".
- A borrower is told when the holder of the desk comes back, but there is
  no one-tap "swap" between them.
- A **floor-plan image** with desks placed on it (the plan is tiles by area).
- **Door tablets**, sensors, parking spaces and other resources.
- Check-in is **15 to 30 minutes** late at worst (the Chest calls the tool
  every quarter of an hour), and reminders come 0–15 minutes before.
- Offices in **different time zones** within one Chest.
