# The ranking — what the Chest store opens with

_Written 2026-09-28. Prices and adoption figures: [01-pricing-sources.md](01-pricing-sources.md),
each with its URL and read date. **Caveat, stated once:** in this environment
vendor pages could not be opened directly (the network proxy refused them);
every price below comes from a search engine's extract of the vendor's page
("V-search") or from third-party roundups ("3P"). Re-open the vendor URL
before quoting a price to a customer. Nothing here is invented; what could
not be sourced says "not verified" or "quote only"._

## The question

Which tools, present on day one, make a company of 5–250 people decide to
move its daily work into a Chest? The pitch is per-seat money ("€10 per user
per month is €6,000 a year for 50 people") **and** one place, one sign-in,
data at home. So the opening store needs:

1. tools used **every day by everyone** (the habit that brings people into
   the Chest — tasks, docs, news, leave);
2. tools whose SaaS price is **per seat and visible on the invoice** (the
   saving the founder shows);
3. tools that are **excellent with today's SDK** — or whose missing piece is
   small and designed in the SDK working copy.

## Scoring

1–5 per criterion (5 is best; for Risk, 5 means *low* risk). Reach and Spend
are estimates from the sources above and the studio's judgement: we found no
public, sourced survey of SaaS penetration among French SMEs, so Reach is a
reasoned estimate and is marked so. Feasibility is measured against the
**published** SDK 0.2.0 (brief/02): 5 = excellent today, 3 = one missing
primitive that the tool can live without, 1 = blocked.

| # | Category (SaaS it replaces) | Price seen (per user/month unless said) | Reach* | Spend | Daily use | Feasibility | Conviction | Switching | Risk | **Total** | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Tasks and projects** (Trello, Asana, Monday, Jira) | Trello $5–10; Asana $10.99–24.99; Monday $9–12 (min. 3 seats) | 5 | 4 | 5 | 5 | 5 | 5 | 5 | **34** | Everyone, every day; Trello JSON/CSV and Asana CSV importers make switching one click |
| 2 | **Wiki / handbook** (Notion, Confluence, Google Sites) | Notion $10–20 (3P); Confluence ~$5.4–6 (not verified) | 5 | 4 | 4 | 4 | 5 | 4 | 5 | **31** | The company's memory; live co-editing needs realtime (we lock instead) |
| 3 | **Leave and absence** (Lucca Absences, Factorial, PayFit) | Lucca quote only; Factorial "from $8" (V-search) | 4 | 3 | 3 | 5 | 5 | 4 | 3 | **27** | Everyone uses it monthly, managers weekly; French rules are the moat; payroll stays outside |
| 4 | **Intranet news** (Workvivo, Staffbase, Simpplr, the all-staff email) | quote only ($5–20, 3P) | 3 | 3 | 5 | 5 | 4 | 3 | 5 | **28** | Not a SaaS most SMEs pay for — but it makes the Chest the home page. Workplace from Meta closed in 2026 (research) |
| 5 | **People directory and onboarding** (BambooHR, Factorial, Lucca Poplee) | BambooHR quote only (~$10–17 3P) | 4 | 3 | 3 | 5 | 4 | 4 | 4 | **27** | The Chest already knows the members: a directory is almost free and the suite's glue |
| 6 | **CRM** (HubSpot, Pipedrive, Axonaut, Sellsy, folk) | Pipedrive $14–39 (3P); HubSpot $15–90; Axonaut €97/mo + €29.99/user | 4 | 5 | 4 | 4 | 4 | 5 | 3 | **29** | Sales teams live in it; email logging and reminders need primitives (email, schedules) |
| 7 | **Expense claims** (N2F, Expensify, Spendesk, Lucca Cleemy) | Expensify $5–9 (V-search); N2F from ~€3.45–5.10 (3P) | 4 | 3 | 2 | 5 | 5 | 3 | 3 | **25** | Photo of a receipt from a phone, approved in a click; the accountant export is the argument |
| 8 | **Helpdesk** (Zendesk, Freshdesk, Crisp, Help Scout) | Zendesk $19–55 per agent (V-search) | 3 | 5 | 4 | 3 | 4 | 3 | 4 | **26** | Public contact form + shared inbox works today; email in/out is the missing primitive |
| 9 | **Rooms and desks** (Robin, deskbird, Joan, Skedda) | deskbird €2.75–3.50 (3P); Robin quote only | 3 | 2 | 4 | 5 | 4 | 3 | 5 | **26** | Hybrid work: "who is in on Thursday?" is a daily question |
| 10 | **Time tracking** (Harvest, Toggl, Clockify) | Harvest $11 (V-search); Toggl $9–18; Clockify $5.49–7.99 | 3 | 3 | 5 | 5 | 4 | 5 | 4 | **29** | Daily for agencies and consultancies; Toggl/Clockify/Harvest CSV importers |
| 11 | **Booking pages** (Calendly, Cal.com) | Calendly $10–16 (V-search) | 4 | 3 | 3 | 3 | 4 | 2 | 4 | **23** | Public part works; calendar sync and email confirmations are primitives to design |
| 12 | **Recruitment / ATS** (Welcome to the Jungle, Teamtailor, Recruitee) | quote only (by job slots) | 3 | 4 | 2 | 3 | 4 | 2 | 3 | **21** | Public job board + CV upload (public uploads = proposal); CNIL retention rules |
| 13 | **Equipment and assets** (Snipe-IT, Asset Panda, spreadsheets) | Snipe-IT hosted $39.99/instance; Asset Panda quote only | 3 | 2 | 2 | 5 | 4 | 4 | 5 | **25** | Offboarding: "what does Hugo have?" — with the Chest's lifecycle events |
| 14 | **Polls and pulse surveys** (Doodle, Polly, Officevibe) | Officevibe $5 (3P) | 4 | 2 | 3 | 5 | 3 | 1 | 5 | **23** | Small, quick win; true anonymity matters |
| 15 | **Goals / OKRs** (Lattice, Perdoo, 15Five) | Lattice $11 (3P); 15Five $4–16 (3P) | 2 | 3 | 2 | 5 | 3 | 3 | 4 | **22** | Team goals only (evaluating individuals has legal weight: L1222-3) |
| 16 | **Quotes and invoices** (Axonaut, Sellsy, Pennylane, Henrri) | Sellsy €49–89 (3P, min. 2 users) | 4 | 4 | 2 | 3 | 3 | 3 | 2 | **21** | Regulated: 2026–2027 e-invoicing reform; we draft and number, a certified platform transmits |
| 17 | **Status page** (Statuspage, Instatus) | Statuspage $29–399 per page | 2 | 2 | 1 | 4 | 3 | 2 | 5 | **19** | Public-facing, small; monitoring needs schedules and network |
| 18 | Team chat (Slack, Teams) | Slack $7.25–15 (V-search); Teams Essentials $4 | 5 | 4 | 5 | **1** | 3 | 2 | 4 | 24 | **Blocked**: no WebSocket; polling chat would be worse than Slack — see SDK report (realtime) |
| 19 | Password sharing (1Password, Bitwarden) | 1Password $8.99; Bitwarden $4–6 (V-search) | 3 | 3 | 3 | 3 | 3 | 3 | **1** | 19 | Needs end-to-end encryption in the browser and an audit; too risky for the opening store |
| 20 | File sharing (Dropbox, WeTransfer) | Dropbox $15–24 (not verified) | 4 | 4 | 3 | 3 | 2 | 2 | 3 | 21 | The Chest's files are private per tool; public links and large uploads are proposals |
| 21 | **Forms** (Typeform, Tally, Google Forms, Microsoft Forms, Jotform) | Typeform $28–91 per account (3P); Tally Pro $24–39 (V-search/3P); Jotform $34–99 (3P) | 4 | 3 | 2 | 4 | 4 | 2 | 4 | **23** | The store's beta is a prototype; the studio's Forms is **tool 18** (below). Team and anonymous forms use the Chest's identity; public uploads, mail, schedules and visitors are proposals |
| 22 | Dashboards (Metabase) | Metabase $90/mo + $6/user | 2 | 2 | 2 | 2 | 2 | 1 | 4 | 15 | Needs events from every tool first |
| 23 | Newsletters (Mailchimp, Brevo) | per account, by contacts | 3 | 2 | 1 | **1** | 2 | 3 | 2 | 14 | Blocked by email |
| 24 | Whiteboard (Miro) | Miro $8–20 (V-search) | 2 | 3 | 2 | **1** | 3 | 1 | 5 | 17 | Needs realtime co-editing |
| 25 | e-Learning (360Learning, TalentLMS) | not sourced | 2 | 3 | 1 | 3 | 2 | 1 | 4 | 16 | Video files and progress: later |
| 26 | Contracts and e-signature (PandaDoc, Yousign) | not sourced | 3 | 3 | 1 | 2 | 2 | 2 | **1** | 14 | Legal-value signature is regulated (eIDAS): out of scope |
| 27 | Link shortener (Bitly) | per account | 1 | 1 | 1 | 5 | 2 | 1 | 5 | 16 | Tiny; a feature, not a tool |
| 28 | Payroll, certified accounting, banking | — | — | — | — | — | — | — | — | — | **Never** (brief/01): regulated software. We build around them (exports) |

\* Reach is the studio's estimate (no sourced SME penetration survey found);
the ordering inside a tier is judgement, not arithmetic.

## The opening store: 18 tools, in order

The order is the build order: the first tools are the daily habit and the
clearest saving; each later one leans on the ones before.

| Rank | Tool (title) | Folder | Kind | Replaces | Why here |
|---|---|---|---|---|---|
| 1 | Tasks | `tools/private/tasks/` | private | Trello, Asana, Monday | Everyone, every day; the first thing a team moves |
| 2 | Wiki | `tools/private/wiki/` | private | Notion (docs), Confluence | The handbook and the memory; the new hire's first read |
| 3 | Leave | `tools/private/leave/` | private | Lucca Absences, Factorial time off | Everyone, and French rules done right |
| 4 | News | `tools/private/news/` | private | Workvivo, Staffbase, the all-staff email | Makes the Chest the home page |
| 5 | People | `tools/private/people/` | private | BambooHR directory, onboarding checklists | Who does what; the suite's glue |
| 6 | Clients | `tools/private/crm/` | private | HubSpot CRM, Pipedrive, Axonaut CRM | The biggest per-seat spend of a sales team |
| 7 | Expenses | `tools/private/expenses/` | private | N2F, Expensify | Phone-first; the accountant export sells it |
| 8 | Support | `tools/public-and-private/helpdesk/` | public + private | Zendesk, Freshdesk | The first public part: a contact form and a shared inbox |
| 9 | Rooms | `tools/private/rooms/` | private | Robin, deskbird | Hybrid work, daily |
| 10 | Timesheets | `tools/private/timesheets/` | private | Harvest, Toggl, Clockify | Daily for service companies |
| 11 | Booking | `tools/public-and-private/booking/` | public + private | Calendly | Public booking pages per person and team |
| 12 | Hiring | `tools/public-and-private/hiring/` | public + private | Welcome to the Jungle, Teamtailor | Job board + pipeline; hires flow into People |
| 13 | Equipment | `tools/private/equipment/` | private | Snipe-IT, Asset Panda | Offboarding with lifecycle events |
| 14 | Polls | `tools/public-and-private/polls/` | public + private | Doodle, Polly, Officevibe | Quick, anonymous when it must be |
| 15 | Goals | `tools/private/goals/` | private | Lattice Goals, Perdoo | Team OKRs and check-ins |
| 16 | Quotes | `tools/private/quotes/` | private | Axonaut, Sellsy invoicing | Quotes to invoices, ready for the e-invoicing reform |
| 17 | Status | `tools/public-and-private/status/` | public + private | Statuspage | Small public page; incidents |
| 18 | Forms | `tools/public-and-private/forms/` | public + private | Typeform, Tally, Google Forms, Microsoft Forms, Jotform | The studio's version of the store's beta Forms: every other tool's "ask people something" |

Not in the opening store: **team chat** (blocked by realtime — the SDK
report proposes it first), **passwords** (security bar too high for a first
store), **file sharing, newsletters, whiteboard, dashboards** (each blocked
by a missing primitive; specs will follow in `reports/04-specs/` if time
allows).

### The set as a whole — one intranet

A new hire's first day touches seven of them: **News** welcomes them (a
welcome post), **People** shows their onboarding checklist and who is who,
**Wiki** holds the handbook they read, **Tasks** has their first tasks,
**Equipment** records the laptop they received, **Rooms** shows where the
team sits on Thursday, **Leave** shows their balance. Sales adds **Clients**,
**Quotes**, **Booking**; managers **Goals**, **Polls**; the outside world
sees **Support**, **Hiring**, **Status**, **Booking**. Every tool reads the
same people from the Chest, drops its items into the same bell, and is told
when someone leaves — the offboarding checklist is the suite (Equipment to
return, tasks to reassign, leave balance to settle). The links between tools
we would want (a hire becomes a person, a leave shows in Rooms, a won deal
becomes a quote) are the "Tools as a suite" section of the SDK report.

### Each tool: the job, the core, what we leave out, the roles

Feature lists with their sources are in `02-open-source/<tool>.md`.

**1. Tasks** (`tasks`). *Job:* plan the team's work, give it to someone,
see what is late. *Replaces* Trello, Asana, Monday. *Core:* boards with
columns, cards with assignees, due date, labels, checklist and comments;
drag and drop; "My tasks" across boards; quick add; archive; the bell when
something is given to you; Trello JSON and CSV import. *Left out:* Gantt,
automations, time tracking (Timesheets does it), custom fields, dependencies.
*Roles:* `manager` (all boards, board settings), `member` (the boards they
belong to), `guest`-like reading via board membership is left to boards.

**2. Wiki** (`wiki`). *Job:* write down how the company works and find it
again. *Replaces* Notion (pages), Confluence, Google Sites. *Core:* spaces
with a page tree, a clean editor (headings, lists, links, images, tables),
read mode by default, full-text search in French and English, page history
with restore, an edit lock instead of co-editing, Markdown/Notion import and
export. *Left out:* databases, live co-editing (needs realtime), public
publishing (later, with public files). *Roles:* `editor`, `reader`.

**3. Leave** (`leave`). *Job:* ask for time off, get an answer, know who is
away. *Replaces* Lucca Absences, Factorial, spreadsheets. *Core:* my
balance, a request with half days and its cost in days computed live
(working days, French public holidays, Alsace-Moselle option), the
manager's approve/refuse, the team calendar, balances as a ledger (accrual
computed on read, HR adjustments), a monthly export for payroll. *Left
out:* payroll itself (regulated), complex collective agreements (forks).
*Roles:* `hr` (settings, balances, everyone), `manager` (approves their
team), `employee`.

**4. News** (`news`). *Job:* tell the whole company what matters, and know
it was read. *Replaces* Workvivo/Staffbase for SMEs, the all-staff email.
*Core:* posts with a picture, pinned posts, kinds (announcement, event,
welcome), reactions and comments, "Important — I have read it" with the list
of who confirmed, an event's "I'm coming". *Left out:* passive read tracking
(monitoring employees needs the works council: research), scheduled posts
(needs schedules). *Roles:* `publisher`, `reader`.

**5. People** (`people`). *Job:* find who does what, and welcome a new
hire. *Replaces* BambooHR/Factorial directory and onboarding. *Core:* the
directory from the Chest's members, each person's job title, team, manager,
"ask me about", phone, office; the org chart from managers; onboarding
checklists from templates, assigned to the new hire and to the people who
prepare their arrival; opt-in birthdays. *Left out:* HR files and salaries
(sensitive; later with an audit log). *Roles:* `hr`, `member`.

**6. Clients** (`crm`). *Job:* keep track of companies, contacts and deals,
and never forget to call back. *Replaces* HubSpot CRM, Pipedrive, Axonaut
CRM. *Core:* companies and contacts, a deals board by stage with totals, an
activity log (call, meeting, note), next step with a date and an overdue
list, "my deals", search, CSV import (HubSpot, Pipedrive) and vCard. *Left
out:* email sync (needs email), marketing automation, quotes (Quotes does
it). *Roles:* `manager`, `sales`, `viewer`.

**7. Expenses** (`expenses`). *Job:* get reimbursed for what you paid for
work. *Replaces* N2F, Expensify. *Core:* snap a receipt, amount, category,
date; mileage from the French scale; send; the approver approves or refuses
with a reason; the accountant marks paid and exports CSV + receipts. *Left
out:* cards and bank feeds (regulated), OCR (needs AI gateway — proposal).
*Roles:* `accountant`, `approver`, `employee`.

**8. Support** (`helpdesk`). *Job:* answer customers' requests together.
*Replaces* Zendesk, Freshdesk. *Public:* a contact form and a private
follow-up page by secret link. *Private:* a shared inbox (unassigned / mine
/ all), replies and internal notes, assign, statuses, canned replies. *Left
out until the SDK has it:* email in and out (designed as a proposal).
*Roles:* `agent`, `viewer`.

**9. Rooms** (`rooms`). *Job:* book a room or a desk, see who is in.
*Replaces* Robin, deskbird. *Core:* my week (office / remote / off per day
and who else is in), book a desk for a day, a room for a slot on a day grid,
no double booking (a Postgres constraint), cancel. *Left out:* sensors,
check-in kiosks. *Roles:* `admin` (places), `member`.

**10. Timesheets** (`timesheets`). *Job:* record time on projects and see
where it went. *Replaces* Harvest, Toggl, Clockify. *Core:* a one-line timer,
a week grid, clients and projects with budgets, billable flag, reports and
CSV export, Toggl/Clockify/Harvest CSV import, locked periods. *Left out:*
invoicing (Quotes), screenshots or activity tracking (surveillance).
*Roles:* `manager`, `member`.

**11. Booking** (`booking`). *Job:* let customers book a meeting without
back-and-forth. *Replaces* Calendly. *Public:* a page per person and per
team with its meeting types and free slots in the visitor's time zone,
book, cancel or reschedule by secret link, `.ics`. *Private:* weekly hours,
days off, buffers, meeting types, the bookings. *Left out until the SDK has
it:* calendar sync, confirmation emails (proposals). *Roles:* `admin`,
`member`.

**12. Hiring** (`hiring`). *Job:* publish jobs and choose candidates
together. *Replaces* Welcome to the Jungle (ATS), Teamtailor. *Public:* job
board and application form with a CV (public uploads — proposal). *Private:*
a pipeline board per job, candidate page with CV, notes and ratings,
colleagues' feedback, reasons for rejection, the CNIL 2-year purge. *Left
out:* job-board multiposting, emails to candidates (proposal). *Roles:*
`recruiter`, `interviewer`.

**13. Equipment** (`equipment`). *Job:* know who has which laptop, phone,
licence or key. *Replaces* Snipe-IT, Asset Panda, spreadsheets. *Core:*
items with serial, purchase date, warranty; give and take back with history;
"my equipment"; everything a leaving person holds; QR labels; warranty
ending soon; CSV import from Snipe-IT. *Left out:* the fixed-asset register
(accounting). *Roles:* `manager`, `member`.

**14. Polls** (`polls`). *Job:* ask the team a quick question or find a
date. *Replaces* Doodle, Slack polls, Officevibe pulse. *Core:* a question
with choices or dates, one vote per member (changeable), results live or at
close, truly anonymous mode (no member id stored; nothing shown under five
votes). *Roles:* `organiser`, `member`.

**15. Goals** (`goals`). *Job:* agree on what matters this quarter and see
progress. *Replaces* Lattice Goals, Perdoo. *Core:* cycles, company and team
objectives, key results with start/target, weekly check-ins with confidence,
progress computed. *Left out:* individual performance reviews (legal
weight). *Roles:* `admin`, `member`.

**16. Quotes** (`quotes`). *Job:* send a proper quote and turn it into an
invoice. *Replaces* the invoicing of Axonaut, Sellsy, Henrri. *Core:*
clients, items, quotes with statuses, quote → invoice, finalising gives the
next number of a continuous sequence and freezes it, credit notes, a PDF
with the French mandatory mentions, paid / overdue. *The legal line:* from
September 2026 (large and mid-size companies) and September 2027 (SMEs),
B2B invoices go through the company's approved platform (PA); the tool
produces the invoice and its data, it does not transmit it and never
presents itself as a platform (research). *Roles:* `admin`, `sales`,
`viewer`.

**17. Status** (`status`). *Job:* tell customers whether the service works.
*Replaces* Statuspage, Instatus. *Public:* components and their state,
current incidents with their timeline, 90 days of history, planned
maintenance. *Private:* post an incident and its updates. *Left out until
the SDK has it:* automatic checks (needs schedules and network), email
subscribers. *Roles:* `editor`.

**18. Forms** (`forms`) — *the studio's version of the store's existing
beta* (`reference/forms`, a first prototype: three field types, no logic,
no summary). *Job:* ask people something and read the answers — customers,
visitors, candidates, colleagues. *Replaces* Typeform, Tally, Google Forms,
Microsoft Forms, Jotform. *Public:* a form page per published public form,
one question at a time or all on one page, in the visitor's language, with
file uploads (public uploads — proposal) and a spam guard (visitors —
proposal). *Private:* the builder with live preview, 14 question types,
pages and conditions, templates, team-only and anonymous team forms, the
answers table, the summary (bars, averages, NPS), CSV, the bell for chosen
people, retention and erasure. *Left out:* payments, quizzes and scoring,
partial submissions, integrations (each needs a primitive or a privacy
decision first). *Roles:* `manager` (every form, erasure), `creator`
(creates forms), `member` (answers team forms; sees forms shared with
them). *Why 18th and not higher:* it was already in the store as a beta, so
it does not open a new category; it scores 23 (every company uses a form
tool, but it is not daily and most of its spend is per account, not per
seat). It comes last because it leans on four proposals the earlier tools
proved (public uploads with claim, mail, schedules, visitors), and it makes
the suite stronger: every tool that "asks people something" can link to it.

## Why not…

- **Team chat first?** It is the most used SaaS of all, and the one that
  most needs realtime. A chat that refreshes every 10 s loses against Slack
  on the first day. It comes right after the realtime proposal ships.
- **Passwords?** A company's vault is the highest-value target on the
  server; it needs client-side encryption, recovery and an external audit.
  Not an opening-store tool.
- **Forms?** Already in the store as a beta; the studio rebuilt it as tool 18 (above) because the beta is a first prototype that cannot stand next to Tally or Typeform.
