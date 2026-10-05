# Chest SDK

`@argentic/chest-sdk` is what a server tool (tool contract 0.4) embeds to talk
with its Chest: the member the Chest asserts on a request, the Chest itself
(its organization, time zone, language and currency, and where the tool is
reached), the other members who have the tool, the address of the tool's own
database, its private files, the badges and notifications it shows members
inside the Chest, the events of its members' lifecycle, AI models through the
Chest — and, for the tool's tests, a fake Chest. It also publishes the tool
contract ([`contract/`](contract/README.md): what `chest.json` may say, what
the Chest builds, what migrations may do, the policies it adds) and `chest
check`, the Chest's own validator. The SDK has no dependency: it only
imports `node:*`.

```sh
npm install @argentic/chest-sdk
```

Node 22 or later. ESM only, compiled JavaScript with its type declarations.

## Imports

Each module is its own subpath and pulls in nothing else; the root gives them
all, with the files, members, notifications, events, schedules and ai APIs
as the namespaces `files`, `members`, `notifications`, `events`, `schedules`
and `ai` (the testing module is not in the root).

| Import | Gives |
|---|---|
| `@argentic/chest-sdk/member` | `member(request)`, type `Member`: the member of a request on the team host of a server tool, with the language the Chest speaks to them and the zone they work in, read from the `Chest-Member` assertion and verified; `null` without a valid assertion. `memberIdPattern`, `groupIdPattern`, `languagePattern`, `timeZonePattern`: the grammars of the identifiers (`mbr_…`, `grp_…`), of a language and of a zone |
| `@argentic/chest-sdk/chest` | `chest`, type `Chest`: the Chest the tool runs in — `chest.organization.name`, `chest.timeZone`, `chest.language`, `chest.currency`, `chest.today()` — and where the tool is reached — `chest.tool.teamUrl`, `chest.tool.publicUrl` —, the same for every member, on a request or outside one |
| `@argentic/chest-sdk/members` | `list`, `get`, `lookup`, `groups.list`, `forget`, types `MemberPage`, `Lookup`, `FormerMember`, `Group`: the members who have the tool (capability `members`, their addresses with `members.email`) |
| `@argentic/chest-sdk/notifications` | `notify`, `withdraw`, `badge.set`, `badge.setMany`, types `Notice`, `Delivery`, `BadgeCount`, `BadgeWrite`: counters on the tool's tile and items in members' inboxes, inside the Chest (capability `notifications`) |
| `@argentic/chest-sdk/events` | `handle`, `verify`, `acknowledgeErasure`, `memorySeen`, `erasureIdPattern`, types `ChestEvent`, `MemberUpdated`, `AccessRevoked`, `MemberRemoved`, `MemberErased`, `MemberChange`, `Handlers`, `Seen`: the events of the members' lifecycle the Chest posts to the tool's `/chest-events` (`"receives": ["member.*"]`), verified, deduplicated by id, and the acknowledgment of an erasure |
| `@argentic/chest-sdk/schedules` | `handle`, `verify`, types `Run`, `Handlers`, `Seen`: the runs of the tool's schedules (`"schedules"` in `chest.json`) the Chest posts to its `/chest-schedules` at their times, verified, deduplicated by id |
| `@argentic/chest-sdk/ai` | `chat`, `embed`, `models`, `usage`, types `Alias`, `Provider`, `ChatMessage`, `ChatTool`, `ToolChoice`, `ResponseFormat`, `ChatOptions`, `ChatResult`, `ChatChunk`, `ToolCall`, `ToolCallDelta`, `Usage`, `EmbedOptions`, `Embeddings`, `AiModel`, `AiUsage`: AI models through the Chest, on the owner's connectors, metered against the tool's monthly cap (capability `ai`) |
| `@argentic/chest-sdk/database` | `databaseUrl()`: the address of the tool's own PostgreSQL database (capability `database`) |
| `@argentic/chest-sdk/files` | `put`, `get`, `stat`, `list`, `move`, `delete`, `url`, `uploadUrl`, types `FileObject`, `FileData`, `FilePage`: the tool's private files (capability `files`), kept by the Chest, a 15-minute signed link to one (or to its thumbnail), and uploads straight from a member's browser |
| `@argentic/chest-sdk/errors` | `ChestError` (`code`, `status`), `CapabilityNotGranted` (403), `TooLarge` (413), `QuotaExceeded` (429), `RateLimited` (429), `Unavailable` (503), and for AI `AiCapReached` (402), `AiModelNotAllowed` (403), `AiRefused` (422), `AiUnavailable` (502, 503), type `AiUnavailableReason`: what the SDK throws when the Chest does not give what a tool asks |
| `@argentic/chest-sdk/testing` | `signAssertion`, `withMember`, `fakeChest`, types `AssertionOptions`, `FakeChest`, `FakeChestOptions`, `FakeGroup`, `FakeFile`, `FakeFormer`, `FakeNotification`, `FakeEvent`, `FakeRun`, `FakeAi`, `FakeAiModel`, `FakeAiReply`, `FakeAiCall`: for the tool's own tests only |
| `@argentic/chest-sdk` | all of the above but `testing`; `files`, `members`, `notifications`, `events`, `schedules` and `ai` as namespaces |

```ts
import { member } from "@argentic/chest-sdk/member";
import { chest } from "@argentic/chest-sdk/chest";
import { databaseUrl } from "@argentic/chest-sdk/database";
import * as files from "@argentic/chest-sdk/files";
import * as members from "@argentic/chest-sdk/members";
import * as notifications from "@argentic/chest-sdk/notifications";
import * as events from "@argentic/chest-sdk/events";
import * as ai from "@argentic/chest-sdk/ai";
import { CapabilityNotGranted } from "@argentic/chest-sdk/errors";
// or: import { member, chest, databaseUrl, files, members, notifications, events, ai } from "@argentic/chest-sdk";
```

`chest check`, the Chest's validator, is a separate development package,
`@argentic/chest-check`, not published yet (see [Check a tool](#check-a-tool--chest-check)):
this one stays a small runtime client.

Types refer to `node:http` (`IncomingMessage`): a TypeScript project needs
`@types/node`, as any Node project does. Both `moduleResolution` `bundler` and
`nodenext` work.

### Next.js

The SDK runs on the server only — it reads the tool's environment
(`CHEST_TOKEN`, `DATABASE_URL`, `CHEST_API`, `CHEST_TIME_ZONE`…) and uses Node built-ins. Import it
in route handlers, server components or server actions, never in a
`"use client"` module. Webpack and Turbopack resolve the
compiled package with no configuration (no `transpilePackages`):

```ts
// app/chest/api/me/route.ts
import { member } from "@argentic/chest-sdk/member";

export function GET(request: Request) {
  const who = member(request);
  return who ? Response.json(who) : new Response(null, { status: 401 });
}
```

## The contract, in short

A tool is an ordinary web server in a container without network, run by
its Chest. The Chest's front is the only one to reach it; the tool reaches only
what its launcher gives it on `127.0.0.1` (its database, the Chest's API for
its files, its members, its notifications and AI), and the Chest posts it the
events it receives on `/chest-events` and the runs of its schedules on
`/chest-schedules`, through the same launcher. Rights come
from the Chest — the signed member, the capabilities approved for the
version — and the Chest enforces them even outside the SDK:
the SDK makes the calls easier, it is not a security boundary. The contract
itself — every key of `chest.json` and its bounds, what the Chest builds,
what migrations may create, the Content-Security-Policy it adds, Next.js on
a Chest — is [`contract/README.md`](contract/README.md), rendered from the
Chest's own code.

## Check a tool — `chest check`

```sh
# once, in a clone of chest-by-argentic/Chest-SDK (not on npm yet)
npm ci                                   # builds check/ too
npx chest check /path/to/the/tool        # --json for agents and CI
# or, in the tool's repository, a local devDependency
npm install --save-dev /path/to/Chest-SDK/check
npx chest check
```

`@argentic/chest-check` is `check/` of this repository, not published on npm
yet: it runs from a clone.

The Chest's own validator — the code a Chest runs on every repository it
builds, compiled to WebAssembly (1.6 MB, in its own package, `check/` of
this repository, so that a tool's runtime dependencies stay small) — judges the repository as
the Chest would receive it: the files Git tracks or would add, as they are
now, committed or not. It says `OK` with the tool's name, roles, what it
asks and its migrations, or `Refused` with the Chest's reason (`manifest`,
`migrations`, `no_lock`, `newer_chest`…) and the rule broken; exit status 0,
1, or 2 when it could not run (not a Git repository). It reads nothing but
the archive it is given, and needs no network and no Chest. Details:
[`contract/README.md`](contract/README.md#check-a-repository).

`chest.json` names the version of the contract the tool is written for,
`"chest": "0.4"` — the MAJOR.MINOR of this SDK. A Chest older than that
refuses the tool with “This tool needs a newer version of your Chest”;
up to its own version, a key it does not know is refused, never ignored.

## `member(request)` — the member of a request

A tool is an ordinary web server; on its team host, the Chest relays
`/chest` and everything below it with the `Chest-Member` header of the
signed-in member. `member(request)` accepts a Node request (`IncomingMessage`)
or a Web `Request` and returns a `Member`, the type the `members` API
answers too:

```ts
type Member = {
  id: string;            // "mbr_…": the member in this Chest, the same in all its tools
  firstName: string;
  lastName: string;
  name: string;          // "Camille Martin", or the local part of the address without names
  photo: string | null;  // /_chest/members/{id}/photo?v=<rev> on the tool's team host
  role: string | null;   // one of the roles chest.json declares; null if it declares none
  isAdmin: boolean;      // owner or admin of the Chest
  isBuilder: boolean;    // builder of this tool
  groups: string[];      // "grp_…": the groups that give the member this tool
  language: string;      // "en", "fr"…: the language the Chest speaks to this member
  timeZone: string;      // "America/New_York": the zone the member works in
  email?: string;        // only with the capability "members.email"
};
```

or `null`: without the header, on the public host (the Chest never sends an
assertion there and strips a client's), or for any assertion that is not
exactly its own. Checks: compact JWS, header exactly
`{"alg":"HS256","typ":"JWT"}`, HMAC-SHA256 signature compared in constant time
under the key HMAC-SHA256("Chest-Member v2") of the text of `CHEST_TOKEN` —
the Chest's derivation; the label changes when a claim changes meaning or
goes, so an assertion of another shape is refused rather than misread, and
stays when a claim is added —, `aud` equal to
`CHEST_TOOL`, `iat` and `exp` within 5 s, the shape of each claim (`sub` an
`mbr_` identifier, `groups` `grp_` identifiers, `language` a primary tag of
2 or 3 lowercase letters, `time_zone` a zone of `timeZonePattern`; an
unknown claim is ignored). Without
`CHEST_TOKEN` or `CHEST_TOOL`, nobody is a member. The function never throws
for what a request carries.

```ts
import { member } from "@argentic/chest-sdk/member";
const who = member(request);
if (!who) { response.writeHead(401).end(); return; }
```

`id` is the member's identifier in the Chest: random, never an address nor
an account of the sign-in provider, stable when the member changes their name
or address, never given to anyone else. Store it in your data; resolve names
when rendering (`members.lookup`). `photo` is served by the Chest on the team
host to members who have the tool; `role` is the one the Chest gives the
member among those the manifest declares. Only the Chest's front reaches the
container: the signature is a second defence; business rules (who writes
what) remain the tool's.

`language` is the member's own language in the Chest, else the Chest's
default: a BCP 47 primary tag among those the product speaks (`en`, `fr`
today; the SDK accepts any, so a language added to the Chest needs no new
SDK). The tool's private part (`/chest`) speaks it — to this member, on every
request — and offers no language switch of its own; only its public parts,
where nobody is signed in, keep their own switch. The members API answers
it too: a notification or an email to another member is written in *their*
language (`members.get(id).language`), not in the sender's. A tool that does not
speak that language uses its own default. `timeZone` is the zone the member
works in: the one they chose in their profile, else the one their browser
is in, else the Chest's. The members API answers it too, so a tool reminds
each member at their own hour. What is the same for every member — the
organization, the company's time zone — is not the member's: it is the
Chest's (below).

### Times: store in UTC, decide in the Chest's zone, show in the member's

| What | Zone |
|---|---|
| An instant (created, due at, sent at) | stored as UTC: `timestamptz` in PostgreSQL, `Date` in code |
| “Today”, “this week”, a deadline's day, business hours, working days | the company's: `chest.timeZone`, `chest.today()` (the database's `current_date` is the same) |
| A time or a date shown to a member, a personal reminder's hour | theirs: `member(request).timeZone`, or `members.get(id).timeZone` outside their request |

```ts
const who = member(request)!;
const due = await sql`select * from tasks where due_on = ${chest.today()}`; // the company's day
const shown = new Intl.DateTimeFormat(who.language, { timeZone: who.timeZone, dateStyle: "medium", timeStyle: "short" }).format(task.remindAt);
```

## `chest` — the Chest the tool runs in

```ts
import { chest } from "@argentic/chest-sdk/chest";

chest.organization.name; // "Acme SAS": the organization the Chest is of, as its owner wrote it
chest.timeZone;          // "Europe/Paris": an IANA zone, "UTC" until the owner sets one
chest.language;          // "fr": the Chest's own language (a member's is member(request).language)
chest.currency;          // "EUR": the Chest's currency, ISO 4217
chest.tool.teamUrl;      // "https://tasks-chest.acme.argentic.work": where members open /chest
chest.tool.publicUrl;    // "https://status.acme.com": the public part (its custom domain), or null
chest.today();           // "2026-09-30": the date now in the Chest's zone (or chest.today(at))
```

The Chest gives these to every tool in its environment at each start
(`CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`, `CHEST_CURRENCY`,
`CHEST_TEAM_URL`, `CHEST_PUBLIC_URL`), and starts every tool that is awake
again when one changes — the owner changes the first four in Settings →
General; a custom domain served, or no longer, changes the public address —;
a tool asleep reads them when it wakes. The tool never asks its own admin for
the company's name, zone or currency, nor guesses its own address from a
request. They are there outside a
request too: a scheduled job, a start-up task, an export. No capability is
needed: nothing here is more than what the Chest's pages show its members.

- `organization.name` is plain text of 2 to 80 characters: show it in a
  header, a document or an email, never as HTML.
- `timeZone` is the day of “due today” and the hour of a reminder. The Chest
  also makes it the `TimeZone` of the tool's database sessions: there,
  `current_date`, `now()::date` and a `timestamptz` shown as text are in the
  Chest's zone. A session may set its own (`SET TIME ZONE`), for itself.
- `language` is the language of what the tool writes for no one in
  particular: a public page before the visitor chooses, an export's default.
  A page of `/chest` speaks `member(request).language` instead.
- `currency` is the ISO 4217 code of the Chest's currency (`"EUR"` until
  the owner sets one): the amounts of a quote, a price, an expense. Format
  them with `Intl.NumberFormat(language, { style: "currency", currency:
  chest.currency })`.
- `tool.teamUrl` and `tool.publicUrl` are origins, without a path: build a
  link where no request tells the host — an email sent from a scheduled job,
  a calendar feed — with `new URL("/chest/tasks/42", chest.tool.teamUrl)`.
  `publicUrl` is the company's own domain once the owner connected one, else
  the tool's public host; `null` for a tool without a public part. Store
  paths in your data, never these origins: they change.
- `today(at?)` is `YYYY-MM-DD` in the Chest's zone, for now or for an instant
  (`Date` or milliseconds): compare it with dates your database keeps as
  `date`, never with `new Date().toISOString().slice(0, 10)`, which is UTC's.

Each value is read from the environment at each access, and checked: outside a
Chest (a development server without the variables), or for a value the Chest
never gives, reading it throws a `ChestError` with the code `not_in_chest` —
a wrong zone read silently is exactly what this module exists to prevent. In
tests, `fakeChest({chest: {organization, timeZone, language, currency,
teamUrl, publicUrl}})` sets them.

## `members` — who has the tool

A tool that declares `"capabilities": ["members"]` (approved like a
permission: “Sees the name, photo, role and groups of the members who have
access to it.”) reads the members who have it, through the Chest's API
(`CHEST_API`, as for files). `"members.email"`, a permission of its own that
requires `members`, adds their addresses — to these answers and to
`member(request)`.

```ts
import * as members from "@argentic/chest-sdk/members";
const { members: page, next } = await members.list({ q: "cam", limit: 50 }); // by name, then id
const camille = await members.get("mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya");        // Member, or null
const { members: found, former, unknown } = await members.lookup(ids);      // any number of ids
const teams = await members.groups.list();                                  // [{id, name, members}]
```

- **Who**: exactly the members who have the tool now — by a grant, a group,
  open to all, or because they run it (owner, admins, its builders);
  recomputed at every call. `list` and `get` see only them (`get` → `null`
  for anyone else); `lookup` also names those the tool had who no longer
  have it (below).
- **`list({after, limit, q, role, group})`**: ordered by name (accents aside)
  then identifier; `limit` 100 by default, 500 at most; `next` is an opaque
  cursor for `after`, `null` after the last page. `q` finds the start of a
  first name, a last name or a name — and of an address with `members.email`
  —, whatever its case and accents; `role` and `group` keep the members of that
  role or group.
- **`lookup(ids)`**: each identifier once, in the order given: `members`,
  `former` — those the tool had who no longer have it: `{id, name, status:
  "no_access"}`, a member of the Chest who lost access to the tool (“Léa
  Dubois (no access)”: the laptops she holds, the goals that need a new
  owner); `{id, name, status: "former"}`, someone who left the Chest, so a
  record still reads “Camille Martin (former member)”; `{id, name: null,
  status: "erased"}` once the owner had their data erased, rendered “Former
  member” — and `unknown`: an identifier the tool never had (the Chest names
  nobody the tool never had, not even a member of the Chest). The SDK asks 200 at a time and
  keeps each answer a minute in the process (5,000 at most); `forget()`
  empties it, and so does every event of the members' lifecycle
  (`events.handle`).
- **`groups.list()`**: the groups that give the tool, with their members'
  identifiers; never the others.
- Errors: `CapabilityNotGranted` (403), `RateLimited` (429: 600 calls a minute
  per instance), `Unavailable` (503), `ChestError` for the rest (`invalid_id`,
  `invalid_query`).

Store identifiers, resolve names when rendering, never copy them: a copied
name or address goes stale and makes the tool a second directory to erase.

```sql
create table tasks (
  id bigint generated always as identity primary key,
  title text not null,
  assignee text,                                     -- a member id, "mbr_…"
  created_by text not null,
  constraint assignee_is_member check (assignee ~ '^mbr_[a-z2-7]{26}$')
);
```

```ts
const rows = await sql`select * from tasks order by id desc limit 50`;
const people = await members.lookup(rows.flatMap(r => [r.assignee, r.created_by]).filter(Boolean));
```

To search tasks by assignee name: `members.list({ q })` first, then
`where assignee = any($ids)`.

## `notifications` — badges and inbox items

A tool that declares `"capabilities": ["notifications"]` (approved like a
permission: “Shows counters and sends notifications, inside the Chest, to the
members who have access to it.”) tells its members what needs their
attention, inside the Chest only — no email, no push to a phone. Two
primitives:

- a **badge** is a count on the tool's tile in the Chest home and on its row
  in the tools list, for one member (“99+” beyond 99): a state, set again as
  often as it changes;
- a **notification** is an item in a member's inbox (the bell of the Chest):
  the tool's icon and name, a title, a body, and a link that opens a page of
  the tool on its team host.

```ts
import * as notifications from "@argentic/chest-sdk/notifications";

const { delivered, skipped } = await notifications.notify([assignee], {
  title: "New task: fix the door",       // 1 to 80 characters
  body: "Before Friday.\nKeys at the desk.", // 280 characters at most; optional
  path: "/chest/tasks/42",               // under /chest; /chest when not said
  key: "task:42",                        // optional: replace, then withdraw
});
await notifications.withdraw("task:42");             // done: its items go, for everyone
await notifications.withdraw("task:42", [assignee]); // only for those
const shown = await notifications.badge.set(assignee, 3);            // false: no access
const { set, skipped: noAccess } = await notifications.badge.setMany([
  { memberId: assignee, count: 3 },
  { memberId: reviewer, count: 0 },    // 0 clears it
]);
```

- **Who**: only members who have access to the tool now receive either.
  `notify` answers `{delivered, skipped}`, each identifier once in the order
  given; `skipped` holds identifiers the Chest does not know and members
  without access (as for `members`, the two are indistinguishable). `badge.set`
  answers `false` for such a member, `setMany` puts them in `skipped`.
- **`notify(memberIds, {title, body?, path?, key?})`**: 1 to 500 identifiers
  (a duplicate counts once), one inbox item per recipient. `title` is 1 to 80
  characters (Unicode code points), `body` 280 at most (an empty body is
  none). `path` is a page of the tool's private part: `/chest`, or `/chest`
  followed by `/`, `?` or `#`; printable ASCII without spaces or `\`, 512
  characters at most, never `//`, no `.` or `..` segment; the Chest builds the
  link on the tool's team host, so it cannot point anywhere else. `key` is
  1 to 64 of `a-z 0-9 . _ : -`.
- **Replace and withdraw.** A notification with the key of an earlier one, for
  the same member, replaces it: new text, new time, first in the inbox and
  unread again — never a duplicate. `withdraw(key, memberIds?)` removes the
  items of that key, from every member or from those named (1 to 500), once
  the thing they were about is done. It never says what existed.
- **Plain text.** The Chest removes control characters (a tab or a line break
  in a title becomes a space; `body` keeps its line breaks) and the characters
  that reorder text, trims both, and interprets neither Markdown nor HTML.
  Every item shows the tool's icon and name beside it: a tool cannot pass for
  the Chest or another tool. A title that is empty once cleaned is refused.
- **Muting is invisible.** A member may mute the tool in their profile: their
  new items are then dropped, but they still count as `delivered`, and their
  badges stay. The tool never learns who muted it.
- **Badges** go from 0 to 9,999, 0 clears one. `setMany` takes 1 to 500, a
  member at most once.
- **Quotas**, per tool: 1,000 recipients an hour (those with access, muted or
  not), 100 items per member a day (a replacement counts; one recipient at 100
  refuses the whole call), 600 badge writes a minute (each badge of `setMany`
  counts). Beyond, `QuotaExceeded` (429, the Chest answers `Retry-After`); a
  refused call changes nothing.
- **Lifecycle**: a member who loses access loses the tool's items and badge;
  removing the tool removes them all. A member's inbox keeps 500 items for 90
  days.
- Errors: `CapabilityNotGranted` (403), `QuotaExceeded` (429), `Unavailable`
  (503, the Chest not reached, or an answer that is not its own: the call may
  or may not have happened), `ChestError` for the rest (`invalid_id`,
  `invalid_title`, `invalid_text`, `invalid_path`, `invalid_key`,
  `invalid_count`, `invalid_body`) — the SDK refuses these before sending
  anything.

A badge suits a count that goes up and down (tasks assigned, messages
unread); a notification, an event worth a look — with a key, so that it goes
away by itself once handled.

## `events` — the members' lifecycle

A tool that holds `members` and declares `"receives": ["member.*"]` in its
`chest.json` (approved like a permission: “Is told when the members who have
access to it change or leave.”) is told, on its own `POST /chest-events`:

| Event | `data` | When |
|---|---|---|
| `member.updated` | `{id, changed: ("name" \| "photo" \| "role" \| "groups" \| "email" \| "language" \| "timeZone")[]}` | Something the tool sees of a member who has it changed (`email` only with `members.email`; `language` and `timeZone`: the language the Chest speaks to them and the zone they work in — a digest's words and hour) |
| `access.revoked` | `{id}` | The member lost access to the tool but stays in the Chest |
| `member.removed` | `{id}` | The member left the Chest: `lookup` now reads them `former` |
| `member.erased` | `{id, erasure, deadline}` | The owner asked for this person's data to be erased: delete or anonymise what the tool keeps of them before `deadline` (30 days), then `acknowledgeErasure(erasure)` |

A member who gets the tool is no event: the next `list` has them.

```jsonc
// chest.json
{ "capabilities": ["members"], "receives": ["member.*"] }
```

```ts
// app/chest-events/route.ts — at the root, outside /chest: the Chest calls it
// through the tool's launcher, never from a browser (its front answers 404 there).
import * as events from "@argentic/chest-sdk/events";

const seen = {
  has: async (id: string) => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
  add: async (id: string) => { await sql`insert into chest_events (id) values (${id}) on conflict do nothing`; },
};

export async function POST(request: Request) {
  return new Response(null, { status: await events.handle(request, {
    "member.updated": e => refreshCache(e.data.id, e.data.changed),
    "access.revoked": e => sql`update tasks set assignee = null where assignee = ${e.data.id}`,
    "member.erased": async e => {
      await sql`update tasks set created_by = 'erased' where created_by = ${e.data.id}`;
      await events.acknowledgeErasure(e.data.erasure);
    },
  }, { seen }) });
}
```

- **Delivery**: at least once, in no guaranteed order. An event is an
  envelope `{id: "evt_…", type, occurredAt, data}`, signed for this tool
  (`Chest-Event` header, HS256 under a key derived from `CHEST_TOKEN` with
  the label `Chest-Event v1`, naming the event and the SHA-256 of the body,
  60 seconds). Any answer but a 2xx is delivered again, the same event with
  the same id, after 5 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 30 min, then
  every hour, for 72 hours — a restart of the node included. Given up, the
  tool is marked “out of sync” on its page until its next start.
- **`members.list` is the truth.** Reconcile by listing at start (and so after
  being out of sync): events keep a tool current between starts, they do not
  replace reading who has it.
- **`handle(request, handlers, {seen?})`** answers the status to give the
  Chest: 401 for what is not a delivery of the Chest for this tool, 204 for an
  event handled, one already in `seen`, a type without a handler, or one of a
  later Chest (signed, ignored). It reads the body (64 KiB at most): mount it
  before any body parser. A handler that throws leaves the event unseen and
  `handle` throws: answer 500, it comes again. `seen` is the store of the
  handled ids — `memorySeen()` (the default: 10,000 ids in the process, lost
  at a restart) or a table of the tool's own, as above. Make handlers
  idempotent anyway: an event handled but not yet added to `seen` when the
  tool stops comes again.
- **`verify(request)`** is the event of a delivery, typed, or `null`; for a
  tool that routes events itself.
- **`acknowledgeErasure(erasure)`**: `POST /erasures/{erasure}/done` on the
  Chest's API; the owner then sees the tool's part done (“Erased on 3 Oct.”),
  “Overdue” past the deadline otherwise. Again is harmless. Errors:
  `ChestError` `erasure_not_found` (404: an erasure this tool was not told of)
  or `invalid_id` (400), `CapabilityNotGranted` (403), `Unavailable`.

## `ai` — AI models through the Chest

A tool that declares the `ai` capability calls AI models through its
Chest. The Chest's owner connects OpenRouter with the company's own key;
the tool calls models by four **aliases**: `default`, `fast`, `smart`,
`embedding`, each led by the Chest to a model it chose (the owner may choose
another for `default`). The tool names an alias, never a provider's model:
the model changes for the whole Chest without touching code. The tool never
holds a key; the Chest meters every call against the tool's monthly cap.

```jsonc
// chest.json
{
  "capabilities": ["ai"],
  "ai": { "monthly": 20, "models": ["default", "embedding"], "purpose": "Summarises support tickets" }
}
```

| Key | Default | |
|---|---|---|
| `monthly` | 5 | Whole euros a month, 1 to 1,000: what the tool asks; the owner's cap replaces it and may be changed at any time |
| `models` | `["default"]` | 1 to 4 of `default`, `fast`, `smart`, `embedding`: the only aliases the tool may call |
| `purpose` | required | 1 to 120 characters, shown at approval: “Uses AI models through the Chest, up to €20 a month” |

```ts
import * as ai from "@argentic/chest-sdk/ai";

const r = await ai.chat({
  model: "default",
  messages: [{ role: "system", content: "Summarise in two sentences." }, { role: "user", content: ticket.text }],
  maxTokens: 300,                 // 1 to 128,000; 4,096 when not said
  member: who.id,                 // optional: attribution in the Chest's usage log
});
r.text;                           // "" when the model only called tools
r.usage;                          // { input, output, cached, cost } — cost in estimated euros

// Streamed: pieces as they come; breaking out of the loop ends the call.
for await (const chunk of ai.chat({ model: "fast", messages, stream: true, signal })) {
  write(chunk.text);              // chunk.toolCalls, chunk.finishReason, then chunk.usage last
}

// Tools: the model asks, the tool runs them and answers.
const step = await ai.chat({ model: "smart", messages, tools: [{ type: "function", function: { name: "lookup", parameters: schema } }] });
messages.push(step.message);
for (const call of step.toolCalls) messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(await run(call.name, JSON.parse(call.arguments))) });

const { embeddings } = await ai.embed({ model: "embedding", input: ["first text", "second text"] }); // 1 to 256 texts
const mapped = await ai.models();  // [{ alias, model, provider, input, output }] — USD per million tokens
const month = await ai.usage();    // { month: "2026-09", spent, cap, resetsAt }
```

- **`chat(options)`** takes the OpenAI Chat Completions request in camelCase:
  `model`, `messages`, `maxTokens`, `temperature`, `topP`, `stop`, `tools`,
  `toolChoice`, `responseFormat`, `parallelToolCalls`, `seed`,
  `reasoningEffort`, plus `member`, `stream` and `signal`. Messages, tools and
  response formats keep the OpenAI shape (images in `content` parts too); the
  Chest translates them for each provider and never runs a tool. Without
  `stream` it returns `Promise<ChatResult>` `{text, message, toolCalls,
  finishReason, model, usage}` — `message` is the assistant's message to add
  to the conversation, `toolCalls` are `{id, name, arguments}` with the
  arguments as JSON text, `model` is the provider's model. With
  `stream: true` it returns an `AsyncIterable<ChatChunk>` `{text, toolCalls?,
  finishReason?, usage?}`: tool calls come in pieces (`{index, id?, name?,
  arguments?}`: join the `arguments` of the same `index`), the usage in the
  last chunk.
- **Bounds**: a request body of 10 MiB (images included), 16 MiB of answer, a
  call ends after 10 minutes (streamed or not); 60 requests a minute and 8
  streams at once per tool (`RateLimited`). An aborted `signal` throws its
  reason.
- **The cap never overshoots**: before a call the Chest reserves its worst
  case (input and `maxTokens`) against the tool's cap and the Chest's; a call
  that does not fit is refused before anything is spent. Keep `maxTokens` to
  what the answer needs.
- **`embed({model, input, dimensions?, member?})`** gives one vector per text,
  in the order given, and the input tokens and cost.
- **`models()`** gives the aliases the tool declared that the owner mapped,
  with their model, provider and prices; **`usage()`** the tool's month:
  estimated euros spent, the cap in force, and when the month resets.

**AI can stop at any time** — the month's budget spent, no connector, the
provider down. Keep the tool usable without it:

```ts
import { AiCapReached, AiUnavailable } from "@argentic/chest-sdk/errors";

let summary: string | null = null;
try {
  summary = (await ai.chat({ model: "default", messages, maxTokens: 300 })).text;
} catch (error) {
  if (!(error instanceof AiCapReached || error instanceof AiUnavailable)) throw error;
  // summary stays null: show "AI features are paused" and keep the page working
}
```

| Error | Code, status | When |
|---|---|---|
| `AiCapReached` | `cap_reached` 402 | The tool's (`scope: "tool"`) or the Chest's (`scope: "chest"`) monthly cap is spent, until `resetsAt` |
| `AiUnavailable` | `no_connector` 503, `provider_key_invalid` 502, `provider_unavailable` 503 | No connector behind the alias, the provider refused the connector's key, or failed (`reason`) |
| `AiModelNotAllowed` | `model_not_allowed` 403 | An alias the tool did not declare in `models` (the SDK refuses any other name before sending) |
| `CapabilityNotGranted` | `capability_not_granted` 403 | The version does not hold `ai`, or it was not approved |
| `AiRefused` | `content_refused` 422 | The provider's moderation refused the content |
| `RateLimited` | `rate_limited` 429 | 60 requests a minute or 8 streams at once |
| `TooLarge` | `too_large` 413 | A body beyond 10 MiB, or a context beyond the model's |
| `ChestError` | `invalid_body`, `invalid_request` 400 | A malformed request (the SDK refuses most before sending), or parameters the provider rejected (its message in the error's) |
| `Unavailable` | `unavailable` 503 | The Chest not reached, or an answer that is not its own; in a stream, the stream cut |

An error in the middle of a stream is thrown where it comes, after the chunks
before it.

## `databaseUrl()` — database of a server tool

A tool that declares `"capabilities": ["database"]` in its `chest.json`
gets a PostgreSQL database of its own (the capability is shown and approved
like a permission, in the approval screen). The container has no network: its
launcher listens on `127.0.0.1` and relays each connection to the Chest. The
launcher sets `DATABASE_URL` —
`postgres://<user>:<password>@127.0.0.1:<port>/<database>?sslmode=disable`,
the user and the database both named `t_<tool>`, or `pb_<project>` in the
preview of a draft Perseus Code builds — and `PGHOST`, `PGPORT`,
`PGUSER`, `PGPASSWORD`, `PGDATABASE`, which take precedence over a variable of
the tool with the same name. `databaseUrl()` returns `DATABASE_URL` when it has
exactly this shape, and throws `CapabilityNotGranted` otherwise (a version
without the capability, or a `DATABASE_URL` of the tool's own). The value is a
secret: never log it, never send it to a browser.

The SDK carries no PostgreSQL client: the tool picks its own, for example
[`postgres`](https://github.com/porsager/postgres) (porsager, no dependency) or
[`pg`](https://node-postgres.com):

```ts
import postgres from "postgres";
import { databaseUrl } from "@argentic/chest-sdk/database";
const sql = postgres(databaseUrl(), { max: 5 });
const notes = await sql`SELECT id, text FROM notes ORDER BY id`;
```

Ten connections at most per instance; a query longer than 30 s, a transaction
idle longer than 60 s are interrupted by the Chest. **Migrations**: the
repository's `migrations/NNNN_name.sql` files
(`^[0-9]{4}_[a-z0-9_-]{1,64}\.sql$`, 256 at most, 1 MiB each) are run by the
Chest, in order, each in its own transaction, at install and at every update,
before the new version receives traffic; a failing file keeps the version in
service. The Chest keeps the list of files run (table `chest_migrations`): a
version that loses one or changes one is refused. A migration must leave the
previous version working — going back to the previous version undoes nothing.

## `files` — files of a server tool

A tool that declares `"capabilities": ["files"]` (approved like a permission)
keeps private files **through its Chest**, never on its disk (the container's
root is read-only). The launcher gives the tool
`CHEST_API=http://127.0.0.1:<port>` — its own port, relayed to the Chest; the
container has no network — and the instance is the identity: the tool reaches
its own files only.

```ts
import * as files from "@argentic/chest-sdk/files";
await files.put("photos/cat.png", bytes, "image/png");       // Uint8Array or text
const file = await files.get("photos/cat.png");              // {data, type, size} or null
const info = await files.stat("photos/cat.png");             // {name, type, size, sha256, updated, width?, height?} or null
const { files: page, next } = await files.list({ prefix: "photos/" }); // 1000 per page
await files.move("photos/cat.png", "archive/cat.png");       // atomic; replaces archive/cat.png
await files.delete("archive/cat.png");                       // true, or false if it did not exist
const { url, expiresIn } = await files.url("photos/dog.png", { thumbnail: 256 });
```

A name: up to 8 segments of 1 to 100 letters, digits, `.`, `_` or `-`,
separated by `/`, none starting with `.` or `-`; refused before anything is
sent otherwise (`ChestError`, `invalid_name`).

### Limits

Per tool: 1 GiB, 10,000 objects and 32 MiB per object, unless its manifest
asks otherwise — approved by the owner like any permission, and a later
version that asks more is approved again:

```jsonc
// chest.json
{ "capabilities": ["files"], "files": { "quota": "5 GiB", "maxObject": "100 MiB" } }
```

`quota` goes from 100 MiB to 100 GiB (10 GiB and more allow 100,000 objects),
`maxObject` from 1 to 512 MiB; the owner or an admin may also set the quota
by hand. The SDK refuses beyond 512 MiB before sending anything; the Chest
holds the tool to its own bounds (`TooLarge`, `QuotaExceeded`). `put` and
`get` carry the bytes through the tool's server: for large files, let the
browser upload them itself.

### Uploads from a member's browser

The bytes go from the browser to the Chest directly, never through the tool.
The tool authorises one upload, in a `/chest` route, once `member()` said who
asks:

```ts
// Server side: app/chest/api/invoices/upload/route.ts
const up = await files.uploadUrl("invoices/2026/0042.pdf", {
  maxSize: 10 << 20,                // bytes; the tool's largest object when not said
  types: ["application/pdf"],       // up to 8, "image/*" for a family; any when not said
  expiresIn: 300,                   // 1 to 900 seconds; 900 when not said
});
// → { url, method: "PUT", expiresIn }: hand it to the member's browser
```

```ts
// Browser side, on a page under /chest: the member's session goes with it
const response = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
// 201 {name, type, size}; 403 invalid_token (used, expired), 415 type_refused,
// 400 type_mismatch, 413 too_large, 429 quota_exceeded, 401 without a session
```

```ts
// Server side, when the browser says it is done
const info = await files.stat("invoices/2026/0042.pdf"); // null if nothing came
```

`url` is `https://<tool's team host>/_chest/files/upload/<token>`: the same
origin as the tool's `/chest` pages, so no CORS. The token is signed by the
Chest and binds the name, the size, the types and the expiry; it serves once.
A name ending in `/` is a folder: the Chest then names the object (20 hex
characters and an extension from its type) and answers its name. The Chest
checks the declared size before reading, drops the body at the first byte too
many, and for images, PDFs and archives checks that the first bytes are of the
type sent; nothing of a refused upload remains. There is no antivirus scan.
`uploadUrl` answers `Unavailable` while the Chest does not know the tool's
team host yet.

### Links and thumbnails

`url(name, {thumbnail?, download?})` signs a link to the file as it is, on the
tool's **team host** (`/_chest/files/…`): whoever has it opens it without
signing in for 15 minutes, or until the file changes or goes; the Chest serves
it in a sandbox, displayed for an image, a PDF or plain text, downloaded
otherwise, or always downloaded with `download: true`. `thumbnail: 256` or
`1024` links to the image reduced to that many pixels (JPEG, PNG, GIF — its
first frame — and WebP up to 40 megapixels; `ChestError` `no_thumbnail`
otherwise); thumbnails are made once, not counted in the quota. `stat` gives
`width` and `height` for these images. Give a link to a member's browser,
never to a public page.

Every file the Chest answers (`put`, `stat`, `list`, `move`) carries
`sha256`, the digest of its content in hex, as the Chest took it: compare
it, or detect a duplicate receipt, without reading the file again.

The SDK takes a link or an upload address from the Chest only in `https`
on the team host, or on the origin of the Chest's API itself (`CHEST_API`,
`http://127.0.0.1:<port>`): the address the tool already sends every call
to, where only a fake Chest (`@argentic/chest-sdk/testing`) serves its
links. A real Chest never answers one there, and no other local address is
ever taken — so a tool a test starts in its own process (`next start` with
the fake's environment) takes the fake's links as the test itself does.

Errors: `CapabilityNotGranted` (a version without the capability, or no
`CHEST_API`), `TooLarge` (413), `QuotaExceeded` (429), `Unavailable` (the
Chest not reached, or an answer that is not its own: a write may or may not
have happened), `ChestError` for the rest (`invalid_type`, `no_thumbnail`,
`not_found` for `url` and `move`…). Removing the tool removes its files; a new
version keeps them.

## `schedules` — work the tool does by itself

Nothing runs in a tool's container between requests — the Chest puts a tool
nobody uses to sleep —: a morning digest, reminders, a purge or a badge kept
true overnight come from the Chest, which calls the tool at set times. The
tool declares each schedule in its `chest.json`, a name and a cron line read
on the wall clock of the Chest's time zone (`chest.timeZone`), approved in
words (“Runs by itself: morning, weekdays at 7:30 AM”):

```jsonc
// chest.json
{ "schedules": [{ "name": "morning", "cron": "30 7 * * 1-5" }, { "name": "retry-mail", "cron": "*/15 * * * *" }] }
```

```ts
// app/chest-schedules/route.ts — at the root, outside /chest: the Chest calls
// it through the tool's launcher, never from a browser (its front answers 404 there).
import * as schedules from "@argentic/chest-sdk/schedules";
import { chest } from "@argentic/chest-sdk/chest";

export async function POST(request: Request) {
  return new Response(null, { status: await schedules.handle(request, {
    morning: async () => { await sendDigest(chest.today()); },
    "retry-mail": () => retryOutbox(),
  }, { seen }) });
}
```

- **The line**: five fields — minute, hour, day of the month, month, day of
  the week —, each numbers, `*`, ranges (`1-5`), lists (`1,15`) and steps
  (`*/15`); Sunday is 0 or 7; no names nor `@daily`, one space between
  fields. When both days are restricted, either one runs (as cron). A time
  a change of clock skips runs once, shifted; a repeated one runs once.
- **Bounds** (the Chest's, checked when the manifest is read): 8 schedules,
  names of 1 to 32 lowercase letters, digits and hyphens, each running 15
  minutes apart at least; 5 minutes a run.
- **Approval**: running by itself is a permission, one sentence per
  schedule. A later version that changes, adds or removes schedules of a
  tool that already had one asks nothing more.
- **Delivery**: `POST /chest-schedules`, the tool woken first when it
  sleeps, body `{id: "run_…", name, scheduledAt, attempt}` signed for this
  tool (`Chest-Schedule` header, HS256 under a key derived from
  `CHEST_TOKEN` with the label `Chest-Schedule v1` — the scheme of events,
  under a key of its own —, naming the run and the SHA-256 of the body, 60
  seconds). `scheduledAt` is the time the run stands for (UTC); a run asked
  now stands for the time it was asked.
- **Answer once the work is done**, within 5 minutes: a 2xx is done; a 404
  (a schedule without a handler) is given up at once; anything else, or no
  answer, is delivered again, the same run with the same id, after 1, 5 and
  15 minutes (`attempt` 2 to 4), unless the next time of its schedule comes
  first. Runs of one schedule never overlap: a time that comes while the
  previous run still runs is skipped. A server that was stopped runs a
  missed time once when it starts again — the latest, never a backlog.
  Longer work: do a batch per run and keep your place in the database.
- **`handle(request, handlers, {seen?})`** answers the status to give the
  Chest: 401 for what is not a run of the Chest for this tool, 404 for a
  schedule without a handler, 204 for a run handled or one already in
  `seen`. It reads the body (1 KiB at most): mount it before any body
  parser. A handler that throws leaves the run unseen and `handle` throws:
  answer 500, it comes again. `seen` is as for `events` (`events.memorySeen`
  by default; a table of the tool's for runs that must never be done twice —
  the same table serves both, the ids never meet). Make handlers idempotent
  anyway.
- **`verify(request)`** is the run of a delivery, or `null`; for a tool that
  routes runs itself.
- **The Chest's times, the members' zones**: a line is the company's clock.
  To reach each member at *their* 8:00, run hourly (`0 * * * *`) and pick
  the members whose local hour it is (`members.list`, `member.timeZone`).
- **Whoever runs the tool** sees each schedule on its overview — when it
  runs next, its last runs and why one failed — and may **Run now**; an
  agent reads `GET /api/v1/tools/<tool>/schedules` and runs one with
  `POST /api/v1/tools/<tool>/schedules/run {name}` (a token that writes).

## `testing` — a tool's own tests

`@argentic/chest-sdk/testing` is for tests, never imported by production code.

```ts
import { fakeChest, signAssertion, withMember } from "@argentic/chest-sdk/testing";

const camille = { id: "mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya", firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "editor", isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "Europe/Paris" };
const chest = await fakeChest({ members: [camille], capabilities: ["members", "files", "notifications", "ai"], ai: { reply: () => "Summary." } });
const response = await handler(withMember(new Request("http://tool.test/chest/tasks"), camille));
assert.equal(await chest.emit({ type: "member.erased", data: { id: camille.id, erasure: "era_k2qhx4mzc7v3b6nfp5r2t7w4ya", deadline: "2026-10-28T10:00:00Z" } }, request => handler(request)), 204);
assert.deepEqual(chest.acknowledged, ["era_k2qhx4mzc7v3b6nfp5r2t7w4ya"]);
assert.deepEqual((await members.list()).members.map(m => m.id), [camille.id]);
assert.ok(chest.files.has("reports/2026.pdf"));
assert.deepEqual(chest.notifications, [{ member: camille.id, title: "New task", path: "/chest/tasks/42", key: "task:42" }]);
assert.equal(chest.badges.get(camille.id), 1);
assert.equal(chest.ai[0]?.path, "/ai/chat");
assert.equal(await chest.run("morning", request => handler(request)), 204);
await chest.close();
```

| Function | Gives |
|---|---|
| `signAssertion(member, {token?, tool?, now?})` | A `Chest-Member` header value signed like the Chest's for that `Member` (the token and tool of the environment by default), signed as given, so a language or a zone the Chest never sends makes `member()` refuse it |
| `withMember(request, member, options?)` | The request carrying that assertion (the options of `signAssertion`): a new Web `Request`, or the same Node request |
| `fakeChest({members?, former?, groups?, capabilities?, receives?, files?, ai?, chest?})` | An HTTP server on `127.0.0.1` that sets `CHEST_API`, `CHEST_TOKEN`, `CHEST_TOOL` (`tool` unless set), the Chest's `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`, `CHEST_CURRENCY`, `CHEST_TEAM_URL`, `CHEST_PUBLIC_URL` (`chest: {organization, timeZone, language, currency, teamUrl, publicUrl}`: `"Test organization"`, `"UTC"`, `"en"`, `"EUR"`, `https://<tool>-chest.chest.test`, `https://<tool>.chest.test` by default; `publicUrl: null` for a tool without a public part) and answers members, groups, files, badges, notifications, AI and erasure acknowledgments with a Chest's bounds, quotas and errors; a capability left out answers 403 (`members`, `files`, `notifications` and `ai` by default; `members.email` adds the addresses; `receives` is `["member.*"]` by default, `[]` refuses acknowledgments). `former: [{id, name?, status?}]` are those the tool had who no longer have it: `lookup` answers them `no_access`, `former` (by default) or `erased` |
| Links and uploads | The fake serves the team host's part of the files on its own origin (`chest.api`): a link from `files.url` opens the content it was signed for (the image itself for a thumbnail — a fake does not reduce it; `no_thumbnail` for a file that is not a JPEG, PNG, GIF or WebP image), until it expires or the file changes; an address from `files.uploadUrl` takes one `PUT`, within its life, of the types and size it names and whose first bytes are those of its type (403 `invalid_token`, 415 `type_refused`, 400 `type_mismatch`, 413 `too_large`, as the Chest's), named by the Chest in a folder (20 hex characters and the type's ending), and answers `201 {name, type, size}`. It checks no session: a test's `fetch` is the member's browser |
| `chest.emit(event, to)` | Delivers an event (`{type, data, id?, occurredAt?}`: a new id and now by default; name an id to deliver the same event twice) signed as the Chest signs it, to `to` — the tool's address (`POST <to>/chest-events`) or a function of a Web `Request` — and says the status it answered. A `member.erased` makes its erasure one the tool may acknowledge |
| `ai: {models?, reply?, cap?, unavailable?}` | The fake Chest's AI, deterministic and without any provider. `models`: the aliases the tool declared, `{alias, model, provider?, input?, output?}` (all four by default, `fake-default`…`fake-embedding`, provider `openrouter`, 1 and 2 USD per million tokens); another alias answers `model_not_allowed`. `reply(request)`: what a chat answers, given the wire request — a string, or `{text?, toolCalls?: {name, arguments, id?}[]}` (by default the last user message, echoed); streamed, it comes word by word, each tool call's arguments in two pieces, then the finish reason and the usage. Embeddings are unit vectors from a hash of each text (8 dimensions unless `dimensions`). Tokens count one per 4 characters; once the spending reaches `cap` (euros, 5 by default; 0 refuses at once) a call answers `cap_reached`. `unavailable` (`no_connector`, `provider_key_invalid`, `provider_unavailable`) makes chat and embeddings answer it. 60 requests a minute |
| `chest.run(name, to, {id?, scheduledAt?, attempt?})` | Delivers a run of the schedule `name` (a new id, now and attempt 1 by default; name an id to deliver the same run twice) signed as the Chest signs it, to `to` — the tool's address (`POST <to>/chest-schedules`) or a function of a Web `Request` — and says the status it answered |
| `chest.ai` | The tool's calls to AI, `{path, body}` in order (`body` null for a `GET`) |
| `chest.acknowledged` | The erasures the tool acknowledged, each once |
| `chest.members`, `chest.groups`, `chest.files` | What the fake Chest holds, to change or assert on; its `members` are those who have the tool |
| `chest.notifications`, `chest.badges` | What the tool sent: the items kept, `{member, title, body?, path, key?}` cleaned as the Chest cleans them, in the order sent (a replaced item removed, the new one last; `withdraw` removes), and each member's badge (`Map` member → count; 0 removes it) |
| `chest.close()` | Stops it and restores the environment |

## Version

The package version is `version` in `package.json` (semver), published by a
tag `vX.Y.Z` (see `PUBLISHING.md`). Its MAJOR.MINOR is the version of the
tool contract it is written for (`"chest"` in `chest.json`): 0.4.x for the
contract 0.4. A new contract version is a new MINOR of the SDK.

## The MCP server

The MCP server an assistant runs to work on a Chest, `@argentic/chest-mcp`,
lives in its own repository:
[chest-by-argentic/Chest-MCP](https://github.com/chest-by-argentic/Chest-MCP).

## What this repository is not

This repository is public and **is not a tool**: it has no `chest.json`, and a
Chest's catalogue — which only lists the organisation's public repositories
that carry a manifest — never offers it.

## Develop

```sh
npm ci
npm test               # build dist/, compile the tests into build/, check that
                       # contract/README.md says what contract.json says, run them,
                       # then check/'s (the chest command)
npm run check:package  # npm pack both packages, the SDK under 200 KiB, install into a
                       # temp project, run chest check, import every subpath from Node
                       # and through esbuild, type-check a TS consumer
```

`contract/contract.json`, `check/check.wasm.gz` and
`check/check.wasm.sha256` are written by the Chest's repository
(`scripts/build-contract.mjs`) from the code that decides; never edit them
here. `npm run contract` renders the parts of `contract/README.md` they say;
the words around them are written here. `check/` is the workspace of
`@argentic/chest-check`, released with the SDK under the same version
(`PUBLISHING.md`); `check/src/cli.ts` is the `chest` command.

`client/src` holds the modules, `client/index.ts` the package root,
`client/test` the tests. `npm run build` compiles `client/index.ts`, the
nine published modules (`errors`, `member`, `members`, `database`, `files`,
`notifications`, `events`, `ai`, `testing`) and the one they share (`api`, the Chest's API) —
TypeScript strict, ES2022, NodeNext — into `dist/`: ESM `.js`, `.d.ts` and
their maps. `member.ts` imports nothing but `node:*`, so that a tool may copy
it alone.
The package stays dependency-free (`node:*` only) and reaches nothing but the
Chest's API on `127.0.0.1`. `AGENTS.md` is a usage guide for AI agents
building a tool with this package.

## Licence

MIT (`LICENSE`), © 2026 Argentic.

---

# Studio proposals (not in 0.4.1)

Everything above is the README of the published `@argentic/chest-sdk`
0.4.1, word for word. This package is **0.4.1-studio.1**: that release,
unchanged, plus the studio's proposals — what the store's tools needed that
0.4.1 does not give. Each is designed as it would ship: a module or an
export, its route on the Chest's API, a fake in `testing`, its tests. On a
real Chest these routes do not exist yet: a call throws
`CapabilityNotGranted` or `Unavailable` (or, for `chest.theme()`, answers
the tool's own look), and the tool stays useful without them. Nothing here
is published.

## How the proposals sit on 0.4.1

- **0.4.1 is taken verbatim, file for file.** `client/index.ts`,
  `client/src/*`, `client/test/*`, `contract/`, `scripts/check-package.mjs`,
  `scripts/contract.mjs`, this README's part above and `AGENTS.md`'s are
  0.4.1's bytes (`diff -r` against the release, `check/` aside, shows only
  the studio's own files). `npm test` runs 0.4.1's tests unchanged beside
  the studio's (`client/studio/test/`).
- **The proposals live in files of their own**, under `client/studio/`.
  Where a proposal adds to an official module, the studio's module
  re-exports the official one — every official name is the official value,
  which a test checks — and adds its names: `member`, `chest`, `members`,
  `files`, `notifications`, `events`, `testing`. The package's subpaths
  point to them; `errors`, `database`, `schedules` and `ai` point to 0.4.1's
  modules as they are. The studio's own modules — `mail`, `calendar`,
  `webhooks`, `visitors`, `checks` — are subpaths of their own. The root
  (`client/studio/index.ts`) is 0.4.1's root with these in place.
- **Two names are defined again, and hand 0.4.1's part to 0.4.1's code**:
  `events.handle` (a member event goes to 0.4.1's `handle`, unchanged; an
  event of another tool or of the Chest's groups to the studio's handlers)
  and `members.groups` (its `list` is 0.4.1's function; `all`, `members`,
  `of` are the proposal's). `chest` is a new object whose official members
  are getters of 0.4.1's (`chest.currency === official chest.currency` at
  every read) beside the studio's.
- **The fake Chest is 0.4.1's, with the studio's in front.** `fakeChest`
  starts 0.4.1's fake and a second server, the studio's, which answers the
  proposals' routes and passes everything else to 0.4.1's fake as it came
  (see "`testing`" below).
- **Manifest keys of the proposals stay out of `chest.json`**: a 0.4 Chest
  refuses a key it does not know (contract, "Versions"). They live in each
  tool's **`chest.proposals.json`** — `mail`, `calendar`, `groups`, `emits`,
  `receives` (events of other tools and `group.*`), `files`
  (`publicUploads`, `publicFiles`), `checks`, `webhooks`, `translations` —
  which the studio's `scripts/check-manifest.mjs` validates; `chest.json` is
  judged by 0.4.1's `chest check` alone.
- **Signed deliveries use 0.4.1's one mechanism** (`src/signed.ts`): the
  studio's channels (`Chest-Mail`, `Chest-Check`, `Chest-Webhooks`) are
  `Channel`s of their own (`client/studio/signed.ts`) verified with 0.4.1's
  `delivery()`, and their `handle` takes a `seen` store as 0.4.1's events
  and schedules do (`memorySeen` by default).

### What 0.4.1 now gives, the studio dropped (0.3.1-studio → 0.4.1-studio)

| The studio had | 0.4.1 gives |
|---|---|
| `schedules` (`/chest-jobs/<name>`, `Chest-Job v1`, `Run.timeZone`, `parseCron`, `nextRun`, `describeCron`, `checkSchedules`), `fakeChest({schedules})`, `chest.run()` on `/chest-jobs`, `chest.runs` | `"schedules"` in `chest.json`, `POST /chest-schedules` signed `Chest-Schedule`, `schedules.handle(request, handlers, {seen})`, `Run` `{id, name, scheduledAt, attempt}` (the zone is `chest.timeZone`), `fakeChest().run(name, to, {id, scheduledAt, attempt})`; `chest check` validates the cron lines |
| `chest.currency` (EUR when unset), `chest.teamUrl`, `chest.publicUrl` (null outside a Chest) | `chest.currency`, `chest.tool.teamUrl`, `chest.tool.publicUrl` (they throw `not_in_chest` outside a Chest, like the others) |
| `fakeChest({chest: {currency, publicUrl}})` set only when named; `CHEST_TEAM_URL` = the fake's origin | `fakeChest({chest: {organization, timeZone, language, currency, teamUrl, publicUrl}})`: EUR, `https://<tool>-chest.chest.test`, `https://<tool>.chest.test` by default, `publicUrl: null` for none |
| `former: [{id, name?, erased?}]` | `former: [{id, name?, status?: "no_access" \| "former" \| "erased"}]`; lookup's `no_access` entries |
| the fake's own links and uploads (`<origin>/_chest/files/<b64>.fake`, `.up` tokens), `fakeChest({origin})`, `files.url`/`uploadUrl` accepting `http://localhost` links | 0.4.1's fake serves `files.url` links and takes `uploadUrl` PUTs on its own origin (`CHEST_API`), content-sniffed, with the Chest's errors (`type_refused`, `type_mismatch`, `too_large`, `no_thumbnail`); 0.4.1's files module accepts a link on `CHEST_API`'s origin |
| `FileObject` without a digest | `FileObject.sha256` |
| a signature check per module | one `signed.ts` for `Chest-Member`, `Chest-Event`, `Chest-Schedule` (the studio's channels use it) |
| `scripts/check-manifest.mjs` judging `chest.json` | `chest check` (`@argentic/chest-check`): the studio runs it with `scripts/chest-check.mjs` |
| the `network` key and its proxy, proposed | official: `"network"` in `chest.json` (`*` too), the Chest's egress proxy |

### What the studio reshaped on the way

- **`Member.mailPreference` → `mail.preference(memberId)`.** It was a
  field of `Member`, answered by `members.get/list/lookup` as `mail_pref`:
  0.4.1's members module does not read it, and the preference is mail's.
- **`FormerMember.leftAt` → `members.leftAt(ids)`.** It belongs in lookup's
  former entries; the studio cannot add it without changing 0.4.1's
  `lookup`, so it is a call of its own until the Chest's members API
  carries it.
- **`files.uploadUrl(name, {public: true})` → `files.publicUploadUrl(name)`.**
  A public upload's address is on the public host (`/_chest/upload/`),
  which 0.4.1's `uploadUrl` refuses to return; 0.4.1's function stays as
  published.
- **`chest.toolUrl(name, {surface})`, `chest.toolLink(...)` →
  `chest.tools.get(name)` → `{teamUrl, publicUrl} | null` and
  `chest.tools.link(name, path, {surface})`**: the shape and the words of
  0.4.1's `chest.tool`, for the other tools. `CHEST_TOOL_URLS` entries are
  `{teamUrl, publicUrl}`, origins as 0.4.1 reads them (https, no path):
  `http://localhost` is no longer an address.
- **`checks`, `webhooks`, `mail`**: their `handle(request, …, {seen})`
  drops a delivery already handled, as 0.4.1's do; their path checks went
  (the channel's label is what tells deliveries apart).
- **The fake member** (`FakeMember`, language and zone optional) and
  `signAssertion`/`withMember` taking one stay, as a thin layer over
  0.4.1's functions; the assertion carries exactly 0.4.1's claims.

## `network` — testing a tool that declares hosts

0.4 declares the hosts a tool reaches in `chest.json` (`"network":
["graph.microsoft.com", "*.icloud.com"]`, or `"*"`) and gives the tool the
Chest's egress proxy (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`,
`NODE_USE_ENV_PROXY=1`, Node 24.5 or later): the tool calls them with
**plain `fetch()`**, refused hosts answer as the proxy refuses
(`Chest-Egress: refused; reason=…`). 0.4.1's fake has nothing for it; the
studio's plays it: `fakeChest({ network: { "graph.microsoft.com": request
=> … } })` answers the declared hosts and refuses the rest as the proxy
does, without a proxy and without Node 24.5 (see "`testing`").

## `member` — the studio's additions

`member(request)` is 0.4.1's, claim for claim, and every name of the module
is 0.4.1's value. The studio adds **`locales`, `Locale`, `localeOf(tag)`**
— the languages the store's tools speak today (`["en", "fr"]`, English
first) and the narrowing of a language to them: `localeOf(who.language)` is
`"fr"` for `fr`, `fr-CA`, `FR`, and `"en"` for a language the tool does not
speak yet (`de`), exactly the "uses its own default" 0.4.1 asks. The
studio's modules that take words in several languages
(`notifications.broadcast`, `calendar`, `visitors.language`) are typed on
them.

## `members` — the studio's additions

### `members.leftAt` — when former members left (Proposal (studio.15))

```ts
const { former } = await members.lookup(ids);
const left = await members.leftAt(former.map(f => f.id)); // Map: "mbr_…" → "2026-09-30T16:00:00.000Z"
```

0.4.1's lookup says who left (`former`, with the name they had, or
`erased`) but not when; a final pay, a last day on a receipt, "Camille
Martin (left on 30 Sept.)" need the date. `leftAt(ids)` answers, for each
identifier lookup reads former or erased whose departure the Chest knows,
an ISO 8601 instant — kept after an erasure: a date alone names nobody;
nothing for a member who has the tool, one without access (still in the
Chest) or an identifier the tool does not know. Any number: 200 a call
(`POST /members/left`). It belongs in lookup's former entries (`left_at`):
a call of its own only because the studio does not change 0.4.1's lookup.
In tests: `fakeChest({former: [{id, name, status, leftAt}]})`.

### `members.matchEmails` — who these addresses are (Proposal (studio.15))

A tool that holds addresses from elsewhere — Intune's devices and their
user, an imported spreadsheet — learns which member each one is without
`members.email`: the Chest matches, the tool learns member ids only.

```ts
const ids = await members.matchEmails(devices.map(d => d.user)); // each address as given → "mbr_…"
for (const d of devices) d.member = ids[d.user] ?? null;
```

- Only members who have the tool are matched; an address of nobody, of a
  former member or of a member without the tool is left out alike — the
  answer never says whether an address exists in the Chest outside a
  match, and never gives an address.
- The whole address, whatever its case, spaces around trimmed; the
  member's sign-in address only (no alias). What is not an address is
  never sent.
- Bounds (`matchLimits`): 200 addresses a call (the SDK sends any number,
  200 at a time), in the 600 calls a minute of `members` (`RateLimited`),
  and 5,000 distinct addresses a day per tool (`QuotaExceeded`; the same
  address again that day is free) — a tool cannot walk a list of guesses.
- No capability beyond `members`.

### `groups` — every group of the Chest (Proposal (studio))

`groups.list()` says only the groups that **give** the tool. A tool open to
everyone — News, Polls, Wiki, the usual case — has none, so it cannot offer
"post to the Sales team" or "ask only Tech". A tool that declares

```jsonc
// chest.proposals.json (with "members" in chest.json) — approved as:
//   “Sees your Chest's groups and who is in them”
{ "groups": "read", "receives": ["member.*", "group.*"] }
```

sees them all:

```ts
import * as members from "@argentic/chest-sdk/members";
await members.groups.all();                    // [{id, name, size}] — every group, by name
await members.groups.members("grp_…");         // {members: ["mbr_…"], next} — or null: no such group
await members.groups.of("mbr_…");             // every group the member is in — or null: not a member who has the tool
```

- **Who is in a group** is said among the members who **have the tool**: a
  member without access stays unknown, as everywhere (`size` counts them
  the same way). `members(id, {after, limit})`: by identifier, 500 a page
  by default, 1,000 at most; `null` for a group the Chest does not have.
- `member(request).groups` and `members.get/list/lookup` keep 0.4.1's
  meaning — the groups that **give** the tool, 16 at most — whatever
  `"groups"` says (the assertion every tool receives never lists the
  organisation chart). A tool that asks "is this member in Sales?" of a
  group that does not give it asks `groups.of(id)` (up to 64 groups; `null`
  for a member the tool does not have), or `groups.members(groupId)`.
- **Events** (`"receives": ["group.*"]` in `chest.proposals.json` — 0.4's
  `chest.json` takes `["member.*"]` only —, with `"groups": "read"`):
  `group.changed {id, changed: ["name" | "members"]}` and `group.removed
  {id}` on `POST /chest-events`, handled by `events.handle` like member
  events (`"group.changed": e => …`; a member event still goes to 0.4.1's
  `handle`). When someone leaves a group, the tool
  also gets `member.updated {changed: ["groups"]}` for them: withdraw what
  targeted them through that group (a poll's reminder, a post's badge);
  `group.removed` withdraws what targeted the group.
- Errors: `CapabilityNotGranted` (not declared or not approved),
  `RateLimited` (600 calls a minute; the fake counts them apart from 0.4.1's), `Unavailable`.

Store group ids, resolve names when rendering (`all()` is one call; keep it
a minute). In tests: `fakeChest({groups: [{id, name, members, grants: false}],
capabilities: ["members", "groups"]})` — `grants: false` is a group that
does not give the tool (only seen with `groups`, through `all`, `members` and `of`); `chest.emit({type:
"group.changed", data: {id, changed: ["members"]}}, to)`. The harness's
`/_dev` lists the groups and moves a member in or out (and tells the tool).

Risks: the organisation chart leaks to every tool that asks — hence a
permission of its own, in words the owner understands; group names can be
sensitive ("Disciplinary committee"): an owner may hide a group from tools
(the Chest's side, not designed here). Elsewhere (from the vendors' docs
as a web search showed them on 2026-09-29; the pages themselves were not
reachable from the studio): Microsoft Graph's `GroupMember.Read.All` reads
the membership of groups and, as an application permission, needs an
admin's consent ([docs](https://learn.microsoft.com/en-us/graph/permissions-reference));
Slack's `usergroups:read` scope lets an app list user groups and their
members and receive `subteam_members_changed` / `subteam_updated` events
([docs](https://docs.slack.dev/reference/scopes/usergroups.read/)) — the
same split as here: a permission to read the directory's groups, apart
from reading people, with change events.


## `notifications.broadcast` — everyone, each in their language (Proposal (studio))

```ts
const { delivered } = await notifications.broadcast({
  messages: { en: { title: "Please read: we move on 2 November" }, fr: { title: "À lire : nous déménageons le 2 novembre" } },
  path: "/chest/posts/4",
  key: "post:4",
  to: { roles: ["reader"], groups: ["grp_…"] }, // optional: either matches; none = everyone with the tool
  except: ["mbr_…"],                             // optional: up to 500 left out (the author, those who answered)
});
```

One call tells everyone who has the tool (or the members of some roles or
groups), each with the message of their language (`en` required, used when
a member's is missing). The Chest resolves the members and delivers in the
background; a key replaces each member's earlier item of that key. Quota:
30 broadcasts an hour per tool, not counted in the 1,000 recipients an
hour; each member still gets at most 100 items a day (a member at their
limit is skipped). Answers how many members were told. Before it, a tool
that told everyone listed its members page by page, grouped them by
language and stopped at a thousand people (News, Polls). In tests,
`fakeChest({broadcast: false})` is a Chest without it (a refusal), to
test a tool's fallback; the fake counts each member's items a day for
broadcasts apart from 0.4.1's count for `notify`.


## `mail` — email in and out (Proposal (studio))

A tool sends email in the company's name, and receives the email sent to
its mailboxes. The Chest holds the company's mail provider (connected once
by the owner: SMTP or a provider's API, SPF and DKIM on the company's
domain); a tool never holds a mail credential.

```jsonc
// chest.proposals.json — two permissions:
//   “Sends emails in your company's name, up to 500 a day”
//   “Receives the emails sent to support@<your domain>”
{ "mail": { "send": true, "mailboxes": ["support"] } }
```

```ts
import * as mail from "@argentic/chest-sdk/mail";
await mail.send({ to: "client@example.com", subject: "Re: Broken order [#42]", text, mailbox: "support", fromName: "Camille at Atelier", inReplyTo, references, key: "reply:981" });
await mail.send({ to: { member: "mbr_…" }, subject, text }); // a member, without the tool knowing their address
const address = await mail.mailboxAddress("support");          // "support@atelier-martin.fr", or null

// app/chest-mail/route.ts — each received email, signed Chest-Mail
export async function POST(request: Request) {
  return new Response(null, { status: await mail.handle(request, async message => openOrContinueTicket(message), { seen }) });
}
```

| Export | Gives |
|---|---|
| `send(message)` | Queues one message: `to`/`cc` (addresses or `{member}`), `subject`, `text` (+ `html`), `mailbox` (its address and the company's name; the no-reply address otherwise), `fromName`, `replyTo`, `inReplyTo`/`references` (threads), `attachments` (a file of the tool's `files`, or content), `key` (the same key within 24 h sends nothing again), `transactional` (Proposal (studio.15)). `{id: "msg_…", messageId, status: "queued" \| "held", skipped, digest}` |
| `status(id)` | `queued`, `held`, `sent`, `delivered`, `bounced`, `complained`, `failed` |
| `available()` | **Proposal (studio.16).** Whether the Chest would send now, asked without sending: `{ok, reason, remainingToday}` — `reason` `"not_granted"` (not declared or approved, a Chest without mail, outside a Chest), `"not_connected"` (the owner has not connected the company's mail), `"suspended"` (the Chest stopped sending for now), `"quota"` (the day's messages are used), or null. Never throws for a missing capability; `Unavailable` when the Chest does not answer (say "unknown", not "off") |
| `preference(memberId)` | **Proposal (studio.15).** How a member who has the tool wants email: `"all"`, `"digest"` or `"none"` (`"all"` when the Chest says nothing else); null for an identifier the tool does not have (`GET /mail/preferences/<id>`). Read-only |
| `idempotencyKey(key)` | The key the Chest receives for a key the tool gives (studio.15): as given when it is 1–64 of `A-Z a-z 0-9 . _ : -`, otherwise `sha256:` and its digest; null for what is not a key |
| `mailboxAddress(name)` | The mailbox's address, to show on pages; null until the owner gives it one |
| `handle(request, handler \| {message, bounce}, {seen?})`, `verify(request)` | A received message: `{kind: "message", id: "rcv_…", mailbox, from {address, name}, to, cc, deliveredTo, thread, subject, text, html (cleaned by the Chest), original (the .eml in the tool's files), messageId, inReplyTo, references, attachments [{file, name, type, size}] already in the tool's files under `mail/`, dropped, receivedAt, spam 0–10, authenticated, auto}`; or a bounce `{kind: "bounce", id: "bnc_…", message, recipient, permanent, reason, at}` |
| `threadAddress(mailbox, thread)`, `threadTag`, `threadOf` | A conversation's own reply address (`support+t1042-k3q…@…`), whose tag only this tool can make, and the thread read back from an address |
| `isAddress(text)` | A plain address the Chest would send to |

Refusals: `ChestError` `invalid_address`, `invalid_message` (before
anything is sent: recipients 1–50, a subject without line breaks, …),
`suppressed` (every recipient bounced or complained before), `TooLarge`
(10 MiB), `QuotaExceeded` (500 a day unless the owner raises it),
`CapabilityNotGranted` (not declared, or a Chest without mail yet — the
tool says "Emails will be sent once your Chest can send them"). The Chest
journals every message (to, subject, size, status; never the body by
default) and shows the day's count on the tool's page.

**Keys (studio.15).** A `key` is the tool's name for one message, and a
retry under it sends nothing twice. Build it from what names the message —
`` `digest:${day}:${member}` `` — and **never cut it**: any text of 1 to 512
characters without control characters is taken whole, and the SDK sends
one longer than the Chest keeps (64 of `A-Z a-z 0-9 . _ : -`) as its
SHA-256 (`idempotencyKey`). Until studio.15 the cap was 64 and tools cut
`` `${key}:${member}`.slice(0, 64) ``: past 33 characters of their own, the
cut took the recipient off, two recipients shared one key, and the Chest
answered the second with the first message — one email dropped, silently.
Now the Chest refuses a key reused within 24 hours **for other recipients**
(`ChestError` `key_conflict`, 409, nothing sent): a retry with the same
recipients answers the first message (its text may differ — a retry
re-renders); anything else is a bug the tool hears of. Keys that already
fit are sent unchanged: a tool's keys keep working, and its retries across
the upgrade are still recognised.

**Put the recipient in the key when it is built from database ids
(studio.16).** The Chest remembers a key for 24 hours; the tool's database
does not remember the Chest. After a restore from a backup, a sequence
starts again from where the backup was, and `subscriber:42` or
`candidate:7` can name another person than the one the Chest remembers —
the Chest then refuses the send (`key_conflict`) or, for the same
recipients, answers the first message and sends nothing. Put the recipient
itself — the member id, or the address for someone outside the Chest — in
every key made from ids: `` `update:${updateId}:${address}` ``,
`` `interview:${id}:${member}` ``. A long key is fine: the SDK hashes it,
never cuts it. The same holds for `webhooks.send` (the target's id) and
`events.publish` (what the event is about). Status and Hiring learned it
the hard way.

**Is mail on? (Proposal (studio.16)).** `mail.available()` answers without
sending, for a page that offers email before anyone asks for one — People's
start form ("Email the newcomer their first-day details"), a Settings page
that says whether alerts go out:

```ts
const mailing = await mail.available();
// {ok: true, reason: null, remainingToday: 487}
// {ok: false, reason: "not_connected", remainingToday: null} → "Ask your Chest's owner to connect email"
```

It is a snapshot: `send` can still fail, and a member's own preference may
still hold a message back. In tests, `fakeChest({ delivery: { mail } })` or
`chest.delivery.mail = "ready" | "not_connected" | "suspended"`; a Chest
whose mail is not connected answers `send` as a Chest without mail
(`CapabilityNotGranted`), a suspended one `Unavailable`.

**The person's email preference (Proposal (studio.15)).** Each member
chooses once, in the Chest, `all`, `digest` or `none`
(`mail.preference(memberId)`, read-only; never in the assertion nor in
0.4.1's members API — until studio.1 of 0.4.1 it was `Member.mailPreference`,
a field 0.4.1's members module does not read). A tool reads it to say so
(“You chose one email a day — change it in your Chest settings”), and may
keep its own switch too ("no reminders from Tasks"): both apply — the
tool's decides whether it sends, the Chest's whether and how the person
receives. `send` applies it to every recipient who is a member — given
as `{member}` or by their address: `none` is not sent to (`skipped`),
`digest` waits for the Chest's one email a day (`digest`); the message goes
to the others, and `status` is `"held"` when it goes to nobody now — not an
error. `transactional: true` is for what the person must get whatever they
chose — a password, a booking's confirmation, a payslip, the answer to
their own request; everything else (reminders, digests, "a task was
assigned") honours the preference. The Chest journals the flag and shows
the owner each tool's share: a tool that marks everything transactional is
seen. Outside addresses have no preference (a customer unsubscribes from
the tool's own list, or the suppression list stops a complaint).

In tests: `fakeChest({ capabilities: [..., "mail"], mail: { domain, mailboxes, perDay, suppressed } })`, members with an optional `mailPreference`;
`chest.outbox` holds what was sent (addresses resolved, members' included),
`chest.held` what members' preferences held back (`{id, member, reason: "none" | "digest", subject, text}`);
`chest.receive({mailbox, from, subject, text, attachments?}, to)` delivers a
message to `POST <to>/chest-mail`, attachments stored in the tool's files.

### Receiving: threads, what the Chest cleans, bounces (Proposal (studio))

The Chest runs the company's inbound mail (MX on its domain): an address a
tool declared in `mailboxes` is **owned** by that tool (`support@`,
`jobs@`); any other address of the domain the tools do not own is refused
at the SMTP door (550), as is a message over 25 MiB (552, the sender told
by their own server). Each accepted message is posted to the tool's `POST
/chest-mail`, signed `Chest-Mail` (0.4.1's signed deliveries under the
label "Chest-Mail v1", like `Chest-Event`), at least once (the same `id`),
again for 72 hours while the tool does not answer 2xx; `handle` drops a
delivery already handled (`seen`, `memorySeen` by default).

```ts
// Reply on ticket 1042: replies come back to support+t1042-k3q…@<domain>
await mail.send({ to: customer, subject: "Re: Broken order [#1042]", text, mailbox: "support", thread: "1042", inReplyTo, references });

export async function POST(request: Request) {
  return new Response(null, { status: await mail.handle(request, {
    message: async m => {
      if (m.auto) return;                                      // out of office: never answer, never reopen
      const ticket = m.thread ?? await byMessageIds([m.inReplyTo, ...m.references]);
      await (ticket && m.authenticated !== false ? addReply(ticket, m) : openTicket(m));
    },
    bounce: b => markUndelivered(b.message, b.recipient, b.permanent),
  }, { seen }) });
}
```

- **Threads.** `send({mailbox, thread})` gives the message the Reply-To
  `mailbox+t<thread>-<tag>@<domain>`; the tag is 50 bits of HMAC of the
  mailbox and the thread under a key derived from `CHEST_TOKEN` ("Chest-Mail-Thread
  v1"), lower case (mail systems may lower-case an address). The Chest
  routes `mailbox+anything@` to the mailbox and says `deliveredTo`; the SDK
  checks the tag and fills `thread` — so nobody can drop a message into a
  ticket by writing to `support+1042@`. A thread is 1 to 16 of `a-z 0-9`.
  Without a valid tag (a client that answers the From address, a token
  changed by a reinstall), `thread` is null: match `inReplyTo` and
  `references` against the `messageId`s of what the tool sent, then open a
  new conversation. A subject's `[#1042]` is never proof.
- **HTML is cleaned by the Chest**, not by each tool: allowed tags only
  (paragraphs, emphasis, lists, quotes, tables, `a href` http/https/mailto
  with `rel="noopener noreferrer nofollow"`), no script, style, attribute,
  comment or image (remote images track the reader; inline `cid:` images
  arrive as attachments). Why: a sanitiser is a dependency every tool
  would carry (the SDK stays dependency-free; DOMPurify on a server needs
  a DOM, heavy for 256 MiB), one mistake in one tool is stored XSS on its
  origin, and the Chest updates one cleaner for all. `text` is always
  there (the text part, or the HTML made text). `original` is the message
  as received (`message/rfc822` in the tool's files): offer it as a
  download ("Show original"), never inline. Still render `html` inside the
  tool's strict CSP.
- **What the Chest found.** `spam` 0–10 (8 and above is kept in the
  Chest's quarantine, the owner sees it, the tool never does);
  `authenticated`: the From domain vouches for it (DMARC, or SPF/DKIM
  aligned) — without, never attach it to an existing customer's
  conversation on the From address alone; `auto`: an automatic answer
  (`Auto-Submitted`, out of office, a list's notice) — never answer it
  automatically.
- **Attachments** are stored in the tool's files under `mail/` before the
  message is posted (they count in its quota); `dropped` names those the
  Chest did not keep (`count` beyond 20, `type` executables, `virus`,
  `quota` when the tool's files are full). Posted text is cut at 1 MiB,
  cleaned HTML at 2 MiB; the original stays whole.
- **Bounces** never arrive as messages: the Chest sends with its own return
  path per message, updates `status(id)` (`bounced`), suppresses a
  permanently failing address for the whole Chest, and posts `{kind:
  "bounce", message, recipient, permanent, reason}`. A handler given as a
  function receives messages only (a bounce is accepted and ignored).

In tests: `chest.receive({mailbox, from, subject, text, html?, thread?,
deliveredTo?, authenticated?, auto?, attachments?}, to)` delivers as the
Chest would (the HTML cleaned by a strict stand-in, the original stored,
executables dropped); `chest.bounce(messageId, to, {permanent?, reason?})`
bounces a sent message. The harness's `/_dev` sends an email to the tool
(new, or a reply to a message of the outbox, to its thread address), with
an HTML part, "automatic" and "not authenticated" switches, and bounces
any sent message.

Risks: a tool as an open relay (never: it can only send from its
mailboxes, within its quota); mail loops (`auto`, and the Chest refuses to
post more than 20 messages an hour from one sender to one mailbox);
phishing through a trusted inbox (`authenticated` and `spam` given to the
tool; the owner sees the quarantine). The loop guard is designed, not
faked. Elsewhere (from the vendors' docs as a web search showed them on
2026-09-29): Postmark posts each inbound message as JSON, with the part
after "+" of the address as `MailboxHash` for threading and SpamAssassin's
`X-Spam-Score` among the headers
([docs](https://postmarkapp.com/developer/webhooks/inbound-webhook));
Mailgun routes post a parsed message (or the raw MIME) to a URL and sign
webhooks with HMAC-SHA256
([docs](https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/receive-http)).
Neither cleans the HTML nor authenticates the thread's "+" part for the
app; the Chest does both, because its tools are small and many.


## `calendar` — one calendar feed per member (Proposal (studio))

Everyone lives in Google Calendar, Outlook or Apple Calendar. Tools put
the events they know about members — a room booked, a desk day, an
approved leave, a meeting a guest booked, an interview, a company event,
a task due — and the Chest serves each member **one** secret iCalendar
feed (RFC 5545) that merges every tool's. The member adds it once ("Add
your Chest calendar", a page of the Chest); the tool never serves a
feed, never sees its address, and a private tool (no host a calendar app
can reach without signing in) needs no public part for it.

```jsonc
// chest.proposals.json — approved as:
//   “Adds events to the calendar of the members concerned”
{ "calendar": true }
```

```ts
import * as calendar from "@argentic/chest-sdk/calendar";
await calendar.put({
  key: "booking:981", members: [host, ...guests],                        // the same key replaces
  title: { en: "Room booked: Green room", fr: "Salle réservée : Salle verte" },
  start: "2026-10-12T09:00:00+02:00", end: "2026-10-12T10:00:00+02:00",
  location: "Green room, 2nd floor", path: "/chest/bookings/981",
});                                                                        // {key, members, skipped}
await calendar.put({ key: "leave:42", members: [who], title: { en: "Off", fr: "Absent" }, days: { first: "2026-10-12", last: "2026-10-16" }, private: true });
await calendar.put({ key: "desk:2026-10-13", members: [who], title: "Office — desk D-12", days: { first: "2026-10-13", last: "2026-10-13" }, busy: false });
const results = await calendar.putMany(openTasks.map(eventOf));           // Proposal (studio.15): 100 a call; one result per event, in order (studio.16)
await calendar.remove("booking:981");                                     // gone from every feed; true if it was there
const { events, next } = await calendar.list();                           // what the tool put, to reconcile
// A link to the member's page: <a href={calendar.page}>See it in your calendar</a>   ("/_chest/calendar")
```

| Field | Rules |
|---|---|
| `key` | The tool's name for it, 1 to 64 of `A-Z a-z 0-9 . _ : -`. Put again = replace (members too); `remove` = gone. It names the event for as long as it lives (`list` says it back), so it is never hashed nor cut: a longer one is refused (`invalid_key`) — build it from ids |
| `members` | 1 to 1,000 member ids; `skipped` says those without the tool (not kept) |
| `title`, `description` | One text, or `{en, fr}`: the Chest writes each member's feed in **their** language (theirs, then English, then the first given) — one put for a meeting of people who read different languages. Titles 1–120 characters, descriptions 1,000, plain text |
| `start`, `end` | Instants: a `Date`, or ISO 8601 **with** `Z` or an offset (a local time without a zone is refused); written in UTC |
| `days` | `{first, last}` inclusive, `YYYY-MM-DD`: whole days (`VALUE=DATE`, the feed's `DTEND` the day after the last) |
| `location` | Plain text, 200 characters |
| `path` | A page of the tool under `/chest`, made absolute on its team host (never a free URL: no phishing link in someone's calendar) |
| `busy` | `false`: shown free (`TRANSP:TRANSPARENT`: a desk day, a due date); busy by default |
| `private` | `CLASS:PRIVATE`: a calendar shared with colleagues shows it as busy, without its words (a leave) |

**`putMany(events)` (Proposal (studio.15); per event since studio.16).**
A first sync — every open task with a due date, every approved leave of
the year — was one `put` per event against the 600 writes a minute.
`putMany` sends 100 a call, counted as one write of the minute
(`limits.perBatch`, `limits.perMinute`), and answers **one result per
event, in the order given** — one wrong event never holds the others back:

```ts
type PutResult =
  | { ok: true; index: number; key: string; members: string[]; skipped: string[] }
  | { ok: false; index: number; key: string; reason: PutRefusal; message: string };
type PutRefusal = "invalid_event" | "invalid_key" | "invalid_id" | "duplicate_key" | "quota_exceeded";

for (const r of await calendar.putMany(events)) {
  if (r.ok) await markPut(r.key);
  else log(`calendar: ${r.key} not put (${r.reason}): ${r.message}`);  // the others went
}
```

The SDK checks each event first and sends only those it accepts; the Chest
checks again and answers each. `duplicate_key`: a key given twice in one
call — neither is put, since nothing says which one the tool meant.
`quota_exceeded`: a new key beyond the tool's 5,000 events — the ones
before it in the list are put. `index` is the event's place in the list
given (its `key` may be the very thing that is wrong). Still thrown, as
they concern the call and not an event: `CapabilityNotGranted`,
`RateLimited`, `Unavailable`, `invalid_event` for an argument that is not
an array. Beyond 100, batches go one after the other: an error after the
first leaves the earlier ones applied; put again, it is idempotent by key.

**No all-or-nothing option.** Until studio.16 one wrong event refused the
whole batch, and the three tools that use `putMany` (Rooms, Clients,
Tasks) each caught the refusal and put the batch again one event at a
time — up to 100 writes for one bad date. None wanted all-or-nothing; a
tool that does checks every event with `calendar.check(event)` before
calling. **Upgrading from studio.15**: `putMany` no longer throws for a
wrong event — read `ok` of each result instead of catching `invalid_event`,
or a refused event is taken for put.

**Decisions.** Titles per language, not rendered by the Chest from a
template: the tool knows its words; the Chest only picks. `path`, not a
URL. Feeds are **personal only** for now: no "my team's absences" feed
(a manager's view needs rules per tool — Leave may show "Away" and never
the kind — and belongs to a later "shared feeds" step). The secret is
random (32 bytes), kept hashed by the Chest, replaceable ("New address":
the old one stops working at once) — a signed URL could not be revoked.
Events are the Chest's copy: a member who loses the tool loses its events
at the next fetch; a member who leaves the Chest loses their feed.

**The feed** (`calendar.feed`, `calendar.ics` write it; the fake serves it):
`text/calendar; charset=utf-8`, CRLF, lines folded at 75 octets never
inside a character, TEXT escaped (`\\ \; \, \n`), UTC times,
`UID` = a hash of tool and key `@<chest domain>` (stable, reveals no
key), `DTSTAMP` = the event's last change (stable between fetches, so an
`ETag` answers 304), `SEQUENCE` counts changes, `CATEGORIES` the tool's
title, `NAME`/`X-WR-CALNAME` "Chest — <company>", `REFRESH-INTERVAL`
PT1H (a hint), `Referrer-Policy: no-referrer`, `noindex`. A feed holds the
member's 2,000 events nearest to today, from a year back.

**Bounds.** 5,000 events kept per tool (`QuotaExceeded`), 1,000 members an
event, events ending at most a year ago and starting at most two years
ahead (`invalid_event`; the Chest forgets an event a year after its end),
600 writes a minute (`RateLimited`). Errors before anything is sent:
`invalid_event`, `invalid_key`, `invalid_id`; `CapabilityNotGranted`
without the permission or on a Chest without the calendar — the tool then
keeps its own "Add to calendar" file (`calendar.ics([...], {method:
"PUBLISH"})` writes one) and says so. The Chest journals puts per tool
(count, never titles); agents read a member's own events through the MCP
server like the inbox.

**Honest limit.** Calendar apps fetch a subscribed feed at their own pace
— Google Calendar every several hours (6 to 24 by third-party accounts
seen 2026-09-29; Google publishes no figure) — so a booking made now may
show there hours later; the tool's page stays the truth. The next step,
not built: a read-only **free/busy connector** (a member links their
Google or Microsoft calendar once — OAuth held by the Chest, declared
network — and tools ask "is Inès free 14:00–15:00?" without ever seeing
events), which Booking needs to stop double-booking.

In tests: `fakeChest({capabilities: [..., "calendar"], calendar: {domain,
toolTitle, company}})` (or `calendar: false`, a Chest without it);
`chest.calendar` (the events by key), `chest.feed(member, {locale?, now?})`
(the member's feed as the Chest writes it), `chest.feedUrl(member)` and
`chest.newFeedUrl(member)` (on the team host, `CHEST_TEAM_URL`; the fake's
front serves the path at `chest.api + /_chest/calendar/<secret>.ics`, 404
once replaced); the front's `/_chest/calendar` is the member's page
(with the `Chest-Member` assertion). The harness (`lab/chest-dev`) relays
its own `/_chest/` to the fake's front, so a calendar app on the machine
may subscribe to the feed's path on the harness's address.


## Events between tools (Proposal (studio))

The tools of one Chest share its people; with events they also share what
happens: a leave approved in Leave shows the person "off" in Rooms, a hire
in Hiring becomes a newcomer in People, a deal won in Clients starts a
quote. A tool publishes events **named after itself**; another tool
**receives** the ones it declares, once an admin linked the two ("Is told by
Leave when a leave is approved"). Delivery is the member events' own: `POST
/chest-events`, signed, at least once.

```jsonc
// chest.proposals.json of Leave
{ "emits": ["leave.approved", "leave.cancelled"] }
// chest.proposals.json of Rooms (its chest.json keeps 0.4's "receives": ["member.*"])
{ "receives": ["leave.approved", "leave.cancelled"] }
```

```ts
// Leave, when a leave is approved:
await events.publish("leave.approved", { member: "mbr_…", from: "2026-10-12", to: "2026-10-16", request: "42" }, { key: "leave:42:approved" });
// Told late (a retry of what waited): when it happened, not when it went.
await events.publish("helpdesk.ticket.solved", { ticket: 42, assignee: "mbr_…" }, { key: "ticket:42:solved", occurredAt: row.solvedAt });
// Forms' Settings: is anything linked to receive its contacts?
const linked = await events.receivers("forms.contact");               // ["crm"], or []

// Rooms, in its /chest-events route:
await events.handle(request, memberHandlers, { seen, tools: {
  "leave.approved": e => markAway(e.data),
  "leave.cancelled": e => clearAway(e.data),
} });
```

| Export | Gives |
|---|---|
| `publish(type, data, {key?, occurredAt?})` | `{id, receivers}`: `type` is `"<tool>.<name>"` of this tool, declared in `emits`; `data` a JSON object (16 KiB at most; people as member ids); the same `key` within 24 h is one event — any text of 1 to 512 characters, never cut (a long one goes as its SHA-256, as `mail`'s; studio.15), and the same key with another type or other data is refused (`ChestError` `key_conflict`, 409), never answered with the first event. **`occurredAt` (Proposal (studio.16))**: when it happened, for an event told later than that — a `Date` or an ISO 8601 instant with `Z` or an offset, within the last 24 hours (the key's window: an event told late is still one event) and at most a minute ahead (clock skew) (`occurredLimits`, `occurredAtOf`); receivers read it as the event's `occurredAt` (without it, the Chest's time of the publish); another `occurredAt` under the same key is `key_conflict`. `ChestError` `invalid_event`, `CapabilityNotGranted` (not declared, or no events between tools yet), `QuotaExceeded` (1,000 an hour) |
| `receivers(type)` | **Proposal (studio.16).** The tools (by `chest.json` name, sorted) that would receive an event of this type now: installed, declaring it in `receives`, **and linked** by an admin to this tool for it; `[]` when none. For a page that offers a link to another tool — Forms greys "Send contacts to Clients" with its reason when `crm` is not among them. `chest.tools.get` only says a tool is installed; this says it listens. `invalid_event` for a type this tool does not emit, `CapabilityNotGranted`. Read it when rendering such a page, not before every publish |
| `handle(request, handlers, {seen, tools})` | 0.4.1's `handle` for member events (each is handed to it, unchanged), and: a received tool event `{id, type, source, occurredAt, data}` to `tools[type]`, a group event to `handlers["group.changed" \| "group.removed"]`; a type without a handler is accepted and ignored; one `seen` for all |

What the owner approves: for the publisher, "Tells other tools when a
leave is approved (who, and which days)"; for the receiver, "Is told by
Leave when …"; the admin links the two in the Chest (a tool never picks its
publishers). The Chest journals each event (type, source, receivers, never
data) and keeps undelivered ones 72 hours, like member events. In tests:
`fakeChest({ emits, receivers, linked })` records `chest.published` (each
with its `occurredAt`); `linked` (`{"forms.contact": ["crm"]}`, also
`chest.linked`) is what `receivers` answers and `publish` counts;
`chest.deliver({type, data, occurredAt?}, to)` hands the tool another
tool's event.

**Why `occurredAt`.** Support and Tasks keep what they could not publish
and tell it again every 15 minutes; Goals counts solved tickets and done
cards per cycle by `occurredAt`. Stamped at the publish, a ticket solved at
23:55 on the cycle's last day and told at 00:10 counted in the next cycle.
The 24-hour bound is the key's: beyond it a retry is no longer recognised
as the same event, so a tool that could not publish for a day reconciles
instead of back-dating.


## `chest` — the studio's members (Proposal (studio))

```ts
import { chest } from "@argentic/chest-sdk/chest";
chest.tools.get("forms");            // another tool's addresses, chest.tool's shape (below)
chest.tools.link("forms", "/chest/forms/5/answers/k3ab");
chest.todayIn(who.timeZone);         // "2026-09-29": the date in a member's zone (the Chest's for a zone this runtime does not know)
await chest.theme();                 // the look the company chose (below)
```

The same object as 0.4.1's — `organization`, `timeZone`, `language`,
`currency`, `tool`, `today()` are getters of 0.4.1's own, read at each
access, throwing `not_in_chest` outside a Chest as 0.4.1's do — with the
studio's members beside them. `todayIn(zone, at?)` is for what concerns
one person — the whole days of their leave, "today" on their own page; what
concerns everyone stays `chest.today()`. The helpers a test or the Chest
needs are named exports: `forgetTheme()`, `readThemeChoice(value)`,
`readToolUrls(raw)`, `themeIdPattern`, `toolNamePattern`.

### `chest.tools` — the addresses of the other tools (Proposal (studio))

```ts
chest.tools.get("forms");                                  // {teamUrl: "https://forms-chest.atelier-martin.fr", publicUrl: "https://forms.atelier-martin.fr"}
chest.tools.get("wiki");                                   // null: not installed on this Chest
chest.tools.link("forms", "/chest/forms/5/answers/k3ab");  // "https://forms-chest.atelier-martin.fr/chest/forms/5/answers/k3ab"
chest.tools.link("forms", "/f/contact", { surface: "public" }); // null while its public part is closed
chest.tools.link("forms", "//evil.example");               // null
```

A tool that received an event of another tool links the member back to it
(Clients and Support to the answer in Forms, Timesheets to Quotes). 0.4.1
gives a tool its own addresses (`chest.tool`, from `CHEST_TEAM_URL` and
`CHEST_PUBLIC_URL`); the proposal gives the others' the same way, in one
more variable the Chest writes at each start:

```json
{ "forms": { "teamUrl": "https://forms-chest.atelier-martin.fr", "publicUrl": "https://forms.atelier-martin.fr" },
  "crm":   { "teamUrl": "https://crm-chest.atelier-martin.fr" } }
```

- **`CHEST_TOOL_URLS`**: one entry per installed tool, by its `chest.json`
  name; `teamUrl` its team host, `publicUrl` its public host while its
  public part is open (the company's own domain when the owner connected
  one) — `chest.tool`'s shape and meaning. Origins as 0.4.1 reads
  `CHEST_TEAM_URL` (https, lower case, no path); an entry whose `teamUrl` is
  not one is ignored — the tool is then "not installed" here —, a
  `publicUrl` that is not one reads as none, never the whole map.
- **This tool's own name** answers `chest.tool` (null outside a Chest).
- **`link(name, path, {surface?})`** joins the origin and a path that
  starts with `/` and not `//`, in the simple form the Chest's front accepts
  (printable ASCII, no `\`, no `.` or `..` segment, no encoded `/`, `\` or
  NUL, 512 characters at most). A team link is `/chest` or under it; a
  public link is never under `/chest`. null otherwise: show the text
  without a link.
- **Fresh at the next start.** The Chest rewrites the variable when a tool
  is installed or removed and when a public part opens or closes, and
  starts the awake tools again, as for its other variables.
- **A link is not access.** The member who follows it may not have that
  tool; its team host then says so. Store the other tool's name and a path
  (never an origin, which changes with a custom domain), and make the link
  when rendering.

### `chest.theme()` — the look the company chose (Proposal (studio))

```ts
import { chest } from "@argentic/chest-sdk/chest";
await chest.theme();
// { mode: "own", scope: "default" }                                   each tool its own identity
// { mode: "catalogue", theme: "library", fonts: "/_chest/theme/fonts", faces: [], scope: "chest" }
// { mode: "brand", brand: { name, primary, secondary, neutral, corners, density, display, body, logo }, fonts, scope: "tool" }
```

A company chooses once, in its Chest's admin, how its tools look, **at two
levels**: **all tools** (each keeps its own identity — the default —, or
one theme of the catalogue, or the company's brand), and, for any **one
tool**, something else ("Wiki keeps its own look"). The Chest resolves the
two levels: a tool receives only its own answer, and `scope` says where
it came from (`"tool"`: this tool's override; `"chest"`: the choice for
all; `"default"`: the Chest says nothing). The tool renders it with the UI
kit (`@argentic/chest-ui`: `resolveTheme(await chest.theme(), identity)`
and one `<style>` with the page's nonce); a theme is only a look — same
pages, same words, same accessibility.

| Answer | Carries |
|---|---|
| `own` | nothing: the tool's own identity |
| `catalogue` | `theme`: a catalogue id (`themeIdPattern`); `fonts`: where the Chest serves the catalogue's fonts; `faces`: fonts the Chest holds a licence for and serves itself (`{family, url, weight, style}`, e.g. the portal's Suisse) |
| `brand` | `brand`: `name`, `primary` (`#rrggbb`), `secondary` and `neutral` (or `null`), `corners` (`sharp`, `soft`, `round`), `density` (`comfortable`, `compact`), `display` and `body` (`{id}` of a catalogue font, or `{family, files: [{url, weight, style}]}` of the company's upload, or `null`), `logo` (`{url, alt, dark}` or `null`); `fonts` as above |

Files are served by the Chest's front **on the tool's own hosts**, under
`/_chest/theme/` (`fonts/…` for the catalogue's, `brand/…` for the
company's fonts and logo): the tool's policy (`font-src 'self'`,
`img-src 'self'`) admits them unchanged, and a public page may use them
(they are the company's public look). `theme()` asks `GET /theme` of the
Chest's API and keeps the answer as long as the Chest says
(`Cache-Control: max-age`, at most 5 minutes, 60 s by default): an owner's
change shows within that time, with no restart. It never throws and
checks every word (`readThemeChoice`): outside a Chest, on a Chest
without themes (404), when unreachable (kept 10 s), or for an answer it
does not know (an address off `/_chest/theme/`, a family name with
quotes, a colour that is not `#rrggbb`), the answer is `{mode: "own",
scope: "default"}` — the look must never break a page.

No manifest key and no approval: a look is not a permission (the tool
learns nothing about people, and every file stays on its origin). The
owner's sentence in the admin is the choice itself: "How your tools
look: each its own / one theme for all / your brand", then per tool
"Same as all tools / its own look / a theme / your brand".

Risks: a brand colour that reads badly (the kit moves it just enough and
says so: AA holds in every brand, light and dark); a tool that writes
colours in its CSS ignores the look (the kit's tests flag a literal
colour); files served on every tool's origin (only under `/_chest/theme/`,
the company's public look, no one's data). Elsewhere (from the products'
admin pages as we know them, not re-read today): Microsoft 365
organisation themes, Salesforce "Themes and Branding" and Atlassian's
custom colours let an admin set a logo and colours once for everyone;
none lets each app keep an identity of its own, which the store's tools
have.

In tests: `fakeChest({ theme: { all, tools: { <tool>: choice } }, themeFiles: { "fonts/…": {data, type}, "brand/logo.svg": … } })`;
`chest.theme.all` and `chest.theme.tools[name]` change at any time (the
fake answers `max-age=0`), and the fake's front serves `themeFiles` at
`/_chest/theme/…`. `forgetTheme()` drops the answer kept. The harness
(`lab/chest-dev`) offers both levels on `/_dev`, serves the kit's fonts
and a sample brand.


## `visitors` — the public host's visitors (Proposal (studio))

```ts
import * as visitors from "@argentic/chest-sdk/visitors";
const started = visitors.formToken();                       // put it in the form, hidden
visitors.checkForm(data.get("started"));                    // "ok" | "too_fast" | "invalid"
const { allowed, retryAfter } = await visitors.count(request, "apply", { perVisitor: 5, perHour: 100 });
visitors.language(request);                                 // the switch's cookie "lang", Accept-Language, then the Chest's (chest.language), English outside a Chest
visitors.visitor(request);                                  // an opaque key for the tool's own records (never the address)
```

No captcha without a third party: a form is refused when sent faster
than a person types or never shown (its token, signed with a key derived
from `CHEST_TOKEN`, dated), and the Chest counts what visitors do — per
visitor and per name, per name for everyone, and its own ceiling per
address **across the tools of the Chest** (60 an hour), so a robot that
tries every public tool meets one limit. The visitor's address is the
first of `X-Forwarded-For`, which the Chest's front sets. For a tool with
a public part; `count` asks the Chest (`POST /visitors/count`), the rest
is local. In tests: `fakeChest({visitors: {perAddressHour}})`.


## `checks` — web addresses the Chest checks for the tool (Proposal (studio))

```jsonc
// chest.proposals.json — a permission the owner approves: “Asks the Chest to check up to 10 web addresses of yours”
"checks": { "max": 10 }
```

```ts
import * as checks from "@argentic/chest-sdk/checks";
await checks.configure([{ name: "website", url: "https://atelier-martin.fr/", every: 5, expect: { status: 200, maxMs: 3000 } }]);
await checks.list();

// app/chest-checks/route.ts — outside /chest, never behind a session
export async function POST(request: Request) {
  return new Response(null, { status: await checks.handle(request, result => record(result)) });
}
```

A tool has no outbound network and no process between requests, so it
cannot watch a website; the Chest can. The addresses are the company's, so
the manifest declares only the permission and the tool configures them
(its admin types them; each is shown to the owner). The Chest probes each
one with a GET every `every` minutes (1 to 60) from outside, and posts
`{id, name, at, ok, status, ms, error}` to `POST /chest-checks`, signed
(`Chest-Check`: 0.4.1's signed deliveries, as `Chest-Schedule`; `handle`
drops a result already handled, `seen`); `error` is `timeout`, `dns`, `tls`,
`refused`, `status` or `slow`. At least once (the same `id` may come
twice). Bounds: `max` 1 to 10, https only (http on localhost for a
harness), never a private address. In tests: `fakeChest({checks: {max}})`,
`chest.checks` (the list configured), `chest.check(name, to, {ok, status,
ms, error})`.


## `webhooks` — notices the Chest delivers to outside addresses (Proposal (studio))

```jsonc
// chest.proposals.json — a permission the owner approves:
// “Sends notices to web addresses your admins or subscribers give, signed by your Chest (up to 200 addresses)”
"webhooks": { "max": 200 }
```

```ts
import * as webhooks from "@argentic/chest-sdk/webhooks";

// An admin pastes an address (a Zapier "catch hook", a Slack or Teams channel's webhook):
const problems = webhooks.checkUrl(form.url, form.kind);            // [] or what to fix, before asking the Chest
const { id, secret } = await webhooks.add({ url: form.url, kind: "generic", label: "Zapier — new answers", owner: who.id });
// generic: show `secret` once ("paste it in your receiver"), store only `id`; slack/teams: secret is null

await webhooks.send([id, slackId], { event: "form.answered", text: "New answer to “Contact” from Atelier Dupont", data: { form: 12, answer: 981 }, key: "answer:981" });
await webhooks.list();                         // state, last outcome, last error, failures in a row
await webhooks.journal({ target: id });        // the deliveries of the last 30 days, newest first

// app/chest-webhooks/route.ts — outside /chest, never behind a session
export async function POST(request: Request) {
  return new Response(null, { status: await webhooks.handle(request, { disabled: e => markBroken(e.target, e.lastError) }) });
}
```

A tool reaches only the hosts its manifest names, and a customer's address
is not known when the manifest is written; opening "anywhere" would make
each tool a way out of the Chest (and into the company's network). So the
tool never connects: it hands the Chest a target and a message, and the
Chest checks, formats, signs, delivers, retries and journals.

| Export | Gives |
|---|---|
| `add({url, kind, label, owner?})` | A target: `{id: "whk_…", secret, target}`. `kind` `"generic"` (any https receiver: JSON, signed), `"slack"` (a Slack incoming webhook, `https://hooks.slack.com/services/…`) or `"teams"` (a Teams Workflows webhook, `https://….environment.api.powerplatform.com/powerautomate/automations/direct/workflows/…`). `owner`: the member who added it, or none (a subscriber of a public page). `secret` (`whsec_…`, generic only) is given once |
| `send(ids, {event, text, data?, key})` | One delivery per target, queued: `{deliveries: [{id: "whd_…", target}], skipped: [{target, reason: "disabled" \| "not_found"}]}`. The same `key` within 24 hours answers the first deliveries and sends nothing. Any key of 1 to 512 characters, never cut: a longer one than 64 of `A-Z a-z 0-9 . _ : -` goes as its SHA-256 (the journal shows that); the same key for another event is refused (`key_conflict`, nothing sent) — studio.15 |
| `list()`, `remove(id)`, `enable(id)`, `rotateSecret(id)` | The targets with `state` (`active`, `disabled`), `status` of the last delivery (`delivered`, `failed`, `disabled`, null), `lastError`, `failures` in a row; the address shown without its query (generic) or its secret path (Slack, Teams). `enable` tries a disabled target again (a ping first); `rotateSecret` gives a new secret, the old one still signs for 24 hours |
| `available()` | **Proposal (studio.16).** Whether the Chest would deliver now, asked without sending: `{ok, reason, targets, max}` — `reason` `"not_granted"` (not declared or approved, a Chest without webhooks, outside a Chest) or `"suspended"` (the owner paused the tool's notices: `add` and `send` answer `ChestError` `suspended`, targets are kept), or null; `targets` of `max` addresses ("3 of 200"; `add` is refused at `max` even when `ok`). Never throws for a missing capability. Support's Settings shows "Send new tickets to Slack" only when `ok`. In tests: `chest.delivery.webhooks = "ready" \| "suspended"` |
| `journal({target?, after?, limit?})` | Deliveries: `status` (`pending`, `retrying`, `delivered`, `failed`), `attempts`, `responseStatus`, `lastError`, `nextAttemptAt` — never the text or data |
| `handle(request, {disabled})`, `verify(request)` | `webhook.disabled` `{id: "whe_…", target, reason: "failures" \| "gone", lastError}` on `POST /chest-webhooks`, signed `Chest-Webhooks` (0.4.1's signed deliveries under the label "Chest-Webhooks v1"), at least once; `handle(request, handlers, {seen})` drops one already handled |
| `checkUrl`, `checkInput`, `checkMessage`, `checkManifest`, `isPublicAddress`, `shownUrl` | The rules, for a form to explain a refusal before it happens |
| `format(kind, message)`, `escapeSlack`, `sign`, `verifySignature` | The exact bodies and signature the Chest sends, and the receiver's check |

**What the Chest checks at `add`** (refusal `ChestError` `invalid_target`,
400, before anything leaves; `address_refused` or `verification_failed`,
422): https only; port 443 or 1024 and above; no user name or password;
no fragment; no IP literal or name of a private, loopback, link-local,
shared, documentation, multicast or reserved range (IPv4 and IPv6,
including IPv4-mapped and NAT64 forms, which reach IPv4 through a back
door); no `localhost`, `.local`, `.internal`, `.home.arpa`… name; **then
the name is resolved and every address must be public** — and again at
each attempt, the connection made to the address just checked (no DNS
rebinding between check and use). Slack and Teams addresses must be of
their provider's shape (a generic target cannot name them: the Chest
formats for them). A generic address must answer a signed `chest.ping`
(`data.challenge`) with a 2xx within 10 s, which proves someone set a
receiver there. Redirects are never followed (a 3xx is a failure,
`redirect`).

**What is posted.**

| Kind | Body (JSON) | Headers |
|---|---|---|
| `generic` | `{"id": "whd_…", "event": "form.answered", "text": "…", "data": {…}, "key": "answer:981", "tool": "forms", "created_at": "…"}` | `Chest-Webhook-Id` (the same on every attempt, and the body's signed `id`: deduplicate on the body's), `Chest-Webhook-Event`, `Chest-Webhook-Signature: t=<unix seconds>,v1=<hex>` |
| `slack` | `{"text": "…"}`, with `&`, `<`, `>` escaped as Slack asks (so a text can never mention `@channel` or forge a link) | — (the address is the secret) |
| `teams` | `{"type": "message", "attachments": [{"contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": null, "content": {"type": "AdaptiveCard", "version": "1.4", "body": [{"type": "TextBlock", "text": "…", "wrap": true}]}}]}` | — |

Slack's shape is its incoming webhooks' documented payload (`text`, with
those three characters escaped); Teams' is what a Workflows "When a Teams
webhook request is received" flow expects since Microsoft retired Office
365 connectors (sources and dates: `reports/03-sdk-report.md` §4.17).

**Verifying a delivery (the receiver's side).** `v1` is the hex
HMAC-SHA256, keyed by the target's secret (the whole `whsec_…` string), of
`<t>.<raw body>`. Refuse a `t` more than 5 minutes from now (a replay);
during a rotation two `v1` come, either may match. Verify the raw bytes
before parsing them.

```js
// Any Node receiver (Express needs express.raw() on this route)
import { createHmac, timingSafeEqual } from "node:crypto";
function verified(secret, header, rawBody) {
  const t = header.match(/(?:^|,)t=(\d+)/)?.[1];
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest();
  return header.split(",").filter(p => p.startsWith("v1=")).some(p => {
    const given = Buffer.from(p.slice(3), "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
// A Node tool of another Chest: webhooks.verifySignature({ secret, header, body })
```

**Delivery.** At least once. 10 s to answer; a 2xx is delivered; 408,
429 (its `Retry-After` honoured up to an hour), 5xx and network errors
(`timeout`, `dns`, `tls`, `refused`, `private_address`) are tried again 1
min, 5 min, 30 min, 2 h, 6 h, 12 h and 24 h after the send (8 attempts),
then `failed`; any other 4xx fails at once (the receiver refused it). The
Chest paces one request a second per target (Slack's own limit) by
queuing, never by refusing. After **10 failed attempts in a row** — or at
once on 410, or 404 from Slack or Teams (the hook was deleted) — the target
is **disabled**: its pending deliveries fail, sends skip it, the owner's
page shows it, and the tool receives `webhook.disabled` (tell its admin;
`enable(id)` once fixed).

**Quotas and journal.** `max` targets (1 to 1,000, the manifest's); 60 new
targets an hour; 1,000 deliveries an hour per tool (a send to 50 targets is
50; `QuotaExceeded`, nothing sent); 500 targets a send; `text` 1 to 4,000
characters, `data` 16 KiB, `label` 80. The Chest journals every delivery
for 30 days (target, event, key, attempts, statuses, errors, times — never
the text or data, dropped once delivered or failed) on the owner's page for
the tool, where the owner can also disable any target; `journal()` gives
the tool the same, for its admin's screen. Addresses are kept encrypted
and never shown whole again, not even to the tool.

Refusals: `ChestError` `invalid_target`, `invalid_message`, `invalid_id`,
`invalid_query` (400, nothing sent), `address_refused`,
`verification_failed` (422), `target_not_found` (404, `enable`),
`QuotaExceeded`, `CapabilityNotGranted` (not declared, or a Chest without
webhooks yet — the tool hides its "Add a webhook" form and says so),
`Unavailable` (send again with the same key: harmless).

In tests: `fakeChest({webhooks: {max, resolve?, deliver?, to?}})` —
`resolve` plays DNS (`{"rebind.example.com": "10.0.0.7", "gone.example.com":
"nxdomain"}`; other names resolve to a public address), `deliver(url,
{method, headers, body})` receives each POST a test wants to see (a
receiver verifying the signature), `to` is where `webhook.disabled` is
posted. `chest.webhooks.targets` (with `fullUrl`, `secrets`),
`.deliveries` (with `text`, `data` and the last `request`: url, headers,
body), `.events`; `.respond(targetOrUrl, 503 | "timeout" | "dns" | …)`
makes a receiver fail from now on (200 by default); `.retry()` plays the
time of every pending retry. The fake makes each first attempt before
`send` answers, so a test reads the outcome at once. The harness's `/_dev`
lists the targets and the journal (bodies and signatures), makes a target
answer 503 or time out, and plays the retries; nothing leaves the
machine. The one-request-a-second pacing and `Retry-After` are designed,
not faked.


## `files` — public uploads and public files (Proposal (studio))

Built from the decided storage spec (`reference/product/specs/tool-storage.md`),
which the Chest has not built yet:

```jsonc
// chest.proposals.json — two permissions (with "public": true and the capability files in chest.json):
//   "Lets visitors of its public part upload files (10 MiB each at most)."
//   "Publishes the files it puts under public/ on its public address."
{ "files": { "publicUploads": true, "publicFiles": true } }
```

```ts
// A public page's action, after the tool's own checks of the visitor:
const up = await files.publicUploadUrl("uploads/public/", { types: ["application/pdf"], maxSize: 5 << 20, expiresUnclaimedAfter: 86400 });
// → { url: "https://<public host>/_chest/upload/<token>", method: "PUT", expiresIn }: the visitor's browser PUTs the file there, no session
const object = await files.claim(claimFromTheForm);   // the visitor's browser got {type, size, claim}; the tool trades the claim, once

files.publicUrl("public/logo.png", { version: info.updated }); // "/_chest/public/logo.png?v=…" on the public host
```

A public upload: 10 MiB at most whatever `maxSize` says (`TooLarge`
beyond), only under `uploads/public/`, 30 a minute per visitor address,
the type and content checks of 0.4.1's uploads (`type_refused`,
`type_mismatch`, `too_large`); its token works only on the public host's
route (and a private token only on the team host's). It answers the
visitor's browser `{type, size, claim}` — never the object's name: the form
sends the claim with the rest; the tool's server trades it once with
`files.claim(claim)` → the object (0.4.1's `FileObject`, `sha256`
included), so a visitor can only attach what they sent themselves. With
`expiresUnclaimedAfter` (60 s to 7 days), the Chest deletes an upload
nobody claimed in that time: no sweep in the tool. (A tool that names each
object itself and signs the name into its form, as Hiring does, may keep
doing so.) Until studio.1 of 0.4.1 it was `files.uploadUrl(name, {public:
true})`: a public upload's address is not the team host's, which 0.4.1's
`uploadUrl` checks, so it is a function of its own.

Public files: objects under `public/`, served on the public host at
`/_chest/public/<name>`, cached an hour, `?v=` for a new version. In tests:
`fakeChest({ storage: { publicUploads, publicFiles } })`; the fake's
public-upload address is on its own origin, as 0.4.1's fake serves the
team host's.

## `testing` — the studio's fake Chest

`fakeChest` starts **0.4.1's fake Chest** — its members, groups, files
(links and uploads on its own origin, content sniffed), badges,
notifications, AI, erasures, `emit()` and `run()`, with its bounds, quotas
and errors — and a second server on 127.0.0.1, **the studio's**, which
`CHEST_API` points to. The studio's server answers the proposals' routes
itself and passes every other request to 0.4.1's fake as it came, its
answer back as it went; it completes two answers, and only for what the
studio's options add: a member's `groups` in the members API leave out
those that do not give the tool (`grants: false`), and lookup answers as
"former" the people a test put in `chest.former` after the start (0.4.1
reads `options.former` once). `chest.api` is the studio's server, and
0.4.1's links and uploads are signed for it. The object it returns is
0.4.1's fields, read and written through (`chest.members`,
`chest.notifications`, `chest.files`… are 0.4.1's), and the studio's:

| Function | Gives |
|---|---|
| `fakeChest({tool})` | The tool's name (`chest.json` `name`) as `CHEST_TOOL` while the fake runs — what `events.publish`, `member()` and the signatures read. Without it, the environment's `CHEST_TOOL`, or `"tool"` (0.4.1's rule) |
| members' `language`, `timeZone`, `mailPreference` | `fakeChest` members, `signAssertion` and `withMember` take a member whose `language` and `timeZone` may be left out (type `FakeMember`): the Chest's (`chest: {language, timeZone}`), as a real Chest gives its default. `mailPreference` is what `mail.preference` answers and `mail.send` applies. The assertion carries exactly 0.4.1's claims |
| `fakeChest({groups: [{…, grants: false}], capabilities: [..., "groups"]})`, `chest.groups` | Groups that do not give the tool, seen only with `groups` (`groups.all`, `groups.members`, `groups.of`); 0.4.1's `groups.list` and a member's `groups` show those that do; `emit` delivers `group.changed` and `group.removed` |
| `chest.former` | Those the tool had who no longer have it (`{id, name?, status?, leftAt?}`): lookup answers them as 0.4.1's fake would, `leftAt` answers when. A test that removes a member from `chest.members` moves them here, as a real Chest would, then calls `clearCaches()` |
| `chest.clearCaches()` | Forgets what the process keeps of the Chest's answers — lookup's minute (0.4.1's `forget`), the theme — after a test changed `chest.members`, `chest.former` or `chest.theme` by hand |
| `chest.upload(url, data, type)` | Plays a browser sending a file to an `uploadUrl` or a `publicUploadUrl` answer (a PUT of `data` of that type; 0.4.1's front sniffs the content) |
| `fakeChest({tools})`, `chest.tools`, `chest.installTool(name, {teamUrl?, publicUrl?})`, `chest.removeTool(name)` | The tools installed beside this one (`chest.tools.get`), by name: `true` for a team host at `https://<name>-chest.chest.test`, or its addresses. This tool is always there, at `chest: {teamUrl, publicUrl}`. `installTool` and `removeTool` rewrite `CHEST_TOOL_URLS` as the Chest does |
| `fakeChest({theme, themeFiles})`, `chest.theme`, `chest.themeFiles` | The company's look at its two levels (`{all, tools}`), which `chest.theme()` answers resolved for the tool with `max-age=0`; the files its front serves under `/_chest/theme/` |
| `fakeChest({network: {host: handler}})`, `chest.egress` | The hosts the tool declares (`chest.json` `network`: `"graph.microsoft.com"`, `"*.icloud.com"`, `"*"`) and a handler of Web Requests answering each. While the fake runs, the tool's **plain `fetch()`**, unchanged, goes as through the Chest's egress proxy: a declared host to its handler (redirects followed through declared hosts, `AbortSignal` honoured); an undeclared name, an IP literal or a port other than 80/443 refused as the proxy refuses — `fetch` rejects with a `TypeError` for `https:`, answers 403 `Chest-Egress: refused; reason=…` for `http:`; `localhost`, `127.0.0.1` and `::1` straight through. `chest.egress` lists each request `{method, url, status, refused?}`. It replaces `globalThis.fetch` (and gives it back on `close`): Node reads `NODE_USE_ENV_PROXY` only when it starts. `node:http(s).request` is not routed |
| `fakeChest({emits, receivers, linked})`, `chest.published`, `chest.linked`, `chest.deliver(event, to)` | Events between tools: what `publish` records (with `occurredAt`), the tools linked to receive each type (`receivers`), another tool's event delivered on `/chest-events`, signed `Chest-Event` |
| `fakeChest({delivery})`, `chest.delivery` | Whether the Chest delivers: `{mail: "ready" \| "not_connected" \| "suspended", webhooks: "ready" \| "suspended"}`, what `mail.available()` and `webhooks.available()` answer; `send` follows it |
| `fakeChest({mail})`, `chest.outbox`, `chest.held`, `chest.receive(message, to)`, `chest.bounce(messageId, to, options?)` | Mail: what was sent, what members' preferences held back (`{id, member, reason, subject, text}`), a message delivered to `POST <to>/chest-mail` as the Chest would (HTML cleaned, original stored, executables dropped, `thread`/`deliveredTo`, `authenticated`, `auto`), a sent message bounced |
| `fakeChest({calendar})`, `chest.calendar`, `chest.feed(member)`, `chest.feedUrl(member)`, `chest.newFeedUrl(member)` | The calendar bridge (with `"calendar"` in `capabilities`): the events put, a member's feed as the Chest writes it, its secret address |
| `fakeChest({checks})`, `chest.checks`, `chest.check(name, to, result?)` | Checks: the list the tool configured, a result delivered to `POST <to>/chest-checks`, signed `Chest-Check` |
| `fakeChest({webhooks})`, `chest.webhooks` | Webhooks: targets, deliveries, events, `respond()`, `retry()` |
| `fakeChest({visitors})`, `fakeChest({broadcast: false})`, `fakeChest({storage})` | The Chest's ceiling per visitor address; a Chest without broadcast; public uploads and files |
| `chest.close()` | Stops both servers, gives `fetch` back, and restores the environment (0.4.1's variables by 0.4.1's `close`, `CHEST_TOOL` and `CHEST_TOOL_URLS` by the studio's) |

## Develop (studio)

As 0.4.1 (above), with the studio's files: `npm test` builds
(`tsconfig.studio.json`: 0.4.1's modules and the studio's), compiles every
test and runs **0.4.1's tests, unchanged** (`client/test/`) and **the
studio's** (`client/studio/test/`) — `npm run test:official` and `npm run
test:studio` run either. `npm run check:package`
(`scripts/check-studio-package.mjs`) checks the package as a consumer
receives it: every subpath's names (0.4.1's and the studio's), from plain
Node ESM, an esbuild bundle and a Vite SSR build (the Perseus starter's
stack), on a fake Chest, and a TypeScript consumer under `bundler` and
`nodenext`. 0.4.1's own `test` and `check:package` also build and pack
`check/` (`@argentic/chest-check`), which this copy does not hold: the
studio runs the checker with `scripts/chest-check.mjs` at the
repository's root, and `contract/README.md` is 0.4.1's as published. The
version is `0.4.1-studio.N`, `N` growing with each change of the
proposals. Semver sorts such a pre-release before 0.4.1: nothing resolves
it by range — a tool depends on its tarball by file
(`file:vendor/…`). A tool vendors it with
`node scripts/add-sdk.mjs <tool>` (`vendor/argentic-chest-sdk-0.4.1-studio.N.tgz`).
