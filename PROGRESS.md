# Progress

The agent's memory: read whenever a run (re)starts, updated after every
meaningful step (brief/07-plan.md).

## Now

Step 3, well advanced. Done, verified and pushed (each: tests on PGlite and
PostgreSQL, build, manifest, browser flows, screenshots looked at): Tasks,
Wiki, Leave, News, People, Expenses, Support, Rooms, Booking, Clients, Polls, Equipment, Timesheets, Goals, Status (15 of 17).
Builders at work (background agents, one port each, no git; the lead
verifies with `scratchpad/verify.sh`-style runs and commits): Timesheets (5200), Hiring (5300),
Goals (5600), Quotes (5700), Status (5800). Builder brief: the Rooms/…
prompts follow `lab/BUILDING.md`; lessons are appended there.

Lead work between reviews: SDK proposals (studio.7: `chest`,
`notifications.broadcast`; manifest `translations`), the suite (Leave →
Rooms built), the SDK report (sections 4.1–4.7, 6 written), PROGRESS, PR.
Next after the builders: consolidate the report (step 4: priorities
table, public-facing tools §5), audits of every tool (security, a11y,
French), more suite links (Hiring → People, Clients → Quotes), showcase.

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
| 3. Tools | 15 of 17 done; Hiring, Quotes being built |
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
| 6 | Clients | `tools/private/crm` | HubSpot, Pipedrive | ✓ | ✓ | sales desk (IBM Plex Sans + Mono, slate, electric blue) | locale, schedules | ✓ 37 tests (PGlite + PostgreSQL), build, manifest, 20 browser flow steps, a11y audit, screens |
| 7 | Expenses | `tools/private/expenses` | N2F, Expensify | ✓ | ✓ | receipt paper (grotesk + monospace figures, forest green, zigzag tear) | locale, schedules | ✓ 43 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, screens |
| 8 | Support | `tools/public-and-private/helpdesk` | Zendesk, Freshdesk | ✓ | ✓ | calm counter (Atkinson Hyperlegible, teal, coral, butter notes) | locale, mail, schedules, public uploads | ✓ 13 tests (PGlite + PostgreSQL), build, manifest, 12 browser flows, screens |
| 9 | Rooms | `tools/private/rooms` | Robin, deskbird | ✓ | ✓ | calm blueprint (grid paper, navy ink, signal orange) | locale | ✓ 42 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, screens |
| 10 | Timesheets | `tools/private/timesheets` | Harvest, Toggl, Clockify | ✓ | ✓ | precise instrument (graphite green, electric lime timer, tabular figures) | locale, schedules, chest | ✓ 45 tests (PGlite + PostgreSQL), build, manifest, 11 browser flows, a11y audit, screens |
| 11 | Booking | `tools/public-and-private/booking` | Calendly | ✓ | ✓ | appointment card (Young Serif + Figtree, plum, mint, apricot) | locale, mail, schedules | ✓ 33 tests (PGlite + PostgreSQL), build, manifest, 11 browser flows, screens |
| 12 | Hiring | `tools/public-and-private/hiring` | Teamtailor, WTTJ | ✓ | — | — | locale, public uploads (to design) | — |
| 13 | Equipment | `tools/private/equipment` | Snipe-IT | ✓ | ✓ | tool crib labels (IBM Plex, utility orange, steel, hazard stripe) | locale, schedules, chest | ✓ 37 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, a11y audit, screens; own QR encoder tested with jsQR |
| 14 | Polls | `tools/private/polls` | Doodle, Officevibe | ✓ | ✓ | confetti ballot (Fredoka + Plus Jakarta Sans, coral, navy, mint) | locale, schedules, broadcast | ✓ 42 tests (PGlite + PostgreSQL), build, manifest, 9 browser flows, a11y audit, screens |
| 15 | Goals | `tools/private/goals` | Lattice Goals, Perdoo | ✓ | ✓ | trail map (Barlow Semi Condensed + Work Sans, forest ink, sunrise orange, contour lines) | locale, schedules, chest | ✓ 34 tests (PGlite + PostgreSQL), build, manifest, 14 browser flow steps, a11y audit, screens |
| 16 | Quotes | `tools/private/quotes` | Axonaut, Sellsy | ✓ | — | — | locale | — |
| 17 | Status | `tools/public-and-private/status` | Statuspage, Instatus | ✓ | ✓ | control room (cool grey, near-black ink, Okabe–Ito state colours with shapes and words) | locale, mail, schedules, chest, visitors, broadcast | ✓ 39 tests (PGlite + PostgreSQL), build, manifest, 10 browser flows, a11y audit (14 pages), screens |

## SDK working copy

`sdk/` = `@argentic/chest-sdk` 0.2.0 (Chest-SDK `387ae90`). Proposals added:

- `member.locale` (+ `members.*` answers, `localeOf`, `locales`) — 0.3.0-studio.1
- `fakeChest({origin})`, `chest.upload()`, the fake Chest's front (uploads, links, photos); `files` accept http://localhost links — 0.3.0-studio.2
- `schedules` (scheduled tasks: `handle`, `verify`, cron `parseCron`/`nextRun`/`describeCron`/`checkSchedules`, `timeZone()` from `CHEST_TIMEZONE`), `fakeChest({schedules, timeZone})`, `chest.run()` — 0.3.0-studio.3. Manifest keys of proposals live in each tool's `chest.proposals.json` (a Chest refuses unknown keys in `chest.json`)
- `mail` (send, status, mailboxAddress, handle/verify of received mail; `fakeChest({mail})`, `chest.outbox`, `chest.receive()`) — studio.4
- `events.publish` and received tool events (`fakeChest({emits, receivers})`, `chest.published`, `chest.deliver()`) — studio.5
- public uploads and public files (`files.uploadUrl(…, {public})`, `files.publicUrl`) — studio.6
- `chest` module (company, timeZone, today, currency, locale, teamUrl, publicUrl; `fakeChest({settings})`) and `notifications.broadcast` — studio.7
- Manifest proposal `translations` (tile title, description, role names per language), checked by `scripts/check-manifest.mjs`

## To fold into the SDK report (from builders)

- Status: checks run by the Chest (manifest `checks`, signed results to `/chest-checks`, `checks.handle`, `fakeChest({checks})`) — the job customers expect most; `mail.available()` (learned only by a failed send today); public caching per language (Next overwrites `Vary`); a heartbeat URL.
- Timesheets: `members.match(names)` server-side name matching for importers; a testing clock in `fakeChest`; a harness control to age data (the flow connects to the database); `<fieldset>` min-width makes pages scroll sideways on phones.
- Goals: `members.lookup` answers `unknown` for someone who lost access but stays in the Chest (second tool to hit it, after Equipment) — wish `{id, name, status: "revoked"}`; tell the admins in one call (`members.list({admin: true})` or `to: {admins: true}` on notify/broadcast); a key result fed by another tool (events/read API); template `format.ts` still hard-codes Europe/Paris (use `chest.timeZone()`); flows+screens+audit exceed the default command timeout.
- Polls: `members.groups.list({all})` (a tool open to everyone cannot offer the Chest's teams); `broadcast` `except` and `fakeChest({broadcast:false})` (built, studio.8); email reminders; client-module trap (plain functions from a `"use client"` file fail at run time only); template tests import the notes feature; a SQL helper for cast ids. Anonymous mode's limits documented in its README.
- Equipment: `members.lookup` answers `unknown` for someone who lost access but is still in the company — wish `{includeWithoutAccess}` → `no_access` with the name; an "I received it" acknowledgement primitive; SDK copy drift during builds; `next dev` breaks the nonce CSP with dev styles.
- Clients: `mail` inbound by BCC to log emails, `mail.send` to a contact; links between tools (a won deal starts a quote); harness `member.removed` did not make the member former (fixed: `chest.former`); functions from a `"use client"` module cannot be called by server pages; `.visually-hidden` inside scrolling boards overflows; dnd-kit's disabled sortable sets `aria-disabled`; `array_to_string` not immutable (no tags in generated tsvector); Next prefetch turned off (busy network, small server). Node vs Chromium month names ("Sept" vs "Sep") broke hydration.
- Rooms: `timeZone()` in a neutral module (read via schedules without schedules → `chest` proposal); a Chest-served per-member iCal feed; a shared resource calendar across Booking and Rooms; a `withMember` that sets Next's request scope (route handlers using `next/headers` are hard to test); screens actions need precise selectors; Playwright drags need scrolling; `hourCycle: "h23"` and "24:00" by hand.
- Expenses: the Chest's time zone and `today()` outside schedules (→ `chest` proposal); HEIC thumbnails; `files.stat` returning the Chest's `sha256`; a legal-hold/retention manifest key for receipts (10 years) so removing the tool warns; `members.list({role})` documented as including admins under the first role; harness cannot seed files; fake Chest ignores `thumbnail`; flows count every 404; visually-hidden labels escape overflow. French figures (scale, accounts, VAT recovery) from the research file only — to verify.
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
