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
  calendar … since …") and on Hours. **A wrong address is named for what
  it is**, before anything is read: Google Calendar's page or its embed
  code ("the address of a Google Calendar page, not its secret address:
  ⚙ Settings → your calendar → …"), Outlook's HTML link ("copy the ICS
  one, it ends in .ics") or its app's page, iCloud's website; a
  `webcal://` address is read as `https://`.
- **The host's truth on the agenda**: each booking shows its type **in the
  reader's language** — one type, one name, whatever language the guest
  booked in ("Visite du showroom" for Inès, who reads French, for an
  English and a French guest alike), the guest's language as a small tag
  ("EN") when it is not the reader's; the same on a booking's page, in the
  bell, the Chest's calendar, the host's email copy and the CSV (a *Guest's
  language* column). The coming week's **busy times from elsewhere** show
  as grey rows within the host's hours — "Busy · In your Google calendar
  16:00–17:00", "An interview in Hiring", "Off" (a day of leave, told by
  Leave) — times only, so a hole in the
  free times is never a mystery. On a phone, free stretches and busy rows
  fold behind **Show free times** (remembered on that phone): the meetings
  come first.
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
  (never a month of greyed past days) — **one Tab stop**: the arrows move
  among the open days (up and down a week, Home, End), Enter picks — the
  day's times **in the visitor's time zone** (detected, changeable in a
  list of cities with their offset, "Paris (UTC+2)", common zones first —
  France's overseas departments among them — then by region; **city names
  in the reader's language**: "Bruxelles", "Nouméa", "La Réunion", and
  "Toronto, Montréal" for the zone Montréal's browsers give), then
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
  language, the public pages by the visitor's switch or browser (else the
  Chest's language), the emails in the language the guest booked in.

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
| `/chest-events`, `/chest-schedules` | Deliveries from the Chest (signed): the members' lifecycle and other tools' events; the runs of `chest.json`'s schedules |
| `/chest/look.css`, `/look.css` | The look of the team's and of the public pages, a stylesheet (src/theme.ts) |
| `POST /chest/actions/<name>`, `POST /actions/<name>` | The team's and the public part's actions (`src/actions.ts`) |

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
the server (`src/theme.ts`, `chest.theme()`) and served as a stylesheet of its own — `/chest/look.css` for the team's pages, `/look.css` for the public ones, linked with its hash, never an inline `<style>`; every
text stays readable (WCAG AA) in every look. Screens:
`docs/screens/*-chest-*`, `*-theme-*`, `*-brand-*`.

## With the other tools

Through the *events between tools* proposal (`chest.proposals.json`
`"emits"` and `"receives"`), once an admin of the Chest linked Booking to
another tool — the Chest's decision, never the tool's. Publishing is a
courtesy: when the Chest cannot take an event (not linked, not granted,
its hourly quota), the booking stands and nothing is said. Every event
carries `v: 1`; a receiver ignores a version it does not know.

**What Booking publishes**

| Event | When | Key (the Chest's 24-hour de-duplication) |
|---|---|---|
| `booking.busy` | A host's busy times changed: a booking made, moved, cancelled or erased, a time blocked or freed, a calendar connected, disconnected or read (schedule `calendars`, every 15 minutes: only what changed), and once a day as the window moves on | `busy:<member>:<ms>:<hash>` |
| `booking.confirmed` | A booking made (by a visitor or a host for them) or moved (the same booking, told again) | `booking:<id>:<guest email>:confirmed:<moves>` (its data is the same each time it is told: `at` is when it was made or last moved, as recorded) |
| `booking.cancelled` | A booking cancelled by its guest or host, or because its host was erased | `booking:<id>:<guest email>:cancelled` (`at`: when it was cancelled) |

`booking.busy` — for Hiring (its candidates never pick a time a host
already gave away); the same shape as Hiring's `hiring.busy`
(`lib/busy-snapshot.ts`):

```json
{ "v": 1, "member": "mbr_…", "at": "2026-09-29T21:04:12.345Z",
  "from": "2026-09-29T00:00Z", "to": "2026-12-28T00:00Z",
  "spans": [["2026-09-30T08:00Z", "2026-09-30T09:00Z"]] }
```

Times only — never a guest, a type, a title or a place. A snapshot of the
host's own busy times (confirmed bookings with their buffers, times
blocked, their Google/Outlook/Apple calendars) from the start of today
(UTC) to 90 days later, merged, on the minute; at most 300 spans (past
them, `to` stops where the first one left out starts: nothing unknown is
claimed free). It replaces whatever the receiver holds from Booking for
that member between `from` and `to`; `at` orders snapshots (delivery is
at least once, in no set order: keep one only if newer). Booking never
tells again what another tool told it.

`booking.confirmed` and `booking.cancelled` — for Clients (the CRM: a
booked prospect becomes a contact with the meeting on their timeline):

```json
{ "v": 1, "booking": "42", "status": "confirmed", "at": "2026-09-29T21:04:12.345Z",
  "host": "mbr_…", "start": "2026-10-06T08:00:00.000Z", "end": "2026-10-06T09:00:00.000Z",
  "type": { "id": "3", "name": { "en": "Project call", "fr": "Appel projet" } }, "kind": "video",
  "contact": { "name": "Sarah Klein", "email": "sarah@example.com", "phone": null, "company": null, "language": "en" },
  "source": "page", "moves": 0, "path": "/chest/bookings/42" }
```

`at` is when the booking was made, last moved (`bookings.moved_at`) or
cancelled — as recorded, never the time of telling: a retry of the same
key carries the same data, so the Chest takes it as the same event (it
refuses a key reused for other data, SDK studio.15). `booking.cancelled`
is the same with `"status": "cancelled"` and
`"cancelledBy": "guest" | "host"`; `host` is null once the host was
erased. `kind`: `place`, `phone`, `video` or `ask`; `source`: `page` (a
visitor), `host` (a host for them), `import`. `company` is null: the form
does not ask it (a host may ask it as one of their questions; answers are
not sent). Never the guest's note, their answers or their link. `path`
opens the booking for a member who may see it:
`chest.tools.link("booking", path)`.

What a receiver (Clients) does: declare `"receives": ["booking.confirmed",
"booking.cancelled"]`; on each, find or create the contact by
`contact.email` (lower-cased) and keep one meeting per `booking` id —
created on the first `confirmed`, its time replaced by a later
`confirmed` (more `moves`), marked cancelled by `cancelled`, which is
final (a cancelled booking never comes back; a `confirmed` arriving after
it is ignored). Idempotent: the same event may come twice. The contact is
personal data brought into the CRM by the link the admin made; erasing a
guest in Booking does not erase them in Clients (the CRM's own erasure
does).

**What Booking hears**

| Event | From | Does |
|---|---|---|
| `hiring.busy` | Hiring: the interviews a member is on (the `booking.busy` shape) | Those times are not offered (`busyOf`), and show on the host's agenda as "An interview in Hiring". Kept per tool and member, the latest snapshot only (`told_busy`, `told_spans`); forgotten when the member leaves or is erased |
| `leave.busy` | Leave: the days a member is off — approved leave, whole days in the Chest's time zone (the same shape; Leave's README, "With the other tools") | The same handler (`takeBusy`): no time is offered those days, and the host's agenda shows them as "Off" ("Absent") — never the kind of leave, which Leave never sends. A later snapshot ("now free": empty `spans`) gives the days back; Hiring's interviews, kept apart, stay |

## On a Chest

- `public: true` (no `csp` permission: no inline script nor style, the Chest's default policy holds); `capabilities`: `database`, `members`
  (names, roles), `notifications`; `receives: ["member.*"]`; `network`:
  the four calendar hosts (the owner approves "Can reach
  calendar.google.com", …). Nothing else leaves the tool. Proposals:
  `emits` (`booking.busy`, `booking.confirmed`, `booking.cancelled`) and
  `receives` (`hiring.busy`, `leave.busy`), README "With the other
  tools". The owner approves "Tells other tools when a host is busy
  (times only), when a booking is made, moved or cancelled (who, which
  type, when)", "Is told by Hiring when a member is in an interview" and
  "Is told by Leave when a host is off".
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

Built on SDK 0.4.1 + studio proposals (0.4.1-studio.2), a packed copy in
`vendor/`, tool contract 0.4 (`"chest": "0.4"`; `chest check` says OK).
The member's `language`, the Chest's `organization.name`, `timeZone`,
`language`, the tool's addresses (`chest.tool.publicUrl`,
`chest.tool.teamUrl`: the company's own domain once connected) and the
schedules (`chest.json` `schedules`, posted to `/chest-schedules`) are the
released 0.4.1; what follows is not in it yet.

- **`mail`** — **Proposal (studio)** (`chest.proposals.json`: `send`).
  Without it the tool works: the guest keeps their page's link (shown
  after booking), and Settings says guests get no email. The pages ask
  the Chest first (`mail.available()`, studio.16): the booking form's email
  field, *New booking* and Settings promise an email only when the Chest
  would send it now, and Settings says why not in the owner's terms (no
  mail on this Chest, email not connected, paused, the day's emails used).
  Every email's key carries its recipient, and each event's key the guest
  (studio.16): after a restore from a backup, a booking's id can name
  another guest's meeting.
- **Scheduled tasks** (0.4.1, `chest.json`): `reminders` (hourly),
  `cleanup` (nightly) and `calendars` (every 15 minutes); each run is
  handled once (`chest_events`, the same store as the events).
- **Photos on the public host**: the Chest's photo links work on the team
  host only; public pages show initials.
- **The Chest's addresses** (0.4.1, `chest.tool.publicUrl`,
  `chest.tool.teamUrl`): outside a Chest (they throw there) the public
  address is derived from the request, and the last one seen is
  remembered for emails sent by a schedule. The company's name (an administrator may
  name it otherwise for visitors) and the default time zone of new hosts
  are the Chest's (`chest.organization.name`, `chest.timeZone`, 0.3.0).
- **The visitor's address** — **Proposal (studio)**
  (`Chest-Visitor-Address`, which the front would set; never
  `X-Forwarded-For`, which the visitor writes). The public writes are
  bounded by the package (`@argentic/chest-app`'s `publicAction({ bound })`):
  a form token that serves once and lasts two hours, the field only robots
  fill, and budgets a day per visitor (the front's address, else a
  `chest_v` cookie of the browser's) and for everyone — bookings (10 / 1,000)
  and changes (20 / 1,000) apart — spent only once a request is valid
  (the type exists, the time is well-formed, the guest's link opens a
  booking still to come: junk spends no budget; refusals are counted
  apart, up to ten times a day's budget). Changes also have a budget per
  guest's link (20 a day, the package's `perSubject`), so one link cannot
  spend everyone's. Without the front's address, a robot that drops its
  cookie can still spend the day's budget for everyone (the package's
  AGENTS.md says so): the address is the fix.
- **`calendar`** — **Proposal (studio)** (`chest.proposals.json`:
  `"calendar": true`): each booking in its host's Chest calendar feed.
  Without it, the tool's own private feed (Settings) remains.
- **Schedule `calendars`** (every 15 minutes) reads the hosts' other
  calendars; without schedules, they are read when a visitor opens a
  booking page (10 minutes at most between reads) and on demand.
- **Declared network** (real contract, `network`): the calendars are read
  with plain `fetch`, which follows the Chest's proxy through
  `NODE_USE_ENV_PROXY=1` (Node ≥ 24.5 in the Chest's image; the tool's
  `engines` ask Node 24).
  Tests answer the declared hosts with `fakeChest({ network })` (SDK
  studio.15: a read, a 404, a redirect between declared hosts, a refused
  host). The local harness runs the tool in its own process and does not
  route its `fetch`, so a successful read is shown by the tests
  (`test/busy.test.ts`, `test/jobs.test.ts`), not by the flow.
- **Members' email choice** — **Proposal (studio.15)**: `mail.send`
  applies each member's choice (all, a daily digest, none). The guest's
  confirmation, a move and a cancellation are marked `transactional` (a
  guest who is a member of the Chest gets them whatever they chose); the
  reminder and the host's own notice honour the choice, beside the
  host's "Email me" setting.
- **Being shown in another website**: the Chest's front adds
  `frame-ancestors 'none'` to every public response (its default policy,
  and its floor even with `csp: "tool"`: contract, "Public host"), and two
  policies combine,
  so **the frame code cannot work on a Chest today**: the Chest needs a
  permission that lets an administrator allow the company's websites
  (see the SDK report). The button code works today.
- **Free/busy by OAuth** (Google, Microsoft): the secret iCal address is
  a first step; a connector held by the Chest would read free/busy in
  seconds without a secret address (SDK report).
- **Events between tools** — **Proposal (studio)** (`emits`,
  `receives`): without them, Hiring does not see the hosts' busy times,
  Clients hears of no booking, and Booking does not see Hiring's
  interviews nor Leave's days off; bookings work the same.

## Develop

Hono and React rendered on the server, a few islands in the browser, built
by Vite — the studio's starter, its machinery the package
`@argentic/chest-app` (`vendor/`). `AGENTS.md` says where things are.

```sh
npm ci
npm run dev       # rebuilds on every change and restarts the server
npm run build     # tsc, then the browser's files and the server (dist/)
npm test          # tsc, the server built into dist/test, then test/*.test.*:
                  # PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm start         # the built server, as the Chest runs it
```

In the studio: `node lab/chest-dev/dev.mjs tools/public-and-private/booking --reset --prod --port 5100`
(the `/_dev` page shows the outbox, the bell, and runs the schedules),
`node lab/chest-dev/flows/booking.mjs 5100`,
`node lab/chest-dev/screens.mjs tools/public-and-private/booking --port 5100`.

## Measured

`lab/measure/` (6 October 2026, Node 24.21, the studio's 4-CPU container;
12 pages of `lab/measure/pages/booking.json`, then 30 s at rest, median of
5; results in `lab/measure/results/after-hono/booking.json`), Next.js 16
before → this stack: memory at rest (PSS of the tree, `npm` included)
140 → 79 MiB, the server alone 119 → 58 MiB PSS (176 → 117 MiB RSS);
first page after a cold start 679 → 369 ms; image 461 → 31 MiB; the build
fits the Chest's 512 MiB / 1 CPU container (it did not: OOM), peak
255 MiB PSS, 1.4 s.

## What it does not do (yet)

- **Calendar reading is not instant**: up to about 15 minutes between a
  change in Google/Outlook/Apple and Booking seeing it (plus the provider's
  own publishing delay). It reads secret iCal addresses only: no OAuth,
  no CalDAV account, no calendar shared with the host by someone else
  unless it has its own address. Declined invitations still read as busy
  (an iCal feed does not say who "you" are).
- **Other tools' busy times**: Hiring's interviews and Leave's days off
  only. Rooms' meetings are not told to Booking yet. A half day off
  (Leave sends noon to midnight, or midnight to noon) blocks that half
  only; a host still marks a day off in Hours by hand when they do not
  use Leave.
- **Clients** (the CRM) receives `booking.confirmed` only once its own
  receiver is built (its tool, not this one): the contract is above.
  Bookings imported from Calendly are not told to Clients (they are
  history); their changes are.
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
- On a studio harness (no outbound network), a correct `webcal://` or
  `https://` address is accepted as an address and then refused by the
  studio's proxy ("This calendar refused us"): on a Chest it is read.
- Cities are named in French and English for the zones where the two
  differ (and Montréal beside Toronto); the other zones keep the IANA
  city name.
