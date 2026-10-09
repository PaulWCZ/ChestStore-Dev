# People — who does what, and welcoming new colleagues

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server. It replaces the **directory, org chart, onboarding and employee
record of BambooHR, Factorial or Lucca (Poplee / Core HR)** for a small
company — contract, emergency contact, documents and the French staff
register (*registre unique du personnel*) — the Google Workspace
directory, and the Notion "team" page or shared "who's who" spreadsheet.
It does **not** replace their payroll, salary and compensation reviews,
time off (the store's Leave tool), performance reviews (Goals) or e-signature:
see "What it does not do yet".

## What it does

- **Directory** — everyone who has the tool, as portraits: the Chest is the
  truth of who is in the company, with their name and photo; People keeps
  only what the Chest does not know: job title, team, office, manager, work
  phone, pronouns, a short bio, "Ask me about" topics, start date, and a
  birthday (day and month only, shown only if the person turns it on).
  Search as you type on name, job, team, office, topics, work email and
  HR's extra fields (accents and case aside); filter by team and office;
  the search stays in the address.
- **Staff without the Chest** (a warehouse worker, an intern: an HR record
  not linked to any member) are in the directory and the org chart too,
  marked **"Not in the Chest"**: their name, job, team and manager — what
  the directory shows of anyone, and nothing else of the record (no
  contract, no dates, no address). Everyone who reads the directory sees
  them; their card opens nothing (HR's opens the record). They are listed
  from their first day (or at once without one) until their last; HR
  places them from the record (*In the directory*: team, manager) or takes
  them off. Once the record is linked to a member who got the Chest, their
  profile takes over (its empty team and manager are filled from there).
- **Work email** — the Chest's address of each member (`members.email`),
  on their profile with a *Write* button beside *Call*; in the export; used
  by the import to match people.
- **Extra fields** HR adds for everyone ("Languages", "T-shirt size",
  "LinkedIn"; 20 at most), of three kinds: **text**, a **date** (the
  kit's date field; "Medical visit", "Badge expires" — it may **remind HR
  in the bell each morning** from a number of days before), or a
  **choice** from HR's list ("Size": S, M, L; any case accepted, stored as
  HR wrote it). Each filled by the person (and HR) or by HR only, and
  **seen by everyone or by HR and the person only** (a lock marks it; a
  date is HR's and the person's by default — a medical visit is nobody
  else's business). A private value never leaves the server for anyone
  else: not on the profile, not in the search. Shown on the profile, found
  by the search, in the export and the import (dates in the file's order,
  choices checked). HR changes who sees a field from the table's column
  head. Deleting one has *Undo* (kept 30 days).
- **A profile page** per person: how to reach them (one tap to call), what
  to ask them, whom they report to and who reports to them, how long they
  have been here, their checklists (for those allowed to see them).
- **Edit** — each person edits their own phone, pronouns, bio, topics,
  birthday and extra fields; HR edits anyone's job title, team, office,
  manager, start date and work phone. A manager can never be someone below
  the person: the server refuses loops (and the picker does not offer
  them). HR's changes of job details are written in a journal (who, when,
  which fields — never the values), shown to HR on the profile.
- **Edit as a table** (HR) — everyone on one screen: job title, team,
  office, manager, start date, phone and the extra fields as cells, each
  saved when HR leaves it, with *Undo*; a refused value (a loop, a wrong
  phone) comes back as it was. HR adds, renames and deletes extra fields
  there.
- **Org chart**, drawn from the managers: top-down trees with thin
  connectors, each team folding open and shut; an indented list on phones;
  "Not in the chart yet" lists those without a manager or team. **A manager
  who leaves keeps their place**: a dashed card "Has left" stays above
  their reports (under their own manager while their profile is kept)
  until HR names someone else; the reports' profiles say "Léa Dubois has
  left".
- **New colleagues** — people who started in the last 30 days are greeted
  on the directory ("Say hello to Nora"), those arriving in the next 60
  days listed; **this month**'s birthdays (opt-in) and work anniversaries.
- **Checklists for arrivals and departures** — HR writes templates ("Office
  newcomer", "Leaving"; two examples in one click): each step is given to
  *the newcomer / the person leaving*, *their manager*, *HR (whoever starts
  it)* or a named member, on a day counted from the first (or last) day.
  HR starts one for a person; each step goes to someone, who finds it in
  **My to-dos** and in the Chest's bell, in their language; they tick it
  (with *Undo*). HR follows progress, gives a step to someone else, moves
  its day, adds or deletes steps, stops a checklist (with *Undo*) or
  deletes a stopped one (asked first: it is for good). The person who started it is told when it is
  complete.
- **A welcome** when a welcome checklist starts — welcome to the company,
  their first day, their manager, where their first steps are — signed by
  the HR person who started it. Two ways, by who the newcomer is (the
  owner's decision of 6 October 2026: mail to members is never a tool's
  job):
  - **a member of the Chest** finds it in their **notifications** (English
    with its French; the Chest shows them theirs, and mails it to them if
    that is their choice in the Chest); it opens *My to-dos*;
  - **an arrival not in the Chest yet** gets it **by email** at the **work
    address** HR gave (not a member: an email to someone outside, see "Mail
    to people outside the company"), in the Chest's language. Hiring's
    personal address is never kept, so an arrival from Hiring without a
    work address gets nothing. The address is first matched with the
    Chest's members (`members.matchEmails`): when it is already a member's
    (they joined the Chest before HR linked the arrival), that member gets
    the **notification**, never an email, and HR is asked to link the
    arrival to them under *Arriving*. When the Chest cannot say whose the
    address is, nothing is sent (a member is never mailed by mistake) and
    the page says so.
  Once per checklist; not for a first day more than two weeks past. The
  start form says beforehand which it will be ("Nora finds a short welcome
  in their Chest notifications.", "Hugo is already in the Chest: they will
  find a short welcome in their notifications. Link their arrival…",
  "Lucie gets a short welcome email.", or why no email will leave), and
  the toast after says what happened ("A short welcome email is on its way
  to lucie.garnier@…"). An email that bounces (or is marked as spam, or
  fails) shows on the checklist for HR: "The welcome email to … could not
  be delivered. Check their work email".
- **Import** a CSV (a shared spreadsheet, BambooHR's reports, a Google
  Workspace users export, Lucca's export): columns recognised from their
  names in English and French — BambooHR's "Employee #" (left out), "First
  Name", "Last Name", "Reporting to", "Supervisor", "Hire Date", "Work
  Email"; Lucca's "Matricule", "Nom", "Prénom", "Date d'entrée" — and a
  **mapping step** where HR says what any column holds (or leaves it out,
  or sends it to an extra field). **A column left out is never dropped
  silently**: "2 columns are left out: Division, T-Shirt Size" opens the
  mapping step, and *Keep as a new field* turns one into an extra field
  whose values are imported. Dates in the preview are written as the reader
  writes them. People are matched by work email when
  the file has one, otherwise by full name (accents, case, commas and "Last
  First" order aside). When the dates could be day/month or month/day,
  **HR is asked** (BambooHR's guess is month-first). A preview says what
  will change and what is left out; empty cells change nothing.
  **Export** the directory as CSV (the same columns, extra fields
  included: it round-trips; phone numbers are written as they are, only
  cells that could run as formulas get a quote, taken back on import).
- **Expected arrivals written by hand** — "Someone is joining" on the
  Checklists page (name, job, team, office, first day, manager, work email):
  the same arrival Hiring's event makes, so a company hiring through
  LinkedIn and email starts the checklist before day 1. HR corrects its
  own arrivals; when the newcomer gets the Chest, People offers to link
  them (by the work email, else by name). A first day on a Saturday or
  Sunday is questioned (here and when starting a checklist).
- **Example steps in each reader's language** — the steps of the two
  example templates show in English or French to each person (bell
  included) until HR rewords one. The newcomer's **"Fill in your profile"
  ticks itself** once they did.

## HR records (HR only; each person reads their own)

The part of BambooHR / Lucca Core HR a French SME is required to have.

- **One record per person employed** — members, and people **without the
  Chest** (a warehouse worker, an intern): *Identity* (name and first
  names as on the contract, sex, date of birth, nationality, work permit
  type and number, home address), *Contract* (permanent / fixed-term /
  apprenticeship / work-study / internship / temporary / seconded; job;
  qualification — level or coefficient of the collective agreement; full
  or part time and weekly hours; first day, end of trial period, planned
  end, last day; the agency or seconding employer; an intern's tutor and
  place), *In an emergency* (name, relationship, phone), *Documents*
  (contracts, amendments, certificates, ID: PDFs, pictures, Word or
  OpenDocument files up to 20 MB, kept through the Chest's files, opened
  through a fresh 15-minute link).
- Also: the **employee number** (*matricule*, unique), the **work
  permit's end of validity**, and the **days worked** of a part-timer
  (Monday to Sunday, as the part-time contract says).
- **Who sees what**: HR edits every record; **the person reads their own**
  ("My HR record" on their profile), read-only; **anyone else — their
  manager included — is told it does not exist** (404).
- **A journal of every reading and change**: who opened a record, changed
  which fields (names only, never values), added, opened or deleted which
  kind of document, read or downloaded the register — shown on the record
  and the register; kept two years. The person's own readings are not
  noted.
- **One click to start**: "Create their 12 records" for everyone in the
  directory who has none, filled with their name, job and start date.
- **Coming up** and in HR's bell each morning: trial periods ending within
  two weeks, contracts within a month, **work permits running out within
  60 days** (and every morning after they lapsed, until HR writes the new
  end: employing someone without a valid permit is an offence).
- **Request a change** on *My HR record*: the person proposes a new home
  address or emergency contact (with a word for HR); HR sees it under
  *Changes asked* and on the record, what is there now and what is asked,
  and **accepts** (the record changes, in the journal as HR's change) or
  **declines** with a word; the person is told in the bell and may take
  their request back meanwhile. One waits at a time. The asked values live
  in the request only while it waits (the journal names fields).
- **Import HR records** from Lucca Core HR's or BambooHR's export or any
  spreadsheet (*Records → Import*): the same steps as the profile import —
  columns recognised in English and French (Matricule, Nom, Prénom,
  Civilité, Date de naissance, Nationalité, Type de contrat, Temps de
  travail, Heures hebdomadaires, Date d'entrée, Date de fin de contrat,
  Date de sortie, Titre de séjour and its expiry, an address in parts,
  the emergency contact… — header words from the studio's knowledge of
  these exports, not checked against a live one), a mapping step, columns left out named, dates
  asked when ambiguous, a preview row by row. Each row finds its record by
  employee number, then work email or name (a member), then legal name;
  otherwise it makes one — linked to the member, or **"Not in the Chest"**
  (a warehouse worker, an intern, someone arriving). Unreadable cells (a
  contract "bizarre", 31/13/2020, an end before the start) are said and
  left out; one transaction; the journal says "Imported: …" (field names).
- **Letters from templates** (*Records → Letters*): HR writes a letter
  once with fields ({name}, {job}, {firstDay}, {lastDay}, {contract},
  {company}, {today}, {signer}…, inserted with a click) and prints it for
  anyone from their record — a page laid out as paper, printed or saved as
  PDF by the browser. Two examples in one click, the **certificat de
  travail** (the mentions of D1234-6 and the health-cover portability of
  L911-8, from the studio's knowledge — not verified first-hand: a payroll
  expert should read it once) and an **attestation d'emploi**,
  each shown in the reader's language until HR rewords it (the company's
  address, the town: once). What the record lacks is left blank ("……")
  and named on screen, never silently; each printing is noted in the
  record's journal. Signed by hand; the signed copy goes in the documents.
- **The staff register** (*registre unique du personnel*, Code du travail
  L1221-13, D1221-23, R1221-26 — sources in THIRD_PARTY.md), written from
  the records: employees in the order they were hired (name and first
  names, nationality, date of birth, sex, job, qualification, entry,
  exit, work permit, and the mentions *CDD*, *salarié temporaire* with the
  agency, *mis à disposition* with the employer, *temps partiel*,
  *apprenti*, *contrat de professionnalisation*), interns in their own part
  (dates, tutor, place; the tutor's name as it is, never "(former
  member)" — and "the tutor has left: name a new tutor" on screen). Rows
  missing what the law asks are marked. **The register never leaves
  someone out silently**: everyone working here without a record (with
  *Create the record*), a record without a first day, someone who left the
  Chest without an exit date written, are named in a part "Not in this
  register" — on screen (with a warning at the top), **on paper** and at
  the end of the CSV. **Print
  or save as PDF** (a print layout, A4 landscape) or **download as CSV**.
  A record stays five years after the person's last day, then goes with
  its documents; a record of someone who worked here cannot be deleted
  (only one made by mistake).
- **Numbers**, all on **one population, said on the page**: the people
  working here — the HR records of people here today (interns and
  seconded staff included, people without the Chest too) and directory
  members without a record yet ("No HR record yet" under *By contract*).
  Headcount, by team, office and contract (each adds up to the headcount);
  arrivals and departures for each of the last twelve months; turnover
  over twelve months (half of arrivals plus departures, divided by the
  headcount a year ago — the usual French *taux de rotation*, **interns
  left out**: they are not employees; the page says so), each figure
  written next to its bar. Someone who left the Chest without an exit date
  in their record is not counted, and the page says to write it.
- **Salary is not kept here — a decision.** In France the pay slip and the
  DSN are made by payroll software or the accountant, which already hold
  salary and its history; a second copy in a directory tool would be one
  more place to leak the most sensitive figure of the company, readable by
  whoever runs the tool (the Chest gives the tool's builders its strongest
  role) and by the database's backups, without encryption the SDK does
  not offer yet (see "Needs from the SDK"). The register does not need it.
  Likewise the social security number (NIR, strictly framed by the CNIL) is
  not asked.

## With the other tools

**Hiring → People** (Proposal (studio): events between tools, once an
admin linked the two; `chest.proposals.json` `receives`):

- `hiring.hired` `{candidate, name, email, job, team, place, startDate,
  hiredBy}` makes an **arrival**: someone coming who is not a member yet.
  HR is told in the bell, in their language ("Hiring: Lucie Garnier joins
  on 2 November as Sales associate") and sees them under *Arriving* on the
  Checklists page (and in *Arriving soon* on the directory). Told again for
  the same candidate (a new date, a new job, or brought back after a
  cancellation), the same arrival is brought up to date — never a
  duplicate. Every field is checked; an event of another shape changes
  nothing.
- HR can **start the arrival checklist before they have access**: steps for
  their manager-to-be (chosen then), HR or named people run at once; steps
  for the newcomer wait ("once they have access").
- When the newcomer gets the tool, HR **links** the arrival to them — on the
  Checklists page, or in one click when People notices a member of the same
  name (on the directory and on their profile). Their profile's empty
  fields take the job, team, office, start date and manager; the checklist
  becomes theirs and their steps reach their bell.
- `hiring.hire_cancelled` `{candidate}`: the arrival goes if nothing was
  started for it; otherwise it is marked *Hire cancelled*, its checklist
  stopped (its steps leave everyone's bell) and HR is told; HR deletes it.
  Brought back into Hired, it is expected again (a stopped checklist is
  restarted by HR from its page).
- **Personal data of arrivals**: the email Hiring sends is never stored.
  Once linked, the arrival keeps no personal data (only which hire became
  which member, so a repeated event changes nothing). Never linked, the
  arrival and its checklists are deleted 90 days after the start date (or
  after it was told, without a date).

**Leave → People** — "away until": `leave.approved` / `leave.cancelled`
`{member, from, to, fromHalf, toHalf, request}` (Leave's own events, the
ones Rooms receives; unchanged).

- While an approved leave covers today (the Chest's day, `chest.today()`),
  the person's card and profile say **"Away · back on Mon 12 Oct"** —
  *"Away this morning"* or *"Away this afternoon"* for half days, *"back on
  … afternoon"* when the leave ends at noon. The day back skips Saturdays
  and Sundays and follows leaves that follow each other. **Never the kind
  of leave nor its note** (Leave does not send them).
- Kept: the member, the dates and halves, Leave's request reference and
  when Leave said so — for members who have People only; forgotten once
  the last day is past (directory read, morning run) and when the person
  leaves the Chest or is erased. Leave's events are checked field by
  field; another shape changes nothing. A cancelled leave keeps its
  reference and time for a week, so an approval delivered late (events
  come at least once, not always in order) cannot bring the badge back.
  Each request keeps Leave's latest word by the time Leave gives
  (`occurredAt`); at the same time an approval wins over a cancellation,
  as in Rooms — the pair Leave tells for a shortened leave keeps its
  remaining days whichever arrives last.

**Equipment → People** — everything is back (`receives`). The contract,
v1, which Equipment publishes (`tools/private/equipment/lib/returned.ts`,
its `emits`): Equipment receives `people.leaving` and lists what the person
holds; once everything they held is back, it publishes

- `equipment.returned` `{"member": "mbr_…"}` (key
  `equipment:<member>:returned:<time>`), and People ticks the running
  leaving checklist's **"Return the laptop, badge and keys"** step for
  that person, marked "Ticked by Equipment: everything is back"; its
  person's to-do and HR's "complete" follow, as for a tick. Only the
  example step does (its words' key `offboarding.equipment`, kept until HR
  rewords it): a step HR wrote itself stays HR's to tick. Another shape,
  another tool, a stopped checklist: nothing; told twice, nothing more.
  Built and tested on both sides (`src/lib/returns.ts`,
  `test/returns.test.ts`, the harness's *Deliver*; Equipment's
  `lib/returned.ts`, which tells it again every quarter of an hour while
  the Chest cannot take it). Until an admin links Equipment to People for
  it, HR ticks the step by hand.

**People → other tools** — departures and records (`chest.proposals.json` `emits`):

- When HR **starts a leaving checklist** for a member, its last day is
  their departure: People publishes `people.leaving` `{member, lastDay}`.
  Stopping it publishes `people.leaving_cancelled` `{member}`; *Undo* (or
  *Start it again*) tells it again. With several leaving checklists
  running, the latest last day counts; a change that moves nothing tells
  nothing. Who and when only — never the checklist, its steps or a
  reason. **Equipment** receives it: it lists what the person holds to
  take back before that day; **Leave** sets the person's last day from it
  (unless HR typed one in Leave or the record has one).
- `people.record` `{member, employeeNumber, startDate, lastDay, workDays,
  weeklyHours}` — what Leave (and any HR tool) needs of an HR record, so
  HR types it once: told when a record linked to a member is written,
  linked, created or imported, **only when one of these changed** since
  People last told it (`records.told`; a record not told is told at its
  next change). `employeeNumber` string or null, days `YYYY-MM-DD` or null
  (`lastDay` is the record's last day), `workDays` ISO days `[1..7]` (1 =
  Monday) or null when not said, `weeklyHours` a number or null. Never the
  name, the contract, the address or anything else of the record. A record
  of someone without the Chest is never told. **Leave** receives it: the
  number, first day, days worked and last day follow the record.

## Looks

People wears its own identity, the **Portrait gallery** (cream walls,
terracotta, deep plum ink, portraits in arches) — or **any theme of the
store's catalogue**, or **the company's own brand** (its colours, fonts,
corners, and its logo where People's mark is), as the company chooses in
its Chest, for all its tools or for People alone. Same features, same
pages, readable in every look (every theme is checked against WCAG AA,
light and dark). The look is resolved on the server
(`chest.theme()`, a Proposal (studio) of the SDK) and served as the page's
own stylesheet (`/chest/look.css`, named by its content's hash: cached until
the look changes); no script, no inline style, nothing to set in People. The staff register and the HR record
print black on white whatever the look (DESIGN.md, "Paper").

The shared pieces — the header and its labelled tabs, toasts with *Undo*,
dialogs, people pickers, date fields, the search box, file pickers, tables,
empty states, avatars — are the store's UI kit (`@argentic/chest-ui`,
`vendor/`), so they behave as in every other tool.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `hr` | HR | everything below, and: everyone's job fields and extra fields, the table, templates, start/follow/stop checklists, arrivals, tick any step, import, export, **HR records, documents, the staff register, numbers, the records import, letters, answering asked changes** |
| `member` | Member | read the directory and the org chart, edit their own profile, do and tick the steps given to them, see the checklists they take part in (theirs, their reports', those with a step for them), **read their own HR record and ask HR to change their address or emergency contact** — never anyone else's |
| (none) | — | "You can't use People yet" |

The owner, the admins and the tool's builders arrive as `hr` (and so read HR
records: see "On a Chest").

## First minute

- **What a new person sees first:** the team as a wall of portraits, a big
  search field, and — if they are new — their own face under "Say hello",
  plus "Add a few words about you" when their profile is empty.
- **The first thing they do:** type a name or a topic ("invoices") — the
  wall filters as they type — and open a card; or complete their profile.
- **Clicks for the main jobs:** find someone and call them: type + 2
  clicks. Tick a to-do: 1 click from *My to-dos* (the bell links there).
  HR starting an arrival: *Start a checklist* → person, template, date →
  *Start* (4 clicks; the first day is pre-filled from the start date).
  HR setting up a new company: the directory shows **"Set up People: 3
  steps"** (import, the table, the records), each ticked when done:
  *Import* (a BambooHR or Lucca file) or *Edit as a table*; then *Records*
  → *Create their N records* (1 click) → complete each; the staff register
  is then written.
- **A mistake:** ticking has *Undo*; deleting a step or stopping a checklist
  has *Undo*; a cell of the table has *Undo*; deleting a document or an
  extra field has *Undo* (an Undo that comes too late says so); deleting a
  checklist or a record for good asks first, in the page; a refused save says why and keeps what was
  typed; a manager that would make a loop is refused in plain words; a
  first day on a weekend is questioned.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` (`?q=`, `?team=`, `?office=`) | members with a role | the directory |
| `/chest/people/<id>` | idem | a profile |
| `/chest/people/<id>/edit` | the person, HR | edit a profile |
| `/chest/chart` | members with a role | the org chart |
| `/chest/todo` | idem | my to-dos |
| `/chest/checklists`, `/chest/checklists/new` | HR | arrivals and departures, templates; start one |
| `/chest/checklists/<id>` | HR, the person, their manager, those with a step | one checklist |
| `/chest/checklists/templates/<id>` | HR | a template |
| `/chest/import`, `/chest/export` | HR | CSV import (with the mapping step), CSV download |
| `/chest/table` | HR | edit everyone as a table; extra fields |
| `/chest/records` | HR | HR records: coming up, without a record, working here, starting, left |
| `/chest/records/<id>` | HR, the record's person | one record (HR edits; the person reads) |
| `/chest/records/<id>/documents/<doc>` | HR, the record's person | a document, through a fresh signed link (303) |
| `/chest/records/<id>/letters/<letter>` | HR | a letter filled from the record, laid out as paper |
| `/chest/records/import` | HR | import HR records from a CSV (Lucca, BambooHR, a spreadsheet) |
| `/chest/records/letters` | HR | the letters' templates |
| `/chest/records/register`, `/chest/records/register/csv` | HR | the staff register; its CSV |
| `/chest/numbers` | HR | headcount, arrivals and departures, turnover |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-schedules` | the Chest only (signed) | the runs of `chest.json`'s schedules: `morning`, weekdays 07:40 |
| `/chest/actions/<name>` | members (from the page) | every change (`src/actions.ts`) |
| `/chest/look.css`, `/assets/…` | the page | the look; the browser's script, styles, fonts, icon |
| `/` | anyone | "People lives in your Chest" |

## Mail to people outside the company

Sent through the Chest's mail connector (studio proposal, not built yet).
Members are never mailed by People: they get notifications, which the
Chest mails them by their own choice.

| Recipient | Purpose | When | Content | Attachments | Reply-To |
|---|---|---|---|---|---|
| A newcomer not in the Chest yet (an expected arrival), at the work address HR typed on their arrival — only when `members.matchEmails` says the address is no member's (a member's address: a notification instead; no answer: nothing) | Welcome them before they have access | When HR starts their welcome checklist, once; not for a first day more than two weeks past; never to Hiring's personal address; a bounce shows on the checklist (`mail.status`) | "Welcome to {company}, {name}": their first day, their manager, that their first steps will wait for them in People; signed by the HR person; plain text, in the Chest's language | None | The HR person who started the checklist (their Chest address), else the company's reply address |


- `capabilities`: `database`, `members` (names, photos, roles: the directory
  itself), `members.email` (the work address on profiles, the import's
  matching), `files` (the records' documents, 20 MB each), `notifications`
  (the bell and the tile's number: open to-dos); `receives: ["member.*"]`.
  No network. Proposal (studio), in `chest.proposals.json`: `mail:
  {send: true}` (the welcome email to an arrival not in the Chest yet —
  never to a member), `emits`, `receives` (Hiring, Leave, Equipment).
- `"schedules"` (contract 0.4): `morning`, weekdays at 07:40 on the
  Chest's clock, posted to `POST /chest-schedules`.
- `build.static: ["/assets/"]`: the browser's files, the fonts and the icon
  are served there, to anyone, without a member — nothing else is.
- **Who is HR**: the owner, the admins and the tool's builders enter with
  the first role, `hr` — so they read HR records. Give the tool's building
  to someone who may read them, or see "Needs from the SDK".
- **The directory is the Chest's members who have the tool**, and the
  staff without the Chest HR keeps a record of. Give People to everyone
  (open to all) so the directory is the whole company.
- **Someone leaves** (or loses access): they leave the directory at once;
  their profile is kept 30 days in case they come back, then purged. The
  people they managed no longer have a manager, their open steps go to
  HR (whoever started the checklist, when still HR), templates naming them
  give the step to HR, the people they managed keep them as manager,
  flagged "has left" — and HR is told in the bell (and to write their last
  day in their record). Checklist history keeps them as "(former member)".
  Their HR record stays (the register).
- **An erasure** deletes their profile, extra fields and the checklists
  about them, and replaces their id everywhere else (journal included).
  Their HR record: deleted if they never started; otherwise the law wins
  over erasure for what the register must show (GDPR art. 17(3)(b)): the
  identity, contract fields, contracts and certificates stay, **detached
  from the member**, until five years after their last day; the emergency
  contact, the address, ID and other documents go. Then it is
  acknowledged.
- **Privacy**: no photo is stored (the Chest's own); a birthday is day and
  month only, and only when the person turns it on — turning it off forgets
  it. HR records hold personal data that only HR and the person see; the
  journal names fields, never values; no salary, no social security
  number. The legal name is written by HR in the record (not copied from
  the Chest): the register must still show it five years after the
  person left, after the Chest forgot them — the one place People keeps a
  name, on purpose. Data is not encrypted at rest by People itself (see
  "Needs from the SDK").
- No WebSocket: pages re-read themselves every 30–60 s while visible.

## Needs from the SDK

People runs on SDK 0.4.1 + studio proposals (0.4.1-studio.6), contract
0.4, and the studio's `@argentic/chest-app` (0.1.0-studio.3), in `vendor/`.
From 0.3.0: `member(request)` with the member's `language` (the
interface and the bell in each member's language) and `timeZone`;
`chest.organization.name` (the company's name in the welcome and
the letters); `chest.timeZone` and `chest.today()`: "today", due days and
anniversaries — the database's `current_date` is the same day, since the
Chest makes its zone the TimeZone of the tool's database sessions. The
member's own zone (`src/lib/zone.ts` `todayOf`, `chest.todayIn`, a studio
addition): "today" and "late" on a person's own *My to-dos*, and every
time shown to them (the day a step was ticked, a record's history); the
Chest's zone stays for what concerns everyone (checklists' due days,
records, the morning run).

- **Scheduled tasks** (official since 0.4.0: `schedules` in `chest.json`,
  `morning`, weekdays 07:40): one bell item per person with steps due today
  or late, HR's endings (trial periods, contracts, work permits, dated
  fields), tiles' numbers kept true overnight, the purges (departed
  profiles after 30 days, past leaves, arrivals, records after five years,
  the journal after two, the delivered ids after 30 days). The tile's
  number is also set whenever a step changes and when its owner opens *My
  to-dos*. Reading a page never deletes anything.
- `notifications` (0.4.1) with `translations` (Proposal (studio),
  announced for 0.5): every bell item in English and French in one call,
  the member's welcome among them.
- `mail` — **Proposal (studio)**: `mail.send` of the welcome email to an
  arrival not in the Chest yet, at the work address HR gave (`replyTo` the
  HR person's Chest address, `members.email`; else the company's reply
  address the owner set with the connector). The start form asks
  `mail.available()` (`src/lib/mailing.ts`) before it promises the email:
  "{name} gets a short welcome email" only when the Chest would send it;
  otherwise it says why none will leave (the company's mail not connected,
  mail paused or the day's emails used, no work email). The key names the
  checklist and the address (`people:welcome:<checklist>:<address>`), so a
  restored database never reuses one person's key for another. Without the
  connector nothing is sent, nothing fails, and the page does not say it
  was sent. Before sending, `members.matchEmails([address])` (Proposal
  (studio)): an address already a member's gets the notification instead;
  no answer, nothing leaves. The message id is kept on the checklist
  (migration 0009: `journeys.welcome_mail`, never the address); its fate is
  asked with `mail.status(id)` when HR opens the checklist and every
  morning for two weeks, and a bounce, complaint or failure shows on the
  checklist. Limit: `matchEmails` matches only members who have People; a
  Chest member without People whose address HR typed on an arrival would
  still get the email (the Chest gives People no way to know them).
- **Events between tools** — **Proposal (studio)**: receives
  `hiring.hired`, `hiring.hire_cancelled`, `leave.approved`,
  `leave.cancelled`, `equipment.returned`; emits `people.leaving`, `people.leaving_cancelled`,
  `people.record` (see "With the other tools"). Without it, HR starts checklists for
  members only, nobody reads "Away", and Equipment is not told of
  departures.
- **The company's look** — **Proposal (studio)** (`chest.theme()`): the theme or brand the company chose. Without it (a
  real Chest today) People wears its own identity.
- **Files** (`files`, 0.2.0): the records' documents, uploaded by the
  browser straight to the Chest (`uploadUrl`), opened through `files.url`.
- **Wished for, not built** (in the SDK report): **sealed fields** — a
  Chest-held key to encrypt the most sensitive fields at rest
  (`secrets.seal(text)` / `open(sealed)`), so a database backup or a
  builder reading tables sees nothing; **a role the builders do not get**
  (the manifest marking `hr` as "never given by default"), so building the
  tool does not mean reading records; a **Chest-wide audit journal** the
  tool writes to and the owner reads (People keeps its own meanwhile);
  the Chest's
  **working week and public holidays** (the "back on" day skips Saturdays
  and Sundays only); Equipment's items as steps of the leaving checklist
  (a request/answer between tools, not an event).

## Develop

How it is made: the studio's starter stack — a Hono server that renders
React pages (`src/pages/`), a few islands that run in the browser
(`src/islands/`), typed actions (`src/actions.ts`) over the services
(`src/lib/`, the rules and the SQL), Vite for the two builds, the machinery
from `@argentic/chest-app` (`vendor/`). AGENTS.md has the map.

```sh
npm ci
npm test          # tsc, the server built into dist/test, node:test (113 tests);
                  # TEST_DATABASE_URL for a real PostgreSQL, else PGlite
npm run build     # tsc, the browser's files, the server (dist/), as the Chest does
npm start         # the built server on PORT, as the Chest runs it
npm run dev       # rebuilds on every change
```

Measured on 6 October 2026 with `lab/measure` (Node 24.21, production
build, 20 pages read then 30 s at rest, five times; the server process
tree): **~70 MiB PSS at rest** (125.7 on Next.js 16), RSS ~173 MiB (236),
first page ~0.39 s after start (0.64), image ~30 MiB (460), build peak
~280 MiB PSS in 2.4 s (1,064 MiB in 19.6 s; it now fits 512 MiB and one
CPU, where `npm ci` alone did not).

In the studio: `node lab/chest-dev/dev.mjs tools/private/people --reset`
(a sample company from `seed/sample.sql`: Nora started six days ago, her
welcome checklist is under way), `node lab/chest-dev/dev.mjs tools/private/people --prod --build --reset --port 4700`
then `node lab/chest-dev/flows/people.mjs 4700` (the browser flows),
`node lab/chest-dev/audit.mjs tools/private/people --port 4700`, `node lab/chest-dev/screens.mjs tools/private/people`.

## What it does not do (yet)

Payroll, salary and compensation reviews, and the social security number
(never here: see "HR records"); **e-signature** of contracts and letters
(needs a qualified signature connector: letters are printed and signed by
hand); contracts and amendments generated from templates (the letters
cover certificates and attestations; a contract is longer and legal —
written in Word, uploaded); the **attestation employeur France Travail**
(made by payroll through the DSN, not a letter — from the studio's
knowledge, not verified first-hand); the dates of an administrative
authorisation of hiring or dismissal in the register (rare cases); the
register's "indelible" history as a legal PDF signed and timestamped (the
journal names changes, never values: no dated history of job and contract
values yet); encryption at rest of records (needs the SDK); people without
the Chest have no profile page, photo or "Ask me about" (the directory
shows their name, job, team and manager from their record, and they are
not in the directory's export or HR's table); "Request a change"
covers the home address and the emergency contact only (the rest of the
record comes from documents; the work phone is the person's own to edit);
field visibility has two levels (everyone, or HR and the person) — no
"team only"; vCard export; "away" from other sources than Leave (a
calendar); public holidays in the "back on" day; teams as Chest groups;
drag-and-drop in the org chart; the welcome's
words are the tool's (HR cannot reword it yet) and it goes when the
checklist starts, not on a day HR picks; an
export of checklists and their history; changing a
choice field's list or a date field's reminder after it was added (remove
it and add it again: Undo keeps its values meanwhile); a field's kind never
changes. The sample company's job titles, teams and fields are the
company's own words (the example checklists' and letters' names and texts
are the tool's, and speak each reader's language until HR rewords them).
