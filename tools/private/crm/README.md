# Clients — companies, contacts and deals, and never forget to call back

A small team's shared client book, inside its Chest: the companies it sells
to, the people there, the deals it hopes to win moving through a pipeline,
what happened with each (calls, meetings, emails, notes) and — the heart of
it — **the next step** on every deal and contact, so nobody forgets to call
back. Replaces HubSpot CRM, Pipedrive, Axonaut/Sellsy CRM and folk for a team
that needs the 80 % they use every day. Research:
`reports/02-open-source/crm.md` of the studio.

## What it does

- **My day** (home): my late and today's next steps first ("2 days late"),
  then the next seven days, with their time when they have one; one tap
  *Done* logs it in the history and — when it was the deal's or the
  person's last open step — asks *What's next?* in its place (with Undo).
  *A step for me* plans a to-do about no client ("prepare the trade show").
  **New from your forms** (sales and managers): the contacts a website
  form made that nobody has yet, each with its message — *I'll take it*
  (then *What's next?* plans the call), *Give to…* someone, or *Not a
  lead* (with Undo). A manager also sees "3 form answers to check" when
  some may sit in the wrong file (see "With the other tools").
  Beside it: my open deals by stage (value, count, weighted value) and what
  was won this month. A **viewer** (who owns no steps) sees instead the
  team's open pipeline by stage and the latest wins.
- **Deals**: a board by stage — drag a deal to its next stage with the
  mouse, a finger (long press) or the keyboard (Space, arrows, Space); each
  column shows its count, its total (per currency) and its probability,
  and its first 100 cards — past that, "N more deals: see the list"
  opens the list view on that stage. Won and Lost are
  the two end stages: dropping a deal there asks why, in a few words (one
  tap on a usual reason). Closed deals stay on the board 30 days; a legend
  says what the cards' dots mean. A list view (200 a page) filters by owner,
  stage, open/won/lost, "closing this month" and one of the team's own
  fields, gives ticked deals to someone at once, and exports what it shows.
  Each deal has a page: its stage path (one click moves it; a list on a
  phone), Won/Lost (Won stands out only at the last open stage), its owner,
  its next steps, a one-tap log, its files and its history.
- **Companies** and **contacts**: on a phone, only the search shows above
  the list, and one *Filters (n)* button opens the rest (owner, tag, own
  field, order, exports); an empty list shows none of them. Lists 100 a page, sorted by name, last
  activity (or last contact) or newest, with search, owner, tag and
  own-field filters, and "no contact for 3 years" (see GDPR below). Tick
  rows (or the page, or all that match, up to 500) to give them to
  someone, tag, untag or delete them at once — each checked as if changed
  alone. One page each with how to reach them (tap to call — a second
  number too — or write), their people and deals, the next steps
  (contacts), the team's own fields, files, the log and the history — a
  company's history gathers what was logged on its deals and people too.
  A company has a structured address (street, postcode, city, country),
  an email, a SIREN or SIRET and a VAT number; a contact two phones and a
  LinkedIn or web address.
- **Your own fields** (managers, *Settings → Fields*): text, number, date or
  one choice, on companies, contacts and deals — in the forms, on each
  record, as a list filter, in every export and at import.
- **Several next steps**: a deal or a person may have more than one open
  step ("call Tuesday 14:30", "send samples Thursday"), each with an
  optional time; the soonest is the one the lists show.
- **Timed steps in your calendar**: a next step with a time goes into its
  owner's **Chest calendar** — the one feed the Chest serves each member,
  added once to Google Calendar, Outlook or Apple Calendar — as a 30-minute
  event titled "Call Claire · Head office fit-out" that opens the deal (or
  the contact). Changed, given to someone else, done, deleted, left
  without a time or to nobody: the event follows or goes. A step without a
  time stays a to-do, out of calendars. The step form says "it goes into
  your Chest calendar" only where the Chest has one (studio proposal
  `calendar`; `src/lib/step-calendar.ts`).
- **"Log this call?"**: on a phone, *Call* on a contact's (or company's)
  page dials; back on the page afterwards (more than a few seconds later,
  within three hours), it asks once — "You called Claire Durand. Log the
  call?" — with a line for what was said; *Not now* forgets it. The tap is
  remembered in that browser tab only (nothing leaves it until they log).
- **Merge duplicates**: *… → Merge with a duplicate* on a company or a
  contact: the one kept gains the other's deals, people, history, next
  steps, files and any detail it lacked; the other is deleted (asks once).
- **Files** on a deal, a company or a contact (a signed quote, a
  specification), sent by the browser straight to the Chest's files, 25 MB
  each, 30 per record; removed by who added them or a manager.
- **Team** (everyone who reads): open deals by person (value, weighted, deals
  without a next step, late steps); **the Monday numbers** — what each
  person logged this week or one of the three before (calls, meetings,
  emails, notes) and, from stage to stage, how many of the last 12 months'
  deals reached each stage and what share went on (a won deal went
  through every stage); won and lost per person month by month
  with a win rate, what should close by expected month, why deals are lost.
- **Log in one tap**: *Log a call*, *Log a meeting*, *Log an email*, *Add a
  note* are four buttons (never a second "Call" beside the one that dials); a call,
  a meeting or an email needs no words. The author edits their words;
  the author or a manager removes them (Undo for a day).
- **Search** everything from one box — `/` anywhere focuses it: names,
  emails, phones (whatever their spacing, `+33` or `0`), websites; accents and case aside; close spellings found
  ("Lefebvre" finds "Lefèvre"). Postgres full-text (`unaccent`) and trigram
  similarity.
- **Duplicates**: while typing a new company or contact, what looks like it
  (a close name, the same email, the same web domain) is shown with a link;
  a warning, never a refusal.
- **Import**: a CSV of contacts, companies, deals or their **history**
  (calls, meetings, emails, notes, to-dos — Pipedrive's activities and
  notes, HubSpot's notes), with a column-mapping step (guessed from
  HubSpot's and Pipedrive's export headers and French spreadsheets) and a
  preview. **Nothing is dropped silently**: a column the tool does not know
  goes into the record's notes ("Lifecycle Stage: Customer") unless someone
  leaves it aside — or a manager makes it one of the team's fields (its
  kind guessed from its values); a column named like a field fills it.
  Owners the Chest does not know are named *before* importing, and the
  importer chooses who receives their rows (themselves, nobody, a
  teammate); the report says it again. *Create Date* keeps when a record
  was created. Records already here are linked, not doubled — kept as they
  were, or their empty details filled in on request. Open to-dos due from
  a month ago on become next steps. **Undo this import** takes back, for a
  day, everything it added (its author or a manager). vCard (3.0, 4.0, 2.1
  quoted-printable) import of an address book.
- **Export**: each list as CSV (headers in the reader's language, the
  team's fields as columns; a cell that would start a spreadsheet formula
  gets a leading `'` — phone numbers and amounts stay as they are, and
  this tool's importer takes the `'` off again), contacts as vCard 4.0
  (one or all), one person's whole file as JSON; and, for a manager, the
  **whole client book** as one ZIP of CSV files, values kept exactly (companies, contacts,
  deals, activities, next steps, fields) with stable English column names
  and ids.
- **The bell**: when someone gives you a deal or a next step; every weekday
  morning (*schedules*) one item with your due next steps; the tile's number
  is your late + today's next steps. Each item is one notice in English with
  its French translation (SDK 0.4.1-studio.5 `translations`); the Chest shows
  each member theirs, and **mails it to them if they chose so** in the Chest
  (every one, once or twice a day, or never) — Clients has no "email me"
  setting and sends no email of its own.
- **Stages** (managers): rename (the default ones speak each reader's
  language until renamed), set each stage's chance to win, reorder, add,
  remove an empty one.

## Roles

| Role | May |
|---|---|
| `manager` | Everything: every deal, give anything to anyone, the stages and the team's own fields, delete or merge any company or contact, import (and create fields from a file), undo anyone's import, export the whole book |
| `sales` | Add and edit companies and contacts, log on anything and add files, add deals; change the deals they own (or that nobody owns — they may take them); give things to colleagues; delete or merge the companies and contacts they own; import and undo their own imports for a day |
| `viewer` | Read everything (their home is the team's pipeline); export lists only if a manager allows it |

Who may download the lists (CSV, vCard) is a manager's choice in
Settings, *Who may export lists*: managers only, managers and sales (the
default), or everyone. The whole-book ZIP stays a manager's.

Enforced on the server in `src/lib/access.ts`; tested in `test/access.test.ts`
and every service test.

## First minute

- **What does a new user see first?** *My day*: a greeting, what they
  promised to do today (late in red, today in amber), their pipeline in
  numbers. On an empty tool: "Your client book starts here" with *Add a
  company* and *Import a file* (a viewer reads "Nothing here yet — your
  sales team adds the clients").
- **What is the first thing they do?** Tick a next step *Done* — the tool
  logs it and asks what comes next — or add a deal (*New deal*, top right).
- **How many clicks for the main job?** Log a call: 1 tap on the contact's
  or deal's page. Plan the next step: 3 (Plan → type → *Plan it*, "Tomorrow"
  preselected). Move a deal: one drag, or one click on its stage path.
- **What happens after a mistake?** Every log, every *Done* has an Undo;
  a deal moved by mistake moves back; a deal "Won" by mistake is reopened.
  A whole import is undone for a day. Only deleting (a company, a deal, a
  person, a selection) and merging ask first — deleting a person is for
  good, on purpose (GDPR).

## Routes

| Route | What |
|---|---|
| `/chest` | My day |
| `/chest/deals`, `?view=list&owner=&stage=&status=&closing=month&cf=&cv=&cmin=&cmax=&page=` | Board, list |
| `/chest/deals/[id]` | A deal |
| `/chest/companies`, `/chest/companies/[id]` (`?q=&owner=&tag=&sort=&cf=…&page=`) | Companies |
| `/chest/contacts`, `/chest/contacts/[id]` (same, and `stale=1`) | Contacts |
| `/chest/team` | The team's numbers |
| `/chest/api/files` (POST authorise, PUT record), `/chest/files/[id]` | Files: an upload to the Chest; a fresh signed link |
| `/chest/contacts/[id]/vcard`, `/chest/contacts/[id]/data` | One vCard; one person's data (JSON) |
| `/chest/export/{companies,contacts,deals,vcf}`, `/chest/export/all` | Lists as files, with the page's filters; the whole book as a ZIP (managers) |
| `/chest/search?q=` | Search |
| `/chest/import`, `/chest/settings`, `/chest/settings/fields` | Import (and recent imports, Undo); stages and fields (managers) |
| `/chest-events` | The Chest's lifecycle events, `forms.contact` from Forms and `booking.confirmed` / `booking.cancelled` from Booking (signed) |
| `/chest-schedules` | The weekday morning (`schedules` of `chest.json`, signed `Chest-Schedule`) |
| `/` | The public host: says where the tool lives |

## On a Chest

- `capabilities`: `database`, `members` (names, photos, who may own
  things), `notifications` (the bell and the tile's number), `files` (files
  on records: the browser uploads to the Chest with a one-time signed
  address, the tool lists them and opens them through fresh 15-minute
  links); `receives: ["member.*"]`. No network.
- **Someone leaves** (or loses access): their deals, companies, contacts and
  open next steps go to *unassigned* (each deal's history says so); the
  managers are told in one bell item, with a link to the unassigned deals;
  anyone of sales may take a deal nobody owns. What they logged stays, signed
  with their name. **An erasure** does the same, then replaces their id
  everywhere (authors, creators, the history's mentions) with "Former
  member", and is acknowledged.
- Owners are member ids of people who have the tool with the `manager` or
  `sales` role (checked with `members.lookup`); names are resolved when
  rendering.
- No WebSocket: an open page reads itself again when its reader comes back to it, and every 30–60 s only while they were active lately (the package's `useAutoRefresh`; a tab left open lets the Chest put Clients to sleep); a refresh with nothing new is a 304, nothing rendered: each page's version is the package's change stamp (`migrations/0009`: one log row per transaction that changed rows, seen at its commit — a 5,000-row import does not hold other writes, and a late commit always shows), with the day and the quarter hour.
- Money is whole cents (`bigint`) in the company's currency (`chest.currency`, given to each new deal), read as people write it (the package's `field.money`: "12 500,50", "12,500.50"; "1,250" alone asks *thousands or cents?*), formatted with kept `Intl` objects.

## GDPR

Contacts are personal data of people outside the company. Their own
fields, second phone, web address and files are part of it: exported with
them, deleted with them.

- **Right of access**: *Export their data* on a contact's page gives
  everything the tool holds about that person (record, deals, what was
  logged about them, next steps) as JSON.
- **Right to be forgotten**: *Delete this person* (a manager or the
  contact's owner) deletes the contact, **every activity that names them —
  with what was written in it** — and their next steps; their deals stay,
  without them; their files are deleted from the Chest too. It cannot be
  undone, on purpose. A deal title a person
  wrote with their name in it is not rewritten: rename it.
- **Keeping data**: the CNIL's reference for managing clients and prospects
  recommends keeping a **prospect**'s data at most **three years from
  collection or from the last contact coming from them** (opening an email
  does not count). Clients stays helpful: each contact has a *last contact*
  (set by a logged call, meeting or email), the contacts list filters
  "No contact for 3 years", and a contact's page warns past three years.
  Deleting stays a person's decision — the tool does not purge by itself.
  Source, read through search snippets on 2026-09-28 (the CNIL site was not
  fetched from here, a human should confirm):
  https://www.cnil.fr/fr/questions-reponses-sur-les-referentiels-relatifs-la-gestion-des-activites-commerciales-et-des
  and https://www.cnil.fr/sites/cnil/files/atoms/files/guide_durees_de_conservation.pdf
- Notes fields remind people not to write sensitive data (health,
  opinions…).

## With the other tools

Through the studio's proposal **events between tools** (`chest.proposals.json`
`"emits"` and `"receives"`), once an admin of the Chest linked Clients to
another tool.

### What Clients tells

| Event | When | Data |
|---|---|---|
| `crm.deal.won` | A deal enters Won (board drop or the Won button, after the reason) | `{ deal, title, amount` (integer cents) `, currency` (the deal's, ISO 4217) `, company: { ref, name, address, postcode, city, country, siren, vat, email } \| null, contact: { name, email } \| null, owner }` — key `crm:<deal>:won:<time>` |
| `crm.deal.reopened` | A won deal leaves Won (reopened, or moved to another stage) | `{ deal }` |

**Quotes** starts a quote from `crm.deal.won`. Clients sends the company's
street, postcode, city, country (an ISO code; a country written in a file
that is not recognised is kept on the record but sent as `null`), SIREN
(the 9 digits of a SIREN or SIRET), VAT number and email; what is blank is
sent as `null`, never guessed. Publishing is a
courtesy (`src/lib/share.ts`): when the Chest cannot take the event, the deal's
move still stands. Deals imported already won are not told.

### What Clients receives: `forms.contact` from Forms

When a form of **Forms** maps a contact (its Settings, "Also create a
contact in Clients") and someone answers it with an email or a phone, Forms
publishes `forms.contact` (version 1; the contract is Forms' README, "With
the other tools"). Clients (`src/lib/from-forms.ts`, on `/chest-events`):

- **Finds the person — a privacy rule.** The same email (whatever its
  case) is the same person. The same phone (digits compared, either of the
  contact's two numbers; "+33 4 78…" is "04 78…") is the same person
  **only when the name is the same too** (accents, case, punctuation and
  word order aside: "DURAND Paul" = "Paul Durand"; "P. Durand" is not). A
  company's switchboard, a shop's shared line or a mistyped digit is
  shared by several people: one visitor's message must never land in
  another client's file, where their right of access cannot find it and
  erasing the other would delete it (round 3 found Nina Roux's quote
  request filed on Claire Durand, whose mobile it was).
- **Otherwise makes a contact**: the name given (else the email, else the
  phone), the email, the phone, and the company of that name — found
  accents and case aside, or added. Their history starts with "Added from
  the form “Contact us”". When its phone is another contact's under
  another name, it is marked **"Maybe the same person as Claire Durand"**:
  its page offers *Merge them* (the merge dialog, Claire preselected) or
  *Not the same person*; the bell says it too. A person decides, never
  the tool.
- **Shows who filled it in**: the line carries what the form gave — name,
  email (a `mailto:` link), phone (a `tel:` link), company — under
  "Filled in the form …", even when it matches the contact. A new address
  the form gave is never written over the team's, but it stays visible.
- **Writes one line in their history**: "Filled in the form “Contact us”"
  (« A rempli le formulaire … » — each reader's language), with the
  message as written, dated when the form was answered. It shows on the
  contact's page and their company's. It counts as a contact coming from
  them (their *last contact*, the prospects' three-year rule).
- **Keeps what the team wrote**: on a known contact only an empty email,
  phone or company is filled in; the name, the owner and the rest stay.
- **Who owns a new contact: nobody** (*unassigned*, like the clients of a
  teammate who left). An import gives its rows to the person who imports;
  here nobody acts, so nobody is made owner behind their back. The
  **managers** are told in the bell ("New contact: Nina Roux filled in the
  form “Contact us”", the message below); for a known contact, **its
  owner** is told instead. The new contact is a **lead**: it waits at the
  top of everyone's *My day* (sales and managers) until someone takes it,
  is given it (they are told in the bell) or says *Not a lead*; the
  company the form made goes to whoever takes it.
- **A manager's check (repair)**: *Settings → Form answers* lists the
  lines that may sit in the wrong person's file — the form gave another
  email than the contact's, or the line was filed **before this version**
  (no identity kept) on a contact the form did not make. The previous
  version matched a phone whatever the name, and no migration can tell
  afterwards which of those lines were right: so none is moved
  automatically; each is listed for a manager, with *Open the answer*
  (in Forms, to read who wrote it), *Right person* (with Undo) or
  *Move…* to the right contact (or to a new contact made from what the
  form gave). A manager whose Chest ran the round-2 version should open
  this page once.
- **Never twice**: the event's id is kept on the line of history (a unique
  index), and an answer published again under another id finds its line —
  a replayed or doubled delivery makes no second contact, line or bell
  item. An event of another shape, or with neither an email nor a phone,
  is accepted and ignored.
- **Links back to the answer**: the form's name on that line opens the
  answer in Forms. The line keeps the answer's path only (never an
  address, which changes when Forms gets a custom domain); the link is made
  when the page is shown, with `chest.toolLink("forms", path)`
  (`src/lib/page-data.ts`, `answerLink`). While Forms is not installed on the
  Chest — or the path is not an answer's page on Forms' team host — the
  form is named without a link. Following it opens Forms only for a member
  who has Forms; its host tells the others.

### What Clients receives: `booking.confirmed` and `booking.cancelled` from Booking

When a guest books a meeting with a member in **Booking** (on its public
page, or a host books for them), moves it or cancels it, Booking publishes
`booking.confirmed` / `booking.cancelled` (version 1; the contract is
Booking's README, "With the other tools"). Clients (`src/lib/from-booking.ts`,
on `/chest-events`, `booked_meetings` in migration 0006):

- **Finds the guest by the forms' rule**: the same email (lower-cased) is
  the same person; a phone only with the same name; never the phone alone
  — another name at the same number is a new contact marked "Maybe the
  same person". The contact is made with the name, email and phone the
  guest gave, "Added when they booked a meeting".
- **Who owns a new contact: the host**, when they work on clients here (a
  salesperson or a manager with Clients) — they are the one meeting them.
  Otherwise nobody: a **lead** in *My day*, the managers told, the lead
  saying the meeting ("Booked: Project call, Tue 6 Oct, 10:00"). A known
  contact keeps its owner and what the team wrote (an empty email or phone
  is filled in); their owner is told in the bell, unless they are the host
  (Booking told them).
- **One meeting line per booking**: "Booked a meeting: Project call"
  (« A pris rendez-vous : … », each reader's language), and under it the
  time in the Chest's zone and the host ("Tue 6 Oct, 10:00 with Inès
  Moreau"). A later `confirmed` with more `moves` replaces its time and
  host ("Moved once"); a repeated one or an older move delivered late
  changes nothing. `cancelled` marks it "Meeting cancelled" (the time
  struck through) and is **final**: a `confirmed` after it — even one the
  Chest delivered late — is ignored. A cancellation that arrives before
  its confirmation brings nobody in, and the confirmation is then
  ignored. The same event twice is handled once.
- **In My day**: *Meetings booked* lists the week's meetings to come that
  the member hosts or whose contact they own — the time, the contact, the
  type, and *Open in Booking*.
- **Links back to the booking**: the type's name on the line and *Open in
  Booking* open it in Booking, made when the page is shown with
  `chest.toolLink("booking", path)` from the path the event gave (never an
  address); no link while Booking is not installed, or when the path is
  not a team page of Booking.
- **Untrusted like a form's**: only version 1; the booking id, the times
  (a meeting of at most a day, within three years), the moves, the host
  (a member id) and the path (`/chest/…`) checked; names and type names
  cleaned (control characters and direction overrides out) and bounded;
  anything else is accepted and ignored. Never the guest's note, answers
  or link: Booking does not send them.
- **Deleted stays deleted**: a contact deleted or erased in Clients is not
  brought back by a later event of the same booking; an erased host's id
  leaves the meetings they hosted. The meeting is part of the contact's
  file for their right of access (the JSON export gives its type and
  times).

In the harness, `/_dev` → *Deliver an event of another tool* (`forms.contact`
and its data as JSON) plays Forms (a new event id each time); `test/from-forms.test.ts` plays it with the SDK's
`fakeChest().deliver` (a replay by the same id included); the same form
with `booking.confirmed` or `booking.cancelled` plays Booking
(`test/from-booking.test.ts`, and the flow's last steps).

## Needs from the SDK

Built on SDK 0.4.1 + studio proposals (`0.4.1-studio.6`), the studio's
package `@argentic/chest-app` (`0.1.0-studio.6`) and UI kit
(`0.2.6-studio.1`), all in `vendor/`; tool contract 0.4 (`chest.json`).

- `member.language` and `chest.timeZone` — **SDK 0.3.0**: the interface
  and the bell in each member's language; "today", a next step's day and
  hour, "won this month" and the team report's weeks in the Chest's zone
  (`src/lib/zone.ts`; the database's sessions are in it too, and the sample
  data's days are `current_date`); a time shown to a member in their own
  zone (`member.timeZone`).
- `schedules` — **SDK 0.4** (official), `"schedules"` of `chest.json`, run on `POST /chest-schedules`
  (`morning`, weekdays 07:30): the morning reminder of the day's next steps, the tiles kept true
  overnight, the purge of removed history. On a Chest without it, the tile's
  number is set right whenever its owner opens *My day*, and removed history
  simply stays hidden.
- `events` between tools — **Proposal (studio)**, `emits` and `receives`
  (`forms.contact`, `booking.confirmed`, `booking.cancelled`) in
  `chest.proposals.json`: see "With the other tools".
- `chest.toolLink` — **Proposal (studio)** (SDK report §4.18): the address
  of the answer in Forms, from the addresses the Chest gives in
  `CHEST_TOOL_URLS`. On a Chest without it, the form is named without a
  link.
- `files` — the shipped capability (uploads from a member's browser,
  signed links): files on deals, companies and contacts.
- `calendar` — **Proposal (studio)**, `"calendar": true` in
  `chest.proposals.json` ("Adds events to the calendar of the members
  concerned"): timed next steps in their owner's calendar
  (`src/lib/step-calendar.ts`: `publishStep` after each change of a step,
  `reconcile` after bulk changes and each morning — in batches of 100
  with `calendar.putMany`, Proposal (studio.15), which answers each event
  (studio.16): only the events the Chest took are remembered as put, a
  refused one — a day more than two years ahead — is tried again at the
  next run and never holds the others back). On a Chest without it,
  the steps stand and the form stops promising the calendar
  (`tool_state`).
- **Emails are logged, not captured.** The owner decided (6 October 2026)
  that the Chest never receives mail: no BCC address, no inbound address, no reply
  threads. Clients therefore files no email by itself; *Log an email*
  records that one happened. Capturing emails would need reading the
  company's own mail through its provider (Gmail, Microsoft 365) — a
  connector the Chest does not have and the studio has not proposed.

## Mail

Clients sends **no email**, to anyone, and asks for no mail permission.
What it tells the team — a deal or a next step given to you, the morning's
due next steps, a new lead from a form or a booking, someone who left with
deals — are notifications; the Chest mails members their notifications as
each one chooses. Writing to a client is done from the person's own mail
app (an address is a `mailto:` link), then logged with *Log an email*.

## Names in each reader's language

The sample book's own fields ("Competitor", "Delivery wanted by", "Lead
source", "Segment" and its choices), industries ("Food retail") and tags
("key account") are stored as keys and read in each reader's language
("Concurrent", "Commerce alimentaire", "grand compte") until someone
renames them (Settings → Fields; a company's industry or tags edited to
other words). A form that shows them and is saved unchanged keeps the
keys (`src/lib/seed-words.ts`, `src/lib/fields.ts` `localized`). The records' own
words — deal titles, steps, notes — are the sample team's, as typed (in
English), like any company's data.

## Looks

Clients wears its own identity, **"Sales desk"** (cool slate, one electric
blue, figures in IBM Plex Mono — `src/theme.ts`, DESIGN.md), by default.
The company may choose another look in its Chest, for all its tools or for
Clients alone: any theme of the UI kit's catalogue (the store's 17
identities, "Chest", "High contrast") or **its own brand** (colours,
fonts, corners, logo — the logo then stands where the Clients mark is).
Every feature is the same in every look, and every text stays readable
(WCAG AA, light and dark): the CSS names only the kit's contract tokens.
The look is resolved on the server (`chest.theme()`, SDK proposal) and
served as a stylesheet of its own (`/chest/look.css`, cached by its hash: no inline style anywhere); outside a Chest that
serves themes, it is Sales desk. Screens: `docs/screens/board-chest-*`
(the portal's look), `board-theme-*` and `day-theme-*` (Library,
Workshop), `board-brand-*` and `team-brand-*` (a sample brand).

## How it is made

The studio's stack (`@argentic/chest-app`, `app/AGENTS.md` of the studio):
Hono serves React pages rendered on the server; the parts that act in the
browser are islands (`src/islands/`, made of `src/components/`), each
given only the words it shows; every change is an action
(`src/actions.ts`) called by `call()`, the page then refreshed in place
(focus, scroll and what is typed kept). Vite builds the browser's script
and the server. No inline script or style: the policy is
`default-src 'self'`; bars are SVG, the board's drag sets its transform
through the element itself. Built: about 455 KB of script (135 KB
gzipped) for the browser, one server file.

| Where | What |
|---|---|
| `src/app.tsx` | Every route: pages, downloads, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | Every change, by name, with its fields |
| `src/pages/` | The pages (server); `words.ts` picks each island's words |
| `src/islands/`, `src/components/` | What runs in the browser |
| `src/lib/` | Rules and SQL (services take the connection first) |
| `src/shared/` | Rules the browser and the server share (amounts, CSV, vCard, import mapping) |
| `src/i18n/` | Every word (`en.ts` source, `fr.ts`), `format.ts` the kept `Intl` objects |
| `migrations/` | The schema; `0008_page_version_off.sql` drops the former page-version counter and adds `settings`; `0009_chest_changes.sql` the package's change log, which the pages' versions read |

## Develop

```sh
npm ci
npm test          # tsc, the server built into dist/test, node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then Vite: the browser's files and the server, as the Chest does
npm start         # the built server (dist/server/main.js) on PORT
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/crm --reset --port 4800`
(the sample client book of `seed/sample.sql`),
`node lab/chest-dev/flows/crm.mjs 4800` (the browser flows),
`node lab/chest-dev/screens.mjs tools/private/crm --port 4800`.

## What it does not do (yet)

- **Emails are not captured** (no BCC, no Gmail/Outlook sync, no sending
  from the contact page): the Chest receives no mail (above); a contact's
  address opens the person's own mail app.
- Only timed steps reach the calendar, one way: moving the event in
  Google or Outlook does not move the step (a feed is read-only).
- The "Log this call?" prompt knows a tap on *Call*, not the call itself
  (nor whether it was answered); on a desktop the tap opens whatever app
  handles phone links.
- One pipeline; no products or line items (quotes live in *Quotes*); new
  and imported deals take the company's currency; deals are not converted
  (the board totals each currency apart; Home and Team still add amounts
  of different currencies together).
- Fields: four kinds (text, number, date, one choice) — no multi-choice,
  no formula, no required field; 30 per kind of record. Search (`/`) does
  not look inside them (the list filter does).
- Reports: the *Team* page's fixed views (pipeline by person, what each
  person logged week by week, stage-to-stage conversion of the last 12
  months, won/lost by month, closing months, lost reasons) — no report
  builder, no date range of one's own, no activity goals.
- Form leads: a form answer makes a contact, never a deal (a later
  version of `forms.contact` could carry a "deal" hint); a lead has no
  automatic round-robin owner. The "same person?" rule compares whole
  names: "P. Durand" and "Paul Durand" at one number make two contacts,
  marked, for a person to merge. The check lists old lines it cannot
  judge; it cannot know which were right.
- *Use this address*: a different email a form gave is shown on the line
  and in the check, not offered as a one-click replacement (edit the
  contact).
- Bulk actions: up to 500 at once; deals may only be given to someone in
  bulk (not moved or deleted).
- Undoing an import takes back what it added, for 24 hours; the empty
  details it filled into records already here stay.
- History import links rows by a deal's title, a contact's email or name,
  or a company's name — a row matching none is refused (and said); an
  activity by someone not in the team keeps their name as text.
- No audit trail of who deleted a company or a deal.
- No automatic purge of old prospects (the list and the warning help).
- The HubSpot and Pipedrive header lists and test files follow their
  export formats as described in their help pages (THIRD_PARTY.md); they
  were not checked against a live export file — unknown columns are kept
  in the notes and can be mapped by hand on the import page.
