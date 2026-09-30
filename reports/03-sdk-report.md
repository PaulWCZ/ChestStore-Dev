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
proven by code: every proposal is built in `sdk/` (0.3.0-studio.16 —
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

**After the severe critique (2026-09-29, `reports/05-critique.md`).** The
critics found that the four public-facing tools cannot replace their SaaS
and that the calendar-shaped tools are islands. That reorders the top of
this list for the *pitch* (the table in §8 has the detail):

- **`mail` send *and* receive** moves to first place among new
  primitives: it is the difference between "a contact form" and a
  helpdesk. Receiving is now designed to the end — thread addresses only
  the tool can mint, HTML cleaned by the Chest, bounces apart (§4.2, §4.13).
- **The calendar bridge** (§4.11, built) — one secret feed per member
  merging every tool's events. Rooms, Leave, Booking, Hiring, News and
  Tasks need it; four tools already wrote their own `.ics` code, and a
  private tool cannot serve a feed at all.
- **`groups` read** (§4.12, built) — News, Polls and Wiki, open to
  everyone, cannot target "the Sales team" today.
- **Platform only**: web push and an email digest of the bell (§4.14);
  custom domains for public hosts (§4.15). No SDK can design these away.

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
  always the company's domain; no free "from"), received HTML (now cleaned
  by the Chest before delivery, §4.13).
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

### 4.11 The calendar bridge — `calendar` (built)

- **Needed by** (critique, 2026-09-29): Rooms (`05-critique/rooms.md`
  blocker 1: "No calendar bridge at all"), Leave (`leave.md` #8: "No iCal /
  Outlook / Google feed"), Booking (`booking.md` #5: the host's feed only
  through a public host), Hiring (interviews, `hiring.md` #3), News (events),
  Tasks (due dates); ranked first of the store's 15 cross-cutting fixes in
  `05-critique/_store.md` §4. Evidence in code: **four tools wrote their
  own iCalendar writer** (`news/lib/ics.ts`, `polls/lib/ics.ts`,
  `booking/lib/ics.ts`, `status/lib/ics.ts`, 78–90 lines each), and Booking
  had to serve its host's feed on its **public** host with a token of its
  own (`booking/app/feed/[token]/route.ts`) — a private tool (Rooms, Leave,
  Tasks) has no host a calendar app can reach without signing in, so it
  cannot serve a feed at all. And each tool's feed would be one more URL a
  member must add: six tools, six subscriptions.
- **Working copy**: `sdk/client/src/calendar.ts` — `put`, `remove`, `list`,
  `page`, and the writer `ics`, `escapeText`, `foldLine`, `unfold`,
  `uidOf`, `feed`, `pick`, `check`; `fakeChest({calendar})`,
  `chest.calendar`, `chest.feed(member)`, `chest.feedUrl`/`newFeedUrl`, the
  fake front's `/_chest/calendar/<secret>.ics` and `/_chest/calendar`
  page; `sdk/client/test/calendar.test.ts` (7 tests: RFC 5545 §3.1
  folding and its unfolding example, §3.3.11 escaping example, §3.3.5 UTC
  form, §3.6.1 exclusive DTEND across a year, per-language feeds, replace
  and remove, access, secret address replaced, ETag, page); the harness
  shows the signed-in member's feed address (subscribable from a calendar
  app on the machine), their page, "New address" and the tool's events.
- **API**: `calendar.put({key, members, title, description?, start, end |
  days: {first, last}, location?, path?, busy?, private?})` →
  `{key, members, skipped}`; `remove(key)` → boolean; `list({after,
  limit})`. Idempotent by key (replace, members too; `SEQUENCE` counts).
- **Decisions**: (1) **titles per language given by the tool**
  (`{en, fr}` or one text), the Chest picks each reader's — the same
  shape as `broadcast`; a template language in the Chest would be a second
  i18n system. (2) **`path` under `/chest`, not a URL**: nothing in a
  colleague's calendar links outside the company's tools. (3) **Personal
  feeds only**: a team's absences for a manager need per-tool rules
  ("Away", never the kind of leave) — a later "shared feeds" step. (4) **A
  random secret, stored hashed, replaceable** — not a signed URL, which
  could not be revoked. (5) **UID = hash(tool, key)@domain**: stable, no
  internal id leaks into invitations. (6) **DTSTAMP = last change**, so a
  feed that did not change is byte-identical and answers 304.
- **Manifest and approval**: `"calendar": true` — "Adds events to the
  calendar of the members concerned". The member's page: "Add your Chest
  calendar" with the address, a webcal link, Google's steps, "New address".
- **Quotas**: 5,000 events per tool, 1,000 members an event, a year back
  and two years ahead, 600 writes a minute; a feed holds a member's 2,000
  nearest events. The Chest journals writes per tool (counts, not titles).
- **Risks**: a feed address is a bearer secret (anyone with it reads that
  member's week): only the member sees it, "New address" revokes, feeds
  are `noindex`, `no-referrer`, and private events carry `CLASS:PRIVATE`;
  a leaked title (a leave's reason) — tools write neutral titles ("Off"),
  the guide says so; load (a calendar app polls hourly): the answer is
  static per member and cached by `ETag`.
- **Honest limit**: Google Calendar refreshes a subscribed calendar at its
  own pace — "every 6–24 hours" per third-party guides seen on 2026-09-29
  ([usecarly.com](https://www.usecarly.com/blog/how-to/how-to-subscribe-to-calendar-google/),
  [add-to-calendar-pro.com](https://add-to-calendar-pro.com/articles/synching-ical-with-google-calendar));
  Google's own help page ([support.google.com/calendar/answer/37100](https://support.google.com/calendar/answer/37100))
  could not be read from the studio. So the feed shows plans, not
  last-minute changes; Booking's critic made the same point (`booking.md` #5).
- **Next step, not built**: a read-only **free/busy connector** — a member
  links their Google or Microsoft calendar once (OAuth held by the Chest,
  the provider's hosts declared as network), and a tool asks
  `calendar.busy(member, from, to)` → busy intervals only, never titles.
  That is what Booking needs to stop double-booking (`booking.md` blocker
  1) and Hiring to propose interview times.
- **Elsewhere**: the critique notes Lucca and Factorial offer absence
  feeds (`leave.md` #8, the critics' knowledge, not re-read); each SaaS
  gives one feed per product. The Chest gives one per person for all its
  tools — something a bundle of SaaS cannot.

### 4.12 Seeing the Chest's groups — `groups` read (built)

- **Needed by**: News (`05-critique/news.md` #2: "Posting to a team does
  not work in the default setup"), Polls (`polls.md` #5: "'Some groups'
  only lists groups that give Polls access"), Wiki (per-space rights by
  group, `wiki.md` #3), Rooms (rooms reserved to a group, `rooms.md` #11),
  and the kit's people picker with groups (`_store.md` §3). Seven tools call
  `members.groups.list()` today (Goals, Tasks, Timesheets, Wiki, News,
  Leave, Polls) — and get nothing when the tool is open to everyone, the
  usual setting for exactly those tools.
- **Working copy**: `members.groups.all()` → `[{id, name, size}]`,
  `members.groups.members(id, {after, limit})` → `{members, next}` or
  null; all of a member's groups in `member(request).groups` and
  `members.*` (cap raised from 16 to 64); events `group.changed {id,
  changed: ["name" | "members"]}` and `group.removed {id}` in
  `events.ts`; `fakeChest` groups with `grants: false`;
  `sdk/client/test/groups.test.ts` (3 tests); `scripts/check-manifest.mjs`
  reads `"groups": "read"` (with `members`) and `"receives": ["group.*"]`
  (with `groups`); the harness lists groups and moves a member in or out,
  telling the tool.
- **Decisions**: who is in a group is answered **among the members who
  have the tool** — the rule "a member without access does not exist for
  the tool" holds; `size` counts the same way. `"read"`, a string, leaves
  room for nothing else on purpose: groups are the Chest's, never a tool's.
- **Approval sentence**: "Sees your Chest's groups and who is in them".
- **Risks**: the organisation chart reaches every tool that asks (hence a
  permission in words); sensitive group names — the Chest should let the
  owner hide a group from tools (not designed). Found with the harness: a
  tool still on an older SDK answers **401** to `group.changed` (its
  verifier expects a member id in `data.id`), so the Chest must send group
  events only to versions that declare `group.*` — the manifest makes that
  true.
- **Elsewhere** (vendors' docs as a web search showed them, 2026-09-29):
  Microsoft Graph `GroupMember.Read.All`, admin consent for apps
  ([permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference));
  Slack `usergroups:read`, with `subteam_members_changed` events
  ([scope](https://docs.slack.dev/reference/scopes/usergroups.read/)).
  Same split; ours adds the owner's sentence and the access rule.

### 4.13 Receiving mail — `mail` inbound, finished (built)

§4.2 had the shape (`mailboxes`, `handle`, `chest.receive`). What a real
helpdesk and a jobs@ inbox need was missing; the critique made it the
blocker of Support (`helpdesk.md` #1) and Hiring (`hiring.md` #2).

- **Threads that cannot be forged.** `send({mailbox, thread: "1042"})`
  sets Reply-To `support+t1042-<tag>@<domain>`; the tag is 50 bits of HMAC
  of mailbox and thread under a key derived from `CHEST_TOKEN`, lower
  case. The Chest routes `support+*` to the mailbox and says
  `deliveredTo`; the SDK verifies and fills `received.thread`. Writing to
  `support+1042@` lands nowhere special. Fallback: `inReplyTo` /
  `references` against sent `messageId`s. `threadAddress`, `threadTag`,
  `threadOf` exported.
- **HTML cleaned by the Chest** — decided against "unsanitised, tools
  clean": a server sanitiser is a dependency (DOMPurify needs a DOM) each
  of many small tools would carry and get wrong once — stored XSS on its
  origin. The Chest cleans once (allow-list, links http/https/mailto, no
  images, no attributes), keeps `text` always, and stores the original
  `.eml` in the tool's files for "Show original" (download only). The fake
  has a strict stand-in cleaner, tested against script, style, event
  handlers, `javascript:` (also entity-encoded), images, iframes, comments.
- **What the Chest found**: `spam` (8+ quarantined, never posted),
  `authenticated` (DMARC/aligned SPF or DKIM), `auto` (out-of-office,
  `Auto-Submitted`) so tools never answer robots; `dropped` attachments
  (beyond 20, executables, virus, quota).
- **Bounces apart**: `handle(request, {message, bounce})`; a bounce
  updates `status()`, suppresses a permanent failure Chest-wide, and is
  posted as `{kind: "bounce", message, recipient, permanent, reason}` —
  never as a received message (Support's old risk: a bounce reopening a
  ticket). Function handlers stay valid (Support's route is unchanged).
- **Limits**: 25 MiB accepted at SMTP (552 beyond), 20 attachments, 1 MiB
  text and 2 MiB HTML posted, 4 MiB per delivery; unknown addresses 550.
- **Manifest and approval** unchanged: `"mail": {"mailboxes": ["support"]}`
  — "Receives the emails sent to support@<your domain>".
- **Tests**: 3 new in `sdk/client/test/mail.test.ts` (threads, forged and
  foreign tags, case; cleaned HTML, original, dropped, auto,
  authenticated; bounces, suppression, dedup). `chest.bounce()`,
  `chest.receive({thread, deliveredTo, html, auto, authenticated})`; the
  harness's form sends a new message or a reply to any outbox message (to
  its thread address), with HTML and the two switches, and bounces.
- **Risks**: open relay (impossible: mailboxes only, quota), loops (`auto`,
  a per-sender rate the Chest applies — designed, not faked), a token
  change breaking old reply addresses (fallback on References).
- **Elsewhere** (vendors' docs as a web search showed them, 2026-09-29):
  Postmark posts inbound mail as JSON with `MailboxHash` (the part after
  "+") for threading and SpamAssassin headers
  ([docs](https://postmarkapp.com/developer/webhooks/inbound-webhook));
  Mailgun routes post a parsed message or raw MIME to a URL, webhooks
  signed with HMAC-SHA256
  ([docs](https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/receive-http)).
  Neither authenticates the "+" part nor cleans HTML for the app.

### 4.14 Platform only — reaching people outside the Chest tab

The critique's third blocker (`05-critique.md`; `_store.md` §4 #3): Leave
approvals, Expenses approvals, Tasks assignments and News' Important posts
wait in a bell nobody opens. No SDK change fixes it — tools already
`notify`; the **Chest** must carry the bell further:

- **Web push** from the portal: the Chest's own service worker, installed
  as a PWA on phones (iOS requires the home-screen install), one opt-in
  per member per device; each bell item pushed with its title and the
  tool's name, opening its `path`. Tools gain nothing to call: an item
  keyed and withdrawn in the bell is withdrawn from the device.
- **An email digest of the bell** (needs the Chest's mail, §4.2): per
  member "at once / daily at 08:00 / never", default daily, only unread
  items, grouped by tool, in the member's language; a switch per tool.
- **Tools may mark urgency**: `notify(..., {urgent: true})` would push
  immediately and bypass the digest (quota: 20 a day per tool) — the only
  SDK part, not built until the Chest has push.

### 4.15 Platform only — custom domains for public hosts

`status.`, `careers.`, `book.`, `support.` on the company's own domain are
required to replace Statuspage, Teamtailor, Calendly or Zendesk
(`05-critique.md` blocker 4; `status.md`). The Chest must: let the owner
map a hostname to a tool's public host (a CNAME to the Chest, checked);
obtain and renew certificates automatically (ACME HTTP-01 or TLS-ALPN-01);
serve the tool unchanged under both names; and give tools the address
through `chest.publicUrl()` (§4.5), which already exists for this — no
tool code changes. Mail links and calendar feeds then use the company's
name too.

### 4.16 Wanted after the critique fixes (designed, not built)

Sixteen tools were reworked against the severe critique (reports/05-critique/)
on 2026-09-29. What they needed from the Chest and could not build, grouped,
with the tools that asked. None is faked in a tool: each tool says in its
README what it cannot do until then.

| Need | Asked by | Shape proposed |
|---|---|---|
| **Sealed values** — encrypt a field at rest with a key the Chest keeps and rotates | Expenses (IBANs), People (employee records) | `secrets.seal(value, context)` / `secrets.open(sealed, context)`. Today Expenses encrypts only when an optional env key is set, and says so; People stores no salary or social security number at all. |
| **A role builders do not get** | People | Builders arrive with the tool's roles (`hr` reads HR records). A "builder" grant that never includes roles marked `sensitive` in the manifest. |
| **A Chest-wide audit journal** | People, Support | `audit.write({action, subject})`, read by the owner. People keeps its own journal meanwhile. |
| **Framing public pages** | Booking, Support, Status | The front's floor CSP forces `frame-ancestors 'none'` on public responses. A manifest key `"public": {"frameable": true}` with the origins the owner lists; `/chest` stays `'none'`. Tools already set the header behind an admin list. |
| **Mailboxes chosen at install** | Support | `"mail": {"mailboxes": {"min": 1, "max": 3}}` and `mail.mailboxes()`, so a company adds `sales@` without a new version. |
| **Knowing whether mail works** | News, Polls | `mail.capable()` → `{send, perDay, usedToday}`; a per-recipient "skipped" result instead of `invalid_address` thrown. |
| **Group deltas** | News, Wiki | `group.changed` carrying `{added, removed}` member ids; `access.granted` when someone gets a tool. |
| **A manager relation** | Goals, People, Leave | `member.manager`, `members.reportsTo(id)` — or People publishes it and others read it (a request between tools). |
| **Asking another tool a question** | Goals (deals won before the link), People ("what does this person hold?"), Timesheets → Quotes | `tools.query(tool, name, params)`, granted like events, read-only. |
| **Members by role, in one call** | Timesheets, Status | `members.ids({roles})`, or `notify({toRoles})` with a message per language. |
| **Sending to a partner service** | Quotes (the company's approved e-invoicing platform), Booking (payments) | `partners` declared in the manifest, credentials held by the Chest, `partners.send(name, {kind, file, key})` and status events. |
| **Guest accounts** | Quotes (the outside accountant), Polls (external participants) | A time-limited guest with one tool and one role. |
| **Webhooks to customer URLs** | Status (subscribers' Slack or webhooks) | The Chest delivers signed POSTs to URLs subscribers give; the tool never needs open egress. **Now built: §4.17.** |
| **Bulk file export** | Support, News, Wiki | `files.archive(names)` → a signed ZIP download. |
| **Video** | News | A poster frame and size caps in `files`. |
| **OCR / AI on a stored file** | Expenses (receipts the phone cannot read) | `ai` or `ocr.read(object)`. Expenses reads receipts locally in the browser today. |
| **Shorter schedules, or a push** | Booking (busy times up to ~15 min stale) | A 5-minute floor for declared calendars, or a change notification. |

Harness items raised by the same builders are fixed in the studio:
- `--empty` for a first visit;
- `--prod` refuses without a build and warns when the build is older than
  the sources;
- the audit replays screen actions;
- screens and audit accept file uploads.

### 4.17 Notices to outside addresses — `webhooks` (built)

- **Needed by**: **Status** — Statuspage's subscribers get incidents by
  webhook, Slack and Teams, not only email; its README names the
  primitive (`tools/public-and-private/status/README.md`, "`webhooks`")
  and the critique ranks it next after `mail`
  (`reports/05-critique/status.md`, fix 3). **Forms** — Typeform and Tally
  customers pipe answers to Zapier, Make, a sheet script or Slack; its
  README asks for exactly this (`tools/public-and-private/forms/README.md`,
  "Webhooks to a customer's URL"; critique `forms.md` blocker 3).
  **Support** (the `helpdesk` tool) and **Hiring** — "a new ticket" and "a
  new application" posted to a team's channel is the first integration
  Zendesk- and Teamtailor-style tools are asked for; neither README writes
  it yet: that need is ours, from the category, not a builder's report.
- **Why not `network`**: a manifest is written once for every company, a
  customer's address is not known then, and `"network": ["*"]` would turn
  each tool into a way out of the Chest — and into the company's own
  network (SSRF). The tool never connects: the Chest delivers.
- **Working copy**: `sdk/client/src/webhooks.ts` — `add`, `remove`,
  `list`, `enable`, `rotateSecret`, `send`, `journal`, `handle`/`verify`
  of `webhook.disabled` on `POST /chest-webhooks`, and the rules and
  formats as pure functions (`checkUrl`, `checkInput`, `checkMessage`,
  `checkManifest`, `isPublicAddress`, `shownUrl`, `format`, `escapeSlack`,
  `sign`, `verifySignature`); `fakeChest({webhooks: {max, resolve,
  deliver, to}})`, `chest.webhooks` (targets, deliveries with the request
  as sent, events, `respond()`, `retry()`); `sdk/client/test/webhooks.test.ts`
  (6 tests: address rules, the three payloads and the signature by hand,
  ping and idempotent sends, the refusals at add, backoff then
  disable-and-tell, the 8-attempt end); the manifest checker reads the
  permission (`scripts/check-manifest.mjs`); the harness's `/_dev` lists
  targets and the journal (bodies, signatures), makes a target answer 503
  or time out, and plays the retries. SDK 0.3.0-studio.13. No tool uses it
  yet: Status and Forms are the first to wire (both already say "not
  built" rather than fake it).
- **API**:

  ```ts
  type WebhookKind = "generic" | "slack" | "teams";
  add(input: { url: string; kind: WebhookKind; label: string; owner?: string }): Promise<{ id: string; secret: string | null; target: WebhookTarget }>;
  send(targets: string | string[], message: { event: string; text: string; data?: Record<string, unknown>; key: string }): Promise<{ deliveries: { id: string; target: string }[]; skipped: { target: string; reason: "disabled" | "not_found" }[] }>;
  list(): Promise<WebhookTarget[]>;            // state active|disabled, status delivered|failed|disabled|null, lastError, failures
  remove(id: string): Promise<boolean>;
  enable(id: string): Promise<WebhookTarget>;  // after webhook.disabled, once fixed (pings again)
  rotateSecret(id: string): Promise<string>;   // the old secret signs beside it for 24 h
  journal(o?: { target?: string; after?: string; limit?: number }): Promise<{ deliveries: WebhookDelivery[]; next: string | null }>;
  handle(request, { disabled?: (e: WebhookEvent) => void | Promise<void> }): Promise<number>;
  verifySignature({ secret, header, body, now?, tolerance? }): boolean; // the receiver's side
  ```

  Manifest: `"webhooks": {"max": 1 to 1000}`. Deliveries: generic
  `{id, event, text, data, key, tool, created_at}` with `Chest-Webhook-Id`,
  `Chest-Webhook-Event` and `Chest-Webhook-Signature: t=<unix>,v1=<hex
  HMAC-SHA256(secret, "<t>.<body>")>`; Slack `{"text"}` (`&`, `<`, `>`
  escaped); Teams the Adaptive Card envelope a Workflows webhook expects.
  Details, the receiver's snippet and the fake: `sdk/README.md`,
  "`webhooks`".
- **Approval sentence**: "Sends notices to web addresses your admins or
  subscribers give, signed by your Chest (up to 200 addresses)". The owner
  sees each address (host, label, who added it), its state and the
  journal, and can disable any of them.
- **Quotas and limits**: `max` targets; 60 new targets an hour; 1,000
  deliveries an hour per tool, 500 targets a send; text 4,000 characters,
  data 16 KiB; 10 s per attempt; 8 attempts over 24 h (0, 1 min, 5 min,
  30 min, 2 h, 6 h, 12 h, 24 h); 10 failed attempts in a row disable a
  target (at once on 410, or 404 from Slack/Teams); one request a second
  per target, queued. **Journal**: every delivery 30 days (target, event,
  key, attempts, statuses, errors, times — never text or data).
  **Agents** reach the same through the Chest's MCP as the owner's
  reading of the journal (list, disable, enable), never the addresses in
  full.
- **Risks and their bounds**:
  - *SSRF* — the Chest posting into its own or the company's network.
    Bounded: https only; ports 443 or ≥ 1024; no credentials in the
    address; IP literals and names of private, loopback, link-local,
    shared, documentation, multicast and reserved ranges refused, IPv4 and
    IPv6 including IPv4-mapped, NAT64, 6to4 and Teredo forms (the rule is
    `isPublicAddress`, shared by the SDK, the fake and — proposed — the
    Chest); **resolution checked at add and at every attempt, the
    connection pinned to the checked address** (no DNS rebinding);
    redirects never followed; the answer's body never read beyond a short
    error excerpt, never shown to the tool (no blind-SSRF oracle beyond a
    status code). A finding on the way: Node's `BlockList` matches IPv4
    addresses against IPv6 rules as IPv4-mapped, so a single list with
    `::ffff:0:0/96` blocks *every* IPv4 address — two lists are needed
    (a test pins it).
  - *Spam* — a tool, or an anonymous subscriber of a public page, aiming
    the Chest at someone else's endpoint. Bounded: a generic address must
    answer a signed `chest.ping` with a 2xx (someone set a receiver
    there); Slack and Teams addresses must be of their provider's shape,
    and only reach a channel whose member created the hook; per-tool
    quotas and 60 adds an hour; failing targets are disabled; the owner
    sees and can cut any target. A public subscription form should still
    use `visitors.count` (§4.8).
  - *Secrets* — a Slack or Teams address **is** a credential (anyone with
    it posts to the channel). The Chest keeps addresses encrypted, never
    shows them whole again (`shownUrl`: the host only), never logs them;
    the generic signing secret is given once (the tool shows it, stores
    only the id) and rotates with a 24 h overlap. Our own tests trip
    secret scanners with a Slack-shaped placeholder: GitHub push
    protection rejected one; test addresses are now built in parts.
  - *Cost on a small server* — 1,000 deliveries an hour at ≤ 10 s each is
    a queue, not a load; retries are spread over 24 h.
- **Elsewhere** (as a web search showed their documentation on
  2026-09-29; the vendors' own pages were not reachable from this
  machine, so the sources are the search results and third-party guides,
  marked as such):
  - **Stripe** signs `Stripe-Signature: t=…,v1=…`, the HMAC-SHA256 of
    `<t>.<body>`, its libraries refusing a timestamp older than 5 minutes
    ([docs.stripe.com/webhooks](https://docs.stripe.com/webhooks)); it
    retries for up to three days with exponential backoff and then
    disables the endpoint and emails the owner (third-party:
    [Hookdeck's guide](https://hookdeck.com/webhooks/platforms/guide-to-stripe-webhooks-features-and-best-practices)).
    We copied the header's shape — receivers already know it — and chose
    24 h: a company's own receivers are few and watched.
  - **GitHub** sends `X-Hub-Signature-256: sha256=<hex HMAC of the body>`,
    without a timestamp
    ([docs](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)):
    a captured delivery can be replayed. Ours dates the signature.
  - **Statuspage** quarantines a webhook subscriber after 10 failed
    requests in about an hour, 30 s to answer, 3xx a failure, and emails
    the subscriber
    ([Atlassian support](https://support.atlassian.com/statuspage/docs/enable-webhook-notifications/)).
    Our 10 failures in a row and "a redirect is a failure" match it;
    the tool is told (`webhook.disabled`) so Status can do the same email.
  - **Standard Webhooks** (the spec Svix and others follow) signs
    `<id>.<timestamp>.<body>` with a `whsec_` secret, base64
    ([spec](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)).
    We borrowed the `whsec_` prefix; our id is inside the signed body
    rather than in the signed text, which binds it as well for our JSON
    but not for a receiver that trusts the `Chest-Webhook-Id` header
    alone. **To consider before a Chest ships it**: adopting the spec's
    headers exactly would let receivers use its libraries in every
    language.
  - **Slack** incoming webhooks take a JSON `text` (mrkdwn) or `blocks` at
    `https://hooks.slack.com/services/T…/B…/…`; `&`, `<`, `>` must be
    escaped as entities; about one message a second per channel, 429 with
    `Retry-After` beyond; `invalid_payload`, `no_service` (404, the hook is
    gone), `channel_is_archived`
    ([Slack docs](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/),
    [rate limits](https://docs.slack.dev/apis/web-api/rate-limits/),
    [formatting](https://github.com/slackhq/slack-api-docs/blob/master/page_formatting.md)).
  - **Microsoft Teams** retired Office 365 connectors (the old
    `webhook.office.com` addresses) in 2026 — sources disagree on the day
    (March 31 or May 22, 2026); new hooks are Workflows (Power Automate)
    flows whose address is
    `https://<env>.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/<id>/triggers/manual/paths/invoke?…`
    (the `logic.azure.com` addresses stopped on November 30, 2025), and
    they expect `{"type": "message", "attachments": [{"contentType":
    "application/vnd.microsoft.card.adaptive", "contentUrl": null,
    "content": <Adaptive Card>}]}`
    ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook),
    [M365 dev blog](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/),
    [community thread on the two hosts](https://community.powerplatform.com/forums/thread/details/?threadid=c7987e0f-1650-f011-877a-7c1e5258795a)).
    **Assumed, to verify on a real tenant**: that a flow created from the
    Teams "Post to a channel when a webhook request is received" template
    accepts an anonymous POST at the new host (one thread says the new
    host wants a token unless the trigger allows anyone); the shape check
    in `checkUrl` follows the documented path and may need widening.
  - What we do better for a small company: the tool never holds an
    address it cannot keep safe, the owner sees every target in one
    place across tools, and the SSRF rules live once in the Chest instead
    of in each tool.
- **Still missing**: Slack and Teams formatting beyond one text (a title,
  a link button, a colour per event), a "send a test" button on the
  owner's page, delivery of `webhook.disabled` by email to a subscriber
  who has no member account (needs `mail`), and the Standard Webhooks
  headers as an option. `Retry-After` and the one-a-second pacing are
  designed, not faked.

### 4.18 The address of another tool — `chest.toolUrl` (built)

- **Needed by**: the two receivers of Forms' events. **Clients** (`crm`)
  turns `forms.contact` into a contact and keeps the answer's path only
  (`tools/private/crm/lib/from-forms.ts` stores `answer.path` in the
  activity's JSON): it cannot make it a link, so the member sees "from the
  form Contact" with nothing to click. **Support** (`helpdesk`) turns
  `forms.request` into a ticket and links back with `formsLink()`
  (`tools/public-and-private/helpdesk/lib/forms-in.ts`), which *guesses*
  Forms' team host from its own after the Chest's naming scheme
  (`helpdesk-chest.<chest>` → `forms-chest.<chest>`), and gives up — no
  link — on a local harness or any address that does not follow it. The
  guess is wrong the day the owner gives Forms a custom domain, when the
  scheme changes, or when Forms is not installed (a dead link). Every
  future receiver of a tool event (Leave → Rooms, Hiring → People,
  Clients → Quotes, §4.4) will want the same link back.
- **Working copy**: `sdk/client/src/chest.ts` — `toolUrl(name, {surface})`,
  `toolLink(name, path, {surface})`, `readToolUrls(raw)`,
  `toolNamePattern`, types `ToolSurface`, `ToolAddresses`;
  `fakeChest({tools})`, `chest.tools`, `chest.installTool()`,
  `chest.removeTool()`; `sdk/client/test/tool-urls.test.ts` (8 tests: both
  surfaces, names that are not a tool's, addresses that are not origins
  dropped entry by entry, the map's size cap, the tool's own name, the
  paths a link refuses, a rewritten map, the fake's installs and
  removals). SDK 0.3.0-studio.14. No tool uses it yet: Support's
  `formsLink()` becomes `chest.toolLink("forms", path)` and Clients renders
  its stored path the same way, once they are re-vendored.
- **API**:

  ```ts
  type ToolSurface = "team" | "public";
  toolUrl(name: string, o?: { surface?: ToolSurface }): string | null;          // an origin, or null
  toolLink(name: string, path: string, o?: { surface?: ToolSurface }): string | null;
  ```

  null when the tool is not installed, has no such surface (no public
  part, or the owner has not opened it), outside a Chest, for a name that
  is not a tool's, or — for `toolLink` — a path that is not `/chest…` on
  the team host, is under `/chest` on the public host, starts with `//`,
  or is not in the simple form the Chest's front accepts (no `\`, no dot
  segment, no encoded `/`, `\` or NUL, printable ASCII, 512 characters).
- **Transport: an environment variable, `CHEST_TOOL_URLS`** — a JSON map
  `{"forms": {"team": "https://forms-chest.…", "public": "https://forms.…"}}`
  of every installed tool, the public origin only while the part is open.
  Why this and not a signed call (`GET /tools` on `CHEST_API`):
  - it is how the Chest already gives a tool its own addresses
    (`CHEST_TEAM_URL`, `CHEST_PUBLIC_URL`, §4.5): nothing new to run, and
    `CHEST_*` names are refused in a manifest's `env`, so no admin setting
    can shadow it;
  - the answer is synchronous — a link is made while rendering a page,
    often in a server component, where one more await per link and a
    cache to keep are friction; a call would also cost a request per page
    (or a cache with its own staleness) on a 1-CPU sandbox;
  - staleness is harmless both ways: a map older than the latest install
    lacks the new tool (no link — what every tool does today), and one
    older than a removal links to a host the Chest's front answers 404.
    The Chest rewrites the variable when a tool is installed or removed or
    a public part opens or closes; running tools read it at their next
    start. **Not required**: restarting every tool at each install — they
    are rare, admin-made, and the cost of a stale entry is one dead link.
    A Chest that wants it exact restarts idle tools lazily.
  - **Trade-offs accepted**: the map grows with the store (≈150 bytes a
    tool; the SDK ignores one above 64 KiB); a tool learns which tools the
    company installed — which every member already sees on the portal,
    and whose team hosts follow a public naming scheme (Support guesses
    them today), so nothing secret is disclosed. A call would let the
    Chest scope the answer to tools linked by events; we chose not to,
    because a link to a tool the member cannot open is answered by that
    tool's host ("you do not have this tool"), not leaked.
- **Security**: only origins — https, http for `localhost`/`127.0.0.1` —,
  with no credentials, path, query or fragment; any other entry is dropped
  (never the whole map), so a Chest bug cannot make a tool write
  `javascript:` or a foreign path into its pages. `toolLink` refuses a
  protocol-relative path and every form the front would refuse, and
  checks the joined URL keeps the origin. Tools must still store the
  **name and path** they received, never an absolute URL: the origin
  changes with a custom domain (§4.15).
- **Not a capability**: the addresses are what every member sees on the
  portal; no approval sentence. Access is unchanged: a link opens another
  tool only for a member who has it.
- **Elsewhere**: Kubernetes injects `<SERVICE>_SERVICE_HOST`/`_PORT` for
  every service in the namespace at pod start, stale until restart — the
  same trade-off ([Kubernetes docs, "Environment variables"](https://kubernetes.io/docs/concepts/services-networking/service/#environment-variables),
  from memory, not re-read on 2026-09-29); Heroku and Vercel give an app only its own URL, because
  apps there do not share a tenant. The Chest has one: the company.
- **Still missing**: a per-member answer ("does this member have Forms?",
  to hide a link they cannot follow) — `members` answers it only for the
  tool itself; the tool's title ("Open in Forms" in the member's
  language), which the portal knows and the map could carry.

### 4.19 Idempotency keys are never cut — `mail`, `events.publish`, `webhooks.send` (a bug, fixed)

- **The bug.** A retry key was capped at 64 characters of
  `A-Z a-z 0-9 . _ : -`, so the tools that send one email per person built
  `` `${key}:${member}` `` and cut it: `.slice(0, 64)` in Expenses, Goals,
  Leave, Timesheets (`lib/mail.ts`), News and Wiki (`lib/mailer.ts`,
  `lib/mail.ts`), Tasks (`lib/mail.ts`) and Polls (`lib/tell.ts`); Support
  cuts its webhook keys the same way (`lib/notices.ts`). A member id with
  its colon is 31 characters: past 33 characters of the tool's own key the
  cut eats into the recipient, and from 59 the whole id is gone — two
  recipients of one send share a key, and the Chest (and the fake) answered
  the second with the first message: **one email dropped, silently**.
  Reproduced first as a failing test (`sdk/client/test/mail.test.ts`,
  "idempotency: …", a 61-character key: the fake's outbox held Camille's
  email and not Léa's). Rooms showed the other face of the cap: its key
  `` `room:${calendarKey}:${sequence}:${guest}` `` is not cut, so past 64 the
  SDK threw `invalid_message` and its loop `break`s — every later guest
  unmailed (`tools/private/rooms/lib/mail.ts`).
- **What we verified in the tools** (grep of `tools/*/*/lib`, 2026-09-29):
  no key built today reaches 59 characters before its member id (the
  longest own keys are ≈40: `waiting:<mbr_…>`, `read:<page>:<version>:<unix>`),
  so the collision needs longer ids or a longer prefix than today's — a
  latent bug, not one seen in production. Every key a tool builds today
  fits the old pattern once cut, so it goes to the Chest **unchanged**.
- **Fix, chosen**: hash, don't refuse, for keys that only make a retry
  harmless. `idempotencyKey(key)` (`sdk/client/src/api.ts`, exported by
  `mail`) takes any key of 1 to 512 characters without control
  characters; one that already fits (and does not start with `sha256:`)
  goes as is, any other as `sha256:` + the SHA-256 of the whole key in
  base64url (50 characters) — two different keys stay two keys, a retry of
  the same key is recognised, and nothing a tool writes can pose as the
  digest of another key. Refusing an over-long key loudly was the
  alternative; we rejected it because the tool would then have to shorten
  the key itself — the very step that caused the bug — and because an
  address or accented text in a key (a guest's address in Rooms) is
  harmless once hashed. And the Chest now **refuses a key reused within 24
  hours for something else** (`ChestError` `key_conflict`, 409, nothing
  sent): for `mail`, other recipients (the text may differ: a retry
  re-renders); for `events.publish`, another type or other data (data is
  the receivers' contract); for `webhooks.send`, another event on the same
  target (text and data are display, re-rendered). So a tool that still
  cuts its keys hears of the collision instead of losing an email: the
  day each tool is re-vendored, its `.slice(0, 64)` goes.
- **Keys that name a thing are not retry keys**: `calendar` keys (put
  replaces, `remove` and `list` name them back) and `notifications` keys
  (`withdraw`) stay 1–64 and are **refused, never cut or hashed**, beyond
  — a hash would make `list()` answer names the tool never wrote.
  Reviewed and tested: `sdk/client/test/keys.test.ts`.
- **Working copy**: `api.ts` (`idempotencyKey`, `maxKeyLength`), `mail.ts`,
  `events.ts`, `webhooks.ts` (`checkMessage` takes long keys; `keyPattern`
  is the wire's), `testing.ts` (the fake checks the wire key and answers
  `key_conflict`); tests: `mail.test.ts` (the reproduction), `keys.test.ts`
  (4: the digest, events, webhooks, calendar and notifications refusals),
  `events.test.ts` (a publish test now asserts the conflict). SDK
  0.3.0-studio.15.
- **Elsewhere**: Stripe's idempotency keys answer an error when a key is
  reused with other parameters, and take keys up to 255 characters (from
  memory, not re-read on 2026-09-29).

### 4.20 A fake Chest that tests what tools do — `fakeChest({tool, network})`, `clearCaches()` (built)

- **Needed by**: every tool whose tests need their own name — ten test
  files of CRM, Leave, People, Timesheets, Booking and Forms set
  `process.env.CHEST_TOOL` by hand before `fakeChest` (grep of
  `tools/*/*/test`, 2026-09-29), since `events.publish` checks
  `"<tool>.<name>"`; every test that moves a
  member out by hand (`chest.members.splice`, `chest.former.push`) and then
  reads a `lookup` still cached for a minute; and the three tools that
  reach the outside — **Equipment** (Microsoft Graph and login for Intune,
  `lib/intune.ts`), **Booking** (Google, Outlook and iCloud calendars,
  `lib/calendars.ts`), **Quotes** (the French company registry,
  `lib/registry.ts`) — which each inject their own `Fetcher` so a test can
  replace `fetch`: production code shaped by the lack of a fake.
- **Working copy** (`sdk/client/src/testing.ts`):
  - `fakeChest({ tool: "leave" })` sets `CHEST_TOOL` while the fake runs
    (checked against the manifest's name grammar; restored on `close`).
  - `chest.clearCaches()` forgets `members.lookup`'s minute and the theme.
    Invalidating on every hand edit of `chest.members` was the other
    option; arrays a test mutates cannot tell, and a real Chest tells a
    tool by an event — which `emit` already delivers (and `events.handle`
    empties the cache on). An explicit call is honest about that.
  - `fakeChest({ network: { "graph.microsoft.com": request => Response.json(…), "*.icloud.com": … } })`
    and `chest.egress` (each request: method, URL, status or `refused`).
    **Design**: in a Chest the launcher sets `HTTP(S)_PROXY`,
    `NO_PROXY=localhost,127.0.0.1,::1` and `NODE_USE_ENV_PROXY=1`
    (`reference/contract/application-contract.md`, "Declared network
    egress"), and Node ≥ 24.5 routes `fetch` through the Chest's proxy. A
    test cannot do the same: Node reads `NODE_USE_ENV_PROXY` once, at
    start, a proxy for `https:` would need a CA the test trusts, and the
    studio runs Node 22. So the fake **replaces `globalThis.fetch`** while
    it runs, with the proxy's outcome: a declared host (or `*.` name) to
    its handler, redirects followed through declared hosts, `AbortSignal`
    honoured; an undeclared name, an IP literal or a port other than
    80/443 refused as the proxy refuses (`https:` → `fetch` rejects with a
    `TypeError`, as when a proxy refuses the tunnel; `http:` → 403
    `Chest-Egress: refused; reason=…`); `localhost`/`127.0.0.1`/`::1` —
    the fake's own API, a test's server — straight through. The tool's
    code does not change; its injected `Fetcher` can go. Checked before
    anything starts (a wrong host name leaves nothing running); `fetch`
    given back on `close`. **Limits, said**: `node:http(s).request` and
    clients with their own agent are not routed (the Chest's proxy does
    route `node:http(s)`); the proxy's `address`, `limit` and `dns`
    refusals are not played.
  - The `network` contract, `NODE_USE_ENV_PROXY=1` included (Node 24.5+,
    `fetch` and `node:http(s)` only, read at start), is now written in
    `sdk/README.md` ("`network` — the hosts a tool declares").
- **Tests**: `sdk/client/test/network.test.ts` (4: Equipment's two Intune
  calls through plain `fetch`, a wildcard; every refusal and the direct
  hosts; redirects, an abort, a bad host name; `tool` and `clearCaches`).

### 4.21 Which member is this address — `members.matchEmails` (built)

- **Needed by**: **Equipment**. It holds `members`, not `members.email`,
  so it reads only Intune's `userDisplayName` and matches that *name* to
  the Chest's members (`readDevice` and `personByName`,
  `tools/private/equipment/lib/intune.ts`, `lib/importer.ts`) — wrong for
  two Léa Dubois, for "Lea Dubois" without the accent, for a name changed
  after a marriage. Intune's managedDevice also carries the user's
  `userPrincipalName` and `emailAddress` (Graph's resource page that
  `lib/intune.ts` cites; not re-read on 2026-09-29): with `matchEmails`
  the tool reads those and matches exactly. Asking `members.email` for it would give the
  tool every member's address, a permission the owner should not have to
  grant for this. The spreadsheet importer (Snipe-IT's "checked out to"
  email column) has the same need, and so would any tool importing from a
  SaaS it replaces (Clients' contacts that are colleagues, Hiring's
  interviewers from a calendar export).
- **Working copy**: `members.matchEmails(emails) → Record<address as given,
  mbr_id>`, `matchLimits`; `fakeChest` route `POST /members/match`; test in
  `sdk/client/test/testing.test.ts` ("members.matchEmails: …").
- **Contract**: only members who have the tool are matched; nobody, a
  former member and a member without the tool are all left out alike, so
  the answer never says whether an address exists in the Chest outside a
  match — and it never contains an address the tool did not send. Whole
  address, case-insensitive, trimmed; the sign-in address only. 200
  addresses a call (the SDK batches), inside the 600 calls a minute of
  `members`, and **5,000 distinct addresses a day per tool**
  (`QuotaExceeded`), so a tool cannot walk a list of guesses; the Chest
  journals the calls (counts, not addresses).
- **Why no new capability**: what the tool learns is an id of a member it
  can already list, for an address it already holds. The residual risk is
  confirmation — a tool can test a guessed address (`first.last@company`)
  and learn it is Camille's; the daily bound caps it, and a tool that
  wants every address has to ask `members.email` openly. We judged that
  acceptable under `members`; a Chest that disagrees can put it behind
  its own sentence ("Recognises members by an email address it already
  has") at no cost to the API.
- **Still missing**: aliases and secondary addresses (Intune's UPN is
  often not the address people sign in to the Chest with); a match by
  identity provider id (Entra's object id) once the Chest signs members in
  with Microsoft or Google.

### 4.22 Many calendar events at once — `calendar.putMany` (built)

- **Needed by**: **Tasks**. Its calendar sync (`tools/private/tasks/lib/due-calendar.ts`)
  selects up to 5,000 cards and checklist steps with a due date and calls
  `calendar.put` once for each: a first sync of a busy board is thousands
  of calls against the 600 writes a minute, stopped by `RateLimited` and
  resumed at the next run. Rooms (`lib/calendar.ts`, recurring bookings)
  and CRM (`lib/step-calendar.ts`, steps with a date) put in the same
  loop.
- **Working copy**: `calendar.putMany(events) → Put[]`, `limits.perBatch`
  (100); the fake's `PUT /calendar/events`; tests in
  `sdk/client/test/calendar.test.ts` (2: 250 events in three calls, order
  and replacement, a wrong event or a key twice sends nothing; 5,000
  events in 50 calls, a batch over the bound changes nothing, not granted).
- **Contract**: every event checked by the SDK before anything is sent;
  distinct keys; the Chest applies a batch whole or not at all and counts
  it as one write of the minute; beyond 100 the SDK sends batches in turn,
  so an error after the first leaves the earlier ones applied — putting
  again is idempotent by key. **Why 100**: a batch is at most ≈ 1.3 MB of
  JSON (1,000 members and 1,000 characters of description an event, rarely
  near), one transaction the Chest can hold briefly; 5,000 events is 50
  calls, well inside a minute.
- **Still missing**: `removeMany` (a board archived removes its events one
  call each — rarer, and bounded by what the board had).
- **Superseded in part by §4.27 (studio.16)**: the batch is no longer
  whole-or-nothing — each event is answered on its own.

### 4.23 When a former member left — `FormerMember.leftAt` (built)

- **Needed by**: **Expenses**. A claim of someone who left still waits in
  *To approve* and must be paid "on their final pay slip, not by the
  transfer file" (`tools/private/expenses/README.md`, `lib/payments.ts`
  keeps former members out of the transfer file). The accountant needs the
  date to know which pay slip — the tool knows only `status: "former"`.
  People publishes a planned last day (`people.leaving` `{member,
  lastDay}`, `tools/private/people/lib/share.ts`), but only where People is
  installed and before the person goes; the Chest knows the actual date
  in every company. Equipment and Timesheets, which also show "(former
  member)", would say "left on 30 September" too.
- **Working copy**: `FormerMember` gains `leftAt: string | null` (ISO
  instant; `null` from a Chest before it), read from `left_at` in
  `members.lookup`; the fake's `former: [{…, leftAt}]`; tests in
  `network.test.ts` (with `clearCaches`) and the updated lookup tests.
- **Decisions**: a field of `lookup`'s answer, not a call of its own —
  tools already resolve former members there, 200 at a time. Kept after an
  erasure: a date alone names nobody, and the accounts need it after the
  name is gone. Additive: tools that do not read it are unchanged (their
  tests that compare whole `former` objects gain `leftAt: null`).

### 4.24 One email preference per person — `member.mailPreference`, `mail.send({transactional})` (built)

- **Needed by**: three tools that each built the same switch — Tasks
  (`reminders.email_off`, `lib/mail.ts`), Goals (`preferences.email_off`,
  `lib/mail.ts`) and Leave (`staff.email_off`, `lib/mail.ts`) — and every
  other tool that emails members (Expenses, Timesheets, News, Wiki, Polls,
  Rooms) has none: a person who wants less email turns it off three times,
  cannot in six, and each new tool starts mailing them again. The bell's email
  digest of §4.14 needs the same setting on the Chest's side.
- **Working copy**: `Member.mailPreference?: "all" | "digest" | "none"`
  (`member()` from the optional `mail_pref` claim, `members.*` from the
  field), `mailPreferenceOf`; `mail.send` gains `transactional` and answers
  `{…, status: "queued" | "held", skipped, digest}`; `status()` may say
  `held`; the fake applies it and keeps `chest.held`. Tests:
  `mail.test.ts` ("email preference: …"), `member.test.ts`.
- **The minimal shape, and why**: three values, not per-tool or per-kind
  settings — the person decides "how much email from the Chest", once;
  `digest` is the one that lets people keep reading without being flooded,
  and it is the Chest's to build (one email a day gathering the held
  messages, in the person's language). **Read-only for tools**: the Chest
  applies it inside `mail.send`, so no tool can forget it and none can
  override it except by `transactional: true` — for what the person must
  get whatever they chose (a password, a booking's confirmation, a payslip,
  the answer to their own request). The Chest journals the flag and shows
  the owner each tool's share of transactional mail: a tool that marks
  everything transactional is visible. It applies to members only (given
  as `{member}` or by their address); outside addresses keep the
  suppression list. Holding a message back is not an error (`skipped`,
  `digest`, `status: "held"`): existing tools, which treat errors as "mail
  off", keep working. Optional in the types, so no tool's `Member`
  literals break; absent means `"all"`.
- **Corrected in studio.16 (§4.29)**: the README said a tool "keeps no
  email switch of its own". Wrong: Tasks', Goals' and Leave's switches are
  about *which* of their emails a person wants, which the Chest's three
  values cannot say. Both apply — the tool's decides whether it sends,
  the Chest's whether and how the person receives.
- **Still missing**: an unsubscribe link in each non-transactional email
  that sets the preference (RFC 8058 one-click `List-Unsubscribe`, which
  Gmail and Yahoo ask of bulk senders — from memory, not re-read on
  2026-09-29); per-tool exceptions ("none, except Leave").

### 4.25 When an event happened — `events.publish({occurredAt})` (built)

- **Needed by**: **Support** (`helpdesk`) and **Tasks**, which keep what
  the Chest could not take and publish it again from a schedule every 15
  minutes (`tools/public-and-private/helpdesk/lib/ticket-events.ts`, its
  `late` schedule; `tools/private/tasks/lib/card-events.ts`, its `mail`
  schedule `*/15 * * * *` in `chest.proposals.json`); and **Goals**, their
  receiver, which counts solved tickets and done cards per cycle by the
  event's `occurredAt` (`tools/private/goals/lib/sources.ts`, `when(e)`;
  `lib/crm.ts` the same). The Chest stamped `occurredAt` at the publish:
  a ticket solved at 23:55 on a cycle's last day and told at 00:10 was
  counted in the next cycle. The two publishers already carry the true
  time — in their key (`tasks:<card>:done:<time>`) — where no receiver
  can read it.
- **Working copy**: `events.publish(type, data, { key?, occurredAt? })`,
  `occurredAtOf(value, now?)`, `occurredLimits` (`sdk/client/src/events.ts`);
  the wire's `occurred_at`; the fake checks it again, keeps it in
  `chest.published[].occurredAt` and counts it in the key's fingerprint
  (`sdk/client/src/testing.ts`). Test: `events.test.ts` ("publish with
  occurredAt (studio.16): …" — a 20-minute-late event keeps its time, an
  offset is the same instant, another time under the same key is
  `key_conflict`, 25 hours back, 5 minutes ahead, no zone, not a date are
  refused, 30 s ahead is taken, the receiver sees it).
- **Contract**: a `Date` or an ISO 8601 instant with `Z` or an offset
  (a local time is refused: it means nothing to the Chest), stored in UTC;
  at most **24 hours back** — the window in which a key makes a retry one
  event, so a late event is still recognised as the same one — and at
  most **one minute ahead** (the container's clock against the Chest's; the
  Chest checks again against its own). The receiver's envelope does not
  change: its `occurredAt` is the publisher's time when given, the Chest's
  otherwise — no new field, so receivers on an older SDK (whose `verify`
  refuses an envelope with a sixth key) keep working. A retry must give the
  same time: another `occurredAt` under a key is `key_conflict`, as other
  data is.
- **Why not trust any date**: a publisher could back-date without bound
  and rewrite a closed cycle's count; 24 hours covers every retry we saw
  (15 minutes) with room for a Chest down for a night.
- **Still missing**: Support and Tasks keep unpublished events a week.
  Past 24 hours the SDK refuses `occurredAt`; such an event goes without
  it (and its time in `data`, which Goals would have to read). A week's
  window would need the Chest to keep keys a week — possible, not chosen
  until a tool shows a Chest down that long.

### 4.26 Who receives an event — `events.receivers(type)` (built)

- **Needed by**: **Forms**. Its Settings greys "Send contacts to Clients"
  and "Send requests to Support" when nothing would receive them
  (`tools/public-and-private/forms/lib/linked.ts`, `installed()`), but can
  only ask `chest.toolUrl("crm") !== null` — *installed*, not *linked*:
  Clients installed and never linked by an admin to Forms' events shows
  the link as working, and every contact publishes into nothing
  (`receivers: 0` is learned only after a publish).
- **Working copy**: `events.receivers(type) → Promise<string[]>`
  (`sdk/client/src/events.ts`), `GET /events/receivers?type=`;
  `fakeChest({ linked })`, `chest.linked` (what `publish` counts too).
  Test: `events.test.ts` ("receivers (studio.16): …" — linked, installed
  but not linked, an admin links a second tool, another tool's or an
  undeclared type refused, `CapabilityNotGranted` outside a Chest).
- **Shape — a list, not a boolean**: Forms has two links to two tools and
  needs to know *which* tool listens; a list of names (sorted, those
  installed, declaring the type in `receives`, and linked by an admin to
  this tool for it) answers that and "anyone?" (`length > 0`) alike.
- **Only the tool's own types** (`invalid_event` otherwise): a tool learns
  who listens to *it* — which its admin set up, and which `publish`'s
  `receivers` count already half-says — never another tool's links.
- **Not cached by the SDK**: an admin's link should show at the next page;
  a Settings page calls it once per render. Not a capability: it is part
  of `emits`.
- **Still missing**: the tool's title in the member's language ("Clients"
  / "Clients") to write the sentence — the same gap as `toolUrl` (§4.18).

### 4.27 One result per calendar event — `calendar.putMany` (changed)

- **Needed by**: **Rooms**, **Clients** (`crm`) and **Tasks** — all three
  catch the batch's refusal and put it again one event at a time
  (`tools/private/rooms/lib/calendar.ts`, "One the Chest refuses refuses
  the whole batch: then they go one by one"; `tools/private/crm/lib/step-calendar.ts`,
  `putMany`; `tools/private/tasks/lib/due-calendar.ts`, `putAll`): one bad
  date costs up to 100 writes of the minute's 600, and three copies of the
  same fallback.
- **Working copy**: `putMany(events) → PutResult[]`, types `PutResult`
  (`{ok: true, index, key, members, skipped}` or `{ok: false, index, key,
  reason, message}`) and `PutRefusal` (`invalid_event`, `invalid_key`,
  `invalid_id`, `duplicate_key`, `quota_exceeded`), in
  `sdk/client/src/calendar.ts`; the fake's `PUT /calendar/events` answers
  each event (`testing.ts`). Tests: `calendar.test.ts` (3: 250 events in
  order; a wrong date, a bad key, a bad member id, a key twice and a
  non-object each refused alone while the rest is put; new keys past 5,000
  refused one by one while a replacement and the first new key fit;
  `CapabilityNotGranted`) and `keys.test.ts` (a 65-character key answered
  `invalid_key`, never cut).
- **Decisions**: the SDK checks each event and sends only what it accepts;
  the Chest answers each (it checks again). A key given twice in one call
  refuses **both** (the SDK cannot tell which the tool meant; putting the
  last silently hides a bug). Quota: replacements always go, new keys go
  in order until the 5,000th. Still thrown, as they are about the call:
  `CapabilityNotGranted`, `RateLimited`, `Unavailable`, a non-array.
  `index` is there because the key may be the very thing that is wrong.
- **No all-or-nothing option**: none of the three wants it — each puts
  what it can and retries the rest. A tool that needs it checks every
  event with the exported `calendar.check` before calling; an option would
  be a second contract for the Chest to keep with no user.
- **Breaking, said**: from studio.15, `putMany` no longer throws for a
  wrong event. A tool re-vendored without reading the results would mark a
  refused event as put. Each tool's fallback becomes a loop over results
  (`if (!r.ok) …`) the day it is re-vendored; `sdk/AGENTS.md` lists the
  symptom.

### 4.28 Will the Chest deliver? — `mail.available()`, `webhooks.available()` (built)

- **Needed by**: **People**'s start form, which offers to email the
  newcomer their first-day details (`tools/private/people/lib/welcome.ts`)
  and learns that mail is off only by failing a send (`lib/errors.ts`
  turns `CapabilityNotGranted` into "unavailable"); **Forms**, which
  remembers `mail_works` after its first email (`lib/linked.ts`,
  `startOf`); **Support**'s Settings, which shows the Slack/Teams form and
  says "Your Chest cannot send notices to other services yet" only once a
  call has failed with `CapabilityNotGranted` (`tools/public-and-private/helpdesk/lib/notices.ts`,
  `webhooks_unavailable`).
- **Working copy**: `mail.available() → {ok, reason, remainingToday}`
  (`reason`: `not_granted`, `not_connected`, `suspended`, `quota`, null),
  `GET /mail/status`; `webhooks.available() → {ok, reason, targets, max}`
  (`reason`: `not_granted`, `suspended`, null), `GET /webhooks/status`;
  `fakeChest({ delivery })`, `chest.delivery` (mail `ready` /
  `not_connected` / `suspended`, webhooks `ready` / `suspended`), and the
  fake's `send`/`add` follow it. Tests: `mail.test.ts` ("available
  (studio.16): …": ready with the day's count, quota, not connected —
  where `send` is `CapabilityNotGranted` —, suspended, not declared,
  outside a Chest), `webhooks.test.ts` (ready, targets of max, suspended
  refusing `add`, not declared, outside a Chest).
- **Decisions**: never throws for a missing capability — the point is to
  ask before acting, so "no" is an answer, not an error; `Unavailable`
  still throws (the Chest did not answer: the page says "unknown", not
  "off"). A reason, not a boolean: each reason is a different sentence and
  a different person to ask (the owner connects mail; the quota comes back
  tomorrow). A state of a later Chest that is not `ready` reads as
  `suspended`: never a promise to send. A snapshot, said: `send` can still
  fail, and a member's preference may still hold a message back.
- **Still missing**: whether a given *mailbox* can receive
  (`mailboxAddress` null says only that it has no address yet).

### 4.29 README corrections — the tool's own email switch; recipients in keys (fixed)

- **The tool's own switch.** `sdk/README.md` said a tool "keeps no email
  switch of its own". Tasks, Goals and Leave keep one (§4.24), and rightly:
  "no reminders from Tasks" is a choice the Chest's `all`/`digest`/`none`
  cannot express. Now: a tool may keep its own switch for what is specific
  to it; **both apply** — the tool's switch decides whether it sends, the
  Chest's preference whether and how the person receives; the page says so
  when they differ. Same fix in the `member.ts` comment.
- **Keys built from database ids carry the recipient.** The Chest
  remembers a key 24 hours; after a database restore the tool's ids start
  again from the backup, and `subscriber:42` names someone else — the
  Chest answers `key_conflict` or, for the same recipients, the first
  message (nothing sent). **Status** (`tools/public-and-private/status/lib/mailer.ts`,
  keys carry the address) and **Hiring** (`lib/outbox.ts`,
  `message:<id>:<address>`) found it and put the recipient in the key; the
  README now says it under `mail` ("Put the recipient in the key…", for
  `mail`, `webhooks.send` and `events.publish`) and `sdk/AGENTS.md` names
  the restore among the causes of `key_conflict`.

### 4.30 The member's own time zone — `member.timeZone`, `chest.timeZone(member)` (built)

- **Needed by**: **Leave**. Whole days and reminders are computed in the
  Chest's zone (`tools/private/leave/lib/leave-calendar.ts` and
  `lib/busy.ts`, `chest.timeZone()`): for a person in Montreal of a Paris
  company, "today" turns at 18:00 their time, and anything sent at 08:00
  Paris time reaches them at 02:00 (computed, not observed: no studio
  harness has members in two zones).
- **Working copy**: `Member.timeZone?: string` read from the assertion's
  optional `zoneinfo` claim (the OpenID Connect claim for a person's zone)
  and `members.*`' `time_zone` field; `readTimeZone(value)` in `member.ts`
  (IANA names the runtime knows, 64 characters; anything else left out,
  never refusing the member); `chest.timeZone(member?)` — the member's zone,
  else the Chest's; `signAssertion` and the fake's members carry it.
  Tests: `member.test.ts` (2: the claim, odd values left out, the
  validator; `chest.timeZone(member)` and its fallbacks, `today` at 03:30
  UTC is 30 September in Montreal and 1 October for the Chest, `lookup`
  carries it).
- **Decisions**: optional, like `mailPreference` — no tool's `Member`
  literal breaks; read through `chest.timeZone(member)` so a tool never
  forgets the fallback. The README says which zone to use for what: the
  member's for what concerns one person (their leave's days, their
  reminder, "today" on their page), the Chest's for what concerns everyone
  (opening hours, cycles, schedules, the calendar feed's whole days).
- **Still missing**: a schedule per member's zone ("08:00 wherever each
  one is"): a schedule runs in the Chest's zone, so a tool would have to
  run hourly and pick the members whose 08:00 it is.

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

**Reordered for the pitch after the critique (2026-09-29).** The table
above ranks by how many tools use a change; the critique ranks by which
SaaS a company can cancel. Both kept; for the launch, the order is:

| # | Change | Kind | Unblocks | Effort | Risk | Order |
|---|---|---|---|---|---|---|
| A | `mail` send + receive (§4.2, §4.13) | Chest + SDK (built) | Support, Hiring, Booking, Status (the four "No" of the pitch), Leave/Tasks/News by email | L | spam, reputation, phishing (bounded by quotas, mailboxes, cleaning) | 1 |
| B | Calendar bridge `calendar` (§4.11) | Chest + SDK (built) | Rooms, Leave, Booking, Hiring, News, Tasks | M | a bearer feed address (revocable) | 2 |
| C | Web push + email digest of the bell (§4.14) | Chest only | every tool with approvals or assignments | M | notification fatigue (digest by default) | 3 |
| D | Custom domains for public hosts (§4.15) | Chest only | Status, Hiring, Booking, Support | M | certificates, domain takeover (CNAME check) | 4 |
| E | `groups` read (§4.12) | Chest + SDK (built) | News, Polls, Wiki, Rooms | S | the org chart to tools (a permission) | 5 |
| F | Free/busy connector (§4.11 "next step") | Chest + SDK (not built) | Booking, Hiring | L | OAuth tokens held by the Chest | 6 |
| G | `webhooks` to outside addresses (§4.17) | Chest + SDK (built) | Status (subscribers' Slack/Teams/webhooks), Forms (Zapier, Make, Slack), Support, Hiring (a channel told) | M | SSRF, spam, addresses as secrets (bounded: resolution checked and pinned, ping, quotas, encrypted, owner's journal) | 7 |

Deliberately not proposed: WebSockets and background processes (polling
every 20–45 s and schedules covered every case met), outbound network per
tool (only Status's automatic checks needed it — better as a Chest-run
check declared in the manifest), public accounts (no opening-store tool
needs them).
