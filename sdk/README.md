# Chest SDK

`@argentic/chest-sdk` is what a server tool (tool contract v2) embeds to talk
with its Chest: the member the Chest asserts on a request, the other members
who have the tool, the address of the tool's own database, its private
files, the badges and notifications it shows members inside the Chest, the
events of its members' lifecycle — and, for the tool's tests, a fake Chest. The SDK has no dependency: it
only imports `node:*`.

```sh
npm install @argentic/chest-sdk
```

Node 22 or later. ESM only, compiled JavaScript with its type declarations.

## Imports

Each module is its own subpath and pulls in nothing else; the root gives them
all, with the files, members, notifications and events APIs as the
namespaces `files`, `members`, `notifications` and `events` (the testing
module is not in the root).

| Import | Gives |
|---|---|
| `@argentic/chest-sdk/member` | `member(request)`, type `Member`: the member of a request on the team host of a server tool, read from the `Chest-Member` assertion and verified; `null` without a valid assertion. `memberIdPattern`, `groupIdPattern`: the grammars of the identifiers (`mbr_…`, `grp_…`) |
| `@argentic/chest-sdk/members` | `list`, `get`, `lookup`, `groups.list`, `forget`, types `MemberPage`, `Lookup`, `FormerMember`, `Group`: the members who have the tool (capability `members`, their addresses with `members.email`); **Proposal (studio)** `groups.all`, `groups.members`, types `ChestGroup`, `GroupMembers`: every group of the Chest (`"groups": "read"`) |
| `@argentic/chest-sdk/notifications` | `notify`, `withdraw`, `broadcast` (Proposal (studio)), `badge.set`, `badge.setMany`, types `Notice`, `Delivery`, `BadgeCount`, `BadgeWrite`: counters on the tool's tile and items in members' inboxes, inside the Chest (capability `notifications`) |
| `@argentic/chest-sdk/events` | `handle`, `verify`, `acknowledgeErasure`, `memorySeen`, `erasureIdPattern`, types `ChestEvent`, `MemberUpdated`, `AccessRevoked`, `MemberRemoved`, `MemberErased`, `MemberChange`, `Handlers`, `Seen`: the events of the members' lifecycle the Chest posts to the tool's `/chest-events` (`"receives": ["member.*"]`), verified, deduplicated by id, and the acknowledgment of an erasure |
| `@argentic/chest-sdk/chest` | **Proposal (studio).** `company`, `timeZone`, `today`, `currency`, `locale`, `teamUrl`, `publicUrl`: the Chest's settings every tool needs; `toolUrl`, `toolLink`, `readToolUrls`, `toolNamePattern`, types `ToolSurface`, `ToolAddresses`: the addresses of the other tools installed on the Chest; `theme`, `readThemeChoice`, `forgetTheme`, `themeIdPattern`, types `ThemeChoice`, `BrandChoice`, `ThemeFont`: the look the company chose for its tools |
| `@argentic/chest-sdk/visitors` | **Proposal (studio).** `formToken`, `checkForm`, `count`, `language`, `visitor`, `address`: the guard and the language of a public host's anonymous visitors |
| `@argentic/chest-sdk/calendar` | **Proposal (studio).** `put`, `remove`, `list`, `page`, and the iCalendar writer `ics`, `escapeText`, `foldLine`, `unfold`, `uidOf`, `feed`, `pick`, `check`, `isDay`, `keyPattern`, `limits`: events about members that the Chest merges into one calendar feed per member (`"calendar": true`) |
| `@argentic/chest-sdk/checks` | **Proposal (studio).** `configure`, `list`, `handle`, `verify`, `checkManifest`, `checkChecks`: web addresses the Chest checks for the tool, and their results |
| `@argentic/chest-sdk/webhooks` | **Proposal (studio).** `add`, `remove`, `list`, `enable`, `rotateSecret`, `send`, `journal`, `handle`, `verify`, and for forms and receivers `checkUrl`, `checkInput`, `checkMessage`, `checkManifest`, `isPublicAddress`, `shownUrl`, `format`, `escapeSlack`, `sign`, `verifySignature`, `limits`: notices the Chest delivers, signed, to addresses the company's admins or the tool's subscribers give (`"webhooks": {"max": N}`) |
| `@argentic/chest-sdk/database` | `databaseUrl()`: the address of the tool's own PostgreSQL database (capability `database`) |
| `@argentic/chest-sdk/files` | `put`, `get`, `stat`, `list`, `move`, `delete`, `url`, `uploadUrl`, types `FileObject`, `FileData`, `FilePage`: the tool's private files (capability `files`), kept by the Chest, a 15-minute signed link to one (or to its thumbnail), and uploads straight from a member's browser |
| `@argentic/chest-sdk/errors` | `ChestError` (`code`, `status`), `CapabilityNotGranted` (403), `TooLarge` (413), `QuotaExceeded` (429), `RateLimited` (429), `Unavailable` (503): what the SDK throws when the Chest does not give what a tool asks |
| `@argentic/chest-sdk/testing` | `signAssertion`, `withMember`, `fakeChest`, types `FakeChest`, `FakeChestOptions`, `FakeGroup`, `FakeFile`, `FakeNotification`, `FakeEvent`: for the tool's own tests only |
| `@argentic/chest-sdk` | all of the above but `testing`; `files`, `members`, `notifications` and `events` as namespaces |

```ts
import { member } from "@argentic/chest-sdk/member";
import { databaseUrl } from "@argentic/chest-sdk/database";
import * as files from "@argentic/chest-sdk/files";
import * as members from "@argentic/chest-sdk/members";
import * as notifications from "@argentic/chest-sdk/notifications";
import * as events from "@argentic/chest-sdk/events";
import { CapabilityNotGranted } from "@argentic/chest-sdk/errors";
// or: import { member, databaseUrl, files, members, notifications, events } from "@argentic/chest-sdk";
```

Types refer to `node:http` (`IncomingMessage`): a TypeScript project needs
`@types/node`, as any Node project does. Both `moduleResolution` `bundler` and
`nodenext` work.

### Next.js

The SDK runs on the server only — it reads the tool's environment
(`CHEST_TOKEN`, `DATABASE_URL`, `CHEST_API`) and uses Node built-ins. Import it
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

A v2 tool is an ordinary web server in a container without network, run by
its Chest. The Chest's front is the only one to reach it; the tool reaches only
what its launcher gives it on `127.0.0.1` (its database, the Chest's API for
its files, its members and its notifications), and the Chest posts it the
events it receives on `/chest-events`, through the same launcher. Rights come
from the Chest — the signed member, the capabilities approved for the
version — and the Chest enforces them even outside the SDK:
the SDK makes the calls easier, it is not a security boundary. The full
contract (manifest `chest.json`, capabilities, build from source, catalogue)
is described in the Chest repository, `docs/architecture.md`.

### `network` — the hosts a tool declares

A tool that must reach a service outside (Microsoft Graph, a public
registry, a calendar's feed) lists its hosts in `chest.json`
(`"network": ["graph.microsoft.com", "*.icloud.com"]`, approved like a
permission) and calls them with **plain `fetch()`** — no SDK call, no proxy
code. The container keeps no network of its own: the launcher gives the
tool `HTTP_PROXY`, `HTTPS_PROXY` (and their lowercase forms) =
`http://127.0.0.1:<port>`, the Chest's egress proxy,
`NO_PROXY=localhost,127.0.0.1,::1` and **`NODE_USE_ENV_PROXY=1`**, with
which Node (**24.5 or later**; the Chest's image is Node 24) makes `fetch`
and `node:http(s)` follow them. So:

- every request but to `localhost`/`127.0.0.1`/`::1` (the Chest's API, the
  database) goes through the proxy, which lets through the declared hosts
  only, on ports 443 and 80, never an IP literal; a `*.` entry declares
  every name below it, not the name itself;
- a refusal is the proxy's: for `https:`, `fetch()` rejects with a
  `TypeError` (the tunnel was refused); for `http:`, it answers `403` with
  `Chest-Egress: refused; reason=undeclared|address|port|ip-literal|limit|dns`
  (429 for `limit`);
- `NODE_USE_ENV_PROXY` is read when Node starts: an HTTP client that
  brings its own dispatcher or agent (undici's `Agent`, `got`, `axios` with
  an agent) ignores it and reaches nothing — use `fetch`;
- on an older Node the variable does nothing and every request fails: the
  image pins a Node that has it.

In a test, `fakeChest({ network: { "graph.microsoft.com": request => … } })`
answers the declared hosts and refuses the rest the same way, without a
proxy and without Node 24.5 (see `testing`).

## `member(request)` — server tool (contract v2)

A v2 tool is an ordinary web server; on its team host, the Chest relays
`/chest` and everything below it with the `Chest-Member` header of the
signed-in member. `member(request)` accepts a Node request (`IncomingMessage`)
or a Web `Request` and returns:

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
  locale: "en" | "fr";   // Proposal (studio): the member's language, English by default
  email?: string;        // only with the capability "members.email"
};
```

or `null`: without the header, on the public host (the Chest never sends an
assertion there and strips a client's), or for any assertion that is not
exactly its own. Checks: compact JWS, header exactly
`{"alg":"HS256","typ":"JWT"}`, HMAC-SHA256 signature compared in constant time
under the key HMAC-SHA256("Chest-Member v2") of the text of `CHEST_TOKEN` —
the Chest's derivation; the label changes with the shape of the claims, so an
assertion of another shape is refused rather than misread —, `aud` equal to
`CHEST_TOOL`, `iat` and `exp` within 5 s, the shape of each claim (`sub` an
`mbr_` identifier, `groups` `grp_` identifiers; an unknown claim is ignored). Without
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

### `locale` — the member's language (Proposal (studio))

The Chest knows the language each member reads it in; it gives it to every
tool in the optional `locale` claim of the assertion (and in the `locale`
field of `members.*` answers), a BCP 47 tag. `member()` and `members.*` read
it as one of the store's languages, `locales` (`["en", "fr"]`, the first the
default): its primary subtag when the store speaks it (`"fr-FR"` → `"fr"`),
English when absent or not spoken (`"de"` → `"en"`); a claim that is not a
string makes the assertion invalid. `localeOf(tag)` applies the same rule.

A tool shows its members' part in `member(request).locale` — never a switch
of its own — and writes the notifications it sends a member in *that*
member's `locale` (`members.lookup`), not the sender's. In tests,
`fakeChest` members and `withMember` take an optional `locale`.

```ts
import { member } from "@argentic/chest-sdk/member";
const who = member(request);
const t = catalogue[who?.locale ?? "en"];
```

No manifest key: every tool receives it. Adding a language to the store is
one entry in `locales`.

### `mailPreference` — how the member wants email (Proposal (studio.15))

Each person chooses once, in the Chest, how every tool may email them:
`"all"`, `"digest"` (one email a day from the Chest gathering the others)
or `"none"`. The Chest carries it in the optional `mail_pref` claim of the
assertion and field of `members.*` answers; `member()` and `members.*` read
it as `mailPreference` — absent when the Chest says nothing (read it as
`"all"`), and a value this SDK does not know is left out rather than
refusing the member (`mailPreferenceOf(value)`).

It is **read-only** for tools: `mail.send` applies it (see `mail`), so a
tool keeps no email switch of its own and never decides for the person; it
reads it only to say so (“You chose one email a day — change it in your
Chest settings”). In tests, `fakeChest` members and `withMember` take an
optional `mailPreference`.

## `members` — who has the tool

A v2 tool that declares `"capabilities": ["members"]` (approved like a
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
const ids = await members.matchEmails(["camille@atelier.fr"]);              // {"camille@atelier.fr": "mbr_…"} (Proposal (studio.15))
```

- **Who**: exactly the members who have the tool now — by a grant, a group,
  open to all, or because they run it (owner, admins, its builders);
  recomputed at every call. A member without access answers as an identifier
  that does not exist (`get` → `null`, `lookup` → `unknown`).
- **`list({after, limit, q, role, group})`**: ordered by name (accents aside)
  then identifier; `limit` 100 by default, 500 at most; `next` is an opaque
  cursor for `after`, `null` after the last page. `q` finds the start of a
  first name, a last name or a name — and of an address with `members.email`
  —, whatever its case and accents; `role` and `group` keep the members of that
  role or group.
- **`lookup(ids)`**: each identifier once, in the order given: `members`,
  `former` (`{id, name, status: "former", leftAt}`: someone who left the
  Chest after having the tool, so a record still reads “Camille Martin
  (former member)”; `{id, name: null, status: "erased", leftAt}` once the
  owner had their data erased, rendered “Former member”) and `unknown`.
  **Proposal (studio.15)**: `leftAt` is when they left the Chest (an ISO
  8601 instant, `null` from a Chest before it) — “left on 30 September” on
  a final expense claim; kept after an erasure, a date alone naming nobody. The SDK asks 200 at a time and
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

### `matchEmails` — who these addresses are (Proposal (studio.15))

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
// chest.json (chest.proposals.json in the studio), with "members" — approved as:
//   “Sees your Chest's groups and who is in them”
{ "groups": "read", "receives": ["member.*", "group.*"] }
```

sees them all:

```ts
import * as members from "@argentic/chest-sdk/members";
await members.groups.all();                    // [{id, name, size}] — every group, by name
await members.groups.members("grp_…");         // {members: ["mbr_…"], next} — or null: no such group
member(request).groups;                        // all the member's groups (64 at most), not only those giving the tool
```

- **Who is in a group** is said among the members who **have the tool**: a
  member without access stays unknown, as everywhere (`size` counts them
  the same way). `members(id, {after, limit})`: by identifier, 500 a page
  by default, 1,000 at most; `null` for a group the Chest does not have.
- `member(request).groups`, `members.get/list/lookup` carry **all** the
  member's groups, and `members.list({group})` works with any group.
- **Events** (`"receives": ["group.*"]`, only with `"groups": "read"`):
  `group.changed {id, changed: ["name" | "members"]}` and `group.removed
  {id}` on `POST /chest-events`, handled by `events.handle` like member
  events (`"group.changed": e => …`). When someone leaves a group, the tool
  also gets `member.updated {changed: ["groups"]}` for them: withdraw what
  targeted them through that group (a poll's reminder, a post's badge);
  `group.removed` withdraws what targeted the group.
- Errors: `CapabilityNotGranted` (not declared or not approved),
  `RateLimited` (shared with `members`: 600 calls a minute), `Unavailable`.

Store group ids, resolve names when rendering (`all()` is one call; keep it
a minute). In tests: `fakeChest({groups: [{id, name, members, grants: false}],
capabilities: ["members", "groups"]})` — `grants: false` is a group that
does not give the tool (only seen with `groups`); `chest.emit({type:
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

## `notifications` — badges and inbox items

A v2 tool that declares `"capabilities": ["notifications"]` (approved like a
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

### `broadcast` — everyone, each in their language (Proposal (studio))

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
test a tool's fallback.

## `events` — the members' lifecycle

A v2 tool that holds `members` and declares `"receives": ["member.*"]` in its
`chest.json` (approved like a permission: “Is told when the members who have
access to it change or leave.”) is told, on its own `POST /chest-events`:

| Event | `data` | When |
|---|---|---|
| `member.updated` | `{id, changed: ("name" \| "photo" \| "role" \| "groups" \| "email")[]}` | Something the tool sees of a member who has it changed (`email` only with `members.email`) |
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

## `mail` — email in and out (Proposal (studio))

A tool sends email in the company's name, and receives the email sent to
its mailboxes. The Chest holds the company's mail provider (connected once
by the owner: SMTP or a provider's API, SPF and DKIM on the company's
domain); a tool never holds a mail credential.

```jsonc
// chest.json (chest.proposals.json in the studio) — two permissions:
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

**The person's email preference (Proposal (studio.15)).** Each member
chooses once, in the Chest, `all`, `digest` or `none` (`member.mailPreference`,
read-only). `send` applies it to every recipient who is a member — given
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

In tests: `fakeChest({ capabilities: [..., "mail"], mail: { domain, mailboxes, perDay, suppressed } })`;
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
/chest-mail`, signed `Chest-Mail` (HS256 under HMAC-SHA256("Chest-Mail v1")
of `CHEST_TOKEN`, like `Chest-Event`), at least once (the same `id`),
again for 72 hours while the tool does not answer 2xx.

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
// chest.json (chest.proposals.json in the studio) — approved as:
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
await calendar.putMany(openTasks.map(eventOf));                           // Proposal (studio.15): 100 a call, [{key, members, skipped}] in order
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

**`putMany(events)` (Proposal (studio.15)).** A first sync — every open
task with a due date, every approved leave of the year — was one `put` per
event against the 600 writes a minute. `putMany` checks every event first
(one wrong event, or a key given twice: nothing sent), sends 100 a call,
and answers each event's `{key, members, skipped}` in the order given. The
Chest applies a batch whole or not at all — `QuotaExceeded` when its new
keys would pass 5,000 events — and counts it as one write of the minute
(`limits.perBatch`, `limits.perMinute`). Beyond 100, batches go one after
the other: an error after the first leaves the earlier ones applied; put
again, it is idempotent by key.

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
`chest.newFeedUrl(member)` (served by the fake's front at
`/_chest/calendar/<secret>.ics`, 404 once replaced); the front's
`/_chest/calendar` is the member's page (with the `Chest-Member`
assertion). The harness's `/_dev` shows the signed-in member's feed
address (a calendar app on the machine may subscribe to
`http://localhost:<port>/_chest/calendar/<secret>.ics`), their page, "New
address", and every event the tool put.

## `schedules` — scheduled tasks (Proposal (studio))

Work a tool does by itself at set times — reminders, a morning digest,
purges, a badge kept true overnight. The Chest runs nothing inside the
tool's container: at each time a cron line gives, in the Chest's time zone,
it **calls** the tool, as it delivers events.

```jsonc
// chest.json — each entry is a permission: “Runs by itself on a schedule:
// morning (weekdays at 07:30)”. Until a Chest accepts the key, the studio's
// tools keep it in chest.proposals.json (read by the harness and the checker).
{ "schedules": [{ "name": "morning", "cron": "30 7 * * 1-5" }] }
```

```ts
// app/chest-jobs/[name]/route.ts — outside /chest, never behind a session
import * as schedules from "@argentic/chest-sdk/schedules";
export async function POST(request: Request) {
  return new Response(null, { status: await schedules.handle(request, {
    morning: async run => { await remindDueToday(run.scheduledAt); },
  }) });
}
```

| Export | Gives |
|---|---|
| `handle(request, handlers)` | Verifies a delivery and runs its schedule's handler: 204, 401 (not the Chest's), 404 (no handler); a handler that throws makes it throw — answer 500, the run comes again (`run.attempt` 2 to 4) |
| `verify(request)` | The `Run` `{id: "run_…", name, scheduledAt, attempt, timeZone}` a delivery carries, or null: signature `Chest-Job` (HS256 under HMAC-SHA256("Chest-Job v1") of `CHEST_TOKEN`), this tool, fresh, the body signed, `POST /chest-jobs/<name>` |
| `timeZone()` | The Chest's time zone (`CHEST_TIMEZONE`, IANA), Europe/Paris by default: the day of "due today" |
| `parseCron`, `nextRun(line, after?, zone?)`, `describeCron`, `checkSchedules` | Cron lines (five fields: numbers, `*`, ranges, lists, steps), the next run in a time zone, words for the owner, the manifest's rules |

The Chest's bounds: 8 schedules per tool, not more often than every 15
minutes, 5 minutes per run, one run in flight per schedule (a time that
comes while one runs is skipped), deliveries at least once (again after 1,
5 and 15 minutes), a missed time run once when the node comes back, never a
backlog. Each run's start, duration and answer are in the tool's journal;
its page shows the next run and a "Run now" for builders.

In tests: `fakeChest({ schedules: [...], timeZone })`, then
`chest.run(name, to)` delivers a run (signed, like `emit`) and says the
status; `chest.runs` lists them.

## Events between tools (Proposal (studio))

The tools of one Chest share its people; with events they also share what
happens: a leave approved in Leave shows the person "off" in Rooms, a hire
in Hiring becomes a newcomer in People, a deal won in Clients starts a
quote. A tool publishes events **named after itself**; another tool
**receives** the ones it declares, once an admin linked the two ("Is told by
Leave when a leave is approved"). Delivery is the member events' own: `POST
/chest-events`, signed, at least once.

```jsonc
// chest.json of Leave (chest.proposals.json in the studio)
{ "emits": ["leave.approved", "leave.cancelled"] }
// chest.json of Rooms
{ "receives": ["member.*", "leave.approved", "leave.cancelled"] }
```

```ts
// Leave, when a leave is approved:
await events.publish("leave.approved", { member: "mbr_…", from: "2026-10-12", to: "2026-10-16", request: "42" }, { key: "leave:42:approved" });

// Rooms, in its /chest-events route:
await events.handle(request, memberHandlers, { seen, tools: {
  "leave.approved": e => markAway(e.data),
  "leave.cancelled": e => clearAway(e.data),
} });
```

| Export | Gives |
|---|---|
| `publish(type, data, {key?})` | `{id, receivers}`: `type` is `"<tool>.<name>"` of this tool, declared in `emits`; `data` a JSON object (16 KiB at most; people as member ids); the same `key` within 24 h is one event — any text of 1 to 512 characters, never cut (a long one goes as its SHA-256, as `mail`'s; studio.15), and the same key with another type or other data is refused (`ChestError` `key_conflict`, 409), never answered with the first event. `ChestError` `invalid_event`, `CapabilityNotGranted` (not declared, or no events between tools yet), `QuotaExceeded` (1,000 an hour) |
| `handle(request, handlers, {seen, tools})` | Also hands a received tool event `{id, type, source, occurredAt, data}` to `tools[type]`; a type without a handler is accepted and ignored |

What the owner approves: for the publisher, "Tells other tools when a
leave is approved (who, and which days)"; for the receiver, "Is told by
Leave when …"; the admin links the two in the Chest (a tool never picks its
publishers). The Chest journals each event (type, source, receivers, never
data) and keeps undelivered ones 72 hours, like member events. In tests:
`fakeChest({ emits, receivers })` records `chest.published`;
`chest.deliver({type, data}, to)` hands the tool another tool's event.

## `chest` — the Chest's settings (Proposal (studio))

```ts
import * as chest from "@argentic/chest-sdk/chest";
chest.company();   // "Atelier Martin" ("" when none)
chest.timeZone();  // "Europe/Paris": the day of "due today", the hour of a reminder
chest.today();     // "2026-09-28" in that zone
chest.currency();  // "EUR" (ISO 4217)
chest.locale();    // "fr": the Chest's default language (a public page before the visitor chooses)
chest.teamUrl();   // "https://booking-chest.atelier-martin.fr" (null outside a Chest)
chest.publicUrl(); // "https://booking.atelier-martin.fr" (null without a public part)
```

What every tool needs of the Chest and none should ask its admin again. The
Chest gives them in the tool's environment (`CHEST_COMPANY`,
`CHEST_TIMEZONE`, `CHEST_CURRENCY`, `CHEST_LOCALE`, `CHEST_TEAM_URL`,
`CHEST_PUBLIC_URL`); each function checks the value and falls back to a
safe default (a zone the runtime does not know is Europe/Paris; an address
that is neither https nor localhost is null). Links written outside a
request — an email sent by a schedule, an export, a calendar feed — use
`teamUrl()` / `publicUrl()` instead of a forwarded host.
`schedules.timeZone()` is the same function.

### `toolUrl` — the address of another tool (Proposal (studio))

```ts
chest.toolUrl("forms");                                 // "https://forms-chest.atelier-martin.fr"
chest.toolUrl("forms", { surface: "public" });          // "https://forms.atelier-martin.fr" (null while closed)
chest.toolUrl("wiki");                                  // null: not installed on this Chest
chest.toolLink("forms", "/chest/forms/5/answers/k3ab"); // "https://forms-chest.atelier-martin.fr/chest/forms/5/answers/k3ab"
chest.toolLink("forms", "//evil.example");              // null
```

A tool that received an event of another tool links the member back to it
(Clients and Support to the answer in Forms). The Chest gives every tool the
origins of the tools installed on it, in `CHEST_TOOL_URLS`:

```json
{ "forms": { "team": "https://forms-chest.atelier-martin.fr", "public": "https://forms.atelier-martin.fr" },
  "crm":   { "team": "https://crm-chest.atelier-martin.fr" } }
```

- **Names** are the tools' `name` in `chest.json` (`toolNamePattern`:
  lowercase letters, digits, single hyphens, 63 at most). Any other name
  answers null.
- **`team`** (the default surface) is the team host, where members reach a
  tool under `/chest`; **`public`** is the public host, present only while
  the owner keeps the public part open (a custom domain when the owner set
  one).
- **Only origins**: https, or http for `localhost` / `127.0.0.1` (a local
  harness); no credentials, path, query or fragment. An entry that is not
  one is ignored — the tool is then "not installed" for this function —,
  never the whole map. This tool's own name answers `teamUrl()` /
  `publicUrl()` when the map does not list it.
- **`toolLink(name, path, {surface?})`** joins the origin and a path that
  starts with `/` and not `//`, in the simple form the Chest's front accepts
  (printable ASCII, no `\`, no `.` or `..` segment, no encoded `/`, `\` or
  NUL, 512 characters at most). A team link is `/chest` or under it; a
  public link is never under `/chest` (the front sends that to the team
  host). null otherwise, or when `toolUrl` is null: show the text without a
  link.
- **Fresh at the next start.** The Chest rewrites the variable when a tool
  is installed or removed and when a public part opens or closes; a running
  tool reads it at its next start. A stale map only lacks a new tool (no
  link) or links to a removed one (the Chest's front answers 404).
- **A link is not access.** The member who follows it may not have that
  tool; its team host then says so. Store the other tool's name and path in
  your database (never an absolute URL, which changes with a custom domain),
  and make the link when you render the page.

### `theme` — the look the company chose (Proposal (studio))

```ts
import * as chest from "@argentic/chest-sdk/chest";
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
visitors.language(request);                                 // the switch's cookie "lang", Accept-Language, then chest.locale()
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
// chest.json — a permission the owner approves: “Asks the Chest to check up to 10 web addresses of yours”
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
(`Chest-Check`, like `Chest-Job`); `error` is `timeout`, `dns`, `tls`,
`refused`, `status` or `slow`. At least once (the same `id` may come
twice). Bounds: `max` 1 to 10, https only (http on localhost for a
harness), never a private address. In tests: `fakeChest({checks: {max}})`,
`chest.checks` (the list configured), `chest.check(name, to, {ok, status,
ms, error})`.

## `webhooks` — notices the Chest delivers to outside addresses (Proposal (studio))

```jsonc
// chest.json (chest.proposals.json in the studio) — a permission the owner approves:
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
| `journal({target?, after?, limit?})` | Deliveries: `status` (`pending`, `retrying`, `delivered`, `failed`), `attempts`, `responseStatus`, `lastError`, `nextAttemptAt` — never the text or data |
| `handle(request, {disabled})`, `verify(request)` | `webhook.disabled` `{id: "whe_…", target, reason: "failures" \| "gone", lastError}` on `POST /chest-webhooks`, signed `Chest-Webhooks` (HS256 under HMAC-SHA256("Chest-Webhooks v1") of `CHEST_TOKEN`, like `Chest-Check`), at least once |
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

## `databaseUrl()` — database of a server tool

A v2 tool that declares `"capabilities": ["database"]` in its `chest.json`
gets a PostgreSQL database of its own (the capability is shown and approved
like a permission, in the approval screen). The container has no network: its
launcher listens on `127.0.0.1` and relays each connection to the Chest. The
launcher sets `DATABASE_URL` —
`postgres://<user>:<password>@127.0.0.1:<port>/<database>?sslmode=disable`,
the user and the database both named `t_<tool>` — and `PGHOST`, `PGPORT`,
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

A v2 tool that declares `"capabilities": ["files"]` (approved like a permission)
keeps private files **through its Chest**, never on its disk (the container's
root is read-only). The launcher gives the tool
`CHEST_API=http://127.0.0.1:<port>` — its own port, relayed to the Chest; the
container has no network — and the instance is the identity: the tool reaches
its own files only.

```ts
import * as files from "@argentic/chest-sdk/files";
await files.put("photos/cat.png", bytes, "image/png");       // Uint8Array or text
const file = await files.get("photos/cat.png");              // {data, type, size} or null
const info = await files.stat("photos/cat.png");             // {name, type, size, updated, width?, height?} or null
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

### Public uploads and public files (Proposal (studio))

Built from the decided storage spec (`reference/product/specs/tool-storage.md`),
which the Chest has not built yet:

```jsonc
// chest.json (chest.proposals.json in the studio) — two permissions:
//   "Lets visitors of its public part upload files (10 MiB each at most)."
//   "Publishes the files it puts under public/ on its public address."
{ "files": { "publicUploads": true, "publicFiles": true } }
```

```ts
// A public page's action, after the tool's own checks of the visitor:
const up = await files.uploadUrl("uploads/public/", { public: true, types: ["application/pdf"], maxSize: 5 << 20 });
// → { url: "https://<tool>.<chest>/_chest/upload/<token>", … }: the visitor's browser PUTs the file there, no session
const info = await files.stat(name);   // then record it, as for a private upload

files.publicUrl("public/logo.png", { version: info.updated }); // "/_chest/public/logo.png?v=…" on the public host
```

A public upload: 10 MiB at most whatever `maxSize` says (`TooLarge` beyond),
only under `uploads/public/`, 30 a minute per visitor address, the same
type and content checks; its token works only on the public host's route
(and a private token only on the team host's). Public files: objects under
`public/`, served on the public host at `/_chest/public/<name>`, cached an
hour, `?v=` for a new version. In tests: `fakeChest({ storage: {
publicUploads, publicFiles } })`.


**Claiming a visitor's upload.** A public upload answers the visitor's
browser `{type, size, claim}` — never the object's name. The form sends
the claim with the rest; the tool's server trades it once with
`files.claim(claim)` → the object (`{name, type, size, updated}`), so a
visitor can only attach what they sent themselves. With
`uploadUrl(…, {public: true, expiresUnclaimedAfter: 86400})` (60 s to 7
days), the Chest deletes an upload nobody claimed in that time: no sweep in
the tool. (A tool that names each object itself and signs the name into
its form, as Hiring does, may keep doing so.)

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

Errors: `CapabilityNotGranted` (a version without the capability, or no
`CHEST_API`), `TooLarge` (413), `QuotaExceeded` (429), `Unavailable` (the
Chest not reached, or an answer that is not its own: a write may or may not
have happened), `ChestError` for the rest (`invalid_type`, `no_thumbnail`,
`not_found` for `url` and `move`…). Removing the tool removes its files; a new
version keeps them.

## `testing` — a tool's own tests

`@argentic/chest-sdk/testing` is for tests, never imported by production code.

```ts
import { fakeChest, signAssertion, withMember } from "@argentic/chest-sdk/testing";

const camille = { id: "mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya", firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "editor", isAdmin: false, isBuilder: false, groups: [] };
const chest = await fakeChest({ members: [camille], capabilities: ["members", "files", "notifications"] });
const response = await handler(withMember(new Request("http://tool.test/chest/tasks"), camille));
assert.equal(await chest.emit({ type: "member.erased", data: { id: camille.id, erasure: "era_k2qhx4mzc7v3b6nfp5r2t7w4ya", deadline: "2026-10-28T10:00:00Z" } }, request => handler(request)), 204);
assert.deepEqual(chest.acknowledged, ["era_k2qhx4mzc7v3b6nfp5r2t7w4ya"]);
assert.deepEqual((await members.list()).members.map(m => m.id), [camille.id]);
assert.ok(chest.files.has("reports/2026.pdf"));
assert.deepEqual(chest.notifications, [{ member: camille.id, title: "New task", path: "/chest/tasks/42", key: "task:42" }]);
assert.equal(chest.badges.get(camille.id), 1);
await chest.close();
```

| Function | Gives |
|---|---|
| `signAssertion(member, {token?, tool?, now?})` | A `Chest-Member` header value signed like the Chest's (the token and tool of the environment by default) |
| `withMember(request, member, options?)` | The request carrying that assertion: a new Web `Request`, or the same Node request |
| `fakeChest({members?, former?, groups?, capabilities?, receives?, files?})` | An HTTP server on `127.0.0.1` that sets `CHEST_API`, `CHEST_TOKEN`, `CHEST_TOOL` (`tool` unless set) and answers members, groups, files, badges, notifications and erasure acknowledgments with a Chest's bounds, quotas and errors; a capability left out answers 403 (`members`, `files` and `notifications` by default; `members.email` adds the addresses; `receives` is `["member.*"]` by default, `[]` refuses acknowledgments). A former member `{id, name?, erased?}` looks up as `former`, or `erased` |
| `chest.emit(event, to)` | Delivers an event (`{type, data, id?, occurredAt?}`: a new id and now by default; name an id to deliver the same event twice) signed as the Chest signs it, to `to` — the tool's address (`POST <to>/chest-events`) or a function of a Web `Request` — and says the status it answered. A `member.erased` makes its erasure one the tool may acknowledge |
| `chest.acknowledged` | The erasures the tool acknowledged, each once |
| `chest.members`, `chest.groups`, `chest.files` | What the fake Chest holds, to change or assert on; its `members` are those who have the tool |
| `chest.notifications`, `chest.badges` | What the tool sent: the items kept, `{member, title, body?, path, key?}` cleaned as the Chest cleans them, in the order sent (a replaced item removed, the new one last; `withdraw` removes), and each member's badge (`Map` member → count; 0 removes it) |
| `chest.upload(url, data, type)` | **Proposal (studio).** Plays a member's browser sending a file to an `uploadUrl` answer: the fake Chest's front checks the token (once, before its expiry), the type and the size, names the object in a folder, and answers `201 {name, type, size}`, or 403 `invalid_token`, 415 `type_refused`, 413 `too_large`, 429 `quota_exceeded` |
| `fakeChest({origin})` | **Proposal (studio).** The team host its links and uploads point to (`https://<tool>-chest.chest.test` by default). A local harness gives its own (`http://localhost:<port>`) and relays `/_chest/*` of its host to `chest.api`, where the fake Chest's front serves the uploads, the signed links and the members' photos (initials). `files.url` and `uploadUrl` accept `http://localhost` and `http://127.0.0.1` links for that reason |
| `fakeChest({schedules, timeZone})`, `chest.run(name, to, {id?, scheduledAt?, attempt?})`, `chest.runs` | **Proposal (studio).** A run of a declared schedule delivered to `POST <to>/chest-jobs/<name>` (or a handler of Web Requests), signed as the Chest would; `CHEST_TIMEZONE` set (Europe/Paris by default) |
| `fakeChest({settings: {company, currency, locale, publicUrl}})` | **Proposal (studio).** The Chest's settings (`chest`) in the environment while the fake runs; `CHEST_TEAM_URL` is the fake's origin |
| `fakeChest({tools})`, `chest.tools`, `chest.installTool(name, addresses?)`, `chest.removeTool(name)` | **Proposal (studio).** The tools installed beside this one (`chest.toolUrl`), by name: `true` for a team host at `https://<name>-chest.chest.test`, or `{team?, public?}` origins (`public` an open public part, `team: null` none). This tool is always there, at the fake's origin and `settings.publicUrl`. `installTool` and `removeTool` rewrite `CHEST_TOOL_URLS` as the Chest does |
| `fakeChest({theme, themeFiles})`, `chest.theme`, `chest.themeFiles` | **Proposal (studio).** The company's look at its two levels (`{all, tools}`), which `chest.theme()` answers resolved for the tool (`CHEST_TOOL`) with `max-age=0`; the files its front serves under `/_chest/theme/` |
| `chest.former` | **Proposal (studio).** Those who left (`{id, name, leftAt?}`) or were erased (`{id, erased: true, leftAt?}`): what `members.lookup` answers "former" for (`leftAt`, studio.15, when they left). A test or a harness that removes a member from `chest.members` moves them here, as a real Chest would, then calls `clearCaches()` |
| `fakeChest({tool})` | **studio.15.** The tool's name (`chest.json` `name`) as `CHEST_TOOL` while the fake runs — what `events.publish` (`"<tool>.<name>"`), `member()` and the signatures read. Without it, the environment's `CHEST_TOOL`, or `"tool"` |
| `chest.clearCaches()` | **studio.15.** Forgets what the process keeps of the Chest's answers — `members.lookup`'s minute, the theme — after a test changed `chest.members`, `chest.former` or `chest.theme` by hand (an event delivered with `emit` already empties lookup's) |
| `fakeChest({network: {host: handler}})`, `chest.egress` | **studio.15.** The hosts the tool declares (`chest.json` `network`: `"graph.microsoft.com"`, `"*.icloud.com"`) and a handler of Web Requests answering each. While the fake runs, the tool's **plain `fetch()`**, unchanged, goes as through the Chest's egress proxy (see "`network`" above): a declared host to its handler (redirects followed through declared hosts, `AbortSignal` honoured); an undeclared name, an IP literal or a port other than 80/443 refused as the proxy refuses — `fetch` rejects with a `TypeError` for `https:`, answers 403 `Chest-Egress: refused; reason=…` for `http:`; `localhost`, `127.0.0.1` and `::1` (the fake's API, the tool's own test server) straight through. `chest.egress` lists each request `{method, url, status, refused?}`. It replaces `globalThis.fetch` (and gives it back on `close`) rather than setting the proxy variables: Node reads `NODE_USE_ENV_PROXY` only when it starts, and a test needs neither a proxy nor Node 24.5. `node:http(s).request` is not routed. Without `network`, `fetch` is left alone |
| `chest.held` | **Proposal (studio.15).** What members' email preferences held back: `{id, member, reason: "none" \| "digest", subject, text}` (members take an optional `mailPreference`) |
| `fakeChest({calendar})`, `chest.calendar`, `chest.feed(member)`, `chest.feedUrl(member)`, `chest.newFeedUrl(member)` | **Proposal (studio).** The calendar bridge (with `"calendar"` in `capabilities`): the events put, a member's feed as the Chest writes it, its secret address on the fake's front |
| `fakeChest({groups: [{…, grants: false}], capabilities: [..., "groups"]})` | **Proposal (studio).** Groups that do not give the tool, seen only with `groups` (`groups.all`, `groups.members`, all of a member's groups); `emit` delivers `group.changed` and `group.removed` |
| `chest.receive(message, to)`, `chest.bounce(messageId, to, options?)` | **Proposal (studio).** A message delivered to `POST <to>/chest-mail` as the Chest would (HTML cleaned, original stored, executables dropped, `thread`/`deliveredTo`, `authenticated`, `auto`); a sent message bounced (status, suppression, the bounce posted) |
| `fakeChest({webhooks: {max, resolve?, deliver?, to?}})`, `chest.webhooks` | **Proposal (studio).** The webhook targets the tool added, the deliveries (bodies and signatures as sent), the `webhook.disabled` events; `respond(target, answer)` makes a receiver fail, `retry()` plays the retries (see `webhooks`) |
| `chest.close()` | Stops it and restores the environment (and `fetch`) |

## Version

The package version is `version` in `package.json` (semver), published by a
tag `vX.Y.Z` (see `PUBLISHING.md`). This working copy is
`0.3.0-studio.15`: studio.15 fixed idempotency keys (never cut; long ones
hashed; a key reused for something else refused with `key_conflict`),
added `fakeChest({tool, network})`, `chest.clearCaches()`, and the
proposals `members.matchEmails`, `calendar.putMany`, `FormerMember.leftAt`
and the members' email preference (`member.mailPreference`,
`mail.send({transactional})`).

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
npm test               # build dist/, compile the tests into build/, run them
npm run check:package  # npm pack, install into a temp project, import every subpath
                       # from Node and through esbuild, type-check a TS consumer
```

`client/src` holds the modules, `client/index.ts` the package root,
`client/test` the tests. `npm run build` compiles `client/index.ts`, the
seven published modules (`errors`, `member`, `members`, `database`, `files`,
`notifications`, `testing`) and the one they share (`api`, the Chest's API) —
TypeScript strict, ES2022, NodeNext — into `dist/`: ESM `.js`, `.d.ts` and
their maps. `member.ts` imports nothing but `node:*`, so that a tool may copy
it alone.
The package stays dependency-free (`node:*` only) and reaches nothing but the
Chest's API on `127.0.0.1`. `AGENTS.md` is a usage guide for AI agents
building a tool with this package.

## Licence

MIT (`LICENSE`), © 2026 Argentic.
