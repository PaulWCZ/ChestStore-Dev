# Members and notifications

**Specified 28 September 2026, approved by Paul.** Batch M (§ 1–3; § 6 for members and files) is
built; batch N (§ 4, § 5) is to build ([status.md](../03_roadmap/status.md)). This page fixes what a tool may know about
the team and how it may call a member's attention. How it is coded goes, once
built, into `03_code/01_chest-by-argentic/docs/architecture.md`.

Out of scope here:

- **Email.** A tool sending mail is a separate decision, not in this spec
  (probably the mail connector, batch G).
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
the name: `{id, status: "erased"}`, rendered “Former member”.

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
  groups: string[];      // ids of the groups that give this member access to this tool
  email?: string;        // only with "members.email"
};
```

Assertion claims: `sub` (member id), `given_name`, `family_name`, `name`,
`picture`, `role`, `admin`, `builder`, `groups`, and `email` only with the
permission. Everything else (`iss`, `aud`, 60 s life, HS256 under
`CHEST_TOKEN`) is unchanged.

## 3. Permission `members`

```json
{ "capabilities": ["members", "members.email"] }
```

| Capability | Sentence at approval |
|---|---|
| `members` | “Sees the name, photo, role and groups of the members who have access to it.” |
| `members.email` | “Sees the email address of the members who have access to it.” (its own line; requires `members`) |

Read-only. Approved like `database`; adding either to a later version is a new
permission (owner or admin approves).

**Who a tool sees:** exactly the members that have access to it at the time of
the call (`Team.Access`: direct grant, group, open to all, plus owner, admins
and its builders, who always get in). Recomputed on every call. A member
without access is indistinguishable from an id that does not exist.

### API

Through `CHEST_API` (the instance is the identity, as for files). SDK import:
`@argentic/chest-sdk/members`.

| SDK | Chest route | Answer | Notes |
|---|---|---|---|
| `members.list({after?, limit?, q?, role?, group?})` | `GET /members?after=&limit=&q=&role=&group=` | `{members: Member[], next: string \| null}` | Ordered by name then id; `limit` 100 by default, 500 at most; `next` is an opaque cursor; `q` matches the start of first name, last name or name (and email with `members.email`), case- and accent-insensitive |
| `members.get(id)` | `GET /members/{id}` | `Member`, or `null` (404 `member_not_found`) | 404 also for a member without access: no probing |
| `members.lookup(ids)` | `POST /members/lookup {ids}` | `{members: Member[], former: {id, name?, status}[], unknown: string[]}` | 200 ids at most per call; the SDK splits bigger lists. In-process cache: 60 s, 5,000 entries, cleared by `member.updated` when events exist |
| `groups.list()` | `GET /groups` | `{groups: {id, name, members: string[]}[]}` | Only groups that hold an access grant on this tool |

`Member` in these answers has the shape of § 2 (`groups` limited to groups that
give access to this tool). Errors: 403 `capability_not_granted`, 400
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

Two primitives, both inside the Chest (no email, no push to a phone: separate
decisions).

| SDK | Chest route | Effect |
|---|---|---|
| `badge.set(memberId, n)` | `PUT /badges/{memberId} {count}` | Idempotent state: `n` from 0 to 9,999, 0 clears. Shown as a count pill on the tool's tile in the Chest home and on its row in the tools list, for that member only (“99+” beyond 99) |
| `badge.setMany([{memberId, count}])` | `PUT /badges {badges}` | Up to 500 at once |
| `notify(memberIds, {title, body?, path?, key?})` | `POST /notifications` | One inbox item per recipient |
| `notifications.withdraw(key, memberIds?)` | `POST /notifications/withdraw` | Removes the items with that key (all recipients, or those named): the task is done, the item goes |

`notify` fields:

| Field | Rule |
|---|---|
| `memberIds` | 1 to 500 ids; the Chest keeps those with access to the tool |
| `title` | Plain text, 1 to 80 characters |
| `body` | Plain text, 280 characters at most |
| `path` | A path of the tool's private part, starting with `/chest`, 512 characters at most; the Chest builds the link on the tool's team host. No other host, no scheme, no `//`. Absent: the tool's `/chest` |
| `key` | `[a-z0-9._:-]{1,64}`. Same tool, member and key: the item is **replaced** (new text, moved to the top, unread again), never duplicated |

Answer: `{delivered: string[], skipped: string[]}`; `skipped` holds unknown ids
and members without access. A muted tool counts as delivered: the tool does not
learn who muted it.

Plain text only: control characters are removed, nothing is interpreted as
Markdown or HTML, line breaks are kept in `body`. Every item shows the tool's
icon and title beside it, so a tool cannot pass for the Chest or another tool.

**Quotas** (per tool): 1,000 recipients an hour, 100 items per member per day,
badges 600 writes a minute; 429 `quota_exceeded` with `Retry-After`. Inbox: 500
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
| `member.updated` | `{id, changed: ["name" \| "photo" \| "role" \| "groups" \| "email"]}` | Something the tool can see changed (`email` only with `members.email`) |
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
| `fakeChest({members?, groups?, capabilities?, files?})` | An in-process HTTP server on `127.0.0.1` that sets `CHEST_API`, `CHEST_TOKEN`, `CHEST_TOOL` and answers members, groups, badges, notifications and files with the same limits and errors as a Chest; a capability left out answers 403 |
| `fake.notifications`, `fake.badges`, `fake.files` | What the tool sent, to assert on |
| `fake.emit(event)` | Delivers a signed event to the tool (once events exist) |
| `fake.close()` | Stops it and restores the environment |

## 7. What to build

| Where | Change |
|---|---|
| Chest | Member and group ids in the policy, `chest migrate` for existing Chests, tombstones; assertion v2; routes of § 3 and § 4 on the tool API; photo route by member id; inbox store; bell, panel, pills, profile switches; approval sentences; `/api/v1/inbox` |
| SDK 0.2.0 | `member` (new shape), `members`, `groups`, `badge`, `notify`, `testing`; README and AGENTS.md; vendored copies re-synced |
| MCP | `inbox` |
| Test bench, Forms | Test bench exercises every route; Forms keeps working (it reads only the role) |
| Proofs | VM proof: two tools, members with and without access, lookup of a former member, a muted tool, a revoked access removing items |
