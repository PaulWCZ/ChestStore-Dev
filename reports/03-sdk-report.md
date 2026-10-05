# The SDK report — what building the store taught us

_Baseline rewritten on 2026-10-05 for the official **Chest SDK 0.4.1**
(`@argentic/chest-sdk` 0.4.1, tool contract 0.4; `reference/sdk/`, tag
`v0.4.1`, commit `6ec5f41`, 1 October 2026). Every claim about 0.4.1 below
comes from that snapshot — `README.md`, `AGENTS.md`, `contract/README.md`
and `client/src/*.ts`, cited by section or file. Every claim about a tool
comes from its code (`tools/private/*/`, `tools/public-and-private/*/`,
`lib/`, `app/`, `chest.json`, `chest.proposals.json`), read on 2026-09-30
and, for the counts marked so, on 2026-10-05. The studio's proposals live
in the SDK working copy `sdk/`, now **`0.4.1-studio.2`**: the official
0.4.1 byte for byte, with the proposals in files of their own
(`sdk/client/studio/`; §5 says what the rebase dropped and reshaped). On
2026-10-05 the 18 tools still vendor `0.3.1-studio.1` (0.3.0 plus the
proposals) and are being moved to `0.4.1-studio.1`._

How to read it: §2 is what 0.4.1 gives and which of our earlier asks it
answered; §4 is what the 18 tools still need beyond it, one section per
gap, with the studio's built proposal; §5 is where the official shape
differs from ours and what we adopted; §6 is friction in what exists; §10
is the priority table, in the order the owner decided for the Chest.
Section numbers of the earlier drafts (§4.1–§4.30) are mapped in the
appendix.

## 1. Summary — the changes that would matter most

0.3.0 answered the first ask of every earlier draft — the member's
language and zone, the Chest's organization, zone, language and day — and
0.4.x answered the next ones: **schedules** (all 18 tools have at least
one), **the tool's own addresses** (`chest.tool.teamUrl`,
`chest.tool.publicUrl`, custom domains included) and **the currency**,
**the tool contract published with `chest check`** (the Chest's own
validator), **a versioned manifest** (`"chest": "0.4"`), lookup's
`no_access`, `language` and `timeZone` in `member.updated`,
`FileObject.sha256` and a fake Chest that serves links and takes uploads.
What remains, in the order the owner decided for the Chest (brief/08):

1. **Groups read and broadcast** — 7 tools open to everyone cannot target
   a team (`"groups": "read"`: News, Polls, Wiki, Rooms, Goals, Tasks,
   Leave), and "tell everyone" stops at 1,000 people an hour (Polls,
   Status, Forms; News pages by hand).
2. **Events between tools** — 14 of 18 tools publish or receive another
   tool's events (12 publish, 11 receive). 0.4.1's `events` carries the
   members' lifecycle only, and its manifest takes `"receives":
   ["member.*"]` only.
3. **The calendar feed** — one secret feed per member for every tool's
   events; 8 tools write to it. A private tool cannot serve a feed at all.
4. **Web push** (and a digest of the bell) — approvals wait in a bell
   nobody opens; Chest only.
5. **Mail, send and receive** — 17 of 18 tools send (all but Clients);
   Support and Hiring receive. Last in the Chest's order, first in reach:
   it is the only way to a customer, a candidate or a guest (§10 says
   what that order costs the store).

Beside them: the public host's kit (public uploads with a one-time claim,
`visitors`), the store's words in other languages, the look, webhooks,
checks — all built in `sdk/` and listed in §10.

## 2. Baseline — what 0.4.1 gives

0.4.1 is eleven published modules plus the shared `api` and `signed`
(`README.md`, "Imports"; `package.json` `exports`): `member`, `chest`,
`members`, `notifications`, `events`, `schedules`, `ai`, `database`,
`files`, `errors`, and `testing` for tests. It stays dependency-free
(`node:*` only) and reaches only the Chest's API on `127.0.0.1`
(`AGENTS.md`, "Contributing"). Beside the client, the repository now
publishes **the tool contract** (`contract/README.md`, rendered from the
Chest's code: every key of `chest.json` and its bounds, the repository's
rules, what migrations may create — 20 trusted extensions —, the CSP the
Chest adds, Next.js on a Chest) and **`chest check`**
(`@argentic/chest-check`, `check/`: the Chest's validator compiled to
WebAssembly, run from a clone, not on npm yet).

### Module by module

- **`member(request)`** (`README.md`, "`member(request)` — the member of a
  request"; `client/src/member.ts`). The signed `Chest-Member` assertion,
  label `Chest-Member v2`, claims `language` and `time_zone` required (as
  in 0.3.0). `groups` stays "the groups that give the member this tool",
  at most 16.
- **`chest`** (`README.md`, "`chest` — the Chest the tool runs in";
  `client/src/chest.ts`). `organization.name`, `timeZone`, `language`,
  **`currency`** (ISO 4217, `CHEST_CURRENCY`, "EUR" until the owner sets
  one), **`tool.teamUrl`** and **`tool.publicUrl`** (`CHEST_TEAM_URL`,
  `CHEST_PUBLIC_URL`: origins; the public one is "the company's own domain
  once the owner connected one, else the tool's public host; `null` for a
  tool without a public part"), `today(at?)`. Read at each access; the
  Chest restarts awake tools when one changes. Outside a Chest, reading
  throws `ChestError` `not_in_chest`.
- **Database time zone** — the Chest's zone is the `TimeZone` of the
  tool's database sessions (`README.md`, "`chest`"). **`databaseUrl()`**
  also accepts the role `pb_<project>` of a Perseus Code draft's preview
  database (0.4.1; `client/src/database.ts`).
- **`members`** (`README.md`, "`members` — who has the tool"). `list`,
  `get`, `lookup` (200 at a time, cached a minute), `groups.list()` (the
  groups that give the tool), `forget()`. Lookup's `former` entries now
  carry **`status: "no_access"`** with the name — “Léa Dubois (no
  access)” — besides `former` and `erased`.
- **`notifications`** — unchanged since 0.2: `notify` (keyed, 1–500
  recipients), `withdraw`, `badge.set`/`setMany`; 1,000 recipients an hour,
  100 items per member a day, 600 badge writes a minute; "inside the Chest
  only — no email, no push to a phone". The inbox now also carries the
  Chest's own items (brief/08).
- **`events`** (`README.md`, "`events` — the members' lifecycle"). Four
  member types; `member.updated`'s `changed` may now name **`language`**
  and **`timeZone`** (`client/src/events.ts`, `MemberChange`); at least
  once, unordered, 72 hours; `handle` answers 204 to a type it does not
  know; `acknowledgeErasure`.
- **`schedules`** (`README.md`, "`schedules` — work the tool does by
  itself"; `client/src/schedules.ts`). `"schedules": [{name, cron}]` in
  `chest.json` (8 at most, 15 minutes apart, 5 minutes a run, the Chest's
  zone); runs posted to `POST /chest-schedules`, signed `Chest-Schedule`
  (label `Chest-Schedule v1`), body `{id, name, scheduledAt, attempt}`;
  `handle(request, handlers, {seen})` answers 204, 401 or 404; retries
  after 1, 5 and 15 minutes; a missed time run once; "Run now" for whoever
  runs the tool, and an agents' API.
- **One signature mechanism** (`client/src/signed.ts`): `Chest-Event` and
  `Chest-Schedule` are channels of one JWS scheme, each under its own key
  label; `Seen` and `memorySeen` are shared.
- **`ai`** — as in 0.3.0: `chat` (streamed or not, tools, images),
  `embed`, `models`, `usage`, four aliases, the cap reserved before each
  call.
- **`files`** — as before, with **`FileObject.sha256`** (and `width` and
  `height` of a measured image); `url` and `uploadUrl` accept a link on
  the team host (https) or on `CHEST_API`'s own origin, where only a fake
  serves (`client/src/api.ts`, `chestLink`).
- **`testing`** (`README.md`, "`testing` — a tool's own tests").
  `fakeChest({members, former: [{id, name?, status?}], groups,
  capabilities, receives, files, ai, chest: {organization, timeZone,
  language, currency, teamUrl, publicUrl}})`; the fake **serves `files.url`
  links and takes `uploadUrl` PUTs on its own origin**, content-sniffed,
  with the Chest's errors (`type_refused`, `type_mismatch`, `too_large`,
  `no_thumbnail`); `emit`; **`run(name, to, {id, scheduledAt, attempt})`**.

### What 0.3.0 and 0.4.x now cover of this report's earlier asks

| Earlier ask (old §) | Tools that needed it | Official | How |
|---|---|---|---|
| The member's language — `member.locale` (§3 `member`, §8 row 1) | all 18 | 0.3.0, **fully** | `member.language`, and in `members.*` |
| The Chest's default language, name, zone and day — `chest.locale()`, `company()`, `timeZone()`, `today()` (§4.5) | 17 of 18 | 0.3.0, **fully** | the `chest` object |
| The database's `current_date` in UTC | every tool comparing with `current_date` | 0.3.0, **fully** | the Chest sets the session `TimeZone` |
| The member's own zone (§4.30) | Leave, People | 0.3.0, **fully** | `member.timeZone` |
| **Scheduled tasks** — `schedules` (§4.1) | all 18 | 0.4.0, **fully** (one ask left, §4.1) | `"schedules"` in `chest.json`, `POST /chest-schedules`, `schedules.handle`, `fakeChest().run()` |
| **The tool's own addresses** — `teamUrl()`, `publicUrl()` (§4.5) | 17 | 0.4.0, **fully** | `chest.tool.teamUrl`, `chest.tool.publicUrl` (custom domain included) |
| **The currency** — `currency()` (§4.5) | Quotes, Timesheets, Goals, Equipment | 0.4.0, **fully** | `chest.currency` |
| **Custom domains for public parts** (§4.15) | the 7 public tools | Chest, since late September (brief/08) | the owner connects `status.acme.com`; `chest.tool.publicUrl` says it |
| **Accept tomorrow's manifest keys, or version them** (§6 "Manifest") | all 18 | 0.4.0, **versioned** | `"chest": "0.4"`: a Chest refuses a later contract by name ("This tool needs a newer version of your Chest") and, up to its own, any unknown key — so proposals still live outside `chest.json` |
| **`chest check`** — "does not exist" (§9) | all 18 | 0.4.0 | `@argentic/chest-check`, the Chest's own code in WebAssembly |
| **The contract** — what migrations may create, the CSP, Next.js (§6 "Build and runtime") | all 18 | 0.4.0 | `contract/README.md`: 20 trusted extensions, the policies, "Next.js on a Chest" |
| Someone who lost access is "unknown" (§6 `member`, §4.14) | Equipment, Goals | 0.4.0, **fully** | lookup's `status: "no_access"` with the name |
| `language`/`timeZone` in `member.updated` (§6) | tools caching words or hours | 0.4.0, **fully** | `MemberChange` |
| `stat` without `sha256` (§6 `files`) | Expenses | 0.4.0, **fully** | `FileObject.sha256` |
| A fake that receives uploads and serves links (§6 `files`) | News, Expenses, every tool with uploads | 0.4.0, **fully** | the fake's front on its own origin, content-sniffed |
| OCR / AI on a stored file (§4.16) | Expenses | 0.3.0, **partly** | `ai.chat` takes images in content parts; the tool sends the bytes |
| Erasure with a deadline and an acknowledgment | all 18 | 0.2; kept | `member.erased`, `acknowledgeErasure` |

### Now official — dropped from the gap list and from `sdk/`

- `schedules` as the studio built it (`/chest-jobs/<name>`, `Chest-Job
  v1`, `Run.timeZone`, `parseCron`/`nextRun`/`describeCron`/`checkSchedules`,
  `fakeChest({schedules})`, the studio's `chest.run()`) → 0.4.1's
  `schedules` (the cron helpers went with it: no tool used them; the
  harness keeps its own for its page).
- `chest.currency` (EUR when unset), `chest.teamUrl`, `chest.publicUrl`
  (null outside a Chest) → 0.4.1's `chest.currency`, `chest.tool.teamUrl`,
  `chest.tool.publicUrl`, which throw outside a Chest like the rest.
- The `network` key and its proxy → 0.4's `"network"` (the Chest's egress
  proxy; `"*"` for any host). The studio keeps only its fake (0.4.1's fake
  has none).
- The fake's own links and uploads, `fakeChest({origin})`, and `files.url`
  / `uploadUrl` accepting `http://localhost` links → 0.4.1's fake front on
  its own origin and `chestLink`.
- `fakeChest({chest: {currency, publicUrl}})` set only when named →
  0.4.1's `chest` option with its defaults; `former`'s `erased: true` →
  `status: "erased"`.
- One signature routine per module → `signed.ts`: the studio's
  `Chest-Mail`, `Chest-Check` and `Chest-Webhooks` are channels on it
  (`sdk/client/studio/signed.ts`).
- `scripts/check-manifest.mjs` judging `chest.json` → `chest check`
  (`scripts/chest-check.mjs` runs it on one tool); the script now checks
  only `chest.proposals.json` and the studio's own rules.
- Earlier: `member.locale`, `chest.company()`/`locale()`/`timeZone()`/
  `today()`, `member.timeZone` from `zoneinfo`, the database session's
  zone, AI through the Chest (0.3.0).

## 3. What works well — keep it

- **`member(request)` and the signed assertion.** One function, no
  session, no user table; roles given by the admin. Every tool's access
  rules are a few lines (`lib/access.ts`). 0.3.0 added the two fields every
  page needed without changing the pattern.
- **One contract, one checker, from the Chest's own code** (0.4.0):
  `contract/README.md` rendered from `contract.json`, and `chest check`
  running the code a Chest runs. The studio's own manifest checker guessed
  half of these rules ("assumed"); it now checks only what the contract
  cannot know (our proposals).
- **Schedules as the studio hoped, and better** (0.4.0): the Chest calls
  the tool, the owner approves each schedule in words, at least once with
  the same id, one run in flight, a missed time once — and one route, a
  `seen` store shared with events, "Run now" and an agents' API.
- **One signature mechanism** (`signed.ts`): events and runs are channels
  of one scheme under keys of their own; the studio's mail, checks and
  webhooks now ride on it instead of copies.
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
- **`testing`**: `fakeChest`, `withMember`, `emit`, `run`, a
  deterministic fake AI with `cap: 0` and `unavailable` to test both
  paths, and (0.4.0) a front that serves links and takes uploads with the
  Chest's own checks — what the studio's fake had played by itself.
- **Errors that are types**: every tool degrades the same way.

## 4. What the 18 tools still need beyond 0.4.1

One section per gap. For each: the tools that need it and the features
that depend on it (from their code), what the studio built in `sdk/`
(`0.4.1-studio.2`, `sdk/client/studio/`; details, tests and fakes in
`sdk/README.md` under "Studio proposals (not in 0.4.1)"), and the design
notes and limits recorded when it was built. §4.1 and §4.5 record what
0.4.x made official. Counts come from `chest.proposals.json` and `@argentic/chest-sdk/…`
imports in each tool's `lib/` and `app/` (2026-09-30).

### 4.1 Scheduled tasks — official in 0.4.0; what remains

- **Needed by all 18**, and now given by 0.4.x (§2): `"schedules"` in
  `chest.json`, `POST /chest-schedules` signed `Chest-Schedule`,
  `schedules.handle(request, handlers, {seen})`, `fakeChest().run()`.
  Features that stopped without it: Tasks' weekday digest and 15-minute
  mail retry (`morning`, `mail`); Leave's reminders to approvers; News'
  scheduled posts and weekly digest; Booking's reminders, cleanup and
  calendar refresh; Hiring's retention purge and outbox; Status's
  automatic updates; Quotes' daily badges, follow-ups and monthly archive;
  Expenses' monthly reminder and cleanup; Equipment's Intune sync and
  weekly report; Goals' check-in reminder; Timesheets' Friday reminder;
  Wiki's review reminders; Polls' closing pass; Forms' bell and cleanup;
  Support's late events and cleanup; Clients', People's and Rooms'
  morning or quarter-hour passes.
- **The studio's proposal went** (`sdk/` 0.4.1-studio.N): its
  `/chest-jobs/<name>`, `Chest-Job v1`, `Run.timeZone`, cron helpers and
  fake. 0.4.1's design is the one the studio proposed (the platform calls
  the tool, the owner approves each schedule in words, at least once, one
  run in flight, a missed time once, "Run now"), with three differences
  the tools adopt: one route for every schedule (no name in the path), no
  zone in the run (it is `chest.timeZone`), and runs remembered by the
  tool's `seen`. Migration per tool: the manifest key moves from
  `chest.proposals.json` to `chest.json`, `app/chest-jobs/[name]/route.ts`
  becomes `app/chest-schedules/route.ts`, `run.timeZone` (7 tools) becomes
  `chest.timeZone`.
- **What remains**: a schedule per member's zone ("08:00 wherever each one
  is") — 0.4.1's README answers it with the pattern the studio had
  written down (run hourly, pick the members whose 08:00 it is), which is
  enough; nothing else is asked. The cron helpers a page needs to *say*
  when a schedule runs ("next: Monday 07:30") are not in the SDK; the
  Chest's own overview says it, so a tool does not need them.

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
  `transactional` or read the person's preference. 0.4.1 has no mail,
  though its README already says "a notification or an email to another
  member is written in *their* language (`members.get(id).language`)".
- **Working copy**: `sdk/client/studio/mail.ts` —
  `mail.send({to, cc, subject, text, html, mailbox, thread, fromName,
  replyTo, inReplyTo, references, attachments, key, transactional})`
  (a member is a recipient by id, `{member}`: no `members.email` needed),
  `status(id)`, `mailboxAddress(name)`, `available() → {ok, reason,
  remainingToday}`, `preference(memberId)`, `handle(request, {message,
  bounce}, {seen})` on `POST /chest-mail` (signed `Chest-Mail`, a channel
  of 0.4.1's `signed.ts`), `threadAddress`, `threadOf`;
  `fakeChest({mail, delivery})`, `chest.outbox`, `chest.receive()`,
  `chest.bounce()`, `chest.held`; `sdk/client/studio/test/mail.test.ts`.
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
  - *One preference per person*: `"all" | "digest" | "none"`, read with
    `mail.preference(memberId)` (until 0.3.1-studio a field of `Member`,
    which 0.4.1's members module does not read), applied by the Chest
    inside `send`; `transactional: true`
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
- **Working copy**: `sdk/client/studio/calendar.ts` — `put({key, members,
  title, start, end | days, location?, path?, busy?, private?})`,
  `putMany(events) → PutResult[]` (each event answered on its own:
  `{ok: true, …}` or `{ok: false, index, key, reason}`), `remove`, `list`,
  `ics` for a file to download; the Chest's checks and feed writer in
  `calendar-rules.ts` (not published: the fake uses them);
  `fakeChest({calendar})`, `chest.feed(member)`, the fake front's
  `/_chest/calendar/<secret>.ics`; `calendar.test.ts` (RFC 5545 folding,
  escaping, UTC form, exclusive `DTEND`, per-language titles, ETag).
- **Decisions**: titles per language given by the tool, the Chest picks
  each reader's; `path` under `/chest`, never a URL; personal feeds only;
  a random secret, stored hashed, replaceable; UID = hash(tool,
  key)@domain; `DTSTAMP` = last change, so an unchanged feed answers 304.
  `putMany` went from all-or-nothing (when it came, in 0.3.0-studio.15) to
  one result per event (0.3.0-studio.16, commit `8a25574`): Rooms, Clients and Tasks each re-sent a refused batch one
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
- **0.4.1**: `events` delivers the four member-lifecycle types only
  (`client/src/events.ts`, `ChestEvent`), and its manifest's `receives` is
  `["member.*"]` exactly (`contract/README.md`); `handle` answers 204 to a
  type it does not know, so a tool on 0.4.1 alone silently ignores a tool
  event rather than fail — good for compatibility, and it means receivers
  need the proposal to see them.
- **Working copy**: `events.publish(type, data, {key, occurredAt})`,
  `events.handle(…, {tools})` with `ToolEvent`, `events.receivers(type) →
  string[]`, `occurredAtOf`; `fakeChest({emits, receivers, linked})`,
  `chest.published`, `chest.deliver()`; `sdk/client/studio/test/events.test.ts`.
  The studio's `events.handle` reads a tool event (or a group event) and
  hands every member event to 0.4.1's `handle`, unchanged.
- **Design choices**: one route for member and tool events; a type is
  namespaced by its publisher (a tool cannot impersonate another); the
  admin links publisher and receiver (no tool chooses where its data
  goes); data carries member ids, never names; at least once, with `seen`.
  **`occurredAt`** given by the publisher (a `Date` or an ISO instant with
  a zone, at most 24 hours back and one minute ahead) because Goals counts
  solved tickets and done cards per cycle by the event's time, and
  Support and Tasks re-publish late from a schedule
  (`helpdesk/lib/ticket-events.ts`, `occurredAtFor`): a ticket solved at
  23:55 and told at 00:10 fell in the next cycle. A tool event's envelope
  is a member event's plus one key, `source`: 0.4.1's `verify` refuses
  that shape and its `handle` answers 204, so an official SDK never
  misreads one as a member event. **`receivers(type)`**
  because Forms' Settings could only ask "is Clients installed?", not "is
  it linked?" (`forms/lib/linked.ts`) — a list of tool names, only for the
  tool's own types.
- **Manifest and approval** (`chest.proposals.json`; `chest.json` keeps
  0.4's `"receives": ["member.*"]`): `"emits": ["leave.approved"]`,
  `"receives": ["leave.approved"]` — "Tells other tools when a leave is
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

### 4.5 Other tools' addresses — `chest.tools`

0.4.x gives a tool its own addresses (`chest.tool.teamUrl`,
`chest.tool.publicUrl`) and the currency (§2): the studio's `teamUrl()`,
`publicUrl()` and `currency()` went (17 tools wrote links from their own
address; 4 read the currency). What remains is **the other tools'
addresses**:

- **Needed by 6 tools** (`chest.toolUrl` / `chest.toolLink` in 0.3.1-studio):
  Clients links to a form's answer and a booking (`lib/page-data.ts`,
  `lib/from-booking.ts`), Timesheets to Quotes (`lib/handoff.ts`),
  Booking, Forms (`lib/linked.ts`), Support to a form (`lib/forms-in.ts`,
  which used to guess `forms-chest.<chest>` from its own host), Quotes to
  Timesheets.
- **Working copy, reshaped on 0.4.1's pattern**: `chest.tools.get(name)` →
  `{teamUrl, publicUrl} | null` — exactly `chest.tool`'s shape, for
  another tool — and `chest.tools.link(name, path, {surface})`; from
  `CHEST_TOOL_URLS` (`{"forms": {"teamUrl", "publicUrl"}}`), origins read
  as 0.4.1 reads `CHEST_TEAM_URL` (https, no path); an entry that is not
  one is dropped alone; `link` refuses anything the Chest's front would.
  This tool's own name answers `chest.tool`. Tests in
  `sdk/client/studio/test/tool-urls.test.ts`.
- **Design notes**: an environment variable, as 0.4.1 chose for its own
  addresses: no request, restarted when changed. Not a capability:
  nothing here is more than what the portal shows members. Staleness is
  harmless both ways (a missing tool is no link; a removed one is a 404 on
  its host). Tools store the other tool's name and a path, never an
  absolute URL — 0.4.1 says the same of its own origins ("they change").
- **Still missing**: the other tool's title in the member's language
  ("Open in Forms"), and whether *this member* has that tool.

### 4.6 The look — `chest.theme()`

- **Needed by all 18**: each tool calls `chest.theme()` at render
  (the owner's request: keep each tool's identity, one theme for all, or
  the company's brand, overridable per tool; `reports/04-themes-and-kit.md`).
- **Working copy**: `chest.theme()` in `sdk/client/studio/chest.ts`
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
  `lib/careers.ts`, `lib/public-feed.ts`), through `files.publicPath`. 0.4.1's `files` is
  private only, and a `files.url()` link is for "a member's browser, never
  a public page" (`client/src/files.ts`).
- **Working copy**: `files.publicUploadUrl(name, {types, maxSize,
  expiresUnclaimedAfter})` (until 0.3.1-studio `uploadUrl(name, {public:
  true})`: a public upload's address is not the team host's, which 0.4.1's
  `uploadUrl` checks, so it is a function of its own), `files.claim(ref)`,
  `files.publicPath(name, {version})` (until 0.4.1-studio.2 `publicUrl`:
  it is a path, not an origin's URL); `fakeChest({storage: {publicUploads,
  publicFiles}})`, the fake front's `/_chest/upload/<token>` (with 0.4.1's
  content checks) and `/_chest/public/<name>`; tests in
  `sdk/client/studio/test/testing.test.ts`. Built from the Chest's own
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
  streams it through `files.get` today).

### 4.8 The public host's visitors — `visitors`

- **Needed by 6 public tools**: Booking (`lib/guard.ts`), Forms
  (`lib/guard.ts`, `lib/session.ts`, `app/public-actions.ts`), Hiring,
  Polls (`app/p/[link]/actions.ts`), Quotes (`app/q/[secret]/page.tsx`,
  quote acceptance), Status (`lib/subscribers.ts`). Each had rebuilt a
  signed "form shown at" token, per-visitor counters, their purge, and the
  visitor's language.
- **Working copy**: `sdk/client/studio/visitors.ts` — `formToken`,
  `checkForm`, `count`, `language`, `visitor`, `address`;
  `fakeChest({visitors})`; `visitors.test.ts`.
- **Why the Chest counts**: it sees every public tool's traffic; a
  per-tool counter lets a robot spread over five tools five times the
  allowance. `language()` falls back to `chest.language` (0.3.0).
- **The visitor's address must come from the front — corrected
  2026-10-05.** Every public tool, and the studio's `visitors` until
  0.4.1-studio.2, keyed visitors by the first `X-Forwarded-For` address,
  "set by the Chest's front". The contract says otherwise: toward a tool
  the front removes every `Chest-*` header and sets only
  `X-Forwarded-Proto: https` and `X-Forwarded-Host`, the client's removed
  (`reference/contract/application-contract.md`, "Front"); it adds no
  `X-Forwarded-For` (and its egress proxy adds none either, same
  document, "Relayed HTTP"). So an `X-Forwarded-For` a tool reads is the
  visitor's own: a robot writes a new one at every request and every
  per-visitor limit falls. **Proposal**: the front sets
  `Chest-Visitor-Address` — the address of the connection it accepted —
  on the public host's requests; being a `Chest-*` header, no client can
  send it (the front removes those first). `visitors.address()` reads it
  and nothing else; without it (every Chest today) it is null,
  `visitor()` is `"unknown"`, and `count()` counts such visitors together:
  the per-hour ceiling for everyone holds, the per-visitor one becomes
  global. The 7 public tools' own copies (`lib/public-origin.ts`) must
  change the same way.
- **Approval**: none new. **Risks**: shared addresses behind one NAT (the
  owner may raise the ceiling; tools say "try again in an hour").

### 4.9 Notices to outside addresses — `webhooks`

- **Needed by 3 tools**: Status (subscribers' Slack, Teams and webhooks —
  Statuspage's), Forms (answers to Zapier, Make, a sheet, Slack —
  Typeform's and Tally's), Support (a new ticket to a team's channel,
  `lib/notices.ts`). 0.4's `"network": ["*"]` is not an answer: a customer's
  address is unknown when the manifest is written, and it would make each
  tool a way into the company's own network (SSRF).
- **Working copy**: `sdk/client/studio/webhooks.ts` — `add`, `remove`,
  `list`, `enable`, `rotateSecret`, `send`, `journal`, `available()`,
  `handle` of `webhook.disabled` on `POST /chest-webhooks`, `checkUrl` for
  a form; the Chest's own rules (`isPublicAddress`, `format`, `sign`,
  `verifySignature`) in `webhooks-rules.ts`, not published, used by the
  fake; `fakeChest({webhooks})`; `webhooks.test.ts`.
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
  answered in time. A tool cannot know it: no process between requests (a
  schedule runs every 15 minutes at best), and probing the company's own
  addresses, unknown when the manifest is written, would take 0.4's
  `"network": ["*"]` — a permission to reach anything.
- **Working copy**: `sdk/client/studio/checks.ts` — `configure`, `list`,
  `handle`/`verify` of signed results on `POST /chest-checks`;
  `fakeChest({checks})`, `chest.check()`; `checks.test.ts`.
- **Design point**: the manifest declares the permission
  (`"checks": {"max": 10}`); the tool's admin types the addresses; the
  owner sees each. "Asks the Chest to check up to 10 web addresses of
  yours, as often as every minute". GET only, https, no private addresses.
- **Still missing**: a heartbeat address (silence means down), a keyword
  expected in the page, history kept by the Chest.

### 4.11 Seeing the Chest's groups — `groups` read

- **Needed by 7 tools open to everyone** (`"groups": "read"` in their
  `chest.proposals.json`, counted 2026-10-05): News (post to a team),
  Polls (ask Sales only), Wiki (a space's rights by group), Rooms (rooms
  reserved to a group), Goals (a team's objectives, `lib/teams.ts`), Tasks
  and Leave (a board or a team calendar shared with a group). 0.4.1's
  `members.groups.list()` gives "the groups that give the tool; never the
  others" (`README.md`, "`members`") — nothing when the tool is open to
  everyone, which is exactly how these tools are installed.
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
  0.3.0's and 0.4.1's `handle` answer 204 to an unknown type, which removes
  that hazard; the studio's `handle` reads group events before handing
  member events to 0.4.1's.
- **Still missing**: group deltas (`{added, removed}`) so a bell item can
  be withdrawn from someone who left a group; letting the owner hide a
  sensitive group from tools.

### 4.12 Notify everyone — `notifications.broadcast`

- **Needed by**: Polls (a question to everyone or some groups,
  `lib/tell.ts`), Status (an incident to its editors, `lib/tell.ts`
  `tellTeam`), Forms (a team form just published, to everyone who has the
  tool, `lib/tell.ts` `opened`). News still pages by hand: it groups recipients by
  language and calls `notify` per 500 (`news/lib/tell.ts`), and 0.4.1's
  1,000 recipients an hour means a company of 1,300 cannot be told of its
  move in one go.
- **Working copy**: `notifications.broadcast({messages: {en, fr…}, path,
  key, to: {roles, groups}, except})` → `{delivered}`; the fake resolves
  recipients and picks each one's language; `fakeChest({broadcast:
  false})` for a tool's fallback.
- **Quota**: 30 broadcasts an hour per tool, outside the recipients-an-
  hour quota (the Chest delivers at its own pace); each member keeps 100
  items a day.
- **0.3.0 helped**: now that `members` answers each member's `language`,
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
  viewer's `language` — which 0.3.0 gave every page.

### 4.14 Members: matching addresses, when someone left

- **`members.matchEmails(emails) → {address: mbr_id}`** — Equipment
  matches Intune's devices to members by name today (`lib/intune.ts`):
  wrong for two Léa Dubois or a name changed after a marriage. Only
  members who have the tool are matched; 200 a call, 5,000 distinct
  addresses a day (a tool cannot walk a list of guesses). Test in
  `testing.test.ts`.
- **`members.leftAt(ids)`** (was `FormerMember.leftAt`) — Expenses keeps
  a former member's claims out of the transfer file and needs the date to
  know which final pay slip (`lib/payments.ts`, `lib/people.ts`);
  Timesheets shows "left on …" (`app/chest/team/[member]/page.tsx`).
  0.4.1's `FormerMember` is `{id, name, status}`. The natural shape is a
  `left_at` in lookup's former entries; the studio cannot add it without
  changing 0.4.1's `lookup`, so it is a call of its own until the Chest's
  members API carries it. Kept after an erasure (a date names nobody).
- **The person's email preference** — `mail.preference(id)`, see §4.2.
- **Now official** (0.4.0): `status: "no_access"` for someone who lost
  access but stayed (Equipment's "Léa holds 3 laptops", Goals' "needs a
  new owner"), and `language`/`timeZone` in `member.updated`'s `changed`.
  The tools' people helpers must render the new status (they read
  `former`/`erased` only today).
- **Wishes, not built**: `list({admin: true})`; a `member.added` /
  `access.granted` event (People and Leave notice a newcomer); a manager
  relation (Leave, Goals, People).

### 4.15 Platform only — beyond the bell (custom domains: done)

No SDK change fixes these; the Chest must.

- **Web push and an email digest of the bell.** Leave and Expenses
  approvals, Tasks assignments, News' Important posts wait in a bell
  nobody opens. 0.4.1 says it plainly: notifications are "inside the
  Chest only — no email, no push to a phone" (`README.md`,
  "`notifications`"). The Chest's own service worker (PWA) and a daily
  digest of unread items (needs §4.2) would carry every tool's keyed items
  further with no tool change; an `urgent` flag is the only SDK part.
- **Custom domains for public hosts — exist** (brief/08: since late
  September). The owner connects `status.acme.com` to a tool's public
  part, the Chest serves its certificate, and `chest.tool.publicUrl` says
  it (0.4.0). The "custom domains" blocker of Status, Booking, Support and
  Hiring is gone; their "no mail" one stays (§4.2).

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

## 5. Differences to reconcile — studio proposal vs 0.4.1

Where 0.4.x chose a shape for something the studio had built, **the
studio adopts the official shape**, and the proposals that remain are
re-expressed on 0.4.1's patterns in `0.4.1-studio.2`. How they sit: the
official 0.4.1 is kept byte for byte (`diff -r reference/sdk sdk`, `check/`
aside, shows only `client/studio/`, `tsconfig.studio.json`,
`scripts/check-studio-package.mjs`, the package metadata and the appended
"Studio proposals" sections of `README.md` and `AGENTS.md`); each studio
module that extends an official one re-exports it unchanged (a test checks
every name is the official value) and adds its own; 0.4.1's 69 tests run
unchanged beside the studio's 75. What changes for the tools the day they
are re-vendored (the mechanical list for migrators is kept with the lead,
not in the repository):

| Topic | Studio (`0.3.1-studio.1`) | Official 0.4.1 | Studio adopts (`0.4.1-studio.2`) |
|---|---|---|---|
| Manifest | `"version": 2`; proposals in `chest.proposals.json` | `"chest": "0.4"`; a Chest refuses a later contract and any unknown key (`contract/README.md`, "Versions") | the official key; proposals stay in `chest.proposals.json` (`mail`, `calendar`, `groups`, `emits`, `receives` of other tools and `group.*`, `files.publicUploads`/`publicFiles`, `checks`, `webhooks`, `translations`), checked by `scripts/check-manifest.mjs`; `chest.json` judged by `chest check` |
| Schedules | `chest.proposals.json`, `POST /chest-jobs/<name>`, `Chest-Job v1`, `Run.timeZone`, cron helpers, `fakeChest({schedules})` | `chest.json` `"schedules"`, `POST /chest-schedules`, `Chest-Schedule v1`, `{id, name, scheduledAt, attempt}`, `handle(…, {seen})`, `fakeChest().run()` | the official module, unchanged; the studio's went (§4.1) |
| The tool's own addresses, currency | `chest.teamUrl`, `chest.publicUrl` (null outside a Chest), `chest.currency` (EUR) — never throw | `chest.tool.teamUrl`, `chest.tool.publicUrl`, `chest.currency` — throw `not_in_chest` | the official members; the studio's went |
| Other tools' addresses | `chest.toolUrl(name, {surface})`, `chest.toolLink(…)`; `CHEST_TOOL_URLS` `{team, public}`, http on localhost allowed | — | `chest.tools.get(name)` → `{teamUrl, publicUrl}` (`chest.tool`'s shape), `chest.tools.link(…)`; `{teamUrl, publicUrl}`, https origins only (§4.5) |
| Former members | `{id, name, status: "former" \| "erased", leftAt?}` | `{id, name, status: "no_access" \| "former" \| "erased"}` | the official type, unchanged; when someone left is a call of its own, `members.leftAt(ids)` (adding a field would change 0.4.1's `lookup`) |
| A member's email preference | `Member.mailPreference`, answered by `members.*` as `mail_pref` | — (no mail) | `mail.preference(memberId)`: mail's, asked of mail; `Member` stays 0.4.1's |
| Public uploads | `files.uploadUrl(name, {public: true})` | `uploadUrl` checks its answer is on the team host (`chestLink`) | `files.publicUploadUrl(name, {…})`, a function of its own; 0.4.1's `uploadUrl` untouched |
| Local links | `files.url`/`uploadUrl` accept `http://localhost`, `fakeChest({origin})` | links on `CHEST_API`'s origin only, where the fake serves them | the official rule; the harness must serve the fake's links itself (§9) |
| Signed deliveries | one HS256 routine per module (`Chest-Job`, `Chest-Mail`, `Chest-Check`, `Chest-Webhooks`) | one `signed.ts` (`Channel`, `delivery`, `sign`, `Seen`) for `Chest-Event`, `Chest-Schedule` | the studio's channels are `Channel`s on `signed.ts`; `mail`, `checks`, `webhooks` `handle(…, {seen})` like 0.4.1's |
| Event handling | `events.handle` was 0.3.0's file, edited (tool and group events) | member events only | `events.handle` is the studio's: a member event is handed to 0.4.1's `handle` unchanged; tool and group events to the studio's handlers |
| Fake Chest | 0.3.0's file, edited in place (front, links, uploads, proposals) | its own front on its own origin, `run()`, `chest` options | 0.4.1's fake runs unchanged behind the studio's server, which answers the proposals' routes and relays the rest; two answers are completed, only for what the studio's options add (groups that do not give the tool, `chest.former` changed at run time) |
| Network | proposed: `"network"` and the egress proxy, a fake | official: `"network"`, the proxy | the official key; the studio keeps its fake (`fakeChest({network})`, `"*"` too) |
| The assertion | 0.3.0's claims | 0.4.1's (the same) | unchanged; a test's member may leave out `language` and `timeZone` (`FakeMember`), a thin layer over 0.4.1's `signAssertion` |

## 6. Friction in what exists (0.4.1)

### `chest check`
- **It judges the whole Git repository a folder belongs to, not the
  folder.** `check/src/cli.ts` runs `git rev-parse --show-toplevel`, then
  `git add --all -- .` and `git archive` of that root's tree (lines 49–55,
  read in `reference/sdk/check/src/cli.ts`). In a monorepo — or any
  repository holding more than the tool — `chest check tools/private/tasks`
  archives the studio's whole repository: it fails with `spawnSync git
  ENOBUFS` (the archive exceeds the output buffer, `maxArchive + 1`) or
  judges the wrong tree (the root has no `chest.json`). Verified by the
  lead on 5 October 2026 on this repository. It should judge the folder it
  is given: archive `git ls-files` of that folder, as the Chest would
  receive the tool once it is its own repository. The studio works around
  it with `scripts/chest-check.mjs`, which copies the files Git tracks or
  would add under the tool's folder into a fresh repository and runs the
  official checker there, unchanged.
- **Under Node 22 its WASI run crashes; the engines say `node >=22`.**
  Under Node 22.22, the checker's WebAssembly run ends in a segmentation
  fault, nondeterministically, on archives of a few MB (Tasks: 9.8 MB
  compressed, mostly the screenshots of its docs); under Node 24.21, the
  Chest's pinned image, it works. Verified by the lead on 5 October 2026.
  Both `package.json` (`@argentic/chest-sdk` and `check/`) say `"engines":
  {"node": ">=22"}`, and the README asks nothing more: the `engines`
  field of `check/` should say `>=24`, or the README should name the Node
  the checker is tested on. `scripts/chest-check.mjs` runs it with Node 24
  (`/opt/node24`, or `CHEST_NODE`).

### `member` and `members`
- **When someone left is not said** (`FormerMember` has no date): §4.14.
- **Matching names.** Every importer (Tasks, Leave, People, Timesheets,
  Expenses) folds accents, case and word order to match spreadsheet names
  to members. Wish: `members.match(names)`.
- **Listing everyone** for "who has not read this post" (People reads up
  to ten pages a view). Wish: an ETag on `/members` or `changedSince`.

### `chest`
- Good as designed, and 0.4.0 completed it (currency, the tool's
  addresses). Two notes: the organization's **name only** — a public page
  or an invoice may also want the company's logo, which Hiring (careers
  page, `lib/public-feed.ts`) and Quotes (documents, `lib/company.ts`)
  each ask their admin to upload again; and `not_in_chest` means a
  development server needs the six variables set, with https origins for
  `CHEST_TEAM_URL` and `CHEST_PUBLIC_URL` (a local harness on
  `http://localhost` must give placeholders, and its links point
  elsewhere — §9).

### `files`
- **Links for a local harness.** 0.4.1 takes a link on `CHEST_API`'s own
  origin, where its fake serves them — enough for tests, but a browser on
  a local harness's page loads them from another origin, which the tool's
  own CSP (`img-src 'self'`) blocks. The studio dropped its
  `http://localhost` exception to keep 0.4.1's rule; a `chest dev` from
  the Chest's team would settle how a local front serves them.
- **HEIC** photos get no thumbnail (thumbnails are JPEG, PNG, GIF, WebP).
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

### Manifest (`contract/README.md`)
- Published, rendered from the Chest's code, checked by `chest check`:
  the "assumed" rules of earlier drafts are gone (roles' grammar is
  `^[a-z][a-z0-9-]{0,47}$`, no `_`). Unknown keys stay refused, so every
  tool keeps its proposals in `chest.proposals.json`; `title` and
  `description` stay in one language (§4.13).

### Build and runtime
- Next.js fits, and the contract now says how ("Next.js on a Chest": the
  nonce policy in `proxy.ts`, `next build --webpack` with one worker,
  `images: {unoptimized: true}`, `/_next/static/` as `build.static`). The
  memory at rest is the open question (brief/08: Tasks ~132 MiB against
  the Perseus starter's ~76 MiB, measured by the owner's side).
- The CSP and inline styles (`style-src-attr 'unsafe-inline'`), the
  extensions a migration may create (`pg_trgm`, `unaccent`, `btree_gist`
  among the 20) — answered by the contract.
- Next.js traps met by several builders: Node and browsers format dates
  differently (hydration — format on the server, as the contract now
  says); a plain function from a `"use client"` file cannot be called by a
  server page (said too); libraries that inject `<style>` are blocked by
  the nonce policy; Next overwrites `Vary`.

## 7. Public-facing tools

Seven tools have a public part (Booking, Forms, Support, Hiring, Polls,
Quotes, Status). The public host works — one tool, two hosts, the team's
part behind `/chest`, "the public host has no member" (`AGENTS.md`) — but
each public tool rebuilt the same things, and each is a platform concern:

1. **Abuse on forms** — a honeypot, a signed "form shown at" time,
   per-visitor counters. The tools keyed visitors by the first
   `X-Forwarded-For` address, assuming the front set it; the contract
   shows it does not (it sets only `X-Forwarded-Proto` and
   `X-Forwarded-Host` and removes the client's `Chest-*` headers), so a
   visitor forges it. The `visitors` proposal now asks the front for
   `Chest-Visitor-Address` and reads nothing else (§4.8).
2. **Visitors' language** — the same `/lang/<code>` switch, cookie and
   `Accept-Language` parsing in each; 0.3.0 gave the last fallback
   (`chest.language`: "a public page before the visitor chooses",
   `README.md`, "`chest`"); `visitors.language()` does the rest.
3. **Secret links instead of accounts** — a customer follows a ticket, a
   guest moves a booking, a client accepts a quote through a link holding
   a secret (stored hashed). Right for one-off visitors; worth a helper and
   a paragraph (never logged, `Referrer-Policy`, `noindex`). Real public
   accounts are not needed by the opening store.
4. **Addresses** — the tool's public address for emails sent later and
   the company's own domain: both done (0.4.0's `chest.tool.publicUrl`,
   the Chest's custom domains; §2, §4.15).
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
  becomes a contact or a ticket, linked back with `chest.tools.link`
  (until 0.3.1-studio `chest.toolLink`).
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
  screenshots) is the specified `chest dev`. On 0.4.1 it sets the six
  variables of `chest`, lets the developer switch a member's `timeZone`,
  and must serve the fake's links on its own origin (§6 `files`).
- **`chest check` exists** (0.4.0), runs the Chest's own code, and is the
  judge of `chest.json`; two frictions keep it from running where the
  studio's tools live (§6). `scripts/check-manifest.mjs` now checks only
  what it cannot know: `chest.proposals.json` and the studio's own rules.
- **Tests without a database server**: PGlite with `pglite-socket` runs
  the tool's real SQL; tools also run their tests on PostgreSQL. The
  tests must set the session `TimeZone` as the Chest does, or
  `current_date` differs between the test and production.
- **`AGENTS.md` is the right idea**: a short path, the rules, a table of
  symptoms and causes. Ours (`sdk/AGENTS.md`, `lab/BUILDING.md`) grew the
  same way. What an agent still lacks to build a correct tool on the first
  try: `chest dev`. The official starter (`reference/perseus-starter/`,
  Hono, React islands, Vite) answers "a starter per stack" for one stack;
  the studio's pack is checked to work in it (a Vite SSR build in
  `sdk/scripts/check-studio-package.mjs`).
- **Accessibility**: `lab/chest-dev/audit.mjs` (axe-core, WCAG 2.1 AA,
  every screen, phone and desktop, light and dark) runs in every tool's
  verification (`PROGRESS.md`). `chest check` could run it.

## 10. Priorities

**The Chest's order, decided by the owner** (brief/08, 5 October 2026):
groups read and broadcast, then events between tools, then the calendar
feed, then web push, then mail. The table follows it for what the owner
ranked, then the rest by the studio's own measure: **P1** blocks
cancelling a SaaS category or stops a feature in most tools; **P2** needed
by several tools or one category's main feature; **P3** a single tool's
refinement. Tool counts from `chest.proposals.json` and SDK imports
(2026-09-30; groups read re-counted on 2026-10-05).

| Order | Gap (§) | Tools that need it | Kind | Effort | Priority | Why |
|---|---|---|---|---|---|---|
| 1 | `groups` read (§4.11) | 7 (News, Polls, Wiki, Rooms, Goals, Tasks, Leave) | Chest + SDK (built) | S | **P1** | "post to the Sales team", "ask only Tech" do not work in the default setup (open to everyone) |
| 1 | `notifications.broadcast` (§4.12) | Polls, Status, Forms (+ News by hand) | Chest + SDK (built) | S | P2 | "tell everyone" stops at 1,000 people an hour |
| 2 | Events between tools (§4.4) | 14 | Chest + SDK (built) | M | **P1** | the suite is the pitch; 12 publishers, 11 receivers |
| 3 | Calendar feed (§4.3) | 8 | Chest + SDK (built) | M | **P1** | Rooms, Leave, Booking, Hiring cannot replace their SaaS without it |
| 4 | Web push and a digest of the bell (§4.15) | every tool with approvals | Chest only | M | **P1** | approvals wait in a bell nobody opens |
| 5 | `mail` send, availability, preference (§4.2) | 17 (all but Clients) | Chest + SDK (built) | L | **P1** | the only way to reach customers, candidates, guests, and members who never open the Chest |
| 5 | `mail` receive (§4.2) | Support, Hiring | Chest + SDK (built) | L | **P1** | without it Support is a contact form, not a helpdesk |
| — | Public uploads and files, `claim` (§4.7) | Forms, Support, Hiring | Chest + SDK (from the spec) | M | **P1** | a candidate cannot send a CV |
| — | `translations` of the tile (§4.13) | 17 | contract | S | P2 | French members see English tiles |
| — | `chest.theme()` (§4.6) | all 18 | Chest + SDK (built) | M | P2 | the owner's themes; each tool falls back to its own look |
| — | `visitors` (§4.8) | 6 public tools | Chest + SDK (built) | S | P2 | each tool rebuilds a guard; robots spread across tools |
| — | `webhooks` (§4.9) | Status, Forms, Support | Chest + SDK (built) | M | P2 | Statuspage's and Tally's integrations |
| — | `checks` (§4.10) | Status | Chest + SDK (built) | M | P2 | a status page that cannot see the site is down |
| — | Free/busy connector (§4.3) | Booking, Hiring | Chest + SDK (not built) | L | P2 | double-booking against a host's own calendar |
| — | `chest check` judges the folder, not its repository; engines say Node 24 (§6) | every tool in a monorepo | SDK (check) | S | P2 | the studio's 18 tools cannot be checked where they live |
| — | `chest.tools` (§4.5) | 6 | environment (built) | S | P3 | links between tools |
| — | `members.leftAt` (§4.14) | Expenses, Timesheets | call (built) | S | P3 | the right final pay slip |
| — | `members.matchEmails` (§4.14) | Equipment | call (built) | S | P3 | Intune devices matched by address, not name |

**What the owner's order costs the store, said plainly.** Mail is last in
the Chest's order and is the gap that reaches furthest in the tools: 17
send (13 ask `mail.available()` first and say "Emails will be sent once
your Chest can send them"), and Support and Hiring receive. Until it
ships, the store's tools that face customers (Support, Hiring, Booking,
Quotes, Status, Forms) work inside the Chest and on their public pages
but cannot write to anyone outside; each says so on its page. Groups read
and broadcast first is right for the tools open to everyone (seven) and
cheap (S); web push before mail serves members, not customers.

**Now official — removed from this table**: `schedules` (was P1, all 18),
the tool's own addresses (P1, 17), a versioned manifest (P1, all 18),
custom domains (P1, 7 public tools), `chest.currency` (P2, 4),
`language`/`timeZone` in `member.updated` (P3), `no_access` in lookup
(§4.14 wish).

Deliberately not proposed: WebSockets and background processes (polling
every 20–45 s and schedules covered every case), public accounts (no
opening-store tool needs them). Outbound network per tool is now 0.4's
`"network"`; the studio's webhooks and checks stay, because a customer's
addresses are unknown when the manifest is written.

## Appendix — where the earlier sections went

| Earlier § | Now |
|---|---|
| 4.1 schedules | §4.1 — official in 0.4.0 |
| 4.2 mail, 4.13 mail inbound, 4.19 keys, 4.24 mail preference, 4.28 `available()`, 4.29 README corrections | §4.2 |
| 4.3 public uploads and files | §4.7 |
| 4.4 events, 4.25 `occurredAt`, 4.26 `receivers` | §4.4 |
| 4.5 `chest` settings | §2 (organization, zone, language, today, currency, the tool's addresses — official) and §4.5 (other tools' addresses) |
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
| 4.18 `toolUrl` | §4.5 (`chest.tools`) |
| 4.20 `fakeChest({tool, network})`, `clearCaches` | §5 (fake Chest and network rows) |
| 4.21 `matchEmails`, 4.23 `leftAt` | §4.14 |
| 4.30 member time zone | §2 — now official |
