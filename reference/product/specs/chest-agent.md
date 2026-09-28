# Perseus and connected agents

**Specified 28 September 2026 from Paul's decisions of the same day; to build**
(batch AG in [status.md](../03_roadmap/status.md)). It turns part (b) of the
[SDK and agents vision](../98_travail/sdk-and-agents-vision.md) into decisions.
What exists today (personal tokens, `/api/v1`, the local MCP server with
two-step writes, GitHub linking) is in [For agents](for-agents.md) and
`03_code/01_chest-by-argentic/docs/architecture.md`. Testing before production
(`chest check`, `chest dev`, previews) is in
[Develop and test tools](develop-and-test-tools.md); AI in
[AI gateway](ai-gateway.md).

**Perseus** is the Chest's own agent. The name comes from the myth: Perseus
was found in a chest.

## Goals

1. **A Chest that looks after itself, under rules a human set.** Perseus lives
   on the server and belongs to the Chest; the owner and admins configure it.
2. **Bring any agent.** Claude Code, Cursor, Codex… connect with a browser
   consent (OAuth), not a token pasted in a file.
3. **Every connected agent is an identity with a human sponsor**, a status and
   a journal. Perseus is the only agent without a sponsor. The boundary is what
   a status allows, not a confirmation in a chat.
4. **Irreversible actions are always decided by the owner, inside the Chest.**
5. **Keep code hosting simple.** The current GitHub flow stays as it is.

## Two kinds of agents

| | **Perseus** | **Connected agents** |
|---|---|---|
| What | One per Chest, built in | Claude Code on a laptop, Cursor, Codex, a CI job… |
| Runs | On the Chest's server, in a sandbox | Wherever its human runs it |
| Thinks with | The [AI gateway](ai-gateway.md), through the AI connector chosen on its page (alias `agent`) | Its own model, its own bill |
| Money | **A monthly AI budget** set by the owner or an admin (default €[10], estimated from the connector's usage); the run stops when reached | **No money limit**: its AI spend is not the Chest's business |
| Safety limits | Yes (below) | Yes (below) |
| Sponsor | **None: it belongs to the Chest.** The owner and admins configure it: status, safety limits, AI connector, on/off | The human who connected it |
| Created by | Exists from the opening, off until the owner or an admin turns it on and gives it an AI connector | The owner or an admin, through the consent screen |

Personal access tokens stay for scripts and CI (read-only by default);
connected agents use the connection below.

## Statuses

Set by the owner or an admin, changeable at any time, never above the status
of the human who sets it.

| Power | Observer | Builder | Maintainer | Delegated admin |
|---|---|---|---|---|
| Read tools, builds, logs, capacity, storage usage | ✓ | its tools | ✓ | ✓ |
| Propose a tool from a repository | — | ✓ | ✓ | ✓ |
| Deploy a version that asks nothing more | — | its tools | ✓ | ✓ |
| Previews, rollback, restart | — | its tools | ✓ | ✓ |
| Set variables (secrets write-only) | — | its tools | ✓ | ✓ |
| Apply catalogue updates that ask nothing more | — | — | ✓ | ✓ |
| Set memory, storage quota, AI caps of tools, within the server | — | — | — | ✓ |
| Remove people's access to a tool, reorganise groups | — | — | — | ✓ |
| **Owner approval in the Chest** (request only, all statuses) | delete a tool; delete data (files, tables, rows in bulk, a preview's promotion that drops columns); any new permission (install, widening, `network`, public part, `members`, `ai`…); give people access to a tool; domains; turning off an agent's safety limits | | | |
| **Never** | invite, remove or erase people; create or change agents; billing and money; the owner's settings | | | |

- **Reading tool data is a separate switch** (off by default): rows through
  the database routes and file contents. Deploying code and reading personal
  data are different powers.
- **“Its tools”** = the tools it proposed, or of which it was named builder.
- **Scope**: all tools, or a chosen list.
- **No escalation**: an agent never grants what its status does not hold,
  never creates an agent, never changes its own limits or configuration.
- **Deploy policy**: by default, a Builder or Maintainer agent's version that
  asks nothing more **deploys**; the owner can set “Its versions wait for my
  approval” per agent (the existing proposal mode).

## Safety limits

Called **safety limits**, not budgets: rate caps on actions, generous by
default, there to stop a runaway loop, not to ration work. There is **no
money limit for connected agents**. The owner can change each value or turn a
limit off per agent (turning one off is itself an owner-only action).

| Limit | Default |
|---|---|
| Deployments (production) | 30 an hour |
| Previews created | 60 an hour |
| New tools proposed | 10 a day |
| Writes through the API (all routes) | 600 an hour |
| Database write statements | 1,000 an hour |
| Variable changes | 60 an hour |
| Builds at once | 2 (the server builds one at a time; the second waits) |
| Connection validity (connected agents) | 90 days, renewable by its sponsor |

When a limit is reached: `429 safety_limit` with the limit's name and when it
resets; the agent's page shows it; its sponsor (for Perseus: the owner and
admins) gets one inbox item. **Pause** (one switch on the agent's page, for
the owner, an admin or the sponsor) stops every token and run of that agent at
once.

## Approvals, in the Chest

A request (from any agent, for anything in the approval row) lands in the
owner's inbox (and admins' when an admin may decide it) — the notifications of
[Members and notifications](members-and-notifications.md) — with:

- what, in the approval sentences (“CRM asks in addition: can reach
  api.hubspot.com”); for a deletion, what disappears and whether a backup
  holds it;
- who: the agent, its sponsor (or “Perseus”), the reason the agent gave;
- **Approve / Decline**, only in the Chest's portal with a member session —
  never through `/api/v1`, never through MCP. An agent cannot answer for a
  human.

The agent follows its request (`GET /api/v1/requests/{id}`, MCP `requests`)
and carries on with other work. Requests expire after 14 days. The MCP
two-step confirmation stays as a courtesy in the conversation; it is no longer
presented as a safety rule.

## Connecting an agent (OAuth consent)

The Chest serves a **remote MCP endpoint**, `https://<chest>/mcp` (Streamable
HTTP), next to the existing local `@argentic/chest-mcp` (which learns the same
sign-in). It follows the MCP authorization specification: OAuth 2.1,
authorization code with PKCE (S256), protected-resource metadata
(`/.well-known/oauth-protected-resource`), authorization-server metadata
(`/.well-known/oauth-authorization-server`), dynamic client registration,
resource indicators binding each token to this Chest. **The Chest's portal is
the authorization server**: the human signs in with his Chest account as
usual, then sees the consent screen.

**Team → Agents → Connect an agent** gives one copyable line per client
(`claude mcp add --transport http acme https://acme.argentic.work/mcp`, and the
equivalents for Cursor, Codex, VS Code). The client opens the browser:

```
Claude Code wants to work on Acme's Chest

Name            [ Claude — Camille's laptop        ]
Status          ( ) Observer  (•) Builder  ( ) Maintainer  ( ) Delegated admin
Tools           (•) All   ( ) Choose…
Tool data       [ ] Can read rows and files
Safety limits   Default · Adjust ›
Valid for       90 days

Sponsor: Camille Martin — you answer for what this agent does.

[ Connect ]   Cancel
```

- Who may connect: the owner and admins (any status up to their own). A
  member may **ask** (“Request an agent”), which becomes an approval request —
  open question 2.
- Tokens: access token 1 hour, refresh token rotating, both bound to the
  agent identity and to this Chest; revoked by Disconnect, Pause, expiry, or
  the sponsor leaving.
- **Sponsor leaves the Chest**: the agent is paused and appears to the owner
  as “Sponsor left — assign a new sponsor or disconnect”.

## Code hosting

**v1 keeps the current GitHub flow unchanged** ([For agents](for-agents.md)):
the “Chest by Argentic” GitHub App reads linked repositories (the decision of
24 September 2026, “read, never write”, stands); a push rings the Chest, which
fetches and builds. Connected agents push with their human's own Git
credentials, as today. **Perseus does not write code in v1.**

Letting agents write code through the Chest is a **later, separate decision**,
taken only if it can stay simple for the user. Options, later, if simple:

- **Chest-hosted Git** — a repository per tool on the Chest, no GitHub account
  needed; costs a Git service to run and back up.
- **GitHub App write** — `contents: write` on repositories the owner opts in;
  reverses the 24 September decision and makes every installation accept new
  permissions.

## Perseus

**Where it runs.** A sandboxed container like a tool (its own row in Activity,
memory 1 GiB, counted in capacity), no network except the Chest's API and the
AI gateway. It never touches production data unless its data switch is on.
One run at a time; a run stops at 30 minutes, 300 steps, or €[2] (per-run
ceiling inside the monthly budget).

**Default status: Observer**, data switch off. It watches, explains and
proposes. The owner or an admin may raise it to Maintainer so it rolls back,
restarts and applies catalogue updates by itself; anything beyond its status
becomes a proposal.

**Proposals** use the existing mechanisms: an inbox item
([notifications](members-and-notifications.md)) with a plan (“I will:
1) roll back CRM to version 12, 2) restart CRM”) that a human runs with one
click, with that human's rights ∩ Perseus's; or an approval request for what
only the owner decides.

**Its jobs (v1)**

| Job | Trigger | Result |
|---|---|---|
| **Maintenance findings** | Weekly per tool, and on signals: dependency advisories on linked repositories, failed builds, error spikes, quota near full, a new SDK or catalogue version | A finding in the inbox; the fix done within its status (rollback, restart, catalogue update) or proposed |
| **React to events** | Build failed, tool keeps restarting, capacity ≥ 85 %, a request declined | An explanation next to the alert, with a proposed fix |
| **Ask your Chest** | ⌘I panel on every page, for any member (answers about what that member can see) | Answers; an action is shown as a plan and runs only on a click |
| **Weekly report** | Monday | One inbox item to the owner and admins: what changed, what waits for a human, what it could not fix, what it spent |

Creating tools and fixing code wait for the code-writing decision above.

**Screens**

- **Team → Agents**: list of agents — name, kind, status, sponsor, last
  activity, state (active, paused, limit reached). Perseus first, sponsor
  shown as “The Chest”.
- **Perseus's page** (owner and admins): on/off, status and switches, AI
  connector and model (“Anthropic · claude-sonnet-…” · Change), monthly budget
  (“€3.40 of €10 this month”), safety limits with their current use, schedule
  (maintenance on/off, day), recent runs (when, trigger, steps, summary, cost,
  outcome; kept 30 days), Pause.
- **Connected agent's page**: status and switches (as in the consent screen),
  safety limits with their current use, recent calls, Pause, Disconnect.
- **Ask your Chest** panel: a side panel, the conversation, plans with
  Run / Cancel, a line “Perseus · €0.02”.

**Untrusted input.** Logs, tool data, repository files, issue texts are data
to Perseus, fenced and never instructions (as the MCP server already does).
What it can do is bounded by its status; what cannot be undone waits for the
owner.

## API and MCP

| Route (`/api/v1`) | For |
|---|---|
| `GET /me` | adds `agent: {id, name, kind, status, sponsor, dataAccess, limits}` |
| `GET /requests`, `POST /requests`, `GET /requests/{id}` | file and follow approvals |
| `GET /agents/me/limits` | current use of its safety limits |
| previews and promotion | in [Develop and test](develop-and-test-tools.md) |

Agent management (create, status, limits, pause, Perseus's configuration) is
**not** in `/api/v1`: portal only, humans only.

New MCP tools (each within the status; writes journaled): `watch_build`,
`requests`, `health`, `capacity`, plus the testing tools of
[Develop and test](develop-and-test-tools.md) (`check`, `run_tests`,
`deploy_preview`, `preview_logs`, `promote`).

## Data model

| Record (Chest) | Content |
|---|---|
| `installation/agents.json` | per agent: `id` (`agt_` + 26 base32), `name`, `kind` (`perseus`, `connected`), `client` (name, version from registration), `sponsor` (member id; `null` for Perseus), `status`, `tools` (all or ids), `dataAccess`, `limits` (values, off flags), `deployPolicy`, `created`, `expires`, `paused`, `lastSeen`; for Perseus `enabled`, `aiConnector`, `model`, `budget`, `schedule` |
| `installation/oauth/` | registered clients, authorization codes (10 min), refresh token hashes |
| `installation/requests.json` | requests: id, agent, sponsor, kind, target, sentence, reason, state, decided by/at |
| `installation/agent-journal.jsonl` | the existing journal, lines now carry `agent` and `sponsor` |
| `installation/agents/perseus/runs/` | Perseus's runs: trigger, steps summary, cost, outcome (30 days) |

## Limits and failure modes

| Event | Behaviour |
|---|---|
| Safety limit reached | `429 safety_limit`; sponsor (for Perseus: owner and admins) notified once; resumes at reset |
| Perseus's budget reached | Current run stops cleanly; new runs wait for next month or a higher budget; inbox item |
| Perseus's AI connector unusable (key refused, provider down) | Perseus paused; “Ask your Chest” says why; connected agents unaffected |
| Request not answered | Expires after 14 days; the agent is told |
| Bad version deployed by an agent | Watched for 10 minutes; clear regression (restarts, 5xx, error lines versus the previous version) → automatic rollback, sponsor and owner told |
| Sponsor leaves, token expires | Connected agent paused; reconnect through the consent |
| Central down | No effect, except GitHub rings and tokens (relayed by the central) |

## What to build, in lots

| Lot | Content |
|---|---|
| **AG1 Identities** | Agent principals, statuses, data switch, scope, safety limits and their counters (persisted), pause; Team → Agents and the agent pages; journal attribution |
| **AG2 Connection** | OAuth 2.1 authorization server in the portal, consent screen, remote MCP endpoint `/mcp`, local MCP sign-in, token rotation and revocation |
| **AG3 Approvals** | Requests, inbox items, Approve / Decline in the Chest, MCP `requests` |
| **AG4 Build loop** | `watch_build`, `health`, automatic rollback after a bad version |
| **DT** | [Develop and test](develop-and-test-tools.md): `chest check`, `chest dev`, previews |
| **AG5 Perseus** | Sandbox, AI connector and budget on the [AI gateway](ai-gateway.md), Ask your Chest (read-only first, then plans), maintenance findings, events, proposals, weekly report |
| *Deferred* | Agents writing code through the Chest (Chest-hosted Git or GitHub App write): a later, separate decision |

Proofs: VM proof of the consent flow with a real MCP client; limits and pause;
a request approved in the Chest; a Perseus run against a fake AI provider that
finds a failed build and proposes a rollback.

## Open questions

1. Perseus's default status: Observer (proposed) or Maintainer once the owner
   trusts it?
2. Can a plain member connect an agent limited to their own tools, or only
   request one? Proposed: request only, for now.
3. Default deploy policy for connected agents: deploy within status (proposed)
   or proposals until the owner switches it?
4. Perseus's budget default (€[10] a month) and per-run ceiling.
