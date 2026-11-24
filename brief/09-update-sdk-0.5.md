# 9. Update of 7 October 2026 — SDK 0.5.0, and where the official SDK differs from yours

The Chest shipped, between 5 and 7 October, most of what the SDK report
asked for: groups, broadcast, events between tools, public uploads, sealed
values and realtime, plus the mails and pushes of members' notifications.
They are in **`@argentic/chest-sdk` 0.5.0** (tool contract **0.5**), merged
on Chest-SDK `main` (`968292f`, 7 October) and running on the Chest
(`548e697`). **0.5.0 is not on npm yet**: the owner publishes it. Until
then, pack it from `reference/sdk/` (`npm ci && npm pack`), as you do for
your working copy.

`reference/` was refreshed on 7 October (`reference/README.md` lists each
source and commit). This page says what is new, the decisions behind it,
**where the official SDK deliberately differs from your prototypes** — there
your code changes, not the SDK — and what the owner asks next. Where
`brief/02`, `brief/03` or `brief/08` disagree with this page or with
`reference/`, `reference/` wins. How you plan and order the work is yours
(brief/07); note it in PROGRESS.md.

The rules of 0.5.0 are `reference/sdk/README.md` (one section per module)
and `reference/sdk/contract/README.md` (every key of `chest.json`). The
product decisions are in `reference/product/specs/`: `members-and-notifications.md`
(§ 7 groups and broadcast, § 9 phone and push), `mail.md`, `tool-events.md`,
`realtime.md`, `sealed-data.md`, `tool-storage.md`, `addresses.md`
(embedding), `store-chat.md`.

## What 0.5.0 adds

| Module | What | Decision behind it |
|---|---|---|
| `members` | Capability **`members.groups`**: every group of the Chest, and in each the members who have the tool. `members.groups.list({after, limit})` pages `{id, name, size}`; `members.list({group})` pages a group's members; `member.groups` holds all of a member's groups (in the request's assertion: “is she in Sales?” needs no call) | A tool open to everyone (news, polls, wiki, rooms) must offer “the Sales team”. A member without access stays invisible, whatever the group |
| `notifications` | **`broadcast(notice, {to?, except?})`**: one item for everyone who has the tool, or `to: {groups, roles}`, minus `except`, resolved by the Chest. **`translations`** on `notify` and `broadcast`: each member reads their language | A tool never groups recipients by language, never pages through members to tell everyone |
| | **Pace, never a refusal**: ten notices at once to a member, then one every six minutes per tool; beyond, they fold into one grouped item (“37 new notifications”). No call is refused for its pace, nothing is lost | Owner, 6 October: **no fixed caps** anywhere — not on members, groups, recipients or broadcasts. The server's capacity is the only limit |
| | Members get their notifications **by mail** (each, once or twice a day, or none) and **by push** on each device they turn on — the Chest does it; the tool does nothing | One preference, one sender, one switch per member, instead of every tool rebuilding them |
| `events` | **Events between tools**: `"emits"` declares each type with a sentence and its typed fields; `"receives"` names types from any tool; **`events.emit(type, data, {subject, key, occurredAt, audience})`**; the same `handle` on `POST /chest-events` | The owner approves each link (“Quotes → Tasks: A quote is accepted — quote, client, total”); the Chest validates data against the schema, delivers at least once, in order per subject, 72 hours of retries, then a failed delivery an admin can resend |
| `sealed` | **`seal`, `sealMany`, `open`, `openMany`**: a value sealed by the Chest with the tool's key, stored in any text column, opened only on a member's request (`Chest-Opener` ticket), optionally only for some roles; a `context` binds it to its row | Owner, 7 October: the Chest holds the keys (not end-to-end). The owner and admins never see sealed content in the Chest: Data tab, agents, logs, backups and Perseus show **Sealed**. Every open is journaled |
| `files` | **Visitors' uploads**: `uploadUrl("folder/", {public: true, types, maxSize})` from a public route; the browser PUTs to a relative path; the Chest names the file, checks its type by its bytes, paces each visitor | A CV on a careers page, a screenshot on a support form, without the bytes crossing the tool |
| `realtime` + `realtime/client` | **A Chest service**: channels (declared in `chest.json`, joined by rule, role or membership table), **feeds** (a table's committed rows become live events, no SQL), `publish`, `send`, **peers** (members' ephemeral messages: typing, cursors), **presence**, **focus** (`live.focus`, `realtime.online` → who is watching) | The Chest holds every connection, so **the tool sleeps while pages stay open** and wakes only when someone writes. Nothing is missed however long a page is away (7 days of change log, then `resync`). No polling, no socket code in the tool |
| `testing` | `fakeChest` answers all of the above with the Chest's rules: groups, broadcast, emits (`chest.emitted`), tool events (`deliver` with `source`), sealed (`chest.opens`), visitors' uploads, realtime (`chest.realtime.commit`, `drop`, `revoke`, `advance`…) | A tool's tests run without a Chest |

Also new on the platform, nothing to do in a tool:

- **The Chest on the phone**: every portal installs as an app (PWA); a tool
  opens above it on its own address. **Web push**, per device. A push shows
  **the tool and the notification's title, never its body**, on a lock
  screen: never put a secret in a title.
- **Embeddable public pages**: the owner lists the company's sites allowed to
  frame a tool's public face (`acme.fr/careers`), in the tool's Public tab.
  Make public pages work framed and at any address (relative links, as the
  visitors' upload URL already is).
- **Sign-in from a page of any age**: a sign-in page left open for days
  still signs in. Nothing for tools.
- **The official Chat tool** (below).

## Where the official SDK differs from your prototypes — adapt your code

Your proposals proved the needs; the official shapes are now decided. Drop
the studio's versions and move to these.

### Groups

| Yours (`sdk/`) | Official 0.5.0 |
|---|---|
| Manifest `"groups": "read"` | Capability `"members.groups"` (requires `members`) |
| `members.groups.all()` → every group at once | `members.groups.list({after, limit})`, **paged** like members (no count bounds a team) |
| `members.groups.members(id, …)` | `members.list({group: id})` |
| Events `group.changed`, `group.removed` | **No `group.*` events.** Joining or leaving a group the tool sees is `member.updated {changed: ["groups"]}`; a renamed group is read at render. Store group ids, resolve names with `groups.list()` |

### Broadcast

| Yours | Official |
|---|---|
| `broadcast({messages: {en, fr}, path, key, to, except})` | `broadcast({title, body?, path?, key?, translations?}, {to?: {groups, roles}, except?})` — the same notice shape as `notify` |
| Answers `{delivered}` | Answers nothing: the tool learns no head count. To say “sent to 42 people”, count with `members` |
| 30 broadcasts an hour, 100 items a member a day | **No quota.** The pace folds bursts into one grouped item; no call is refused for its pace |

News's manual paging by language (`news/lib/tell.ts`) and every “notify by
batches of 500” go: one `broadcast` with `translations`.

### Events between tools

| Yours | Official |
|---|---|
| `events.publish(type, data, {key, occurredAt})` | **`events.emit(type, data, {subject?, key?, occurredAt?, audience?})`** → `{id, receivers}` (a count) |
| `"emits": ["leave.approved"]` | `"emits": {"leave.approved": {"description": "A leave is approved", "data": {"leave": "id", "member": "member", "from": "date", "to": "date"}}}` — a **schema**: each field typed (`id`, `text`, `number`, `boolean`, `time`, `date`, `member`, `members`, `?` optional). The Chest refuses undeclared, missing or mistyped fields, members the tool never had, data beyond 16 KiB. A type's data only grows; a new shape is a new type (`…v2`) |
| A type namespaced by its publisher; `handle(…, {tools})` | **Types, never tools**: `"receives": ["quote.accepted"]` from whichever tool emits it; the Chest stamps `source`. The owner approves each link |
| No audience | **`audience: {members?, groups?, roles?}`**: who in the publisher may see the item. The Chest intersects it with the receiver's members; the receiver gets `"all"` or a list, and **must show the item to them only** (a confidential deal must not appear on everyone's Goals) |
| `events.receivers(type)` → tool names | No list: `emit` answers how many tools it was written for. Forms' “is Clients linked?” is the owner's approval screen's job, not the tool's |
| Chain deeper than 3 dropped | A chain that passes twice through the same tool and type is told to nobody (automatic, through the handler's context) |
| `occurredAt` 24 hours back | 72 hours back; `subject` gives order per thing (People's and Equipment's own ordering per subject can go); `key` makes `emit` idempotent for 72 hours |

### Realtime: no polling

Your tools refresh every 20–45 s (`components/auto-refresh.tsx`, the kit's
`useAutoRefresh`). That keeps a tool **awake as long as a tab is open**,
which is what sleeping tools exist to avoid, and still shows stale data.
With 0.5.0: declare `realtime` channels and **feeds** on the tables a page
shows, fetch on `joined`, apply rows as they come, refetch on `resync`.
Typing indicators, cursors and “who is editing this page” are **peers**
(`peers.send`, `peers.on`) and **presence**, never round trips through the
tool. Before notifying, ask `realtime.online(ids, {channel})`: those
`watching` already see it. Remove every auto-refresh timer.

### Mail

- **Members get notifications, never mail from a tool.** Every mail a tool
  sends today to a member (task assigned, leave approved, expense to
  review, reminders, digests) becomes `notify` or `broadcast`; the Chest
  mails and pushes them by each member's choice. Drop `mailPreference`,
  member recipients in `mail.send`, `mail.available()` checks for members,
  and digests a tool builds itself.
- **The Chest receives no mail.** No mailboxes, no inbound route, no reply
  threads: Support's and Hiring's inbound mail goes. A tool that wants
  replies from the public shows or sets the company's address (Reply-To).
- **Mail to the public comes later**, through an SDK `mail` send backed by a
  **connector to the company's own provider** (never sent by Argentic, not
  built yet). Keep public mails (booking recap, quote, form receipt,
  candidate message) behind one seam in each tool, and write in the SDK
  report exactly what each needs: recipient, purpose, content, attachments
  (an `.ics`), Reply-To.

### Public uploads and public files

| Yours | Official |
|---|---|
| `uploadUrl(name, {public: true, expiresUnclaimedAfter})` + `files.claim(ref)` | `uploadUrl("folder/", {public: true, types, maxSize})`: **into a folder only**, the Chest names the file (20 random hex characters), so a visitor never replaces one and cannot guess another's. The browser hands the name back with the form; the tool **`stat`s it** before recording it. Delete what no form recorded with your own sweep (or say in the report why the Chest should) |
| `types` optional | `types` **required**, each recognised by its bytes (images, PDF, Office and OpenDocument, archives); plain text and CSV cannot be told and are refused |
| `files.publicUrl(name)`, public files | **Not in 0.5.0.** A visitor's file joins the private files. Images shown on a public page (a form's header, a careers page's logo) still need a need written in the report |

### Sealed values

Your proposals had none. Now: anything sensitive is sealed (below).

## The official Chat tool — do not build a competing one

`chest-by-argentic/chat` (public on GitHub) is the store's team messaging:
channels, direct messages, threads, mentions, reactions, files, search,
every message **sealed**, live through realtime with the tool asleep,
notifications only to those not watching the conversation. Built on the
Perseus starter's stack and SDK 0.5.0. Its decisions are
`reference/product/specs/store-chat.md`.

**Do not build a team chat or a messaging tool of your own.** Study Chat
instead: it is the reference for realtime (feeds, peers for typing,
presence, focus and `online` before notifying), for sealed content with
search (open a page, match in memory), and for notifications with keys and
withdrawals. Tools that need a conversation on a record (a ticket, a
candidate) keep their own comments, built the same way.

## The asks

1. **Every tool on SDK 0.5.0 and `"chest": "0.5"`.** Rebase `sdk/` onto
   `reference/sdk/` (0.5.0 verbatim, your remaining proposals on top,
   `0.5.0-studio.N`), dropping what 0.5.0 now gives and adopting its shapes
   (above). `chest check` says OK for each tool with only official keys.
2. **Realtime instead of polling.** No auto-refresh timer in any tool;
   feeds, publish, peers and presence where a page shows shared, changing
   data. Measure that a tool sleeps with a tab open.
3. **Sealed fields for sensitive data.** IBANs and bank details (Expenses,
   People), salaries and payslips (People), medical or personal notes,
   confidential HR records, candidates' private notes (Hiring) — sealed,
   with `roles` where only some may read them (HR, managers). Keep in clear
   what lists, filters and sorting need. Never log, mail or send to AI what
   you opened.
4. **Keep reporting needs in the SDK report** (`reports/03-sdk-report.md`):
   rewrite its baseline against 0.5.0, move what shipped out of the gap
   list, and say precisely what is still missing — public mail through the
   connector, public files, the calendar feed, webhooks, visitors, anything
   0.5.0's shapes make hard. A need proven by a tool is how the SDK moves.

## Rules that do not change

`reference/` stays read-only: if it is wrong, say so in the SDK report.
Commit and push as brief/07 says; PROGRESS.md records what you verified.
