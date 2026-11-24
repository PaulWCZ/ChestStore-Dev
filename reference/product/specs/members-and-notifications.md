# Members and notifications

**Specified 28 September 2026, approved by Paul.** Batches M (§ 1–3, § 6) and N (§ 4,
§ 5) are built; § 7, the Chest's groups for tools and broadcast, was specified and
built on 6 October 2026 (batch GRP, [status.md](../03_roadmap/status.md)); § 9, the Chest on the phone
and push, was specified, approved and built on 7 October 2026 (row PH). This page fixes what a tool may know about
the team and how it may call a member's attention. How it is coded goes, once
built, into `03_code/01_chest-by-argentic/docs/architecture.md`.

Out of scope here:

- **Email.** A tool never mails a member: the Chest mails each member their
  notifications as they choose, a service of the Chest; a tool's mail to the
  public comes later, through a connector to the company's provider: [Mail](mail.md).
- **Public accounts** (customers of a tool's public part): a different, future
  connector with its own namespace (`accounts`, ids `acc_…`). A member is never
  an account and the members API never returns an account, even when the same
  person is both.

## 1. The Chest member id

Today a tool sees `id` = the OIDC `sub` of the Chest's provider. That ties the
tool's data to one provider, one realm and one installation. It is replaced.

| Rule | Decision |
|---|---|
| Shape | `mbr_` + 26 characters of lowercase base32 (130 random bits), e.g. `mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya` |
| Issued by | The Chest, once, when a person becomes a member (owner at opening, invitation accepted) |
| Mapping | `id → (issuer, subject)` kept in the Chest's policy only; no tool, agent or API ever sees `issuer` or `subject` |
| Scope | One id per member **for the whole Chest**: the same person is the same id in every tool of that Chest (automations and events between tools need it). Random, so two Chests cannot correlate the same person |
| Stable across | Name or email change, provider recreated, realm replaced, a future sign-in method (passkeys, company SSO), backup and restore (the id is in the policy, which the nightly archive carries) |
| Never | The email, the provider subject, a hash of either, a reused id. A removed member's id is never given to anyone else |
| Groups | Same principle: `grp_` + 26 base32 characters |

**Former members.** When a member leaves, the Chest keeps a tombstone: `id`,
`name`, the date, and the set of tools the member had access to. A tool from
that set that looks the id up gets `{id, name, status: "former"}`, so a record
still reads “Assigned to Camille Martin (former member)”. Erasure (§ 5) removes
the name: `{id, status: "erased"}`, rendered “Former member”. A member who
stays in the Chest but **lost access to a tool** is `{id, name, status:
"no_access"}` to that tool — only if the tool had them (the Chest remembers
whom each tool had): “Léa Dubois (no access)”, so the laptops she holds or
the goals she owned keep a name (decided 30 September 2026, from the store
studio's friction report). Anyone the tool never had stays `unknown`.

**Export and import between Chests** (not built; what it would need):

1. A member id means something only inside its Chest. Restoring a whole Chest
   keeps its ids; nothing else to do.
2. Moving **one tool's data** to another Chest carries, with the data, the
   directory of the ids it references (`id`, name, email) — an owner operation,
   never a tool's.
3. At import, the owner matches each source id to a member of the target Chest
   (suggested by verified email) or leaves it “former”.
4. The target Chest keeps an alias table `source id → target id`: `lookup`
   resolves aliases, and the tool receives `member.aliased {from, to}` (events,
   § 5) to rewrite its rows at its pace.

**Consequences.** The `Chest-Member` assertion changes shape (below); its key
label becomes `Chest-Member v2`, so an SDK 0.1.x refuses it instead of
misreading it. The SDK goes to **0.2.0** (a breaking minor under 0.x; 1.0.0 is
frozen before the first pilot). No compatibility: nothing is published besides
SDK 0.1.x, and `chest migrate` assigns ids to the members of existing Chests
once.

## 2. The member of a request

`member(request)` keeps its name and gains `groups`; `id` is the member id;
`email` is present only when the tool holds `members.email`.

```ts
type Member = {
  id: string;            // "mbr_…"
  firstName: string;
  lastName: string;
  name: string;          // "Camille Martin", or the email's local part when no name is set
  photo: string | null;  // /_chest/members/{id}/photo?v=<rev> on the tool's team host
  role: string | null;   // one of the roles the manifest declares; null if it declares none
  isAdmin: boolean;
  isBuilder: boolean;    // builder of THIS tool
  groups: string[];      // ids of the member's groups the tool sees: those that give
                         // it to them, or all of them with "members.groups" (§ 7)
  language: string;      // "fr": the language the Chest speaks to them
  timeZone: string;      // "America/New_York": the zone the member works in
  email?: string;        // only with "members.email"
};
```

Assertion claims: `sub` (member id), `given_name`, `family_name`, `name`,
`picture`, `role`, `admin`, `builder`, `groups`, `language` (the one the
Chest speaks to this member), `time_zone` (the zone they work in), and
`email` only with the
permission. Everything else (`iss`, `aud`, 60 s life, HS256 under
`CHEST_TOKEN`) is unchanged.

**The Chest is not the member (decided by Paul, 29 September 2026).** What
is the same for every member is never a member's field: the organization's
name, the Chest's time zone, its language and its currency are the Chest's,
read with the SDK's `chest` module (`chest.organization.name`,
`chest.timeZone`, `chest.today()`, `chest.language`, `chest.currency`), in a
request or outside one; so are the tool's own addresses
(`chest.tool.teamUrl`, `chest.tool.publicUrl` — its custom domain once one is
served), for the links of a mail sent later. The Chest
gives them to every tool in its environment and starts every tool again
when the owner or an admin changes one (Settings → General; the currency
is the euro until set: neither the language nor the zone says a company's
currency) or, for its addresses, a custom domain starts or stops being
served; the zone is
also the zone of the tool's database, so its `current_date` is the
company's day. There is no `member.organization`.

**Each member works in their own zone (Paul, 29 September 2026: “each user
may work in different zones”).** The Chest's zone stays the company's
reference — deadlines, the business day, the database. A member's zone is
theirs: followed from their browser without a question (at their first
visit, and whenever the browser is elsewhere, as long as they chose none),
or chosen in their Profile, next to the language (“Automatic
(Europe/Paris, 17:21)” by default); the Chest's zone while nothing is known.
Tools are told it — `member.timeZone`, on each request and in the members
API, beside `member.language`, so a notification to another member is in
their language and at their hour — and follow one rule, written in the SDK's guide: **store instants in
UTC, decide the company's day in the Chest's zone, show times (and remind)
in the member's**.

**Guests (decided by Paul, 29 September 2026).** A status below member,
**guest < member < builder < admin < owner**, for someone from outside the
company — an accountant, a lawyer, a contractor — given a single tool. A
guest has **exactly a member's rights** in the Chest: the tools they are
given, their profile, nothing to run. The status only sets them apart for
whoever runs the Chest:

- **Team** lists them in their own **Guests** section, below the members,
  with the line “Someone from outside the company, like your accountant.
  Uses the tools they are given, as a member.”
- **Invitations** and a member's **Status** menu offer *Guest · Member ·
  Builder · Admin* (Admin to the owner only), each with its one line; the
  default stays Member. A guest given a tool to change becomes a builder.
- **Tools are told nothing new**: no `isGuest`, no claim; a guest is a
  member to a tool (`isAdmin` and `isBuilder` false). Nothing a tool would do
  with it that its own roles do not do better (an accountant is given the
  tool's “accountant” role, not a Chest status), and exposing it would tell
  tools something about people they do not need.
- No migration: existing members stay members.

## 3. Permission `members`

```json
{ "capabilities": ["members", "members.email"] }
```

| Capability | Sentence at approval |
|---|---|
| `members` | “Sees the name, photo, role and groups of the members who have access to it.” |
| `members.email` | “Sees the email address of the members who have access to it.” (its own line; requires `members`) |
| `members.groups` | “Sees all the Chest's groups, and which of the members who have access to it are in each.” (its own line; requires `members`; § 7) |

Read-only. Approved like `database`; adding either to a later version is a new
permission (owner or admin approves).

**Who a tool sees:** exactly the members that have access to it at the time of
the call (`Team.Access`: direct grant, group, open to all, plus the owner and
the admins, who always get in; a builder of the tool only through a grant,
like any member — [Builders](perseus-build.md#builders)). Recomputed on every call. A member
without access is indistinguishable from an id that does not exist.

### API

Through `CHEST_API` (the instance is the identity, as for files). SDK import:
`@argentic/chest-sdk/members`.

| SDK | Chest route | Answer | Notes |
|---|---|---|---|
| `members.list({after?, limit?, q?, role?, group?})` | `GET /members?after=&limit=&q=&role=&group=` | `{members: Member[], next: string \| null}` | Ordered by name then id; `limit` 100 by default, 500 at most; `next` is an opaque cursor; `q` matches the start of first name, last name or name (and email with `members.email`), case- and accent-insensitive |
| `members.get(id)` | `GET /members/{id}` | `Member`, or `null` (404 `member_not_found`) | 404 also for a member without access: no probing |
| `members.lookup(ids)` | `POST /members/lookup {ids}` | `{members: Member[], former: {id, name?, status}[], unknown: string[]}` | 200 ids at most per call; the SDK splits bigger lists. In-process cache: 60 s, 5,000 entries, cleared by `member.updated` when events exist |
| `groups.list({after?, limit?})` | `GET /groups?after=&limit=` | `{groups: {id, name, size}[], next: string \| null}` | Paged like `members.list`. The groups that hold an access grant on this tool; every group of the Chest with `members.groups` (§ 7). `size` counts only members who have the tool; `members.list({group})` pages them |

`Member` in these answers has the shape of § 2 (`groups` limited to groups that
give access to this tool, or all the member's groups with `members.groups`). Errors: 403 `capability_not_granted`, 400
`invalid_id`, 429 `rate_limited` (600 calls a minute per instance), 503
`unavailable`.

**Photo.** `/_chest/members/{id}/photo` on the tool's team host serves the
photo to a session that has the tool, and only for a member who also has it
(today any member's photo is served to anyone with the tool: tightened).
`?v=<rev>` changes with the photo; `Cache-Control: private, max-age=300`.

### Recommended schema

Store ids, resolve names when rendering, never copy.

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

Copying names or emails into the tool's database makes them stale and turns
the tool into a second directory to erase. A tool that must send something to
a member later stores the id and resolves it then. Searching tasks by
assignee name: `members.list({q})` first, then `where assignee = any($ids)`.

### Security

- Fields come from the Chest's policy, never from provider claims or the tool.
- No `issuer`, `subject`, provider, invitation, sign-in or security data, ever.
- A tool learns nothing about members of other tools or about the Chest's
  size beyond the members it can see.
- The database console and the agents API show member ids as stored; resolving
  them to names is the tool's rendering, not the console's.

## 4. Notifications

```json
{ "capabilities": ["notifications"] }
```

Sentence at approval: “Shows counters and sends notifications, inside the
Chest, to the members who have access to it.”

Two primitives. A tool reaches its members inside the Chest only; the Chest
then brings them what reaches their inbox by mail ([Mail](mail.md)) and to
their devices by push (§ 9), as each member chooses.

| SDK | Chest route | Effect |
|---|---|---|
| `badge.set(memberId, n)` | `PUT /badges/{memberId} {count}` | Idempotent state: `n` from 0 to 9,999, 0 clears. Shown as a count pill on the tool's tile in the Chest home and on its row in the tools list, for that member only (“99+” beyond 99) |
| `badge.setMany([{memberId, count}])` | `PUT /badges {badges}` | As many as the team holds (§ 7, “No count bounds a team”) |
| `notify(memberIds, {title, body?, path?, key?})` | `POST /notifications` | One inbox item per recipient |
| `notifications.withdraw(key, memberIds?)` | `POST /notifications/withdraw` | Removes the items with that key (all recipients, or those named): the task is done, the item goes |
| `notifications.broadcast(notice, {to?, except?})` | `POST /notifications/broadcast` | One item for everyone who has the tool, or those of some groups or roles (§ 7) |

`notify` fields:

| Field | Rule |
|---|---|
| `memberIds` | One id at least, as many as the team holds; the Chest keeps those with access to the tool |
| `title` | Plain text, 1 to 80 characters |
| `body` | Plain text, 280 characters at most |
| `path` | A path of the tool's private part, starting with `/chest`, 512 characters at most; the Chest builds the link on the tool's team host. No other host, no scheme, no `//`. Absent: the tool's `/chest` |
| `key` | `[a-z0-9._:-]{1,64}`. Same tool, member and key: the item is **replaced** (new text, moved to the top, unread again), never duplicated |
| `translations` | Optional, `{"fr": {title, body?}, …}`: the same notice in other languages, by language tag (`[a-z]{2,3}`), each under the rules of `title` and `body`. Each member gets the one in their language (`member.language`), the base `title` and `body` otherwise — the tool's own default (§ 7) |

Answer: `{delivered: string[], skipped: string[]}`; `skipped` holds unknown ids
and members without access. A muted tool counts as delivered: the tool does not
learn who muted it.

Plain text only: control characters are removed, nothing is interpreted as
Markdown or HTML, line breaks are kept in `body`. Every item shows the tool's
icon and title beside it, so a tool cannot pass for the Chest or another tool.

**Pace, never a refusal** (Paul, 6 October 2026, § 7): a tool's notices to a
member go at a normal pace — ten at once, then one every six minutes —;
beyond, they are folded into the tool's one grouped item of that member's
inbox, nothing refused nor lost. Badges: the last write wins. Inbox: 500
items per member (the oldest read ones go first), kept 90 days.

**Lifecycle.** Access to the tool revoked: that member's items and badge from
the tool are deleted. Member removed: their inbox is deleted. Tool removed:
all its items and badges go. Nothing of the inbox leaves the Chest; it is in
the nightly archive.

### The inbox, on screen

In the Chest's black and white editorial style (no colour states, hairlines,
regular weight):

- **Bell** at the right of the header, with the unread count as a small black
  pill (nothing when zero). The portal refreshes it every 30 s while the page is
  visible, and on focus.
- **Panel** under the bell, 400 px wide (full screen on a phone): “Notifications”,
  “Mark all as read”; rows = tool icon, title, body on two lines, relative time;
  unread rows carry a black dot on the left. A click opens the path on the
  tool's team host and marks the item read. Row menu: “Mark as unread”, “Mute
  <tool>”. Empty state: “Nothing new.”
- **Profile → Notifications**: one line per tool that has sent something, a
  switch “Notify me”. Muting stops new inbox items from that tool; badges stay
  (they are a quiet state, not an interruption).
- **Tile and row pills**: the badge count, black on white, top right of the
  tile.

**Agents.** A member's personal token reads their inbox: `GET /api/v1/inbox`
(items, unread count), `POST /api/v1/inbox/read {ids | all}`. MCP tool
`inbox`: “what needs my attention”. An agent never sends notifications; tools
do.

## 5. Member lifecycle events

Built on the planned `events` capability (batch A). A tool holding `members`
that declares `"receives": ["member.*"]` gets these events; before events
exist, batches M and N ship without them and tools reconcile by listing.

| Event | Data | When |
|---|---|---|
| `member.updated` | `{id, changed: ["name" \| "photo" \| "role" \| "groups" \| "email" \| "language" \| "timeZone"]}` | Something the tool can see changed (`email` only with `members.email`; `language`, `timeZone`: what a digest is written in, and at what hour) |
| `access.revoked` | `{id}` | The member lost access to this tool but stays in the Chest |
| `member.removed` | `{id}` | The member left the Chest (the id becomes “former”) |
| `member.erased` | `{id, erasure, deadline}` | The owner asked for this person's data to be erased |

Delivery: `POST /chest-events` on the tool's server through its launcher (never
on the public host), envelope `{id: "evt_…", type, occurredAt, data}`, signed
like the assertion (label `Chest-Event v1`), verified by
`events.verify(request)`. **At least once**, deduplicated by `id`, no order
guaranteed; retried with growing delay for 72 hours, after which the tool is
marked “out of sync” on its page. `members.list` is the truth: a tool
reconciles by listing, at start and after being out of sync.

**Erasure contract.**

1. The owner chooses “Erase this person's data” on a member (at removal or
   later). The Chest erases what it holds (name, photo, email in the tombstone,
   inbox) at once.
2. Every tool the member ever had access to and that receives events gets
   `member.erased` with an `erasure` id and a `deadline` (30 days).
3. The tool deletes or anonymises that person's data, then acknowledges:
   `events.acknowledgeErasure(erasure)` → `POST /erasures/{erasure}/done`.
4. On the member's page the owner sees each tool: “Erased on 3 Oct.”,
   “Pending — due 28 Oct.”, “Overdue”, or, for a tool without events, “Confirm
   by hand” (its builder or an admin confirms once they have done it).

## 6. Testing: `@argentic/chest-sdk/testing`

For the tool's own tests, never imported by production code.

| Function | Gives |
|---|---|
| `signAssertion(member, {token?, tool?, now?})` | A `Chest-Member` header value signed like the Chest's, for a `Member` of § 2 |
| `withMember(request, member)` | The same request carrying that assertion |
| `fakeChest({members?, groups?, capabilities?, files?, chest?})` | An in-process HTTP server on `127.0.0.1` that sets `CHEST_API`, `CHEST_TOKEN`, `CHEST_TOOL`, and the Chest's organization, time zone and language (`chest`), and answers members, groups, badges, notifications (broadcast included) and files with the same limits and errors as a Chest; a capability left out answers 403. A group given `grants: false` does not give the tool: seen only with `members.groups` (§ 7); a member whose `groups` is `null` is signed with the groups overage |
| `fake.notifications`, `fake.badges`, `fake.files` | What the tool sent, to assert on |
| `fake.emit(event)` | Delivers a signed event to the tool (once events exist) |
| `fake.close()` | Stops it and restores the environment |

## 7. The Chest's groups, and telling many at once

**Specified 6 October 2026** (batch GRP; the first item of the store gap,
[store-gap-2026-10.md](../../98_travail/store-gap-2026-10.md)). Defaults chosen
where Paul has not decided; the open questions are at the end.

**The need.** A tool open to everyone — News, Polls, Wiki, Rooms, Goals, and
Tasks and Leave — has no group that gives it, so `groups.list()` answers
nothing and “post to Sales”, “ask the Office”, “this space is the Board's”
cannot be offered. And a tool that tells everyone (a poll opened, an
incident, a published form) must today list its members, group them by
language and call `notify` in batches of 500.

### How the best products do it

| Product | Groups an app may read | Telling a whole group |
|---|---|---|
| Slack | User groups (`@sales`) through the `usergroups:read` scope, granted at install; `usergroups.users.list` answers user ids | A message mentioning the user group: Slack expands it and notifies each member |
| Microsoft 365 | Every group through `Group.Read.All` / `GroupMember.Read.All`, an **admin's** consent; members are directory ids; `/me/memberOf` the signed-in user's groups | Teams activity feed: `sendActivityNotificationToRecipients` to the members of a team — the platform expands the audience; texts come from templates the app declares, localised by the app |
| Google Workspace | Directory API `groups.list`, `members.list` under admin-consented read-only scopes; each group says who may see its members | Mail to the group's address, expanded by Google |
| Vercel | Access groups (members given projects) — like our groups giving tools; integrations ask a team scope at install | — |
| Supabase, Railway | No group primitive: teams live in the app's own tables (Supabase's “Broadcast” is a realtime channel, not a notification) | — |

What we take: reading every group is **its own permission, approved by an
admin**, separate from reading people (Slack, Microsoft, Google); membership is
**member identifiers**, resolved by the members API; the platform **expands
an audience itself** (Microsoft's team recipients, Slack's group mention) and
each person reads it **in their language from texts the app gives**
(Microsoft's localised templates); lists are **paged** whatever the size
(Microsoft's and Google's directory pages), and a token that cannot carry
all of someone's groups says so and lets the app ask (Microsoft's **groups
overage**). What we leave: Google's per-group visibility (Paul: no).

### Decisions

| Question | Decision |
|---|---|
| What a tool may read | With `members`, as before: the groups that give it, and in each the members who have the tool. With the new capability **`members.groups`** (requires `members`): **every group of the Chest** — id and name —, and in each **only the members who have the tool**: a member without access stays indistinguishable from an identifier that does not exist, whatever the group. Never a group's grants, its other tools, its size beyond those members, nor who manages it |
| Capability | `members.groups` in `"capabilities"`, a permission of its own approved at install or update like `members.email`: “Sees all the Chest's groups, and which of the members who have access to it are in each.” — “Their names only; never anyone without access.” Shown in the people family on every review page; a version that adds it is a new permission (owner or admin approves) |
| `member.groups` | With `members.groups`, **all the member's groups**, in the assertion of a request and in the members API — so “is Léa in Sales?” is answered by the request itself, without a call. Without it, the groups that give the tool (unchanged). The assertion carries them while it keeps within 8 KiB — half of the 16 KiB of headers a Node server reads, about 150 groups —; beyond, `groups_overage` and `member.groups` is `null`: the tool reads them with `members.get(id)` (Microsoft's groups overage) |
| API | `groups.list({after?, limit?})` (`GET /groups`) pages the groups the tool may see like `members.list` — by name, 100 a page by default, 500 at most, a cursor —, each `{id, name, size}`, `size` how many of its members have the tool; `members.list({group})` pages them. Every page also stops at 1 MiB, so members in many groups come over more pages |
| Events | **No `group.*` event.** A member joining or leaving a group the tool sees — a group deleted included — is `member.updated {changed: ["groups"]}`, as today; a renamed or new group is read at render: a tool stores group ids and resolves names with `groups.list()`, as it does for members |
| Broadcast | `notifications.broadcast(notice, {to?, except?})` → `POST /notifications/broadcast`: one item for **every member who has the tool now**, or, with `to: {groups?, roles?}`, those in any of the groups **or** holding any of the tool's roles; `except` leaves members out (the author, those who already answered). Resolved by the Chest at the time of the call. A group the tool may not see, or that no longer exists, matches nobody — no error, no leak. Answer **204**: the tool learns no head count (a tool without `members` sees no one) |
| Languages | `notify` and `broadcast` take `translations: {"fr": {title, body?}, …}` beside the base `title` and `body`; each member gets their language's, the base one otherwise — the tool's own default, as the contract says of a language a tool does not speak. One rule for both calls: a tool no longer groups its recipients by language |
| Who may broadcast | The tool's server, holding `notifications` — no new permission: the approval already says it notifies the members who have access to it. Which member may trigger it inside the tool is the tool's rule (its roles). An agent never notifies (§ 4) |
| Pace, never a refusal | **Decided by Paul, 6 October 2026.** No call is refused for its pace, and no notification is lost: a tool's notices to a member go at a normal pace, measured per tool and member by a token bucket — ten at once, then one every six minutes —; beyond, of `notify` and `broadcast` alike, each is folded into the tool's **one grouped item** of that member's inbox, which updates in place: “37 new notifications” above the latest's title, opening the latest's path, unread again. The call answers as ever (the SDK never throws for pace). The grouped item costs constant space per tool and member, so a runaway tool's storage stays bounded by the team's capacity; once read, the next burst starts another. A notice whose `key` names an item replaces it, never folded; a folded notice keeps no key. Badges are a state: the last write wins, a write that changes nothing writes nothing, none refused. Only a malformed or oversized call is refused. **Mails** follow: a grouped item is one line of the member's next mail — “New notifications: 37” and the latest —, mailed again as it grows (`01_produit/02_specs/mail.md`) |
| Fake Chest | `fakeChest({groups: [{id, name, members, grants?}]})`: a group with `grants: false` does not give the tool, seen (and kept in `member.groups`) only with `members.groups`; the fake answers `broadcast` with the Chest's rules, and `fake.notifications` holds each item in the language its member got |
| Drafts (Perseus) | The draft's fake team gets one group, “Office”, of two of its three fake members, that gives nothing: a draft that declares `members.groups` sees it, so a preview shows a group picker with something in it |
| MCP | Nothing new: agents operate the Chest; the permission appears in catalogue and proposal answers by its name, and the agents' API never broadcasts |
| No count bounds a team | **Decided by Paul, 6 October 2026: no fixed caps, the only limit is the server's.** No count on members, groups, a group's members, invitations, former members, nor on the members a call names (`notify`, `setMany`, `withdraw`, `except`): a call's body takes 64 KiB of texts and 64 bytes for each member who has the tool, so it may name the whole team. The team's capacity is its policy file, 32 MiB — measured, a member with two tools and a group takes 384 bytes: some 85,000 members —, parsed once per change (2 ms for 1,000 members, 12 ms for 10,000) and read in one pass per tool. Former members give way first; a change still beyond is refused: the owner or an admin reads “Your team is as large as this Chest can hold. Remove members who no longer need it to make room.”, an invited person “This Chest's team is full” and asks who invited them. Events and inboxes follow: a tool remembers every member it had; its outbox holds as many events as a full policy would; a broadcast changes one member's inbox at a time, never holding the others' bells |
| Contract | Contract **0.5**, SDK **0.5.0**: a tool that declares `members.groups` or calls `broadcast` declares `"chest": "0.5"`, and an older Chest says “This tool needs a newer version of your Chest” |

**Security.** Group and member identifiers are random and Chest-scoped; the
list is recomputed from the policy on every call, never from the tool. A group
answer filters its members through the same access rule as every members
call. The broadcast audience is computed from the policy at the call; texts
are cleaned exactly as `notify`'s (plain text, control and direction
characters removed) and every item carries the tool's icon and name. The
`members.groups` permission is checked by the Chest at each call and in each
assertion, and a version that loses it sees only the groups that give it at
once.

### Alternatives not chosen

- **Widen `members` to every group, no new permission** — changes what owners
  already approved, and a group's name can be sensitive (“Board”, “Leavers
  in March”).
- **The studio's top-level key `"groups": "read"`** — permissions live in
  `"capabilities"`; a key for one switch is a second place to read them.
- **Names without membership** — every studio use (Polls asking Sales, Wiki
  rights, Tasks sharing) needs “is this member in that group”.
- **The studio's `groups.all()`, `groups.members(id)`, `groups.of(member)`** —
  `groups.list` pages and `members.list({group})` already pages a group's
  members; `of()` repeats `member.groups` (and `members.get` past an
  overage).
- **Fixed caps: 16 groups, 128 members, 500 or 128 ids a call, 1,000
  recipients an hour** (the first build, 6 October) — refused by Paul: the
  only limit is the server's; every bound now grows with the team or is the
  team's capacity.
- **`group.changed`, `group.removed` events** — `member.updated` already says
  every membership change; names are resolved at render.
- **A broadcast quota of 30 an hour outside the recipients** (studio), and
  **100 items a member a day refused beyond** (the first build) — a refusal
  loses what a tool had to say; the pace folds it instead (Paul).
- **`{delivered: n}` as the answer** (studio) — tells the Chest's size to a
  tool that may not see its members.
- **`messages: {en: …}` with English required** (studio) — a French tool
  would have to write English; the base text is the tool's default, the
  translations the rest.
- **Groups intersected with roles** (“Sales managers”) — rarer than “Sales
  and the editors”; a tool that needs it lists the group and notifies.

### Paul's answers (6 October 2026)

1. **Hiding a group from tools: no** — every group is seen by a tool the
   owner approved `members.groups` for.
2. **The hourly quota beyond 128 members** — gone with the caps; no quota
   refuses a notification any more: a burst is folded (pace).
3. **Chest statuses as an audience: no** — the tool's roles say who does
   what in it.

## 8. What to build

| Where | Change |
|---|---|
| Chest | Member and group ids in the policy, `chest migrate` for existing Chests, tombstones; assertion v2; routes of § 3 and § 4 on the tool API; photo route by member id; inbox store; bell, panel, pills, profile switches; approval sentences; `/api/v1/inbox` |
| SDK 0.2.0 | `member` (new shape), `members`, `groups`, `badge`, `notify`, `testing`; README and AGENTS.md; vendored copies re-synced |
| MCP | `inbox` |
| Test bench, Forms | Test bench exercises every route; Forms keeps working (it reads only the role) |
| Proofs | VM proof: two tools, members with and without access, lookup of a former member, a muted tool, a revoked access removing items |
| Chest, § 7 | Capability `members.groups` (package, approval sentences en/fr, contract 0.5); the team's view of every group for a tool holding it (`groups`, `member.groups`, the assertion, `member.updated`); `POST /notifications/broadcast` and `translations` on the tool API and in drafts; the draft's group |
| SDK 0.5.0, § 7 | `members.groups` read through `groups.list()` and `member.groups`; `notifications.broadcast`, `translations`; the fake Chest's groups that give nothing and its broadcast |
| Test bench, § 7 | testweb declares `members.groups`, lists every group and broadcasts to one; the browser lab asserts a member outside the group gets nothing |

## 9. On the phone: the Chest installed, and push

**Specified 7 October 2026, approved by Paul the same day** (Paul: “it's good to have
your Chest on your phone and receive the notifications”). How the code does
it goes into `03_code/01_chest-by-argentic/docs/architecture.md`; done and
remaining in [status.md](../03_roadmap/status.md) (row PH).

### The Chest as an app

- **Every Chest's portal installs as an app**: its name is the
  organization's, its icon the Chest's (black symbol on white,
  `02_design/02_product/assets/chest-app-icon*`), black on white, a window of
  its own, opening on the home.
- **iPhone and iPad**: Safari → Share → Add to Home Screen. Profile →
  Notifications says so, only on an iPhone or an iPad and only while the
  Chest is not opened from the Home Screen. **Android, computers**: the
  browser offers to install it.
- **Nothing private stays on the device.** The app keeps no page and no
  answer of the Chest: its service worker caches nothing and is there only
  for push. Offline, the app shows the browser's own page.
- **A tool opens as on a computer.** A tool lives at its own address (its
  team host), never under the Chest's: an app holds one origin, and a tool
  inside the Chest's would break the isolation between them. From the
  installed app, a tool opens above it — on iPhone, a sheet with Done; on
  Android, a tab of the app — and closing it comes back to the Chest. Its
  session is the Chest's sign-in, as on a computer.
- **Every iPhone browser is WebKit.** The browser lab proves the journeys
  in WebKit under an iPhone's screen: sign-in (a sign-in page of any age,
  the six-digit code), the portal, Profile → Notifications, a tool on its
  team host, Perseus's page, the bell.

### Push, a way beside mail

**Profile → Notifications → Push on this device**: a switch per device —
each browser of each phone or computer is turned on by itself. On, the
browser asks the permission; off, this device receives nothing more, the
others keep theirs. Signing out turns it off for that device.

| Rule | As the mails | For push |
|---|---|---|
| What is sent | what reaches the inbox; a muted tool, nothing | the same |
| What is never sent | an item read in the Chest before, one sent before | the same, and what came before the device was turned on |
| News only | 24 hours | **1 hour**: a push is for now, the bell keeps the rest |
| A burst | one mail once it is over | **the first at once**, what comes within a minute gathered into the next push, a minute later: one push a minute at most |
| On the device | — | **one notification of the Chest at a time**: the next replaces it; the push service keeps only the newest for a device it cannot reach, 12 hours |
| Choice | the rhythm of the mails | **independent**, never changed silently: turning push on while every notification is emailed offers, once, “You'll get pushes on this device. Get emails as a daily summary instead?” — **Daily summary** or **Keep every email** |

**What a push shows** (Paul, 7 October 2026): **the tool and the
title** — “Leave · Camille asks for 3 days off” —, **never the text**;
several are counted — “Acme SAS · 3 new notifications” —; the Chest's own
requests under the organization. Tapping it opens the notification on its
tool's team host, or the Chest. Why: the lock screen shows it to whoever
holds the phone, and the title is what makes a push useful (“New
notification in Leave” alone would make everyone open the app to know
anything). The text stays in the Chest; on the way, the push is encrypted
end to end, so Apple, Google and Mozilla carry it without reading it. The
phone's own setting (iOS: Show Previews, When Unlocked) hides even the
title on a locked screen.

**iPhone and iPad: iOS 16.4 or later, and only for the Chest added to the
Home Screen and opened from there** (Apple's rule for every website). The
profile says so in place of the switch.

### How it is sent

- **From the Chest's server straight to the browser's push service**:
  Apple (`*.push.apple.com`), Google (`fcm.googleapis.com`, Chrome and
  Android), Mozilla (`*.push.services.mozilla.com`), Microsoft
  (`*.notify.windows.com`, Edge). Only these, over HTTPS, under the
  server's outbound guard (never an address of the server or of a private
  network); a subscription naming any other address is refused. Nothing goes
  through the central or Argentic. **Egress**: outbound HTTPS from the
  Chest's server, which its firewall allows (it filters what comes in).
- **The Chest's key** (VAPID, RFC 8292): one P-256 key pair per Chest, made
  by its server at its first start, kept private beside the inboxes and in
  the nightly backup — a restored Chest's subscriptions keep working.
- **Subscriptions** are kept per member and device with the member's inbox:
  removed when the member turns push off on that device or signs out there,
  when the push service says it no longer knows it (404, 410), and with the
  member when they leave.
- **The message** is encrypted for that browser alone (RFC 8291) and
  carries the tool, the title and the link, nothing else.

### Proven, and what Paul checks by hand

The encryption is checked against the example of RFC 8291 and the signature
as a push service checks it (Go tests); what is pushed, when, to which
device, and the devices forgotten or failing (Go tests); a laboratory's push
service receiving the real messages of the node, read with the device's
keys only (browser lab). A real phone receiving a real push cannot be
automated. **Paul's check on an iPhone (iOS 16.4+)**:

1. In Safari, open the Chest and sign in; Profile → Notifications says to
   add it to the Home Screen.
2. Share → Add to Home Screen; open the Chest from its icon (the
   organization's name under the Chest's icon) and sign in.
3. Profile → Notifications → Push on this device → Allow.
4. From a tool (or another member), get a notification; lock the phone: the
   tool and the title appear within a few seconds; several within a minute
   come as one “n new notifications”.
5. Tap it: the notification's page opens on the tool; Done comes back to
   the Chest.
6. Profile → Push on this device off: nothing more comes. Sign out on the
   phone: nothing more either.

### Paul's answers (7 October 2026)

1. **What a push shows**: the tool and the title, never the text.
2. **Signing out turns push off for that device**: yes.
3. **Push and mail**: independent, never changed silently. Turning push on
   while every notification is emailed offers the daily summary instead, in
   one quiet line under the switch — **Daily summary** sets the mails to once
   a day, **Keep every email** keeps them —, so that a member does not get
   every notification twice without choosing it.
