# Progress

The agent's memory: read whenever a run (re)starts, updated after every
meaningful step (brief/07-plan.md).

## Now

Step 1: the ranking and the research.

## Environment

Checked 2026-09-28 in the cloud container:

| Need | Here | How we work |
|---|---|---|
| Node / npm | Node 22.22.2, npm 10.9.7 | Same major as the Chest (Node 22) |
| PostgreSQL | PostgreSQL 16 installed (`service postgresql start`; user `postgres`/`postgres` on 127.0.0.1:5432) | Real Postgres for tests and the dev harness; one database per tool (`createdb <tool>`). Not started at boot: start it on every run |
| Container runtime | `docker` CLI present, no daemon | Not needed |
| Headless browser | Chromium 1194 in `/opt/pw-browsers` (Playwright) | Screenshots via Playwright (`executablePath` if versions differ) |
| Web | Web search and fetch work; npm registry and GitHub reachable; some hosts refused by the proxy (e.g. google.com) | Research through web search; GitHub pages for licences |
| Disk / CPU | ~30 GB free, 4 CPUs, 15 GB RAM | One `node_modules` per tool is fine; delete `.next` after verifying |

## Steps

| Step | State |
|---|---|
| 0. Environment | done |
| 1. Ranking and research | to do |
| 2. Foundations | to do |
| 3. Tools | to do |
| 4. The report | to do |
| 5. Better | to do |

## Tools

_One row per chosen tool, in ranking order, once step 1 is done._

| Rank | Tool | Folder | Replaces | Research | Built | Design | SDK proposals used | Verified |
|---|---|---|---|---|---|---|---|---|

## SDK working copy

`sdk/` = `@argentic/chest-sdk` 0.2.0 (Chest-SDK `387ae90`). Proposals added:

_None yet._

## Questions for the owner

_None yet._

## Decisions taken

- Owner, 2026-09-28: Forms (`reference/forms`) is a first prototype with no quality value. Take from it only what the Chest imposes (CSP nonce, webpack build, read-only disk); the template, architecture and UX follow our own bar.

- Tools are MIT-licensed, © 2026 Argentic, like the SDK (to be confirmed by the owner).
