# Events between tools

**Specified 6 October 2026; built 7 October for Paul's review** (Chest PR
#269, Chest-SDK PR #28) (batch A,
“Automations”, in [status.md](../03_roadmap/status.md)). How the code does it
goes into `03_code/01_chest-by-argentic/docs/architecture.md` (“Server
tools”, “Events between tools”); the SDK's side in its README (`events`).
Related: [Members and notifications](members-and-notifications.md#5-member-lifecycle-events)
(the members' lifecycle events, whose delivery engine this reuses),
[Scheduled tasks](scheduled-tasks.md) (the other signed delivery),
[Fleet monitoring](fleet-monitoring.md#sleeping-tools) (tools asleep),
[Perseus Code](perseus-build.md), [Security](security.md).

One tool reacts to what happens in another, without an integration
project:

- a quote accepted in **Quotes** creates a project in **Tasks**;
- a new hire in **Hiring** creates their onboarding tasks and a **People**
  record;
- a form submitted in **Forms** opens a ticket in **Support**.

This is what a bundle of SaaS products cannot do: tools of the same Chest
that know each other. 14 of the store studio's 18 tools publish or receive
another tool's events.

## The answer in short

1. **A tool says what it tells** (`"emits"` in `chest.json`: each event
   type, in a sentence, with the fields its data carries) **and what it
   wants to be told** (`"receives"`: event types, from whichever tool tells
   them).
2. **The owner approves each link** when the second of the two tools is
   installed or updated: “Quotes → Tasks: A quote is accepted — quote,
   client, total”. An admin can switch a link off on the tool's page.
3. **The Chest carries the event**: a durable outbox per receiving tool, at
   least once, the same id every time, in order per subject, retried for 72
   hours with a growing delay, then kept as a **failed delivery** the admins
   see and can send again. Signed like the members' events, on the same
   route (`POST /chest-events`).
4. **A sleeping tool is woken** by the delivery, like by a visit; its
   waiting events are then delivered one after the other on that one wake.
5. **Privacy holds**: data is validated against the declared fields (ids
   and minimal fields, 16 KiB at most); a tool is never told of an item that
   none of its own members could see in the tool that told it, and is told
   who may see it.
6. **Loops are cut**: a chain of events never passes twice through the same
   tool and type.
7. **Who builds automations: developers in code, and Perseus for everyone
   else** (Paul, 6 October 2026). A builder asks Perseus “when a quote is
   accepted, create a project”; Perseus reads which events the installed
   tools tell, writes the subscription and the handler, and tries it in the
   draft with a fake event. No “when X then Y” editor in the Chest.

## How the best products do it

| Product | Model | What we take | What we avoid |
|---|---|---|---|
| **Stripe webhooks** | Typed events (`invoice.paid`), signed (`Stripe-Signature`, HMAC with timestamp), at least once, retried up to 3 days with exponential backoff, no ordering guarantee, events kept 30 days, resend from the dashboard, idempotency keys on API calls (24 h) | Dotted `noun.verb` types, signature with timestamp and body digest, 3 days of retries, resend from the dashboard, idempotency keys | Endpoints the customer types by hand: here the Chest knows both ends |
| **GitHub webhooks and Actions** | Events per repository, delivery log with redelivery, `X-GitHub-Delivery` id; workflows triggered by a workflow's own token do not trigger others (loop guard) | A delivery log per tool, redelivery, the loop guard enforced by the platform rather than by convention | A hard “no chaining at all” rule: here a chain is fine, a cycle is not |
| **Supabase database webhooks / Realtime** | Row changes posted to a URL (pg_net, async, no retry); Realtime authorised by RLS at join | Asynchronous after commit; authorisation decided by the platform | Data sent with no row-level check; no retries |
| **CloudEvents** | Envelope `id`, `source`, `type`, `subject`, `time`, `datacontenttype`, `data`; `subject` for per-entity ordering | The envelope's names (`source`, `subject`, `occurredAt` ≈ `time`) | Extensions and transport bindings: one envelope, one route |
| **Zapier, Make, n8n** | Triggers and actions on a canvas; polling or instant webhooks; dedupe by id; task history with replay; schemas from samples | The history with replay; sample data to build against | A visual builder: Paul chose code and Perseus |
| **Slack Workflow Builder, Power Automate** | Events trigger steps of published “connectors”; infinite-loop detection; flows run with the maker's rights | Loop detection by the platform; a run's history | Flows running with a person's rights: here the link is approved by the owner and data access is decided by the audience |
| **Vercel** | Deployment events to integrations, log drains | Every delivery visible in the tool's logs | — |

## 1. Who declares what

### The publisher: `"emits"`

```jsonc
// chest.json of Quotes
{
  "emits": {
    "quote.accepted": {
      "description": "A quote is accepted",
      "data": { "quote": "id", "client": "text", "total": "number", "acceptedBy": "member", "note": "text?" }
    }
  }
}
```

- **The type** is the publisher's word for what happened: two to four
  dotted segments of lowercase letters, digits and dashes (`quote.accepted`,
  `hire.made`, `form.submitted`), 64 characters at most. `member.*` and
  `access.*` are the Chest's own.
- **The description** says it in a sentence (1 to 80 characters) — what the
  owner reads when approving a link.
- **The data** names each field and its kind: `id` (an identifier of the
  publisher's own, 1 to 128 characters of letters, digits, `.`, `_`, `:`,
  `-`), `text`, `number`, `boolean`, `time` (an instant, RFC 3339), `date`
  (`YYYY-MM-DD`), `member` (a Chest member id), `members` (a list of them).
  A `?` makes a field optional. Field names are camelCase identifiers. A
  type may carry no field at all (`{}`). Nothing else crosses: the Chest
  refuses data with a field not declared, a field of another kind, or a
  member the publisher never had.
- **How many**: as many as the manifest holds (16 KiB): no count of its own.

### The receiver: `"receives"`

```jsonc
// chest.json of Tasks
{ "receives": ["member.*", "quote.accepted"] }
```

A receiver names **types**, never tools: `quote.accepted` from Quotes, or
from another quotes tool the company prefers, reaches Tasks the same way;
the envelope says which tool told it (`source`). Receiving tool events needs
no capability. A tool may receive a type it emits too — from the other
tools that emit it, another installation of itself among them —, never its
own events.

**Alternatives not chosen.**

| Alternative | Why not |
|---|---|
| Types namespaced by the publisher's name (`quotes.quote.accepted`, the studio) or receivers naming a tool (`quotes/quote.accepted`) | A tool's name is its address in one Chest: whoever installs it may rename it, and another company uses another quotes tool. The tool is chosen by the owner's approval of the link, not by the manifest. The Chest stamps `source`: a tool cannot pretend to be another |
| No schema, free JSON (the studio: “what the publisher documents”) | The owner would approve data nobody can see; the Chest could not refuse a name or a note slipped in; Perseus could not write a handler without reading the publisher's code |
| JSON Schema | Far more than ids and minimal fields need, and harder to show in a sentence |
| An admin links tools by hand after installing them (the studio) | One more screen to find; a link not made is a feature that silently does nothing. Approving at installation is when the owner is already deciding what the tool may do |

## 2. What the owner approves

`"emits"` and `"receives"` are permissions, shown at installation and at
the approval of a proposal or a version, under **Data**:

> **Tells other tools: A quote is accepted** — quote, client, total,
> acceptedBy, note. *Quotes → Tasks*
>
> **Is told: quote.accepted** — *Quotes → Tasks: A quote is accepted*

The arrows are the **links** that installing this version makes with the
tools already installed; “No installed tool listens yet” / “No installed
tool tells it yet” otherwise. A link exists when the publisher's version in
service emits the type, the receiver's receives it, both are installed, and
no admin switched it off. So every link is shown to the owner at the
approval of whichever of the two tools comes second.

What asks for approval again: a new type emitted or received, a field added,
removed or of another kind, another description. A version that stops
emitting or receiving a type asks nothing (its links end).

On the tool's page, **Events** (owner, admins, its builders): what it
tells and to whom, what it is told and by whom, each link with a switch,
and its failed deliveries (section 4).

## 3. Privacy: data minimisation and who may see

- **Minimal by construction**: only declared fields, of their kind, 16 KiB
  of data at most. Member ids, never names nor addresses: a receiver that
  holds `members` resolves them, under its own permissions.
- **The audience.** An event may say who, in the publisher, may see the
  item: `audience: {members, groups, roles}` (the publisher's roles);
  without it, everyone who has the publisher. At each delivery the Chest
  intersects it with the members who have the receiver:
  - **nobody** in common → the event is not delivered to that receiver
    (the publisher's log says so);
  - **everyone** who has the receiver → `audience: "all"`;
  - otherwise → `audience: [member ids]`, the receiver's members who may
    see it.

  **A receiver never learns of an item none of its members could see**, and
  it is told who may: Tasks creates the project visible to those people;
  they share it further by Tasks' own rules, as they could copy it by hand.
  The SDK hands the audience to the handler; honouring it is the
  receiver's business rule (the Chest cannot see inside its database).
- **Who sees the deliveries**: the logs say the type, the tools, the id,
  the outcome — never the data.
- **Kept on the Chest**: an event waits in the receiver's outbox until
  delivered; a failed delivery is kept 30 days with its data, then
  forgotten; an uninstalled tool's events are dropped.

## 4. Delivery

| Rule | Decision |
|---|---|
| Durability | The event is written to each linked receiver's outbox (a private file of the node, replaced atomically) **before** the publisher's call is answered: it outlives a restart |
| At least once | Posted to the receiver's `POST /chest-events` until it answers 2xx within 30 s; the same `id` every time; the SDK drops an id it already handled |
| Idempotency | `key` on emit: the same key within 72 hours answers the same event id and tells nobody again; the same key with other content is refused (409 `key_reused`) |
| Ordering | Per **subject** (`subject`, the id of the thing — the quote): a receiver gets a subject's events in the order they were emitted, a later one waiting while an earlier one is retried. Without a subject, no order is promised |
| Retries | After 5 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 30 min, then hourly, for 72 hours from the emit — the members' events' schedule |
| Failed deliveries | Given up after 72 hours: kept 30 days on the receiver's **Events** page — when, from whom, the type, the last answer (“answered 500”, “no answer within 30 seconds”, “not enough memory on the server to wake it”) — with **Send again** (one, or all). Sending again uses the same id. Told in the bell of the builders of both tools (the owner and the admins when neither has one), one grouped item per link (§ 11) |
| Signature | `Chest-Event v1`, exactly as the members' events: compact JWS HS256 under a key derived from the instance's token, claims `aud` (the tool), `iat`, `exp` (60 s), `jti` (the event id), `digest` (SHA-256 of the body). Through the tool's launcher only; `/chest-events` answers 404 to browsers |
| Envelope | `{id, type, source, occurredAt, subject?, audience, data}`; a member event keeps its four keys (`id`, `type`, `occurredAt`, `data`) |
| `occurredAt` | The Chest's time of the emit, or the publisher's (`occurredAt`, within the last 72 hours, never ahead): an item told late by a retry keeps its time — Goals counts per cycle |
| Answer to the publisher | `202 {id, receivers}`: how many tools it was written for. Telling nobody is not an error |

## 5. Sleeping tools, capacity and fairness

- **A delivery wakes the receiver**, like a visit, with the same memory
  rules ([Fleet monitoring](fleet-monitoring.md#sleeping-tools)): the wake
  holds 60 s at most; the least recently used idle tools sleep first to
  make room; a wake refused for memory is retried later and later like a
  refused delivery, and shows as “not enough memory on the server to wake
  it”. The tool's events wait in its outbox meanwhile: nothing is lost.
- **Coalescing**: one tool, one delivery at a time; a tool woken for an
  event receives everything waiting for it on that same wake, one after
  the other, and stays awake its usual 15 minutes.
- **Fairness**: each receiving tool has its own outbox and its own queue,
  so a flood to one tool never delays another; waking is serialised by the
  server's memory, never by a count.
- **Back-pressure by capacity, never by a count**: an outbox holds what its
  file may hold (three times a full team's policy, like the members'
  events); beyond, the oldest delivered records go first, then the oldest
  failed deliveries, then the oldest events waiting, each said in the
  tool's log. A publisher is never refused because a receiver is slow.
- **A receiver uninstalled**: its links end, its outbox and failed
  deliveries go. **A publisher uninstalled**: its events still waiting are
  dropped (its data is gone). **A version that stops receiving a type**: its
  waiting events of that type go. **A receiver failing**: retried, then
  failed deliveries on its page; nothing else is blocked.

## 6. Loops and fan-out

- **Fan-out**: one emit is written to every linked receiver; each is
  delivered, retried and failed on its own.
- **A chain never visits the same tool and type twice.** An event emitted
  while a tool handles an event (the SDK passes the event it handles as
  `cause`, by itself, through the handler's async context) continues that
  event's chain. If its publisher and type are already in the chain —
  Quotes → Tasks → Quotes —, it is accepted and told to nobody, and the
  publisher's log says “not sent: it would loop (quote.accepted → task.created
  → quote.accepted)”. Bounded by the number of distinct tools and types,
  never by a depth chosen in advance.
- **A tool that loses the cause** (work deferred to a schedule) starts a
  new chain: the safety net is that each loop costs one delivery at a time
  in each tool's own queue, every turn shows in the logs, and an admin
  switches the link off.

## 7. Versioning of event schemas

- **A type's data only grows.** A new version may add fields; it may not
  remove one, change its kind, or make a required field optional: the
  Chest refuses to put it in service — “quote.accepted changed: total was a
  number. A type's data only grows: name the new shape another type
  (quote.accepted.v2) and emit both while receivers move.”
- **A new major is a new type** (`quote.accepted.v2`): receivers choose
  when to move; the publisher emits both meanwhile.
- **Receivers read defensively**: a field may be added at any time; the SDK
  never refuses an envelope for an unknown field.

## 8. Who builds automations — Paul's decision

**Developers in code, and Perseus for everyone else** (6 October 2026). No
visual editor in the Chest: a link is a subscription in the receiver's code
and a handler that does something meaningful in its own data — exactly
what an AI builder writes well, and what a visual editor would need
“actions” in every tool to do.

What makes it easy and safe for Perseus:

- **What the installed tools tell**: a Perseus tool `chest_events` lists
  each type the installed tools emit — the tool, the description, the
  fields and their kinds — and which tools already receive it. The same
  list is in the Chest's API for agents.
- **Fake events in the draft**: `chest_events` with `send` posts a sample
  of a type to the draft's preview, signed as the Chest would, built from
  the publisher's declared fields (fake ids, the draft's fake members). The
  answer and the handler's log show in the preview's log.
- **A draft's own emits** reach no tool: the preview's log says what it
  emitted and which installed tools would have been told.
- **The knowledge pack** (`sdk-events`) shows the manifest, `emit`, `on`,
  the audience, idempotency, and a test with `fakeChest`.
- **What protects the Chest from a wrong automation**: the owner approves
  every link at installation; the schema refuses undeclared data; the
  audience refuses data nobody there could see; loops are cut.

## 9. The SDK

```ts
// Quotes: tell, after the quote is accepted in the database
import * as events from "@argentic/chest-sdk/events";
await events.emit("quote.accepted", { quote: q.id, client: q.client, total: q.total, acceptedBy: who.id },
  { subject: q.id, key: `accepted:${q.id}`, audience: { groups: q.groups } });

// Tasks: app/chest-events/route.ts — one route for member and tool events
export async function POST(request: Request) {
  return new Response(null, { status: await events.handle(request, {
    "quote.accepted": async e => { await createProject(e.data, e.audience, e.source); },
  }, { seen }) });
}
```

- `emit(type, data, {subject, key, occurredAt, audience})` → `{id,
  receivers}`; errors `invalid_type` (not in `"emits"`), `invalid_data`,
  `invalid_audience`, `key_reused`, `CapabilityNotGranted` (the version
  emits nothing).
- `handle` dispatches member and tool events by type; a tool event's
  handler receives `{id, type, source, occurredAt, subject, audience,
  data}`. An `emit` inside a handler carries the cause by itself.
- `fakeChest`: `emitted` (what the tool told, checked against the `emits`
  it is given) and `deliver(event, to)` — a member's event or a tool's (with
  its `source`, `audience`), signed as the Chest.

## 10. What the store studio proposed, and what changed

The studio's working copy (ChestStore-Dev, `sdk/client/src/events.ts`,
report §4.4 and §8) was right on the shape: one route for member and tool
events, the publisher's `occurredAt`, member ids not names, at least once
with deduplication, an approval sentence. Reshaped:

| Studio | Decided | Why |
|---|---|---|
| `events.publish(type, data, {key, occurredAt})` | `events.emit(type, data, {subject, key, occurredAt, audience})` | `emit`/`on` is the vocabulary every agent knows; `subject` gives ordering; `audience` keeps access rules |
| Type namespaced by the publisher (`leave.approved` from `leave`) | Free types, the publisher stamped as `source` | Kinds work with any tool that tells them; renaming a tool breaks nothing |
| `"emits": ["leave.approved"]`, no schema, “documented payload” | `"emits": {type: {description, data: {field: kind}}}`, validated | The owner sees what crosses; the Chest refuses the rest; Perseus writes handlers from it |
| An admin links publisher and receiver later | The link is approved with the second installation; an admin can switch it off | No silent dead feature, one decision point |
| `events.receivers(type)` | `emit` answers how many receivers | No use in the official tools yet; Forms can ask when it needs it |
| Loops: chain deeper than 3 dropped | A chain never visits the same tool and type twice | A rule that follows the graph, not a number |
| `occurredAt` within 24 hours | Within 72 hours (the retry window) | One window for both |
| No order; each receiver keeps tombstones | Order per subject | Removes the most repeated receiver code (People, Equipment) |
| No access rule on data | Audience intersected with the receiver's members | “A receiver never learns what its members could not see” |
| `group.changed` events | None | Group membership changes are `member.updated` (batch GRP) |

The studio's tools move to this API: `"emits"` with a schema per type,
`emit` in place of `publish`, `audience` where an item is not for everyone.

## 11. Paul's answers (7 October 2026)

- **A delivery that fails for good is told** to the people the link
  matters to: the builders of the receiving tool and of the emitting tool —
  the owner and the admins when neither tool has a builder —, in their bell,
  mailed and pushed to their devices as each of them chose (the Chest's
  own words, like any item of the bell). **One grouped item per link**:
  further failures on the same link count in the same unread item (“3
  deliveries from Quotes to Tasks failed: quote.accepted”), never one item
  per event, nor a second mail or push for it while it is unread; read, the
  next failure starts a new one. It opens the Events of the receiving tool, with **Send again**,
  for whoever runs it — the emitting tool's Events otherwise — and is shown
  while both tools are installed.
- **The other questions keep their defaults**: the audience stays strict
  (no widening per link); a delivery wakes a tool like a visit; each
  publisher's fields are its own (a shared vocabulary of kinds later, from
  the studio's tools); failed deliveries are kept 30 days with their data.
