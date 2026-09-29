# Equipment — who has which laptop, phone, licence or key

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Snipe-IT, Asset Panda and
the "inventaire matériel.xlsx" spreadsheet** for a company of 10 to 200
people. French name: **Matériel**.

## What it does

- **Items**: category (laptop, phone, screen, accessory, licence and
  subscription, key and badge, vehicle, supplies, other — renamed,
  re-iconed or added by a manager), name or model, serial number, **asset tag** (`EQ-0042`,
  given automatically, unique, or your own), purchase date and price (in the
  Chest's currency), supplier, warranty end, notes, a photo (the Chest's
  files), a status: *in stock, in use, in repair, lost, retired*.
- **Fields per category**: a manager gives a category its own fields —
  an IMEI for phones, RAM and OS for laptops, a licence plate and the next
  inspection for vehicles, an MDM ID — as text, a number or a date. They
  show on the item, are searched, printed on the handover sheet, exported
  (one column each) and imported. The fields the tool proposes (IMEI, RAM,
  operating system, licence plate, next inspection) are written in each
  reader's language ("Mémoire vive (Go)") until a manager renames them; a
  French file's "Système d'exploitation" column goes into the same field.
- **Several at once**: "How many? 10" on the form, the serial numbers
  pasted one per line from the delivery note; each item gets its own tag
  (the next numbers, or a series from the tag typed: `LAP-009`,
  `LAP-010`…), with *Print their labels* right after. *Add and give to
  someone* opens the item with the give dialog.
- **Licences and subscriptions**: seats, renewal date, cost per month or
  year, who has a seat — never more seats given than bought.
- **Supplies counted in bulk** (cables, chargers, toner, visitor badges): a
  quantity and a minimum; *Hand out* ×N (to a person, a place or nobody in
  particular — used up, not lent) and *Add stock*; at the minimum or under,
  every manager hears it once in the bell and the overview shows *Running
  low*; restocked, the word goes.
- **"I received it"**: something given to a person waits in their *My
  equipment* as *To confirm* (their tile counts it). They confirm it — with
  a note if something is off ("scratch on the lid", which the managers
  hear) and, if a manager wrote **rules for company equipment**, having
  read that exact version. Who, when, the note and the rules accepted are
  kept (receipt and history). Receipts not confirmed after a week show on
  the managers' overview, each with **Remind them**: the person hears it
  again in the bell and — where the Chest sends email (the `mail`
  proposal) — by email, in their language; once a day at most ("Reminded
  today"), never an Undo (it has left). "You confirmed receiving it on …"
  shows under an item for a month, then goes (not under every item
  imported years ago).
- **The rules for company equipment**: optional, written by a manager;
  empty, *Start with an example* fills them with the tool's example, which
  each person then reads in their own language (until a manager rewords
  it: then the manager's words, a new version).
- **Handover sheet and return sheet** (printable A4, or "Save as PDF" from
  the print window): the company, the person, each item with its tag,
  serial number and fields (IMEI…), when and by whom it was given, its
  condition, whether and when the person confirmed it in the tool, the
  rules, a statement and two signature boxes — the *fiche de remise de
  matériel* a French company keeps. A sheet is kept as proof: the person
  is written by their name alone (never the app's "(former member)"), with
  "Left on …" on a line of its own; "Printed on" and the date are a term
  and its value (read as such by screen readers). The return sheet lists what came back
  in the last 90 days (day, to whom, condition) and what is *not returned*
  on the day it is printed. A member prints their own handover sheet.
- **Requests**: *Ask for something* on My equipment (a few words, the kind
  of thing if known). The managers hear it and find it on the overview:
  *Give…* something from the stock (an item, a seat, one of the supplies —
  the request is done), *Approve* (to buy; it stays listed until given), or
  *Refuse* with a reason. The person hears each answer and may cancel while
  it waits.
- **Inventory** (Snipe-IT's audit): start one, walk the office; a barcode
  scanner types each tag (or the label's link) into the box, a phone's
  camera opens a label whose page has a *Seen* button, or tick the list.
  Closed (with Undo), what was not seen is listed as missing, kept, and
  printable; each item shows when it was last seen, or that the last
  inventory missed it.
- **Repairs**: going to repair, the repairer's ticket and the day expected
  back (the overview says when it is late); coming back, what it cost; the
  item's details add up its repairs.
- **The purchase invoice** (PDF or picture, the Chest's files) on each
  item, for managers only.
- **Give and take back**: to a member or to a place ("Meeting room Atlas"),
  on a day, with a condition note; take back with its condition (or straight
  to repair); a transfer from one person to another in one step. **The
  history of each item is append-only** (the database refuses to change or
  delete it). The person is told in the Chest's bell, in their language:
  *"Sofia gave you MacBook Pro 16″ M4 EQ-0042"*.
- **My equipment** (a member's home): what I hold and since when; *Report a
  problem* sends a few words to every equipment manager's bell and into the
  item's history; the managers mark it *Solved*.
- **A person's page** (managers): everything they hold — the checklist of
  the day they leave — with *Take back* per line and **Take everything
  back** in one go (with *Undo*); *Give something* from the stock.
- **The list**: search by tag, serial number, model, supplier, place, a
  field's value (an IMEI) or the holder's name; filters by category, status
  (and *Running low*) and holder (people and places); sort by tag, name,
  newest, warranty/renewal; 100 a page. A tag typed exactly (what a
  barcode scanner types) opens the item. Stock counts per category on the
  overview.
- **QR labels**: an A4 sheet of 3 × 7 labels (63.5 × 38.1 mm, the common
  sticker sheets), printed from the browser, each with the company's name,
  the tag, the item's name and a QR code of the item's page. The QR codes
  are drawn by the tool's own encoder (`lib/qr.ts`), no network.
- **Ending soon**: warranties and renewals within 60 days (or ended this
  month) on the overview; every Monday morning the managers find the same
  list in their bell (the *schedules* proposal — the overview works without
  it).
- **Import** from Snipe-IT (its *Custom Asset Report*, its assets list's
  export, or the file one imports into it — tested with files of Snipe-IT's
  own columns, `test/fixtures/`) and from any spreadsheet saved as CSV
  (columns found by their English or French names, `,` or `;`, day-first or
  US dates, prices as people write them, warranty in months, a quantity
  and minimum for supplies), with a preview before anything is added;
  people matched by name, e-mail or username; Snipe-IT's "checked out to a
  location" becomes a place. Other columns — Snipe-IT's custom fields —
  are offered as fields, kept by default (untick one to leave it out).
  Importing the same file twice adds nothing. **Export** CSV in the
  reader's language, with a column per field — and it imports back.

## With the other tools

**People → Equipment** (Proposal (studio): events between tools, once an
admin linked the two; `chest.proposals.json` `receives`):

- `people.leaving` `{member, lastDay}` — HR started a leaving checklist in
  People. If the person holds something, every equipment manager hears it
  **once** in the bell, in their language: *"Marc Lefort leaves on 12 Oct
  — 3 items to take back"*, linking to their page. The overview shows them
  under **To take back** (soonest first, with what they hold and their last
  day), their page says *"Last day: Monday 12 October. Take everything back
  before then."*, and the People list adds their last day. Nothing is taken
  back by itself.
- `people.leaving_cancelled` `{member}` — the departure was stopped in
  People: the bell item is withdrawn and the list forgets them. Told again
  later, it comes back.
- **Both paths stay coherent**: when everything is back, the notice goes.
  When the person then leaves the Chest (`member.removed`,
  `access.revoked`), the departure is forgotten and its notice withdrawn;
  *"Léa left and holds 3 items"* and *Held by people who left* take over,
  as before. An erasure forgets it too.
- Every field is checked; an event of another shape, from another tool, or
  about someone who is not a member is ignored. Events come at least once
  and not always in order: each departure keeps when People said so, and
  an older word delivered late changes nothing (a cancelled departure keeps
  only that time, for a week). A departure is forgotten 30 days after the
  last day (weekly run and overview).

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `manager` | Equipment manager | everything: items, give and take back, supplies, labels, import, export, categories and fields, rules, people's pages and sheets, problems, requests, inventories, invoices |
| `member` | Member | their own equipment: confirm receiving it, report a problem, ask for something, print their handover sheet; browse the catalogue read-only, without prices, suppliers, notes, fields, invoices or history |
| (none) | — | sees "You can't use this tool yet" |

Why members may browse: "who has the projector?" and "whose badge is this?"
are everyday questions in a small company, and a scanned label must say
something to whoever scans it. Money, suppliers, notes and history stay
with managers. The owner, the admins and the tool's builders come in with
the first role, `manager`.

## First minute

- **What a new user sees:** a manager, the *Overview* — stock per category
  and "Needs your attention" (requests, problems, supplies running low,
  warranties ending, repairs, people leaving soon and people who left with
  equipment, receipts not confirmed); on an empty tool, "Every laptop, phone and key,
  in one place" with *Add your first item* and *Import a spreadsheet*. A
  member, *My equipment*, what waits for their "I received it" first.
- **The first thing they do:** *Add equipment* → pick the kind → type the
  model → *Add it*; on the item's page, *Give to someone* → type two letters
  of a name → *Give it*.
- **Clicks for the main job:** giving an item to Inès is 3 clicks and two
  letters from its page; taking it back, 2; everything a leaver holds, 1;
  confirming receipt, 2 for the employee; answering a request from the
  overview, 2.
- **A mistake:** a take-back, a "take everything back", a delete, a removed
  category, a removed field, an inventory tick and a closed inventory each
  offer *Undo*; a wrong holder is fixed with *Give to someone else* (the
  history keeps both). A refused action says why in plain words.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | managers / members | Overview / My equipment |
| `/chest/mine` | everyone with a role | My equipment (receipts, requests) |
| `/chest/items` (`?q=&category=&status=&holder=&sort=`) | everyone with a role | the list |
| `/chest/items/new`, `/chest/items/<id>/edit` | managers | the form |
| `/chest/items/<id>` | everyone with a role | full page (managers) or short view (members) |
| `/chest/items/<id>/photo` | GET: who sees the item; POST/PUT/DELETE: managers | the photo (a signed link; upload grant and record) |
| `/chest/people`, `/chest/people/<id or erased>` | managers | who holds what; a person's equipment |
| `/chest/people/<id>/handover` (`?items=`) | managers, and the person themself | the printable handover sheet |
| `/chest/people/<id>/return` | managers | the printable return sheet |
| `/chest/inventory`, `/chest/inventory/<id>` | managers | the inventory under way (or start one); a closed one's missing items |
| `/chest/items/<id>/invoice` | managers | the purchase invoice (a signed link; upload grant and record) |
| `/chest/labels` (`?ids=` or the list's filters) | managers | printable A4 sheets |
| `/chest/import`, `/chest/export` | managers | CSV in and out |
| `/chest/settings` | managers | categories, their fields, the rules for company equipment |

Every managers' page asked by a member answers **403** with the kit's
*NoAccess* — "This page is for managers", and a link to My equipment —
the same on each (`test/refusals.test.ts`, the browser flow); something a
member may not see at all (someone else's item or sheet) is "not found".
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-jobs/weekly` | the Chest only (signed, proposal) | Monday's word to managers |
| `/` | anyone | "This tool lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `files` (photos and invoices, 10 MB each,
  browser → Chest uploads); `members` (names, photos, the people pickers, matching an
  import); `notifications` (the bell; managers' tile = open problems);
  `receives: ["member.*"]`.
- **Someone leaves** (or loses access): **nothing is given back by itself**
  — the laptop is still in their bag. Each item notes it in its history, and
  every manager is told once: *"Léa Dubois left and holds 3 items"*, linking
  to her page with *Take everything back*; that bell item goes when all is
  back. Their name reads "Léa Dubois (former member)".
- **An erasure**: their id is replaced by `erased` everywhere (holder, seats,
  history, problems); what they held stays held by "Former member" until a
  manager takes it back (`/chest/people/erased`). Then the erasure is
  acknowledged.
- An import sends no bell (it would be one per row), and makes no
  receipt: what was held before can still be confirmed from My equipment
  (a quiet *I received it*).
- Someone who leaves: their waiting requests are cancelled; their receipts
  stay (the sheet is the proof). An erasure keeps receipts, requests and
  inventory ticks with `erased` in place of the person.
- Licence keys are not stored: they are secrets (see "does not do").

## Needs from the SDK

All in `vendor/` (the studio's working copy, `0.3.0-studio.12`):

- `member.locale` — the interface and the bell in each member's language.
- `schedules` — the Monday "ending soon" word (`chest.proposals.json`,
  `app/chest-jobs/[name]/route.ts`). Without it, the overview shows the same
  list at any time.
- `chest` — `today()` and `timeZone()` for "ends within 60 days",
  `currency()` for prices, `company()` on the labels, `teamUrl()` for the QR
  codes' links (without it, the host the request came to).
- `translations` in `chest.proposals.json` — the tile's French title.
- **Events between tools** — receives `people.leaving`,
  `people.leaving_cancelled` (see "With the other tools"). Without it,
  departures are seen only when the person leaves the Chest.

- `files` — besides photos, each item's purchase invoice (PDF or picture).
- `mail` (**Proposal (studio)**, `chest.proposals.json`) — *Remind them*
  also emails the holder, through the Chest, to their address the tool
  never knows. On a Chest without mail the bell alone reminds them, and
  nothing fails (`lib/tell.ts`, `remindReceipt`).

Not in the SDK, and not faked here: a **signature** a person draws or a
qualified electronic signature (the receipt is a confirmation in the
tool; the sheets are signed on paper), and the person's **job title and
department** on the handover sheet (`members` gives names only).

## Looks

Equipment wears its own identity, **Tool crib** (steel shelves, utility
orange tags, printed labels: `lib/theme.ts`, DESIGN.md) — or any look the
company chooses in its Chest, for all its tools or for this one: a theme
of the store's catalogue (the seventeen tools' identities, "Chest", "High
contrast") or **the company's own brand** (its colours, fonts, corners and
logo, derived with every text kept readable). Same features in every look;
in brand mode the company's logo stands beside "Equipment" in the header
and on the public page. The look is resolved on the server
(`chest.theme()`, UI kit `@argentic/chest-ui`), with no script and no
switch in the tool. **What is printed stays black on white in every look**:
the handover and return sheets and the QR labels use the paper's own
colours (the system's `Canvas` / `CanvasText`), on screen too, where they
are previews of the paper; the fonts follow the look.

The screens are the store's shared components (UI kit): the header with
labelled tabs (a row of their own on a phone), toasts whose Undo tells the
truth, dialogs that never lose what was typed, the people picker, date
fields in the reader's language, filter chips, the file picker of the
importer, empty states.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/equipment --reset
--prod --port 5400` (build first; sample equipment from `seed/sample.sql`),
`node lab/chest-dev/flows/equipment.mjs 5400` (the browser flows),
`node lab/chest-dev/screens.mjs tools/private/equipment --port 5400`,
`node lab/chest-dev/audit.mjs tools/private/equipment --port 5400`.

## What it does not do (yet)

A drawn signature on screen: the receipt is a confirmation in the tool
(who, when, the rules accepted), and the sheets are signed on paper — it
is not an electronic signature in the eIDAS sense. The sheets are HTML
printed by the browser ("Save as PDF"), not a PDF the tool files by
itself. Scanning with the camera inside the tool (a phone's own camera
opens the label's link, whose page has *Seen*); a photo on the add form
(it is one click away on the item's page, right after); fields of other
types than text, number and date (a list to pick from); bookable shared
equipment (see Rooms); kits; licence keys (secrets); depreciation and the
fixed-asset register (the accountant's job — the invoice is attached);
adding "return the laptop" steps to People's leaving checklist (it would
need a request between tools, not an event); network discovery or MDM
agents; a bell to the holder when their warranty ends; photos in the
export (a ZIP). The return sheet looks back 90 days.
