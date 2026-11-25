# The studio's report: what we do, the 18 tools, and SDK 0.7.0

_25 November 2026. This report gathers the studio's work in one place for the owner.
The details and proofs are in the reports it links to: 01 (ranking), 02 (open
source), 03 (SDK report), 07 (memory), 08 (SDK 0.7.0, with the files that prove
each point). Everything below was verified on this studio's machine, against the
SDK's fake (`sdk/testing`) and the shared harness `lab/chest-dev`. How a real 0.7
Chest behaves is **not** verified: no real Chest is reachable from here._

## 1. What the studio does

The studio prepares the store for the day Chest launches. The pitch: "cancel your
per-seat SaaS, everything runs in your own Chest". For that, the store needs about
15 good tools on day one. The studio:

1. **Ranks** the SaaS that companies pay for per seat. We scored 28 categories on
   reach, spend, daily use, feasibility on the Chest, switching cost and risk, with
   prices and their sources (`reports/01-ranking.md`, `01-pricing-sources.md`).
2. **Studies open source** for each chosen tool: the best projects, their licences,
   what we may copy (permissive licences only, with attribution) and the features to
   match (`reports/02-open-source/`).
3. **Builds each tool for real**, on the Chest SDK. Each lives in its own folder, with
   its own manifest, tests, translations (English, then French), design, README and
   screenshots. Each could become its own repository tomorrow.
4. **Pushes the SDK forward.** When a tool needs something the Chest does not give, we
   don't fake it in the tool. We build it in `sdk/` (the studio's working copy) with
   its fake and tests, and write it into the SDK report.
5. **Verifies**:
   - tests on two databases: PGlite, and PostgreSQL 16;
   - the contract checker `chest check`, plus our manifest and vendoring checks;
   - a real browser flow per tool on the harness;
   - an accessibility audit (axe);
   - an independent review by a second agent, for every change of any size.

**How the work runs.** One lead and agents in parallel, each in its own git worktree
and branch. The lead merges only what passed its checks and a review.

**What is shared between the tools.** Each tool vendors its own copy of these, and a
check keeps the copies identical:
- the SDK (`sdk/`);
- `@argentic/chest-app` (`app/`): the server and page machinery (Hono, React rendered
  on the server, small interactive islands, Vite);
- the UI kit (`ui/`).

The same machinery is our proposed Perseus starter (`starter/`, report 06).

**Some results along the way:**
- **Next.js dropped.** Leaving Next.js cut memory at rest by 24 to 45 %, and the
  installed image from about 500 MiB to 27–40 MiB per tool (report 07).
- **Severe critique.** Every tool went through one (report 05).
- **Style contest.** It shows every tool's identity side by side
  (`showcase/index.html`).

## 2. The 18 tools

| # | Tool | Folder | Replaces | Public part | What it does |
|---|---|---|---|---|---|
| 1 | Tasks | `private/tasks` | Trello, Asana, Monday | — | Boards, cards, owners, due dates, what is late |
| 2 | Wiki | `private/wiki` | Notion docs, Confluence | — | The company handbook, spaces, search, history |
| 3 | Leave | `private/leave` | Lucca Absences, Factorial | — | Ask for time off, approve, know who is away; French rules |
| 4 | News | `private/news` | Workvivo, Staffbase, all-staff mail | — | Company front page, who read what matters |
| 5 | People | `private/people` | BambooHR, onboarding lists | — | Directory, who does what, welcoming new hires, leavers |
| 6 | Clients | `private/crm` | HubSpot, Pipedrive, Axonaut | — | Companies, contacts, deals, call-back reminders |
| 7 | Expenses | `private/expenses` | N2F, Expensify | — | Photo of a receipt, approval, accountant export |
| 8 | Support | `public-and-private/helpdesk` | Zendesk, Freshdesk | Contact form, request follow-up | A shared inbox for customers' requests |
| 9 | Rooms | `private/rooms` | Robin, deskbird | — | Desks, meeting rooms, who is in the office |
| 10 | Timesheets | `private/timesheets` | Harvest, Toggl, Clockify | — | Time on projects, billable time sent to Quotes |
| 11 | Booking | `public-and-private/booking` | Calendly | Booking pages | People book a time with a member or a team |
| 12 | Hiring | `public-and-private/hiring` | Welcome to the Jungle, Teamtailor | Careers page, apply | Jobs, candidates, interviews, team feedback |
| 13 | Equipment | `private/equipment` | Snipe-IT, Asset Panda | — | Who has which laptop, phone, licence or key |
| 14 | Polls | `public-and-private/polls` | Doodle, Polly, Officevibe | Guest answers | Quick questions, find a date, short surveys |
| 15 | Goals | `private/goals` | Lattice, Perdoo | — | Team objectives for the quarter, progress fed by other tools |
| 16 | Quotes & invoices | `public-and-private/quotes` | Sellsy, Axonaut, Henrri | Quote signed online | Quotes, then invoices, numbered properly |
| 17 | Status | `public-and-private/status` | Statuspage, Instatus | Public status page | Tell customers whether the service works |
| 18 | Forms | `public-and-private/forms` | Typeform, Tally, Google Forms | Public forms | Make a form in minutes, share a link, read answers |

Not built, on purpose (report 01):
- **Team chat:** the official Chat exists.
- **Password sharing:** needs browser encryption and an audit.
- **Payroll and certified accounting:** regulated.
- **Newsletters:** blocked by mail.
- **Whiteboard:** needs live co-editing.
- **E-signature:** legally regulated.

**State today.** All 18 are on SDK 0.7.0, with no failing test on either database.
All 19 browser flows (18 tools plus the "empty Tasks" flow) passed on their first run,
and axe found 0 violations (report 08 §6). They are candidates for the store, not
demos. The weaknesses each tool admits are written in its README.

## 3. Who needs whom: the tools talk through events

0.7.0's events let tools work together without knowing each other. Each tool declares
in `chest.json` what it sends (`emits`, with a schema) and what it listens to. The
owner links them in the Chest. All tools also listen to `member.*` (joins, leaves,
erasure).

| Sender | Event | Who listens, and why |
|---|---|---|
| Hiring | `hiring.hired`, `hiring.hire-cancelled` | **People** prepares the new hire's arrival; **Goals** counts hires in a hiring objective |
| Hiring | `hiring.busy` | **Booking** hides interview times from booking pages |
| People | `people.leaving`, `people.leaving-cancelled` | **Equipment** lists what the leaver must give back; **Leave** stops their balances |
| People | `people.record` | **Leave** takes the start date and work pattern |
| Leave | `leave.approved`, `leave.cancelled` | **People** shows who is away; **Rooms** marks those days "Off" in who is in the office |
| Leave | `leave.busy` | **Booking** and **Hiring** hide times when the person is off |
| Booking | `booking.busy` | **Hiring** avoids those times for interviews |
| Booking | `booking.confirmed`, `booking.cancelled` | **Clients** adds the meeting to the contact |
| Forms | `forms.contact` | **Clients** creates a lead from a contact form |
| Forms | `forms.request` | **Support** opens a request from a form |
| Status | `status.incident` | **Support** links customers' requests to the incident |
| Clients | `crm.deal.won`, `crm.deal.reopened` | **Quotes** prepares the quote; **Goals** counts revenue |
| Timesheets | `timesheets.billable`, `timesheets.billable-cancelled` | **Quotes** turns billable time into invoice lines |
| Quotes | `quotes.invoiced` | **Timesheets** marks that time as invoiced |
| Tasks | `tasks.card.done`, `tasks.card.reopened` | **Goals** moves a key result |
| Support | `helpdesk.ticket.solved`, `helpdesk.ticket.reopened` | **Goals** moves a key result |
| Equipment | `equipment.returned` | **People** ticks the leaver's checklist |
| Forms | `forms.answered` | Any tool the owner links (generic) |

**Studio rules for these events** (no SDK rule exists yet):
- Amounts are in the currency's smallest unit (cents; none for yen), with the code
  beside them.
- A receiver reads a type only from the tool its first word names.
- Format characters are stripped from text before sending.
- Each receiver is tested with exactly the shape its partner declares.

## 4. SDK 0.7.0: the good points

0.7.0 answered a large part of what the studio asked for since 0.4.1 (report 03,
note at the top).

1. **Events between tools, declared.** `events.emit(type, data, {subject, key,
   occurredAt, audience})`, with the schema in `chest.json`:
   - the owner sees and approves what flows;
   - `key` makes redelivery safe;
   - `audience` limits who may see what an event reveals.

   It is the backbone of §3.
2. **Realtime instead of polling.** Database tables feed channels, and pages follow
   them. Every page left its refresh timer, except two (report 08 §5).
3. **Sealed values.** A sensitive field (an IBAN, a home address, a candidate's notes)
   is stored sealed and opened only on a member's request, for the roles named.
   Expenses, Hiring and People use it.
4. **Groups.** `members.groups` and `member.groups` let Tasks, Wiki, News, Polls,
   Rooms, Leave and Goals share with a team, not a list of names.
5. **Broadcast with translations.** A message to everyone, in each member's language.
6. **Members' mails become notifications by the Chest.** No tool needs a mail key to
   reach a member.
7. **Visitors' uploads** into a folder, with types checked by the Chest from the bytes
   themselves, not the file name. That is safer.
8. **Clear time rules.** The official Times table:
   - "today", deadlines and working days use the company's zone (`chest.today()`);
   - a time shown to a member uses `member.timeZone`.

   It removed a class of bugs. Dropping `chest.currency` made each tool's money
   explicit: per document, per item, per tool.
9. **A real contract checker.** `chest check` validates the manifest, the event
   schemas, the realtime rules and migrations (the `-- chest: contract` marker for
   destructive changes).
10. **The fake (`sdk/testing`)** lets every tool test events, seals and realtime with
    no Chest. Without it, none of the verification above would exist.

## 5. SDK 0.7.0: the bad points (friction in what exists)

1. **Realtime rules cost a lot of bookkeeping.**
   - **One channel per table.** That forced denormalised keys (Hiring, Goals) and a
     fan-out table (Expenses).
   - **No join by group or by audience.** A channel for "people allowed to see this"
     needs a membership table that each tool fills on every access check and empties
     on every access change. Nine tools do it.
   - **Races.** A review found three leaks, and a race remains in every tool (report
     08 §6).
   - **No "you left this channel" signal.** Four tools keep the same exit counter so a
     kicked page reloads.
2. **Seals name roles only.** There is no "this member". People keeps two copies of an
   address (HR's, and the person's own). In Expenses, the IBAN's owner sees it only
   masked. A schedule can never open a seal, so nightly jobs can only re-seal.
3. **Event data is flat.**
   - Lists travel as JSON text, which the Chest does not check.
   - There is no amount kind.
   - Types refuse underscores, so we renamed three events on both sides.
   - Text refuses format characters, including the joiner inside common emoji, so a
     guest named "Nina 👩‍💻" was silently never sent.
4. **Nothing ties a type to its sender, or a receiver to the sender's schema.**
   - Any linked tool could send `crm.deal.won`.
   - A receiver could expect a field its partner never sends. Quotes lost every
     Timesheets hand-off that way, with both test suites green.
   - `emit` returns a count, never names.
5. **The `todo` capability exists, with no API.** The contract accepts it and
   `chest check` passes it, but nothing can be done with it.
6. **Schedules run at least 15 minutes apart.** Too slow for status checks.
7. **The fake is missing some of the Chest's behaviour:**
   - every `emit` reaches 0 receivers;
   - a database write never becomes a feed event;
   - `former` is read once at start;
   - the membership callback is synchronous;
   - notification pacing loses keys.
8. **The PR itself (Chest-SDK #38):**
   - `contract/README.md` still says 0.5;
   - the package's `files` list omits `client/src/actions.ts` and
     `client/src/testing-folders.ts`;
   - our `reference/` copy (PR #9, `2581b22`) is older than the PR head (`1a825a6`)
     we built on.
9. **`chest.timeZone` still exists**, as the company's reference zone, captured once
   from the owner's browser and editable on no screen. That fits "the apps handle
   time", but the owner may want it gone too.

## 6. What 0.7.0 lacks (impossible today)

Each tool falls back without breaking. The proofs are in report 08 §2.

| Missing | Tools that need it | What they do meanwhile |
|---|---|---|
| **Mail to people outside the company** | Booking, Quotes, Forms, Polls, Status, Support, Hiring, People, Rooms (9) | Nothing is sent outside. The studio's `mail` proposal shows the API wanted |
| **One calendar feed per member, across tools** | Tasks, Leave, Rooms, Booking, Hiring, Clients, News, Polls (8) | An .ics download where it existed |
| **Another tool's address, and whether it is installed** | Clients, Timesheets, Forms, Quotes, Support (5) | No links between tools; Forms guesses "not linked" |
| **The store's words in French** (title, description, roles) | all 18 | English on the tile and store page |
| **The company's look across tools** | all 18 | Each tool's own identity |
| **Who the visitor is on public pages** | Booking, Forms, Polls, Quotes | One rate limit for everyone; a quote signed online records "unknown" |
| **Live public pages** | Status, Support, Hiring, Booking, Forms | Status refreshes each minute while the visitor is active |
| **An API behind `todo`** | Tasks, Leave, Expenses, Equipment, People | No to-do items in the Chest |
| **Checks every 1–5 minutes** | Status | At least 15 minutes |
| **Visitors' .txt, .csv, .doc, .xls** | Forms, Support, Hiring | Refused for visitors; members still can |
| **Exchange rates** | Clients, Quotes | Totals never mix currencies |

**Possible, at a cost** (report 08 §3):
- **Webhooks** to Slack or Teams (Forms, Support, Status): only with "any host"
  network access.
- **Public pictures** (Forms, Hiring): streamed through the tool.
- **Matching addresses to members** (Equipment, People, Rooms): wider permission
  needed.
- **When a former member left** (Expenses, Timesheets): unknown before installation.
- **Unclaimed visitor uploads** (Forms, Support, Hiring): swept daily.
- **"Sent to N people"** after a broadcast: an estimate.
- **Confidential items inside a shared number** (Goals): they can be guessed.

## 7. Who needs what, tool by tool

Every tool also needs the store's words in French and the company's look (§6).

| Tool | Uses from 0.7.0 | Still needs |
|---|---|---|
| Tasks | groups, realtime (gated boards), events out | calendar feed, `todo` |
| Wiki | groups, realtime (gated spaces) | live co-editing (today an edit lock with a 30 s heartbeat) |
| Leave | groups, events in and out, company day | calendar feed, `todo` for approvals |
| News | groups, broadcast, realtime | calendar feed (events) |
| People | sealed (address, emergency contact), events in and out, `members.email` | mail outside (welcome letter), `todo` (onboarding), a seal "HR or this person", a precise members-by-address match |
| Clients | events in and out, realtime | calendar feed (next steps), other tools' addresses, exchange rates |
| Expenses | sealed (IBAN), realtime (gated desk) | `todo` for approvals, a seal "accountant or this member", when a member left, opening seals in a schedule |
| Support | visitors' uploads, events in and out | mail outside, live public page, other tools' addresses, webhooks, visitor file types |
| Rooms | groups, events in, one zone per office | mail outside (visitors), calendar feed |
| Timesheets | events in and out, realtime | Quotes' invoice address, when a member left |
| Booking | events in and out, realtime (gated agendas) | mail outside (guests), calendar feed, who the visitor is, live public page |
| Hiring | sealed (notes, feedback), visitors' uploads, events | mail outside (candidates), calendar feed, live public page, public pictures, visitor file types |
| Equipment | events in and out | `todo` (returns), matching addresses to members |
| Polls | groups, realtime | mail outside (guests), calendar feed, who the visitor is |
| Goals | groups, events in from five tools, realtime | join channels by audience, confidential items in shared numbers |
| Quotes | events in and out, its own currencies | mail outside (documents to clients), who the visitor is (signature proof), other tools' addresses |
| Status | realtime (members), schedules | mail outside (subscribers), checks every 1–5 minutes, live public page, webhooks |
| Forms | visitors' uploads, events out, realtime | mail outside (visitor's copy), who the visitor is, live public page, other tools' addresses, visitor file types, webhooks, public pictures |

## 8. What we ask of the SDK, in order

This is the studio's view of what unblocks the most, counting the tools in §6 and §7:

1. **Mail to people outside the company** (9 tools). It is the biggest gap in the
   pitch: Booking, Quotes, Support and Hiring are hard to sell without it.
2. **Realtime joins by group or audience, with a "left channel" signal.** It would
   remove the membership bookkeeping and the races in 9 tools.
3. **A calendar feed per member** (8 tools).
4. **An API behind `todo`** (5 tools). The capability already exists.
5. **Event schemas checked on both sides, and types tied to their sender.** It would
   prevent the most serious bug the reviews found.
6. **Store words in French** (all 18). It is small, and visible on day one.
7. **Other tools' addresses** (5), **who the visitor is** (4), **seals for "this
   member"** (2).
8. **The fake's gaps** (§5.7). They hide real bugs from every tool's tests.

## 9. Where things are, and what comes next

- **Done:** 18 tools on 0.7.0, verified (report 08 §6). The SDK working copy is
  `0.7.0-studio.2`, `@argentic/chest-app` is `studio.13`, and the starter is on 0.7.0.
- **Next:**
  - When PR #38 merges or moves, re-vendor and re-run everything.
  - Close the access-check race once the SDK says how.
  - Measure memory again on 0.7.
  - Refresh `reference/`.
  - Re-approve Hiring's links: its event schema changed, and no longer carries the
    candidate's email.
- **Memory of the work:** `PROGRESS.md`.
