# Connected agents

**Specified 28 September 2026 from Paul's decisions of the same day; to build
after [Perseus Code](perseus-build.md)** (batch AG in
[status.md](../03_roadmap/status.md), lower priority than PB, decided by Paul
on 28 September). It turns part (b) of the
[SDK and agents vision](../98_travail/sdk-and-agents-vision.md) into decisions.
What exists today (personal tokens, `/api/v1`, the local MCP server,
GitHub linking) is in [For agents](for-agents.md) and
`03_code/01_chest-by-argentic/docs/architecture.md`. Testing before production
(`chest check`, `chest dev`, previews) is in
[Develop and test tools](develop-and-test-tools.md); AI in
[AI gateway](ai-gateway.md).

**Perseus**, the Chest's own agent, is specified in
[Perseus Code](perseus-build.md) only: Perseus v1 is the build agent
(conversations to create and evolve tools, live preview, publish with
approval). It acts for the builder who writes to it and has no status of its
own. What was once planned here for Perseus (Ask Perseus about your Chest,
maintenance, events, weekly reports, Perseus statuses and budget) is in
[Later (not planned)](perseus-build.md#later-not-planned).

This page is about **connected agents**: Claude Code on a laptop, Cursor,
Codex, a CI job — agents a person brings to the Chest.

## Goals

1. **Bring any agent.** Claude Code, Cursor, Codex… connect with a browser
   consent (OAuth), not a token pasted in a file.
2. **Every connected agent is an identity with a human sponsor**, a status and
   a journal. The boundary is what a status allows, not a confirmation in a
   chat.
3. **Irreversible actions are always decided by the owner, inside the Chest.**
4. **Keep code hosting simple.** The current GitHub flow stays as it is.

## What a connected agent is

| | |
|---|---|
| Runs | Wherever its human runs it |
| Thinks with | Its own model, its own bill: its AI spend is not the Chest's business (**no money limit**) |
| Safety limits | Yes (below) |
| Sponsor | The human who connected it, who answers for it |
| Created by | The owner or an admin, through the consent screen |

Personal access tokens stay for scripts and CI (read-only unless their
member chooses read and write; the owner's and admins' live 30 days at most;
they ask no sign-in code — decided 29 September 2026, security audit);
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
| **Never** | invite, remove or erase people; create or change agents; billing and money; the owner's settings; Perseus Code (a portal feature for humans) | | | |

- **Reading tool data is a separate switch** (off by default): rows through
  the database routes and file contents. Deploying code and reading personal
  data are different powers.
- **“Its tools”** = the tools it proposed, or to which it was assigned — the
  same rule as for a builder member, who changes only the tools they
  created or were given
  ([Perseus Code](perseus-build.md), “Builders”).
- **Scope**: all tools, or a chosen list.
- **No escalation**: an agent never grants what its status does not hold,
  never creates an agent, never changes its own limits or configuration.
- **Deploy policy**: by default, a Builder or Maintainer agent's version that
  asks nothing more **deploys** when the agent may read that tool's data
  (the switch above); otherwise it waits for the owner or an admin — the
  rule of builder members since 29 September 2026: code that runs reaches
  the data ([Security](security.md), “Builders, admins and agents”). The
  owner can set “Its versions wait for my approval” per agent (the
  existing proposal mode).

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
| Connection validity | 90 days, renewable by its sponsor |

When a limit is reached: `429 safety_limit` with the limit's name and when it
resets; the agent's page shows it; its sponsor gets one inbox item. **Pause**
(one switch on the agent's page, for the owner, an admin or the sponsor)
stops every token of that agent at once.

## Approvals, in the Chest

A request (from any agent, for anything in the approval row) lands in the
owner's inbox (and admins' when an admin may decide it) — the notifications of
[Members and notifications](members-and-notifications.md) — with:

- what, in the approval sentences (“CRM asks in addition: can reach
  api.hubspot.com”); for a deletion, what disappears and whether a backup
  holds it;
- who: the agent, its sponsor, the reason the agent gave;
- **Approve / Decline**, only in the Chest's portal with a member session —
  never through `/api/v1`, never through MCP. An agent cannot answer for a
  human.

The agent follows its request (`GET /api/v1/requests/{id}`, MCP `requests`)
and carries on with other work. Requests expire after 14 days.

**Already true for personal tokens (29 September 2026, security audit
M3):** a token never installs a tool, links a repository or approves a
version — the owner's included —: `403 approval_required` with
`approve_url`, the page of the Chest where the owner or an admin decides.
Installing a tool or linking a repository for a new tool records a
**proposal** of the token's member, the request AG3 will generalise. The MCP
server's two-step confirmation is **removed**: a confirmation the agent's
own software checks is no confirmation; the MCP server says
`approval_required` to the model, with the page to give its human.

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
  member or a builder may **ask** (“Request an agent”), which becomes an
  approval request — open question 1.
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
credentials, as today.

**Perseus writes code only inside Perseus Code workspaces** (decided
28 September 2026, [Perseus Code](perseus-build.md)): each project's source
lives on the Chest with an internal history of checkpoints — not a Git
service, no remote, nothing opened to the outside. Perseus never writes to
GitHub and never changes a tool in service directly; a builder publishes the
project through the normal approval. Export in v1 is a download (`.zip` or a
Git bundle).

Opening code writing wider — to GitHub, or the workspaces as a Git remote for
connected agents — is a **later, separate decision**, taken only if it can
stay simple for the user. Options, later, if simple:

- **Chest-hosted Git** — the Perseus Code workspaces exposed as a remote
  (`git push chest main`) for connected agents; costs a Git service to run and
  secure.
- **GitHub App write** — `contents: write` on repositories the owner opts in;
  reverses the 24 September decision and makes every installation accept new
  permissions.

## Screens

- **Team → Agents**: list of connected agents — name, client, status,
  sponsor, last activity, state (active, paused, limit reached).
- **Connected agent's page**: status and switches (as in the consent screen),
  safety limits with their current use, recent calls, Pause, Disconnect.

**Untrusted input.** Logs, tool data, repository files, issue texts reach an
agent as data, fenced and never instructions (as the MCP server already
does). What an agent can do is bounded by its status; what cannot be undone
waits for the owner.

## API and MCP

| Route (`/api/v1`) | For |
|---|---|
| `GET /me` | adds `agent: {id, name, client, status, sponsor, dataAccess, limits}` |
| `GET /requests`, `POST /requests`, `GET /requests/{id}` | file and follow approvals |
| `GET /agents/me/limits` | current use of its safety limits |
| previews and promotion | in [Develop and test](develop-and-test-tools.md) |

Agent management (create, status, limits, pause) is **not** in `/api/v1`:
portal only, humans only.

New MCP tools (each within the status; writes journaled): `watch_build`,
`requests`, `health`, `capacity`, plus the testing tools of
[Develop and test](develop-and-test-tools.md) (`check`, `run_tests`,
`deploy_preview`, `preview_logs`, `promote`).

## Data model

| Record (Chest) | Content |
|---|---|
| `installation/agents.json` | per agent: `id` (`agt_` + 26 base32), `name`, `client` (name, version from registration), `sponsor` (member id), `status`, `tools` (all or ids), `dataAccess`, `limits` (values, off flags), `deployPolicy`, `created`, `expires`, `paused`, `lastSeen` |
| `installation/oauth/` | registered clients, authorization codes (10 min), refresh token hashes |
| `installation/requests.json` | requests: id, agent, sponsor, kind, target, sentence, reason, state, decided by/at |
| `installation/agent-journal.jsonl` | the existing journal, lines now carry `agent` and `sponsor` (Perseus Code's lines carry `agent: perseus` and the builder) |

## Limits and failure modes

| Event | Behaviour |
|---|---|
| Safety limit reached | `429 safety_limit`; sponsor notified once; resumes at reset |
| Request not answered | Expires after 14 days; the agent is told |
| Bad version deployed by an agent | Watched for 10 minutes; clear regression (restarts, 5xx, error lines versus the previous version) → automatic rollback, sponsor and owner told |
| Sponsor leaves, token expires | Agent paused; reconnect through the consent |
| Central down | No effect, except GitHub rings and tokens (relayed by the central) |

## What to build, in lots

After Perseus Code (order decided by Paul on 28 September 2026).

| Lot | Content |
|---|---|
| **AG1 Identities** | Agent principals, statuses, data switch, scope, safety limits and their counters (persisted), pause; Team → Agents and the agent pages; journal attribution |
| **AG2 Connection** | OAuth 2.1 authorization server in the portal, consent screen, remote MCP endpoint `/mcp`, local MCP sign-in, token rotation and revocation |
| **AG3 Approvals** | Requests, inbox items, Approve / Decline in the Chest, MCP `requests` |
| **AG4 Build loop** | `watch_build`, `health`, automatic rollback after a bad version |
| **DT** | [Develop and test](develop-and-test-tools.md): `chest check`, `chest dev`, previews |
| *Deferred* | Agents writing code beyond Perseus Code workspaces (the workspaces as a Chest-hosted Git remote, or GitHub App write): a later, separate decision |

Proofs: VM proof of the consent flow with a real MCP client; limits and pause;
a request approved in the Chest.

## Open questions

1. Can a member or a builder connect an agent limited to their own tools, or
   only request one? Proposed: request only, for now.
2. Default deploy policy for connected agents: deploy within status (proposed)
   or proposals until the owner switches it?
