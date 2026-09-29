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
  Beside it: my open deals by stage (value, count, weighted value) and what
  was won this month. A **viewer** (who owns no steps) sees instead the
  team's open pipeline by stage and the latest wins.
- **Deals**: a board by stage — drag a deal to its next stage with the
  mouse, a finger (long press) or the keyboard (Space, arrows, Space); each
  column shows its count, its total and its probability. Won and Lost are
  the two end stages: dropping a deal there asks why, in a few words (one
  tap on a usual reason). Closed deals stay on the board 30 days; a legend
  says what the cards' dots mean. A list view (200 a page) filters by owner,
  stage, open/won/lost, "closing this month" and one of the team's own
  fields, gives ticked deals to someone at once, and exports what it shows.
  Each deal has a page: its stage path (one click moves it; a list on a
  phone), Won/Lost (Won stands out only at the last open stage), its owner,
  its next steps, a one-tap log, its files and its history.
- **Companies** and **contacts**: lists 100 a page, sorted by name, last
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
- **Merge duplicates**: *… → Merge with a duplicate* on a company or a
  contact: the one kept gains the other's deals, people, history, next
  steps, files and any detail it lacked; the other is deleted (asks once).
- **Files** on a deal, a company or a contact (a signed quote, a
  specification), sent by the browser straight to the Chest's files, 25 MB
  each, 30 per record; removed by who added them or a manager.
- **Team** (everyone who reads): open deals by person (value, weighted, deals
  without a next step, late steps), won and lost per person month by month
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
  team's fields as columns, formulas neutralised), contacts as vCard 4.0
  (one or all), one person's whole file as JSON; and, for a manager, the
  **whole client book** as one ZIP of CSV files (companies, contacts,
  deals, activities, next steps, fields) with stable English column names
  and ids.
- **The bell**: when someone gives you a deal or a next step; every weekday
  morning (proposal *schedules*) one item with your due next steps; the
  tile's number is your late + today's next steps.
- **Stages** (managers): rename (the default ones speak each reader's
  language until renamed), set each stage's chance to win, reorder, add,
  remove an empty one.

## Roles

| Role | May |
|---|---|
| `manager` | Everything: every deal, give anything to anyone, the stages and the team's own fields, delete or merge any company or contact, import (and create fields from a file), undo anyone's import, export the whole book |
| `sales` | Add and edit companies and contacts, log on anything and add files, add deals; change the deals they own (or that nobody owns — they may take them); give things to colleagues; delete or merge the companies and contacts they own; import and undo their own imports for a day |
| `viewer` | Read everything (their home is the team's pipeline) and export lists |

Enforced on the server in `lib/access.ts`; tested in `test/access.test.ts`
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
| `/chest-events` | The Chest's lifecycle events (signed) |
| `/chest-jobs/morning` | The weekday morning (proposal *schedules*, signed) |
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
- No WebSocket: an open page re-reads itself every 30–60 s while visible.
- Money is whole cents (`bigint`), EUR, formatted with `Intl`.

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
`"emits"`), once an admin of the Chest linked Clients to another tool:

| Event | When | Data |
|---|---|---|
| `crm.deal.won` | A deal enters Won (board drop or the Won button, after the reason) | `{ deal, title, amount` (integer cents) `, currency: "EUR", company: { ref, name, address, postcode, city, country, siren, vat, email } \| null, contact: { name, email } \| null, owner }` — key `crm:<deal>:won:<time>` |
| `crm.deal.reopened` | A won deal leaves Won (reopened, or moved to another stage) | `{ deal }` |

**Quotes** starts a quote from `crm.deal.won`. Clients sends the company's
street, postcode, city, country (an ISO code; a country written in a file
that is not recognised is kept on the record but sent as `null`), SIREN
(the 9 digits of a SIREN or SIRET), VAT number and email; what is blank is
sent as `null`, never guessed. Publishing is a
courtesy (`lib/share.ts`): when the Chest cannot take the event, the deal's
move still stands. Deals imported already won are not told.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: the interface and
  the bell in each member's language.
- `schedules` — **Proposal (studio)**, declared in `chest.proposals.json`
  (`morning`, weekdays 07:30): the morning digest, the tiles kept true
  overnight, the purge of removed history. On a Chest without it, the tile's
  number is set right whenever its owner opens *My day*, and removed history
  simply stays hidden.
- `events` between tools — **Proposal (studio)**, `emits` in
  `chest.proposals.json`: see "With the other tools".
- `files` — the shipped capability (uploads from a member's browser,
  signed links): files on deals, companies and contacts.
- **Needed, not built: received mail for the tool** — to log emails by
  themselves (a BCC address, `clients@<company domain>`, files each email on
  the contact whose address it carries; "send from the contact page"). The
  studio's *mail* proposal gives most of the shape (`mailboxes`,
  `mail.handle`, `members.email`); Clients will use it once it ships, and
  also needs to tell the team's own addresses from clients' (the sender of
  a BCC is the salesperson) — see the SDK report. Until then **emails are
  not captured**: *Log an email* records that one happened.

## Looks

Clients wears its own identity, **"Sales desk"** (cool slate, one electric
blue, figures in IBM Plex Mono — `lib/theme.ts`, DESIGN.md), by default.
The company may choose another look in its Chest, for all its tools or for
Clients alone: any theme of the UI kit's catalogue (the store's 17
identities, "Chest", "High contrast") or **its own brand** (colours,
fonts, corners, logo — the logo then stands where the Clients mark is).
Every feature is the same in every look, and every text stays readable
(WCAG AA, light and dark): the CSS names only the kit's contract tokens.
The look is resolved on the server (`chest.theme()`, SDK proposal) and
written as one `<style>` with the page's nonce; outside a Chest that
serves themes, it is Sales desk. Screens: `docs/screens/board-chest-*`
(the portal's look), `board-theme-*` and `day-theme-*` (Library,
Workshop), `board-brand-*` and `team-brand-*` (a sample brand).

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/crm --reset --port 4800`
(the sample client book of `seed/sample.sql`),
`node lab/chest-dev/flows/crm.mjs 4800` (the browser flows),
`node lab/chest-dev/screens.mjs tools/private/crm --port 4800`.

## What it does not do (yet)

- **Emails are not captured** (no BCC, no Gmail/Outlook sync, no sending
  from the contact page): it needs received mail from the Chest (above).
- One pipeline; no products or line items (quotes live in *Quotes*); EUR
  only.
- Fields: four kinds (text, number, date, one choice) — no multi-choice,
  no formula, no required field; 30 per kind of record. Search (`/`) does
  not look inside them (the list filter does).
- Reports: the *Team* page's fixed views — no report builder, no stage
  conversion funnel.
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
