# Realtime

**Decided by Paul on 6 October 2026: a realtime service of the Chest
(option B below); on 7 October: no memory set aside, nothing lost however
long a page is away, no hourly cut, no channels for visitors. Built 7 October in
batch RT, not merged, not deployed** ([status.md](../03_roadmap/status.md)).
How the code does it goes into
`03_code/01_chest-by-argentic/docs/architecture.md` (Server tools,
“Realtime”); the SDK's side into its README (`realtime`,
`realtime/client`).

Paul's question (29 September, 6 October): *being able to do realtime would
be great for an internal Slack-like messaging tool; it is essential to sell
a server that replaces subscriptions to other SaaS.* Today the tool front
answers 501 to any WebSocket and the studio's tools poll every 20–45 s,
which also keeps a tool awake as long as one tab is open. This page decides
how a tool gets live updates, and shows a Slack-like tool built on it.

Related: [Members and notifications](members-and-notifications.md) (badges,
inbox, lifecycle events), [Fleet monitoring](fleet-monitoring.md#sleeping-tools)
(sleeping tools), [Perseus Code](perseus-build.md) (draft hosts),
[Tool storage](tool-storage.md), [Security](security.md), [Sealed data](sealed-data.md#realtime) (what a channel, a feed and the backfill do with sealed values).

## The decision

| | (a) Pass-through | (b) Chest realtime service | Chosen |
|---|---|---|---|
| What | The front relays WebSocket and SSE to the tool's own socket server, the member asserted at the upgrade | The Chest holds every connection: channels, broadcast, presence, database-change feeds, through the SDK | **(b) now; (a) later** |
| Socket code in the tool | All of it (server, heartbeat, presence, reconnect, fan-out) | None: a manifest key and two SDK calls | (b) |
| Sleeping tools | An open socket keeps the tool awake: a chat open all day never sleeps | The tool sleeps while the Chest holds the connections; it wakes only to handle a write | (b) |
| Redeploy, crash, restart of the tool | Every socket drops | Nothing drops | (b) |
| Memory on a 4 GB server | One socket in the node **and** one in the tool's 256 MiB, per member | One connection in the node per member and tool; measured below | (b) |
| Revocation | The Chest must find and cut the socket inside a tool it cannot see | The Chest owns the socket: cut at once | (b) |
| What it cannot do | — | A protocol of the tool's own (binary CRDT sync, a game server, a dev server's hot reload) | (a), later |

**Later: pass-through (a)**, only when a tool needs a protocol of its own:
a capability approved at install with the warning *“This tool stays awake
while someone has it open.”*, its sockets held in the server's memory as
the Chest's are. Not built now.

**Never: public channels for visitors.** Chest realtime is for members only:
no visitor, no outside account ever connects to it (a chat tool's “public
channel”, open to every member, is an ordinary channel). Realtime on a tool's public part,
if a tool ever needs it, is the tool's own business — its own socket server
behind pass-through, on its public host —, never a channel of the Chest.

## Research, in short

| Product | Model | What we take — or avoid |
|---|---|---|
| **Supabase Realtime** | Broadcast, Presence, Postgres Changes on one socket; private channels authorised by RLS on `realtime.messages`, checked at join and cached until reconnect; Postgres Changes checks every change against every subscriber's RLS, single-threaded — Supabase now advises “Broadcast from Database” triggers for scale | One endpoint, channels multiplexed, server-side publish, authorisation at join. Database feeds by **trigger and channel**, never per-subscriber row checks. Avoid: access kept until the token expires |
| **Slack** | One WebSocket per client to a gateway; messages are written through the web API, persisted, then fanned out by channel servers; on reconnect the client asks the API for what it missed | Write over HTTP to the tool, receive over the socket; the database is the truth, the socket a hint |
| **Liveblocks** | Rooms; the app's auth endpoint or room permissions kept by Liveblocks; presence and broadcast throttled (~100 ms) | Permissions the platform keeps, so joins need no app round trip; throttled ephemeral messages |
| **Pusher / Ably** | `private-` and `presence-` channels authorised by the app's endpoint (Pusher) or capability tokens (Ably); Ably keeps 2 minutes of connection state for recovery | Presence as a channel property; **a short recovery window** replays what a reconnect missed |
| **Cloudflare Durable Objects** | One object per room; with WebSocket Hibernation the object leaves memory while its sockets stay connected, and wakes on a message | Exactly our sleeping tool: **the edge holds the socket, the code sleeps** |
| **Phoenix Channels** | `topic:subtopic`, `join/3` authorises, at-most-once, clients catch up by last id | Topic names with a prefix; at-most-once stated plainly; catch-up from the database |
| **Vercel** | Serverless functions hold no WebSocket; Vercel sends builders to Pusher, Ably or Liveblocks | A platform that sleeps must hold the sockets itself, or buy them: (b) |
| **Railway** | Long-running containers, WebSockets through its proxy; “app sleeping” never sleeps a service with an open connection | What (a) would give us, with the same sleep problem |

## What the builder writes

```jsonc
// chest.json
{
  "capabilities": ["database", "realtime"],
  "realtime": {
    "channels": [
      { "name": "everyone", "presence": true },
      { "name": "room:{id}", "join": { "table": "room_members", "key": "room_id", "member": "member_id" }, "send": true, "presence": true },
      { "name": "inbox:{member}" }
    ],
    "feeds": [
      { "table": "messages", "channel": "room:{room_id}", "columns": ["id", "room_id", "author", "text", "created_at"] }
    ]
  }
}
```

```ts
// In the browser, on a /chest page of the tool (no socket code, no token)
import { connect } from "@argentic/chest-sdk/realtime/client";

const live = connect();                                  // wss://<tool>-chest…/_chest/realtime
const room = live.channel("room:42");
room.on("messages.insert", row => show(row));            // the Chest's events: a feed's row as written
room.peers.on("typing", (_, from) => showTyping(from));  // the members' messages, apart: from set by the Chest
room.peers.send("typing");                               // ephemeral, to the others (no dot in its name)
room.presence.track({ active: true });
live.focus("room:42");                                   // the conversation shown: the tool's to read, nobody else's
room.onResync(() => refetchAfter(lastId));               // only beyond a week away
live.on("closed", reason => { if (reason === "access_removed") showAccessRemoved(); });
```

```ts
// On the server, only for what is not a row: a direct hint, who is online
import * as realtime from "@argentic/chest-sdk/realtime";
await realtime.publish("everyone", "rooms.changed", { id });
const { online, watching } = await realtime.online(roomMemberIds, { channel: "room:42" });
// notify those not online, badge those online but not watching room:42
```

The tool writes rows as it always does; the Chest turns them into live
events. Nothing to run, nothing to keep awake.

## Channels and who joins them

A channel is a name `[a-z0-9_-]` segments joined by `:`, 128 characters at
most, scoped to its tool (tool A's `everyone` is not tool B's). The manifest
declares the channels a tool has, as **patterns**, each with its rule; a name
no pattern matches does not exist. Up to 32 patterns.

| Pattern | Matches |
|---|---|
| `everyone` | that name |
| `room:{id}` | `room:` and one segment; the segment is the key of a membership table (below) |
| `inbox:{member}` | `inbox:` and the joining member's own id only: a private lane per member |
| `board:*` | `board:` and any one segment, under the pattern's rule |

| Key | Values | Rule |
|---|---|---|
| `join` | absent (default): every member who has the tool · a list of the tool's roles (`["manager"]`) · a membership table `{table, key, member}` | Checked by the Chest **at every join**, without the tool |
| `send` | `false` (default) · `true` | Whoever may join may send ephemeral messages (typing, cursors) on it; re-checked **at every message** |
| `presence` | `false` (default) · `true` | Whoever joins may appear in its presence |

**Membership tables** keep the tool's rule in the tool's own data: `room:42`
may be joined by member `m` when `select 1 from room_members where room_id =
'42' and member_id = 'm'` finds a row. The Chest asks the tool's database
directly (read-only, the tool's console reader role), never the tool's
process: a join works while the tool sleeps or redeploys. When a row of
`room_members` is deleted or changed, the Chest's trigger tells it at once,
and that member is **removed from the channel immediately** (`kicked`).
Requires `database`.

The tool's own server publishes to any channel it declares; its rules apply
to members' browsers only.

### Authorisation alternatives set aside

| Alternative | Why not |
|---|---|
| **Tokens the tool signs** (Pusher, Ably, Liveblocks access tokens) | The tool must be awake to mint one at every connection and reconnect; a token stays valid after a member is removed from a channel unless the Chest also keeps kick lists — two truths |
| **An authorize hook** (`POST /chest-realtime/authorize`, Phoenix's `join/3`) | Wakes a sleeping tool at every join, fails while it redeploys; a cache makes revocation late |
| **Lists the tool sets through the API** (`grant`, `revoke`) | Duplicates the tool's membership table in the Chest; the tool must keep both in step, and a missed call is a leak |
| **Row-level filters per subscriber** (Supabase Postgres Changes) | One check per change and per subscriber: the cost Supabase itself advises against |

Membership tables keep one truth (the tool's rows), need no awake tool,
and revoke at the instant the row goes.

## Database-change feeds

A feed turns writes to a table into channel events: `<table>.insert`,
`<table>.update`, `<table>.delete`, the payload being the declared
`columns` of the row (the old row for a delete).

- At each install, update and start of a version (and each draft
  migration), after the migrations, the Chest installs in the tool's
  database one trigger per feed and membership table, in a schema of its
  own (`chest_realtime`), replacing those of the version before. The tool
  writes no SQL for it.
- The trigger writes the row's event in the **change log** of the tool's
  database (`chest_realtime.changes`: its place `pos`, the channel — from
  the template, the row's `room_id` gives `room:42` —, the event, the
  columns) and runs `pg_notify` with the same. PostgreSQL delivers it **at
  commit**: a rolled-back write sends nothing. The places follow the
  commits (one transaction lock taken by the trigger until the commit:
  writes to a tool's fed tables commit one after the other), so a page
  replayed from a place never misses a row committed later under a smaller
  one. The log keeps a week (pruned every 512 rows); it holds the declared
  columns as the tool stored them — a sealed value stays sealed — and is
  backed up with the tool's database.
- The Chest listens on the tool's database only while someone is connected
  to the tool; a row of more than 7,000 bytes is sent as `{id}` only
  (`partial: true`) and the page fetches it.
- `columns` must name the primary key first; never list a secret or a
  column a member of the channel may not read: the channel's rule is the
  only filter.

A feed is the right tool for “what was written”; `realtime.publish` for
what is not a row (a hint, a computed count, “rooms changed”).

## The server API (`@argentic/chest-sdk/realtime`)

Through `CHEST_API`, as every capability: the instance is the identity.

| SDK | Chest route | Answer |
|---|---|---|
| `publish(channel, event, payload)` | `POST /realtime/publish` | `{seq}`; the channel must match a declared pattern; `payload` JSON, 64 KiB at most |
| `send(memberIds, event, payload)` | `POST /realtime/send` | `{reached}`: the members it reached on at least one connection; the others are not online here |
| `online(memberIds, {channel?})` | `POST /realtime/online` | `{online, watching}`: members with at least one connection to this tool, and of them those with a page showing `channel` (its focus) — what decides whom to `notify` and whom to leave alone |
| `presence(channel)` | `GET /realtime/presence?channel=` | `{members: [{id, state}]}` |

Errors: 403 `capability_not_granted`, 400 `invalid_channel` (no pattern
matches) / `invalid_event` / `invalid_body`, 413 `too_large`, 503
`unavailable`. `event` is `[a-z0-9._-]{1,64}`. A publish is never refused
for capacity: a page whose message the server's memory cannot hold is
closed to come back (below).

## The browser client (`@argentic/chest-sdk/realtime/client`)

A module for the browser (no `node:` import), the only part of the SDK that
runs there. `connect()` opens `/_chest/realtime` on the page's own host —
the session cookie is the identity — and:

- joins channels by name (`live.channel(name)`), with their presence;
- reconnects by itself (full-jitter backoff 0.5 s → 30 s; at once when the
  page comes back to the foreground, from the back-forward cache or when
  the network returns; nothing tried while the browser says it is
  offline), re-joins its channels **with the last `seq` and `pos` it saw**:
  the Chest replays what was missed — from memory within 2 minutes, from
  the change log after any absence up to a week — and the client drops
  what it already had (by `pos`): **no reload, no gap, nothing twice**.
  `resync` comes only beyond a week, or on a channel no feed writes once
  its 2 minutes are gone;
- renews the session every 5 minutes through the endpoint (a plain `GET`,
  below): no hourly cut, nothing for the page to do;
- says `status(false)` only after 3 seconds without a connection, and
  `status(true)` only after a `false`: a quick reconnect never shows;
- a full server is waited for quietly (`Retry-After`), never shown as an
  error: the page goes on working over HTTP meanwhile;
- stops on `access_removed` and emits `closed`; on `signed_out` (the
  renewal or a reconnect refused 401: the person is signed out at the
  provider, or away longer than the session) emits `closed` too;
- sends an application ping every 25 s, so a dead network is noticed on a
  phone.

### Wire protocol (other languages, tests)

Subprotocol `chest-realtime.v1`, JSON text frames, one object each; `ref`
pairs a reply with its request.

| Direction | Frames |
|---|---|
| Browser → Chest | `join {ref, ch, since?: {epoch, seq, pos?}}` · `leave {ref, ch}` · `send {ref, ch, event, payload}` (`event` without a dot) · `track {ref, ch, state}` · `focus {ref, ch}` (a joined channel, or `""`) · `ping {ref}` |
| Chest → browser | `hello {epoch, member}` · `ok {ref, seq, pos?, presence?, resync?}` · `error {ref, code}` · `msg {ch, event, payload, seq?, pos?, partial?}` (the tool's and the Chest's events only) · `peer {ch, event, payload, from}` (a member's send) · `direct {event, payload}` · `presence {ch, joins, leaves}` · `kicked {ch}` |

`pos` is a row's place in the change log: on every row of a feed, on the
`ok` of a channel a feed writes (the head at a fresh join, the page's own
place at a replayed one); the rows replayed from the log follow that `ok`
with `pos` and no `seq`. A page ignores a row whose `pos` it has passed.

`GET /_chest/realtime` without upgrading renews the session: 204, 401
signed out, 403 access removed, 404 no realtime, 503 with `Retry-After`
(the provider did not answer, or the server has no room for a connection
now).

Close codes: `1008` with reason `access_removed` (do not reconnect) or
`session_ended` (not renewed in time: renew, then reconnect); `1013` (this
connection fell too far behind, or the server's memory could not hold a
message for it: reconnect and replay); `1009` (a frame too large); `1001`
(the Chest restarts).

## Semantics

| | Decision |
|---|---|
| Delivery | **Rows: exactly once, whatever the absence** — live, else replayed from memory or from the change log, the page dropping what it has (`pos`) — up to a week; beyond, `resync`. **Tool publishes and sends**: at most once, hints kept 2 minutes |
| Order | Per channel, the order the Chest accepted publishes and the database committed rows; each message carries `seq`, increasing per channel within an `epoch` (the node's run); a row carries its `pos`, increasing in commit order per tool |
| Backfill and replay | Each channel keeps its recent messages in memory, **2 minutes at most**, while the server's memory holds them; a re-join with `since` replays the missed ones in order from there; else, on a channel a feed writes, from the change log after the page's `pos` — across another epoch (a restart of the Chest, its database session lost) —, what reaches the channel meanwhile held for the page and sent after, never twice; `resync: true` only beyond the log's week, or on a channel no feed writes |
| Self | A member's own `send` is not echoed back; a feed or a `publish` reaches every subscriber, the author included (the page deduplicates by id) |
| Presence | Per channel, per **member** (merged across tabs and devices), seen by every member of the channel — what a member must not see goes in the focus, never in presence; `state` JSON ≤ 1 KiB, set at most 5 times in 10 s; a leave is announced 5 s after the member's last connection left, so that a reload does not flicker |
| Ephemeral sends | 4 KiB at most; 20 a second per connection (burst 40): a person types, a script floods |
| Joins | No fixed number: each channel joined holds 512 bytes of the server's memory (measured about 430); beyond the memory, `error full`, the page joins again later |
| Namespaces | The Chest's and the tool's events (`msg`: feed rows, publishes, dotted names allowed) and the members' messages (`peer`, `from` set by the Chest, names without a dot) never share a name nor an API: a member cannot send `messages.delete`, and a page cannot take a member's message for a row |
| Focus | Each page may say which joined channel it shows (`focus`); the client clears it while the page is hidden. Never sent to another page: the tool reads it (`online(…, {channel})` → `watching`) to notify a member in the tool but in another conversation |

## Identity, revocation

- **At connect** (the upgrade on `/_chest/realtime` of the team host): TLS,
  the exact host, exactly one session cookie of that host, the member still
  in the Chest **and** given the tool now, `Origin` exactly the team host
  (a WebSocket is not protected by CORS: this check is what stops another
  site's page from riding the member's cookie), `Sec-WebSocket-Version: 13`,
  the subprotocol `chest-realtime.v1`, the capability `realtime` held by the
  version in service, room in the server's memory. 401 without a session
  (never a sign-in redirect), 403, 404, 503 `Retry-After` otherwise. The
  tool is never called.
- **At join**: the channel's pattern and rule; **at each send**: the rule
  again.
- **Revocation at once**: every change of the team (a member removed, access
  taken back, a role changed, the tool removed) re-checks every open
  connection of the Chest within a second: `1008 access_removed` for a member
  who lost the tool; a channel whose role rule no longer holds is left with
  `kicked`. A membership row deleted kicks at once (trigger). A new version
  that drops `realtime` closes its connections; one that drops a pattern
  kicks its channels.
- **No hourly cut**: a connected page renews its session every 5 minutes
  through the endpoint (`GET` without upgrading). Each renewal goes through
  the portal's renewal — the identity renewed with the provider, which must
  still sign the person in — and slides the session's deadline an hour
  ahead, the cookie written again; the page's open connections live on with
  it, nothing reconnects. A session stops only when the person is signed
  out (the provider refuses: 401, `closed signed_out`) or the page stops
  renewing it (a connection whose session's end passed is closed `1008
  session_ended`, a safety sweep every minute). A provider that does not
  answer is 503, tried again: never a sign-out. A draft's session (12
  hours) is not renewed.
- **A page that keeps failing to connect** asks the endpoint without
  upgrading — the same renewal —: 204 (try again), 401 (signed out), 403
  (access removed), 503 `Retry-After` (wait) — a browser never sees a
  refused handshake's status.
- **Away longer than the session, or the Chest restarted** (20 minutes
  without the page renewing it — a laptop closed, a phone off —, or the
  sessions, held in memory, gone with a restart): the client says
  `signed_out`; the page keeps what is being written and reloads, and the
  provider, which still signs the person in, brings them back without a
  word nor a click (relogin.spec.ts, case (a), for every page of the
  Chest; realtime.spec.ts after a node restart). What the person sees: the
  page reloading once, their draft still there. Only once the provider no
  longer signs them in (its own session ended) do they type their password.

## Capacity

**No memory set aside** (Paul, 7 October): realtime is held in the
server's memory exactly as the tools awake and Perseus Code's workbenches
are, and refused only when the server is truly full.

- **Measured** (`TestMemoryPerConnection` of `chest/realtime` and
  `common/front`: 400 idle connections over TLS from another process, each
  joined to two channels and pinged, Go heap and stacks): **at rest** — no
  page connected — the service holds no goroutine but its one ticker, and a
  space per tool a few hundred bytes; **each connection about 21 KiB in the
  node** (one goroutine reading it; its writer runs only while frames wait;
  the server's request buffers let go at the upgrade) **and about 31 KiB in
  `chest front`** (two goroutines and two 8 KiB buffers), counted 24 + 32 =
  56 KiB. 1,000 live connections take 55 MiB, beside a tool's 256. The
  kernel's socket memory of an idle connection is a few KiB more, outside
  the count.
- **Held with the tools**: each connection's 56 KiB, the messages waiting
  toward pages and those kept for backfill are counted in the memory the
  node's tools awake and workbenches hold (`toolmemory.Budget`). A new
  connection is admitted as a tool's wake is: when it does not fit, the
  least recently used idle tools are put to sleep for it; it is refused
  only when nothing more can sleep — counted with the wakes refused, which
  raises the owner's **capacity alert** as anywhere else. A message is held
  while it fits; a page the server cannot hold a message for is closed
  `1013` and comes back to its replay; a channel kept beyond the memory
  forgets its oldest first (the change log still has the rows).
- **The user never sees it**: a refused connection is 503 `Retry-After: 5`;
  the client waits quietly and tries again; the page keeps working over
  HTTP meanwhile; `status(false)` only after 3 s.
- **Fan-out and backpressure**: a message is encoded once and shared by
  every queue; a connection's queue holds 4 of the largest messages
  (256 KiB): a page further behind is closed `1013` and replays. A
  protocol bound on one slow reader, not a share of the server.
- **`chest front`**, the TLS relay every connection crosses, lets through
  512 connections plus as many as the server's whole memory could hold: it
  cannot tell a live connection from another, the node decides which it
  keeps.
- Refused: 503 at connect, one line a minute in the tool's Logs (“Live
  connections refused: the server's memory is full”).

## Sleeping tools

A connection to `/_chest/realtime` is the Chest's, never the tool's: it
does not count as a visit. A Slack-like tool open in 40 browsers all day
sleeps 15 minutes after its last write; typing, presence and joins go on
without it; the next message posted wakes it (≈ 0.5 s), its row's feed
reaches everyone. Polling every 20 s, as the studio's tools do, keeps a tool
awake as long as one tab is open — realtime replaces it.

While a tool with feeds or membership tables has connections, the Chest
keeps one session on the tools database (to listen, to check joins and to
read the change log); none when nobody is connected. This keeps the tools
database awake while a page is connected (accepted by Paul, 7 October).

## Drafts (Perseus Code)

A draft host (`<project>--build-chest…`) serves `/_chest/realtime` with the
same code: the identity is the fake member the builder views the draft as
(a page connected keeps the one it connected as), the rules are those its
`chest.json` declared at its dev server's start — as its routes are —,
feeds and membership tables come from the draft's preview database
(installed after its migrations, as for a version), with its own change
log, held in the server's memory the same way. Revocation: the
builder who loses the project is cut at once. What works in the preview
works once published.

## Networks, devices

| | |
|---|---|
| HTTP/2 | Browsers open WebSockets over HTTP/1.1, one TLS connection each; the Chest does not announce WebSockets over HTTP/2 (RFC 8441, off in Go by default) |
| Proxies, Cloudflare | The Chest pings every connection every 30 s and expects a sign of life within 75 s: an idle socket survives proxies that cut at 100 s (Cloudflare) and is noticed dead behind one that never closes |
| `chest front` | Relays TLS bytes: its 5-minute idle rule never fires on a pinged connection |
| Phone asleep, laptop lid, network change | The socket dies or hangs; the client notices (no answer to its ping, the browser going offline, the page shown again or restored from the back-forward cache), reconnects at once when the network is back, and is replayed what it missed: nothing shows but the rows arriving |
| SSE | Not offered: one WebSocket carries both directions; SSE belongs to pass-through, later |

## Security

- Cross-tool isolation: the endpoint is on the tool's own host (another
  tool's cookie means nothing there), channel names are per tool, the API
  publishes only into the tool's own declared patterns.
- Unforgeable sender: `from` on sends and presence is the session's member
  id, set by the Chest.
- Content is opaque: never logged, never interpreted; the page escapes it
  (the SDK README says so).
- A membership table is read as the tool's console reader (read-only), by
  key and member only, with bound parameters.

## Logs and what the owner sees

| Where | What |
|---|---|
| The tool's Logs (Chest lines) | Connections refused for want of memory, connections closed to come back (fallen behind, or memory full): one line a minute per kind |
| Settings → Server → Details | “Live connections: 37 · 2.0 MiB” (the owner's alone, never in the report the central receives); the memory is in what the Chest reserves; a refusal counts in “Wakes impossible for want of memory” and raises the capacity alert |
| Node journal | Counts only, never a payload, never a member |

## A Slack-like tool, end to end

**Manifest**: `"capabilities": ["database", "members", "notifications",
"realtime"]`, the `realtime` key above. Tables: `rooms(id, name, private)`,
`room_members(room_id, member_id)`, `messages(id, room_id, author, text,
created_at)`, `reads(room_id, member_id, last_read)`; direct messages are
private rooms of two. Member ids, never copied names.

1. **Opening `/chest`** wakes the tool if it sleeps: the page renders the
   member's rooms with unread counts (`reads`) and the last 50 messages of
   the open room, names from `members.lookup`, the organisation name from
   `chest.organization`.
2. **Connecting**: `connect()`; the page joins `room:<id>` for each of the
   member's rooms, `inbox:<member>` and `everyone` (presence `{status:
   "active"}`): the Chest checks `room_members` for each room, the rest by
   pattern.
3. **Posting**: `POST /chest/api/rooms/42/messages` → `insert into messages`
   → at commit, `messages.insert` reaches everyone in `room:42` in well
   under a second; the author's page shows it once (by id).
4. **Typing**: `room.peers.send("typing")` at most every 2 s; the others show
   “Camille is typing…” for 5 s. The tool is not involved.
5. **Online dots**: presence of `everyone`, a filled or hollow dot (black and
   white).
6. **Unread and offline**: on each message the tool asks
   `realtime.online(roomMembers, {channel: "room:42"})`: those not online
   get a `notify` (key `room:42`, replaced rather than stacked) and their
   badge; those online but not `watching` room 42 — in the tool, on another
   conversation, or its tab hidden — get an unread count on their inbox
   lane (`inbox:<id>`); those watching it, nothing. Reading the room
   withdraws it.
7. **Adding someone** to a private room: insert into `room_members`, then
   `realtime.publish("inbox:<their id>", "rooms.changed", {id})`; their page
   joins. **Removing** them: delete the row — the Chest kicks them from
   `room:42` at that instant.
8. **Asleep**: nobody posts for 15 minutes, the tool sleeps; sockets,
   typing and presence go on; the next post wakes it.
9. **Reconnects**: a phone back after an hour in a pocket re-joins with its
   last `seq` and `pos`: every message written meanwhile arrives, once, in
   order, from the change log — the tool stays asleep, nothing reloads.
   Only beyond a week: `resync` → `GET /chest/api/rooms/42/messages?after=<last id>`.
10. **All day open**: the page renews its session every 5 minutes: no
    reload at the hour, no sign-in while the person is signed in.
11. **Redeploy**: nothing happens to the open pages.
12. **Access taken back** in Team: the socket closes `access_removed` within
    a second; the page shows the Chest's sentence.
13. **In Perseus Code**: the same tool in its preview, the builder viewing it
    as Alex Morgan in one tab and Sam Taylor in another, chats with itself.

What it costs: one connection per open device (~56 KiB), nothing in the
tool while nobody writes.

## Failure modes

| Failure | What happens |
|---|---|
| Tool redeployed, crashed, asleep | Nothing for the connections; publishes and feeds resume when it runs |
| Node restarted (Chest update) | Connections drop; clients reconnect with backoff; new `epoch` → replayed from the change log. The portal's sessions are in memory: a restart signs everyone out of the team hosts (as for every page), the client says `signed_out` |
| Server full | Idle tools sleep first; then 503 at connect, waited quietly by the client, a Logs line, the capacity alert; open connections untouched |
| A member's network is slow | Their queue fills, `1013`, they reconnect and replay |
| A tool publishes in a loop | Its pages fall behind and are closed `1013`, then replay; the server's memory, not a share, bounds it |
| Access revoked while a message is in flight | The close comes before any later delivery |
| The tools database is down | Joins of membership-table channels answer `error unavailable`; feeds pause; other channels work. Once the session on it is back, the space starts a new epoch and closes its pages `1013`: they come back and are replayed from the change log |
| The provider does not answer a renewal | 503, the client tries again later; the connection stays until its session's end |

## Testing

- **Go**: the WebSocket framing (handshake, masking, fragments, sizes,
  pings); the hub (patterns, rules, membership checks, kicks, presence merge
  and delayed leave, `seq`, backfill, replay from the change log after ten
  minutes away and across a new epoch with a row committed during the
  replay, `resync` beyond the log, queues and `1013`, memory held in the
  server's room, renewal, revocation sweeps); the node's room (a
  connection puts an idle tool to sleep, is refused only when full,
  counted); the endpoint's checks (Origin, session, access, subprotocol,
  renewal, full server); the session's renewal and `Unanswered`; the
  triggers and the change log on a real PostgreSQL 17 (places in commit
  order, read back by channel, pruning); memory per connection.
- **SDK**: `realtime` against a fake Chest; the browser client against a
  fake hub with a change log and a clock: a 10-minute disconnect replays
  every row once and in order with no reload, memory replay within 2
  minutes, `resync` beyond a week, renewal every 5 minutes and
  `signed_out` on 401, a full server waited quietly, no status flicker on
  a quick reconnect, visibility, `online` and `pageshow` handled.
- **Browser proof** (`realtime.spec.ts`, VM): two members chat through the
  test bench (feed, typing, presence); the owner's browser offline 2 min
  10 s while bob writes, then back: the three messages arrive once and in
  order, no reload, no call to the tool; a membership row deleted kicks;
  access taken back closes the socket; the same in a Perseus draft
  preview.

## Decided by Paul on 7 October

1. **No arbitrary limit**: no share of memory; each connection's measured
   cost held with the tools awake, refused only when the server is truly
   full, the user never feeling it, the owner seeing the capacity alert.
2. **Stable without the user ever feeling a problem**: the session renewed
   on the open connection (no hourly cut); any absence replayed from the
   change log with no loss, no duplicate, no reload; phone sleep, network
   change and laptop lid handled.
3. **No public channels, no outside visitors** on Chest realtime (members
   only); a tool's public part does its own realtime if it ever needs it.
4. **The tools database stays awake** while a page is connected.

## Open questions for Paul (defaults applied)

1. **Pass-through (a)** for a tool's own protocol (co-editing with Yjs,
   PB3's hot reload of a dev server, realtime on a public part). *Default:
   later, approved at install with “stays awake”; PB3 reloads the preview
   frame after each turn instead.*
2. **Away longer than a session, or a Chest restart**: the page reloads
   once, by itself, and the provider signs the person in again without a
   click while its own session lasts; the draft is kept. Proven in the VM.
   *Default (Paul, 7 October: sign-in is never a problem): kept.*
3. **Change log kept a week**. *Default (Paul, 7 October): a week.*
