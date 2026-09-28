# The SDK report — what building the store taught us

_Draft, written as the tools are built (brief/06); consolidated at the end.
The proof is the SDK working copy `sdk/` (its diff from `387ae90`, published
0.2.0) and the tools that use it. Each proposal below exists there: typed,
tested, faked in `testing`, documented in `sdk/README.md` (sections marked
**Proposal (studio)**), and used by at least one tool._

## 1. Summary — the changes that would matter most

_(to be ordered once more tools are built; the evidence so far)_

1. **`member.locale`** — every tool needs the member's language; a claim and
   a field, nothing else. Built, used by every tool.
2. **Scheduled tasks** — reminders, digests and badges that stay true
   overnight are impossible without them. Built (`schedules`), used by Tasks.
3. **Mail** — Support, Booking and Hiring cannot talk to the outside world
   without it. Built (`mail`), for Support.
4. **Proposal keys in the manifest** — the Chest refuses unknown keys, so a
   tool cannot even be installed with a key of tomorrow: we keep them in
   `chest.proposals.json`. The Chest should accept (and ignore, with a
   warning) keys it does not know yet, or version them.
5. **A local Chest (`chest dev`)** — our harness `lab/chest-dev` shows it is
   small and changes everything for builders and agents.

## 2. What works well — keep it

- **`member(request)` and the signed assertion.** One function, no session
  to manage, no user table in the tool; roles given by the admin. Every
  tool's access rules came down to a few lines (`lib/access.ts`).
- **Member ids everywhere, names at render (`members.lookup`).** Renames,
  departures and erasures cost nothing: "(former member)" comes for free.
- **Browser → Chest uploads (`files.uploadUrl`) and short signed links.**
  The tool never carries the bytes; the pattern (authorise, browser PUT,
  `stat`, record) is clear and safe. Tasks' attachments were an hour's work.
- **Notifications keyed by the thing they are about** (`key`, `withdraw`):
  exactly what a task, a request or a ticket needs; badges as true counts.
- **Lifecycle events with erasure acknowledgment.** GDPR erasure as part of
  the platform is a selling point no SaaS gives a small company.
- **`testing`**: `fakeChest`, `withMember`, `emit` made it possible to test
  rights, notifications and lifecycle with no Chest at all.
- **Errors that are types** (`CapabilityNotGranted`, `Unavailable`…): every
  tool degrades the same way.

## 3. Friction in what exists

### `member`
- **No language** — added as a proposal (`locale` claim, `localeOf`,
  `locales`): English when absent. The members API should carry it too
  (done in the working copy): a tool notifies *other* members, in *their*
  language.
- **No time zone.** "Due today", "this week", a reminder at 07:30 all need
  the company's time zone; every tool hard-coded Europe/Paris. Built as
  the `chest` module (4.5), with the company's name, currency, default
  language and the tool's addresses.

### `members`
- `list` pages of 500 are fine, but a tool that shows "who can see this
  board" or "who has not read this post" lists everyone each time. A
  cached `members.all()` (or an ETag on `/members`) would save calls.

### `files`
- **`files.url` and `uploadUrl` refuse `http://` links**, so no local
  harness can serve them. The working copy accepts `http://localhost` and
  `http://127.0.0.1` (a dev affordance; production links stay https).
- **The fake Chest did not receive uploads nor serve links or photos**: a
  test could authorise an upload but never complete it. The working copy's
  `fakeChest` now plays the team host's front (`/_chest/files/upload/…`,
  links, members' photos) and `chest.upload()` plays the browser.

### `notifications`
- Clear and well bounded. Wish: a `notify` with a per-recipient body
  (each recipient's language) in one call; today a tool groups recipients
  by locale and calls once per language (`lib/notify.ts` in every tool).
  For "everyone", built as `broadcast` (4.6).

### `events`
- Fine. Wish: an event when a member's **locale** changes (`member.updated`
  with `changed: ["locale"]`), for tools that cache words.

### Manifest
- **Unknown keys refused** — see summary (4).
- **`title` and `description` are one language.** A French member sees
  "Tasks" on the tile while the tool speaks French inside (News, Leave and
  Wiki's builders each raised it). Built as a manifest proposal (4.7).
- Role identifiers' grammar is not written in the contract (we assumed
  `^[a-z][a-z0-9_-]{0,31}$`).

### Build and runtime
- Next.js fits (build ~1 min, ~150 MB at run), but `next build` needs
  `--webpack` and a type check before it; the template does it. A
  documented **starter per stack** (Next.js, plain `node:http`) would save
  every builder the same afternoon.
- The CSP: Next.js needs a nonce per response (`proxy.ts`); style
  *attributes* need `style-src-attr 'unsafe-inline'` (React's `style=`).
  Worth a paragraph in the contract.
- Extensions: `pg_trgm` and `unaccent` are "trusted" (a database owner may
  create them); the contract should say which extensions a tool may use.

## 4. Missing primitives

### 4.1 Scheduled tasks — `schedules` (built)

- **Needed by**: Tasks (weekday digest, badges true overnight), Leave
  (reminders to approvers), News (scheduled posts), Hiring (retention
  purge), Status (checks), Goals (check-in reminders)…
- **Working copy**: `sdk/client/src/schedules.ts`, `fakeChest({schedules,
  timeZone})`, `chest.run()`, `sdk/client/test/schedules.test.ts`; used by
  `tools/private/tasks` (`lib/morning.ts`, `app/chest-jobs/[name]/route.ts`).
- **API**: `schedules.handle(request, { name: run => … })` on `POST
  /chest-jobs/<name>`, signed `Chest-Job` (HS256 under HMAC("Chest-Job
  v1") of `CHEST_TOKEN`); `Run {id, name, scheduledAt, attempt, timeZone}`;
  cron helpers (`parseCron`, `nextRun` in a time zone, `describeCron`,
  `checkSchedules`).
- **Manifest**: `"schedules": [{"name": "morning", "cron": "30 7 * * 1-5"}]`.
- **Approval sentence**: "Runs by itself on a schedule: morning (weekdays
  at 07:30)".
- **Quotas**: 8 schedules, ≥ 15 min apart, 5 min per run, one in flight
  per schedule (a time is skipped, and journaled, while one runs), at least
  once (retries after 1, 5, 15 min), a missed time run once after downtime.
- **The Chest logs** each run (start, duration, status) and shows the next
  one; builders get "Run now".
- **Agents**: `/api/v1/tools/<tool>/schedules` (list, next, runs, run now).
- **Risks**: load on a small server (bounded by frequency and one in
  flight); a tool that loops (bounded by the 5 min request limit).
- **Elsewhere**: Vercel Cron (HTTP call to a path, like this), Cloudflare
  Cron Triggers, Supabase pg_cron. We chose the Vercel/Cloudflare shape
  (the platform calls the tool) over pg_cron: the tool's code runs, with
  its SDK, not SQL alone; and nothing runs in the tool's container between
  requests. Better than them: the owner sees and approves the schedule in
  words, and each run is journaled.

### 4.2 Mail — `mail` (built)

- **Needed by**: Support (replies, and tickets from received email),
  Booking (confirmations with `.ics`), Hiring (candidate messages), Quotes
  (sending invoices), News (digest, later).
- **Working copy**: `sdk/client/src/mail.ts`, `fakeChest({mail})`,
  `chest.outbox`, `chest.receive()`, `sdk/client/test/mail.test.ts`.
- **API**: `mail.send({to, cc, subject, text, html, mailbox, fromName,
  replyTo, inReplyTo, references, attachments, key})`, `mail.status(id)`,
  `mail.mailboxAddress(name)`, `mail.handle(request, handler, {seen})` on
  `POST /chest-mail` (signed `Chest-Mail`). A member is a recipient by id
  (`{member}`): the tool never needs `members.email` to write to them.
- **Manifest**: `"mail": {"send": true, "mailboxes": ["support"]}`.
- **Approval sentences**: "Sends emails in your company's name, up to 500
  a day"; "Receives the emails sent to support@<your domain>".
- **Quotas**: 500 messages a day (owner may raise), 50 recipients, 10 MiB;
  received 25 MiB; a suppression list per Chest (bounces, complaints).
- **The Chest logs** to, subject, size, status — not bodies by default.
- **Risks**: spam and reputation (bounded by quotas, suppression, the
  company's own domain and provider), phishing through a tool (sender is
  always the company's domain; no free "from"), received HTML (delivered
  unsanitised and marked so; tools sanitise).
- **Elsewhere**: Supabase and Firebase leave email to a provider the
  developer configures (credentials in the app); Vercel has none;
  PocketBase has SMTP settings. Better here: one connection by the owner,
  per-tool permission and quota, members addressable by id.

### 4.3 Public uploads and public files — `files` options (built from the spec)

- **Needed by**: Hiring (a candidate's CV), Support (a photo with a
  request), Booking (a document with a booking), News and a future CMS or
  shop (public images).
- **Working copy**: `files.uploadUrl(name, {public: true})`,
  `files.publicUrl(name, {version})`, `fakeChest({storage: {publicUploads,
  publicFiles}})`, the fake front's `/_chest/upload/<token>` and
  `/_chest/public/<name>`; tests in `sdk/client/test/testing.test.ts`.
- **This one was specified already** (`tool-storage.md`) and not built; we
  built the SDK side exactly as specified. One gap in the spec: it says
  nothing of **abuse on the tool's side**. A tool must authorise a public
  upload only after its own guard (Support and Hiring use a signed "form
  shown at" time and per-visitor counters in their database) — the Chest's
  30 uploads a minute per address is a second line, not the first. We would
  add `files.uploadUrl(…, {public: true, visitor})` so the Chest can count
  per visitor across tools.
- **Manifest**: `"files": {"publicUploads": true, "publicFiles": true}` —
  refused by today's parser, so kept in `chest.proposals.json`.

### 4.4 Events between tools — `events.publish` and received tool events (built)

- **Needed by** (the suite): Leave → Rooms (away), Hiring → People (a
  newcomer and their onboarding), Clients → Quotes (a deal won), Forms →
  Clients (a response becomes a contact), Support → Clients (a customer's
  history), Leave → News (who is away today)…
- **Working copy**: `events.publish(type, data, {key})`,
  `events.handle(…, {tools})`, `ToolEvent`; `fakeChest({emits,
  receivers})`, `chest.published`, `chest.deliver()`; test in
  `sdk/client/test/events.test.ts`.
- **Design choices**: one delivery path for member and tool events (the
  tool writes one route); an event type is namespaced by its publisher, so
  a tool cannot impersonate another; the admin links publisher and
  receiver (no tool chooses where its data goes); data carries member ids,
  never names; at least once, with `seen`.
- **Manifest**: `"emits": ["leave.approved"]`; `"receives": [...,
  "leave.approved"]` (today's parser accepts only `member.*`).
- **Approval sentences**: "Tells other tools when a leave is approved
  (who, and which days)"; "Is told by Leave when a leave is approved".
- **Risks**: data leaving a tool's database (bounded by the admin's link
  and the publisher's documented payload), loops (a receiver that publishes
  back: the Chest drops an event whose chain is deeper than 3).
- **Elsewhere**: Supabase and Firebase have database triggers inside one
  app; Zapier/n8n link SaaS with credentials. Here the platform owns the
  link, per company, with permissions in words.

### 4.5 The Chest's settings — `chest` (built)

- **Needed by**: every tool with days (Tasks, Leave, Rooms, Expenses,
  Booking, News: "today", "this week", a reminder's hour), every tool that
  writes a link outside a request (Support's and Booking's emails sent by
  a schedule, Wiki's exports, Booking's calendar feed), every public page
  that names the company (Support, Booking, Hiring). Five builders asked
  for it separately; each had hard-coded Europe/Paris, derived its public
  address from `X-Forwarded-Host` and remembered it in its database, and
  asked its own admin for the company's name.
- **Working copy**: `sdk/client/src/chest.ts` — `company()`, `timeZone()`,
  `today()`, `currency()`, `locale()`, `teamUrl()`, `publicUrl()`, read
  from `CHEST_COMPANY`, `CHEST_TIMEZONE`, `CHEST_CURRENCY`, `CHEST_LOCALE`,
  `CHEST_TEAM_URL`, `CHEST_PUBLIC_URL`, each checked, each with a safe
  default; `fakeChest({settings})`; `sdk/client/test/chest.test.ts`;
  `schedules.timeZone()` is now the same function. Used by Booking
  (company name, new hosts' zone, the public address of its emails); the
  harness gives every tool the cast's company.
- **Why environment variables**: they are what the Chest already gives a
  tool (`CHEST_API`, `CHEST_TOKEN`, `DATABASE_URL`), they cost no request,
  and a tool restarts when the owner changes them — these change rarely.
- **Not a capability**: nothing here is private to the company beyond what
  its pages already show; no approval sentence.
- **Elsewhere**: Vercel gives `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL`;
  Heroku and Render give the app's URL; none gives the tenant's locale or
  zone, because none has a tenant. The Chest has one: its company.

### 4.6 Notify everyone — `notifications.broadcast` (built)

- **Needed by**: News (an Important post to everyone), Polls (a question to
  everyone or some groups), later Status (an incident to the team) and
  Goals (the quarter's check-in). News had to list members page by page,
  group them by language, call once per language and per 500, and stop at
  the 1,000 recipients an hour — a company of 1,300 people could not be
  told of its move in one go.
- **Working copy**: `notifications.broadcast({messages: {en, fr…}, path,
  key, to: {roles, groups}})` → `{delivered}`; the fake resolves members,
  roles and groups and picks each member's language; test in
  `sdk/client/test/notifications.test.ts`.
- **Quota**: 30 broadcasts an hour per tool, outside the recipients-an-hour
  quota (the Chest delivers in the background, at its own pace); each
  member keeps the 100 items a day limit.
- **Risks**: a tool spamming everyone (bounded by 30 an hour and the
  owner's mute per tool); a broadcast reaching someone who should not see
  a title (the tool chooses roles and groups; titles are 80 characters and
  open a page the tool still guards).

### 4.7 The store's words in other languages — manifest `translations` (built in the checker)

- **Needed by**: every tool. A tool speaks the member's language inside
  (`member.locale`), but its tile, its store card and the role names the
  admin picks from are in English only.
- **Shape**: `"translations": {"fr": {"title": "Tâches", "description":
  "…", "role_labels": {"manager": "Responsable"}}}` — the manifest's own
  words stay the default (English); a language the Chest speaks may give
  any of the three; same bounds as the originals (48, 160, 40 characters).
  Kept in `chest.proposals.json` (today's parser refuses the key); checked
  by `scripts/check-manifest.mjs`; given by all nine finished tools.
- **Why not `"title": {"en": …, "fr": …}`**: a string must stay valid for
  every tool already published, and one block per language is what a
  translator (or an agent) adds in one place.
- **The Chest's side**: the tile, the store and the roles screen pick the
  viewer's language, falling back to the manifest's words.

_(more sections as tools need them: public accounts, payments, AI.)_

## 5. Public-facing tools

Support and Booking have a public part (a contact form and follow-up page;
booking pages and a guest's link); Hiring and Status are being built. The
public host works — one tool, two hosts, the team's part behind `/chest`
— but every public tool rebuilt the same four things, and each is a
platform concern:

1. **Abuse on forms.** No captcha is possible without a third party, so
   each tool built the same guard: a honeypot field, a signed "form shown
   at" time (refuses a form sent in under 3 seconds or never shown), and
   per-visitor and global counters in its database, keyed by the first
   address of `X-Forwarded-For` (assumed set by the Chest's front — the
   contract should say so). Proposal: `guard.check(request, {perVisitor,
   perHour})` in the SDK, counted by the Chest across its tools, and the
   form token helper (`guard.token()` / `guard.verify()`).
2. **Visitors' language.** Each tool wrote the same `/lang/<code>` switch,
   a cookie and `Accept-Language` parsing. Proposal: `publicLocale(request)`
   next to `member()` — the Chest's default language (`chest.locale()`) as
   the last fallback.
3. **Secret links instead of accounts.** A customer follows a ticket and a
   guest moves a booking through a link holding a secret (stored hashed,
   looked up by SHA-256). It is the right design for one-off visitors — no
   account to create — and deserves a helper (`secret()`, `hash()`) and a
   paragraph in the contract (never logged, `Referrer-Policy`, `noindex`).
   Real **public accounts** (a customer portal with a password or a magic
   link) are not needed by the opening store; they would be by a shop or a
   client portal.
4. **Addresses.** The public host's address was derived from forwarded
   headers and remembered in each tool's database for emails sent later —
   now `chest.publicUrl()` (4.5).

What a public tool cannot do yet, and says so on its pages: photos of
members on the public host (the Chest's photo links are team-host only —
Booking shows initials), reading a host's other calendars (no outbound
network, no OAuth), automatic checks for Status (no outbound network, no
process between requests).

## 6. Tools as a suite

The pitch is "one flat price for all your tools", but what a SaaS bundle
cannot match is tools that **know each other** without an integration
project. The first link is built: **Leave → Rooms**. When a leave is
approved, Leave publishes `leave.approved` (who, which days, which halves —
never the kind nor the note); Rooms, linked by the admin, marks those whole
days "Off" and frees the person's desk; `leave.cancelled` takes back exactly
the days it marked (`tools/private/leave/lib/share.ts`,
`tools/private/rooms/lib/away.ts`, tested on both sides with
`chest.published` and `chest.deliver`).

What building it taught:

- **Payloads are contracts.** Rooms validates every field and ignores an
  event of another shape (accepted, nothing changed): a publisher's upgrade
  must never break a receiver. The Chest should keep, per event type, the
  publisher's documented schema, and show it to the admin who links them.
- **Receivers must never overwrite a person's own choice.** Rooms stores
  where a day came from (`presence.leave_ref`) so a cancelled leave removes
  its own days only. Every receiver will need the same care: the pattern
  belongs in the SDK's documentation.
- **Idempotency keys must carry the version of the fact** (approved, taken
  back, approved again = two events): `leave:<id>:approved:<decided at>`.
- **No harness for two tools yet.** `lab/chest-dev` runs one tool; a local
  Chest running several, with the admin's links, would let a flow show the
  suite working end to end. Tests on both sides stand in for it.

Next links, by value: Hiring → People (a hire becomes a newcomer with the
arrival checklist), Clients → Quotes (a deal won starts a quote), People →
Equipment (a departure lists what to take back), Leave → News (who is away
today), Support → Clients (a customer's history).

## 7. Developer and agent experience

- **The local loop is the biggest missing piece.** `lab/chest-dev` (fake
  Chest from the SDK, the tool's database created and migrated as the Chest
  does, a member and language switcher, the bell, lifecycle buttons,
  proposals' controls, screenshots) took a day and made every later tool
  faster. It is exactly the specified `chest dev`.
- **`chest check`** does not exist: `scripts/check-manifest.mjs` implements
  what we could read in the contract (manifest grammar, images, SVG rules,
  archive shape, migrations naming) plus studio rules (docs present, no
  import outside the folder, PGlite not shipped).
- **Tests without a database server**: PGlite (dev dependency) with
  `pglite-socket` runs the tool's real SQL and migrations in the test
  process; it accepts one connection at a time, so the tool's pool must be
  swappable in tests (`provide(sql)` in `lib/db.ts`).

## 8. Priorities

_(table at the end)_
