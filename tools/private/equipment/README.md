# Equipment — who has which laptop, phone, licence or key

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Snipe-IT, Asset Panda and
the "inventaire matériel.xlsx" spreadsheet** for a company of 10 to 200
people. French name: **Matériel**.

## What it does

- **Items**: category (laptop, phone, screen, accessory, licence and
  subscription, key and badge, vehicle, other — renamed, re-iconed or added
  by a manager), name or model, serial number, **asset tag** (`EQ-0042`,
  given automatically, unique, or your own), purchase date and price (in the
  Chest's currency), supplier, warranty end, notes, a photo (the Chest's
  files), a status: *in stock, in use, in repair, lost, retired*.
- **Licences and subscriptions**: seats, renewal date, cost per month or
  year, who has a seat — never more seats given than bought.
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
- **The list**: search by tag, serial number, model, supplier, place or the
  holder's name; filters by category, status and holder (people and places);
  sort by tag, name, newest, warranty/renewal. A tag typed exactly (what a
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
- **Import** from Snipe-IT's CSV and from any spreadsheet saved as CSV
  (columns found by their English or French names, `,` or `;`, day-first or
  US dates, prices as people write them, warranty in months), with a
  preview before anything is added; people matched by name. Importing the
  same file twice adds nothing. **Export** CSV in the reader's language —
  and it imports back.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `manager` | Equipment manager | everything: items, give and take back, labels, import, export, categories, people's pages, problems |
| `member` | Member | their own equipment, report a problem on it; browse the catalogue read-only, without prices, suppliers, notes or history |
| (none) | — | sees "You can't use this tool yet" |

Why members may browse: "who has the projector?" and "whose badge is this?"
are everyday questions in a small company, and a scanned label must say
something to whoever scans it. Money, suppliers, notes and history stay
with managers. The owner, the admins and the tool's builders come in with
the first role, `manager`.

## First minute

- **What a new user sees:** a manager, the *Overview* — stock per category
  and "Needs your attention" (problems, warranties ending, repairs, people
  who left with equipment); on an empty tool, "Every laptop, phone and key,
  in one place" with *Add your first item* and *Import a spreadsheet*. A
  member, *My equipment*.
- **The first thing they do:** *Add equipment* → pick the kind → type the
  model → *Add it*; on the item's page, *Give to someone* → type two letters
  of a name → *Give it*.
- **Clicks for the main job:** giving an item to Inès is 3 clicks and two
  letters from its page; taking it back, 2; everything a leaver holds, 1.
- **A mistake:** a take-back, a "take everything back", a delete, a removed
  category each offer *Undo*; a wrong holder is fixed with *Give to someone
  else* (the history keeps both). A refused action says why in plain words.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | managers / members | Overview / My equipment |
| `/chest/mine` | everyone with a role | My equipment |
| `/chest/items` (`?q=&category=&status=&holder=&sort=`) | everyone with a role | the list |
| `/chest/items/new`, `/chest/items/<id>/edit` | managers | the form |
| `/chest/items/<id>` | everyone with a role | full page (managers) or short view (members) |
| `/chest/items/<id>/photo` | GET: who sees the item; POST/PUT/DELETE: managers | the photo (a signed link; upload grant and record) |
| `/chest/people`, `/chest/people/<id or erased>` | managers | who holds what; a person's equipment |
| `/chest/labels` (`?ids=` or the list's filters) | managers | printable A4 sheets |
| `/chest/import`, `/chest/export` | managers | CSV in and out |
| `/chest/settings` | managers | categories |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-jobs/weekly` | the Chest only (signed, proposal) | Monday's word to managers |
| `/` | anyone | "This tool lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `files` (photos, 10 MB, browser → Chest
  uploads); `members` (names, photos, the people pickers, matching an
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
- An import sends no bell (it would be one per row).
- Licence keys are not stored: they are secrets (see "does not do").

## Needs from the SDK

All in `vendor/` (the studio's working copy):

- `member.locale` — the interface and the bell in each member's language.
- `schedules` — the Monday "ending soon" word (`chest.proposals.json`,
  `app/chest-jobs/[name]/route.ts`). Without it, the overview shows the same
  list at any time.
- `chest` — `today()` and `timeZone()` for "ends within 60 days",
  `currency()` for prices, `company()` on the labels, `teamUrl()` for the QR
  codes' links (without it, the host the request came to).
- `translations` in `chest.proposals.json` — the tile's French title.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/equipment --reset
--port 5400` (sample equipment from `seed/sample.sql`),
`node lab/chest-dev/flows/equipment.mjs 5400` (the browser flows),
`node lab/chest-dev/screens.mjs tools/private/equipment --port 5400`,
`node lab/chest-dev/audit.mjs tools/private/equipment --port 5400`.

## What it does not do (yet)

Acceptance of a handover by the employee ("I received it") and a printable
handover sheet; scanning with the camera inside the tool (a phone's own
camera opens the label's link); bookable shared equipment (see Rooms);
kits; custom fields; consumables with quantities; licence keys (secrets);
depreciation and the fixed-asset register (the accountant's job); network
discovery or MDM agents; a bell to the holder when their warranty ends.
