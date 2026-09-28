# 2. How Chest works — the one-page map

The full sources are in `reference/` (see `reference/README.md`). This page is
the map; when in doubt, the contract (`reference/contract/application-contract.md`)
and the SDK README (`reference/chest-sdk/README.md`) win.

## The pieces

```
central (argentic.app)          one per world: sells and opens Chests
   │ opens
   ▼
a Chest (one server per company)
   ├── the portal               the team signs in, sees its tools, the bell (inbox), the team page
   ├── Compartment "tasks"      one tool = one isolated web server + its own database + its own files
   ├── Compartment "wiki"
   └── …                        installed from the store (GitHub org chest-by-argentic) or from the company's own GitHub
```

Vocabulary (full list: `reference/product/vision/concepts.md`):

| Word | Meaning |
|---|---|
| **Member** | A person of the company, invited into the Chest. Identified by a stable id `mbr_…` |
| **Owner / Admin** | Runs the Chest: installs tools, approves permissions, sets who opens what |
| **Group** | A set of members at the Chest level ("Sales", "Accounting") |
| **Role** | What a member is **inside one tool** ("editor", "reader"). Declared by the tool in `chest.json`, assigned by the admin per group or person ("Sales → editor") |
| **Builder** | The member who maintains a given tool (deploys, reads its logs) |
| **Visitor / end user** | Someone on a tool's **public** part: anonymous today; "tool accounts" later |

## A tool is a web server

A tool (contract v2) is an **ordinary Node web server** that the Chest builds
from the tool's repository and runs in a sandbox. The Chest reads `chest.json`
at the repository root, runs `npm ci`, the build script, then the start
script, and puts its **front** before it.

Every tool has up to **two addresses**:

| Host | Who | What the tool sees |
|---|---|---|
| **Team host** `https://<tool>-chest.<chest>.argentic.work/chest…` | Members who have the tool, signed in by the Chest | Every request under `/chest` carries a signed `Chest-Member` header; `member(request)` gives who it is and their role |
| **Public host** `https://<tool>.<chest>.argentic.work/…` | Anyone on the Internet (only if `"public": true`, and only once the owner opens it) | No member, ever. Anonymous |

So the private app lives under `/chest`, the public pages at the root. The
portal opens a tool's `/chest` in a new tab, on the tool's own origin: **the
tool owns its whole page** — its own layout, its own design. The portal only
shows its tile (icon, title, badge) and the bell (its notifications).

## The manifest `chest.json`

Declares what the tool is and **asks** for permissions; the owner approves
them in plain sentences; the server enforces them whatever the code does.

```json
{
  "version": 2,
  "name": "tasks",
  "title": "Tasks",
  "description": "Plan the team's work, assign it and see what is late.",
  "icon": "chest/icon.svg",
  "preview": "chest/preview.png",
  "roles": ["manager", "member"],
  "role_labels": { "manager": "Manager", "member": "Member" },
  "public": false,
  "capabilities": ["database", "files", "members", "notifications"],
  "receives": ["member.*"],
  "env": ["TASKS_WEEK_START"],
  "build": {
    "runtime": "node",
    "install": "npm ci",
    "command": "npm run build",
    "start": "npm start",
    "port": 3000,
    "static": ["/_next/static/"]
  }
}
```

Key rules (exact grammar: contract, "Building from source"):

- `name`: the tool's identifier (lowercase). `title` ≤ 48 chars,
  `description` ≤ 160.
- `icon`: `chest/<name>.svg|png`, ≤ 64 KiB. SVG without script, `href`, `use`,
  `image`, `foreignObject`, `url(`. `preview`: `chest/<name>.png|jpg|webp`,
  ≤ 512 KiB, ≤ 4096 px. Both are shown in the store and on the home tiles.
- `roles`: from strongest to weakest. Owner, admins and builders enter with the
  **first** one. `role_labels` give them words.
- `public: true` asks for a public part; `"csp": "tool"` lets the public part
  send its own Content-Security-Policy (needed by Next.js, see Forms).
- `capabilities` (closed list, each one is a permission): `database`,
  `files`, `members`, `members.email`, `notifications`. `receives:
  ["member.*"]` (with `members`) subscribes to lifecycle events.
- `network`: outbound hosts the tool may reach (each one a permission). No
  entry = no network at all.
- `env`: names of variables the admin must set (secrets, settings). Values are
  never in the repository.
- `build`: exactly these shapes (`npm ci`, `npm run <script>`, `npm start`);
  never a shell command.
- Unknown keys are refused. 16 KiB max.

Required at the repository root: `chest.json`, `package.json`,
`package-lock.json`. Optional: `migrations/NNNN_name.sql`. Repository archive
≤ 32 MiB, no `node_modules/`, no symlinks.

## What the SDK gives a tool today (`@argentic/chest-sdk` 0.2.0)

| Need | SDK | Capability |
|---|---|---|
| Who is this request? name, photo, role, groups, admin/builder | `member(request)` | always |
| Its own PostgreSQL database + migrations run by the Chest | `databaseUrl()` | `database` |
| Private files (1 GiB default, up to 100 GiB asked), signed 15-min links, thumbnails, direct uploads from the browser | `files.*` | `files` |
| Who else has the tool: list, search, lookup ids → names, groups | `members.*` | `members` (+ `members.email`) |
| Badge on its tile, items in the Chest's bell | `notifications.*` | `notifications` |
| Told when a member changes, loses access, leaves, or asks for erasure | `events.handle` on `POST /chest-events` | `receives` |
| Tests without a Chest: fake Chest server, signed members, emitted events | `testing` | — |

Read `reference/chest-sdk/README.md` (full reference) and
`reference/chest-sdk/AGENTS.md` (the short path and the pitfalls) before
writing any tool.

## The sandbox: hard limits

| Limit | Value | Consequence for you |
|---|---|---|
| Runtime | Node 22 only (Python later) | TypeScript/JavaScript |
| Memory | 256 MiB default (owner may choose 512 or 1024) | Keep the server light; Next.js fits (~150 MiB) |
| CPU | 1 | No heavy work in requests |
| Build | 10 minutes, 1.5 GiB | Next.js with `next build --webpack` (Turbopack uses too much memory) |
| Disk | Read-only root, `/tmp` 64 MiB | Data in the database, files through `files`. Nothing cached on disk at runtime |
| Network | None, unless declared in `network` (through the Chest's proxy) | No CDN, no Google Fonts, no external API unless declared. **Self-host fonts and icons** |
| Requests | 16 MiB body, 5 min to answer, 64 in flight | Large uploads go browser → Chest (`files.uploadUrl`) |
| WebSocket | **Refused** (`Upgrade` → 501) | No realtime push. Poll (e.g. every 10–30 s when visible) |
| Background work | None: no cron, no queue, no worker | Nothing runs unless a request comes. Do work lazily on the next request |
| Mail | **Not available yet** | No emails to anyone |
| AI | **Not available yet** (AI gateway specified) | No LLM calls unless you declare a provider in `network` — prototype only |
| Outside users | **No accounts for the public part yet** | Public pages are anonymous |
| Payments | **Not available yet** (Stripe connector planned) | Prototype only |
| Tool ↔ tool | **Not available yet** (events between tools planned) | Each tool is alone for now |
| Database | PostgreSQL, 10 connections, 30 s per query | Postgres does search (`tsvector`, `pg_trgm`), queues, counters |

What is planned but not built is in `reference/product/specs/` (AI gateway,
develop-and-test, tool storage extras, agents) and
`reference/product/proposals/sdk-and-agents-vision.md` (scheduled tasks, jobs,
realtime, audit log, public accounts, payments, webhooks…). That proposal is
**not decided**: your SDK report is expected to confirm, challenge or reorder
it, with evidence from the tools you built.

## Where to look

| Question | File |
|---|---|
| Exact manifest and runtime rules | `reference/contract/application-contract.md` ("Building from source", "Server tools", "Next.js on Chest") |
| A real store tool (Next.js, database, public + private parts, i18n, CSP) | `reference/forms/` — read its `README.md` and `AGENTS.md` |
| Every SDK feature used in one small server (members, files, uploads, notifications, events) | `reference/testweb/` — plain `node:http`, its `README.md` lists every route |
| The SDK itself, its tests | `reference/chest-sdk/` |
| Product intent | `reference/product/` |
