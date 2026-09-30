# The SDK report — what building the store taught us

_Rewritten on 2026-09-30 for the official **Chest SDK 0.3.0**
(`@argentic/chest-sdk`, clone at `chest-by-argentic/chest-sdk`, commit
`cc499b2`). Every claim about 0.3.0 below comes from that repository —
`README.md`, `AGENTS.md` and `client/src/*.ts`, cited by section or file.
Every claim about a tool comes from its code (`tools/private/*/`,
`tools/public-and-private/*/`, `lib/`, `app/`, `chest.proposals.json`),
read on 2026-09-30. The studio's proposals live in the SDK working copy
`sdk/`: at the time of writing it is `0.3.0-studio.16`, and it is being
rebased onto the official 0.3.0 as **`0.3.1-studio.1`** (§5 says what that
rebase adopts). The 18 tools still vendor `0.3.0-studio.16`
(`vendor/argentic-chest-sdk-0.3.0-studio.16.tgz` in each `package.json`)._

How to read it: §2 is what 0.3.0 gives and which of our earlier asks it
answered; §4 is what the 18 tools still need beyond it, one section per
gap, with the studio's built proposal; §5 is where the official shape
differs from ours and what we adopt; §9 is the priority table. Section
numbers of the earlier drafts (§4.1–§4.30) are mapped in the appendix.

## 1. Summary — the changes that would matter most

0.3.0 answered the first ask of every earlier draft: **the member's
language and time zone, and the Chest's own organization, zone, language
and day** — all 18 tools had built on studio stand-ins for these. It also
makes the database's `current_date` the company's day and brings **AI
through the Chest**. What remains, in the order that matters for the
"cancel your subscriptions" pitch:

1. **`schedules`** — all 18 tools declare at least one (reminders,
   digests, purges, the calendar and mail retries). Without it, nothing
   happens unless someone opens a page. 0.3.0's own README already names
   "a scheduled job" as a place `chest` works (`README.md`, "`chest`").
2. **`mail`, send and receive** — 17 of 18 tools send (all but Clients);
   Support and Hiring receive (`support@`, `jobs@`). It is the difference
   between "a contact form" and a helpdesk, and the only way to reach a
   customer, a candidate or a guest.
3. **Events between tools** — 14 of 18 tools publish or receive another
   tool's events (12 publish, 11 receive). 0.3.0's `events` carries the
   members' lifecycle only.
4. **The calendar bridge** — one secret feed per member for every tool's
   events; 8 tools write to it. A private tool cannot serve a feed at all.
5. **The public host's kit** — public uploads with a one-time claim
   (Forms, Support, Hiring), `visitors` (6 public tools), the tool's own
   addresses (17 tools write links in emails), custom domains (Chest only).
6. **Accept tomorrow's manifest keys** and **translate the tile**: every
   tool keeps its proposals in `chest.proposals.json`, and the portal still
   shows English names to French members.

## 2. Baseline — what 0.3.0 gives

0.3.0 is nine published modules plus the shared `api`
(`README.md`, "Develop"): `member`, `chest`, `members`, `notifications`,
`events`, `ai`, `database`, `files`, `errors`, and `testing` for tests. It
stays dependency-free (`node:*` only) and reaches only the Chest's API on
`127.0.0.1` (`AGENTS.md`, "Contributing"). Compared with the 0.2.x client
the studio started from (`reference/testweb/packages/chest-client/src/`),
`files`, `notifications`, `events` and `database` are unchanged
byte for byte; `members` gained two fields; `chest` and `ai` are new;
`errors` gained the AI errors.

### Module by module

- **`member(request)`** (`README.md`, "`member(request)` — server tool
  (contract v2)"; `client/src/member.ts`). The signed `Chest-Member`
  assertion, label `Chest-Member v2`. `Member` now carries **`language`**
  (a BCP 47 primary tag the Chest speaks to that member: their own, else
  the Chest's default) and **`timeZone`** (their profile's zone, else their
  browser's, else the Chest's). Both are required claims (`language`,
  `time_zone`): an assertion without them is refused. `/chest` speaks
  `member.language` and offers no language switch of its own; public pages
  keep theirs. `groups` stays "the groups that give the member this tool",
  at most 16.
- **`chest`** (`README.md`, "`chest` — the Chest the tool runs in";
  `client/src/chest.ts`). An object, the same for every member:
  `chest.organization.name`, `chest.timeZone`, `chest.language`,
  `chest.today(at?)` (`YYYY-MM-DD` in the Chest's zone). Read from
  `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE` at each access;
  the Chest restarts tools when the owner changes one. No capability.
  Outside a Chest, reading throws `ChestError` `not_in_chest` — "a wrong
  zone read silently is exactly what this module exists to prevent".
- **Database time zone** (`README.md`, "`chest`": "The Chest also makes it
  the `TimeZone` of the tool's database sessions"). `current_date`,
  `now()::date` and a `timestamptz` shown as text are in the Chest's zone.
  The rule "store in UTC, decide in the Chest's zone, show in the
  member's" is written as a table (`README.md`, "Times: store in UTC…";
  `AGENTS.md`, "Rules").
- **`members`** (`README.md`, "`members` — who has the tool"). `list`
  (by name, `q`, `role`, `group`, 500 a page), `get`, `lookup` (200 at a
  time, cached a minute, `former` and `erased`), `groups.list()` (the
  groups that give the tool), `forget()`. `Member` answers carry
  `language` and `timeZone`, so "write to each member in their language,
  at their hour" works outside their request (`AGENTS.md`, "Write to each
  member in their language").
- **`notifications`** (`README.md`, "`notifications` — badges and inbox
  items"). Unchanged: `notify` (keyed, 1–500 recipients), `withdraw`,
  `badge.set`/`setMany`, quotas 1,000 recipients an hour, 100 items per
  member a day, 600 badge writes a minute. "Inside the Chest only — no
  email, no push to a phone."
- **`events`** (`README.md`, "`events` — the members' lifecycle"). Four
  types: `member.updated`, `access.revoked`, `member.removed`,
  `member.erased {id, erasure, deadline}` with
  `acknowledgeErasure(erasure)` (30 days; the owner sees "Erased on …" or
  "Overdue"). At least once, unordered, retried for 72 hours; `handle`
  ignores (204) a type of a later Chest.
- **`ai`** (`README.md`, "`ai` — AI models through the Chest";
  `client/src/ai.ts`). `chat` (OpenAI Chat Completions shape in camelCase,
  streamed or not, tools, images in content parts), `embed`, `models`,
  `usage`. Four aliases (`default`, `fast`, `smart`, `embedding`) mapped by
  the Chest on the owner's OpenRouter connection; the tool holds no key.
  Manifest `"ai": {"monthly", "models", "purpose"}`; the Chest reserves
  the worst case against the monthly cap before each call. Errors
  `AiCapReached`, `AiUnavailable`, `AiModelNotAllowed`, `AiRefused`.
- **`files`** (`README.md`, "`files` — files of a server tool"). As in
  0.2: `put`/`get`/`stat`/`list`/`move`/`delete`, `url` (15-minute
  signed link, `thumbnail: 256 | 1024`, `download`), `uploadUrl` (browser
  → Chest, a folder name lets the Chest name the object), limits 1 GiB /
  32 MiB unless `"files": {"quota", "maxObject"}`. Private only.
- **`database`**: `databaseUrl()`, migrations run by the Chest, 10
  connections, 30 s per query (`README.md`, "`databaseUrl()`").
- **`testing`** (`README.md`, "`testing` — a tool's own tests"):
  `fakeChest({members, former, groups, capabilities, receives, files, ai,
  chest})`, `emit`, `acknowledged`, `withMember`, `signAssertion`;
  `chest: {organization, timeZone, language}` for the new module.

### What 0.3.0 now covers of this report's earlier asks

| Earlier ask (old §) | Tools that needed it | 0.3.0 | How |
|---|---|---|---|
| The member's language — `member.locale` (§3 `member`, §8 row 1) | all 18 | **Fully** | `member.language`, and in `members.*` (`README.md`, "`member(request)`") |
| The Chest's default language — `chest.locale()` (§4.5) | Expenses, People, Forms, Support, Hiring, Quotes, Status (`chest.locale()` in `lib/`) | **Fully** | `chest.language` |
| The company's name — `chest.company()` (§4.5) | People, Booking, Forms, Support, Hiring, Polls, Status, Equipment, Quotes | **Fully** | `chest.organization.name` (plain text, 2–80 characters) |
| The company's time zone and day — `chest.timeZone()`, `chest.today()` (§4.5) | 17 of 18 (every tool but Wiki calls one) | **Fully** | `chest.timeZone`, `chest.today(at?)` |
| The database's `current_date` in UTC (§3 "Time", second round) | every tool that compares with `current_date` | **Fully** | the Chest sets the session `TimeZone` |
| The member's own zone — `member.timeZone`, `chest.timeZone(member)` (§4.30) | Leave, People (`lib/zone.ts`) | **Fully** | `member.timeZone`, always present, the Chest does the fallback |
| An event when a member's language changes (§3 `events`) | tools that cache words | **No** | `MemberChange` is `name`, `photo`, `role`, `groups`, `email` (`client/src/events.ts`) |
| Erasure with a deadline and an acknowledgment | all 18 (`app/chest-events/route.ts` in each) | Already in 0.2; kept | `member.erased`, `acknowledgeErasure` |
| OCR / AI on a stored file (§4.16) | Expenses (receipts) | **Partly** | `ai.chat` takes images in content parts; the tool must read the file and send the bytes (10 MiB a request). No tool uses `ai` yet |

### Now official — dropped from the gap list

- `member.locale`, `localeOf`, the `locale` claim → `member.language`.
- `chest.company()`, `chest.locale()`, `chest.timeZone()`, `chest.today()`
  → the `chest` object.
- `member.timeZone` from the `zoneinfo` claim, `chest.timeZone(member)`
  (§4.30) → `member.timeZone` (claim `time_zone`).
- "Set the database session's `TimeZone`" (second-round friction).
- AI through the Chest (the "AI" placeholder of earlier drafts; the AI
  gateway spec `reference/product/specs/ai-gateway.md`) — built by the
  Chest's team, not the studio.

## 3. What works well — keep it

- **`member(request)` and the signed assertion.** One function, no
  session, no user table; roles given by the admin. Every tool's access
  rules are a few lines (`lib/access.ts`). 0.3.0 adds the two fields every
  page needed without changing the pattern.
- **Member ids everywhere, names at render (`members.lookup`).** Renames,
  departures and erasures cost nothing; "(former member)" and "Former
  member" (erased) come free.
- **The `chest` object that throws outside a Chest.** The studio's
  version returned safe defaults (Europe/Paris, "en"); 0.3.0's refusal is
  better — a wrong zone read silently was exactly the bug four tools had.
- **Times written as a rule** (`README.md`, "Times: store in UTC, decide
  in the Chest's zone, show in the member's"): the page every builder of
  ours had to learn by a midnight bug.
- **Browser → Chest uploads and short signed links.** The tool never
  carries the bytes; authorise, `PUT`, `stat`, record.
- **Notifications keyed by the thing they are about** (`key`,
  `withdraw`); badges as true counts.
- **Lifecycle events with erasure acknowledgment and a deadline.** GDPR
  erasure as part of the platform is a selling point no SaaS gives a small
  company.
- **AI that degrades.** Aliases instead of models, the cap reserved before
  the call, and `AGENTS.md`'s first rule "Always degrade gracefully" — the
  same stance our tools took for every missing capability.
- **`testing`**: `fakeChest`, `withMember`, `emit`, and now a
  deterministic fake AI with `cap: 0` and `unavailable` to test both paths.
- **Errors that are types**: every tool degrades the same way.

## 4. What the 18 tools still need beyond 0.3.0

One section per gap. For each: the tools that need it and the features
that depend on it (from their code), what the studio built in `sdk/`
(`0.3.0-studio.16`; details, tests and fakes in `sdk/README.md` under
**Proposal (studio)**), and the design notes and limits recorded when it
was built. Counts come from `chest.proposals.json` and `@argentic/chest-sdk/…`
imports in each tool's `lib/` and `app/` (2026-09-30).

### 4.1 Scheduled tasks — `schedules`

- **Needed by all 18.** Every tool declares schedules in
  `chest.proposals.json` and routes them in `app/chest-jobs/`. Features
  that stop without it: Tasks' weekday digest and 15-minute mail retry
  (`morning`, `mail`); Leave's reminders to approvers (`morning`); News'
  scheduled posts and weekly digest (`publish */15`, `digest`); Booking's
  reminders, cleanup and calendar refresh (`reminders`, `cleanup`,
  `calendars */15`); Hiring's retention purge and outbox (`cleanup`,
  `outbox`); Status's automatic updates (`updates */15`); Quotes' daily
  badges, follow-ups and monthly archive; Expenses' monthly reminder and
  cleanup; Equipment's Intune sync and weekly report; Goals' check-in
  reminder; Timesheets' Friday reminder; Wiki's review reminders; Polls'
  closing pass; Forms' bell and cleanup; Support's late events and cleanup;
  Clients', People's and Rooms' morning or quarter-hour passes.
- **Working copy**: `sdk/client/src/schedules.ts` — `schedules.handle(request,
  {name: run => …})` on `POST /chest-jobs/<name>`, signed `Chest-Job`
  (HS256 under HMAC("Chest-Job v1") of `CHEST_TOKEN`); `Run {id, name,
  scheduledAt, attempt, timeZone}`; `parseCron`, `nextRun`, `describeCron`,
  `checkSchedules`; `fakeChest({schedules})`, `chest.run()`;
  `sdk/client/test/schedules.test.ts`.
- **Manifest**: `"schedules": [{"name": "morning", "cron": "30 7 * * 1-5"}]`,
  run in the Chest's zone (`chest.timeZone` in 0.3.0).
- **Approval sentence**: "Runs by itself on a schedule: morning (weekdays
  at 07:30)".
- **Limits**: 8 schedules, ≥ 15 minutes apart, 5 minutes a run, one in
  flight per schedule, at least once (retries after 1, 5, 15 min), a
  missed time run once after downtime. The Chest journals each run;
  builders get "Run now"; agents reach `/api/v1/tools/<tool>/schedules`.
- **Design notes**: the platform calls the tool (the Vercel Cron and
  Cloudflare Cron Triggers shape) rather than SQL in the database
  (pg_cron): the tool's own code runs, with its SDK, and nothing runs in the
  container between requests. Better than them: the owner approves the
  schedule in words and sees each run.
- **Still missing**: a schedule per member's zone ("08:00 wherever each
  one is") — now that 0.3.0 gives `member.timeZone`, a tool can run hourly
  and pick the members whose 08:00 it is, which is what Leave would do;
  `scheduledAt` accepted by the harness's manual run.

### 4.2 Mail — send, receive, availability and the person's preference

- **Needed by 17 of 18** to send (every tool but Clients imports
  `@argentic/chest-sdk/mail`): Support replies and Hiring's candidate
  messages, Booking's confirmations with `.ics`, Quotes sending invoices,
  Status's subscriber updates, Forms' confirmations and alerts, People's
  first-day email to a newcomer (`lib/welcome.ts`), and reminders by email
  for members who never open the Chest (Tasks, Leave, Goals, Expenses,
  Timesheets, News, Wiki, Polls, Rooms, Equipment). **Receiving**: Support
  (`mailboxes: ["support"]`, `app/chest-mail/route.ts` turns an email into
  a ticket or a reply) and Hiring (`["jobs"]`, applications by email).
  13 tools ask `mail.available()` before offering an email; 14 pass
  `transactional` or read `mailPreference`. 0.3.0 has no mail, though
  `AGENTS.md` already says "a notification or an email to another member
  is in `members.get(id).language`".
- **Working copy**: `sdk/client/src/mail.ts` —
  `mail.send({to, cc, subject, text, html, mailbox, thread, fromName,
  replyTo, inReplyTo, references, attachments, key, transactional})`
  (a member is a recipient by id, `{member}`: no `members.email` needed),
  `status(id)`, `mailboxAddress(name)`, `available() → {ok, reason,
  remainingToday}`, `handle(request, {message, bounce}, {seen})` on
  `POST /chest-mail` (signed `Chest-Mail`), `threadAddress`, `threadOf`;
  `fakeChest({mail, delivery})`, `chest.outbox`, `chest.receive()`,
  `chest.bounce()`, `chest.held`; `sdk/client/test/mail.test.ts`.
- **Manifest and approval**: `"mail": {"send": true, "mailboxes":
  ["support"]}` — "Sends emails in your company's name, up to 500 a day";
  "Receives the emails sent to support@<your domain>".
- **Design notes recorded when it was built**:
  - *Threads that cannot be forged*: `send({mailbox, thread})` sets
    Reply-To `support+t1042-<tag>@…`, the tag 50 bits of HMAC under a key
    derived from `CHEST_TOKEN`; `support+1042@` lands nowhere special;
    fallback on `In-Reply-To`/`References`.
  - *HTML cleaned by the Chest*, once (allow-list, http/https/mailto links,
    no images, no attributes), `text` always kept, the original `.eml`
    stored for "Show original" — rather than each small tool carrying a
    server sanitiser and getting it wrong once.
  - *What the Chest found*: `spam` (quarantined), `authenticated`
    (DMARC-aligned), `auto` (out-of-office: never answer robots), `dropped`
    attachments. *Bounces apart*: posted as `{kind: "bounce"}`, never as a
    message (a bounce must not reopen a ticket).
  - *Idempotency keys are hashed, never cut*: a key built as
    `` `${key}:${member}` `` and cut to 64 characters dropped the second
    recipient's email silently (reproduced in `mail.test.ts`); the SDK now
    sends a long key as `sha256:` + digest, and the Chest answers
    `key_conflict` (409) for a key reused within 24 hours for other
    recipients. The same rule covers `events.publish` and `webhooks.send`.
    Keys built from database ids carry the recipient (a restored database
    reuses ids).
  - *One preference per person*: `Member.mailPreference?: "all" | "digest"
    | "none"`, applied by the Chest inside `send`; `transactional: true`
    for what the person must get (the answer to their own request, a
    booking's confirmation). Both switches apply: the tool's decides
    whether it sends (Tasks' "no reminders"), the Chest's whether and how
    the person receives.
  - *Ask before acting*: `available()` never throws for a missing
    capability; its `reason` (`not_granted`, `not_connected`, `suspended`,
    `quota`) is a different sentence and a different person to ask.
- **Limits**: 500 messages a day (the owner may raise), 50 recipients,
  10 MiB sent, 25 MiB received, 20 attachments; a suppression list per
  Chest. The Chest logs to, subject, size and status — not bodies.
- **Risks**: spam and reputation (quotas, suppression, the company's own
  domain), phishing through a tool (the sender is always the company's
  domain), an open relay (impossible: mailboxes only), loops (`auto`).
- **Elsewhere** (vendors' docs as a web search showed them, 2026-09-29):
  Postmark posts inbound mail as JSON with `MailboxHash` for threading
  ([docs](https://postmarkapp.com/developer/webhooks/inbound-webhook));
  Mailgun routes post a parsed message to a URL
  ([docs](https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/receive-http)).
  Neither authenticates the "+" part nor cleans HTML for the app.
  Supabase and Firebase leave email to a provider the developer configures
  with credentials in the app. Here: one connection by the owner,
  per-tool permission and quota, members addressable by id.
- **Still missing**: mailboxes chosen at install (`"mailboxes": {"min",
  "max"}`, Support adding `sales@`); a one-click unsubscribe (RFC 8058,
  from memory) that sets the preference; whether a given mailbox can
  receive.

### 4.3 The calendar bridge — `calendar` (feed, `putMany`)

- **Needed by 8 tools** (import `@argentic/chest-sdk/calendar`): Rooms
  (bookings), Leave (whole days off, `lib/leave-calendar.ts`), Tasks (due
  dates, `lib/due-calendar.ts`), Clients (next steps,
  `lib/step-calendar.ts`), Booking (a host's bookings), Hiring
  (interviews), News (events) and Polls (the chosen date). Ranked first of
  the critique's cross-cutting fixes (`reports/05-critique/_store.md` §4).
  A private tool has no host a calendar app can reach without signing in,
  so without the bridge it cannot serve a feed at all; before it, four
  tools had written their own iCalendar writer.
- **Working copy**: `sdk/client/src/calendar.ts` — `put({key, members,
  title, start, end | days, location?, path?, busy?, private?})`,
  `putMany(events) → PutResult[]` (each event answered on its own:
  `{ok: true, …}` or `{ok: false, index, key, reason}`), `remove`, `list`,
  and the writer (`ics`, `escapeText`, `foldLine`, `feed`, `check`);
  `fakeChest({calendar})`, `chest.feed(member)`, the fake front's
  `/_chest/calendar/<secret>.ics`; `calendar.test.ts` (RFC 5545 folding,
  escaping, UTC form, exclusive `DTEND`, per-language titles, ETag).
- **Decisions**: titles per language given by the tool, the Chest picks
  each reader's; `path` under `/chest`, never a URL; personal feeds only;
  a random secret, stored hashed, replaceable; UID = hash(tool,
  key)@domain; `DTSTAMP` = last change, so an unchanged feed answers 304.
  `putMany` went from all-or-nothing (studio.14) to one result per event
  (studio.15): Rooms, Clients and Tasks each re-sent a refused batch one
  event at a time, costing up to 100 writes of the minute's 600.
- **Manifest and approval**: `"calendar": true` — "Adds events to the
  calendar of the members concerned".
- **Limits**: 5,000 events per tool, 1,000 members an event, a year back
  and two ahead, 600 writes a minute, 100 events a batch; a feed holds a
  member's 2,000 nearest events.
- **Risks**: a feed address is a bearer secret (only its member sees it,
  "New address" revokes, `noindex`, `no-referrer`, `CLASS:PRIVATE`); a
  leaked title (tools write neutral titles: "Off").
- **Honest limit**: Google Calendar refreshes a subscribed calendar at its
  own pace — "every 6–24 hours" per third-party guides read on 2026-09-29
  ([usecarly.com](https://www.usecarly.com/blog/how-to/how-to-subscribe-to-calendar-google/),
  [add-to-calendar-pro.com](https://add-to-calendar-pro.com/articles/synching-ical-with-google-calendar));
  Google's own page could not be read from the studio. A feed shows
  plans, not last-minute changes.
- **Next step, not built**: a read-only free/busy connector
  (`calendar.busy(member, from, to)`, OAuth held by the Chest) — what
  Booking needs to stop double-booking and Hiring to propose interview
  times. `removeMany` for an archived board.

### 4.4 Events between tools — `events.publish`, receivers, `occurredAt`

- **Needed by 14 tools.** Publishers (12): Clients (`crm.deal.won`,
  `crm.deal.reopened`), Equipment, Leave (`leave.approved`,
  `leave.cancelled`, `leave.busy`), People (`people.leaving`,
  `people.record`), Tasks (`tasks.card.done`), Timesheets
  (`timesheets.billable`), Booking (`booking.confirmed`, `booking.busy`),
  Forms (`forms.contact`, `forms.request`, `forms.answered`), Support
  (`helpdesk.ticket.solved`), Hiring (`hiring.hired`, `hiring.busy`),
  Quotes (`quotes.invoiced`), Status (`status.incident`). Receivers (11):
  Clients, Equipment, Goals (deals won, cards done, tickets solved, hires —
  its key results fed by other tools), Leave, People, Rooms, Timesheets,
  Booking, Support, Hiring, Quotes. The built links are in §7.
- **0.3.0**: `events` delivers the four member-lifecycle types only
  (`client/src/events.ts`, `ChestEvent`); `handle` answers 204 to a type
  it does not know, so a tool on 0.3.0 would silently ignore a tool event
  rather than fail — good for compatibility, and it means receivers need
  the proposal to see them.
- **Working copy**: `events.publish(type, data, {key, occurredAt})`,
  `events.handle(…, {tools})` with `ToolEvent`, `events.receivers(type) →
  string[]`, `occurredAtOf`; `fakeChest({emits, receivers, linked})`,
  `chest.published`, `chest.deliver()`; `sdk/client/test/events.test.ts`.
- **Design choices**: one route for member and tool events; a type is
  namespaced by its publisher (a tool cannot impersonate another); the
  admin links publisher and receiver (no tool chooses where its data
  goes); data carries member ids, never names; at least once, with `seen`.
  **`occurredAt`** given by the publisher (a `Date` or an ISO instant with
  a zone, at most 24 hours back and one minute ahead) because Goals counts
  solved tickets and done cards per cycle by the event's time, and
  Support and Tasks re-publish late from a schedule
  (`helpdesk/lib/ticket-events.ts`, `occurredAtFor`): a ticket solved at
  23:55 and told at 00:10 fell in the next cycle. The envelope keeps its
  four keys (`id`, `type`, `occurredAt`, `data`), so 0.3.0's `verify`,
  which refuses any other shape, still reads it. **`receivers(type)`**
  because Forms' Settings could only ask "is Clients installed?", not "is
  it linked?" (`forms/lib/linked.ts`) — a list of tool names, only for the
  tool's own types.
- **Manifest and approval**: `"emits": ["leave.approved"]`, `"receives":
  ["member.*", "leave.approved"]` — "Tells other tools when a leave is
  approved (who, and which days)"; "Is told by Leave when a leave is
  approved".
- **Risks**: data leaving a tool's database (bounded by the admin's link
  and the publisher's documented payload); loops (the Chest drops a chain
  deeper than 3).
- **Still missing**: order per subject or a `newerThan(stored, event)`
  helper (People and Equipment keep `occurredAt` per subject and
  tombstones); a documented payload schema per type the admin sees when
  linking; request/answer between tools ("what does this person hold?",
  §7); an `occurredAt` window longer than 24 hours.

### 4.5 The tool's own addresses, other tools' addresses, currency — more of `chest`

0.3.0's `chest` gives the organization, zone, language and day. What our
tools still read from the studio's `chest` module:

- **The tool's own addresses** (`teamUrl()`, `publicUrl()`): **17 tools**
  — every tool that writes a link in an email sent from a schedule
  (`lib/mail.ts` in Expenses, Goals, Leave, Rooms, Tasks, Timesheets,
  Wiki; `lib/mailer.ts` in News), every public tool that names its public
  page (`lib/public-origin.ts` in Booking, Forms, Support, Hiring, Polls,
  Quotes, Status), and Rooms' and Polls' calendar routes. Without it, each
  derived its address from `X-Forwarded-Host` and remembered it in its
  database (Status still falls back to that, `lib/settings.ts`). Custom
  domains (§4.15) change this address, so it must come from the Chest.
- **Other tools' addresses** (`toolUrl(name)`, `toolLink(name, path)`):
  6 tools — Clients links to a form's answer and a booking
  (`lib/page-data.ts`, `lib/from-booking.ts`), Timesheets to Quotes
  (`lib/handoff.ts`), Booking, Forms (`lib/linked.ts`), Support to a form
  (`lib/forms-in.ts`, which used to guess `forms-chest.<chest>` from its
  own host), Quotes to Timesheets. `CHEST_TOOL_URLS`, a JSON map of every
  installed tool's origins; entries that are not bare https origins are
  dropped one by one; `toolLink` refuses anything the Chest's front would.
  Tools store the tool's name and the path, never an absolute URL.
- **Currency** (`currency()`, `CHEST_CURRENCY`): 4 tools — Quotes
  (every amount, exports, bank file), Timesheets (rates, reports),
  Goals (money key results), Equipment (purchase prices, export). Each
  would otherwise ask its own admin for the company's currency.
- **Design notes**: environment variables, as 0.3.0 chose for the rest:
  no request, restarted when changed. Not a capability: nothing here is
  more than what the portal shows members. Staleness of `CHEST_TOOL_URLS`
  is harmless both ways (a missing tool is no link; a removed one is a
  404 on its host).
- **Still missing**: the other tool's title in the member's language
  ("Open in Forms"), and whether *this member* has that tool.

### 4.6 The look — `chest.theme()`

- **Needed by all 18**: each tool calls `chest.theme()` at render
  (the owner's request: keep each tool's identity, one theme for all, or
  the company's brand, overridable per tool; `reports/04-themes-and-kit.md`).
- **Working copy**: `chest.theme()` in `sdk/client/src/chest.ts`
  (`ThemeChoice`, `BrandChoice`, `readThemeChoice`, `forgetTheme`);
  `fakeChest({theme, themeFiles})`, the fake front's `/_chest/theme/…`;
  `theme.test.ts`. Never throws (own look on 404 or unreachable); cached
  for the Chest's `max-age` (≤ 5 minutes); fonts and logo served by the
  Chest's front on the tool's own hosts, so the strict CSP is unchanged.
- **Approval**: none — a look is not a permission.
- **Risks**: an uploaded SVG logo on a tool's origin (sanitise or
  rasterise); a brand font's licence (the admin confirms).
- **Still missing**: the admin's preview and upload checks; a light-only
  choice for any theme.

### 4.7 Public uploads and public files — `files` options and `claim`

- **Needed by**: Hiring (a candidate's CV, `lib/cv.ts`), Support (a photo
  with a request, `lib/attachments.ts`), Forms (a file question and a
  form's images, `lib/uploads.ts`, `lib/images.ts`); public files by Forms
  (a form's images) and Hiring (the careers page's images and logo,
  `lib/careers.ts`, `lib/public-feed.ts`), through `files.publicUrl`. 0.3.0's `files` is
  private only, and a `files.url()` link "never on a public page"
  (`AGENTS.md`).
- **Working copy**: `files.uploadUrl(name, {public: true,
  expiresUnclaimedAfter})`, `files.claim(ref)`, `files.publicUrl(name,
  {version})`; `fakeChest({storage: {publicUploads, publicFiles}})`, the
  fake front's `/_chest/upload/<token>` and `/_chest/public/<name>`;
  tests in `sdk/client/test/testing.test.ts`. Built from the Chest's own
  spec (`reference/product/specs/tool-storage.md`).
- **Found by Hiring, built**: the spec's public upload answered the
  visitor the object's name, which the visitor handed back in the form —
  anyone could hand another visitor's name. The upload now answers a
  one-time `claim` the tool trades with `files.claim()`, and the Chest
  deletes what nobody claimed (`expiresUnclaimedAfter`, 86,400 s in Forms
  and Support) instead of each tool's nightly sweep.
- **Manifest**: `"files": {"publicUploads": true, "publicFiles": true}`.
- **Still missing**: the spec says nothing of abuse on the tool's side (a
  tool must authorise a public upload only after its own guard — §4.8);
  a short-lived public signed link for a customer's own file (Support
  streams it through `files.get` today); the fake sniffing PDFs and
  archives.

### 4.8 The public host's visitors — `visitors`

- **Needed by 6 public tools**: Booking (`lib/guard.ts`), Forms
  (`lib/guard.ts`, `lib/session.ts`, `app/public-actions.ts`), Hiring,
  Polls (`app/p/[link]/actions.ts`), Quotes (`app/q/[secret]/page.tsx`,
  quote acceptance), Status (`lib/subscribers.ts`). Each had rebuilt a
  signed "form shown at" token, per-visitor counters, their purge, and the
  visitor's language.
- **Working copy**: `sdk/client/src/visitors.ts` — `formToken`,
  `checkForm`, `count`, `language`, `visitor`, `address`;
  `fakeChest({visitors})`; `visitors.test.ts`.
- **Why the Chest counts**: it sees every public tool's traffic; a
  per-tool counter lets a robot spread over five tools five times the
  allowance. `language()` now falls back to `chest.language` (0.3.0).
- **Approval**: none new. **Risks**: shared addresses behind one NAT (the
  owner may raise the ceiling; tools say "try again in an hour").

### 4.9 Notices to outside addresses — `webhooks`

- **Needed by 3 tools**: Status (subscribers' Slack, Teams and webhooks —
  Statuspage's), Forms (answers to Zapier, Make, a sheet, Slack —
  Typeform's and Tally's), Support (a new ticket to a team's channel,
  `lib/notices.ts`). `"network": ["*"]` is not an answer: a customer's
  address is unknown when the manifest is written, and it would make each
  tool a way into the company's own network (SSRF).
- **Working copy**: `sdk/client/src/webhooks.ts` — `add`, `remove`,
  `list`, `enable`, `rotateSecret`, `send`, `journal`, `available()`,
  `handle` of `webhook.disabled` on `POST /chest-webhooks`, and the rules
  as pure functions (`checkUrl`, `isPublicAddress`, `format`, `sign`,
  `verifySignature`); `fakeChest({webhooks})`; `webhooks.test.ts`.
- **Manifest and approval**: `"webhooks": {"max": 200}` — "Sends notices
  to web addresses your admins or subscribers give, signed by your Chest
  (up to 200 addresses)". The owner sees each address, its state and the
  journal.
- **Limits**: 60 new targets an hour; 1,000 deliveries an hour, 500
  targets a send; text 4,000 characters, data 16 KiB; 10 s an attempt; 8
  attempts over 24 hours; 10 failures in a row disable a target (at once
  on 410). Journal 30 days, never text or data.
- **Risks and bounds**: *SSRF* — https only, public addresses only
  (IPv4 and IPv6 including mapped, NAT64, 6to4, Teredo), resolution checked
  at add and at every attempt with the connection pinned, redirects never
  followed; a finding: Node's `BlockList` matches IPv4 against an
  `::ffff:0:0/96` rule, so one list blocks every IPv4 address — two lists
  are needed (a test pins it). *Spam* — a generic address must answer a
  signed `chest.ping`; Slack and Teams addresses must have their shape.
  *Secrets* — a Slack or Teams address is a credential: stored encrypted,
  shown by host only.
- **Elsewhere** (as a web search showed their documentation on
  2026-09-29): Stripe signs `t=…,v1=…` HMAC-SHA256 of `<t>.<body>`
  ([docs](https://docs.stripe.com/webhooks)) — we copied the shape; GitHub
  signs without a timestamp
  ([docs](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries));
  Statuspage quarantines after 10 failures
  ([Atlassian](https://support.atlassian.com/statuspage/docs/enable-webhook-notifications/));
  Standard Webhooks signs `<id>.<timestamp>.<body>`
  ([spec](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md))
  — adopting its headers exactly is to consider before a Chest ships
  this. Teams' Office 365 connectors were retired in 2026 (sources
  disagree on the day); new hooks are Workflows addresses expecting an
  Adaptive Card envelope
  ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)).
  **Assumed, to verify on a real tenant**: that such a flow accepts an
  anonymous POST.

### 4.10 Checks run by the Chest — `checks`

- **Needed by**: Status — "is the website up?" (`lib/checks.ts`,
  `lib/check-results.ts`, `app/chest-checks/route.ts`); after three
  failures in a row every editor's bell rings and *Now* offers a
  prefilled incident; the public page shows the measured share of checks
  answered in time. A tool cannot know it: no outbound network, no
  process between requests.
- **Working copy**: `sdk/client/src/checks.ts` — `configure`, `list`,
  `handle`/`verify` of signed results on `POST /chest-checks`;
  `fakeChest({checks})`, `chest.check()`; `checks.test.ts`.
- **Design point**: the manifest declares the permission
  (`"checks": {"max": 10}`); the tool's admin types the addresses; the
  owner sees each. "Asks the Chest to check up to 10 web addresses of
  yours, as often as every minute". GET only, https, no private addresses.
- **Still missing**: a heartbeat address (silence means down), a keyword
  expected in the page, history kept by the Chest.

### 4.11 Seeing the Chest's groups — `groups` read

- **Needed by 5 tools open to everyone** (`"groups": "read"`): News
  (post to a team), Polls (ask Sales only), Wiki (a space's rights by
  group), Rooms (rooms reserved to a group), Goals (a team's objectives,
  `lib/teams.ts`). 0.3.0's `members.groups.list()` gives "the groups that
  give the tool; never the others" (`README.md`, "`members`") — nothing
  when the tool is open to everyone, which is exactly how these tools are
  installed.
- **Working copy**: `members.groups.all()` → `[{id, name, size}]`,
  `members.groups.members(id, {after, limit})`; events `group.changed
  {id, changed: ["name" | "members"]}` and `group.removed`;
  `fakeChest` groups with `grants: false`; `groups.test.ts`.
- **Decisions**: who is in a group is answered among the members who have
  the tool (the rule "a member without access does not exist for the tool"
  holds). "Sees your Chest's groups and who is in them".
- **Found with the harness**: a tool on an older SDK answers 401 to
  `group.changed` (its verifier wanted a member id in `data.id`), so the
  Chest must send group events only to versions that declare `group.*`.
  0.3.0's `handle` now answers 204 to an unknown type, which removes that
  hazard for tools on 0.3.0.
- **Still missing**: group deltas (`{added, removed}`) so a bell item can
  be withdrawn from someone who left a group; letting the owner hide a
  sensitive group from tools.

### 4.12 Notify everyone — `notifications.broadcast`

- **Needed by**: Polls (a question to everyone or some groups,
  `lib/tell.ts`), Status (an incident to its editors, `lib/tell.ts`
  `tellTeam`), Forms (a team form just published, to everyone who has the
  tool, `lib/tell.ts` `opened`). News still pages by hand: it groups recipients by
  language and calls `notify` per 500 (`news/lib/tell.ts`), and 0.3.0's
  1,000 recipients an hour means a company of 1,300 cannot be told of its
  move in one go.
- **Working copy**: `notifications.broadcast({messages: {en, fr…}, path,
  key, to: {roles, groups}, except})` → `{delivered}`; the fake resolves
  recipients and picks each one's language; `fakeChest({broadcast:
  false})` for a tool's fallback.
- **Quota**: 30 broadcasts an hour per tool, outside the recipients-an-
  hour quota (the Chest delivers at its own pace); each member keeps 100
  items a day.
- **0.3.0 helps**: now that `members` answers each member's `language`,
  a tool can at least group by language without a second source.

### 4.13 The store's words in other languages — manifest `translations`

- **Needed by 17 of 18** (every tool but Clients gives `"translations":
  {"fr": {…}}` in `chest.proposals.json`). A tool speaks
  `member.language` inside; its tile, its store card and the role names
  the admin picks from are in English only.
- **Shape**: `"translations": {"fr": {"title", "description",
  "role_labels"}}`, same bounds as the originals; checked by
  `scripts/check-manifest.mjs`. The manifest's own words stay the default.
- **The Chest's side**: the tile, the store and the roles screen pick the
  viewer's `language` — which 0.3.0 now gives every page.

### 4.14 Members: matching addresses, when someone left, the preference

- **`members.matchEmails(emails) → {address: mbr_id}`** — Equipment
  matches Intune's devices to members by name today (`lib/intune.ts`):
  wrong for two Léa Dubois or a name changed after a marriage. Only
  members who have the tool are matched; 200 a call, 5,000 distinct
  addresses a day (a tool cannot walk a list of guesses). Test in
  `testing.test.ts`.
- **`FormerMember.leftAt`** — Expenses keeps a former member's claims out
  of the transfer file and needs the date to know which final pay slip
  (`lib/payments.ts`, `lib/people.ts`); Timesheets shows "left on …"
  (`app/chest/team/[member]/page.tsx`). 0.3.0's `FormerMember` is
  `{id, name, status}` (`client/src/members.ts`). Additive, kept after an
  erasure (a date names nobody).
- **`Member.mailPreference`** — see §4.2.
- **Wishes, not built**: `{id, name, status: "no_access"}` for someone who
  lost access but stayed (Equipment's "Léa holds 3 laptops", Goals'
  "needs a new owner"); `list({admin: true})`; a `member.added` /
  `access.granted` event (People and Leave notice a newcomer); a manager
  relation (Leave, Goals, People); `language` and `timeZone` in
  `member.updated`'s `changed`.

### 4.15 Platform only — beyond the bell, and custom domains

No SDK change fixes these; the Chest must.

- **Web push and an email digest of the bell.** Leave and Expenses
  approvals, Tasks assignments, News' Important posts wait in a bell
  nobody opens. 0.3.0 says it plainly: notifications are "inside the
  Chest only — no email, no push to a phone" (`README.md`,
  "`notifications`"). The Chest's own service worker (PWA) and a daily
  digest of unread items (needs §4.2) would carry every tool's keyed items
  further with no tool change; an `urgent` flag is the only SDK part.
- **Custom domains for public hosts.** `status.`, `careers.`, `book.`,
  `support.` on the company's domain are required to replace Statuspage,
  Teamtailor, Calendly or Zendesk: a CNAME to the Chest, checked;
  certificates by ACME; the tool unchanged, told its address by §4.5.

### 4.16 Wanted, designed, not built

None is faked in a tool; each tool's README says what it cannot do yet.

| Need | Asked by | Shape proposed |
|---|---|---|
| Sealed values (a field encrypted with a key the Chest keeps) | Expenses (IBANs), People (records) | `secrets.seal(value, context)` / `open` |
| A role builders do not get | People | roles marked `sensitive` in the manifest |
| A Chest-wide audit journal | People, Support | `audit.write({action, subject})` |
| Framing public pages | Booking, Support, Status | `"public": {"frameable": true}` with the owner's origins |
| Asking another tool a question | Goals, People, Timesheets → Quotes | `tools.query(tool, name, params)`, granted like events |
| A partner service (e-invoicing platform, payments) | Quotes, Booking | `partners.send(name, …)`, credentials held by the Chest |
| Guest accounts | Quotes (the accountant), Polls | a time-limited guest with one tool and one role |
| Bulk file export | Support, News, Wiki | `files.archive(names)` → a signed ZIP |
| A file referenced in an AI call | Expenses (receipts) | a `{type: "file", name}` content part for `ai.chat`, so the Chest reads the object instead of the tool sending up to 10 MiB |

## 5. Differences to reconcile — studio proposal vs 0.3.0

Where 0.3.0 chose a different shape for something the studio had built,
**the studio adopts the official shape**; our proposals that remain are
re-expressed on it in `0.3.1-studio.1`. What changes for the tools the
day they are re-vendored:

| Topic | Studio (`0.3.0-studio.16`) | Official 0.3.0 | Studio adopts |
|---|---|---|---|
| The Chest's context | functions `company()`, `timeZone()`, `today(at, zone)`, `locale()`, from `CHEST_COMPANY`, `CHEST_TIMEZONE`, `CHEST_LOCALE`, with safe defaults | the `chest` object: `organization.name`, `timeZone`, `language` (getters), `today(at?)`, from `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`; throws `not_in_chest` | the official object and names, and the throw. Remaining proposals become members of the same object: `chest.currency`, the tool's addresses, `chest.toolUrl()`/`toolLink()`, `chest.theme()` |
| The member's language | `member.locale`, type `Locale = "en" \| "fr"`, claim `locale` optional (English when absent), `localeOf` | `member.language`, any primary tag, claim `language` required; "a tool that does not speak that language uses its own default" | `member.language`. The "fall back to English" step moves into each tool's i18n (its catalogue lookup), where the official README puts it |
| The member's zone | `member.timeZone?` from the optional `zoneinfo` claim; `chest.timeZone(member)` falls back to the Chest's | `member.timeZone` always present; the Chest does the fallback; claim `time_zone` | the official field; `chest.timeZone(member)` goes (People's `lib/zone.ts` reads the field) |
| The assertion | label `Chest-Member v2`, claims `locale`, `zoneinfo`, `mail_pref` optional, `groups` up to 64 (all of a member's groups) | label `Chest-Member v2`, `language` and `time_zone` required, `groups` up to 16 (those that give the tool) | the official claims. **Same label, different required claims**: an official `member()` refuses the studio fake's assertions, and a studio `member()` reads every official assertion as English — so no tool may mix them; the rebase moves fake and tools together. `mail_pref` stays an optional claim (a claim added keeps the label, `client/src/member.ts`) |
| A member's groups | widened to every group, up to 64 | the groups that give the tool, ≤ 16 | the official meaning; every group of a member goes behind `"groups": "read"`, answered by a call, not by the assertion every tool receives |
| Former members | `{id, name, status, leftAt}` | `{id, name, status}` | official type plus `leftAt` as an additive proposal |
| Event envelope | four keys; tool events added; publisher `occurredAt` | four keys, member events only; unknown types 204 | unchanged envelope; tool and group types stay proposals |
| Local links | `files.url`/`uploadUrl` accept `http://localhost` and `http://127.0.0.1` | https only (`client/src/files.ts`, `linkPattern`) | keep as a dev affordance in the proposal (the harness needs it), reported as friction (§6) |
| Fake Chest | `fakeChest({tool, network, settings, …})`, `chest.clearCaches()`, plays uploads and links | `fakeChest({…, chest})`; `members.forget()`; an upload "it authorises but does not receive" (`client/src/testing.ts`, header) | `chest: {organization, timeZone, language}` as the official option; `tool`, `network` and the upload front stay proposals; `clearCaches()` keeps only what `forget()` does not (the theme) |
| AI | not built (a placeholder) | `ai` | the official module, unchanged |

## 6. Friction in what exists (0.3.0)

### `member` and `members`
- **Someone who lost access is "unknown".** `lookup` answers `former`
  for someone who left the Chest but `unknown` for someone who only lost
  access (`README.md`, "`members`": "A member without access answers as
  an identifier that does not exist") — the tool loses their name exactly
  when it needs it. Hit by Equipment and Goals.
- **`member.updated` does not say `language` or `timeZone`**
  (`MemberChange`, `client/src/events.ts`): a tool that caches a
  member's words or zone (a digest's hour) learns of a change only at the
  next `get`.
- **Matching names.** Every importer (Tasks, Leave, People, Timesheets,
  Expenses) folds accents, case and word order to match spreadsheet names
  to members. Wish: `members.match(names)`.
- **Listing everyone** for "who has not read this post" (People reads up
  to ten pages a view). Wish: an ETag on `/members` or `changedSince`.

### `chest`
- Good as designed. Two notes: the organization's **name only** — a
  public page or an invoice may also want the company's logo, which Hiring
  (careers page, `lib/public-feed.ts`) and Quotes (documents,
  `lib/company.ts`) each ask their admin to upload again; and `not_in_chest` means a
  development server needs the three variables set (our harness does).

### `files`
- **`https` only** for `url` and `uploadUrl` answers (`files.ts`
  `linkPattern`, `uploadPattern`): no local harness can serve them.
- **The fake does not receive uploads** ("an upload it authorises but does
  not receive", `testing.ts`), serves no links or photos, and does not
  answer `no_thumbnail`: a tool's upload flow and thumbnail fallback cannot
  be tested (News, Expenses). The studio's fake plays the front.
- **`stat` has no `sha256`**: Expenses re-downloads each receipt to hash
  it. **HEIC** photos get no thumbnail (thumbnails are JPEG, PNG, GIF,
  WebP).
- **Records that must outlive the tool** (Expenses' receipts and Quotes'
  invoices, 10 years): "Removing the tool removes its files". Wish: a
  manifest `retain` declaration so the owner is warned and offered the
  export.

### `notifications`
- Clear and well bounded. Wishes: a per-recipient text in one call
  (every tool's `lib/notify.ts` groups by language); `withdraw(key,
  {except})` or a key prefix (Wiki trashing a branch); a per-recipient
  result so a reminder is not marked "told" when the Chest was briefly
  unreachable; an `important` flag.

### `events`
- At least once and unordered: each receiver keeps `occurredAt` per
  subject and tombstones (People, Equipment). A documented pattern or a
  helper would save every receiver the same code.

### `ai`
- No tool uses it yet; Expenses reads receipts in the browser with
  tesseract.js and names the AI gateway as its way forward
  (`tools/private/expenses/README.md`). The only friction we can see from
  the docs: a stored file must travel through the tool to reach a model
  (§4.16).

### Manifest (not in the SDK repository)
- 0.3.0's README points to the Chest repository's `docs/architecture.md`
  for the manifest, which we cannot read. **Assumed unchanged**: unknown
  keys refused, so every tool keeps its proposals in
  `chest.proposals.json`; `title` and `description` in one language
  (§4.13); role identifiers' grammar unwritten (we use
  `^[a-z][a-z0-9_-]{0,31}$`).

### Build and runtime
- Next.js fits (build ~1 min, ~150 MB at run), but `next build` needs
  `--webpack` and a type check before it. A starter per stack would save
  every builder the same afternoon. 0.3.0 documents that Webpack and
  Turbopack resolve the package with no configuration (`README.md`,
  "Next.js") — good.
- The CSP: Next.js needs a nonce per response; React's `style=` needs
  `style-src-attr 'unsafe-inline'`. Worth a paragraph in the contract.
- Extensions: `pg_trgm`, `unaccent`, `btree_gist` (Booking's and Rooms'
  "never booked twice") are trusted; Wiki creates a text search
  configuration. The contract should list what migrations may create.
  Booking's daily limit takes a row lock: the role must keep plain locking
  rights.
- Next.js traps met by several builders: Node and browsers format dates
  differently (hydration — format on the server); a plain function from a
  `"use client"` file cannot be called by a server page; libraries that
  inject `<style>` are blocked by the nonce policy; Next overwrites `Vary`.

## 7. Public-facing tools

Seven tools have a public part (Booking, Forms, Support, Hiring, Polls,
Quotes, Status). The public host works — one tool, two hosts, the team's
part behind `/chest`, "the public host has no member" (`AGENTS.md`) — but
each public tool rebuilt the same things, and each is a platform concern:

1. **Abuse on forms** — a honeypot, a signed "form shown at" time,
   per-visitor counters keyed by the first `X-Forwarded-For` address
   (assumed set by the Chest's front; the contract should say so). The
   `visitors` proposal (§4.8).
2. **Visitors' language** — the same `/lang/<code>` switch, cookie and
   `Accept-Language` parsing in each; 0.3.0 now gives the last fallback
   (`chest.language`: "a public page before the visitor chooses",
   `README.md`, "`chest`"); `visitors.language()` does the rest.
3. **Secret links instead of accounts** — a customer follows a ticket, a
   guest moves a booking, a client accepts a quote through a link holding
   a secret (stored hashed). Right for one-off visitors; worth a helper and
   a paragraph (never logged, `Referrer-Policy`, `noindex`). Real public
   accounts are not needed by the opening store.
4. **Addresses** — the tool's public address for emails sent later
   (§4.5), and the company's own domain (§4.15).
5. **Reaching the visitor** — only by `mail` (§4.2) or `webhooks` (§4.9).

What a public tool cannot do yet, and says so on its pages: members'
photos on the public host (the Chest's photo links are team-host only),
reading a host's other calendars (§4.3's free/busy), payments.

## 8. Tools as a suite

The pitch is "one flat price for all your tools", but what a SaaS bundle
cannot match is tools that know each other without an integration
project. The links below are built on the studio's events proposal
(§4.4), each tested on both sides with `chest.published` and
`chest.deliver`:

- **Leave → Rooms** and **Leave → People**: `leave.approved` /
  `leave.cancelled` (who, which days — never the kind nor the note); Rooms
  marks the days "Off" and frees the desk, People shows "Away · back on …"
  (`leave/lib/share.ts`, `rooms/lib/away.ts`, `people/lib/away.ts`).
- **Hiring → People**: `hiring.hired` becomes an arrival HR can prepare
  before the person has access, linked to the member once they join
  (`hiring/lib/share.ts`, `people/lib/arrivals.ts`).
- **People → Equipment**: `people.leaving {member, lastDay}` lists what
  the person holds under "To take back" (`equipment/lib/departures.ts`).
- **Clients → Quotes**: `crm.deal.won` makes one draft quote;
  `crm.deal.reopened` deletes it only if nobody touched it.
- **Forms → Clients** and **Forms → Support**: a contact form's answer
  becomes a contact or a ticket, linked back with `chest.toolLink`.
- **Tasks, Support, Clients, Hiring → Goals**: key results fed by done
  cards, solved tickets, won deals and hires, counted by `occurredAt`.
- **Timesheets ↔ Quotes**: billable time becomes an invoice line;
  `quotes.invoiced` marks it billed.
- **Booking, Leave, Hiring** share busy times (`*.busy`) so a host is not
  booked while away or interviewing.

What building them taught: payloads are contracts (receivers validate and
ignore another shape); a receiver fills, it never overwrites a person's
own choice; idempotency keys carry the version of the fact; take back only
what nobody touched; a hire exists before the member does. No harness runs
two tools yet: tests on both sides stand in for it.

## 9. Developer and agent experience

- **The local loop.** `lab/chest-dev` (the fake Chest from the SDK, the
  tool's database migrated as the Chest does, a member and language
  switcher, the bell, lifecycle buttons, the proposals' controls,
  screenshots) is the specified `chest dev`. On 0.3.0 it must also set
  `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`, and let the
  developer switch a member's `timeZone` — the only way to see a Montreal
  member of a Paris company.
- **`chest check`** does not exist: `scripts/check-manifest.mjs` checks the
  manifest grammar, images, migrations and the studio's rules, and reads
  every proposal's manifest key.
- **Tests without a database server**: PGlite with `pglite-socket` runs
  the tool's real SQL; tools also run their tests on PostgreSQL. On 0.3.0
  the tests must set the session `TimeZone` as the Chest does, or
  `current_date` differs between the test and production.
- **`AGENTS.md` is the right idea**: a short path, the rules, a table of
  symptoms and causes. Ours (`sdk/AGENTS.md`, `lab/BUILDING.md`) grew the
  same way. What an agent still lacks to build a correct tool on the first
  try: a starter per stack, `chest dev`, `chest check`.
- **Accessibility**: `lab/chest-dev/audit.mjs` (axe-core, WCAG 2.1 AA,
  every screen, phone and desktop, light and dark) runs in every tool's
  verification (`PROGRESS.md`). `chest check` should run it.

## 10. Priorities

Priority: **P1** blocks cancelling a SaaS category or stops a feature in
most tools; **P2** needed by several tools or one category's main
feature; **P3** a single tool's refinement. Tool counts from
`chest.proposals.json` and SDK imports (2026-09-30).

| Gap (§) | Tools that need it | Kind | Effort | Priority | Why |
|---|---|---|---|---|---|
| `schedules` (§4.1) | all 18 | Chest + SDK (built) | M | **P1** | reminders, digests, purges, retries: nothing happens unless a page is opened |
| `mail` send, availability, preference (§4.2) | 17 (all but Clients) | Chest + SDK (built) | L | **P1** | the only way to reach customers, candidates, guests, and members who never open the Chest |
| `mail` receive (§4.2) | Support, Hiring | Chest + SDK (built) | L | **P1** | without it Support is a contact form, not a helpdesk |
| Accept unknown manifest keys, or version them (§6) | all 18 | contract | S | **P1** | no tool using a proposal can be installed |
| The tool's own addresses (§4.5) | 17 | environment (built) | S | **P1** | every link in an email sent later; custom domains depend on it |
| Events between tools (§4.4) | 14 | Chest + SDK (built) | M | **P1** | the suite is the pitch; 12 publishers, 11 receivers |
| Calendar bridge (§4.3) | 8 | Chest + SDK (built) | M | **P1** | Rooms, Leave, Booking, Hiring cannot replace their SaaS without it |
| Public uploads and files, `claim` (§4.7) | Forms, Support, Hiring | Chest + SDK (from the spec) | M | **P1** | a candidate cannot send a CV |
| Custom domains (§4.15) | 7 public tools | Chest only | M | **P1** | Statuspage, Teamtailor, Calendly, Zendesk are on the company's domain |
| Web push and email digest of the bell (§4.15) | every tool with approvals | Chest only | M | **P1** | approvals wait in a bell nobody opens |
| `translations` of the tile (§4.13) | 17 | contract | S | P2 | French members see English tiles |
| `chest.theme()` (§4.6) | all 18 | Chest + SDK (built) | M | P2 | the owner's themes; each tool falls back to its own look |
| `visitors` (§4.8) | 6 public tools | Chest + SDK (built) | S | P2 | each tool rebuilds a guard; robots spread across tools |
| `groups` read (§4.11) | 5 (News, Polls, Wiki, Rooms, Goals) | Chest + SDK (built) | S | P2 | "post to the Sales team" does not work in the default setup |
| `webhooks` (§4.9) | Status, Forms, Support | Chest + SDK (built) | M | P2 | Statuspage's and Tally's integrations |
| `notifications.broadcast` (§4.12) | Polls, Status, Forms (+ News by hand) | Chest + SDK (built) | S | P2 | "tell everyone" stops at 1,000 people an hour |
| `checks` (§4.10) | Status | Chest + SDK (built) | M | P2 | a status page that cannot see the site is down |
| `chest.currency` (§4.5) | Quotes, Timesheets, Goals, Equipment | environment (built) | S | P2 | each tool asks its admin again |
| Free/busy connector (§4.3) | Booking, Hiring | Chest + SDK (not built) | L | P2 | double-booking against a host's own calendar |
| `toolUrl` / `toolLink` (§4.5) | 6 | environment (built) | S | P3 | links between tools |
| `FormerMember.leftAt` (§4.14) | Expenses, Timesheets | field (built) | S | P3 | the right final pay slip |
| `members.matchEmails` (§4.14) | Equipment | call (built) | S | P3 | Intune devices matched by address, not name |
| `language`/`timeZone` in `member.updated` (§6) | tools caching words or hours | event field | S | P3 | stale cache until next `get` |

Deliberately not proposed: WebSockets and background processes (polling
every 20–45 s and schedules covered every case), outbound network per tool
(only Status's checks needed it — better as a Chest-run check), public
accounts (no opening-store tool needs them).

## Appendix — where the earlier sections went

| Earlier § | Now |
|---|---|
| 4.1 schedules | §4.1 |
| 4.2 mail, 4.13 mail inbound, 4.19 keys, 4.24 mail preference, 4.28 `available()`, 4.29 README corrections | §4.2 |
| 4.3 public uploads and files | §4.7 |
| 4.4 events, 4.25 `occurredAt`, 4.26 `receivers` | §4.4 |
| 4.5 `chest` settings | §2 (organization, zone, language, today — official) and §4.5 (addresses, currency) |
| 4.6 broadcast | §4.12 |
| 4.7 translations | §4.13 |
| 4.8 visitors | §4.8 |
| 4.9 checks | §4.10 |
| 4.10 theme | §4.6 |
| 4.11 calendar, 4.22 and 4.27 `putMany` | §4.3 |
| 4.12 groups read | §4.11 |
| 4.14 push and digest, 4.15 custom domains | §4.15 |
| 4.16 designed, not built | §4.16 |
| 4.17 webhooks | §4.9 |
| 4.18 `toolUrl` | §4.5 |
| 4.20 `fakeChest({tool, network})`, `clearCaches` | §5 (fake Chest row) |
| 4.21 `matchEmails`, 4.23 `leftAt` | §4.14 |
| 4.30 member time zone | §2 — now official |
