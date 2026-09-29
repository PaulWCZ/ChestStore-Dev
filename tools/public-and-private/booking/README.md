# Booking — let people book a time with you

**Booking** (French: *Rendez-vous*) replaces Calendly, Cal.com and Google
Calendar's booking pages for a company that meets its customers: each
person who takes meetings has a public page, their hours, and kinds of
meeting; visitors pick a free time in their own time zone and get a
confirmation; nobody is ever booked twice.

## What it does

- **A page per host**: `/<their-name>` — their name, a welcome sentence,
  the kinds of meeting they offer. A company page (`/`) lists the hosts
  who chose to be shown.
- **Nobody is published by opening the tool.** A new host's page is **not
  public** — not on the company page, no page of its own, not bookable,
  not taken as part of a team — until they **connect a calendar** (one
  that reads) or **confirm their hours** (*My hours are right: make my
  page public*, or saving the hours). Their first screen asks for the
  calendar first; the link to share appears only once the page is public.
  Hosts made before this version stay public if they did anything with
  their page (a calendar, a booking, a block, a day off, a welcome, hours
  of their own); a host who had only opened the tool once is unpublished
  until they confirm (migration `0004`).
- **The host's texts in two languages**: a host says which language they
  write in (Settings; it starts as their Chest language) and may add a
  second version — the welcome sentence in Settings, and in each booking
  type its name, description, questions and choices ("— in French" fields
  under each). A visitor reads a host's page **in one language**: theirs
  when the host wrote it, otherwise the host's — the page's own words
  follow, and the language switch offers only the languages the host
  wrote (none when there is one). A French visitor never sees English
  questions with « Oui / Non ». A text left empty in the second language
  shows the first. The booking keeps the type's name, questions and
  answers **as the guest read them**, and their emails are in that
  language.
- **The host's real calendar**: a host pastes the secret iCal address of
  their Google, Outlook or Apple calendar (up to three); the times they are
  busy there are never offered. Booking reads it through the Chest's
  declared network (`chest.json` `network`: `calendar.google.com`,
  `outlook.office365.com`, `outlook.live.com`, `*.icloud.com`), **every
  15 minutes** (schedule `calendars`), when a visitor opens a booking page
  and the last read is older than 10 minutes, and when the host presses
  *Read them now*. It keeps only busy intervals — never a title, a place
  or a person — and understands repeating events (RRULE daily, weekly,
  monthly, yearly, with exceptions and moved occurrences), whole days,
  time zones (IANA, Outlook's Windows names, a calendar's own
  VTIMEZONE), and "free" or cancelled events. **The honest delay**: a
  meeting added in Google a few minutes ago may still be offered until
  the next read (at most about 15 minutes; Google itself may take a
  few minutes to publish a change in its secret address). A calendar that
  cannot be read is flagged on the host's agenda ("We could not read your
  calendar … since …") and on Hours.
- **Block a time, from the agenda**: the coming week's **free stretches**
  show between the meetings ("Free 14:00–17:30 · + Block"): tap one and
  pick the hours (the quarter hour, up to 24:00), or *Block a time* beside
  *New booking*; a note only the host sees. A blocked time is freed with
  one tap (*Unblock*), with Undo.
- **Booking types**: a name, a duration, where (in person at an address,
  a phone call — the visitor gives their number —, a video call, or to
  agree), a colour. A video call is either **a new room for each
  meeting** — the host **chooses where rooms are made**: Jitsi Meet's free
  server (meet.jit.si), whose rooms the host opens by signing in with
  Google, GitHub or Facebook (guests need no account and wait until the
  host arrives; the type form, the booking's page and the guest's page say
  so), or their company's own server, `{room}` marking where the room's
  name goes; there is no silent default — or one fixed link (the form then
  warns that every guest gets the same link). *Checked 2026-09-29*: Jitsi
  announced that from 24 August 2023 meet.jit.si no longer lets anyone
  create a room anonymously and asks the moderator to sign in (Google,
  GitHub, Facebook), guests joining without an account
  (https://jitsi.org/blog/authentication-on-meet-jit-si/, read through a
  web search summary — the page itself and meet.jit.si are blocked from
  the studio; https://github.com/jitsi/jitsi-meet/issues/13753, 2023-08-26,
  users reporting "Waiting for a moderator… please log-in"). Nothing found
  says it was lifted since; not tried live from here.
  An optional **payment link** (Stripe, PayPal…) is shown to the guest
  once booked; the host marks the booking paid.
- **Round robin**: an administrator can let other hosts take one of their
  types ("Also taken by"): a time is free when any of them is, and the
  booking goes to the free one with the fewest meetings of this type to
  come. Its page says "With Camille, Inès or Hugo". Behind *More options*: start
  times every N minutes, free time before and after, how far ahead at
  least and at most, **how many bookings of this type a day at most**,
  on or off. Each type has its own link.
- **The host's own questions**: up to five per type, each a short text,
  a long text, one choice among options (2 to 10) or yes/no, required or
  optional, moved up and down with two buttons. The guest answers them on
  the form; the answers are checked again on the server (required ones
  given, lengths, a choice among the options) and kept with the questions
  as the guest saw them.
- **Limits hold when booking**: the daily limit is counted on the host's
  calendar (their time zone, daylight-saving days included); a full day
  shows no free time, and booking or moving a booking re-checks every
  rule inside one transaction that locks the type — two visitors racing
  for the last place of a day cannot both get it (tested on PostgreSQL).
- **Hours**: every week (several ranges a day, *Copy Monday to every
  weekday*), the host's time zone, **at most N meetings a day across all
  their types**; folded below, each saying what it holds ("1 calendar
  connected", "2 days planned"): the other calendars (open while none is
  connected or one fails) and days off (one day or a holiday) or other
  hours for one day. About 2,300 px on a 390 px phone (4,764 before).
- **Picking a time**: five weeks from the week of the first free day
  (never a month of greyed past days), the day's times **in the visitor's
  time zone** (detected, changeable in a list of cities with their offset,
  "Paris (UTC+2)", common zones first then by region), then
  three fields (name, email, an optional note; the phone number for a
  phone call) and the host's own questions, if any. A time is checked again when booking, and the database
  refuses two confirmed bookings of a host that overlap (buffers
  included), whatever their type: two visitors on the same time, one is
  told to pick another.
- **The guest's page** (`/b/<secret>`): the booking, *Add to my calendar*
  (an `.ics` file), *Change the time* (the same booking moved; five times
  at most), *Cancel* with an optional word.
- **Emails to the guest** (Proposal *mail*): confirmation with the
  calendar file and their answers, new time, cancellation, and a reminder
  the day before (Proposal *schedules*). The host hears of bookings, moves
  and cancellations in the Chest's bell, in their language and time zone
  (a new booking's bell shows the note and the answers, as far as it fits).
- **A host books for a customer** (*New booking*: a type, a free time —
  the minimum notice aside —, the guest's name and email; they get the
  usual confirmation and link) and **moves a meeting** (*Move this
  meeting*: the guest is emailed the new time).
- **Each booking in the host's Chest calendar** (Proposal *calendar*): put
  when booked or moved, removed when cancelled or erased, titled in each
  reader's language. With email, the host also gets each booking with its
  calendar file (Settings, on by default), which a calendar app adds at
  once — the Chest's feed is read by Google hours later.
- **On the company's website**: an administrator lists the websites
  allowed to show the booking pages (their `frame-ancestors`) and copies
  a frame code, or a button code that opens the page.
- **Import from Calendly**: its *Scheduled events* CSV export; meetings
  still to come become bookings (matched to types by name), a time already
  taken is listed, not booked twice; importing again adds nothing.
- **The anti-robot check never refuses a person**: a form sent within 3
  seconds of showing it waits the seconds left instead of being refused.
- **For the team**: the agenda (upcoming, past, cancelled; *Everyone* for
  administrators; the CSV download at its foot), a booking's page (the guest's note, answers, email and
  phone, their time if their zone differs), cancelling with a word sent to
  the guest, a CSV download (answers included), and a **private calendar address** a host adds to
  Google, Outlook or Apple Calendar (created on demand, shown once, can be
  replaced or stopped).
- **Keeping data**: bookings older than the company keeps them (24 months
  by default) are deleted every night; a guest's data (answers included)
  can be erased by their email address.
- English and French, everywhere: the team's pages in each member's
  language, the public pages by the visitor's switch or browser, the
  emails in the language the guest booked in.

## Roles

| Role | May |
|---|---|
| `admin` | Everything a host may, plus everyone's bookings (and cancelling or moving them), the company's settings, the websites that may show the pages, team (round robin) types, erasing a guest, the full export |
| `host` | Their own page, types, hours, calendar address and bookings |

A member without a role sees a page saying so. The first time a host
opens the tool, their page is made: an address from their name, the
company's time zone, weekday hours (9:00–12:30, 14:00–17:30) and one
30-minute type to start from — not public until they connect a calendar
or confirm their hours.

## First minute

1. Open **Booking**: "Your page is not public yet". Paste your Google,
   Outlook or Apple calendar's secret address (*Where to find it* says
   how) and *Connect*: your meetings there are never offered, and your
   page is public. No calendar? *Check my hours*, then *My hours are
   right: make my page public*.
2. The purple ticket now has your page's link: *Copy the link* and send
   it to a customer.
3. **Booking types**: *New type* — a name, a duration, where. Done. A
   free stretch of your agenda: tap it to block it.

## Routes

| Route | What |
|---|---|
| `/` | The company's page: the hosts shown |
| `/<host>` , `/<host>/<type>` | A host's page, booking one type |
| `/b/<secret>`, `/b/<secret>/ics` | The guest's booking and its calendar file |
| `/api/slots` | The free times of a type between two dates (read-only, public) |
| `/feed/<token>.ics` | A host's private calendar feed |
| `/lang/<code>` | The public part's language switch |
| `/chest`, `/chest/bookings/<id>`, `/chest/new`, `/chest/types…`, `/chest/hours`, `/chest/settings`, `/chest/export` | The team's part |
| `/chest/api/slots` | The free times a host sees (booking for a guest, moving a meeting) |
| `/chest-events`, `/chest-jobs/<name>` | Deliveries from the Chest (signed) |

## Looks

Booking wears **any look the company chooses in its Chest**, with the same
features: its own identity ("Appointment card": paper, plum ink, mint for
what is free), any theme of the store's catalogue (the 18 identities,
"Chest", "High contrast"), or **the company's brand** (its colours, fonts,
corners and logo) — for all its tools or for Booking alone. In brand mode
the public pages show the company's logo instead of its name, and the
"button" code for its website takes its colours: the booking page reads as
the company's own. **The public pages** (a host's page, a guest's booking,
that button) wear the company's brand when it has one and Booking's own
identity otherwise — never a catalogue theme chosen for the team, never
the Chest's sheet (kit 0.2.3, `surface: "public"`). The look is resolved on
the server (`lib/theme.ts`, `lib/look.ts`, `chest.theme()`), written in one `<style>` with the page's nonce; every
text stays readable (WCAG AA) in every look. Screens:
`docs/screens/*-chest-*`, `*-theme-*`, `*-brand-*`.

## On a Chest

- `public: true`, `csp: "tool"`; `capabilities`: `database`, `members`
  (names, roles), `notifications`; `receives: ["member.*"]`; `network`:
  the four calendar hosts (the owner approves "Can reach
  calendar.google.com", …). Nothing else leaves the tool.
- **Other calendars' addresses are secrets**: kept to read them, shown
  again only as their host and file name, deleted when the host
  disconnects one, loses access, leaves or is erased.
- **Guests are not members**: their name, email, phone number and note
  are kept for the meeting, deleted after the retention or on request.
  Say it in your privacy notice.
- **A host leaves or loses access**: their page takes no new booking and
  says it does not exist; the bookings already made stay, for an
  administrator to keep or cancel. Given access again, the page comes back
  when they open the tool. **Erasure**: their page, types and hours are
  deleted, their future meetings cancelled and each guest emailed; past
  bookings stay, their host written "Former member".
- The PostgreSQL extension `btree_gist` is created by the migration (the
  no-overlap constraint needs it). It ships with PostgreSQL; whether the
  Chest's migration role may create it is to be confirmed (see the SDK
  report).

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`.
- **`mail`** — **Proposal (studio)** (`chest.proposals.json`: `send`).
  Without it the tool works: the guest keeps their page's link (shown
  after booking), and Settings says guests get no email.
- **Scheduled tasks** — **Proposal (studio)**: `reminders` (hourly) and
  `cleanup` (nightly). Without them, no reminder is sent and bookings are
  kept until an administrator erases them.
- **Photos on the public host**: the Chest's photo links work on the team
  host only; public pages show initials.
- **The Chest's settings** — **Proposal (studio)** (`chest`): the company's
  name (an administrator may name it otherwise for visitors), the default
  time zone of new hosts, and the public host's address. On a Chest that
  does not give them yet: no name, Europe/Paris, and the address derived
  from the request (remembered for emails sent by a schedule).
- **The visitor's address** for the booking form's counters is read from
  `X-Forwarded-For`, assumed set by the Chest's front.
- **`calendar`** — **Proposal (studio)** (`chest.proposals.json`:
  `"calendar": true`): each booking in its host's Chest calendar feed.
  Without it, the tool's own private feed (Settings) remains.
- **Schedule `calendars`** (every 15 minutes) reads the hosts' other
  calendars; without schedules, they are read when a visitor opens a
  booking page (10 minutes at most between reads) and on demand.
- **Declared network** (real contract, `network`): Node's `fetch` follows
  the Chest's proxy through `NODE_USE_ENV_PROXY=1` (Node ≥ 24.5 in the
  Chest's image; the tool's `engines` allow Node 22 for local work, where
  fetch goes out directly).
- **Being shown in another website**: the Chest's front adds
  `frame-ancestors 'none'` to every public response, even with `csp:
  "tool"` (contract, "Public host", `FloorCSP`), and two policies combine,
  so **the frame code cannot work on a Chest today**: the Chest needs a
  permission that lets an administrator allow the company's websites
  (see the SDK report). The button code works today.
- **Free/busy by OAuth** (Google, Microsoft): the secret iCal address is
  a first step; a connector held by the Chest would read free/busy in
  seconds without a secret address (SDK report).

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build
```

In the studio: `node lab/chest-dev/dev.mjs tools/public-and-private/booking --reset --port 5100`
(the `/_dev` page shows the outbox, the bell, and runs the schedules),
`node lab/chest-dev/flows/booking.mjs 5100`,
`node lab/chest-dev/screens.mjs tools/public-and-private/booking --port 5100`.

## What it does not do (yet)

- **Calendar reading is not instant**: up to about 15 minutes between a
  change in Google/Outlook/Apple and Booking seeing it (plus the provider's
  own publishing delay). It reads secret iCal addresses only: no OAuth,
  no CalDAV account, no calendar shared with the host by someone else
  unless it has its own address. Declined invitations still read as busy
  (an iCal feed does not say who "you" are).
- **Collective meetings** (two hosts who must both be free) and team
  types across several owners' pages: a team type lives on its owner's
  page. Team members' daily limit of the type counts per host.
- **Embedding** works only once the Chest lets the public part be framed
  (above); until then, the button.
- Payments: a link and a "paid" mark, no payment taken or checked by the
  tool (no Stripe connector yet).
- Limits per week or month (per day only: per type, and per host across
  types); questions with several choices, a date or a file, or shown only
  after another answer; group events with seats; SMS reminders.
- Calendly: only its scheduled events are imported (its event types have
  no export); the importer reads the column names Calendly's help pages
  give (search results, 2026-09-29), not a file checked from a real
  account.
- Answers are not shown back on the guest's own page (they are in their
  confirmation email). A host's texts have two versions at most (the
  store speaks English and French); a second version's choices follow the
  first's by position (reordering the choices needs the second list
  reordered too). A booking made by a host for a guest keeps the language
  the host chose for the guest's emails, even if the host wrote only one.
- The first screen reads a calendar only by its secret iCal address (no
  OAuth yet); a host with none confirms their hours instead. Unpublishing
  a public page again is done by turning its types off.
