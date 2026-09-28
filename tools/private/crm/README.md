# Clients — companies, contacts and deals, and never forget to call back

A small team's shared client book, inside its Chest: the companies it sells
to, the people there, the deals it hopes to win moving through a pipeline,
what happened with each (calls, meetings, emails, notes) and — the heart of
it — **the next step** on every deal and contact, so nobody forgets to call
back. Replaces HubSpot CRM, Pipedrive, Axonaut/Sellsy CRM and folk for a team
that needs the 80 % they use every day. Research:
`reports/02-open-source/crm.md` of the studio.

## What it does

- **My day** (home): my late and today's next steps first, then the next
  seven days; one tap *Done* logs it in the history and asks *What's next?*
  in its place (with Undo). Beside it: my open deals by stage (count, value,
  weighted value) and what was won this month.
- **Deals**: a board by stage — drag a deal to its next stage with the
  mouse, a finger (long press) or the keyboard (Space, arrows, Space); each
  column shows its count, its total and its probability. Won and Lost are
  the two end stages: dropping a deal there asks why, in a few words (one
  tap on a usual reason). Closed deals stay on the board 30 days. A list
  view filters by owner, stage, open/won/lost and "closing this month", and
  exports what it shows. Each deal has a page: its stage path (one click
  moves it), Won/Lost, its owner, its next step, a one-tap log and its
  history.
- **Companies** and **contacts**: lists with search, owner and tag filters,
  and "no contact for 3 years" (see GDPR below); one page each with how to
  reach them (tap to call or write), their people and deals, the next step
  (contacts), the log and the history — a company's history gathers what was
  logged on its deals and people too.
- **Log in one tap**: Call, Meeting, Email, Note are four buttons; a call,
  a meeting or an email needs no words. The author edits their words;
  the author or a manager removes them (Undo for a day).
- **Search** everything from one box — `/` anywhere focuses it: names,
  emails, phones, websites; accents and case aside; close spellings found
  ("Lefebvre" finds "Lefèvre"). Postgres full-text (`unaccent`) and trigram
  similarity.
- **Duplicates**: while typing a new company or contact, what looks like it
  (a close name, the same email, the same web domain) is shown with a link;
  a warning, never a refusal.
- **Import**: a CSV of contacts, companies or deals, with a column-mapping
  step (guessed from HubSpot's and Pipedrive's export headers and French
  spreadsheets) and a preview; companies and contacts already here are
  linked, not doubled; each refused row is named with its reason. vCard
  (3.0, 4.0, 2.1 quoted-printable) import of an address book.
- **Export**: each list as CSV (headers in the reader's language, formulas
  neutralised), contacts as vCard 4.0 (one or all), one person's whole file
  as JSON.
- **The bell**: when someone gives you a deal or a next step; every weekday
  morning (proposal *schedules*) one item with your due next steps; the
  tile's number is your late + today's next steps.
- **Stages** (managers): rename (the default ones speak each reader's
  language until renamed), set each stage's chance to win, reorder, add,
  remove an empty one.

## Roles

| Role | May |
|---|---|
| `manager` | Everything: every deal, give anything to anyone, the stages, delete any company or contact, import |
| `sales` | Add and edit companies and contacts, log on anything, add deals; change the deals they own (or that nobody owns — they may take them); give things to colleagues; delete the companies and contacts they own; import |
| `viewer` | Read everything and export |

Enforced on the server in `lib/access.ts`; tested in `test/access.test.ts`
and every service test.

## First minute

- **What does a new user see first?** *My day*: a greeting, what they
  promised to do today (late in red, today in amber), their pipeline in
  numbers. On an empty tool: "Your client book starts here" with *Add a
  company* and *Import a file*.
- **What is the first thing they do?** Tick a next step *Done* — the tool
  logs it and asks what comes next — or add a deal (*New deal*, top right).
- **How many clicks for the main job?** Log a call: 1 tap on the contact's
  or deal's page. Plan the next step: 3 (Plan → type → *Plan it*, "Tomorrow"
  preselected). Move a deal: one drag, or one click on its stage path.
- **What happens after a mistake?** Every log, every *Done* has an Undo;
  a deal moved by mistake moves back; a deal "Won" by mistake is reopened.
  Only deleting a company, a deal or a person asks first — deleting a person
  is for good, on purpose (GDPR).

## Routes

| Route | What |
|---|---|
| `/chest` | My day |
| `/chest/deals`, `?view=list&owner=&stage=&status=&closing=month` | Board, list |
| `/chest/deals/[id]` | A deal |
| `/chest/companies`, `/chest/companies/[id]` | Companies |
| `/chest/contacts`, `/chest/contacts/[id]` | Contacts |
| `/chest/contacts/[id]/vcard`, `/chest/contacts/[id]/data` | One vCard; one person's data (JSON) |
| `/chest/export/{companies,contacts,deals,vcf}` | Lists as files, with the page's filters |
| `/chest/search?q=` | Search |
| `/chest/import`, `/chest/settings` | Import; stages (managers) |
| `/chest-events` | The Chest's lifecycle events (signed) |
| `/chest-jobs/morning` | The weekday morning (proposal *schedules*, signed) |
| `/` | The public host: says where the tool lives |

## On a Chest

- `capabilities`: `database`, `members` (names, photos, who may own
  things), `notifications` (the bell and the tile's number);
  `receives: ["member.*"]`. No files, no network.
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

Contacts are personal data of people outside the company.

- **Right of access**: *Export their data* on a contact's page gives
  everything the tool holds about that person (record, deals, what was
  logged about them, next steps) as JSON.
- **Right to be forgotten**: *Delete this person* (a manager or the
  contact's owner) deletes the contact, **every activity that names them —
  with what was written in it** — and their next steps; their deals stay,
  without them. It cannot be undone, on purpose. A deal title a person
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

**Quotes** starts a quote from `crm.deal.won`. Clients keeps a company's
address as one text and holds no postcode, city, country, SIREN, VAT number
or company email: those are sent as `null`, never guessed. Publishing is a
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
- Wished, not built (the tool works without them): **mail** in and out (log
  emails by BCC, send from a contact), **files** on a deal (the capability exists;
  not used yet).

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

Merge duplicates (it warns), custom fields, several pipelines, products
and line items, quotes (the *Quotes* tool), email sync and sending,
attachments, dashboards beyond *My day*, currencies other than EUR,
automatic purge of old prospects. The HubSpot and Pipedrive header lists
come from their export formats as documented in the research and our
knowledge of them; they were not checked against a live export file —
unknown columns are simply mapped by hand on the import page.
