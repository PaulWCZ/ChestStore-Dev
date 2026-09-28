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
  the company's time zone; every tool hard-coded Europe/Paris. Proposal:
  `CHEST_TIMEZONE` for every tool (read by `schedules.timeZone()` in the
  working copy); it belongs in a small "chest settings" module (zone,
  company name, currency, default language).

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

### `events`
- Fine. Wish: an event when a member's **locale** changes (`member.updated`
  with `changed: ["locale"]`), for tools that cache words.

### Manifest
- **Unknown keys refused** — see summary (4).
- **`title` and `description` are one language.** A French member sees
  "Tasks" on the tile while the tool speaks French inside. Proposal:
  `"title": {"en": "Tasks", "fr": "Tâches"}` (a string stays valid).
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

_(more sections as tools need them: public accounts, public uploads,
payments, events between tools, AI.)_

## 5. Public-facing tools

_(to write with Support, Booking, Hiring, Status)_

## 6. Tools as a suite

_(to write)_

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
