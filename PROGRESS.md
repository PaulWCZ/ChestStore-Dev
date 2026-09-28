# Progress

The agent's memory: read whenever a run (re)starts, updated after every
meaningful step (brief/07-plan.md).

## Now

Step 3 done (17 tools verified). Step 4: the SDK report is kept current. Step 5 under way.

**Owner's requests (2026-09-28), to honour from now on:**
1. When the current round is done: a **very severe, constructive critique**
   of every tool, as if in employees' hands. Is the UI/UX simple and
   perfect? Can we honestly tell a company "cancel those subscriptions,
   nothing will be missing compared with the competition"? Tools must be
   **complete**. Output: `reports/05-critique.md`, then fix what it finds.
2. **Themes**: same features, different looks. Each company can pick a
   theme for its tools, keep each tool's identity, or **import its brand
   guidelines** (colours, fonts, logo). The 17 identities become the theme
   catalogue.
3. **A reusable UI kit** (`ui/`, `@argentic/chest-ui`, vendored per tool
   like the SDK). It avoids rebuilding everything each time and is handed
   to the agent that builds custom tools.
4. Always compare new work with earlier work, and bring the best of each
   into the kit.
5. **A theme per tool** too: the company chooses a look for all its tools,
   and can override it for any single tool.
6. **A "Chest" theme** following the Chest portal's design sheet
   (black and white, Swiss, light only, fallback fonts Arial and Georgia).
   It replaces "Plain". The owner wants it as an option, which is an
   exception to brief/05's "a tool must not look like the portal".
7. **Forms**: build the best form builder (Typeform, Tally, Google
   Forms). The owner's beta is not a quality reference. Folder:
   `tools/public-and-private/forms`, tool 18.

**Round in progress (builders, lead verifies and commits each):**
- Tasks: reminders and recurring cards.
- Support: tags, priority, attachments, waiting time.
- Wiki: comments, watching, templates, review reminders.
- Leave → People (away badge) and People → Equipment (departures).
- Booking: host's questions and limits.
- News: audience, search, weekly digest.
- The UI kit and theme foundation: `ui/`, token contract, 19 themes,
  `deriveTheme` and `importBrand`, SDK `theme` proposal (studio.11), harness
  theme switcher, gallery, pilot on `lab/template`,
  `reports/04-themes-and-kit.md`.
- Forms (tool 18): research, then build.

**Next:**
1. The severe critique of all 17 tools (hands-on, against the competitors'
   feature lists in `reports/02-open-source/`).
2. The kit's components, extracted from the best of the 17 tools.
3. Migrate every tool to the kit and themes (screens in several themes).
4. Fix the critique's findings.

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
| 3. Tools | done — 17 of 17 verified |
| 4. The report | consolidated; kept current |
| 5. Better | suite links, SDK checks, audits, deepening; UI kit and themes; severe critique — under way |

## Tools

_One row per chosen tool, in ranking order, once step 1 is done._

| Rank | Tool | Folder | Replaces | Research | Built | Design | SDK proposals used | Verified |
|---|---|---|---|---|---|---|---|---|
| 1 | Tasks | `tools/private/tasks` | Trello, Asana, Monday | ✓ | ✓ | bright workshop (Space Grotesk + Inter, sun, ink outlines) | locale, schedules | ✓ 26 tests (PGlite + PostgreSQL), build, manifest, 12 browser flows, screens |
| 2 | Wiki | `tools/private/wiki` | Notion, Confluence | ✓ | ✓ | warm paper, deep green (Newsreader + Source Sans 3) | locale | ✓ 33 tests (PGlite + PostgreSQL), build, manifest, 14 browser flow steps, screens |
| 3 | Leave | `tools/private/leave` | Lucca Absences, Factorial | ✓ | ✓ | sea-side calm (Nunito + Nunito Sans, sky blue, sunset coral) | locale, schedules | ✓ 41 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, screens |
| 4 | News | `tools/private/news` | Workvivo, Staffbase | ✓ | ✓ | newspaper (Fraunces + Libre Franklin, ink and red) | locale, schedules | ✓ 33 tests (PGlite + PostgreSQL), build, manifest, 9 browser flows, screens |
| 5 | People | `tools/private/people` | BambooHR directory | ✓ | ✓ | warm portrait gallery (Outfit, cream, terracotta, plum ink) | locale, schedules | ✓ 27 tests (PGlite + PostgreSQL), build, manifest, 16 browser flow steps, a11y audit (12 pages), screens; receives hires as arrivals |
| 6 | Clients | `tools/private/crm` | HubSpot, Pipedrive | ✓ | ✓ | sales desk (IBM Plex Sans + Mono, slate, electric blue) | locale, schedules | ✓ 39 tests (PGlite + PostgreSQL), build, manifest, browser flows, a11y audit, screens; publishes deal won/reopened |
| 7 | Expenses | `tools/private/expenses` | N2F, Expensify | ✓ | ✓ | receipt paper (grotesk + monospace figures, forest green, zigzag tear) | locale, schedules | ✓ 43 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, screens |
| 8 | Support | `tools/public-and-private/helpdesk` | Zendesk, Freshdesk | ✓ | ✓ | calm counter (Atkinson Hyperlegible, teal, coral, butter notes) | locale, mail, schedules, public uploads | ✓ 13 tests (PGlite + PostgreSQL), build, manifest, 12 browser flows, screens |
| 9 | Rooms | `tools/private/rooms` | Robin, deskbird | ✓ | ✓ | calm blueprint (grid paper, navy ink, signal orange) | locale | ✓ 42 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, screens |
| 10 | Timesheets | `tools/private/timesheets` | Harvest, Toggl, Clockify | ✓ | ✓ | precise instrument (graphite green, electric lime timer, tabular figures) | locale, schedules, chest | ✓ 45 tests (PGlite + PostgreSQL), build, manifest, 11 browser flows, a11y audit, screens |
| 11 | Booking | `tools/public-and-private/booking` | Calendly | ✓ | ✓ | appointment card (Young Serif + Figtree, plum, mint, apricot) | locale, mail, schedules | ✓ 33 tests (PGlite + PostgreSQL), build, manifest, 11 browser flows, screens |
| 12 | Hiring | `tools/public-and-private/hiring` | Welcome to the Jungle ATS, Teamtailor | ✓ | ✓ | editorial careers magazine (Bricolage Grotesque + Instrument Sans, cream, cobalt, tomato) | locale, mail, schedules, public uploads, chest, visitors | ✓ 34 tests (PGlite + PostgreSQL), build, manifest, browser flows, a11y audit, screens; publishes hired/hire cancelled |
| 13 | Equipment | `tools/private/equipment` | Snipe-IT | ✓ | ✓ | tool crib labels (IBM Plex, utility orange, steel, hazard stripe) | locale, schedules, chest | ✓ 37 tests (PGlite + PostgreSQL), build, manifest, 13 browser flow steps, a11y audit, screens; own QR encoder tested with jsQR |
| 14 | Polls | `tools/private/polls` | Doodle, Officevibe | ✓ | ✓ | confetti ballot (Fredoka + Plus Jakarta Sans, coral, navy, mint) | locale, schedules, broadcast | ✓ 42 tests (PGlite + PostgreSQL), build, manifest, 9 browser flows, a11y audit, screens |
| 15 | Goals | `tools/private/goals` | Lattice Goals, Perdoo | ✓ | ✓ | trail map (Barlow Semi Condensed + Work Sans, forest ink, sunrise orange, contour lines) | locale, schedules, chest | ✓ 34 tests (PGlite + PostgreSQL), build, manifest, 14 browser flow steps, a11y audit, screens |
| 16 | Quotes & invoices | `tools/private/quotes` | Axonaut, Sellsy, Henrri (invoicing) | ✓ | ✓ | letterpress stationery (Libre Caslon Text + Hanken Grotesk, blue-black, oxblood seal) | locale, mail, schedules, chest | ✓ 70 tests (PGlite + PostgreSQL, gap-free numbering under concurrency), build, manifest, 14 browser flow steps, a11y audit, screens; own PDF writer; a deal won makes a draft |
| 17 | Status | `tools/public-and-private/status` | Statuspage, Instatus | ✓ | ✓ | control room (cool grey, near-black ink, Okabe–Ito state colours with shapes and words) | locale, mail, schedules, chest, visitors, broadcast, checks | ✓ 45 tests (PGlite + PostgreSQL), build, manifest, 11 browser flow steps, a11y audit (15 pages), screens |

## SDK working copy

`sdk/` = `@argentic/chest-sdk` 0.2.0 (Chest-SDK `387ae90`). Proposals added:

- `member.locale` (+ `members.*` answers, `localeOf`, `locales`) — 0.3.0-studio.1
- `fakeChest({origin})`, `chest.upload()`, the fake Chest's front (uploads, links, photos); `files` accept http://localhost links — 0.3.0-studio.2
- `schedules` (scheduled tasks: `handle`, `verify`, cron `parseCron`/`nextRun`/`describeCron`/`checkSchedules`, `timeZone()` from `CHEST_TIMEZONE`), `fakeChest({schedules, timeZone})`, `chest.run()` — 0.3.0-studio.3. Manifest keys of proposals live in each tool's `chest.proposals.json` (a Chest refuses unknown keys in `chest.json`)
- `mail` (send, status, mailboxAddress, handle/verify of received mail; `fakeChest({mail})`, `chest.outbox`, `chest.receive()`) — studio.4
- `events.publish` and received tool events (`fakeChest({emits, receivers})`, `chest.published`, `chest.deliver()`) — studio.5
- public uploads and public files (`files.uploadUrl(…, {public})`, `files.publicUrl`) — studio.6
- `chest` module (company, timeZone, today, currency, locale, teamUrl, publicUrl; `fakeChest({settings})`) and `notifications.broadcast` — studio.7
- `visitors` module; `broadcast({except})`; `fakeChest({broadcast:false})`; `chest.former` — studio.8
- public uploads answer a one-time `claim` (`files.claim`), `expiresUnclaimedAfter` — studio.9
- Manifest proposal `translations` (tile title, description, role names per language), checked by `scripts/check-manifest.mjs`

## To fold into the SDK report (from builders)

- Quotes: `mail.available()` probe (first send numbers then rolls back); events from Clients (`crm.company.saved`, `crm.deal.won`; `clients.external_ref` reserved); for the e-invoicing reform, declared outbound network with per-company secrets to call a PA, and a warning before removing a tool holding legally retained data; postgres.js type parsers for date/bigint; page files cannot export helpers.
- Hiring: public uploads need a signed `claim` token (`uploadUrl(…, {public: true})` → `claim`; `files.claim(token)` once) or a visitor can claim someone else's upload; the Chest should delete unclaimed public uploads itself (`expiresUnclaimedAfter`); fake front should sniff first bytes and enforce 30/min per visitor; `files.url({inline})` with frame-ancestors for previews; `hiring.hired` → People needs personal data (a candidate is not a member) — decide; re-packing the SDK under the same version leaves npm on the stale copy (bump versions or reinstall in add-sdk); React #441 after erasing the current page; `type="url"` refuses "linkedin.com/in/x".
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
