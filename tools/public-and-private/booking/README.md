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
- **Booking types**: a name, a duration, where (in person at an address,
  a phone call — the visitor gives their number —, a video link shown
  only once booked, or to agree), a colour. Behind *More options*: start
  times every N minutes, free time before and after, how far ahead at
  least and at most, on or off. Each type has its own link.
- **Hours**: every week (several ranges a day), the host's time zone,
  days off (one day or a holiday), other hours for one day.
- **Picking a time**: a month with the days that have free times, the
  day's times **in the visitor's time zone** (detected, changeable), then
  three fields (name, email, an optional note; the phone number for a
  phone call). A time is checked again when booking, and the database
  refuses two confirmed bookings of a host that overlap (buffers
  included), whatever their type: two visitors on the same time, one is
  told to pick another.
- **The guest's page** (`/b/<secret>`): the booking, *Add to my calendar*
  (an `.ics` file), *Change the time* (the same booking moved; five times
  at most), *Cancel* with an optional word.
- **Emails to the guest** (Proposal *mail*): confirmation with the
  calendar file, new time, cancellation, and a reminder the day before
  (Proposal *schedules*). The host hears of bookings, moves and
  cancellations in the Chest's bell, in their language and time zone.
- **For the team**: the agenda (upcoming, past, cancelled; *Everyone* for
  administrators), a booking's page (the guest's note, email and phone,
  their time if their zone differs), cancelling with a word sent to the
  guest, a CSV download, and a **private calendar address** a host adds to
  Google, Outlook or Apple Calendar (created on demand, shown once, can be
  replaced or stopped).
- **Keeping data**: bookings older than the company keeps them (24 months
  by default) are deleted every night; a guest's data can be erased by
  their email address.
- English and French, everywhere: the team's pages in each member's
  language, the public pages by the visitor's switch or browser, the
  emails in the language the guest booked in.

## Roles

| Role | May |
|---|---|
| `admin` | Everything a host may, plus everyone's bookings (and cancelling them), the company's settings, erasing a guest, the full export |
| `host` | Their own page, types, hours, calendar address and bookings |

A member without a role sees a page saying so. The first time a host
opens the tool, their page is made: an address from their name, the
company's time zone, weekday hours (9:00–12:30, 14:00–17:30) and one
30-minute type to start from.

## First minute

1. Open **Booking**: your page is already there — the purple ticket on top
   has its link. *Copy the link* and send it to a customer.
2. **Hours**: untick the days you do not meet people, change the times.
3. **Booking types**: *New type* — a name, a duration, where. Done.

## Routes

| Route | What |
|---|---|
| `/` | The company's page: the hosts shown |
| `/<host>` , `/<host>/<type>` | A host's page, booking one type |
| `/b/<secret>`, `/b/<secret>/ics` | The guest's booking and its calendar file |
| `/api/slots` | The free times of a type between two dates (read-only, public) |
| `/feed/<token>.ics` | A host's private calendar feed |
| `/lang/<code>` | The public part's language switch |
| `/chest`, `/chest/bookings/<id>`, `/chest/types…`, `/chest/hours`, `/chest/settings`, `/chest/export` | The team's part |
| `/chest-events`, `/chest-jobs/<name>` | Deliveries from the Chest (signed) |

## On a Chest

- `public: true`, `csp: "tool"`; `capabilities`: `database`, `members`
  (names, roles), `notifications`; `receives: ["member.*"]`.
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
- **Calendars**: Booking does not read the host's other calendar (Google,
  Outlook) to hide busy times — that needs outbound access and OAuth the
  Chest does not give; a host blocks time with days off and hours.

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

Reading the host's other calendars; meetings with several hosts (round
robin, collective); questions of the host's own on the form; payments;
group events with seats; a booking limit per day; SMS reminders; a
"reschedule" asked by the host (they cancel with a word).
