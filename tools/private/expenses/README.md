# Expenses — snap a receipt, get paid back

*French interface name: **Notes de frais**.* A Chest store tool (private
part only) that replaces N2F, Expensify, Lucca Cleemy (Notes de frais), the
expense part of Spendesk, and the spreadsheet-plus-shoebox of receipts.

## What it does

- **Add an expense in seconds, phone first.** Take a photo of the receipt
  (the phone's camera opens) or pick a photo or PDF; while it goes to the
  Chest's files, type the amount (EUR by default, any ISO currency), pick
  the category, where, the date, and whether you paid with **your own money**
  (to be paid back) or the **company card** (nothing to pay back, the
  receipt is still needed). VAT is optional, with one-tap French rates
  (20 %, 10 %, 5.5 %, 2.1 %) that compute it from the amount; a note.
- **Car trips (mileage).** From, to, distance (a *return trip* box doubles
  it), date. The amount comes from the French mileage scale (*barème
  kilométrique*) for the vehicle chosen once in *Settings → My vehicle*
  (car, motorbike or moped; fiscal horsepower; 100 % electric +20 %), and is
  shown live while typing. The scale is by the **year's total distance**:
  a trip is worth what it adds to the year's allowance
  (`allowance(before + trip) − allowance(before)`), so the trips of a year
  always add up to exactly the allowance of the year's total, whatever band
  each fell in. A trip entered late (dated before others) moves the later
  trips not yet approved along the scale; approved and paid trips keep their
  amount. Tested in `test/scale.test.ts` and `test/expenses.test.ts`.
- **Send.** Expenses are drafts until sent. *My expenses* shows them on a
  receipt with a tick each (all ticked) and one button: *Send 3 expenses*.
  They go to the approver the accountant named for you, or to the
  accountants. After saving, the toast also offers *Send it now*.
- **Approve or refuse.** The approver sees what waits, by person, oldest
  first, with warnings; *Approve all*, *Approve* one, or *Refuse* with a
  reason (required). A refused expense goes back to its owner's drafts with
  the reason shown in red; they fix it and send it again.
- **Warnings, never blocks**: possible duplicate (same person, amount, day,
  place), no receipt, above the category's limit, the same receipt file on
  another expense (SHA-256; shown to approvers across people).
- **Pay back.** The accountant sees everything approved and paid with
  people's own money, by person, with the total to transfer; *Mark paid* with
  the date (Undo in the toast).
- **Monthly export.** Pick a month (and a person, or everyone): a **CSV**
  (date, person, category, account code, where, details, amount excl. VAT,
  VAT, recoverable VAT, amount incl. VAT, currency, paid with, status,
  approved by, paid on, receipt file name, reference) in the accountant's
  language — French: `;` and decimal commas — and a **ZIP** of the receipts
  named `2026-09-12_Hugo-Bernard_42-50EUR_E123.pdf`, with the CSV inside.
- **The bell**, in each person's language: approvers when something is sent
  to them; employees when approved, refused (with the reason) or paid. The
  tile's number is what waits for you: expenses to decide, plus your refused
  drafts.
- **Reminder** (schedule proposal): on the 25th at 09:00, everyone with
  unsent drafts is reminded ("Send your expenses before the end of the
  month", with their count and total). The accountant can turn it off.

## Roles

| Role | May |
|---|---|
| `accountant` | Everything below, plus: company settings (currency, reminder), categories (name, account code, recoverable VAT %, limit), the mileage scale, who approves whom; sees every expense that was sent; approves any; pays back; exports |
| `approver` | Own expenses; approves or refuses the expenses of the people assigned to them, and sees those |
| `employee` | Own expenses |

A draft is its owner's alone until it is sent (nobody else sees it). Nobody
approves their own expense — except an accountant nobody was named to
approve (a company with one accountant); the export's *Approved by* column
then shows it. Without a named approver, the accountants approve. Rights are
enforced on the server in `lib/access.ts` and tested per role.

## First minute

- **What a new user sees first**: *My expenses*. Empty: a torn receipt that
  says "Paid for something for work? Take a photo of the receipt" and one
  green button, *Add my first expense* (and *Add a car trip* below it). On a
  phone, *Add an expense* stays under the thumb at the bottom of the screen.
- **What they do first**: tap it, *Take a photo*, type `41,00`, tap *Meals*,
  *Save*. The amount field is focused as soon as the photo is taken.
- **Clicks for the main job**: add = 5 taps (Add, photo, amount, category,
  Save); send = 1 tap; approve = 1 tap per person (*Approve all*); pay back =
  1 tap per person; export = 1 click.
- **Mistakes**: an amount that isn't one says "Enter an amount, like 12.50";
  a wrong file type or size is refused before it is sent; *Delete* on a
  draft offers *Undo* (kept a week); *Mark paid* offers *Undo*; a sent
  expense cannot be changed ("ask your approver to refuse it: it comes back
  here"); a refusal always says why.

## Routes

| Route | What |
|---|---|
| `/chest` | My expenses: figures, to send, waiting, approved, paid back by month |
| `/chest/new`, `/chest/new?trip=1` | Add an expense / a car trip |
| `/chest/expenses/[id]`, `…/edit` | One expense with its receipt, history, Approve / Refuse, Edit / Delete |
| `/chest/approve` | To approve (approvers, accountants) |
| `/chest/pay` | To pay back (accountants) |
| `/chest/export`, `/chest/export/csv`, `/chest/export/zip` | Monthly export (accountants) |
| `/chest/settings` | My vehicle; company settings, categories, approvers, mileage scale (accountants) |
| `/chest/api/receipts` | POST: authorise one receipt upload (browser → Chest) |
| `/chest/receipts/[id]` | Opens a receipt through a fresh 15-minute signed link (`?size=256|1024` thumbnail, `?download`) |
| `/chest-events` | Members' lifecycle (signed by the Chest) |
| `/chest-jobs/[name]` | Schedules `reminder`, `cleanup` (proposal, signed) |
| `/` | Public host: "this tool lives in your Chest" (no public part) |

## On a Chest

- `capabilities`: `database`, `files` (receipts: photo or PDF, 10 MB each,
  uploaded by the browser straight to the Chest), `members` (names; who is
  accountant or approver), `notifications`; `receives: ["member.*"]`.
- **Receipts are kept as sent**: the tool never changes the file, records
  its SHA-256, and a receipt cannot be replaced once the expense is sent.
  Uploads never used go after a day, deleted drafts after a week (nightly
  `cleanup` schedule; without schedules they stay until the next run).
- **Someone leaves** (or loses access): what they sent still waits, shown as
  "Name (former member)", for the accountant to approve and pay; the people
  they approved, and what was waiting for them, go back to the accountants.
- **An erasure**: the company must keep its accounting records, so what was
  sent, approved or paid stays — amounts, receipts, trips — but the person's
  id becomes `erased` everywhere ("Former member") and their notes are
  deleted. Their drafts (never sent: not records of anything) are deleted
  with their receipts, and so are their vehicle and unused uploads. Then the
  erasure is acknowledged.
- No WebSocket: *My expenses* and *To approve* re-read themselves every 30 s
  while visible.
- Memory: the CSV is bounded to 20,000 lines; the ZIP is streamed with one
  receipt in memory at a time (10 MB at most), 5,000 receipts and 1 GB per
  archive at most — well within the 256 MB a tool has. Beyond, export one
  person at a time.

## Legal (France) — what the tool does and does not guarantee

**This is not accounting software.** It collects expense claims, their
approval and their receipts, and gives the company's accountant (or
accounting software) a clean monthly file; bookkeeping happens there. The
tool:

- keeps each receipt file **exactly as uploaded** (never recompressed or
  cropped), with its SHA-256, upload date and uploader, and does not let a
  receipt be replaced once the expense is sent — the conditions French rules
  set for replacing paper receipts by a faithful digital copy (arrêté of
  22 March 2017, art. A102 B-2 LPF). Receipts must be **kept 10 years**
  (Code de commerce L123-22; 6 years for tax) — per our research
  (`reports/02-open-source/expenses.md`), *not re-read on the official
  texts*;
- **keeps every receipt of a sent expense until the tool is removed**: it
  never deletes them by itself. It does **not** guarantee archival for 10
  years on its own: the Chest's storage is the company's server, and
  removing the tool removes its files. The accountant should download the
  monthly ZIP and archive it with the company's accounting documents;
- does not produce a legal FEC, VAT returns or payroll entries, and does not
  pay anyone (the transfer is made in the bank; *Mark paid* records it).

**Values to check** (settings, not code): the mileage scale shipped is the
one for 2025 distances as read from search results on 2026-09-28 (source in
the scale's *Source* field); the **motorbike 3–5 CV and over 5 CV rows were
not verified** — the accountant checks the scale each spring on
impots.gouv.fr (*Settings → Mileage scale*). Trips of a year with no scale
of its own use the latest earlier one, and the page says so. The default
categories' account codes (625700, 625100, 625600, 606100, 606400, 628000)
and VAT recovery (meals 100 %, fuel 80 %, hotel 0 % per the research;
travel 0 % and other 0 % are our cautious defaults, **not verified**) are
suggestions to confirm with the company's accountant.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: interface, bell and
  export in each member's language.
- **Scheduled tasks** — **Proposal (studio)** (`chest.proposals.json`):
  `reminder` (25th, 09:00) and `cleanup` (nightly). On a Chest without them,
  nobody is reminded and unused uploads and deleted drafts stay (the tool
  still works).
- Wished, not built: a **time zone of the Chest** in the SDK for "today"
  (the tool assumes Europe/Paris), and **thumbnails of HEIC photos**
  (iPhone) from the Chest — HEIC receipts are kept and exported but show an
  icon instead of a preview.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/expenses --reset
--port 4900` (a month of sample expenses from `seed/sample.sql`),
`node lab/chest-dev/flows/expenses.mjs 4900` (the browser flows),
`node lab/chest-dev/screens.mjs tools/private/expenses --port 4900` (run the
flows first: they add the photo receipt the screenshots show).

## What it does not do (yet)

Receipt OCR (needs the AI gateway), multi-currency conversion (the rate is
not known: amounts stay in their currency and totals are per currency),
advances deducted from claims, per-diem allowances abroad, a SEPA transfer
file, an FEC-layout journal export, importing past expenses from Expensify
or N2F, bank feeds and company cards, e-invoices received on the company's
platform (reform of 2026–2027) as a proof type, splitting an expense,
re-invoicing to a client.
