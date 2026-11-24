# Chest SDK

`@argentic/chest-sdk` is what a server tool (tool contract 0.7) embeds to talk
with its Chest: the member the Chest asserts on a request, the Chest itself
(its organization, time zone and language, and where the tool is
reached), the other members who have the tool, the address of the tool's own
database, its private files, the folders of Files it is given, the badges and notifications it shows members
inside the Chest, the events of its members' lifecycle and between tools, AI
models through the Chest, live updates of its members' pages (with their
browser client) — and, for the tool's tests, a fake Chest. It also publishes the tool
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
all, with the sealed, files, folders, members, notifications, events,
schedules, actions, ai and realtime APIs as the namespaces `sealed`, `files`,
`folders`, `members`, `notifications`, `events`, `schedules`, `actions`, `ai` and
`realtime` (the browser
client and the testing module are not in the root).

| Import | Gives |
|---|---|
| `@argentic/chest-sdk/member` | `member(request)`, type `Member`: the member of a request on the team host of a server tool, with the language the Chest speaks to them and the zone they work in, read from the `Chest-Member` assertion and verified; `null` without a valid assertion. `memberIdPattern`, `groupIdPattern`, `languagePattern`, `timeZonePattern`: the grammars of the identifiers (`mbr_…`, `grp_…`), of a language and of a zone |
| `@argentic/chest-sdk/chest` | `chest`, type `Chest`: the Chest the tool runs in — `chest.organization.name`, `chest.timeZone`, `chest.language`, `chest.today()` — and where the tool is reached — `chest.tool.teamUrl`, `chest.tool.publicUrl` —, the same for every member, on a request or outside one |
| `@argentic/chest-sdk/members` | `list`, `get`, `lookup`, `groups.list`, `forget`, types `MemberPage`, `Lookup`, `FormerMember`, `Group`: the members who have the tool (capability `members`, their addresses with `members.email`, every group of the Chest with `members.groups`) |
| `@argentic/chest-sdk/notifications` | `notify`, `broadcast`, `withdraw`, `badge.set`, `badge.setMany`, types `Notice`, `Words`, `Audience`, `Delivery`, `BadgeCount`, `BadgeWrite`: counters on the tool's tile and items in members' inboxes, inside the Chest (capability `notifications`) |
| `@argentic/chest-sdk/events` | `handle`, `verify`, `emit`, `acknowledgeErasure`, `memorySeen`, `erasureIdPattern`, types `ChestEvent`, `ChestEventType`, `MemberUpdated`, `AccessRevoked`, `MemberRemoved`, `MemberErased`, `MemberChange`, `FolderEvent`, `FolderEventType`, `FolderFileAdded`, `FolderFileRemoved`, `FolderEventFile`, `ToolEvent`, `ToolEventType`, `ReceivedEvent`, `Handler`, `Handlers`, `EmitOptions`, `EmitAudience`, `Emitted`, `Seen`: the events of the members' lifecycle (`"receives": ["member.*"]`), of the documents of the folders it is given (capability `folders`) and of other tools (`"receives": ["quote.accepted"]`) the Chest posts to the tool's `/chest-events`, verified, deduplicated by id; the events the tool tells the others (`"emits"`); and the acknowledgment of an erasure |
| `@argentic/chest-sdk/schedules` | `handle`, `verify`, types `Run`, `Handlers`, `Seen`: the runs of the tool's schedules (`"schedules"` in `chest.json`) the Chest posts to its `/chest-schedules` at their times, verified, deduplicated by id |
| `@argentic/chest-sdk/actions` | `handle`, `read`, `answer`, `Refused`, types `Call`, `Answer`, `Handlers`: the actions Perseus calls in a member's name (`"actions"` in `chest.json`), posted to the tool's `/chest-actions/<name>`, verified, with the member |
| `@argentic/chest-sdk/ai` | `chat`, `embed`, `models`, `usage`, types `Alias`, `Provider`, `ChatMessage`, `ChatTool`, `ToolChoice`, `ResponseFormat`, `ChatOptions`, `ChatResult`, `ChatChunk`, `ToolCall`, `ToolCallDelta`, `Usage`, `EmbedOptions`, `Embeddings`, `AiModel`, `AiUsage`: AI models through the Chest, on the owner's connectors, metered against the tool's monthly cap (capability `ai`) |
| `@argentic/chest-sdk/realtime` | `publish`, `send`, `online`, `presence`, `channelPattern`, `eventPattern`, type `Present`: live updates of the members' pages, the Chest holding their connections (capability `realtime`, the key `realtime` of `chest.json`) |
| `@argentic/chest-sdk/realtime/client` | `connect`, `peerEventPattern`, types `Live`, `Channel`, `Listener`, `EventInfo`, `PeerListener`, `RefusedListener`, `Present`, `ClosedReason`: **the browser's side**, the one module that runs in a page — it joins the tool's channels on the Chest and hears its feeds' rows and its events, apart from the other members' messages, and who is present; it tells the Chest which channel the member has on screen |
| `@argentic/chest-sdk/database` | `databaseUrl()`: the address of the tool's own PostgreSQL database (capability `database`) |
| `@argentic/chest-sdk/sealed` | `seal`, `sealMany`, `open`, `openMany`, `isSealed`, types `SealOptions`, `SealItem`, `OpenItem`: sensitive values the Chest seals under a key of the tool and opens again only for the member of a request — and only one holding a role the value was sealed for (capability `sealed`) |
| `@argentic/chest-sdk/files` | `put`, `get`, `stat`, `list`, `move`, `delete`, `url`, `uploadUrl`, types `FileObject`, `FileData`, `FilePage`: the tool's private files (capability `files`), kept by the Chest, a 15-minute signed link to one (or to its thumbnail), and uploads straight from a member's or a visitor's browser |
| `@argentic/chest-sdk/folders` | `list`, `files`, `get`, `url`, `put`, `uploadUrl`, `remove`, types `Asker`, `Level`, `Folder`, `FolderFile`, `FolderPage`, `FolderFileData`: the folders of Files — the company's storage — the owner gives the tool (capability `folders`), for the member of a request (what they also see) or for nobody (a schedule, an event), a 5-minute link to a document and uploads from a member's browser, on the Chest's documents host |
| `@argentic/chest-sdk/errors` | `ChestError` (`code`, `status`), `CapabilityNotGranted` (403), `TooLarge` (413), `QuotaExceeded` (429), `RateLimited` (429), `StorageFull` (507), `Unavailable` (503), for sealed values and folders on a member's request `MemberRequired` (401), `NotAllowed` (403), `SealedInvalid` (400), `SealedLocked` (503), `SealedLost` (503), and for AI `AiCapReached` (402), `AiModelNotAllowed` (403), `AiRefused` (422), `AiUnavailable` (502, 503), type `AiUnavailableReason`: what the SDK throws when the Chest does not give what a tool asks |
| `@argentic/chest-sdk/testing` | `signAssertion`, `withMember`, `fakeChest`, types `AssertionOptions`, `FakeChest`, `FakeChestOptions`, `FakeGroup`, `FakeFile`, `FakeFolder`, `FakeFolders`, `FakeFoldersOptions`, `FakeDocument`, `FakeDocumentOpen`, `FakeFormer`, `FakeNotification`, `FakeEvent`, `FakeEmits`, `FakeEmitted`, `FakeRun`, `FakeAi`, `FakeAiModel`, `FakeAiReply`, `FakeAiCall`, `FakeOpen`, `FakeRealtime`, `FakeRealtimeOptions`, `FakeChannelRule`, `FakeFeed`, `FakePublished`, `FakeSent`: for the tool's own tests only |
| `@argentic/chest-sdk` | all of the above but `realtime/client` and `testing`; `sealed`, `files`, `folders`, `members`, `notifications`, `events`, `schedules`, `actions`, `ai` and `realtime` as namespaces |

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
`"use client"` module — but `@argentic/chest-sdk/realtime/client`, the
browser's side of live updates, which is the one module made for one. Webpack and Turbopack resolve the
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
its files, its members, its notifications, its events and AI), and the Chest posts it the
events it receives on `/chest-events`, the runs of its schedules on
`/chest-schedules` and the calls of its actions on `/chest-actions/<name>`,
through the same launcher. Rights come
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
`"chest": "0.7"` — the MAJOR.MINOR of this SDK. A Chest older than that
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
  groups: string[] | null; // "grp_…": the groups that give the member this tool —
                         // all of the member's groups with "members.groups";
                         // null when more than travel with a request (below)
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
`mbr_` identifier, `groups` `grp_` identifiers — or, instead, `groups_overage`
for a member in more groups than an assertion carries: about 150, the
assertion keeping within half of a Node server's 16 KiB of request headers;
`member.groups` is then `null` and the tool reads them with
`members.get(member.id)`, as Microsoft's tokens send a groups overage —, `language` a primary tag of
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
is in: the one their browser was last in, never chosen — it follows them at
once when they travel —, else the Chest's. The members API answers it too, so a tool reminds
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
chest.timeZone;          // "Europe/Paris": the company's reference zone, IANA
chest.language;          // "fr": the Chest's own language (a member's is member(request).language)
chest.tool.teamUrl;      // "https://tasks-chest.acme.argentic.work": where members open /chest
chest.tool.publicUrl;    // "https://status.acme.com": the public part (its custom domain), or null
chest.today();           // "2026-09-30": the date now in the Chest's zone (or chest.today(at))
```

The Chest gives these to every tool in its environment at each start
(`CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`,
`CHEST_TEAM_URL`, `CHEST_PUBLIC_URL`), and starts every tool that is awake
again when one changes — the owner renames the organization or changes its
language in Settings → General; a custom domain served, or no longer,
changes the public address —;
a tool asleep reads them when it wakes. The tool never asks its own admin for
the company's name or zone, nor guesses its own address from a
request. They are there outside a
request too: a scheduled job, a start-up task, an export. No capability is
needed: nothing here is more than what the Chest's pages show its members.

- `organization.name` is plain text of 2 to 80 characters: show it in a
  header, a document or an email, never as HTML.
- `timeZone` is the company's day: a document's date, “every day at 09:00”
  for the whole company. It is taken from the owner's browser when the
  Chest is opened and never follows anyone's travels; no screen sets it.
  What concerns one member — their reminder, “today” on their page — uses
  `member.timeZone` instead, the zone of their browser, which follows them
  at once. The Chest also makes `timeZone` the `TimeZone` of the tool's database sessions: there,
  `current_date`, `now()::date` and a `timestamptz` shown as text are in the
  Chest's zone. A session may set its own (`SET TIME ZONE`), for itself.
- `language` is the language of what the tool writes for no one in
  particular: a public page before the visitor chooses, an export's default.
  A page of `/chest` speaks `member(request).language` instead.
- There is no Chest currency: a company may work in several. An amount
  keeps its own ISO 4217 code beside it, in the tool's data (a quote in
  `GBP`, an expense in `USD`), formatted with `Intl.NumberFormat(language,
  { style: "currency", currency })`.
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
tests, `fakeChest({chest: {organization, timeZone, language,
teamUrl, publicUrl}})` sets them.

## `members` — who has the tool

A tool that declares `"capabilities": ["members"]` (approved like a
permission: “Sees the name, photo, role and groups of the members who have
access to it.”) reads the members who have it, through the Chest's API
(`CHEST_API`, as for files). `"members.email"`, a permission of its own that
requires `members`, adds their addresses — to these answers and to
`member(request)`. `"members.groups"`, another permission that requires
`members` (“Sees all the Chest's groups, and which of the members who have
access to it are in each.”), widens the groups the tool sees from those that
give it to every group of the Chest — in `groups.list()`, in `Member.groups`
here and in `member(request)`.

```ts
import * as members from "@argentic/chest-sdk/members";
const { members: page, next } = await members.list({ q: "cam", limit: 50 }); // by name, then id
const camille = await members.get("mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya");        // Member, or null
const { members: found, former, unknown } = await members.lookup(ids);      // any number of ids
const { groups: teams, next: more } = await members.groups.list();         // [{id, name, size}], a page
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
- **`groups.list({after, limit})`**: the groups the tool sees — those that
  give it, or every group of the Chest with `members.groups` —, a page at a
  time like `list` (by name then identifier, 100 by default, 500 at most,
  `next` the cursor of the next page), each `{id, name, size}`: `size` is
  how many of its members have the tool, and `list({group: id})` pages
  them (never anyone without access). No count bounds a team: a Chest
  holds as many members and groups as its capacity, and every list is
  read page after page. A tool open to everyone (news, polls, a wiki)
  declares `members.groups` to offer “the Sales team”; `member.groups` then
  answers “is she in Sales?” without a call. Store group identifiers and
  resolve names when rendering, as for members: a renamed group needs
  nothing, and someone who joins or leaves a group the tool sees — a group
  deleted included — is `member.updated` naming `groups`.
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
attention, inside the Chest — no push to a phone. Members may also get mails
of their notifications, by their own choice in their profile (each one,
once or twice a day, or none): that is the Chest's, and the tool does
nothing for it — no call, no permission, no member's address. Two
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
  translations: { fr: { title: "Nouvelle tâche : réparer la porte" } }, // optional
});
await notifications.broadcast(           // everyone who has the tool, but the author
  { title: "New poll: the summer party", path: "/chest/polls/7", key: "poll:7" },
  { to: { groups: [sales] }, except: [author] }, // or roles: ["editor"]; leave to out for everyone
);
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
- **`notify(memberIds, {title, body?, path?, key?, translations?})`**: the
  identifiers given, one at least (a duplicate counts once), one inbox item
  per recipient; no count bounds them but the team's size — the Chest takes
  a body that names each member once, and refuses one beyond
  (`invalid_body`). `title` is 1 to 80
  characters (Unicode code points), `body` 280 at most (an empty body is
  none). `path` is a page of the tool's private part: `/chest`, or `/chest`
  followed by `/`, `?` or `#`; printable ASCII without spaces or `\`, 512
  characters at most, never `//`, no `.` or `..` segment; the Chest builds the
  link on the tool's team host, so it cannot point anywhere else. `key` is
  1 to 64 of `a-z 0-9 . _ : -`.
- **`broadcast(notice, {to?, except?})`**: one item, in each member's
  language, for every member who has the tool now — resolved by the Chest:
  the tool needs not see its members —, or with `to` those in any of its
  `groups` **or** holding any of its `roles` (the 16 it declares at most);
  `except` leaves members out — the author, those who already answered. A
  group the tool does not see (one that does not give it, without
  `members.groups`, or deleted) and a role it does not declare reach no one,
  and the call answers nothing — not even how many received it: a tool that
  wants to say “sent to 42 people” counts with `members`. A key and
  `withdraw` work as for `notify`. Who may trigger a broadcast in the tool is
  the tool's rule (its roles).
- **Languages.** `translations` gives the same `title` and `body` in other
  languages, by language tag (`fr`, 2 or 3 lowercase letters), each bounded
  as the original: each recipient reads the one of `member.language`, the
  tool's own words otherwise — for `notify` and `broadcast` alike, so a tool
  never groups its recipients by language.
- **Replace and withdraw.** A notification with the key of an earlier one, for
  the same member, replaces it: new text, new time, first in the inbox and
  unread again — never a duplicate. `withdraw(key, memberIds?)` removes the
  items of that key, from every member or from those named, once
  the thing they were about is done. It never says what existed.
- **Plain text.** The Chest removes control characters (a tab or a line break
  in a title becomes a space; `body` keeps its line breaks) and the characters
  that reorder text, trims both, and interprets neither Markdown nor HTML.
  Every item shows the tool's icon and name beside it: a tool cannot pass for
  the Chest or another tool. A title that is empty once cleaned is refused.
- **Muting is invisible.** A member may mute the tool in their profile: their
  new items are then dropped, but they still count as `delivered`, and their
  badges stay. The tool never learns who muted it.
- **Badges** go from 0 to 9,999, 0 clears one. `setMany` takes one at least,
  a member at most once. A badge is a state: the last write wins, never
  refused.
- **Pace, never a refusal.** A tool's notices to a member go at a normal
  pace — ten at once, then one every six minutes, per tool and member;
  beyond, of `notify` and `broadcast` alike, the Chest folds them into the
  tool's one grouped item in that member's inbox: “37 new notifications”
  above the latest's title, opening the latest's path, unread again — and
  one line of the member's next mail, if they get mails. The call answers as
  ever, nothing is lost, and a burst however fast takes one item. A notice
  whose `key` names an item replaces it, never folded; a folded notice keeps
  no key (`withdraw` cannot reach it). Only a malformed or oversized call is
  refused.
- **Lifecycle**: a member who loses access loses the tool's items and badge;
  removing the tool removes them all. A member's inbox keeps 500 items for 90
  days.
- Errors: `CapabilityNotGranted` (403), `Unavailable`
  (503, the Chest not reached, or an answer that is not its own: the call may
  or may not have happened), `ChestError` for the rest (`invalid_id`,
  `invalid_role`, `invalid_title`, `invalid_text`, `invalid_path`,
  `invalid_key`, `invalid_language`, `invalid_count`, `invalid_body`) — the
  SDK refuses these before sending anything.

A badge suits a count that goes up and down (tasks assigned, messages
unread); a notification, an event worth a look — with a key, so that it goes
away by itself once handled.

## `events` — the members' lifecycle, and events between tools

The Chest posts its events and those of other tools to the tool's own
`POST /chest-events`, signed for it, on one route and through one `handle`:

- **the members' lifecycle**, for a tool that holds `members` and declares
  `"receives": ["member.*"]`;
- **the documents of the folders of Files it is given**, for a tool that
  holds `folders` ([below](#events-of-the-folders));
- **events between tools**: what another tool of the Chest tells
  (`quote.accepted` from a quotes tool), for a tool whose `"receives"`
  names the type. And a tool tells the others with `emit`, for the types
  its `"emits"` declares.

### The members' lifecycle

A tool that holds `members` and declares `"receives": ["member.*"]` in its
`chest.json` (approved like a permission: “Is told when the members who have
access to it change or leave.”) is told:

| Event | `data` | When |
|---|---|---|
| `member.updated` | `{id, changed: ("name" \| "photo" \| "role" \| "groups" \| "email" \| "language" \| "timeZone")[]}` | Something the tool sees of a member who has it changed (`email` only with `members.email`; `language` and `timeZone`: the language the Chest speaks to them and the zone they work in — a digest's words and hour) |
| `access.revoked` | `{id}` | The member lost access to the tool but stays in the Chest |
| `member.removed` | `{id}` | The member left the Chest: `lookup` now reads them `former` |
| `member.erased` | `{id, erasure, deadline}` | The owner asked for this person's data to be erased: delete or anonymise what the tool keeps of them before `deadline` (30 days), then `acknowledgeErasure(erasure)` |

A member who gets the tool is no event: the next `list` has them. Every
member event empties what `members.lookup` keeps.

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

- **`members.list` is the truth.** Reconcile by listing at start (and so after
  being out of sync): events keep a tool current between starts, they do not
  replace reading who has it.
- **`acknowledgeErasure(erasure)`**: `POST /erasures/{erasure}/done` on the
  Chest's API; the owner then sees the tool's part done (“Erased on 3 Oct.”),
  “Overdue” past the deadline otherwise. Again is harmless. Errors:
  `ChestError` `erasure_not_found` (404: an erasure this tool was not told of)
  or `invalid_id` (400), `CapabilityNotGranted` (403), `Unavailable`.

### Events of the folders

A tool that holds `folders` is told of the documents of the folders of
Files it is given — and of the folders inside them —, with no `"receives"`:

| Event | `data` | When |
|---|---|---|
| `folders.file.added` | `{folder, file: {id, name, type, size}}` | A document was added to the folder, or a new version of one |
| `folders.file.removed` | `{folder, file: {id, name, type, size}}` | A document went to Recently removed |

Never who did it, never a folder the tool was not given. The event comes
for nobody: read the document with `folders.get(null, e.data.file.id)`
(what the tool's grants reach), and tell members through notifications.

```ts
"folders.file.added": async e => { await queueReceipt(e.data.folder, e.data.file.id); },
```

### Events between tools

One tool reacts to what happens in another: a quote accepted in Quotes
creates a project in Tasks. The publisher says what it tells, each type in
a sentence with the fields of its data; the receiver says which types it
wants, from whichever tool tells them. The owner approves each link when
the second of the two tools is installed (“Quotes → Tasks: A quote is
accepted — quote, client, total”); an admin can switch a link off.

```jsonc
// chest.json of Quotes
{ "emits": { "quote.accepted": { "description": "A quote is accepted",
    "data": { "quote": "id", "client": "text", "total": "number", "acceptedBy": "member", "note": "text?" } } } }

// chest.json of Tasks: types, never tools
{ "receives": ["member.*", "quote.accepted"] }
```

- **A type** is two to four dotted segments of lowercase letters, digits
  and dashes, each starting with a letter (`quote.accepted`, `hire.made`),
  64 characters at most; `member.*`, `access.*` and `folders.*` are the Chest's. A new
  shape of data is a new type (`quote.accepted.v2`): a type's data only
  grows.
- **Fields** are camelCase names of a kind: `id` (an identifier of the
  tool's own: 1 to 128 letters, digits, `.`, `_`, `:`, `-`), `text` (no
  control character but line feeds and tabs, no format character), `number`,
  `boolean`, `time` (an RFC 3339 instant), `date` (`YYYY-MM-DD`), `member` (a
  member id), `members` (a list of distinct member ids); `?` for an
  optional one (left out or `null`). People are member ids, never names nor
  addresses: the receiver resolves them under its own permissions. The
  Chest refuses a field not declared, missing or of another kind, a member
  the tool never had, and data beyond 16 KiB of JSON.

```ts
// Quotes: tell, once the quote is accepted in the database
import * as events from "@argentic/chest-sdk/events";

const { id, receivers } = await events.emit("quote.accepted",
  { quote: q.id, client: q.client, total: q.total, acceptedBy: who.id },
  { subject: q.id, key: `accepted:${q.id}`, audience: { groups: q.groups } });
```

```ts
// Tasks: app/chest-events/route.ts — the same route as the members' events
export async function POST(request: Request) {
  return new Response(null, { status: await events.handle(request, {
    "access.revoked": e => unassign(e.data.id),
    "quote.accepted": async e => {
      // e: {id, type, source: "quotes", occurredAt, subject?, audience, data}
      await createProject({ quote: String(e.data["quote"]), visibleTo: e.audience === "all" ? null : e.audience });
    },
  }, { seen }) });
}
```

- **`emit(type, data, {subject?, key?, occurredAt?, audience?})`** →
  `{id, receivers}`: the event's id and how many tools it was written for
  (0 is no error: nobody listens, or none of their members may see it). The
  Chest writes it for each linked receiver before answering. `subject` is
  the thing it is about (an `id`): a receiver gets a subject's events in
  the order emitted. `key` makes it idempotent: the same key within 72 hours
  answers the same event and tells nobody again (after an `Unavailable`,
  emit again with the same key); the same key with other content is
  `key_reused`. `occurredAt` (a `Date` or an RFC 3339 instant within the
  last 72 hours) is when it happened, the Chest's time by default.
  `audience` is who in the tool may see the item: `{members?, groups?,
  roles?}` (the tool's roles), each listed once — leave it out when
  everyone who has the tool may. The SDK refuses what is no type, no
  identifier or no audience before sending anything; the Chest checks the
  data. Errors: `ChestError` `invalid_type` (400: not in `"emits"`),
  `invalid_data` (400), `invalid_audience` (400), `invalid_event` (400:
  `subject`, `key`, `occurredAt`), `key_reused` (409); `TooLarge`,
  `CapabilityNotGranted` (the version emits nothing), `Unavailable`.
- **The audience is who may see it, and the receiver honours it.** The
  Chest intersects it with the members who have the receiver: none in
  common, the event is not delivered there; all of them, `audience` is
  `"all"`; otherwise it is the list of the receiver's members who may see
  the item. Show it to them only — the Chest cannot look inside the
  receiver's database: honouring the list is the receiver's rule.
- **Read data defensively.** `data` holds the fields the publisher's
  version declares, and a later one may add some: `handle` never refuses an
  event for a field it does not know. `source` is the tool that told it,
  stamped by the Chest.
- **Loops are cut by the Chest.** An `emit` made inside the handler of a
  tool event carries that event as its `cause`, by itself (through the
  handler's async context): a chain that would pass twice through the same
  tool and type is accepted and told to nobody. Work deferred elsewhere (a
  schedule) starts a new chain.
- A draft's own emits reach no tool; the preview's log says what it emitted.

### Delivery, for both

- **At least once.** An event is an envelope `{id: "evt_…", type,
  occurredAt, data}` — for a tool event also `source`, `audience` and, when
  the publisher gave one, `subject` — signed for this tool (`Chest-Event`
  header, HS256 under a key derived from `CHEST_TOKEN` with the label
  `Chest-Event v1`, naming the event and the SHA-256 of the body, 60
  seconds). Any answer but a 2xx is delivered again, the same event with the
  same id, after 5 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 30 min, then
  every hour, for 72 hours — a restart of the node included. Given up, a
  member event leaves the tool “out of sync” on its page until its next
  start; a tool event is a failed delivery on the receiver's **Events**
  page, kept 30 days, that an admin may send again (the same id). Tool
  events of one subject come in the order emitted; nothing else is ordered.
  A sleeping tool is woken by a delivery, like by a visit.
- **`handle(request, handlers, {seen?})`** answers the status to give the
  Chest: 401 for what is not a delivery of the Chest for this tool, 204 for
  an event handled, one already in `seen`, a type without a handler, or a
  member type of a later Chest (signed, ignored). Handlers are keyed by
  type: a member type's handler gets its own event (`MemberErased`…), any
  other type's a `ToolEvent` (annotate a handlers object apart with the
  types it holds: `Handlers<"member.erased" | "quote.accepted">`). It reads
  the body — up to 32 MiB, as a tool event may name a whole team in its
  audience, and only once the signature holds: mount it before any body
  parser. A handler that throws leaves the event unseen and `handle`
  throws: answer 500, it comes again. `seen` is the store of the handled
  ids — `memorySeen()` (the default: 10,000 ids in the process, lost at a
  restart) or a table of the tool's own, as above. Make handlers idempotent
  anyway: an event handled but not yet added to `seen` when the tool stops
  comes again.
- **`verify(request)`** is the event of a delivery, typed (`ChestEvent` or
  `ToolEvent`), or `null`; for a tool that routes events itself (its emits
  then carry no cause).
- Never put the route behind your own session or under `/chest`.

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
version that loses one or changes one is refused. Before a version's
migrations the Chest sets the tool's database aside (a copy, bounded by the
server's disk): a version that does not become ready is put back with it, and
a rollback to the version before brings that version's data back — what was
written since is not in it, which the owner is told before deciding. Without
a copy (none was needed, or the disk could not keep it) the previous version
runs on the schema as it is. So a migration only adds — **expand, then
contract**: a column or a table a version stops reading is dropped, renamed
or retyped by the next release, in a migration marked with the line
`-- chest: contract`; `chest check` warns about any other.

## `sealed` — sensitive values only members open

A tool that declares `"capabilities": ["sealed"]` (approved like a
permission: “Seals sensitive values, and opens them only for the members who
have access to it”) seals an IBAN, a salary, a medical note, a confidential
message through its Chest, and stores the sealed text in its own database,
in any text column. The Chest seals it with a key of the tool that never
leaves the Chest; only the tool opens it again, through its Chest, **on the
request of a member who has the tool** — the Chest's front gives each
member's request a ticket (`Chest-Opener`), which the SDK passes back and
the tool cannot make. A value sealed for roles opens only for a member who
holds one of them: their role is set by the owner or an admin, never by the
tool. The Data tab, the agents' SQL and data APIs, builders, the owner, the
logs and the backups see `chest:sealed:1:…`, shown as **Sealed**.

```ts
import { seal, open, openMany } from "@argentic/chest-sdk/sealed";

// "capabilities": ["database", "sealed"], "roles": ["hr", "member"]
const iban = await seal(form.iban, { context: `employee:${id}`, roles: ["hr"] });
await sql`update employees set iban = ${iban} where id = ${id}`;

// In a /chest route, on the member's request:
const shown = await openMany(request, rows.map(r => ({ sealed: r.iban, context: `employee:${r.id}` })));
// → the text of each, or null for a value this member may not open
const one = await open(request, row.iban, { context: `employee:${row.id}` });
```

- **`context`** binds a value to where it belongs, as AWS KMS's encryption
  context does: a value sealed for `employee:42` does not open as
  `employee:43`, so a sealed salary copied into another row opens nowhere.
  Use the row's kind and key; 256 bytes at most.
- **`roles`** (1 to 16 the tool declares): the Chest checks the member's
  role at every open; `open` throws `NotAllowed`, `openMany` answers `null`.
- **Sealing needs no member**: a public form, a schedule, an import seal.
  **Opening needs one**: a public page, a schedule or an event cannot open
  (`MemberRequired`). A request's ticket lasts 60 seconds, as its assertion.
- **Seal what nobody searches.** A sealed value is never searchable,
  sortable or filterable on the server: keep in clear what lists and filters
  need (a name, a date, a status). Open one page and filter it in memory.
- **Every open is journaled** — the member, how many values, when; never a
  value — and the owner sees the totals per member. Open what the page
  shows, not the whole table.
- **Every new version of the tool waits for the owner or an admin**,
  whoever wrote it: its code can read sealed data. Never log, never send to
  an AI or a mail what you opened unless the member asked for it.
- A value is text, 512 KiB at most; a call carries a page of them (4 MiB).
  Sealing or opening one costs microseconds in the Chest; batch with
  `sealMany` and `openMany`.
- `SealedLocked`: the Chest was restored and waits for its owner's recovery
  code (Settings); show “Sealed data is locked” and keep the rest working.
  `SealedLost`: the key is gone for good. `SealedInvalid`: altered, another
  tool's, or another context.
- A Perseus Code draft seals under a key of its own: its values never open
  in the tool, nor the tool's in it.

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

No quota: the tools of a Chest share its server's workload volume, each
keeps what it uses, and a write is refused only when the volume is full
(`StorageFull`, 507). One object is 32 MiB at most, unless its manifest asks
otherwise — approved by the owner like any permission, and a later version
that asks larger files is approved again:

```jsonc
// chest.json
{ "capabilities": ["files"], "files": { "maxObject": "100 MiB" } }
```

`maxObject` goes from 1 to 512 MiB. The SDK refuses beyond 512 MiB before
sending anything; the Chest holds the tool to its own bound (`TooLarge`).
`put` and `get` carry the bytes through the tool's server: for large files,
let the browser upload them itself.

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
// 400 type_mismatch, 413 too_large, 507 storage_full, 401 without a session
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

### Uploads from a visitor of the public part

A tool with a public part (`"public": true`) lets its visitors send files —
an application form with a CV, a support ticket with a screenshot — the same
way, with `public: true`, from a public route:

```ts
// Server side: a public route, e.g. app/api/apply/upload/route.ts
const up = await files.uploadUrl("applications/", {
  public: true,
  types: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  maxSize: 10 << 20,
});
// → { url: "/_chest/files/upload/<token>", method: "PUT", expiresIn }
```

```ts
// Browser side, on the public page: to its own address
const response = await fetch(up.url, { method: "PUT", body: file });
// 201 {name, type, size}; 415 type_refused (not of a type granted, whatever
// it is called), 429 slow_down (Retry-After), 411 length_required, 413,
// 507 storage_full
```

What differs from a member's upload, because the visitor is anonymous:

- **Into a folder only** (a name ending in `/`): the Chest names the file, so
  a visitor never replaces one. Keep visitors' files in folders of their own.
- **Declared types, recognised by their content.** `types` is required, each
  a type the Chest recognises by its bytes — images (`image/jpeg`, `png`,
  `gif`, `webp`, `avif`, `heic`, `bmp`, `tiff`, or `image/*`),
  `application/pdf`, Word, Excel and PowerPoint documents (`.docx`, `.xlsx`,
  `.pptx`), OpenDocument ones (`.odt`, `.ods`, `.odp`), and archives
  (`zip`, `gzip`, `7z`, `rar`, `tar`, `bzip2`, `xz`, `cab`) — `invalid_type`
  for another (plain text and CSV cannot be told by their bytes). The file is
  of the type its content is, whatever its name or the type the browser
  says; anything else is refused.
- **Private, never public.** The file joins the tool's private files: only
  its members see it, through the tool (`url` on the team host). The Chest
  never serves it on the public part.
- **Paced per visitor**, by client address: 10 uploads a minute, 2 at once,
  and 64 MiB in an hour (never less than the tool's largest object);
  beyond, `429 slow_down` with `Retry-After`. Nothing caps all the visitors
  together but the server's workload volume (`507 storage_full` when it is
  full).
- **On whichever address the page is**: `url` is a path, so the same page
  works on the tool's public address, on its custom domain, and framed by the
  company's website.

The browser gives the name it was answered back to the tool with the rest of
the form; `stat` it before recording it — a name the tool did not see come
is not a proof of anything.

### Links and thumbnails

`url(name, {thumbnail?, download?})` signs a link to the file as it is, on the
tool's **team host** (`/_chest/files/…`): whoever has it opens it without
signing in for 15 minutes, or until the file changes or goes; the Chest serves
it in a sandbox, displayed for an image, a PDF or plain text, downloaded
otherwise, or always downloaded with `download: true`. `thumbnail: 256` or
`1024` links to the image reduced to that many pixels (JPEG, PNG, GIF — its
first frame — and WebP up to 40 megapixels; `ChestError` `no_thumbnail`
otherwise); thumbnails are made once, not counted as the tool's files. `stat` gives
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
`CHEST_API`), `TooLarge` (413), `StorageFull` (507: the server's workload
volume, which every tool's files share, is full), `Unavailable` (the Chest
not reached, or an answer that is not its own: a write may or may not have
happened), `ChestError` for the rest (`invalid_type`, `no_thumbnail`,
`not_found` for `url` and `move`, `no_public_part` for a visitor's upload of
a tool without one…). Removing the tool removes its files; a new
version keeps them.

## `folders` — the company's folders the tool is given

Files is the company's storage in the Chest: folders and documents that
belong to the Chest, not to a tool. A tool that declares the capability
`folders`, with what it keeps there and the most it may do, is given
folders by the owner or an admin, one by one, after it is installed:

```jsonc
// chest.json — approved as “Opens the folders of Files you give it, to keep receipts with their expenses.”
{ "capabilities": ["folders"], "folders": { "purpose": "Keeps receipts with their expenses", "level": "edit" } }
```

`level` is `view` (open and download) or `edit` (also add, replace and
remove); no folder is ever given to the tool above it. Installing gives no
folder: the tool's page in the Chest has **Folders**, with **Add**. The
tool never lists the tree, never learns of a folder it was not given,
never shares.

**Who acts is the first argument of every call.** On a member's request,
pass the request: its `Chest-Opener` ticket proves the member, and the
tool reaches only what that member also sees, at the lower of both levels.
For nobody — a schedule, an event — pass `null`: the tool's own grants, as
the owner read when giving the folder (“Expenses will see 61 documents,
also when nobody is using it”). A request without a ticket is
`MemberRequired`, never read as nobody: that would reach more.

```ts
import * as folders from "@argentic/chest-sdk/folders";

const given = await folders.list(request);                        // [{id, name, level}]
const { folder, folders: inside, files, next } = await folders.files(request, given[0].id); // 200 per page, by name
const more = await folders.files(request, folder.id, { after: next! });
const receipt = await folders.put(request, folder.id, "Taxi 12 March.pdf", bytes); // {id, name, type, size, added, updated}
const content = await folders.get(request, receipt.id);           // {data, type, size} or null
const { url } = await folders.url(request, receipt.id, { download: true }); // 5 minutes
await folders.remove(request, receipt.id);                        // to Recently removed; false if none
const nightly = await folders.list(null);                         // a schedule: the tool's grants
```

- A document put under the name of one in the folder (letter case aside)
  is a new version of it; its type is what its content is. A name is 1 to
  255 characters, no space around it, without `/`, `\` or a control
  character (`invalid_name`); a document is 2 GiB at most.
- A page of a folder says the folder and its level, the folders inside it
  and 200 documents, never the path above it, who else holds it nor who
  added a document.
- Every open is journaled in the Chest under the tool's name for its member
  (“Expenses for Claire”), seen in the document's *Opens*.
- **Links** live on the Chest's documents host (`documents.<the tools'
  domain>`, never the tool's origin nor the Chest's), bound to the
  document as it is, the tool and the member, and checked again at each
  open: `url` gives one for 5 minutes, shown when it is an image unless
  `download`, downloaded otherwise.
- **Uploads from a member's browser**: `uploadUrl(request, folderId, name,
  size)` authorises one document of that size, sent by the browser from
  the tool's team host, once, within 15 minutes, the right to edit checked
  again when it comes:

```ts
const up = await folders.uploadUrl(request, folderId, file.name, file.size);
// in the browser, on a /chest page:
const sent = await fetch(up.url, { method: "PUT", body: file }); // 201 {id, name, type, size, added, updated}
```

Errors: `MemberRequired` (401), `NotAllowed` (403: the member is no longer
in the team), `CapabilityNotGranted` (403: no `folders`, or a write of a
version that asks `view`), `ChestError` `forbidden` (403: a folder the
asker may only view), `not_found` (404: a folder or a document the asker
does not reach), `invalid_name`, `invalid_size` (400), `StorageFull`
(507), `TooLarge`, `Unavailable`.

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

## `actions` — what Perseus reads and does in the tool

A tool says what Perseus, the Chest's assistant, may read and do in it, in a
member's name: “File this letter in Company › Insurance”, “What is our VAT
number?”. Each action is declared in `chest.json` and approved at install,
in its own sentence (“Perseus may: Add a paper to a section of the
company”):

```json
{ "actions": {
    "add-paper": { "description": "Add a paper to a section of the company",
                   "input": { "section": "text", "document": "document", "valid": "date?" },
                   "changes": true },
    "record":    { "description": "Read the company's record", "input": {}, "changes": false } } }
```

```ts
// app/chest-actions/[name]/route.ts — at the root, outside /chest: the Chest calls
// it through the launcher only, never a browser.
import * as actions from "@argentic/chest-sdk/actions";

export async function POST(request: Request) {
  const { status, body } = await actions.handle(request, {
    "add-paper": async ({ input, member }) => ({ said: `Filed in ${await file(input, member)}` }),
    record: async () => ({ said: "The company's record", data: await record() }),
  });
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}
```

- **Declaration**: 16 actions at most, each named by one to three words of
  lowercase letters and digits joined by dashes (48 characters); a
  `description` of 1 to 80 characters in the member's words; an `input` of
  up to 16 camelCase fields with their kinds — those of an event's data
  (`id`, `text`, `number`, `boolean`, `time`, `date`, `member`, `members`;
  `?` for an optional one), `document` (the id of a document of Files the
  member reads in a folder given to the tool: open it with `folders`) and
  `amount` (`{ "value": "240.00", "currency": "GBP" }`, ISO 4217) —; and
  `changes`, `false` for an action that only reads.
- **Who decides**: Perseus calls an action that only reads by itself; one
  that changes only once the member confirmed Perseus's proposal. The
  call is the member's own: `call.member` is who it is for, and the tool
  applies its own rules to them as on any request of theirs.
- **Delivery**: `POST /chest-actions/<name>` through the launcher only,
  signed (`Chest-Action`) and with the member's assertion (`Chest-Member`),
  `{"input": {…}}` of 64 KiB at most, already checked by the Chest against
  the declaration (an input of another shape never reaches the tool). The
  tool answers within 10 seconds.
- **Answer**: `{ said, data? }` — `said`, the sentence Perseus shows (1 to
  280 characters), `data`, what a read returns (JSON, 64 KiB at most).
  Throw `new actions.Refused("invalid_input")` for an input the tool cannot
  take, `new actions.Refused("refused")` for what the member may not do;
  any other error answers 500.
- **Papers**: a tool with the capability `folders` names in `"papers"` the
  sections that take papers, each the folder of Files it keeps them in —
  `{"insurance": {"name": "Insurance", "folder": "Company", "action":
  "add-paper"}}` —; the mail room offers them beside the folders of Files,
  files the paper there, then calls the action named, with the document.

## `realtime` — live updates of the members' pages

The Chest holds every connection of the tool's pages: the tool writes no
socket code and **sleeps while pages stay open**; it wakes only when someone
writes. A page connects to the Chest on its own team host — the member's
session is the identity, no token —, joins the channels the tool declares,
and hears:

- the **rows of its feeds**, at each commit: a table named in `"feeds"` turns
  every insert, update and delete into `<table>.insert`, `.update`,
  `.delete` on its channel, carrying the declared columns (the Chest
  installs the triggers after the migrations: no SQL to write);
- what the tool **publishes** (`realtime.publish`) — what is not a row;
- the other members' **ephemeral messages** (typing, cursors), with their
  sender set by the Chest — apart: a member's message never arrives as the
  Chest's event, and its name has no dot (dotted names are the feeds' and
  the tool's), so no member can pass for a row or for the tool;
- who is **present**, merged across each member's pages.

```jsonc
// chest.json
{
  "capabilities": ["database", "realtime"],
  "realtime": {
    "channels": [
      { "name": "everyone", "presence": true },
      { "name": "room:{id}", "join": { "table": "room_members", "key": "room_id", "member": "member_id" }, "send": true, "presence": true },
      { "name": "inbox:{member}" },
      { "name": "desk", "join": ["manager"] }
    ],
    "feeds": [{ "table": "messages", "channel": "room:{room_id}", "columns": ["id", "room_id", "author", "text", "created_at"] }]
  }
}
```

| A channel's key | Says |
|---|---|
| `name` | `everyone` (that name), `room:{id}` (one segment, decided by a membership table), `inbox:{member}` (the joining member's own id only), `board:*` (any one segment); segments of `a-z 0-9 _ -`, 128 characters at most |
| `join` | Absent: every member who has the tool; `["manager"]`: those roles; `{table, key, member}`: a member joins `room:42` when a row of `room_members` has `room_id = 42` and `member_id` their id — checked by the Chest on the tool's database at each join, **the row deleted takes them out at once** |
| `send` | `true`: who joins may send ephemeral messages on it, checked at each message |
| `presence` | `true`: who joins may appear in its presence |

In the browser (a page of `/chest`, bundled with the page's own script):

```ts
import { connect } from "@argentic/chest-sdk/realtime/client";

const live = connect();
const room = live.channel("room:42");
room.onJoined(({ replayed }) => replayed || refetchAfter(lastId));  // joined (again): fetch, unless replayed
room.on("messages.insert", row => show(row));      // a row, as committed
room.on("rooms.changed", payload => …);            // realtime.publish
room.onResync(() => refetchAfter(lastId));         // what was missed is not all kept
room.onKicked(() => leaveRoom());
room.onRefused(code => …);                         // "forbidden", "invalid_channel", "unavailable"
room.peers.on("typing", (_, from) => showTyping(from));  // another member's message
room.peers.send("typing");
room.presence.track({ active: true });
room.presence.on(list => showOnline(list));
live.focus("room:42");                             // the conversation on screen (null: none)
live.on("direct", (event, payload) => …);           // realtime.send
live.on("status", connected => showOffline(!connected)); // false only after 3 s away
live.on("closed", reason => reason === "access_removed" ? showAccessRemoved() : location.reload());
```

On the server:

```ts
import * as realtime from "@argentic/chest-sdk/realtime";

await realtime.publish("inbox:" + memberId, "rooms.changed", { id: 42 });
const { online, watching } = await realtime.online(roomMemberIds, { channel: "room:42" });  // notify those not watching
await realtime.send([memberId], "unread", { room: 42, count: 3 });
const { members } = await realtime.presence("everyone");
```

| Function | Does |
|---|---|
| `publish(channel, event, payload?)` | To every page joined to a channel the tool declares: `{seq}`, its number. Kept 2 minutes for pages that reconnect |
| `send(memberIds, event, payload?)` | To every page of these members, outside any channel: `{reached}`, those who had one |
| `online(memberIds, {channel?})` | `{online, watching}`: those with a page of the tool open now, and those of them watching `channel` — a page focused on it (`live.focus`) and in the foreground; `[]` without a channel. A chat notifies the members online but not watching the conversation, and every member not online (`notify`): those watching see the message already |
| `presence(channel)` | `{members: [{id, state}]}` |

In the page, a channel gives:

| Method | Does |
|---|---|
| `on(event, (payload, {pos?, partial?}) => …)` | The Chest's events only: a feed's row (`<table>.insert`…, its position in the change log; `partial` when too long to be carried whole: its first column only) or what the tool publishes |
| `onJoined(({replayed}) => …)`, `onResync`, `onKicked`, `onRefused(code => …)` | The channel's life: joined (again), what was missed not all kept, the member taken out, the join refused — never an event name: a tool event named `joined` or `resync` is heard by `on` |
| `peers.on(event, (payload, from) => …)`, `peers.send(event, payload?)` | The other members' messages, on a channel whose rule says `send`: 1 to 64 of `a-z 0-9 _ -`, no dot (`peerEventPattern`; another name throws a `TypeError` `invalid_event`), 4 KiB of JSON |
| `presence.track(state)`, `presence.list()`, `presence.on(list => …)` | Who is present, the member's own state kept across reconnects |
| `leave()` | Leaves the channel |

`live.focus(name | null)` says which joined channel the member has on screen;
the Chest keeps it for the tool alone (`watching`), never shows it to other
members, and forgets it when the channel is left; the client sends none
while the page is hidden and sends it again when it is shown and after each
reconnect.

- **Nothing missed, however long away.** The database is the truth; an
  event says something changed. A page that reconnects (a phone back from
  sleep, a network that returns, a laptop opened the next morning) is given
  what it missed: the feeds' rows from the Chest's change log of the tool
  (7 days), each once and in commit order, the tool's events from its memory
  (2 minutes) — or told `resync` beyond: fetch from the tool what came after
  the last id. No reload, no polling.
- **Joined, then fetch.** Fetch a channel's data on `joined` — but when its
  payload says `replayed` (what was missed came again, the tool may stay
  asleep): an event after it is never missed. Deduplicate by id: the
  author's own row comes back too.
- **Reconnection is unseen.** The client reconnects by itself — at once when
  the page comes back to the foreground, from the browser's cache or to the
  network, never while offline (going offline drops the connection at
  once), after a quiet wait when the Chest is full —
  and says `status` false only when it stays away 3 seconds: a server
  restart or a network switch shows nothing. A join the Chest's memory
  cannot hold now is tried again with the same backoff, unseen; a page
  joins as many channels as it needs.
  A reconnect preflight is aborted after 10 seconds and a socket without
  the Chest's greeting is replaced after 15 seconds. Going offline or
  closing cancels the pending preflight; late replies and messages from
  replaced connections cannot change the current connection.
- **Never trust content as HTML.** Render payloads and rows as text.
- **Revocation is the Chest's.** A member whose access is taken back is
  closed `access_removed` at once; `closed` says it. `signed_out`: the
  member signed out (an open page renews their session every 5 minutes, so
  it never ends under them): reload the page.
- **Bounds are the server's.** Payloads 64 KiB (`TooLarge`), ephemeral sends
  4 KiB and 20 a second per page, presence 1 KiB; `RateLimited` when pages
  fall behind: wait a second. A page that falls too far behind is closed and
  comes back with backfill.
- **Drafts work the same.** In Perseus Code's preview, the pages connect on
  the draft's host as the fake member viewed as; feeds come from the
  preview database.

## `testing` — a tool's own tests

`@argentic/chest-sdk/testing` is for tests, never imported by production code.

```ts
import { fakeChest, signAssertion, withMember } from "@argentic/chest-sdk/testing";

const camille = { id: "mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya", firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "editor", isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "Europe/Paris" };
const chest = await fakeChest({ members: [camille], capabilities: ["members", "files", "notifications", "ai"], ai: { reply: () => "Summary." },
  emits: { "task.done": { description: "A task is done", data: { task: "id", doneBy: "member" } } } });
const response = await handler(withMember(new Request("http://tool.test/chest/tasks"), camille));
assert.equal(await chest.deliver({ type: "member.erased", data: { id: camille.id, erasure: "era_k2qhx4mzc7v3b6nfp5r2t7w4ya", deadline: "2026-10-28T10:00:00Z" } }, request => handler(request)), 204);
assert.equal(await chest.deliver({ type: "quote.accepted", source: "quotes", subject: "q-1", audience: [camille.id], data: { quote: "q-1", total: 1250 } }, request => handler(request)), 204);
assert.deepEqual(chest.emitted.map(e => [e.type, e.cause]), [["task.done", undefined]]);
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
| `fakeChest({members?, former?, groups?, capabilities?, roles?, receives?, emits?, files?, folders?, ai?, realtime?, chest?})` | An HTTP server on `127.0.0.1` that sets `CHEST_API`, `CHEST_TOKEN`, `CHEST_TOOL` (`tool` unless set), the Chest's `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`, `CHEST_TEAM_URL`, `CHEST_PUBLIC_URL` (`chest: {organization, timeZone, language, teamUrl, publicUrl}`: `"Test organization"`, `"UTC"`, `"en"`, `https://<tool>-chest.chest.test`, `https://<tool>.chest.test` by default; `publicUrl: null` for a tool without a public part) and answers members, groups, files, badges, notifications, AI, erasure acknowledgments and emits with a Chest's bounds and errors — a tool's files have no quota: set `chest.full = true` to have every write of a file refused as on a full server (`StorageFull`) —; a capability left out answers 403 (`members`, `files`, `notifications` and `ai` by default; `members.email` adds the addresses; `members.groups` shows the groups given `grants: false` — groups that do not give the tool —, in `groups.list()` (paged, each with its `size` among those who have the tool) and in each member's `groups`; a member whose `groups` is `null` is signed with the groups overage; `receives` is `["member.*"]` by default, `[]` refuses acknowledgments; `emits` is what the tool's `chest.json` declares, `{type: {description, data: {field: kind}}}`, refused as the Chest refuses the manifest — none by default, which answers an emit `CapabilityNotGranted`). `former: [{id, name?, status?}]` are those the tool had who no longer have it: `lookup` answers them `no_access`, `former` (by default) or `erased`. With `sealed`, it seals and opens values with a Chest's format and rules — the roles a value is sealed for among `roles` (any of the grammar without), its context, the member's role, a member it keeps — under a key of its own, and `withMember` carries the member's ticket while it runs |
| Links and uploads | The fake serves the team host's part of the files on its own origin (`chest.api`): a link from `files.url` opens the content it was signed for (the image itself for a thumbnail — a fake does not reduce it; `no_thumbnail` for a file that is not a JPEG, PNG, GIF or WebP image), until it expires or the file changes; an address from `files.uploadUrl` takes one `PUT`, within its life, of the types and size it names and whose first bytes are those of its type (403 `invalid_token`, 415 `type_refused`, 400 `type_mismatch`, 413 `too_large`, as the Chest's), named by the Chest in a folder (20 hex characters and the type's ending), and answers `201 {name, type, size}`. A visitor's upload (`public: true`, 409 `no_public_part` with `chest.publicUrl: null`) is a path the test sends to the fake's origin (`fetch(new URL(up.url, chest.api), …)`), of the type its content is among those granted (415 `type_refused` otherwise; an office document told by the names of its parts). It checks no session and paces no visitor: a test's `fetch` is the browser |
| `folders: {level?, given?}` | The folders of Files the fake Chest gives the tool, with the capability `folders` in `capabilities`: `level`, what its version asks (`"edit"` by default; `"view"` answers every write `CapabilityNotGranted`); `given`, the folders the owner gave it, each `{id?, name, level?, members?, files?, folders?}` — its identifier (32 hex characters, a new one by default), the tool's grant (on a folder given, the version's level by default, never above it), the members who see it and at which level (`{[memberId]: "view" \| "edit"}`, inherited by the folders inside, which may give more), its documents by name (`Uint8Array` or text; their type is what their content is) and the folders inside it. It answers as the Chest does: on a member's request (`withMember` carries their ticket) the lower of the tool's and the member's level, nothing the member does not see (`not_found`); for nobody, the tool's grants; a ticket of no member 401, of one no longer in `chest.members` 403 `access_removed`; a folder it may only view `forbidden`. Links and upload links are served on its own origin (`/d/…`, `/u/…`, an upload taken once), each checked again for the member it was signed for |
| `chest.folders` | `given`, the folders as given, with their identifiers; `documents`, every document by identifier, `{id, folder, name, type, data, added, updated, removed, versions}` (a document put again under its name, letter case aside, is a new version of it; one removed is in Recently removed); `opens`, the tool's opens of documents, `{document, member}` in order (`member` null for nobody), as the Chest journals them |
| `chest.deliver(event, to)` | Delivers an event signed as the Chest signs it, to `to` — the tool's address (`POST <to>/chest-events`) or a function of a Web `Request` — and says the status it answered. An event of the Chest — of a member, of a folder — is `{type, data, id?, occurredAt?}`; a tool event, told apart by its `source` (the publisher's name), `{type, source, data, audience?, subject?, id?, occurredAt?}` (`audience` `"all"` by default, or the members of this tool who may see it). A new id and now by default: name an id to deliver the same event twice. The envelope is signed as given, so one the Chest never sends makes `handle` refuse it. A `member.erased` makes its erasure one the tool may acknowledge |
| `chest.emitted` | The events the tool emitted, `{id, type, data, subject?, key?, occurredAt, audience?, cause?}` in order, each checked as the Chest checks it: a type of `emits` (`invalid_type`), its declared fields of their kinds, members the tool has or had (`invalid_data`, 16 KiB at most: `too_large`), an audience of its members, former members, groups and any role (`invalid_audience`), `subject`, `key`, `occurredAt`, `cause` (`invalid_event`); a key used again answers its first event for the same content (kept once), `key_reused` for other content. `cause` is the event whose handler emitted it. Each answers `receivers: 0` |
| `ai: {models?, reply?, cap?, unavailable?}` | The fake Chest's AI, deterministic and without any provider. `models`: the aliases the tool declared, `{alias, model, provider?, input?, output?}` (all four by default, `fake-default`…`fake-embedding`, provider `openrouter`, 1 and 2 USD per million tokens); another alias answers `model_not_allowed`. `reply(request)`: what a chat answers, given the wire request — a string, or `{text?, toolCalls?: {name, arguments, id?}[]}` (by default the last user message, echoed); streamed, it comes word by word, each tool call's arguments in two pieces, then the finish reason and the usage. Embeddings are unit vectors from a hash of each text (8 dimensions unless `dimensions`). Tokens count one per 4 characters; once the spending reaches `cap` (euros, 5 by default; 0 refuses at once) a call answers `cap_reached`. `unavailable` (`no_connector`, `provider_key_invalid`, `provider_unavailable`) makes chat and embeddings answer it. 60 requests a minute |
| `chest.run(name, to, {id?, scheduledAt?, attempt?})` | Delivers a run of the schedule `name` (a new id, now and attempt 1 by default; name an id to deliver the same run twice) signed as the Chest signs it, to `to` — the tool's address (`POST <to>/chest-schedules`) or a function of a Web `Request` — and says the status it answered |
| `chest.act(name, input, member, to)` | Calls the action `name` with `input` in the name of `member`, signed as the Chest signs it, to `to` — the tool's address (`POST <to>/chest-actions/<name>`) or a function of a Web `Request` — and says the status and the body (JSON) it answered |
| `chest.ai` | The tool's calls to AI, `{path, body}` in order (`body` null for a `GET`) |
| `chest.acknowledged` | The erasures the tool acknowledged, each once |
| `chest.opens` | The tool's opens of sealed values, `{member, opened, refused}` in order, as the Chest journals them |
| `chest.members`, `chest.groups`, `chest.files` | What the fake Chest holds, to change or assert on; its `members` are those who have the tool |
| `chest.notifications`, `chest.badges` | What the tool sent: the items kept, `{member, title, body?, path, key?}` in the member's language (their translation, the tool's own words otherwise) cleaned as the Chest cleans them — one for each member a broadcast reached —, in the order sent (a replaced item removed, the new one last; `withdraw` removes; beyond the pace, a member's notices folded into one item with `grouped`, the latest's text, last), and each member's badge (`Map` member → count; 0 removes it) |
| `realtime: {channels?, feeds?, membership?}` | The fake Chest's realtime, under the `realtime` key of the tool's `chest.json` (`channels`, `feeds`) and `membership(table, key, member)`, who is in a membership table (nobody by default); capability `realtime` in `capabilities`. Its API answers `publish`, `send`, `online`, `presence` with the Chest's errors; a page of a member connects with `connect({ url: chest.realtime.url(memberId) })`, the Chest's protocol and rules (a presence leaves at once) |
| `chest.realtime` | `published` and `sent`, what the tool published and sent in order; `url(memberId)`; `commit(table, op, row)`, a row committed, whole as the database holds it, as the Chest's triggers tell it — for each feed of the table in the order declared, the next position of the change log, published to the feed's channel filled from the row's column it names (which need not be carried) with the feed's columns only; the positions given, none for a feed whose column is null or absent —; `removed(table, key, member)`, a membership row that went; `drop(memberId, code?, reason?)`, that member's pages cut as a network would, or closed with a code (1001, 1013, 1008 `session_ended`): they reconnect and are given what they missed; `revoke(memberId)`, closed as access removed; `signOut(memberId)`, their session ended: the next renewal answers 401; `full(seconds)`, no room for that long (503 with `Retry-After`), `full(seconds, "joins")`, joins answered `full` for that long; `advance(ms)`, the Chest's clock moved: its memory (2 minutes) and change log (7 days) age — a page's own timers are the test's (`mock.timers`); `renewals`, how many times pages renewed their session or asked before reconnecting |
| `chest.close()` | Stops it and restores the environment |

## Version

The package version is `version` in `package.json` (semver), published by a
tag `vX.Y.Z` (see `PUBLISHING.md`). Its MAJOR.MINOR is the version of the
tool contract it is written for (`"chest"` in `chest.json`): 0.7.x for the
contract 0.7. A new contract version is a new MINOR of the SDK.

## What this repository is not

This repository is public and **is not a tool**: it has no `chest.json`, and a
Chest's catalogue — which only lists the organisation's public repositories
that carry a manifest — never offers it.

Nor is it a client for external agents: an assistant or a script works on a
Chest through the Chest's own HTTP API (`/api/v1`, described by
`GET /api/v1/openapi.json`) with a member's personal access token — the
supported way, which this package does not wrap.

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
`notifications`, `events`, `ai`, `testing`) and those they share (`api`, the Chest's API; `signed`, its signed deliveries; `eventrules`, the rules of events between tools) —
TypeScript strict, ES2022, NodeNext — into `dist/`: ESM `.js`, `.d.ts` and
their maps. `member.ts` imports nothing but `node:*`, so that a tool may copy
it alone.
The package stays dependency-free (`node:*` only) and reaches nothing but the
Chest's API on `127.0.0.1`. `AGENTS.md` is a usage guide for AI agents
building a tool with this package.

## Licence

MIT (`LICENSE`), © 2026 Argentic.

# Studio proposals (not in 0.7.0)

Everything above is the README of `@argentic/chest-sdk` **0.7.0** as
Chest-SDK PR #38 holds it at `1a825a6` (24 November 2026; not merged, not
on npm), word for word. This package is **0.7.0-studio.1**: that release,
unchanged, plus the studio's proposals — what the store's tools need that
0.7.0 does not give. Each is designed as it would ship: a module or an
export, its route on the Chest's API, a fake in `testing`, its tests. On a
real Chest these routes do not exist: a call throws `CapabilityNotGranted`
or `Unavailable` (or, for `chest.theme()`, answers the tool's own look),
and the tool stays useful without them. Nothing here is published.

Studio versions: **0.7.0-studio.1** (24 November 2026) — the studio's
working copy rebased from 0.4.1 onto 0.7.0. What 0.5, 0.6 and 0.7 gave, the
studio dropped (below); the owner's decision that **neither currency nor
time zone is the Chest's to set** is applied (`chest.currency` gone; the
company's zone is captured once and set on no screen, a member's is their
browser's). Before it, **0.4.1-studio.1 to .7** (October 2026), on 0.4.1:
see the history of this file.

## How the proposals sit on 0.7.0

- **0.7.0 is taken verbatim, file for file.** `client/index.ts`,
  `client/src/*`, `client/test/*`, `contract/`, `check/`,
  `scripts/check-package.mjs`, `scripts/contract.mjs`, `tsconfig.json`,
  `tsconfig.build.json`, `LICENSE`, `PUBLISHING.md` and this README's part
  above and `AGENTS.md`'s are `1a825a6`'s bytes (`diff -r` against the
  commit shows only the studio's own files). `npm test` runs 0.7.0's tests
  unchanged beside the studio's (`client/studio/test/`), and `check/`'s.
- **The proposals live in files of their own**, under `client/studio/`.
  Where a proposal adds to an official module, the studio's module
  re-exports the official one and adds its names: `member` (`locales`,
  `localeOf`), `chest` (`chest.tools`, `chest.theme()`, `chest.todayIn()`),
  `members` (`matchEmails`, `leftAt`), `files` (`publicPath`), `testing`.
  **Every official name is the official value** (a test checks it) except
  `chest` — a new object whose `organization`, `timeZone`, `language`,
  `tool` and `today` are getters of 0.7.0's own, read at every access — and
  `testing`'s `fakeChest`, `signAssertion` and `withMember` (0.7.0's are
  called inside). The studio's own modules — `mail`, `calendar`,
  `webhooks`, `visitors`, `checks` — are subpaths of their own; internal
  rules the Chest would own — `webhooks-rules.ts`, `calendar-rules.ts`,
  `checks-rules.ts` — are shipped but not subpaths. `sealed`, `folders`,
  `notifications`, `events`, `schedules`, `actions`, `ai`, `realtime`,
  `realtime/client`, `database` and `errors` point to 0.7.0's modules as
  they are. The root (`client/studio/index.ts`) is 0.7.0's root with the
  studio's modules in place.
- **The fake Chest is 0.7.0's, with the studio's in front.** `fakeChest`
  starts 0.7.0's fake and a second server, the studio's, which answers the
  proposals' routes and passes everything else to 0.7.0's fake as it came
  — a page's realtime connection (an HTTP upgrade) included (see
  "`testing`" below).
- **Manifest keys of the proposals stay out of `chest.json`**: a 0.7 Chest
  refuses a key it does not know (contract, "Versions"). They live in each
  tool's **`chest.proposals.json`** — `mail` (`{"send": true}` only),
  `calendar` (`true`), `files` (`{"publicFiles": true}`), `checks`
  (`{"max"}`), `webhooks` (`{"max"}`), `translations` (the store's words in
  French) — which the studio's `scripts/check-manifest.mjs` validates;
  `chest.json` is judged by 0.7.0's `chest check` alone (the studio runs it
  with `scripts/chest-check.mjs`, from `check/`). The capabilities
  `mail` and `calendar` are named only to the studio's fake
  (`fakeChest({capabilities})`), never in `chest.json`.
- **Signed deliveries use 0.7.0's one mechanism** (`src/signed.ts`): the
  studio's channels (`Chest-Check`, `Chest-Webhooks`) are `Channel`s of
  their own (`client/studio/signed.ts`) verified with 0.7.0's `delivery()`,
  and their `handle` takes a `seen` store as 0.7.0's events and schedules
  do (`memorySeen` by default).

### What 0.7.0 now gives, the studio dropped (0.4.1-studio.7 → 0.7.0-studio.1)

| The studio had | 0.7.0 gives (README above) |
|---|---|
| Its own `member()` and `members.list`/`get`/`lookup`/`groups.list` reading a member in any number of groups; `maxAssertionLength` | 0.7.0's: no count of groups; a member in more groups than an assertion carries (about 150) comes with `groups: null` (the overage): `members.get(id)` reads them |
| `chest.proposals.json` `"capabilities": ["members.groups"]`; `members.groups.all()` → every group at once | `"members.groups"` in `chest.json` `capabilities` (with `members`); `members.groups.list({after, limit})` → `{groups: [{id, name, size}], next}`, paged; `members.list({group})` |
| `group.changed`, `group.removed` events (`"receives": ["group.*"]`) | None: joining or leaving a group the tool sees is `member.updated` naming `groups`; a renamed group is read when rendering |
| `notifications.notify` with `translations`; `broadcast(notice, {to, except})` → `{delivered}` | 0.7.0's `notify` and `broadcast` with `translations` (any language tag), `broadcast` answers nothing; no quota — a pace that folds bursts; `FakeNotification` is kept in the member's language (the studio's `translations` on it and `shownTo()` went) |
| `events.publish(type, data, {key, occurredAt})`, `events.receivers(type)`, `handle(…, {tools})`, `toolEventPattern`, `occurredAtOf`, `occurredLimits`; `chest.proposals.json` `"emits": [names]`, `"receives": [types]` | `events.emit(type, data, {subject, key, occurredAt, audience})` → `{id, receivers}`; the same `handle` for every event; `"emits": {type: {description, data: {field: kind}}}` and `"receives": [...]` in `chest.json`; types two to four dotted words of `a-z 0-9 -` (**no underscore**); 72 hours; `audience` honoured by the receiver; no list of receivers |
| `files.publicUploadUrl`, `files.claim`, `publicLimits`, `"files": {"publicUploads": true}`, the fake's `publicApi` and `storage.publicUploads` | `files.uploadUrl("folder/", {public: true, types, maxSize})` from a public route of a tool with `"public": true`: a path, the Chest names the file, the tool `stat`s the name the form hands back. No `expiresUnclaimedAfter`: a tool deletes what no form recorded itself |
| `chest.currency` (0.4.1's, through the studio's chest), `fakeChest({chest: {currency}})`, `CHEST_CURRENCY` | **Nothing**: 0.7.0 has no Chest currency. An amount keeps its ISO 4217 code beside it in the tool's data; a tool that needs a default keeps its own setting |
| `fakeChest({emits: [...], receivers, linked})`, `chest.published`, `chest.linked`, the studio's `chest.deliver`, `chest.emit` | 0.7.0's `fakeChest({emits: {...}, receives})`, `chest.emitted`, `chest.deliver(event, to)` (a tool event with `source`, `audience`, `subject`) |
| `fakeChest({broadcast: false})` | Gone: every 0.7 Chest has broadcast |

Also new in 0.7.0 and used as they are: `sealed`, `folders` (and their
events), `actions`, `realtime` and `realtime/client`, `StorageFull`,
`MemberRequired`, `NotAllowed`, `Sealed*` errors, `files.maxObject` without
a quota, the store's presentation (`description_file`, `previews`), the
readiness rule and expand/contract migrations, embedding of public parts.

## `network` — testing a tool that declares hosts

0.7 declares the hosts a tool reaches in `chest.json` (`"network":
["graph.microsoft.com", "*.icloud.com"]`, or `"*"`) and gives the tool the
Chest's egress proxy (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`,
`NODE_USE_ENV_PROXY=1`, Node 24.5 or later): the tool calls them with
**plain `fetch()`**, refused hosts answer as the proxy refuses
(`Chest-Egress: refused; reason=…`). 0.7.0's fake has nothing for it; the
studio's plays it: `fakeChest({ network: { "graph.microsoft.com": request
=> … } })` answers the declared hosts and refuses the rest as the proxy
does, without a proxy and without Node 24.5 (see "`testing`").

## `member` — the studio's additions

`member(request)` is 0.7.0's, claim for claim, and every name of the module
is 0.7.0's value. The studio adds **`locales`, `Locale`, `localeOf(tag)`**
— the languages the store's tools speak today (`["en", "fr"]`, English
first) and the narrowing of a language to them: `localeOf(who.language)` is
`"fr"` for `fr`, `fr-CA`, `FR`, and `"en"` for a language the tool does not
speak yet (`de`), exactly the "uses its own default" 0.7.0 asks. The
studio's modules that take words in several languages
(`calendar`, `visitors.language`) are typed on
them.

## `members` — the studio's additions

### `members.leftAt` — when former members left (Proposal (0.3.0-studio.15))

```ts
const { former } = await members.lookup(ids);
const left = await members.leftAt(former.map(f => f.id)); // Map: "mbr_…" → "2026-09-30T16:00:00.000Z"
```

0.7.0's lookup says who left (`former`, with the name they had, or
`erased`) but not when; a final pay, a last day on a receipt, "Camille
Martin (left on 30 Sept.)" need the date. `leftAt(ids)` answers, for each
identifier lookup reads former or erased whose departure the Chest knows,
an ISO 8601 instant — kept after an erasure: a date alone names nobody;
nothing for a member who has the tool, one without access (still in the
Chest) or an identifier the tool does not know. Any number: 200 a call
(`POST /members/left`). It belongs in lookup's former entries (`left_at`):
a call of its own only because the studio does not change 0.7.0's lookup.
In tests: `fakeChest({former: [{id, name, status, leftAt}]})`.

### `members.matchEmails` — who these addresses are (Proposal (0.3.0-studio.15))

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

## `mail` — email to people outside the company (Proposal (studio))

The owner's decisions of 6 October 2026:

- **Mail to members is never a tool's job**: they are told with
  notifications (above). `send` refuses a member — `{member: "mbr_…"}` or
  an `mbr_…` — with `ChestError` `invalid_recipient`.
- **The Chest never receives mail**: no mailboxes, no inbound message, no
  reply thread, no `POST /chest-mail`. A tool that wants replies from the
  public lets them go to the company's own address (Reply-To): they land in
  the company's usual mailbox, not in the tool. A page and a mail say
  plainly where replies go ("Reply to this email or write on your request
  page").
- **Mail to the public stays** where a public flow needs it — a booking's
  recap with its calendar file, a quote or invoice sent, a form's receipt,
  a candidate's confirmation, a support answer, a status update to a
  subscriber — through this one seam, `send`, which the Chest backs with a
  **connector to the company's own mail provider** (its SMTP or API,
  connected once by the owner, its domain; not sent by Argentic). **Not
  built yet**: a studio proposal.

```jsonc
// chest.proposals.json — approved as:
//   “Sends emails to people outside your company (customers, candidates,
//    visitors) through your company's mail provider”
{ "mail": { "send": true } }
```

```ts
import * as mail from "@argentic/chest-sdk/mail";
const can = await mail.available();     // {ok, reason, remainingToday, replyTo}
await mail.send({
  to: "client@example.com", subject: "Your booking on 3 November", text,
  attachments: [{ name: "booking.ics", type: "text/calendar", content: ics }],
  key: `booking:${id}:recap:${address}`,
});
```

| Export | Gives |
|---|---|
| `send({to, cc?, subject, text, html?, fromName?, replyTo?, attachments?, key?})` | Queues one message to 1–50 outside addresses (`to`/`cc`: strings). `replyTo` overrides the company's reply address (a tool's own setting); left out, the Chest sets the reply address the owner gave with the connector (or none: replies go to the sending address). `attachments`: a file of the tool's (`{file, name?}`) or bytes (`{name, type, content}`: the `.ics`, the PDF). `key`: the same key within 24 h sends nothing again. Answers `{id: "msg_…", messageId, status: "queued"}` |
| `status(id)` | `queued`, `sent`, `delivered`, `bounced`, `complained`, `failed` — how a tool learns of a bounce (nothing is posted to it); null for an id the Chest does not know |
| `available()` | Whether the Chest would send now, asked without sending: `{ok, reason, remainingToday, replyTo}` — `reason` `"not_granted"` (not declared or approved, a Chest without mail, outside a Chest), `"not_connected"` (the owner has not connected the company's mail provider), `"suspended"` (the Chest stopped sending for now), `"quota"` (the day's messages are used), or null; `replyTo` the company's reply address, or null. Never throws for a missing capability; `Unavailable` when the Chest does not answer (say "unknown", not "off") |
| `idempotencyKey(key)` | The key the Chest receives for a key the tool gives: as given when it is 1–64 of `A-Z a-z 0-9 . _ : -`, otherwise `sha256:` and its digest; null for what is not a key |
| `isAddress(text)`, `limits`, `messageIdPattern` | A plain address the Chest would send to; `{recipients: 50, size: 10 MiB, subject: 998, perDay: 500}`; `msg_…` |

Refusals: `ChestError` `invalid_recipient` (a member: notify them),
`invalid_address`, `invalid_message` (before anything is sent: recipients
1–50; a subject, `fromName` and an attachment's name and type without a
line break or a control character but the tab — no header injection; an
attachment `{file, name?}` of a file the tool has, or `{name, type,
content}`; an unknown field — `mailbox`,
`thread`, `inReplyTo`, `references`, `transactional` are gone), `suppressed`
(every recipient bounced or complained before), `key_conflict` (409),
`TooLarge` (10 MiB), `QuotaExceeded` (500 a day unless the owner raises
it), `Unavailable` (the connector is not connected, sending is suspended,
or the Chest did not answer), `CapabilityNotGranted` (not declared, or a
Chest without mail). **When `available()` is not ok, or `send` throws, the
flow still works and says so** — no silent loss: "We could not email your
confirmation — it is on this page". The Chest journals every message (to,
subject, size, status; never the body by default).

**Keys.** A `key` is the tool's name for one message, and a retry under it
sends nothing twice. Build it from what names the message and **never cut
it**: any text of 1 to 512 characters without control characters is taken
whole, and the SDK sends one longer than the Chest keeps (64 of `A-Z a-z
0-9 . _ : -`) as its SHA-256 (`idempotencyKey`). The Chest refuses a key
reused within 24 hours **for other recipients** (`key_conflict`, nothing
sent); a retry with the same recipients answers the first message. **Put
the recipient's address in every key built from database ids** —
`` `update:${updateId}:${address}` ``: after a restore from a backup a
sequence starts again, and `subscriber:42` can name another person than
the one the Chest remembers. The same holds for `webhooks.send` (and for 0.7.0's `events.emit`, whose
`key` is 1 to 128 of `A-Z a-z 0-9 . _ : -` and is refused, never hashed,
beyond).

**What each tool must write down** (README section "Mail to people outside
the company"): recipient, purpose, when, content, attachments, Reply-To —
and the line "sent through the Chest's mail connector (studio proposal,
not built yet)". The SDK report gathers them.

**Gone in studio.5** (grep a tool for them): `{ member: … }` recipients
and member addresses looked up to mail them, `transactional`,
`mail.preference` / `MailPreference`, `mail.handle`, `mail.verify`,
`Received`, `Bounce`, `MailHandlers`, `POST /chest-mail`, `mailbox`,
`mailboxAddress`, `thread`, `threadAddress`, `threadTag`, `threadOf`,
`inReplyTo`, `references`, `Sent.skipped`/`digest`, `status` `"held"`,
the manifest's `mail.mailboxes`; in tests `chest.receive`, `chest.held`,
`FakeIncoming`, `FakeHeldMail`, `FakeMember.mailPreference`,
`mail: {mailboxes}`, and `chest.bounce(id, to, …)` (now `chest.bounce(id,
{permanent?, complained?, recipient?})`, which posts nothing).

In tests: `fakeChest({ capabilities: [..., "mail"], mail: { connected?,
replyTo?, domain?, perDay?, suppressed? } })` — `connected: false` is the
connector absent (`available()` says `not_connected`, `send` throws
`Unavailable`; `chest.delivery.mail = "ready"` connects it); `replyTo` the
company's reply address (`contact@<domain>` by default, `null` for none);
messages go from `no-reply@<domain>` (`company.test`). `chest.outbox` holds
what was sent (`replyTo`: the Reply-To it went with); `chest.bounce(id,
{permanent?, complained?})` plays a bounce or a complaint (`status` says
so; a permanent one or a complaint suppresses the address);
`chest.delivery.mail = "ready" | "not_connected" | "suspended"`.

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
const results = await calendar.putMany(openTasks.map(eventOf));           // Proposal (0.3.0-studio.15): 100 a call; one result per event, in order (0.3.0-studio.16)
await calendar.remove("booking:981");                                     // gone from every feed; true if it was there
const { events, next } = await calendar.list();                           // what the tool put, to reconcile
// A link to the member's page: <a href="/_chest/calendar">See it in your calendar</a> (the Chest's front serves it on the team host)
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

**`putMany(events)` (Proposal (0.3.0-studio.15); per event since 0.3.0-studio.16).**
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

**No all-or-nothing option.** Until 0.3.0-studio.16 one wrong event refused the
whole batch, and the three tools that use `putMany` (Rooms, Clients,
Tasks) each caught the refusal and put the batch again one event at a
time — up to 100 writes for one bad date. None wanted all-or-nothing. **Upgrading from 0.3.0-studio.15**: `putMany` no longer throws for a
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

**The feed** (the Chest writes it — the fake with the same writer,
`client/studio/calendar-rules.ts`, which `calendar.ics` shares):
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

## `chest` — the studio's members (Proposal (studio))

```ts
import { chest } from "@argentic/chest-sdk/chest";
chest.tools.get("forms");            // another tool's addresses, chest.tool's shape (below)
chest.tools.link("forms", "/chest/forms/5/answers/k3ab");
chest.todayIn(who.timeZone);         // "2026-09-29": the date in a member's zone (the Chest's for a zone this runtime does not know)
await chest.theme();                 // the look the company chose (below)
```

The same object as 0.7.0's — `organization`, `timeZone`, `language`,
`tool`, `today()` are getters of 0.7.0's own, read at each access,
throwing `not_in_chest` outside a Chest as 0.7.0's do; no `currency`, as
0.7.0 has none — with the
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
(Clients and Support to the answer in Forms, Timesheets to Quotes). 0.7.0
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
  one) — `chest.tool`'s shape and meaning. Origins as 0.7.0 reads
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
tries every public tool meets one limit. For a tool with a public part;
`count` asks the Chest (`POST /visitors/count`), the rest is local. In
tests: `fakeChest({visitors: {perAddressHour}})`, and a request with the
header `Chest-Visitor-Address` plays the front.

**The visitor's address is the front's, never `X-Forwarded-For`.** The
Chest's front adds no `X-Forwarded-For` toward a tool: it removes every
`Chest-*` header the client sent and sets only `X-Forwarded-Proto` and
`X-Forwarded-Host` (`reference/contract/application-contract.md`,
"Front", toward the tool). An `X-Forwarded-For` a tool receives is the
visitor's own words: a robot writes a new one at every request and is a
new visitor each time. The proposal: the front sets
**`Chest-Visitor-Address`** — the address of the connection it accepted —
on the public host's requests; as a `Chest-*` header, no client can send
it. `visitors.address()` reads it and nothing else; without it (a Chest
that does not set it yet) it is null, `visitor()` is `"unknown"`, and
`count()` applies to such a visitor only the ceiling per hour for
everyone (`perHour`), never `perVisitor` nor the Chest's ceiling per
address: counting every unknown visitor as one would let a few requests
close a public form for everybody (found by the Booking review;
0.4.1-studio.3). A tool that needs a per-visitor limit before the front
gives addresses keeps its own (a token per form, a code by email).

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
(`Chest-Check`: 0.7.0's signed deliveries, as `Chest-Schedule`; `handle`
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
| `send(ids, {event, text, data?, key})` | One delivery per target, queued: `{deliveries: [{id: "whd_…", target}], skipped: [{target, reason: "disabled" \| "not_found"}]}`. The same `key` within 24 hours answers the first deliveries and sends nothing. Any key of 1 to 512 characters, never cut: a longer one than 64 of `A-Z a-z 0-9 . _ : -` goes as its SHA-256 (the journal shows that); the same key for another event is refused (`key_conflict`, nothing sent) — 0.3.0-studio.15 |
| `list()`, `remove(id)`, `enable(id)`, `rotateSecret(id)` | The targets with `state` (`active`, `disabled`), `status` of the last delivery (`delivered`, `failed`, `disabled`, null), `lastError`, `failures` in a row; the address shown without its query (generic) or its secret path (Slack, Teams). `enable` tries a disabled target again (a ping first); `rotateSecret` gives a new secret, the old one still signs for 24 hours |
| `available()` | **Proposal (0.3.0-studio.16).** Whether the Chest would deliver now, asked without sending: `{ok, reason, targets, max}` — `reason` `"not_granted"` (not declared or approved, a Chest without webhooks, outside a Chest) or `"suspended"` (the owner paused the tool's notices: `add` and `send` answer `ChestError` `suspended`, targets are kept), or null; `targets` of `max` addresses ("3 of 200"; `add` is refused at `max` even when `ok`). Never throws for a missing capability. Support's Settings shows "Send new tickets to Slack" only when `ok`. In tests: `chest.delivery.webhooks = "ready" \| "suspended"` |
| `journal({target?, after?, limit?})` | Deliveries: `status` (`pending`, `retrying`, `delivered`, `failed`), `attempts`, `responseStatus`, `lastError`, `nextAttemptAt` — never the text or data |
| `handle(request, {disabled})`, `verify(request)` | `webhook.disabled` `{id: "whe_…", target, reason: "failures" \| "gone", lastError}` on `POST /chest-webhooks`, signed `Chest-Webhooks` (0.4.1's signed deliveries under the label "Chest-Webhooks v1"), at least once; `handle(request, handlers, {seen})` drops one already handled |
| `checkUrl(url, kind)` | The address rules, for a form to explain a refusal before it happens. The rest of the Chest's rules — the bodies it posts, its signature, its address checks — are the Chest's, in `client/studio/webhooks-rules.ts` (not published: the fake Chest and `scripts/check-manifest.mjs` use it) |

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
// The same check as the fake Chest's tests run (client/studio/webhooks-rules.ts, verifySignature)
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

## `files` — public files (Proposal (studio))

From the decided storage spec (`reference/product/specs/tool-storage.md`),
which 0.7.0 does not give (visitors' uploads, the other half of the spec,
are 0.7.0's `uploadUrl(folder, {public: true})`):

```jsonc
// chest.proposals.json — a permission (with "public": true and the capability files in chest.json):
//   "Publishes the files it puts under public/ on its public address."
{ "files": { "publicFiles": true } }
```

```ts
files.publicPath("public/logo.png", { version: info.updated }); // "/_chest/public/logo.png?v=…", a path of the public host
```

Objects under `public/`, served on the public host (and the company's own
domain) at `/_chest/public/<name>`, to anyone, cached an hour, `?v=` for a
new version: a form's header image, a careers page's logo, a published
PDF. 0.7.0's files are private only (a link from `files.url` lives 15
minutes on the team host, "never to a public page"). In tests:
`fakeChest({ storage: { publicFiles: true } })`.

## `testing` — the studio's fake Chest

`fakeChest` starts **0.7.0's fake Chest** — its members, groups (with
`members.groups` and `grants: false`), files (links, a member's and a
visitor's uploads on its own origin, content sniffed), folders of Files,
badges, notifications (translations, broadcast, the pace), AI, erasures,
emits and deliveries of events between tools, sealed values, realtime,
`run()` and `act()`, with its bounds and errors — and a second server on
127.0.0.1, **the studio's**, which `CHEST_API` points to. The studio's
server answers the proposals' routes itself and passes every other request
to 0.7.0's fake as it came — a page's realtime connection (an HTTP upgrade)
piped both ways —, its answer back as it went; it completes one answer:
lookup answers as "former" the people a test put in `chest.former` after the
start (0.7.0 reads `options.former` once). `chest.api` is the studio's
server, and 0.7.0's links, uploads, documents and realtime addresses are
written for it. The object it returns is 0.7.0's fields, read and written
through (`chest.members`, `chest.notifications`, `chest.emitted`,
`chest.realtime`, `chest.folders`… are 0.7.0's; `chest.deliver`, `run`,
`act` are 0.7.0's), and the studio's:

| Function | Gives |
|---|---|
| `fakeChest({tool})` | The tool's name (`chest.json` `name`) as `CHEST_TOOL` while the fake runs — what `member()` and the signatures read. Without it, the environment's `CHEST_TOOL`, or `"tool"` (0.7.0's rule) |
| members' `language`, `timeZone` | `fakeChest` members, `signAssertion` and `withMember` take a member whose `language` and `timeZone` may be left out (type `FakeMember`): the Chest's (`chest: {language, timeZone}`), as a real Chest gives its default language, and its zone until the member's browser said theirs. The assertion carries exactly 0.7.0's claims; without `members.groups`, the groups that do not give the tool (`grants: false`) are left out of it, as the Chest leaves them out |
| `chest.former` | Those the tool had who no longer have it (`{id, name?, status?, leftAt?}`): lookup answers them as 0.7.0's fake would, `leftAt` answers when. A test that removes a member from `chest.members` moves them here, as a real Chest would, then calls `clearCaches()` |
| `chest.clearCaches()` | Forgets what the process keeps of the Chest's answers — lookup's minute, the theme — after a test changed `chest.members`, `chest.former` or `chest.theme` by hand |
| `chest.upload(url, data, type)` | Plays a browser sending a file to an `uploadUrl` answer (a PUT of `data` of that type; 0.7.0's front sniffs the content); a visitor's path is sent to `chest.api` |
| `fakeChest({tools})`, `chest.tools`, `chest.installTool(name, {teamUrl?, publicUrl?})`, `chest.removeTool(name)` | The tools installed beside this one (`chest.tools.get`), by name: `true` for a team host at `https://<name>-chest.chest.test`, or its addresses. This tool is always there, at `chest: {teamUrl, publicUrl}`. `installTool` and `removeTool` rewrite `CHEST_TOOL_URLS` as the Chest does |
| `fakeChest({theme, themeFiles})`, `chest.theme`, `chest.themeFiles` | The company's look at its two levels (`{all, tools}`), which `chest.theme()` answers resolved for the tool with `max-age=0`; the files its front serves under `/_chest/theme/` |
| `fakeChest({network: {host: handler}})`, `chest.egress` | The hosts the tool declares (`chest.json` `network`: `"graph.microsoft.com"`, `"*.icloud.com"`, `"*"`) and a handler of Web Requests answering each. While the fake runs, the tool's **plain `fetch()`**, unchanged, goes as through the Chest's egress proxy: a declared host to its handler (redirects followed through declared hosts, `AbortSignal` honoured); an undeclared name, an IP literal or a port other than 80/443 refused as the proxy refuses — `fetch` rejects with a `TypeError` for `https:`, answers 403 `Chest-Egress: refused; reason=…` for `http:`; `localhost`, `127.0.0.1` and `::1` straight through. `chest.egress` lists each request `{method, url, status, refused?}`. It replaces `globalThis.fetch` (and gives it back on `close`): Node reads `NODE_USE_ENV_PROXY` only when it starts. `node:http(s).request` is not routed |
| `fakeChest({delivery})`, `chest.delivery` | Whether the Chest delivers: `{mail: "ready" \| "not_connected" \| "suspended", webhooks: "ready" \| "suspended"}`, what `mail.available()` and `webhooks.available()` answer; `send` follows it |
| `fakeChest({mail: {connected?, replyTo?, domain?, perDay?, suppressed?}})`, `chest.outbox`, `chest.bounce(messageId, {permanent?, complained?, recipient?})` | Mail to people outside (with `"mail"` in `capabilities`): `connected: false` is the connector absent (`not_connected`; `send` throws `Unavailable`); `replyTo` the company's reply address (`contact@<domain>` by default, `null` for none); what was sent, with the Reply-To it went with; a sent message bounced or complained of (its `status`; the address suppressed when permanent or a complaint) — nothing is posted to the tool |
| `fakeChest({calendar})`, `chest.calendar`, `chest.feed(member)`, `chest.feedUrl(member)`, `chest.newFeedUrl(member)` | The calendar bridge (with `"calendar"` in `capabilities`): the events put, a member's feed as the Chest writes it, its secret address |
| `fakeChest({checks})`, `chest.checks`, `chest.check(name, to, result?)` | Checks: the list the tool configured, a result delivered to `POST <to>/chest-checks`, signed `Chest-Check` |
| `fakeChest({webhooks})`, `chest.webhooks` | Webhooks: targets, deliveries, events, `respond()`, `retry()` |
| `fakeChest({visitors})`, `fakeChest({storage: {publicFiles}})` | The Chest's ceiling per visitor address; public files on `/_chest/public/` |
| `chest.close()` | Stops both servers, gives `fetch` back, and restores the environment (0.7.0's variables by 0.7.0's `close`, `CHEST_TOOL` and `CHEST_TOOL_URLS` by the studio's) |

`fakeChest` refuses the options the studio dropped with the move to make:
`chest: {currency}` (no Chest currency), `storage: {publicUploads}`
(0.7.0's `uploadUrl(folder, {public: true})`).

## Develop (studio)

As 0.7.0 (above), with the studio's files: `npm test` builds
(`tsconfig.studio.json`: 0.7.0's modules and the studio's), compiles every
test, checks that `contract/README.md` says what `contract.json` says
(`scripts/check-studio-contract.mjs`: 0.7.0's `scripts/contract.mjs
--check`, unchanged, run with the version the studio is built on — 0.7.0's
script also wants `check/package.json` to be the package's own version,
and `check/` is 0.7.0's), runs **0.7.0's tests, unchanged**
(`client/test/`), **the studio's** (`client/studio/test/`) and `check/`'s —
`npm run test:official` and `npm run test:studio` run either. `npm run
check:package` (`scripts/check-studio-package.mjs`) checks the package as
a consumer receives it: every subpath's names (0.7.0's and the studio's),
from plain Node ESM, an esbuild bundle and a Vite SSR build (the Perseus
starter's stack), on a fake Chest, and a TypeScript consumer under
`bundler` and `nodenext`. 0.7.0's own `check:package` also packs `check/`
(`@argentic/chest-check`) as its own package: the studio runs the checker
with `scripts/chest-check.mjs` at the repository's root, built from this
`check/`. The version is `0.7.0-studio.N`, `N` growing with each change of
the proposals. Semver sorts such a pre-release before 0.7.0: nothing
resolves it by range — a tool depends on its tarball by file
(`file:vendor/…`). A tool vendors it with `node scripts/add-sdk.mjs <tool>`
(`vendor/argentic-chest-sdk-0.7.0-studio.N.tgz`), which also writes
`"chest": "0.7"` in its `chest.json`.
