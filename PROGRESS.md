# Progress

The agent's memory: read whenever a run (re)starts, updated after every
meaningful step (brief/07-plan.md).

## Now

Step 3: building the tools. Tasks is done (reference implementation).
Wiki, Leave and News are being built by parallel builder agents following
`lab/BUILDING.md` (ports 4300, 4400, 4500); the lead reviews, verifies and
commits each one. Next: the `mail` proposal (for Support, Booking, Hiring),
then Clients, Expenses, People. Each tool starts
from `lab/template` (`node scripts/new-tool.mjs <kind> <name>`), is verified with
`npm test`, `npm run build`, the harness (`lab/chest-dev`) and screenshots, then
committed and pushed.

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
| 1. Ranking and research | done — `reports/01-ranking.md`, 17 files in `reports/02-open-source/`, prices in `reports/01-pricing-sources.md` |
| 2. Foundations | done — `lab/template` (tested, built, run, screenshots), `lab/chest-dev` (dev.mjs, screens.mjs), `scripts/check-manifest.mjs`, `new-tool.mjs`, `add-font.mjs`, `contrast.mjs`, `build-showcase.mjs` |
| 3. Tools | to do |
| 4. The report | to do |
| 5. Better | to do |

## Tools

_One row per chosen tool, in ranking order, once step 1 is done._

| Rank | Tool | Folder | Replaces | Research | Built | Design | SDK proposals used | Verified |
|---|---|---|---|---|---|---|---|---|
| 1 | Tasks | `tools/private/tasks` | Trello, Asana, Monday | ✓ | ✓ | bright workshop (Space Grotesk + Inter, sun, ink outlines) | locale, schedules | ✓ 26 tests (PGlite + PostgreSQL), build, manifest, 12 browser flows, screens |
| 2 | Wiki | `tools/private/wiki` | Notion, Confluence | ✓ | ✓ | warm paper, deep green (Newsreader + Source Sans 3) | locale | ✓ 33 tests (PGlite + PostgreSQL), build, manifest, 14 browser flow steps, screens |
| 3 | Leave | `tools/private/leave` | Lucca Absences, Factorial | ✓ | ✓ | sea-side calm (Nunito + Nunito Sans, sky blue, sunset coral) | locale, schedules | ✓ 41 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, screens |
| 4 | News | `tools/private/news` | Workvivo, Staffbase | ✓ | ✓ | newspaper (Fraunces + Libre Franklin, ink and red) | locale, schedules | ✓ 33 tests (PGlite + PostgreSQL), build, manifest, 9 browser flows, screens |
| 5 | People | `tools/private/people` | BambooHR directory | ✓ | ✓ | warm portrait gallery (Outfit, cream, terracotta, plum ink) | locale, schedules | ✓ 22 tests (PGlite + PostgreSQL), build, manifest, 13 browser flows, screens |
| 6 | Clients | `tools/private/crm` | HubSpot, Pipedrive | ✓ | — | — | locale | — |
| 7 | Expenses | `tools/private/expenses` | N2F, Expensify | ✓ | — | — | locale | — |
| 8 | Support | `tools/public-and-private/helpdesk` | Zendesk, Freshdesk | ✓ | ✓ | calm counter (Atkinson Hyperlegible, teal, coral, butter notes) | locale, mail, schedules, public uploads | ✓ 13 tests (PGlite + PostgreSQL), build, manifest, 12 browser flows, screens |
| 9 | Rooms | `tools/private/rooms` | Robin, deskbird | ✓ | — | — | locale | — |
| 10 | Timesheets | `tools/private/timesheets` | Harvest, Toggl | ✓ | — | — | locale | — |
| 11 | Booking | `tools/public-and-private/booking` | Calendly | ✓ | ✓ | appointment card (Young Serif + Figtree, plum, mint, apricot) | locale, mail, schedules | ✓ 33 tests (PGlite + PostgreSQL), build, manifest, 11 browser flows, screens |
| 12 | Hiring | `tools/public-and-private/hiring` | Teamtailor, WTTJ | ✓ | — | — | locale, public uploads (to design) | — |
| 13 | Equipment | `tools/private/equipment` | Snipe-IT | ✓ | — | — | locale | — |
| 14 | Polls | `tools/private/polls` | Doodle, Officevibe | ✓ | — | — | locale | — |
| 15 | Goals | `tools/private/goals` | Lattice Goals | ✓ | — | — | locale | — |
| 16 | Quotes | `tools/private/quotes` | Axonaut, Sellsy | ✓ | — | — | locale | — |
| 17 | Status | `tools/public-and-private/status` | Statuspage | ✓ | — | — | locale | — |

## SDK working copy

`sdk/` = `@argentic/chest-sdk` 0.2.0 (Chest-SDK `387ae90`). Proposals added:

- `member.locale` (+ `members.*` answers, `localeOf`, `locales`) — 0.3.0-studio.1
- `fakeChest({origin})`, `chest.upload()`, the fake Chest's front (uploads, links, photos); `files` accept http://localhost links — 0.3.0-studio.2
- `schedules` (scheduled tasks: `handle`, `verify`, cron `parseCron`/`nextRun`/`describeCron`/`checkSchedules`, `timeZone()` from `CHEST_TIMEZONE`), `fakeChest({schedules, timeZone})`, `chest.run()` — 0.3.0-studio.3. Manifest keys of proposals live in each tool's `chest.proposals.json` (a Chest refuses unknown keys in `chest.json`)

## To fold into the SDK report (from builders)

- People: `mail.send` to welcome a newcomer before day 1; events between tools (`person.hired` from Hiring starts the arrival checklist; Equipment adds "return the laptop"); a `member.added` event or `members.list({changedSince})`; a cheap total/ETag on `members.list`; `members.lookup` caches a minute in-process (tests must `members.forget()`); literals test trips on `>` in JSX; Next's route announcer is also `role=alert`.
- Wiki: the team host's address (`CHEST_ORIGIN` or `origin()`), for absolute links in exports; presence/realtime (who is editing) later; localized manifest title; Tiptap injects a `<style>` blocked by the nonce CSP (`injectCSS: false`); server actions mangle ProseMirror JSON (send strings); PGlite hid a µs-vs-ms timestamp comparison bug (test on real PostgreSQL); flows needing DB changes need a `/_dev/sql` hook; unknown whether a real Chest migration role may `create extension unaccent/pg_trgm` and text search configurations; import body size limit of the Chest front unknown.
- Studio (Booking): Node and Chromium ICU write some dates differently ("Monday 19 October" vs "Monday, 19 October"): format dates on the server, never in the first render of a client component (React hydration error 418). BUILDING.md.
- Leave: `mail.send` to members (approvers who never open the Chest); per-member secret feed (`feeds.token(memberId)` / `feeds.verify`) for iCal; the Chest's time zone outside schedules; manager relationship (`members.get(id).manager`); events between tools (`leave.approved` → Rooms, People); localized manifest title; template could ship `app/chest/not-found.tsx`; `toCsv` separator; `Catalogue["x"]` typing pattern in BUILDING.md; harness cannot screenshot another month. French leave rules marked "not verified" in README need a payroll check.
- News: bulk notification to everyone who has the tool, per language, as one call (`notifications.broadcast`) — today: members.list pages + grouping + 1,000/h quota; an "important" notification (above quota, or email fallback); localized manifest title (tile says "News" to French members); fake Chest ignores `files.url({thumbnail})` (no `no_thumbnail`); harness: `seed/files/` for sample files; `dev_locale` cookie shared across member switches; a safe way for a server component to write (visit marks while rendering).

## Questions for the owner

- **Tool titles are English only**: `chest.json` has one `title` and one `description`, so a French member sees "Leave" on the tile. Recommendation: localized `title`/`description` in the manifest (in the SDK report). Meanwhile titles are short English words.
- **Web research limits**: vendor sites and French official sites (legifrance, service-public, urssaf) were blocked by the proxy; legal figures came from search summaries and are marked so in each research file. A human should confirm them before a tool ships.

## Decisions taken

- Proposal manifest keys go in `chest.proposals.json`, not `chest.json`: a real Chest refuses unknown keys, and the tools must stay installable today. The harness and `scripts/check-manifest.mjs` read both.
- Tools after Tasks are built by builder agents in parallel (one folder each, no git), reviewed and committed by the lead.

- Owner, 2026-09-28: Forms (`reference/forms`) is a first prototype with no quality value. Take from it only what the Chest imposes (CSP nonce, webpack build, read-only disk); the template, architecture and UX follow our own bar.

- Tools are MIT-licensed, © 2026 Argentic, like the SDK (to be confirmed by the owner).
- Stack for every tool: Next.js 16 (webpack build) + React 19 + `postgres`, from `lab/template`. Tests run with Node's type stripping (`node --test test/*.test.ts`), against PGlite (dev dependency) or a real PostgreSQL (`TEST_DATABASE_URL`).
- Every tool uses the SDK working copy (for `member.locale`), packed in its `vendor/` by `scripts/add-sdk.mjs`.
- Style attributes are allowed by the CSP (`style-src-attr 'unsafe-inline'`), style and script elements need the nonce.
- `pkill -f` must use a bracket pattern (`pkill -f "[n]ext start"`): a plain pattern kills the running shell.
- Web search budget: the subagents used the 200 searches of the session during research; later research relies on raw.githubusercontent.com and npm.
