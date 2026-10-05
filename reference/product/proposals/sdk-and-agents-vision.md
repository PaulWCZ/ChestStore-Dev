# SDK and agents — the vision

**Proposal of 28 September 2026, for Paul to decide.** Nothing here is shipped;
what exists is in [status.md](../03_roadmap/status.md). Two questions:
(a) what the SDK needs so the store can replicate most of the SaaS a small
company pays for, and so builders are limited only by their imagination;
(b) how an agent works on a Chest — building, publishing and maintaining many
tools — under the powers the owner gives it. Already decided and specified:
[members and notifications](../02_specs/members-and-notifications.md),
[tool storage](../02_specs/tool-storage.md).

**Update, 28 September 2026 (later):** Paul decided part (b) and the LLM
gateway. The decisions are specified in
[Connected agents](../02_specs/chest-agent.md),
[AI gateway](../02_specs/ai-gateway.md),
[Develop and test tools](../02_specs/develop-and-test-tools.md) and
[Owner space and billing](../02_specs/owner-space-and-billing.md); where this
page differs, the specs win. In particular, connected agents have **safety
limits** (rate caps on actions), not budgets: no money limit, since their AI
spend is their own; only the Chest's own agent has a monthly money budget.

**Update, 28 September 2026 (evening):** the Chest's own agent is named
**Perseus**; it belongs to the Chest (no human sponsor) and is configured by
the owner and admins. Code stays on GitHub as today (no Chest Git, no GitHub
write for now; deferred). AI runs on BYOK connectors first; managed AI credits
are later.

**Update, 29 September 2026:** realtime (the gap of team chat, docs and
boards) is specified in [Realtime](../02_specs/realtime.md): socket
pass-through on the tool front (RT1, before PB3's hot reload), then a Chest
Realtime service with channels, presence and tool-signed tokens (RT2).

**Update, 28 September 2026 (night):** Perseus v1 **is** the build agent,
[Perseus Code](../02_specs/perseus-build.md), first priority after AI1 (with
the PB0 spike). The Chest maintaining itself (“Ask Perseus about your Chest”,
maintenance loops, event reactions, weekly reports, Perseus statuses, AG5
below) is [later, not planned](../02_specs/perseus-build.md#later-not-planned);
connected agents (AG1–AG4) come after Perseus Code. **Builder** becomes a
Chest-level status (member < builder < admin < owner) that opens Perseus
Build; “its tools” below = the tools created or assigned.

## (a) A complete SDK

### What exists

| Area | Given to a tool today | Where |
|---|---|---|
| Identity | `member(request)`: the signed member, role, admin, builder | SDK 0.1.1 |
| Data | Its own PostgreSQL database, migrations from the repository, console | `databaseUrl()` |
| Files | Private files, 1 GiB, signed download links | `files.*` |
| Errors | `CapabilityNotGranted`, `TooLarge`, `QuotaExceeded`, `Unavailable` | `errors` |
| Platform (no SDK needed) | Public part and team part on two hosts, custom domains, variables and secrets, declared network egress (a proxy with a journal), runtime logs, build logs, memory choice, zero-downtime versions, rollback, roles declared by the tool | Chest |
| Agents | Personal tokens (read-only, narrowed to tools), `/api/v1` (tools, builds, logs, variables, database, catalogue, proposals, GitHub), MCP server with 21 tools and two-step writes | Chest, `@argentic/chest-mcp` |
| Specified tonight | Member ids, `members`, `groups`, `members.email`, badges, notifications, inbox, lifecycle events, browser uploads, thumbnails, public files, quotas, Storage view, `testing` | the two specs above |

### Principles for every new primitive

1. **Postgres first.** No primitive where the tool's own database does the job
   well: key-value, cache tables, full-text search (`tsvector`, `pg_trgm`),
   job tables, counters. The SDK documents the recipe instead.
2. **A capability is a sentence.** Each primitive is asked in `chest.json`, said
   in one line at approval, bounded by a quota, written in a journal, reachable
   by agents through `/api/v1`, faked in `testing`. No exception: that is what
   makes an agent's work safe to approve.
3. **Capabilities, not credentials.** Connectors hold the keys; tools never see
   them.
4. **Zero dependency, two languages.** The SDK stays `node:*` only; Python
   follows with the same names once a real tool needs it.

### What SaaS need

| Category | Beyond database, files and members, it needs | Blocking gap today |
|---|---|---|
| CRM | notifications, events (forms → contact), email connector, scheduled tasks (reminders), import/export CSV, audit log | notifications, events, email |
| Helpdesk | inbound email, email out, public accounts (customer portal), public uploads, realtime, notifications, search | inbound email, public accounts |
| Team chat | realtime (WebSocket), notifications, uploads, search | realtime |
| Project management | notifications, badges, realtime, scheduled tasks, events | notifications |
| Docs / wiki | realtime (co-editing), uploads, search, public files (published pages) | realtime |
| Forms | public uploads, events, email, webhooks out | public uploads, events |
| Booking | public accounts, calendar connector (OAuth per member), email, payments, scheduled tasks | calendar, public accounts |
| Invoicing | PDF generation, email, payments, scheduled tasks, numbering (Postgres), audit log | PDF, email |
| HR | members (org chart), files (contracts), e-signature connector, notifications, scheduled tasks, strict audit | members, audit |
| Analytics | scheduled tasks, events from every tool, heavy SQL (read replicas later), charts (client-side) | events, scheduled tasks |
| E-commerce back-office | public part, public files, payments, public accounts, email, webhooks in (carrier, Stripe), jobs | payments, public accounts, webhooks in |
| LMS | public accounts, video files (large objects, range requests), progress, certificates (PDF), payments | public accounts, large files |
| CMS | public files, publishing, preview, scheduled publishing, webhooks out (rebuild) | public files |
| Internal AI assistants | LLM gateway, files, jobs (long runs) | LLM gateway, jobs |

### The primitives, with an opinion on each

| Primitive | Shape | Opinion |
|---|---|---|
| **Scheduled tasks** | `"schedules": [{"name": "reminders", "cron": "0 8 * * 1-5", "path": "/chest-jobs/reminders"}]`; the Chest calls the path with a signed request, logs duration and status, shows the next run | Needed by half the catalogue; cheap: the Chest is already a supervisor. **P1** |
| **Jobs / queue** | `jobs.enqueue(name, payload, {runAt?, key?})`; the Chest delivers to `/chest-jobs/<name>` with retries and backoff, at-least-once, stored in the Chest (not the tool's memory) | Same delivery engine as events and schedules: build once. **P1** |
| **Events between tools** | `events.emit(type, data)`, `"emits"` / `"receives"` in the manifest, links set by an admin (“When Forms receives a response → create a contact in CRM”) | Already the plan (batch A); it is what turns tools into a suite. **P1** |
| **Realtime** | WebSocket and Server-Sent Events passed through the front on `/chest` (and the public part), session checked at upgrade; `realtime.publish(channel, data)` for fan-out later | Passing the upgrade through is small and unlocks chat, boards, co-editing; a hosted pub/sub only if tools struggle. **P1** (pass-through) — specified 29 September: [Realtime](../02_specs/realtime.md) (RT1 pass-through, RT2 Chest Realtime) |
| **Audit log** | `audit.record({action, target, detail})`, kept by the Chest outside the tool, shown to admins on the tool's page, exported | Compliance sells to companies; a tool cannot tamper with it. **P1** |
| **Email connector** | Separate decision (batch G) | Blocks CRM, helpdesk, invoicing. **P1 decision** |
| **Public accounts connector** | `accounts.*`: sign-up, sign-in, recovery, passkeys for a tool's public part, per tool, ids `acc_…` | The biggest unlock for customer-facing tools (shop, portal, LMS, booking). **P2**, designed early |
| **Payments connector** | Stripe connected once by the owner; `payments.checkout({…})`, webhooks verified by the Chest | After public accounts. **P2** |
| **LLM gateway** | The owner connects a provider (Anthropic, OpenAI, Mistral, a local model); `llm.complete({…})` with per-tool budgets, logs of use (never prompts by default), model allowlist | Railcode has it; every company will ask. Tools can already call a provider with a variable and `network`; the gateway adds budgets and one key. **P2** — specified: [AI gateway](../02_specs/ai-gateway.md) |
| **Webhooks in** | `"webhooks": ["stripe", "github"]`: only `/hooks/<name>` opens on the public host, even when the public part is closed; signature recipes in the SDK | Small, useful for any integration. **P2** |
| **Webhooks out** | An admin points a tool's events to a URL (signed, retried) | Falls out of events. **P2** |
| **Member locale** | `member.locale` in the assertion; the SDK's formatters | Tiny; English-first product. **P2** |
| **OAuth connectors per member** | Google, Microsoft calendars and mailboxes, Slack: the member links their account once, tools act with their consent | Booking and assistants need it; heavy (consent screens, refresh tokens). **P3** |
| **PDF generation** | A recipe first (`pdf-lib`, React-PDF in the tool); a Chest render service (headless Chromium in its own sandbox) only if recipes fail | Chromium on a small VPS is expensive. **P3** |
| **Analytics per tool** | Page views counted by the front, no cookie; `track(event)` later | The front already sees every request. **P3** |
| **Search** | Postgres recipe (`tsvector`, `pg_trgm`) in the SDK docs | No primitive. |
| **Key-value / cache** | Postgres (unlogged table) recipe | No primitive. |
| **Secrets** | Variables tab (exists) | Done. |
| **Preview environments** | A branch builds to `<tool>--<branch>-chest…` with its own empty database (migrations + seed), never production data | For agents above all (below). **P2** |

### Proposed order

| Tier | Content | Why |
|---|---|---|
| **P1** — the starter catalogue | M members, N notifications, ST storage, `testing`; one delivery engine for scheduled tasks, jobs and events; WebSocket/SSE pass-through; audit log; decide the email connector | What CRM, tasks, wiki, forms and booking-lite need; everything else waits for a real tool asking |
| **P2** — customer-facing tools | Public accounts, payments, LLM gateway, webhooks in/out, public uploads and files, locale, preview environments, SDK 1.0 | Shops, portals, courses, AI helpers |
| **P3** — breadth | OAuth connectors per member, PDF service, analytics, Python SDK | Driven by catalogue demand |

Opinion: P1 is about six weeks and should run in parallel with the catalogue
(CAT in [road to sale](road-to-sale.md)) — each catalogue tool is the proof of
the primitive it needs, never the other way round.

## (b) Agents on a Chest

### Where we are

A member makes a personal token (30 or 90 days, read-only or narrowed to some
tools, never more than the member's rights, recomputed on every call); an
agent uses `/api/v1` or the MCP server, whose writes are two steps: a dry run,
then the same call with a confirmation the human gave in the conversation.
Every call is in the agents' journal.

Honest limit: **the two-step confirmation is a courtesy, not a boundary.** The
Chest cannot tell whether a human said yes in the chat; an agent that ignores
the rule can confirm itself. The boundary is what the token may do. So the
next step is not more confirmations in the chat, but **powers set by the
owner and approvals given in the Chest**.

### Agents as members with a status

An agent becomes its own principal in Team (“Claude — Camille's agent”),
created by the owner or an admin, **sponsored** by a human who answers for it,
with its own tokens, journal and activity page. Its status:

| Power | Observer | Builder | Maintainer | Admin agent |
|---|---|---|---|---|
| Read tools, builds, logs, storage usage | ✓ | its tools | ✓ | ✓ |
| Read tool **data** (rows, files) | option | option | option | option |
| Create a tool from a template, propose it | — | ✓ | ✓ | ✓ |
| Push, deploy a version that asks nothing more | — | its tools | ✓ | ✓ |
| Migrations (through the repository), rollback, restart | — | its tools | ✓ | ✓ |
| Set variables (write-only for secrets) | — | its tools | ✓ | ✓ |
| Install from the catalogue, apply updates that ask nothing more | — | — | ✓ | ✓ |
| Set memory and quotas within the server | — | — | ✓ | ✓ |
| Approve a proposal or a widening | — | — | — | request only |
| Delete a tool or data, open a public part, domains, `network: ["*"]` | — | — | — | request only |
| Invite, remove, erase people; create agents; billing | never | never | never | never |

- **Data is a separate switch.** Deploying code and reading personal rows are
  different powers (already a rule: “Builder status is never enough to open
  all business data”). An agent can maintain a CRM without reading a contact.
- **“Its tools”** = the tools it created or was named builder of.
- **No escalation.** An agent can never approve beyond its own status, never
  create an agent, never raise its safety limits (Railcode's “a deploy cannot grant
  what the deployer does not hold”, applied to agents).
- **Request only** = the agent files a request that lands in the owner's
  inbox (the notifications above) with the manifest difference in words;
  the owner approves **in the Chest**, where the agent cannot answer for them.
- **Safety limits**, set with the status and shown on the agent's page:
  generous rate caps on actions (deployments an hour, new tools a day, writes
  an hour…), each changeable or switchable off by the owner; a validity date;
  “Pause agent” stops every token at once. **No money limit** for connected
  agents; irreversible actions (deleting a tool or data, a new permission, a
  domain) always wait for the owner's approval in the Chest. Defaults in
  [Connected agents](../02_specs/chest-agent.md#safety-limits).

### Building and publishing many tools cleanly

1. **Templates.** `chest-by-argentic/template-next` (Next.js, SDK, `migrations/`,
   `testing` with `fakeChest`, `AGENTS.md`, CI that runs the tests),
   `template-api` (Hono, no UI), later Python. `npm create chest-tool` for humans.
2. **Where the code lives.** Today, the agent pushes with the human's GitHub.
   Opinion: add a **Git remote on the Chest** (`git push chest main`), for agents
   and for companies that want their code on their own server too. GitHub stays
   the default for people and the catalogue; the Chest's Git removes the need
   to give an agent a GitHub account or to widen the GitHub App to write.
   **Deferred (28 September):** v1 keeps GitHub as it is; agents writing code
   through the Chest is a later decision, only if it stays simple.
3. **Preview before production.** Each branch builds to a preview host with its
   own database (migrations + seed, never production rows); the agent runs its
   checks there, then promotes. This is what makes “deploy without waiting”
   safe for agents.
4. **The platform watches the deployment.** For 10 minutes after a new version,
   the Chest compares restarts, 5xx and error lines with the previous version
   and **rolls back by itself** on a clear regression, then tells the agent and
   its sponsor.

MCP tools to add (all within the token's status; every write two steps and
journaled):

| Tool | Does |
|---|---|
| `create_tool` | From a template: repository, manifest, first proposal or deployment (deferred with code writing) |
| `watch_build` | Follow a build to its end, with the log's tail |
| `preview` | Build a branch as a preview; its address and state |
| `promote` | Deploy the previewed version (proposal if it asks more) |
| `rollback`, `restart` | The existing screen actions |
| `migration_preview` | Run the pending migrations on a copy of the schema, report errors and duration |
| `requests` | File or follow a request to the owner (approval, widening, deletion) |
| `approve` | Admin agent only, and only what its status allows |
| `files_list`, `files_link`, `inbox` | From the two specs |
| `health` | Restarts, error rate, memory, disk of its tools |

### Maintenance loops

An agent with the Maintainer status keeps its tools alive:

- **Signals** it reads (poll, then events): catalogue updates, dependency
  advisories on its repositories, failed builds, error spikes in logs, a
  platform SDK release, quota near full.
- **Loop:** branch → update → preview → tests → promote within its powers →
  watch → report; beyond its powers, a request with the reason.
- **Report:** a weekly note in its sponsor's inbox: what changed, what waits
  for a human, what it could not fix.

Later, the Chest runs its own agent, **Perseus** (“Ask Perseus about your Chest”): a run in
a sandbox container like a tool, with the owner's model through the AI
gateway, acting through MCP with its agent principal — **a Chest that
maintains itself**, under powers a human set.

### Railcode's managed agents, and doing better

Railcode (docs read on 28 September 2026): server-side agents defined in a
YAML manifest, run in a code sandbox with a durable, auditable history;
triggered by an app call, a cron or a Slack mention; egress limited to
package registries and approved connectors; 300 steps and 1,200 s per run; no
agent calling another; only bundled toolkits, no custom MCP; organisation or
personal agents; sandbox files lost unless written back to the app's data.

| Railcode | Chest |
|---|---|
| Agents are **workers inside apps** (read a file, summarise, transform) | Agents are **the developers and operators** of the company's tools: create, deploy, migrate, roll back, maintain |
| Runs on Railcode's cloud | Runs against the company's own server; code, data and journals stay there |
| Key-value store and files; SQL only through outside connections and saved queries | A PostgreSQL database per tool with migrations and a console, agents included |
| Internal apps only, every visitor a signed-in member | A public part per tool, public uploads and files, public accounts next |
| Grants: a deploy cannot grant more than the deployer holds | Same rule, plus the manifest said in sentences, its difference at each version, and statuses for agents |
| Bring their toolkits | Bring any agent (Claude Code, Cursor, Codex…) through MCP; later host one |
| Durable runs with history | Journal per call today; add an activity page per agent and automatic rollback |

What Railcode does better today, to adopt: the **LLM gateway**, **cron**,
**email**, connectors as HTTP proxies or MCP tools, and one observability
stream for LLM, email and connector calls. Their “404 rather than 403” for an
app one cannot reach is already Chest's rule for members without access.

Where Chest should dream bigger: **the company's software, written and
maintained by its agents, on its own server** — a catalogue to start from,
agents that adapt and extend it, humans who decide what matters (who gets in,
what leaves the server, what gets deleted). Railcode gives agents a sandbox;
Chest gives them a workshop with rules.

### Proposed order for agents

| | Batch | Content |
|---|---|---|
| AG1 | Agent principals | Agent in Team, sponsor, status, data switch, safety limits, pause, activity page |
| AG2 | Requests | Requests to the owner in the inbox, approval in the Chest; MCP `requests` |
| AG3 | Build loop | Templates, `create_tool`, `watch_build`, automatic rollback after a bad version |
| AG4 | Previews | Branch previews with their own database — now batch DT, [Develop and test tools](../02_specs/develop-and-test-tools.md) |
| AG5 | Perseus | “Ask Perseus about your Chest”, maintenance findings and proposals, on the AI gateway |
| — | Chest Git | Deferred: push to the Chest without GitHub, only if simple |

## Opinions and open questions for Paul

1. **Order:** P1 of the SDK and AG1–AG3 before any P2; the catalogue tools
   drive the rest.
2. **Two-step confirmations:** keep them for comfort, stop calling them a safety
   rule; safety is statuses and in-Chest approvals.
3. **Chest Git:** decided 28 September — deferred; GitHub stays as it is.
4. **Email connector:** P1 tools need it; the separate decision should come
   before the catalogue is written.
5. **LLM gateway:** decided — AI connectors with the company's own keys
   first, managed credits later; see [AI gateway](../02_specs/ai-gateway.md).
6. **Agent safety limits by default** — decided: generous rate caps, no money
   limit for connected agents; values in
   [Connected agents](../02_specs/chest-agent.md#safety-limits).
