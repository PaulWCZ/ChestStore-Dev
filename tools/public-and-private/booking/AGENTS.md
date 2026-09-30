# Adapting Booking — a guide for AI agents

`README.md` says what Booking does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (roles `admin`, `host`; public part) and the proposals it uses (`mail`, `schedules`, `calendar`, `emits`, `receives`) |
| `vendor/` | SDK 0.3.0 + studio proposals (0.3.1-studio.1) and the UI kit, packed copies |
| `lib/session.ts` | Who asks (`member()`), the language of `/chest` (the member's `language`) and of a public page (the visitor's, else the Chest's `chest.language`, else English; a host's page then keeps to the host's languages) |
| `lib/access.ts` | Who may do what |
| `lib/model.ts` | Bounds, slugs, email and phone checks, colours, kinds — pure |
| `lib/zone.ts` | Wall-clock time in a time zone and back (DST gaps and overlaps) — pure, tested |
| `lib/slots.ts` | Free times from hours, overrides, bookings and rules (buffers, notice, window, daily limit) — pure, tested |
| `lib/texts.ts` | A host's texts in two languages: the page's language (`pageLanguage`), the type's second-language texts (`cleanTypeTexts`, `localizeType`) — pure, browser-safe, tested |
| `lib/questions.ts` | The host's own questions and the guest's answers: bounds, checks, reading — pure, browser-safe, tested |
| `lib/booking.ts` | The service: hosts, hours, types, free times, booking, moving, cancelling, feed, guard, cleanup, erasure |
| `lib/ics.ts` | Calendar files (RFC 5545) |
| `lib/ical.ts`, `lib/windows-zones.ts` | Reading a calendar for its busy times only (RRULE, EXDATE, RECURRENCE-ID, whole days, TZID, VTIMEZONE) — pure, tested |
| `lib/calendars.ts` | The hosts' other calendars: allowed hosts (= `chest.json` `network`), fetching with limits, keeping busy spans, schedule and lazy refresh |
| `lib/publish.ts` | Each booking in the host's Chest calendar (Proposal `calendar`) |
| `lib/share.ts`, `lib/busy-snapshot.ts` | Events between tools (README "With the other tools"): `booking.busy` (a host's own busy times, only when changed: `shared_busy`), `booking.confirmed` / `booking.cancelled` for Clients (`changed`), `hiring.busy` and `leave.busy` heard (`takeBusy` → `told_busy`, `told_spans`; `tool:leave` reads "Off" on the agenda, never the kind of leave); the snapshot's shape, pure and the same file in Hiring |
| `lib/import.ts` | Calendly's scheduled-events CSV |
| `lib/embed.ts` | The public pages' `frame-ancestors` from the websites an administrator allowed |
| `lib/zones.ts`, `components/zone-select.tsx` | The time-zone list (cities in the reader's language from the catalogue's `zones.cities`, offsets, regions), written on the server |
| `lib/mailer.ts`, `lib/guests.ts` | Emails to guests through the Chest's mail, falling back to the page |
| `lib/tell.ts` | The host's bell |
| `lib/lifecycle.ts` | Members leaving or erased |
| `lib/form-token.ts`, `lib/public-origin.ts` | The form's signed "shown at" time; the public host's address; the visitor's key |
| `app/page.tsx`, `app/[host]/…`, `app/b/[secret]/…`, `app/api/slots`, `app/feed/[token]`, `app/public-actions.ts`, `components/picker.tsx` | The public part (anonymous) |
| `app/chest/…`, `app/chest/actions.ts` | The team's part (`first-run.tsx`: a new host's first screen; `agenda-tools.tsx`: blocking from the agenda's free stretches, unblocking with Undo; `new/`: a host books for a guest; `api/slots`: the free times a host sees; `hours/other-calendars.tsx`, `hours/exceptions.tsx` inside `components/fold.tsx`) |
| `app/chest-jobs/[name]/route.ts`, `app/chest-events/route.ts` | Deliveries from the Chest (signed) |
| `lib/theme.ts`, `lib/look.ts`, `app/tokens.css`, `app/globals.css` | The identity as a kit theme and the looks of the team's and the public surfaces (`teamLook`, `publicLook`; `currentLook` picks by the member assertion); the tool's own tokens (aliases of contract tokens); styles (contract tokens only) |
| `components/shell.tsx`, `components/link.tsx`, `components/public-shell.tsx`, `lib/i18n/kit.ts` | The kit's AppShell, BrandMark and LanguageSwitch wired to Next.js; Next's `Link` re-exported for server pages; the kit's date words from the catalogue |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **The UI kit first** (`@argentic/chest-ui/components`, vendored in
  `vendor/`): `AppShell`, `PageHeader`, `NoAccess`, `Tabs`, `EmptyState`,
  `Avatar`, `StatusBadge`, `Toasts`/`useToast`, `Confirm`, `DateField`,
  `TimeSelect` (+ `moveStart`/`moveEnd`), `FilePicker`, `BrandMark`,
  `LanguageSwitch`, `Segmented` (link variant: "Mine / Everyone", the
  choice in the address), `Switch` (a type on or off, the email-me
  setting: what takes effect at once; a box in a form that waits for Save
  stays a checkbox). Their words come from the catalogues (`toast`,
  `date`, `files` sections). A server page gives the kit Next's `Link`
  through `components/link.tsx` (a `"use client"` re-export); a client
  component passes `Link` as it is — no wrapper, no cast. Titles are
  `PageHeader size="m"`, a company logo is sized with `--ck-logo-max`.
  Kept on purpose: the public month grid and time buttons
  (`components/picker.tsx`: a calendar of free days, not a date field),
  the time-zone select (a form field, grouped by region), the copy button.
- **Never a colour in CSS or TSX**: contract tokens only, the tool's
  tokens aliased to them (`test/theme.test.ts`). Text only on measured
  pairs (`--ok-ink` on `--ok-soft`, `--accent-text` on `--accent-soft`…).
- **Never `window.confirm`**: irreversible acts (delete a type, erase a
  guest) use the kit's `Confirm`; an email already sent is a `sent: true`
  toast (no Undo).
- **Never `<input type="date">` / `type="time"`**: `DateField` (with `today`
  from the server) and `TimeSelect`.

- **No double booking**: the exclusion constraint `no_double_booking` is
  the guarantee; the slot check before it is for a kind answer. Any new
  way to make or move a booking must write `blocked` (buffers included)
  and turn the database's refusal (`23P01`) into `taken`.
- **Busy time** comes from five places — confirmed bookings (the
  constraint), `blocks`, `busy` (other calendars), `told_spans` (another
  tool: Hiring's interviews) and the day's limits — all read by `busyOf`;
  a new source goes there, never into the page. The agenda's grey rows
  (`busyElsewhere`) show `busy` and `told_spans` within the hours.
- **Events between tools**: every new way to make, move or cancel a
  booking, block a time or read a calendar calls `share.changed` or
  `share.shareBusy` after it. `booking.busy` carries times only and only
  the host's own (`ownBusy`): never what another tool told Booking (no
  echo). `booking.confirmed` never carries the note, the answers or the
  guest's link. An event's data depends only on what is recorded (`at`
  is `created_at`, `moved_at` or `cancelled_at`, never the time of
  telling): the same key told again must carry the same data, or the
  Chest refuses it (`key_conflict`). Change a payload only with a new `v`.
- **One type, one name on the team's screens**: show a booking's type
  with `typeNames` / `titlesOf` (the reader's language); `booking.title`
  is what the guest read, for their emails only.
- **Other calendars**: never store a title or anything but spans; never
  fetch a host outside `calendarHosts` (a test keeps it equal to
  `chest.json` `network`); never show a calendar's address again. Read
  them with plain `fetch` (no injected fetcher): tests answer the hosts
  with `fakeChest({ network })`.
- **Email keys are whole** (studio.15: never cut; the SDK hashes a long
  one) and name the recipient when it can change; the same key for other
  recipients is a `key_conflict`. Only the guest's confirmation, move and
  cancellation are `transactional`.
- **Every change to a booking tells the Chest's calendar** (`publish` /
  `unpublish`) and, when the host wants it, emails them (`tell.hostCopy`).
- **The daily limit** has no constraint of its own: it holds because
  `book` and `moveByGuest` lock the type's row (`lockType`, `for update`)
  and check the time again inside that transaction; the host's daily
  maximum across types holds the same way (`lockHost`). Any new way to make or
  move a booking must do the same (test/limits.test.ts races them).
- **Nobody is public by opening the tool**: `hosts.ready` is false until
  a calendar connects (`calendars.connect`) or the hours are confirmed
  (`confirmHours`, `saveWeekly`). Every public lookup (`publicHost`,
  `publicType`, `listedHosts`, a team's hosts in `hostsOf`, `bySecret`'s
  links) filters on it; a new public path must too.
- **One language per public page**: a host page's words and texts come
  from `hostWords(host)` and `localizeType`/`localizeWelcome`; `book()`
  stores the title and answers in the language the guest read
  (`pageLanguage`). Never render a host's text without localizing it.
- **Video rooms have no silent default**: `videoRooms` needs an address
  (`rooms_address`); meet.jit.si asks the host to sign in (say so where a
  link is shown: `isPublicJitsi`).
- **Answers are checked on the server** against the type's questions as
  they are at booking time (`cleanAnswers`); never trust the form's fields.
- **Times are instants** (`timestamptz`, ISO strings); hours are minutes
  of the host's wall clock in `hosts.zone`. Convert only with
  `lib/zone.ts`; never with the server's local time.
- **The guest's secret** opens one booking: it is looked up by its
  SHA-256, kept for their later emails, never shown on the team's pages,
  never logged.
- **Guests are data subjects**: anything new stored about them must be
  deleted by `eraseGuest` and `cleanup`.
- **Email is optional**: every path must work when `mail.send` throws.
- **Dates in client components**: format them on the server (Node's and
  the browser's Intl can differ and break hydration).
- Identity from `member()` only; rights in `lib/access.ts`; words in every
  catalogue; client components never import the SDK or `lib/db.ts`.
