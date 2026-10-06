# Adapting Booking — a guide for AI agents

`README.md` says what Booking does; this page says where things are and
what must not break.

## Map

The stack is the studio's starter: Hono, React rendered on the server, a
few islands in the browser, Vite; the machinery is the package
`@argentic/chest-app` (`vendor/`; its own `AGENTS.md` in
`node_modules/@argentic/chest-app/` is the reference: pages, actions,
islands, refresh, fields, words, tests).

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest, contract 0.4 (roles `admin`, `host`; public part; `network`: the calendar hosts; `schedules`: `reminders`, `cleanup`, `calendars`) and the proposals it uses (`mail`, `calendar`, `emits`, `receives`, `translations`) |
| `vendor/` | SDK 0.4.1 + studio proposals (0.4.1-studio.2), the UI kit, `@argentic/chest-app`: packed copies, never edited |
| `src/app.tsx` | **Every route**: `createApp({…})` (actions, islands, words, layouts, the look), the pages, `/api/slots`, `/chest/api/slots`, `/chest/export`, `/b/<secret>/ics`, `/feed/<token>.ics`, `/chest-events`, `/chest-schedules`; `framed`: the public pages' `frame-ancestors` from Settings |
| `src/actions.ts` | **Every mutation**, by name: the team's (`action`) and the public part's (`publicAction`: `bookTime`, `cancelMine`, `moveMine`) |
| `src/pages/` | Pages rendered on the server: `Agenda`, `Booking`, `NewBooking`, `Types`, `TypeEdit`, `Hours`, `Settings`; public: `CompanyPage`, `HostPage`, `TypePage`, `GuestBooking`, their frame `PublicShell` |
| `src/islands/` | What runs in the browser (`index.ts` lists them): `AgendaTools` (block a time from the agenda's buttons, `data-block`/`data-unblock`, one island for the whole list), `FreeToggle`, `FirstRun`, `TypeForm`, `TypeSwitch`, `WeekEditor`, `Exceptions`, `OtherCalendars`, the settings' forms, `CancelMeeting`, `MoveMeeting`, `PaidSwitch`, `ForGuest`; public: `BookTime`, `MoveMine`, `CancelMine` |
| `src/components/` | Shared by pages and islands, browser-safe: icons, mark, `picker.tsx` (the month grid and times, the guest's form), `zone-select.tsx`, `copy-button.tsx` (also an island), `fold.tsx` |
| `src/shared/` | Pure modules the browser needs too: `zone.ts` (wall clock ↔ instant), `zones.ts` (the zone list), `kinds.ts` (colours and their classes, kinds, durations, questions' shapes and bounds, hours ranges, slugify). `src/lib/` re-exports them |
| `src/lib/` | Rules and SQL (below); never imported by an island |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`; `index.ts` (languages, `formatter`), `format.ts` (dates and plurals, each Intl object made once; browser-safe) |
| `src/layout.tsx` | The members' shell (sections, the company's logo in brand mode, toasts), the public layout (pages draw their own frame) |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity (a kit theme) and the look of each surface as a stylesheet (`sheetOf`); the tool's tokens (aliases of contract tokens); its styles (contract tokens only, classes only) |
| `src/lib/session.ts` | A host page's language (`hostWords`: the visitor's when the host wrote it, else the host's) |
| `src/lib/access.ts` | Who may do what |
| `src/lib/model.ts` | Bounds, slugs, email and phone checks — pure |
| `src/lib/slots.ts` | Free times from hours, overrides, bookings and rules (buffers, notice, window, daily limit) — pure, tested |
| `src/lib/texts.ts` | A host's texts in two languages — pure, tested |
| `src/lib/questions.ts` | The host's own questions and the guest's answers: checks, reading — pure, tested |
| `src/lib/booking.ts` | The service: hosts, hours, types, free times, booking, moving, cancelling, feed, the public form's counters (`guard`), cleanup, erasure |
| `src/lib/ics.ts`, `src/lib/ical.ts`, `src/lib/windows-zones.ts` | Calendar files written (RFC 5545); calendars read for busy times only |
| `src/lib/calendars.ts` | The hosts' other calendars: allowed hosts (= `chest.json` `network`), fetching with limits, schedule and lazy refresh |
| `src/lib/publish.ts` | Each booking in the host's Chest calendar (Proposal `calendar`) |
| `src/lib/share.ts`, `src/lib/busy-snapshot.ts` | Events between tools (README "With the other tools") |
| `src/lib/import.ts` | Calendly's scheduled-events CSV |
| `src/lib/embed.ts` | The websites allowed to frame the public pages |
| `src/lib/mailer.ts`, `src/lib/guests.ts`, `src/lib/tell.ts`, `src/lib/notify.ts` | Emails to guests through the Chest's mail (falling back to the page); the host's bell |
| `src/lib/lifecycle.ts` | Members leaving or erased; `seen` (events and schedule runs handled once, `chest_events`) |
| `src/lib/public-origin.ts` | The Chest's addresses (`chest.tool.*`); the public form's guard is the package's (`bound`, budgets in `formLimits` of `src/lib/booking.ts`) |
| `src/lib/db.ts` | The tool's database pool (`provide()` lets the unit tests hand it their connection) |
| `test/` | `app.test.mjs` (the built server: routes, policy, look, actions, public pages, framing, files, events, schedules), `stack.test.ts` (the package's `checkSources`, `checkWords`), the services' tests; `support/db.ts` (PGlite with `btree_gist`, or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm run build && npm test   # all three must pass (and TEST_DATABASE_URL=… npm test)
```

## Rules

- **The UI kit first** (`@argentic/chest-ui/components`, vendored in
  `vendor/`): `AppShell`, `PageHeader`, `NoAccess`, `Tabs`, `EmptyState`,
  `Avatar`, `StatusBadge`, `Confirm`, `DateField`,
  `TimeSelect` (+ `moveStart`/`moveEnd`), `FilePicker`, `BrandMark`,
  `LanguageSwitch`, `Segmented` (link variant: "Mine / Everyone", the
  choice in the address), `Switch` (a type on or off, the email-me
  setting: what takes effect at once; a box in a form that waits for Save
  stays a checkbox). Their words come from the catalogues' `kit` section.
  Links are plain `<a>`; an island moves with `navigate()` and says
  things with `toast()` (`@argentic/chest-app/client`: each island is a
  React root of its own, the kit's `useToast()` sees no toasts there). Titles are
  `PageHeader size="m"`, a company logo is sized with `--ck-logo-max`.
  Kept on purpose: the public month grid and time buttons
  (`src/components/picker.tsx`: a calendar of free days, not a date field),
  the time-zone select (a form field, grouped by region), the copy button.
- **Never a colour in CSS or TSX, never a style attribute**: contract
  tokens only, the tool's tokens aliased to them (`test/theme.test.ts`,
  `checkSources`); what varies with the data is a class (a type's colour:
  `typeClass`/`swatchClass` of `src/shared/kinds.ts`). Text only on measured
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
  `src/shared/zone.ts`; never with the server's local time.
- **The guest's secret** opens one booking: it is looked up by its
  SHA-256, kept for their later emails, never shown on the team's pages,
  never logged.
- **Guests are data subjects**: anything new stored about them must be
  deleted by `eraseGuest` and `cleanup`.
- **Email is optional**: every path must work when `mail.send` throws.
- **Dates in islands**: written on the server (the page's props carry
  them as text), or with `src/i18n/format.ts` (one Intl object per
  language, zone and style — never one per row).
- **The public part's writes are bounded by the package, and only valid
  ones count**: every `publicAction` has `bound` (budgets `new`/`change`
  of `formLimits.perKind`), its form carries `<Honeypot />` (the token;
  `call()` sends it from the page), and its run refuses what could never
  write anything (the type found, a well-formed time, `changeAllowed` for
  a guest's link) **before** `await charge(kind)` — a change with `{
  subject: secret }`, so one link has its own budget (`perSubject`). A new public
  action does the same.
- **Calendar UIDs** are `Booking.uid` (`calendarUid`): never build one by
  hand; bookings made before migration 0007 keep `booking-<id>@chest`.
- Identity from `member()` only (the package's `page()`/`action()`);
  rights in `src/lib/access.ts`; words in every catalogue; islands and
  `src/components/` import only `src/shared/`, `src/i18n/format.ts`, the
  kit and `@argentic/chest-app/client` (`test/stack.test.ts`).
