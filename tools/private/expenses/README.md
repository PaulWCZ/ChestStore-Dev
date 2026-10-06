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
- **The photo is read.** Once a receipt photo is picked, the phone itself
  reads it (tesseract.js, Tesseract compiled to WebAssembly, French model;
  nothing leaves the page) and fills the **empty** fields it is sure of —
  amount, date, VAT, shop — outlined in green with "Read from the photo:
  amount, date. Check them." A blurred photo gives what it could (often only
  the date) or "could not be read". JPEG, PNG and WebP only (not PDFs, not
  iPhone HEIC); skipped when the phone saves data. The first reading loads
  about 4.7 MB from the tool, then the browser keeps them.
- **Who was at the table.** Categories that ask for it (Meals by default;
  the accountant ticks others) show *Who was there*: colleagues picked by
  name, guests from outside typed with their company ("Jean Dupont
  (Acme)"), and the amount per person; or *Just me*. A meal that says
  neither gets a warning for the approver.
- **Hotels by the night.** A hotel asks how many nights; its limit is per
  night ("Above the €100 limit per night").
- **Flat rates (forfaits).** *Add → Flat rate*: a number of days, nights or
  meals at one of the company's rates, no receipt. Shipped with URSSAF's
  2026 allowances for staff working away (meal 21,40 €, night 76,60 € in
  Paris and the inner suburbs, 56,80 € elsewhere — to check each January);
  the accountant adds the company's own per diems.
- **Other currencies.** An expense in pounds or yen takes the rate its
  owner types (the one on their card statement) or the company's rate for
  that currency (*Settings → Company*); its amount in euros is shown,
  counted in totals, paid back and booked. Without any rate it stays apart,
  with a warning.
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
  A **refused** expense is never ticked again until its owner changes
  something (a new receipt, a field, or a note for the approver): until
  then it shows *Fix it* and the server refuses to send it
  (`refused_unchanged`).
  They go to the approver the accountant named for you, or to the
  accountants. After saving, the toast also offers *Send it now*.
- **Approve or refuse.** The approver sees what waits, by person, oldest
  first, with warnings and the receipt's thumbnail (a photo opens large, a
  PDF in a tab); *Approve all* approves only the lines **without a
  warning** ("Approve the 3 without warnings · 1 has a warning: look at it
  first"), *Approve* one, or *Refuse* with a reason (required). An expense
  sent again after a refusal says so on its line, with the reason ("Sent
  again after a refusal: …"). The server never approves an expense that is
  exactly as it was refused. A refused expense goes back to its owner's drafts with
  the reason shown in red; they fix it and send it again.
- **Warnings, never blocks**: possible duplicate (same person, amount, day,
  place), no receipt, above the category's limit (per night for hotels),
  the same receipt file on another expense (SHA-256; shown to approvers
  across people), sent again after a refusal, guests not named, no
  exchange rate.
- **Pay back by one transfer file.** Each person gives their **bank
  details** once (*Settings → Me*; or the accountant enters them from
  *To pay back*): the IBAN is checked while typed (country length and the
  mod-97 check digits), then only ever shown masked (`FR•• •••• 0189`).
  Only the person and the accountants reach it — never an approver. When
  someone else changes a person's details, that person hears it; when a
  person changes their own, the accountants do, and *To pay back* flags
  details changed in the last 30 days (the usual payment-diversion fraud).
  *To pay back* then makes **one SEPA credit transfer file** for the bank
  (ISO 20022 `pain.001.001.03`, the XML French banks take for grouped
  transfers): one transfer per person with an account in the SEPA zone, in
  euros, on the day chosen; they are marked paid on that day (*Undo*, or
  later *Cancel this file*: back to "to pay back"). The file can be
  downloaded again, identical (same message id, which banks use to refuse a
  duplicate). People without bank details are named and paid by hand with
  *Mark paid* as before. The text on each person's bank statement
  ("Notes de frais E12 E13") is in the **company's language**, chosen in
  *Settings → Company* (the Chest's language by default), whatever language
  the person reads. An account in a **SEPA country outside the EEA** (the
  UK, Switzerland, Monaco…) needs its holder's **postal address** (asked in
  the bank details form, the IBAN kept as it is), and the company's own
  address: both go in the file for those transfers; until they are there,
  that person is left out of the file with the reason, and *To pay back*
  says what is missing.
- **Company cards.** *To pay → Company cards*: the accountant imports the
  month's **card statement** (the CSV of the bank or card provider — the
  file is read in the browser; columns guessed, then checked: date, label,
  amount or debit, currency, card holder; one holder for the file, or a
  holder column matched to the team by name). Card payments are the
  negative amounts (or the debit column); refunds and credits are left
  out, and said. Each payment is **matched** to the expense its holder
  already added — same person, amount equal or within 2 % / €0.50 (4 % /
  €1 against an expense in another currency, through its amount in
  euros), the expense from 5 days before the statement's date to 1 day
  after, the label's words against the shop's name to decide between close
  candidates; each expense once. A payment with no expense becomes a
  **draft of its holder**, paid with the company card, the shop taken from
  the label, waiting for its receipt: in their *To send*, "Company card:
  receipt needed" and *Add the receipt*, not ticked for sending until then;
  the holder is **asked in their bell** (and counted on the tile), and
  asked again with *Remind*. The accountant sees *Waiting for a receipt*
  by person, and *To check*: a payment matched to an expense its owner
  said they **paid with their own money** (not to be paid back twice —
  the approver and *To pay back* show the warning too), or whose draft its
  holder **deleted** (personal spending?). The same payment imported again
  (overlapping statements) is recognised; *Undo* takes a statement back
  while nobody touched what it made.
- **Monthly export.** Pick a month — of the expense, or of the payment —
  (and a person, or everyone): a **CSV**
  (date, person, category, account code, where, details, amount excl. VAT,
  VAT, recoverable VAT, amount incl. VAT, currency, paid with, status,
  approved by, paid on, receipt file name, reference) in the accountant's
  language — French: `;` and decimal commas; also the exchange rate, the
  amount in euros and the guests — a **ZIP** of the receipts
  named `2026-09-12_Hugo-Bernard_42-50EUR_E123.pdf`, with the CSV inside,
  and the **accounting entries** in the column layout of the French FEC
  (18 columns, tab-separated, decimal comma): one balanced entry per
  expense — expense account, deductible VAT (receipts in euros), and the
  employees' account (421000, with each person's own account, e.g.
  421BERNARD) or the company card's account — for the accounting software
  to import. The accounts are set in *Settings → Company*.
- **Import past expenses.** *Settings → Company → Import*: the CSV the
  previous tool exports (Expensify, N2F, a spreadsheet). The columns are
  guessed from their headers and can be corrected, the first lines are
  shown as they will be read, dates day-first or month-first; each line
  goes to the person it names (by name), as history already paid back
  there — never paid, exported or booked again; a line imported twice is
  recognised. Refunds and unknown people are left out and said.
- **Kilometres before the tool.** *Settings → Me*: the kilometres already
  driven for work this year before the tool count in the year's total, so
  the trips entered here fall in the right band of the scale. *Your usual
  trips* fill the trip form in one tap.
- **The vehicle's registration certificate** (carte grise): uploaded by its
  owner, seen and ticked *Checked* by the accountant (*Settings → Company →
  Vehicles*); a change of vehicle takes the check off.
- **The accountant's first visit.** On *My expenses*, a checklist until
  they say *It's done*: categories and accounts, who approves whom, this
  year's mileage scale, the company's bank account — each a link to its
  place.
- **Nobody approves their own expenses — the accountant included.** An
  accountant's own claim goes to the approver named for them (*Settings →
  Company → Who approves whom*), or else to the other accountants; never to
  themselves, even with nobody else (the server refuses: `self_approval`).
  When nobody can approve it — the only accountant, nobody named — it
  waits: the toast says so on sending, *My expenses* says "Waiting: nobody
  can approve it yet" with a link to name someone, the first-visit
  checklist asks for it, and *Who approves whom* flags that accountant.
  **Who approves an accountant's (or the only admin's) claims**: another
  accountant, or the person named for them — someone with the Approver role
  (a manager, the owner), which the Chest's admin gives. Claims approved by
  their own owner before this rule are marked "Approved by its own owner"
  in *To pay back* and "(own expense)" in the export's *Approved by*.
- **Someone who left**: their claim still waits in *To approve*, which says
  they left and when ("Left the company on 30 September: approving still
  means paying them back — on their final pay slip, not by the transfer
  file"; the day from the Chest, `members.leftAt` (a studio proposal) — without
  it, the sentence without the day); in *To pay back* they are **kept out of
  the transfer file** (a transfer to a former employee's account is what a
  diversion would ask for) and paid by hand with *Mark paid*.
- **Search** (the box in the header, or "/"): a shop or a word of the
  note, a place of a trip, an amount as typed (`187,60`, `187.6`, or `187`
  for any amount of 187 and cents), a reference (`E123`), a person's name,
  a category — among the expenses the reader may see: their own (drafts
  too), those they approve, and for accountants every expense sent. The 100
  most recent, each with its reference.
- **Card lines finish themselves**: a card payment that becomes a draft gets
  the category its bank label suggests (`UBER *TRIP` → Travel, `TOTAL` →
  Fuel, `INDIGO` → Parking…) from a list of words the accountant edits
  (*Settings → Company → Card statement words*; about 70 common French
  labels shipped). Words are matched whole, accents and case aside, the
  longest match winning (`UBER EATS` → Meals over `UBER`); no match:
  "Other" (`src/lib/card-guess.ts`, tested).
- **Email** (the `mail` proposal): an approver is emailed when expenses are
  sent to them (each named, with the link to *To approve*); a card holder
  when card payments wait for their receipt ("Receipt needed: UBER *TRIP ·
  €23.40"); on the 25th, people with drafts and approvers with expenses
  waiting. In each person's language, sent by the Chest to their address
  (the tool never knows it), once per event (a key). On a Chest without
  mail, nothing is sent and the bell still says it.
- **The bell**, in each person's language: approvers when something is sent
  to them; employees when approved, refused (with the reason) or paid. The
  tile's number is what waits for you: expenses to decide, plus your refused
  drafts.
- **One date format**: every list writes a day the same way ("8 Sept",
  "8 sept."), and a line's parts never wrap with a "·" at the start.
- **Reminder** (schedule proposal): on the 25th at 09:00, everyone with
  unsent drafts is reminded ("Send your expenses before the end of the
  month", with their count and total). The accountant can turn it off.

## Roles

| Role | May |
|---|---|
| `accountant` | Everything below, plus: company settings (currency, reminder, bank account, journal accounts), categories (name, account code, recoverable VAT %, limit, guests, per night), flat rates, exchange rates, the mileage scale, who approves whom and each person's account, vehicles' certificates, importing past expenses; sees every expense that was sent; approves any; sees and enters everyone's bank details (masked); pays back (transfer file or by hand); exports |
| `approver` | Own expenses; approves or refuses the expenses of the people assigned to them, and sees those (never their bank details) |
| `employee` | Own expenses, own vehicle and certificate, own bank details |

A draft is its owner's alone until it is sent (nobody else sees it). Nobody
approves their own expense, not even an accountant: theirs go to the
person named for them, or to the other accountants (see above). Without a
named approver, the accountants approve. Rights are enforced on the server
in `src/lib/access.ts` and tested per role.

## First minute

- **What a new user sees first**: *My expenses*. Empty: a torn receipt that
  says "Paid for something for work? Take a photo of the receipt" and one
  green button, *Add my first expense* (and *Add a car trip* below it). On a
  phone, *Add an expense* stays under the thumb at the bottom of the screen.
- **What they do first**: tap it, *Take a photo*; the amount, date and shop
  fill themselves from a clear photo (or they type `41,00`); tap *Meals*,
  name who was there (or *Just me*), *Save*. The amount field is focused as
  soon as the photo is taken.
- **The accountant's first visit**: the same page, with *Before your team
  starts* above it — four links (categories and accounts, approvers, the
  scale, the company's bank account) and *It's done*.
- **Clicks for the main job**: add = 5 taps (Add, photo, amount, category,
  Save); send = 1 tap; approve = 1 tap per person (*Approve all*); pay back =
  1 tap for everyone with bank details (one transfer file), or 1 tap per
  person; export = 1 click.
- **A meal without guests named** says so on the form before saving
  ("Guests not named: your approver will ask who was there"), not only to
  the approver. On a phone, the field being typed in is never left under
  the sticky *Save* bar.
- **Mistakes**: an amount that isn't one says "Enter an amount, like 12.50"
  — and so does one that could be read two ways ("1,234", "0,500": a
  thousand for an English reader, one euro for a French one; never
  guessed);
  a wrong file type or size is refused before it is sent; *Delete* on a
  draft offers *Undo* (kept a week); *Mark paid* offers *Undo*; a sent
  expense cannot be changed ("ask your approver to refuse it: it comes back
  here"); a refusal always says why, and a refused expense cannot be sent
  back unchanged ("Change it before sending it again", *Fix it*); a typo in
  an IBAN is caught while typing ("its check digits don't match"); a
  transfer file made by mistake is cancelled in one tap.

## Routes

| Route | What |
|---|---|
| `/chest` | My expenses: figures, to send, waiting, approved, paid back by month |
| `/chest/new`, `/chest/new?trip=1` | Add an expense / a car trip |
| `/chest/expenses/[id]`, `…/edit` | One expense with its receipt, history, Approve / Refuse, Edit / Delete |
| `/chest/approve` | To approve (approvers, accountants) |
| `/chest/search?q=` | Search the expenses the reader may see (everyone with a role) |
| `/chest/new?allowance=1` | Add a flat rate |
| `/chest/pay` | To pay back (accountants): the transfer file, by person, the files made |
| `/chest/cards` | Company cards (accountants): import a card statement, receipts waiting, to check, statements imported |
| `/chest/pay/files/[id]` | A transfer file (pain.001.001.03 XML), the same each time (accountants) |
| `/chest/export`, `/chest/export/csv`, `/chest/export/zip`, `/chest/export/journal` | Monthly export (accountants): `?month=YYYY-MM[&person=mbr_…][&by=paid]` |
| `/chest/settings` | Me: my vehicle, kilometres before the tool, registration certificate, bank details |
| `/chest/settings/company` | Company (accountants): bank account, categories, approvers and accounts, flat rates, exchange rates, journal, vehicles, mileage scale, import |
| `/chest/vehicles/[member]/proof` | A registration certificate, for its owner and the accountants |
| `/chest/api/receipts` | POST: authorise one receipt upload (browser → Chest) |
| `/chest/receipts/[id]` | Opens a receipt through a fresh 15-minute signed link (`?size=256|1024` thumbnail, `?download`) |
| `/chest-events` | Members' lifecycle (signed by the Chest) |
| `/chest-schedules` | Schedules `reminder`, `cleanup` (`chest.json`, contract 0.4; signed `Chest-Schedule`) |
| `/` | Public host: "this tool lives in your Chest" (no public part) |

## On a Chest

- `capabilities`: `database`, `files` (receipts: photo or PDF, 10 MB each,
  uploaded by the browser straight to the Chest), `members` (names; who is
  accountant or approver), `notifications`; `receives: ["member.*"]`;
  `schedules` `reminder` (25th, 09:00) and `cleanup` (nightly), contract
  0.4; `mail: {send: true}` (proposal, `chest.proposals.json`).
- **Receipts are kept as sent**: the tool never changes the file, records
  its SHA-256, and a receipt cannot be replaced once the expense is sent.
  Uploads never used go after a day, deleted drafts after a week (nightly
  `cleanup` schedule).
- **Someone leaves** (or loses access): what they sent still waits, shown as
  "Name (former member)", for the accountant to approve and pay; the people
  they approved, and what was waiting for them, go back to the accountants.
- **An erasure**: the company must keep its accounting records, so what was
  sent, approved or paid stays — amounts, receipts, trips — but the person's
  id becomes `erased` everywhere ("Former member") and their notes are
  deleted. Their drafts (never sent: not records of anything) are deleted
  with their receipts, and so are their vehicle and unused uploads. Then the
  erasure is acknowledged.
- `env`: `BANK_DETAILS_KEY`, **optional**, a secret variable (32 random
  bytes in base64: `openssl rand -base64 32`), set in the tool's
  *Variables*. With it, IBANs are sealed at rest (AES-256-GCM, bound to
  their owner); without it they are kept as typed in the tool's own
  database (no other tool reaches it) and the company settings say so.
  Details saved before the key was set stay readable and are sealed when
  saved again. **Keep the key**: removing or changing it makes the sealed
  IBANs unreadable (the transfer file then says so, and people enter them
  again).
- **Reading receipts** needs no network and no service: the phone runs
  tesseract.js on the files `npm run build` copies into `dist/ocr/`
  (`scripts/ocr-assets.mjs`: worker 111 KB, core 3.9 MB, French model
  0.7 MB). The tool answers them at `/chest/ocr/<file>` (members only) with
  a policy of their own, `script-src 'self' 'wasm-unsafe-eval'`: a worker
  obeys the policy its own script comes with, and this one compiles
  WebAssembly — the pages keep the strict policy (no inline script or
  style, no `'unsafe-eval'`). tesseract.js is a build-time dependency only
  (`devDependencies`: the image holds the copied files, not the package).
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
- does not produce the company's legal FEC (its accounting software does:
  the tool gives entries in that layout to import), VAT returns or payroll
  entries, and does not pay anyone: it writes the transfer file the
  accountant uploads to the bank, and records what was paid. The SEPA file
  validates against the ISO 20022 `pain.001.001.03` schema; it was **not**
  uploaded to a real bank from the studio.
- the URSSAF flat rates shipped (2026, first three months away) were read
  in search results quoting urssaf.fr on 2026-09-29, **not on urssaf.fr
  itself**; VAT recovery on tolls and parking (100 %) is a common practice
  **not verified** — the accountant checks both.

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

The tool runs on the SDK working copy vendored in `vendor/`: SDK 0.4.1 +
studio proposals (0.4.1-studio.3), contract 0.4 (`chest check` OK).

- `member.language` (SDK 0.3.0): interface, bell and export in each
  member's language (English for a language the tool does not speak yet).
- `chest.language`, `chest.timeZone`, `chest.today()` (SDK 0.3.0): the
  Chest's language is the default of the bank statements' text until the
  accountant picks one (`settings.bankLocale`); the Chest's day
  (`src/lib/today.ts`) is "today" everywhere — a receipt's date that has come,
  a transfer's execution day, the scale's year — the same day as the
  database's `current_date`, which the Chest puts in its zone. The SEPA
  file's creation time is written in the Chest's zone.
- `mail` — **Proposal (studio)** (`chest.proposals.json`, `src/lib/mail.ts`):
  emails to approvers, card holders and people with drafts. Without it,
  the bell only. Keys are passed whole (studio.15 hashes a long one), and
  each person's email preference in the Chest applies: none of these is
  transactional.
- `members.leftAt(ids)` — **Proposal (studio)**: the day a former member
  left, in *To approve* and *To pay back* (lookup's `no_access` — someone
  still in the Chest who lost access to Expenses — is no "former": written
  "Name (no access)", their plain name in a transfer file, paid as usual).
- **Schedules** (contract 0.4, official): `reminder` and `cleanup`, run on
  `POST /chest-schedules`; the deliveries already handled (events and runs)
  are kept in `chest_events` and forgotten after 30 days by the cleanup.
- `chest.tool.teamUrl` (0.4.1): the link in emails (none outside a Chest).
- `FileObject.sha256` (0.4.1): a receipt's SHA-256 as the Chest took it;
  the tool never reads a receipt into its memory to hash it.
- Wished, not built:
  - **sealed values** (`secrets.seal(value, context)` / `secrets.open(sealed,
    context)`, a key the Chest keeps per tool and never gives it, rotated by
    the Chest): bank details sealed without asking an admin to set
    `BANK_DETAILS_KEY` (today's seam: `src/lib/seal.ts`);
  - **reading receipts with AI** (SDK 0.3.0's `@argentic/chest-sdk/ai` with
    an image, not used yet, or an `ocr.read(file)` on a receipt the Chest
    holds): reading blurred, crumpled
    or PDF receipts and HEIC photos, which the phone's Tesseract cannot;
    today's seam: `src/components/ocr.ts` → `src/shared/receipt-text.ts`;
  - **bank and card feeds** (a bank connection through the Chest, PSD2):
    card payments arriving by themselves instead of a monthly CSV (the
    matching is built: `src/lib/cards.ts` takes lines from any source), and
    knowing a transfer was executed;
  - `members.email` for importers (matching an Expensify export's
    submitter by email rather than by name);
  - the **Chest's currency** (`chest.currency`, official since 0.4.0) as the
    default of the company's currency (the accountant sets it today: not
    wired yet), and **thumbnails of HEIC photos** (iPhone).

## Looks

Expenses wears its own look — **Receipt**: thermal paper, ink black, money
green, amounts in a till-roll monospace — by default. The company may give
it, in its Chest, **any theme of the store's catalogue** (Chest, High
contrast, or another tool's identity) or **its own brand** (colours, fonts,
corners, logo), for all its tools or for Expenses alone: every screen and
feature stays the same, and every text stays readable (WCAG AA, light and
dark). In brand mode the company's logo stands where the Expenses mark
does. The look is chosen on the server (`chest.theme()`, `src/theme.ts`)
and served as a stylesheet of its own (`/chest/look.css?v=<hash>`, never
inline);
the tool has no switch of its own. Screenshots: `docs/screens/*-chest-*`,
`*-theme-*` (Library, Seaside), `*-brand-*` (a sample brand).

The screens are built from the store's UI kit (`@argentic/chest-ui`): the
header and its labelled tabs, toasts with an Undo that says whether it
worked (and none once someone was told), dialogs that never lose a typed
IBAN, a confirmation before erasing bank details, date fields typed in the
reader's language, the file picker for certificates and imports.

## How it is made

The studio's stack (`starter/`, `reports/06-perseus-starter.md`): Hono,
React rendered on the server with a few islands, Vite, on the vendored
package `@argentic/chest-app` (`node_modules/@argentic/chest-app/AGENTS.md`).
`src/app.tsx` holds every route (pages, downloads, `/chest-events`,
`/chest-schedules`), `src/actions.ts` every change (typed actions an island
calls with `call()`), `src/pages/` the pages, `src/islands/` what runs in
the browser (one view island per page — its lists, dialogs, toasts — beside
the search box and the 30-second refresh), `src/lib/` the rules and SQL,
`src/shared/` the rules the browser runs too (money, scale, IBAN, CSV
reading), `src/i18n/` every word. Islands and the pages call the same
services as before; the services lock the rows they read then write (two
approvals, two payments, two transfer files of the same expense: one wins,
the other is told).

## Develop

```sh
npm ci
npm test          # tsc, the server built into dist/test, node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # tsc, the browser's files, the server, the receipt reader's files (dist/ocr)
npm start         # the built server, as the Chest runs it
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/expenses --prod
--build --reset --port 4920` (a month of sample expenses from
`seed/sample.sql`), `node lab/chest-dev/flows/expenses.mjs 4920` (the
browser flows, 32 steps), `node lab/chest-dev/screens.mjs
tools/private/expenses --port 4920` (run the flows first: they add the
photo receipt the screenshots show), `node lab/chest-dev/audit.mjs
tools/private/expenses --port 4920` (axe: 0 violations on 27 screens).
`SEPA_XSD=<path to pain.001.001.03.xsd> npm test` (and the same variable
for the flow) also validates the transfer files against the ISO 20022
schema with `xmllint`; the schema is not shipped.

**Measured** (`lab/measure`, 6 October 2026, Node 24.21, this machine
under other builds — load average 6 to 11 on 4 CPUs —, results in
`lab/measure/results/after-hono/expenses.json`), Next.js 16 before → this
stack: memory at rest (PSS of the process tree, median of 5 rests of 30 s)
**127.0 → 67.6 MiB**, peak 159.7 → 71.3 MiB; image 514 → 33 MiB
(`node_modules` after pruning 499 → 16 MiB); `npm ci` and the build now fit
the 512 MiB, one-CPU container (before: killed for memory), build 19.4 →
8.1 s with 4 CPUs (peak 295 MiB PSS); first 200 after a start 779 → 979 ms
(median of 10, from 351 to 1,394 ms) — slower here, measured while the
machine was loaded; the server's module loads in 100–170 ms alone.

## What it does not do (yet)

- **Card feeds**: card payments come from a CSV the accountant imports each
  month, not live from the bank (needs a bank connection: SDK). The CSV
  shapes relied on are **assumed from documentation summaries, not from
  real exports** (THIRD_PARTY.md: French bank exports `Date;Libellé;
  Montant` with negative spending or `Débit`/`Crédit` columns; Qonto's
  settlement date, counterparty name and total amount); any other shape is
  mapped by hand. OFX/QIF and CFONB 120 files are not read. The matching
  is a heuristic: a wrong pair is undone by the accountant (*Undo* of the
  statement) or noticed by the approver.
- **Transfers outside the EEA**: whether the address the file writes
  (structured, in `pain.001.001.03`) is taken by every bank is **not
  verified** (see THIRD_PARTY.md); the tool does not write
  `pain.001.001.09`.
- **Advances** (avances sur frais) deducted from later claims.
- **Reading difficult receipts**: the phone reads clear photos; blurred,
  crumpled or PDF receipts and HEIC photos are typed (needs an OCR or AI
  primitive for better).
- **Per diems by country** (abroad): flat rates are one amount each; the
  accountant adds one per country if needed.
- **Live exchange rates**: rates are typed (the card statement's) or set by
  the accountant — the tool has no network (the ECB's daily rates would
  need a declared host, and are not the rate the card charged).
- A **transfer file outside euros or the SEPA zone**; people with an
  account elsewhere are paid by hand.
- **Importing** receipts files or trips from the previous tool (lines only,
  as history); matching people by email.
- **Email preferences**: the emails are only those that ask someone to act,
  and nobody can turn them off yet (Tasks has a per-person switch; not
  here).
- **Search** is plain text (case aside, not accents: "hotel" does not find
  "Hôtel"), 100 results, no filters of its own; category words are those of
  the reader's language.
- **Card statement words** guess from the label only; a supermarket
  (MONOPRIX, CARREFOUR) stays "Other" unless the accountant adds it.
- E-invoices received on the company's platform (reform of 2026–2027) as a
  proof type, splitting an expense, re-invoicing to a client, budgets and
  spend requests (Spendesk's core).
