# Develop and test tools

**Specified 28 September 2026 from Paul's requirement of the same day; to
build** (batch DT in [status.md](../03_roadmap/status.md)). A developer or an
agent must know a tool works on a Chest **before** it reaches the real one.
Today the SDK offers `@argentic/chest-sdk/testing` (`signAssertion`,
`fakeChest` for members, files, notifications and events): unit tests only.
This page adds three levels, each closer to production:

| Level | Command | Answers | Needs |
|---|---|---|---|
| 1 | `chest check` | “Will the Chest accept this repository?” | Node only, one second |
| 2 | `chest dev` | “Does the tool work as the Chest runs it?” | Node; Podman or Docker for the database |
| 3 | Preview | “Does it work on our Chest, with our setup?” | A push to a branch |

Agents use all three through MCP ([Perseus and connected agents](chest-agent.md)).
Previews are what make an agent's “deploy without waiting” safe.

## Goals

1. **The same rules everywhere.** `chest check`, the Chest's build and the
   Chest's install say the same thing, in the same words, from one source.
2. **Local first, like `vercel dev` and `supabase start`.** A tool runs on a
   laptop exactly as the Chest runs it — hosts, routing, signed member,
   `CHEST_API`, database, migrations — with a panel to play any member.
3. **Previews that never touch production.** A branch runs at its own
   address, with its own database and files, visible to members only, and is
   promoted in one click.

## Level 1 — `chest check`

```sh
npx @argentic/chest-sdk check            # in the tool's repository
npx @argentic/chest-sdk check --against live.json   # also: what this version asks in addition
```

(The package declares a `chest` binary: once the SDK is a dependency,
`npx chest check`.)

**What it checks — exactly the Chest's rules:**

- `chest.json`: version 2, every key and value rule (name, roles and labels,
  `public`, `csp`, `env`, `build` vectors, port, `static`, `network`,
  `capabilities`, `files`, `ai`, presentation), 16 KiB, unknown and duplicate
  keys;
- required files at the root: `package.json`, `package-lock.json`; `chest/`
  images (type by bytes, sizes, SVG rules); no `node_modules/`, no links; the
  archive limits (32 MiB compressed, 256 MiB unpacked, 20,000 entries) on what
  `git archive` would produce;
- `build` scripts exist in `package.json` (`command`, `start`, `test`);
- `migrations/`: names `NNNN_name.sql`, count and sizes, UTF-8 without NUL, no
  file that ends its own transaction; with `--against`, that no migration
  already shipped was changed or removed;
- the permissions this version asks, in the approval sentences, and with
  `--against` (a `chest.json` or `--tool <name>` on a linked Chest) what it
  asks **in addition** — what the owner will be asked;
- hints (never refusals): SDK calls with no matching capability (`files` used,
  not declared), `ai` used without handling `AiCapReached` or `AiUnavailable`, hosts
  reached in code that `network` does not list.

Output: one line per finding, the Chest's reason code and sentence
(`no_lock — package-lock.json is missing at the root`), exit code 1 on any
refusal; `--json` for agents and CI.

**Sharing the rules with the Go validator — decision: compile the Chest's Go
validator to WebAssembly and ship it in the SDK package.** The same packages
that decide on the Chest (`chest/sourcefile`, `chest/sourcearchive`,
`common/packagefile`, the migration checks) are built with `GOOS=wasip1`
into `check.wasm` and run by Node's `node:wasi`, with read access to the
repository only.

| Option | Verdict |
|---|---|
| JSON Schema generated from Go | Expresses keys and patterns, not the rest: image bytes, archive shape, “covered by another entry” for `network`, migration history, the permission difference. A second implementation for the rest would drift. **Kept only for editors**: `chest.schema.json` generated from the same Go types, referenced by `"$schema"` for completion. |
| A small published native binary | Same code, but one binary per OS and architecture, downloaded at install (a postinstall script — a supply-chain risk we refuse) or bundled (tens of MB). |
| **Go → WebAssembly in the npm package** | Same code, one file (≈ 3 MB) for every platform, no postinstall, no network, sandboxed by WASI. Built and tested by the Chest repository's release, vendored into the SDK by the existing sync script, version printed by `chest check --version`. |

A test in the Chest repository runs the same fixtures through the Go code and
through `check.wasm` and requires identical results.

## Level 2 — `chest dev`

```sh
npx chest dev                  # local Node, fastest
npx chest dev --container      # the Chest's pinned Node image and limits, through Podman or Docker
```

**What it runs, as the Chest runs it:**

| Chest | `chest dev` |
|---|---|
| Public host `<tool>.<chest>…` | `http://<tool>.localhost:4000` (only when `public: true`) |
| Team host `<tool>-chest.<chest>…/chest` | `http://<tool>-chest.localhost:4000/chest` |
| Signed `Chest-Member` assertion | Signed by a dev key for the member chosen in the panel; the SDK accepts that key only when `CHEST_DEV` is set, a name the Chest reserves (a tool cannot set it) |
| `PORT`, `NODE_ENV`, variables | Same variables; values from `.env.local` (never read by the Chest) |
| Build | `npm ci`, `command`, then `start`, with the same argument vectors; `--container` builds with the same generated recipe and memory limit |
| `static` prefixes, `/_chest/…` routes | Same routing |
| `CHEST_API` | A local server with the same routes, backed by `.chest/dev/` |
| PostgreSQL | A local container of the Chest's pinned PostgreSQL version, `chest-dev-<tool>`; migrations played **by the same rules** (in name order, one transaction each, `chest_migrations` table, as the tool's role) |
| Network egress | A local proxy that **warns** on hosts not in `network` (`--strict`: refuses them) |
| AI | The gateway's routes, answered by canned replies, or passed to the developer's own key (`CHEST_DEV_AI_KEY` in `.env.local`), with the same errors (`--ai-exhausted` to test degradation) |

**The fake `CHEST_API` is `fakeChest`.** The testing module's fake becomes a
server the dev runner starts, so unit tests and `chest dev` share one
implementation:

- **members**: a small list in `.chest/dev/members.json` (three by default:
  an owner, a manager, a plain member), groups, roles, photos;
- **files**: on disk under `.chest/dev/files/`, with upload URLs, thumbnails
  (same sizes), public files, quotas;
- **notifications**: an inbox and badges shown in the panel;
- **events**: emitted on demand from the panel (`member.updated`,
  `access.revoked`, `member.removed`, `member.erased`), signed `Chest-Event v1`,
  delivered to `/chest-events` with the Chest's retry rules;
- **ai**: as above.

**The panel**, `http://localhost:4000/_chest/dev`, in the Chest's look:

```
Chest dev · forms                                          Running · rebuilt 10:42

Signed in as    [ Léa Martin — manager ▾ ]   Groups: Sales   [ Sign out ]
Open            Team part ›   Public part ›

Inbox (2)       Badges        Files (14)        Events              Database
  "3 new responses"  Forms: 3     uploads/…       Emit member.removed ›   8 tables · 3 migrations
Check           ✓ chest.json  ✓ migrations  ! code uses "files": declared
```

Switching member, role or groups changes the next request's assertion; no
restart. `chest dev --reset` empties the database and `.chest/dev/`;
`seed.sql` at the root (optional, never used in production) fills a fresh
database after the migrations.

## Level 3 — Previews on the Chest

**A branch runs as a preview**: built by the Chest, running beside the
version in service, **never in service**.

- **Source**: a push to any branch other than the tool's production branch
  of a linked GitHub repository (the ring already says which branch moved).
  Or “Preview this branch” on the tool's page.
- **Addresses**: team `<tool>--<branch>-chest.<chest>…/chest`, public
  `<tool>--<branch>.<chest>…` (the branch name reduced to a host label). Both
  **require a member session with access to the tool**, even for the public
  part: a preview is never on the Internet. “Share” gives one person a link
  valid 7 days, owner or admin only.
- **Banner**: every HTML page of a preview shows a thin bar, “Preview · branch
  `new-invoice` · not in service · Promote ›”, inserted by the front after
  `<body>` with a stylesheet from `/_chest/preview.css` (no script); other
  responses carry `Chest-Preview: <branch>`. The assertion carries
  `env: "preview"` (`member.env` in the SDK) so a tool can, for instance, not
  send real mail.
- **Data**:
  - **Empty** (default): a fresh database of its own, migrations, then
    `seed.sql` if present; empty files.
  - **Anonymised copy** (owner switches it on per tool): the production
    schema and rows copied through the tool's declared map —
    `"preview": {"anonymise": {"contacts.email": "email", "contacts.name":
    "name", "notes.body": "text"}}` — each listed column replaced by a fake of
    that kind; **tables not listed are copied empty**, never as they are. Then
    the branch's new migrations. Files are not copied.
  - Never the production database itself.
- **Permissions**: a preview has the version's permissions **only as far as
  production already has them**, plus its own database and files. Anything
  more (a new `network` host, `members`, `ai`, a public part) waits for the
  same approval as a version, before the preview starts. Secrets are not given
  to previews unless the owner marks a variable “Available to previews”;
  other variables are copied.
- **Resources**: the tool's memory choice (or 256 MiB), counted in capacity; a
  preview idle 30 minutes is stopped and starts again on the next request (a
  few seconds, said on the page). At most 3 previews per tool; the oldest idle
  one gives its place.
- **Removal**: when the branch is deleted or merged, after 14 days without a
  push, or by hand. Its database, files and logs go with it.
- **Promote**: “Promote to live” deploys **the preview's built image** (no
  rebuild): the production migrations it adds run first (a migration must
  leave the previous version working, as today), then the switch without
  downtime. The usual rules decide who may: a version that asks nothing more
  → its builder or an agent within its status and deploy policy; otherwise an
  approval request to the owner in the Chest.
- **Build tests**: optional `build.test` in `chest.json` (`npm run <script>`),
  run by the Chest after the build in the same sandbox (no network, a fresh
  empty database); a failure marks the build “Tests failed” and blocks
  promotion. Shown in the build log.

**On screen**: the tool's Deployments tab gains a **Previews** section — branch,
commit, author (member or agent), state, address, age, “Promote”, “Remove” —
like Vercel's preview deployments. Logs have a preview selector.

## For agents

| MCP tool | Route (`/api/v1`) | Does |
|---|---|---|
| `check` | `POST /tools/{app}/check {branch}` | Runs the validator on the Chest against a branch; with the difference from production |
| `run_tests` | `POST /tools/{app}/previews {branch, testsOnly: true}` | Builds and runs `build.test`; result and log tail |
| `deploy_preview` | `POST /tools/{app}/previews {branch, data: "empty" \| "anonymised"}` | Builds and starts a preview; its address |
| `previews` | `GET /tools/{app}/previews` | List, states |
| `preview_logs` | `GET /tools/{app}/previews/{id}/logs` | Runtime and build logs |
| `promote` | `POST /tools/{app}/previews/{id}/promote` | Promotes, or files an approval request when the rules say so |
| `remove_preview` | `POST /tools/{app}/previews/{id}/remove` | |

A connected agent on a laptop also runs `chest check` and `chest dev`
locally; the SDK's `AGENTS.md` and the templates tell it to (check → unit
tests → `chest dev` → push a branch → preview → promote).

## Limits

| | Value |
|---|---|
| `chest check` | read-only, no network; the repository as `git archive` would pack it |
| `chest dev` | one tool per process; several tools on different ports |
| Previews per tool | 3 (oldest idle replaced) |
| Idle stop | 30 minutes |
| Preview lifetime without a push | 14 days |
| Shared preview link | 7 days, one person, owner or admin |
| `build.test` | inside the 10-minute build, no network |

## What to build, in lots

| Lot | Where | Content | Roadmap |
|---|---|---|---|
| **DT1 Check** | Chest repo + SDK | Go validator → `check.wasm`; `chest.schema.json`; `chest check` CLI with `--against`, `--json`; parity test | With DX (phase 1); first |
| **DT2 Dev** | SDK | `chest dev` runner, local front with the two hosts, dev assertion key, `fakeChest` as a server, panel, PostgreSQL container and migrations, egress warnings, AI stub; `--container` | With DX |
| **DT3 Build tests** | Chest | `build.test`, “Tests failed”, promotion blocked | After DT1 |
| **DT4 Previews** | Chest | Branch builds, preview hosts behind member sign-in, banner, empty databases and seed, idle stop, removal, Promote, Previews section, `/api/v1` routes and MCP tools | With the agents' build loop (AG4) |
| **DT5 Anonymised copy** | Chest | `preview.anonymise`, the copy, owner switch | After DT4 |

Proofs: fixtures accepted and refused identically by Go and by `check.wasm`;
the test bench and Forms run under `chest dev` (member switch, upload,
notification, event); VM proof of a preview from a GitHub branch, promoted,
then removed on merge.

## Open questions

1. `chest` binary in the SDK package (as asked; adds ≈ 3 MB to every tool's
   dependencies) or a separate `@argentic/chest` CLI package? Proposed: in the
   SDK now, split later if the size matters.
2. Anonymised copy: is a declared map enough for GDPR, or should it be
   owner-only and logged (proposed both)?
