# The SDK report — what building the store taught us

_Draft, written as the tools are built (brief/06); consolidated at the end.
The proof is the SDK working copy `sdk/` (its diff from `387ae90`, published
0.2.0) and the tools that use it. Each proposal below exists there: typed,
tested, faked in `testing`, documented in `sdk/README.md` (sections marked
**Proposal (studio)**), and used by at least one tool._

## 1. Summary — the changes that would matter most

Seventeen tools were built for the opening store, each to production
quality, each in its own folder, by builders who used the SDK as a
third-party developer would. What they needed and did not find is below,
proven by code: every proposal is built in `sdk/` (0.3.0-studio.10 —
typed, tested, faked in `testing`, documented in `sdk/README.md` under
**Proposal (studio)**) and used by at least one tool.

1. **`member.locale`** — every tool speaks the member's language; the
   Chest knows it, the tool did not. A claim and a field. Used by all 17.
2. **Accept tomorrow's manifest keys** (warn, or version them). Today a
   tool that declares any proposal cannot be installed; all 17 keep them
   in `chest.proposals.json`.
3. **`schedules`** — reminders, digests, purges and true badges. 15 of the
   17 tools declare one; without them, tools piggy-back on page views.
4. **`chest`** — the company's name, time zone, currency, language and the
   tool's addresses. Every tool had hard-coded Europe/Paris or guessed its
   address from forwarded headers. Environment variables: nearly free.
5. **`mail`** — the public tools (Support, Booking, Hiring, Status) and
   Quotes cannot reach anyone outside the company without it; five more
   tools wished it for members who never open the Chest. The largest
   Chest-side cost, and the largest value.
6. **The tile in the member's language** (`translations`): all 17 give
   French words; the tile still says "Tasks" to a French member today.
7. **The public host's toolkit** — `visitors` (form guard counted across
   tools, the visitor's language), public uploads with a one-time `claim`.
8. **Telling everyone** (`notifications.broadcast`) and **events between
   tools** — the first makes News and Polls work beyond a thousand people;
   the second turns 17 tools into a suite (Leave → Rooms built; Hiring →
   People and Clients → Quotes being built).
9. **`checks`** — the Chest probes the company's websites for Status.
10. **`chest dev` and `chest check`** — our `lab/chest-dev` and
    `scripts/check-manifest.mjs` are working models; with them an agent
    can build, verify and screenshot a tool alone.

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
- **Someone who lost access is "unknown".** `members.lookup` answers
  `former` for someone who left the Chest, but `unknown` for someone who
  only lost access to the tool — so the tool loses their name exactly when
  it needs it ("Léa holds 3 laptops", "Paul's goals need a new owner").
  Hit by Equipment and Goals. Wish: `{id, name, status: "no_access"}`.

### `members`
- **Groups a tool may offer.** `groups.list()` gives only the groups that
  give the tool; a tool open to everyone (Polls: "ask Sales only") cannot
  offer the Chest's teams. Wish: `groups.list({all: true})` — every group
  of the Chest, with its members, for tools that target people (Polls,
  News, Goals), under the `members` capability.
- `list` pages of 500 are fine, but a tool that shows "who can see this
  board" or "who has not read this post" lists everyone each time (People
  reads up to ten pages per view). A cached `members.all()`, an ETag on
  `/members`, or `list({changedSince})` would save calls.
- **No event when someone gets the tool.** `member.added` (or
  `changedSince`) would let People and Leave notice a newcomer at once.
- **Admins in one call.** "Tell the administrators" (Goals, Equipment)
  means listing the first role page by page. Wish: `list({admin: true})`
  or `to: {admins: true}` on `notify` and `broadcast`.
- **Matching names.** Every importer (Tasks, Leave, People, Timesheets,
  Expenses) matches spreadsheet names to members itself, over the whole
  list, with the same folding (accents, case, word order). Wish:
  `members.match(names)` → `{id} | "ambiguous" | "none"` per name.
- **A manager.** Leave re-enters "who approves whom"; Goals and People
  would use the same line. Wish: `members.get(id).manager` (the Chest's
  org line, set once).
- **Tests.** `lookup` caches for a minute in the process: a test that
  changes `chest.members` must call `members.forget()`.

### `files`
- **`files.url` and `uploadUrl` refuse `http://` links**, so no local
  harness can serve them. The working copy accepts `http://localhost` and
  `http://127.0.0.1` (a dev affordance; production links stay https).
- **The fake Chest did not receive uploads nor serve links or photos**: a
  test could authorise an upload but never complete it. The working copy's
  `fakeChest` now plays the team host's front (`/_chest/files/upload/…`,
  links, members' photos) and `chest.upload()` plays the browser.
- **The fake ignores `thumbnail`** and never answers `no_thumbnail`, so a
  tool's fallback is untested (News, Expenses). HEIC photos (every iPhone)
  get no thumbnail (Expenses).
- **`stat` could give the Chest's `sha256`**: Expenses re-downloads each
  receipt (up to 10 MB) only to hash it.
- **Framing a file.** Hiring shows a CV inline from a signed link; nothing
  says whether the Chest lets the tool's own pages frame it. Wish:
  `files.url(name, {inline: true})` with `frame-ancestors` the team host.
- **Records that must outlive the tool.** Expenses (receipts, 10 years)
  and Quotes (invoices, 10 years) hold legally retained data; removing the
  tool deletes it. Wish: a manifest `retain` declaration so the Chest warns
  the owner and offers the export before removal.

### `notifications`
- Clear and well bounded. Wish: a `notify` with a per-recipient body
  (each recipient's language) in one call; today a tool groups recipients
  by locale and calls once per language (`lib/notify.ts` in every tool).
  For "everyone", built as `broadcast` (4.6).
- **Important items.** News's "please confirm you read this" competes with
  every other item and the quota; people who never open the Chest never
  see it. Wish: an `important` flag (above quota, shown first) or a
  fallback to email through `mail`.

### `mail`
- **Is mail granted?** A tool learns it only by a failed send (Status
  hides its subscribe form after the first failure; Quotes numbers a quote
  then rolls back). Wish: `mail.available()`, or the granted proposals in
  the environment.
- **Logging email.** Clients would log a conversation by BCC to a mailbox
  (inbound exists, per mailbox); the pattern deserves a documented example.

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
- Extensions: `pg_trgm`, `unaccent` and `btree_gist` (Booking and Rooms'
  "never booked twice" constraints) are "trusted" — a database owner may
  create them; Wiki also creates a text search configuration. The contract
  should say which extensions and objects a tool's migrations may create.
- **Next.js traps met by several builders** (worth a page in the contract
  or the starter): the browser and Node write dates differently (Node
  "Sept", Chromium "Sep"; a comma or not), which breaks hydration — format
  on the server; a plain function exported from a `"use client"` file
  cannot be called by a server page (fails at run time only); page files
  cannot export helpers; libraries that inject `<style>` (Tiptap) are
  blocked by the nonce policy; Next overwrites `Vary`, so a public page
  cannot be cached per language by a shared cache; `next dev` breaks the
  nonce policy with its own styles (screens and flows run on a build).

### Found while deepening the tools (second round, 2026-09-29)

Six tools went deeper (reminders and recurring cards in Tasks; comments,
watching, templates and review reminders in Wiki; tags, priority and files
in Support; questions and daily limits in Booking; audience, search and a
digest in News; two new suite links). What they ran into, by module:

- **`notifications`, per person.** Reminders and digests differ per person, so
  each costs one `notify` call per member against the hourly quota.
  Wanted: `notifyMany([{member, title, body}], {key, path})` and a digest
  quota. `withdraw(key)` without members hits everyone, and the Chest never
  says who holds a key, so Tasks and News keep their own "who was told"
  table. Wanted: `withdraw(key, {except})`, several keys or a prefix at
  once (`page:42:*` — Wiki trashing a branch), and a per-member result
  from `notify` so a reminder is not marked "told" when the Chest was
  briefly unreachable.
- **Time.** The database's `current_date` is UTC while the Chest's day is
  Paris: after 22:00 UTC a tool comparing with `current_date` is wrong.
  The Chest should set the session `TimeZone` of the tool's database role
  to the Chest's zone, or the SDK guide must say "always pass today". Also
  wanted: the Chest's working days and public holidays (People's "back on",
  Support's waiting time in business hours) and a per-member time zone for
  reminders at each person's hour.
- **`groups`.** A tool sees only the groups that give it access, so a tool
  open to everyone (News, Polls, Wiki) cannot target "the Sales team".
  Proposal: a `groups` capability, "Sees the Chest's groups and who is in
  them" — a product and permission decision, not built. Group changes
  send no event, so bell items already sent are not withdrawn when someone
  leaves a group. `members.lookup` caches for a minute: document it for
  access checks.
- **`files`.** A customer's file on the public host has to stream through
  the tool (`files.get`); wanted: a short-lived public signed link.
  `expiresUnclaimedAfter` for private uploads too (Support sweeps them
  itself). The name the Chest gives an object should be documented or its
  extension returned. `files.capabilities()` would let a tool hide "Add a
  file" on a Chest without public uploads. The fake does not check that
  bytes match the declared type, as the spec says the Chest does.
- **`events`.** Delivery is at least once and unordered, so each receiver
  keeps `occurredAt` per subject and tombstones for cancellations (People,
  Equipment). The SDK should promise order per subject or ship a
  `newerThan(stored, event)` helper and document the pattern. The 64
  character key limit is too short for tool + member id + fact + version:
  128, or hashed by the SDK. Publishers need "compare, then publish" (only
  publish when the fact really changed): worth a helper. Asking another
  tool a question (People: "what does this person hold?") is not an event;
  request/answer between tools is a wish.
- **Database.** Booking's daily limit takes a row lock (`select … for
  update`) inside a transaction: the tool's role must keep plain PostgreSQL
  locking rights.
- **Harness (lab).** `/_dev` schedule runs should accept `scheduledAt`; the
  bell should be readable as JSON; `--prod` reuses a stale `.next` (the
  lead's verification builds first; `dev.mjs` should warn); the audit now replays each
  screen's actions, so dialogs and forms are checked.

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
- **Found by Hiring, built**: the spec's public upload answered the
  visitor the object's name, which the visitor then handed to the form —
  anyone could hand another visitor's name. Now the upload answers a
  one-time `claim` the tool trades with `files.claim()`, and
  `expiresUnclaimedAfter` lets the Chest delete what nobody claimed (each
  tool had its own nightly sweep). Hiring's alternative (the tool names the
  object and signs the name into its form) also works and stays valid.
- **Still to do in the fake**: sniff the first bytes of PDFs and archives
  (the spec says the Chest does) and the 30-a-minute per visitor limit.
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
- **Since**: `except` (up to 500 members left out — the author, those who
  already answered: Polls' reminders) and `fakeChest({broadcast: false})`
  to test a tool's fallback, both asked by Polls' builder.
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

### 4.8 The public host's visitors — `visitors` (built)

- **Needed by**: Support (contact form), Booking (booking form, moves and
  cancellations), Hiring (applications with a CV), Status (email
  subscriptions) — each had rebuilt a signed form token, per-visitor
  counters in its database, a daily purge of them, and the visitor's
  language.
- **Working copy**: `sdk/client/src/visitors.ts` — `formToken`,
  `checkForm`, `count`, `language`, `visitor`, `address`;
  `fakeChest({visitors})` counts; `sdk/client/test/visitors.test.ts`.
  Used by Booking (form token and counting, with its own counters as the
  fallback on a Chest without it).
- **Why the Chest counts**: it sees every public tool's traffic; a per-tool
  counter lets a robot spread over five tools five times the allowance.
  The tool keeps its own limits per name; the Chest adds one ceiling per
  address.
- **Approval**: none new — a public tool already receives visitors.
- **Risks**: shared addresses (a company's office behind one NAT) hitting
  the ceiling; the owner may raise it; a limit answers `retryAfter`, and
  tools say "try again in an hour", never a silent failure.

### 4.9 Checks run by the Chest — `checks` (built)

- **Needed by**: Status — "is the website up?" is the first thing a status
  page's customer expects, and a tool cannot know it: no outbound network,
  no process between requests. Also wanted later by any tool that watches
  something outside (a supplier's API, the company's shop).
- **Working copy**: `sdk/client/src/checks.ts` — `configure(list)`,
  `list()`, `handle`/`verify` of signed results on `POST /chest-checks`,
  `checkManifest`, `checkChecks`; `fakeChest({checks})`, `chest.checks`,
  `chest.check()`; `sdk/client/test/checks.test.ts`; the harness shows the
  configured checks with "up"/"down" buttons; the manifest checker reads
  the permission.
- **A design point found on the way**: a manifest cannot hold the
  company's own addresses (the tool is published once for every company).
  The manifest declares the permission (`"checks": {"max": 10}`); the
  tool's admin types the addresses; the owner sees each one.
- **Approval sentence**: "Asks the Chest to check up to 10 web addresses
  of yours, as often as every minute".
- **Risks**: the Chest used to probe third parties (bounded: the owner sees
  every address, 10 per tool, GET only, no private addresses, no cookies);
  noise (results are signed and deduplicated by id).
- **Used by Status**: an editor sets an https address per service (private
  networks and credentials refused); after three failures in a row every
  editor's bell rings and *Now* offers a prefilled incident — the tool never
  posts publicly by itself; the public page shows the measured share of
  checks answered in time beside the declared uptime. When the Chest
  refuses the capability, the page says so and the rest works.
- **Still missing**: a heartbeat address a customer's own job calls
  (silence means down), a keyword expected in the page, and results kept
  by the Chest so a newly installed tool starts with history. The fake
  refuses a result for a check the tool no longer lists, so that case is
  tested without it.
- **Elsewhere**: Better Stack and UptimeRobot probe from their clouds, then
  push to a status page — the same split, inside one company's server.

_(more sections as tools need them: public accounts, payments, AI.)_

### 4.10 The company's look — `chest.theme()` (built)

- **Needed by**: every tool, once the owner's wish is met — a company keeps
  each tool's identity, picks one theme for all its tools, or wears its own
  brand (colours, fonts, logo), and may choose otherwise for one tool. The
  looks come from the UI kit `@argentic/chest-ui` (`ui/`, report
  `reports/04-themes-and-kit.md`); the tool must learn which one applies.
- **Working copy**: `chest.theme()` in `sdk/client/src/chest.ts` (with
  `readThemeChoice`, `forgetTheme`, `themeIdPattern`, types `ThemeChoice`,
  `BrandChoice`, `ThemeFont`); `fakeChest({theme: {all, tools},
  themeFiles})`, `chest.theme`, `chest.themeFiles`, the fake front's
  `/_chest/theme/…`; `sdk/client/test/theme.test.ts`; SDK
  0.3.0-studio.11. The harness's `/_dev` switches both levels; the pilot
  (`lab/template`) renders all three modes.
- **Design points**: the Chest resolves the two levels (all tools, this
  tool) and answers one choice with its `scope`; files (catalogue fonts,
  brand fonts and logo) are served by the Chest's front on the tool's own
  hosts under `/_chest/theme/`, so the tools' strict CSP is unchanged;
  `theme()` never throws (own look on 404, unreachable or unknown answer)
  and keeps the answer for the Chest's `max-age` (≤ 5 min).
- **Approval sentence**: none — a look is not a permission (no data about
  people, files on the tool's origin). The owner's words are the choice
  itself: "How your tools look: each its own / one theme for all / your
  brand", then per tool "Same as all tools / its own look / a theme / your
  brand".
- **Risks**: an uploaded SVG logo served on a tool's origin (sanitise, or
  serve with `default-src 'none'`, or rasterise); a brand's font licence
  (the admin confirms it); tools that write colours in their CSS ignore the
  look (the kit's tests catch literals).
- **Elsewhere** (as we know those admin pages, not re-read today): Microsoft
  365 organisation themes, Salesforce "Themes and Branding" and Atlassian
  custom colours set a logo and colours once for all users; none keeps a
  per-app identity as an option.
- **Still missing**: the admin's preview and the Chest's upload checks
  (only designed); a light-only choice for any theme; tinting the portal's
  tiles in brand mode.

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
   contract should say so). Built as the `visitors` module (4.8).
2. **Visitors' language.** Each tool wrote the same `/lang/<code>` switch,
   a cookie and `Accept-Language` parsing. Built: `visitors.language()`,
   with the Chest's default language (`chest.locale()`) as the last
   fallback.
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
project. Five links are built, each tested on both sides with
`chest.published` and `chest.deliver`, and shown in the receiver's browser
flow through the harness's `/_dev/deliver`.

**Leave → Rooms.** When a leave is
approved, Leave publishes `leave.approved` (who, which days, which halves —
never the kind nor the note); Rooms, linked by the admin, marks those whole
days "Off" and frees the person's desk; `leave.cancelled` takes back exactly
the days it marked (`tools/private/leave/lib/share.ts`,
`tools/private/rooms/lib/away.ts`).

**Hiring → People.** When a candidate is hired, Hiring publishes
`hiring.hired` (name, job, team, place, start date, who hired — the email
travels but People never stores it); undoing it publishes
`hiring.hire_cancelled`. People turns the hire into an *arrival*: HR is
told, can start the arrival checklist *before the person has access* (the
newcomer's own steps wait), and links the arrival to the member once they
join — suggested when exactly one member's name matches. Once linked, the
arrival keeps no personal data; one never linked is deleted 90 days after
its start date (`tools/public-and-private/hiring/lib/share.ts`,
`tools/private/people/lib/arrivals.ts`).

**Leave → People.** The same `leave.approved` / `leave.cancelled`, a second
receiver: People shows "Away · back on …" (never why) on the card and the
profile, purged once past (`tools/private/people/lib/away.ts`).

**People → Equipment.** Starting a leaving checklist publishes
`people.leaving {member, lastDay}`; Equipment tells its managers once what
that person holds and lists it under "To take back"; stopping it withdraws
the notice; when the member later leaves the Chest, Equipment's own
"left and still holds" takes over (`tools/private/people/lib/share.ts`,
`tools/private/equipment/lib/departures.ts`).

**Clients → Quotes.** When a deal is won, Clients publishes
`crm.deal.won` (deal, title, amount and currency, owner, company and
contact); Quotes makes one draft quote for it, owned by the deal's owner if
they may write quotes (otherwise the sales people are told), and matches
the client by reference, then by SIREN, else creates it.
`crm.deal.reopened` deletes the draft only if nobody touched it; a changed
or sent quote stays, and its history says why
(`tools/private/crm/lib/share.ts`, `tools/private/quotes/lib/crm.ts`).

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
- **A receiver fills, it never overwrites.** Quotes fills only the empty
  fields of an existing client (a legal document's client card may have
  been corrected on purpose); People fills only the empty fields of a
  profile. Both chose this independently: it should be the documented rule.
- **Before the person exists.** A hire arrives before the member does, so
  People needs a record that is *not yet a member* and a way to match it
  later. `members.match({name})` in the Chest (who is this, among members
  and invitations?) would replace each tool's own guess by name.
- **Take back only what nobody touched.** Clients' reopen and Hiring's
  cancel both ask the receiver to undo; both receivers undo only an
  untouched record and otherwise leave a note. Events need no "undo"
  primitive, but the SDK guide should show this pattern.
- **No harness for two tools yet.** `lab/chest-dev` runs one tool; a local
  Chest running several, with the admin's links, would let a flow show the
  suite working end to end. Tests on both sides stand in for it.

Next links, by value: Leave → News (who is away
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
  swappable in tests (`provide(sql)` in `lib/db.ts`). It hid one real bug
  (µs vs ms timestamps, Wiki): tools also run their tests on PostgreSQL.
- **What the harness still lacks** (asked by several builders): seeding
  files (`seed/files/` into the fake Chest: News, Expenses), a clock to
  move "now" (Timesheets, Goals — tests crossed midnight twice), a control
  to age data without a database connection (Wiki's lock, Timesheets'
  forgotten timer), screenshots of another month (Leave), a local Chest
  with several tools linked (to see the suite end to end).
- **Accessibility**: `lab/chest-dev/audit.mjs` (axe-core, WCAG 2.1 AA,
  every screen of a tool, desktop and phone, light and dark) found the
  same few faults across tools (icon-only links on phones, drag handles on
  list items, a textarea with an invalid ARIA attribute); all 17 now pass.
  The Chest's own `chest check` should run it.
- **Agents as builders**: 14 of the 17 tools were built by builder agents (Tasks, Support and Booking by the lead)
  following `lab/BUILDING.md`, verified by a lead agent re-running tests,
  flows, audit and reading every screenshot. What made it work: a
  template, one standard, a harness with screenshots, and a checklist of
  lessons appended as they were learned.

## 8. Priorities

Ordered by what the opening store needs (counts from the 17 tools'
`chest.proposals.json` and code; final counts once every tool is in).

| # | Change | Kind | Used by | Without it | Cost for the Chest |
|---|---|---|---|---|---|
| 1 | `member.locale` (and in `members`) | claim + field | all 17 | tools speak English to French members, or ask each member again | tiny: the Chest has the setting |
| 2 | Accept unknown manifest keys (warn), or version them | contract | all 17 (`chest.proposals.json`) | no tool of tomorrow can be installed today | tiny |
| 3 | `schedules` | new primitive | 15 of 17 | reminders, digests, purges and true badges are impossible; tools piggy-back on page views | medium: a scheduler and a journal |
| 4 | `chest` settings (zone, company, addresses…) | environment | 9+ | hard-coded Europe/Paris, forwarded-host guessing, company name asked again | tiny: environment variables |
| 5 | `mail` | new primitive | Support, Booking, Hiring, Quotes, Status (+ wished by 5 more) | public tools cannot reach customers; members who never open the Chest miss what matters | large: a mail provider, domains, quotas, suppression |
| 6 | `translations` of the tile | contract | all 17 | French members see English names on tiles | tiny |
| 7 | `visitors` (guard, language) | new module | every public tool (4) | each rebuilds a guard; robots spread across tools | small: counters |
| 8 | `notifications.broadcast` | new call | News, Polls, Status | "tell everyone" stops at 1,000 people an hour, per-language paging | small |
| 9 | Public uploads/files | spec'd, now built in the SDK | Hiring | a candidate cannot send a CV | medium (already specified) |
| 10 | Events between tools | new primitive | Leave → Rooms (built); 5 more links wanted | the suite is a set of silos | medium: routing, admin links, journal |
| 11 | `chest dev` (local Chest) and `chest check` | tooling | every builder | a day of harness per team; agents cannot verify | medium — our `lab/chest-dev` is a working model |

Deliberately not proposed: WebSockets and background processes (polling
every 20–45 s and schedules covered every case met), outbound network per
tool (only Status's automatic checks needed it — better as a Chest-run
check declared in the manifest), public accounts (no opening-store tool
needs them).
