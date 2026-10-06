# Quotes & invoices — a proper quote, then the invoice

*Devis et factures.* A store tool for a Chest: a small French company writes
a quote from its catalogue, sends it — **the client reads it and accepts it
online ("Bon pour accord")** —, turns it into an invoice when the
client says yes, finalises the invoice with the next legal number — as a
**Factur-X** —, sends it, records the payments, reminds the late payers (by
itself if asked), repeats the monthly invoices, and hands its accountant a
clean export with the accounting entries. It replaces the invoicing part of
Axonaut, Sellsy, Henrri, Tiime or Pennylane's invoicing module — **but not
their approved platform (PA)**: keep your PA to transmit the e-invoices
(see "Legal").

**Switching from another tool** takes an afternoon: import the clients, the
catalogue **and the invoices still to collect** from a spreadsheet (the
importer recognises the usual French and English headers, shows the first
rows, says which rows could not come and why), and continue the invoice
numbering from the previous tool's last number (Settings → Numbering). The
old subscription can end on switching day: its unpaid invoices are
collected here.

## What it does

- **The company's legal details**, once (admin): legal name and form, share
  capital, address, SIREN, SIRET, RCS city, VAT number, VAT regime (including
  the *franchise en base* — "TVA non applicable, art. 293 B du CGI"), VAT on
  debits, logo (stored in the Chest's files), bank and IBAN/BIC, payment
  terms, late-payment penalty rate (empty: the legal ECB + 10 points), early
  discount, footer, numbering prefixes. What is missing is listed on the desk
  and blocks sending — the documents would lack mandatory mentions.
- **A client from its SIREN**: "Fill in from the SIREN" asks France's
  free public directory of companies (the State's API Recherche
  d'entreprises, the tool's **one declared network host**,
  `recherche-entreprises.api.gouv.fr`) and fills what is still empty:
  name, head-office address, VAT number (computed from the SIREN); a
  ceased company is said. When the directory cannot be reached the tool
  says so and fills nothing (the studio's harness cannot reach it: only
  the failure was seen in a browser; the success is tested with the
  directory's recorded answer).
- **Clients**: a company or an individual, address, delivery address, SIREN,
  VAT number (French keys checked), email, contact, language of their
  documents (English or French), reverse charge by default. Archived, never
  deleted (their documents are legal records).
- **Catalogue**: name, description, unit, price excluding VAT, VAT rate
  (20, 10, 5.5, 2.1 or 0 %), service or goods. Archived, never deleted.
- **Quotes**: written on the paper itself — client, subject, lines (from the
  catalogue or free: quantity with up to three decimals, unit, unit price,
  discount %, VAT rate), section titles, notes, validity date; saved as you
  type. Draft → sent (numbered `D-2026-0001` when first sent) → accepted or
  refused; a sent quote past its date reads *expired*. Duplicate.
- **Versions of a sent quote**: a quote that went to its client never
  changes silently under its number. "Change the quote" starts its
  **version 2** (`D-2026-0007 v2`; Undo takes it back): the version sent
  is kept as it was — its lines, totals and the very PDF the client was
  shown (Chest's files, SHA-256) — and listed with its PDF in the margin.
  While v2 is written, the client's link says a new version is coming and
  takes no answer (the earlier PDF stays readable); "Send version 2"
  emails it ("version 2 of our quote …, it replaces the version sent on
  …"), and the **same link** then shows it, saying which version it
  replaces. A version not sent yet may be discarded: the quote is again
  the version sent, its link and PDF too. An answer online names the
  version it was given on, and its proof keeps that version's PDF hash.
  The version suffix is the studio's choice (no French rule was found for
  quotes, which are not regulated documents).
- **Invoices**: from an accepted quote — the whole of it (less the deposits
  already invoiced, rate by rate) or a deposit (*acompte*) of a percentage —
  or blank. A draft is prepared by anyone selling and handed to billing
  (who hear of it in the Chest's bell). **Finalising** gives the next number
  of a continuous, gap-free sequence per year (`F-2026-0001`), dated the
  Chest's today, and freezes the invoice forever: a PostgreSQL trigger
  refuses any change of a finalised invoice or of its lines, and any
  deletion, except its sending, reminders, stored PDF and the erasure of a
  member's id. Numbers come from a counter table whose row is locked inside
  the finalising transaction: concurrent finalisations wait for each other,
  a failed one gives its number back (tested on PostgreSQL with thirty
  finalisations at once).
- **Credit notes** (*avoirs*): the only correction of a finalised invoice,
  full or partial (its lines, reduced), with their own sequence
  (`A-2026-0001`), never more than what remains of the invoice — in all,
  and rate by rate: a credit note takes back VAT only at the rates the
  invoice charged, and at each no more base than is left to credit there.
  Its lines that take back a deposit keep their mark when edited, so the
  entries debit 4191 again and not the sales.
- **Numbering**: with the year (`F-2026-0001`, from 0001 each year) or
  without (`F-0001`, never restarting). An administrator may set the next
  number of a sequence **forward only, and only before this tool numbered
  anything in it** — to go on from the previous tool's last number
  (`F-2026-0347` there → `F-2026-0348` here). Every change is kept and
  shown (Settings, and the history of the first document numbered after
  it). The format may change; each format has its own counters, so no
  number can ever come twice. A kind's prefix (`D`, `F`, `A`) may change,
  but never to one another kind's documents already begin with (an invoice
  `A-2027-0002` beside the credit note `A-2027-0002`): refused, and numbering
  itself refuses a number another kind carries; each prefix change is kept
  in the history too.
- **Amounts typed** (prices, payments, capital, imported files): spaces of
  any kind and apostrophes group thousands, a currency sign or code may
  stand at either end; any other letter (`12a50`, `1e3`, `1O0`) is refused,
  never dropped; groups are of three digits; currencies of 0, 2 and 3
  decimals. A lone mark before three digits (`1,234`, `0.500`) could be a
  thousand or a decimal: typed in a form it is refused ("Write 1234 or
  1,23"), as in Expenses, Timesheets and the package's `field.money` (a
  currency without decimals reads it as thousands). A file (an import, a
  bank statement) is read with its own dominant decimal mark — `1.234` is a
  thousand in a file that writes `12,50` —, or as thousands when it gives
  no clue; the preview says which reading is used.
- **Totals**, in integer cents: each line rounded once (half away from
  zero), summed per VAT rate, VAT computed once per rate, totals added —
  the rule is written and tested in `src/shared/totals.ts` (it is also what the
  European e-invoicing standard EN 16931 expects).
- **PDF**, drawn by the tool itself (its own small PDF writer, no library,
  no network), A4, in the client's language, with the French mandatory
  mentions: numbers and dates, seller and buyer identification with SIREN
  and VAT numbers, the lines, VAT per rate, totals, due date, penalties and
  the €40 recovery indemnity (between businesses), early discount,
  "Autoliquidation" under reverse charge, "TVA non applicable, art. 293 B du
  CGI" under the franchise, the new mentions of the reform (buyer's SIREN,
  delivery address, kind of operation, VAT on debits). A finalised
  document's PDF is made once and kept in the Chest's files with its
  SHA-256: the copy of record, the one the export holds. Drafts print a
  "Draft" mark on every page. Every PDF is a **PDF/A-3** (fonts embedded —
  Liberation, with the widths of Helvetica and Times —, sRGB output intent,
  XMP metadata), and every issued **invoice, deposit invoice and credit
  note is a Factur-X**: it carries `factur-x.xml`, its data as UN/CEFACT CII
  in the **EN 16931** profile (see "Factur-X"). Units read in the plural
  when the quantity says so ("10 exemplaires"). An optional online payment
  link is printed on invoices and in their emails.
- **Sending** by email with the PDF attached, in the client's language, the
  words changeable, through the Chest's mail (a studio proposal). A
  quote's email **opens with its answer link** ("Read quote D-… and accept
  it online: <link>"), shown as a fixed first line in the send dialog; it
  never asks the client to reply to accept.
- **Terms and conditions of sale (CGV)**: an administrator adds one PDF in
  Settings; it is attached to every quote's email, linked on the client's
  page, and accepting online says "and the terms and conditions of sale"
  (the answer keeps the terms' SHA-256; terms changed while the page was
  open: the answer is refused and the page redrawn). Not merged into the
  quote's own PDF. Where the
  Chest cannot send email, the tool says so: download the PDF, send it
  yourself, mark it as sent.
- **The client answers online** (the tool's public part): a sent quote
  gets a secret link (32 random characters; the email carries it, the
  quote's margin shows it to copy when sending by hand). The client opens
  `/q/<secret>` on any device: the quote as a page (in the document's
  language) and its PDF, then **accepts** — their name typed, the box
  "Bon pour accord" ticked, the day written — or **declines**, with a
  reason if they wish. The answer is kept with its proof: the server's
  time, a hash of the visitor's address (never the address), the browser,
  and the **SHA-256 of the exact PDF they were shown** (the file itself is
  kept in the Chest's files, and downloadable from the quote's margin).
  The quote becomes accepted or refused, its author (and whoever sent it)
  hears it in the bell, the history says "Accepted online by …". If the
  quote was changed while the client was reading, the answer is refused,
  **the page is drawn again in place with the new version** (the name
  typed kept, the box to tick again) and says what changed ("Total incl.
  VAT: €120.00 → €144.00", lines changed, added, removed). The link works while the quote waits
  and is valid, then says the quote expired; an answered quote shows its
  answer; the person who sent it may turn the link off (the page then
  shows nothing of the quote) and make a new one. **This is a record of
  agreement given online, not a qualified or certified electronic
  signature (eIDAS)**: the page and the proof say so.
- **Bank statement** (billing and administrators, `/chest/bank`, from the
  Invoices page or "More"): the CSV the bank exports — the account's
  details above the header found and skipped, UTF-8 or Latin-1, ";" and
  decimal commas, a signed amount or debit/credit columns, columns
  matched from their names (changeable). Each payment received is
  proposed with the invoice it pays — its number in the bank's words,
  else the same amount from a client named there, else the only open
  invoice of that amount, else the only open invoice of a client named
  there — and recorded in **one tap** (by transfer, on the line's day, the
  bank's words as the note; Undo). Money out is left aside; a line already
  recorded is never offered twice (its fingerprint stays with the
  payment). Nothing is recorded by itself. See THIRD_PARTY.md for what
  could not be verified of the banks' formats.
- **Revenue at a glance** (the desk, for administrators, billing and the
  accountant's seat): this month's sales excluding VAT against last month
  and the same month a year ago, since 1 January, by client and by
  salesperson (who wrote the quote an invoice came from). What the
  accounting entries count as sales: invoices issued here less credit
  notes, a deposit counted with its final invoice; imported invoices not
  counted.
- **Payments**: date, amount, method, reference; partial payments; states
  *unpaid*, *partly paid*, *paid*, *overdue* (by the Chest's today),
  *cancelled* (credited in full). On a late invoice, "Send a reminder" is
  the first action. **Automatic reminders** (Settings, off by default): each
  morning, an invoice late by one of the company's steps (7, 15, 30 days by
  default) is reminded once per step — by email to the client with the PDF
  (when chosen and the Chest can send email), and the person who issued it
  is told in the bell (or only told, when chosen).
- **Recurring invoices**: an issued invoice repeats every month, quarter or
  year; on each date a **draft** of it is made and handed to billing (told
  in the bell), who check the period in the subject and finalise it.
  Nothing is finalised by itself.
- **Invoices still to collect, from the previous tool** (billing and
  administrators, `/chest/import?kind=invoices`): number, date, client
  (found by SIREN, else by name, else added), subject, due date (else the
  company's terms), totals, and what was paid or what is left. They keep
  their numbers **in a series of their own**, outside this tool's
  gap-free sequences: never renumbered, never counted when the numbering
  is continued, never numbered again; an own number equal to an imported
  one never collides. They are only *collected* here — payments,
  reminders (by hand or automatic, without a PDF: theirs stays in the
  previous tool), on the desk and the tile — never finalised, drawn,
  credited or exported as this tool's sales (the previous tool's
  accountant's files already hold them). Rows already paid in full are
  left out and counted; the same number never comes twice; an import is
  undone in one click while nothing was recorded on its invoices.
- **Import** (`/chest/import`): clients and catalogue items from a CSV —
  Axonaut, Sellsy, Pennylane, Excel — with the columns matched from their
  names (changeable), a preview, every value checked (SIREN/SIRET and VAT
  keys, emails, countries in words, Pennylane's `FR_200` VAT codes, prices
  with a decimal comma or including VAT), duplicates skipped (same SIREN,
  else same name), refused rows listed with their line and reason.
- **Export for the accountant**: the invoices and credit notes of a period as
  a summary CSV (in French: ";" and decimal commas; journal, date, number,
  client, excl. VAT and VAT for each rate, totals, due date, corrected
  invoice, state); the **accounting entries** (a sales journal in the 18
  columns of the French FEC: client account 411 with each client's
  auxiliary account, sales of services 706 / goods 707, deposits 4191, VAT
  collected per rate — every account set in Settings; each entry balanced;
  credit notes reversed; the lines that take back a deposit clear 4191,
  and so does a credit note cancelling a deposit invoice — the same
  entries in the export, its ZIP and the monthly archive);
  and a ZIP of everything (the Factur-X PDFs of record, the summary, the
  entries, `clients.csv`, `catalogue.csv`). The clients and the catalogue
  also download alone, in the importer's columns (what leaves comes back).
- **The monthly archive**: on the 1st of each month (schedule `archive`;
  caught up by the daily follow-up, or the first desk visit of a day), the
  month before goes into one ZIP — its PDFs of record, the summary, the
  accounting entries, the clients and the catalogue — kept in the Chest's
  files with its SHA-256 (cut into parts under 14 MiB when a month is
  big). The export page lists the archives; the desk of whoever exports
  asks to **keep a copy outside the Chest** until one of them downloaded
  it (removing the tool deletes its files too).

## Roles

| Role | May |
|---|---|
| `admin` (Administrator) | Everything, and the company's legal details and defaults |
| `billing` (Billing) | Clients, catalogue, quotes, invoice drafts; **finalises** invoices and credit notes, sends them, records payments, reminds, exports |
| `sales` (Sales) | Clients, catalogue, quotes from start to finish, invoice drafts (from a quote or blank), handed to billing |
| `viewer` (Viewer) | Reads everything, downloads PDFs, exports (the accountant's seat) |

**Why a billing role, not "sales finalise" nor "admin only"**: a finalised
number can never be taken back — only a credit note corrects it — so only
the few people who answer for the company's books issue invoices, as in any
small company where the office manager, not each salesperson, sends them;
and that person is rarely the one who manages the company's legal settings.

## First minute

- **What a new user sees first**: the *Desk* — three figures (quotes waiting
  for an answer, money to collect, overdue), what needs them (a draft handed
  to them, an overdue invoice, a quote about to expire, an accepted quote to
  invoice), the latest documents. Empty, it speaks to the person's
  role: who writes gets "Write a quote" and "Import from your previous
  tool" (the note about continuing the numbering only for an
  administrator, who owns Settings); a viewer is told the team's
  documents will show here, with no action. If the company's legal
  details are missing, a callout says so first (not to a viewer) — for an
  administrator its "Fill them in" is then the only filled button.
- **The first thing they do**: "New quote" → the paper opens; "Choose the
  client" (or add one without leaving); "From the catalogue" adds a line;
  the totals follow each keystroke; it saves by itself.
- **Clicks for the main job**: a quote from the catalogue and sent by email:
  New quote, Choose the client, pick, From the catalogue, pick, Send the
  quote, Send — 7 clicks. Quote → invoice: The client accepted, Make the
  invoice, Make the invoice, then (billing) Finalise the invoice, Finalise
  as F-…, Send to the client, Send.
- **Mistakes**: every line removal, deleted draft, archived client or item,
  deleted payment and refused quote has *Undo* (the store's toast: it waits
  while pointed at or focused, Ctrl+Z works, and nothing that already left
  — an email, a bell item — ever offers it); drafts are never lost
  (autosave, and the browser warns before leaving unsaved changes). The one
  step that cannot be undone — finalising — asks in the page (never the
  browser's box), says so in plain words, shows the number it will take,
  and lists what is missing first. A dialog with something typed in it
  asks before throwing it away.

## Routes

| Route | What |
|---|---|
| `/` | Public host: "open the link from your email" (nothing is listed or linked there) |
| `/q/:secret` | Public: the client's page of a quote — read it, accept ("Bon pour accord") or decline |
| `/q/:secret/pdf` | Public: that quote's PDF (the one answered on, once answered; `?version=n` an earlier version). Kept in memory by its SHA-256 (24 MiB at most), two downloads at a time for the whole public part, 60 an hour per link (429 past it). Two limits to know: the client page's **first** visit draws the PDF it shows (to fingerprint it) outside the two-at-a-time bound — once per link and version, under the link's row lock —, and a PDF over 8 MiB is not kept in memory (drawn or read again at each download) |
| `/lang/:code` | Public: the visitor's language switch (a cookie; the package's route) |
| `/chest` | The desk |
| `/chest/quotes`, `/chest/invoices` | Lists with state filters and search (`?state=`, `?q=`), 200 rows a page (`?page=`); they read again by themselves while their reader is there (a 304 when nothing changed) |
| `/chest/documents/:id` | The paper (editable while a draft, or a sent quote) and its margin |
| `/chest/documents/:id/pdf` | The PDF (`?download` to save it) |
| `/chest/documents/:id/answers/:answer` | The exact PDF a client answered on (the proof) |
| `/chest/clients`, `/chest/clients/:id` | Clients (200 a page, `?page=`); one client's card and documents |
| `/chest/catalogue` | The catalogue (200 a page, `?page=`) |
| `/chest/export`, `/chest/export/csv`, `/chest/export/journal`, `/chest/export/zip` | The accountant's export (`?from=&to=`): summary, accounting entries, everything |
| `/chest/export/lists/clients`, `/chest/export/lists/items` | The clients, the catalogue (CSV, the importer's columns) |
| `/chest/import?kind=clients\|items\|invoices` | Import a spreadsheet |
| `/chest/bank` | Match a bank statement to the invoices still to collect |
| `/chest/documents/:id/versions/:n` | The PDF of a quote's earlier version, as it was sent |
| `/chest/terms` | The terms and conditions of sale (their upload is authorised by the action `grantTerms`) |
| `/q/:secret/terms` | Public: the terms and conditions of sale, for the link's holder (bounded as the PDF) |
| `/chest/export/archives/:period` | A month's archive (`?part=`) |
| `/chest/settings` | The company's details (admin; read only for others) |
| `/chest/logo` | The logo through a fresh signed link (its upload is authorised by the action `grantLogo`) |
| `/chest/actions/:name`, `/actions/answerQuote` | The members' actions (islands, forms), the one public action (the package's routes) |
| `/chest-events` | Members' lifecycle, Clients' and Timesheets' events (Chest only, signed) |
| `/chest-schedules` | The schedules `badges` (06:50: the badges again), `followup` (07:10: recurring drafts, automatic reminders, a missed monthly archive) and `archive` (04:30 on the 1st: the monthly archive) — Chest only, signed |
| `/assets/…` | The built browser files, the fonts, the icon (`build.static`) |

## Looks

The tool wears whatever look the company chose in its Chest, with the same
features: its own identity, **Letterpress** (crisp paper, blue-black ink,
an oxblood seal, a Caslon — `src/theme.ts`), any theme of the store's
catalogue (the 17 identities, "Chest", "High contrast"), or the company's
own brand imported from its guidelines — for all its tools or for this one.
The look is resolved on the server (`chest.theme()` → `resolveTheme`,
`src/theme.ts`) and served as the page's stylesheet (the package's `look`:
no inline style, no script, no flash). In
brand mode the company's logo stands where the tool's mark does. Every
look keeps every text readable (WCAG AA, light and dark: the kit checks
each theme; `lab/chest-dev/audit.mjs` checks the pages).

**The client's page wears the company's brand, or the tool's own look** —
never a catalogue theme chosen for the team, never the Chest's sheet (kit
0.2.3, `publicLook()`, surface "public").

**The PDF does not change with the look.** A quote or an invoice is a
legal document: the PDF (PDF/A-3, Factur-X, its own writer and embedded
Liberation fonts) keeps its neutral print design — black on white — in
every look (a test holds `src/pdf/` away from the theme). The paper on
screen is the look's; the paper that leaves is always the same.

The screens are built from the store's UI kit (`@argentic/chest-ui`,
vendored in `vendor/`): the shell with its labelled sections (on a phone
a row of five labelled tabs under the header; export and settings in
"More"), toasts, dialogs and the confirmation, date fields typed in the
member's language, the file picker, the tables, filters and search box,
empty states and state badges (drawn as the tool's rubber stamps).

## On a Chest

`chest.json` (contract 0.4): `"public": true` (the client's pages: the
package's strict policy — no inline script or style —, framed by nobody,
`no-store` and `noindex`); `build.static` `["/assets/"]`;
capabilities `database`, `files` (the logo, the terms and conditions, the
PDFs kept, the PDFs answered on and of earlier versions, the monthly
archives),
`members` (names of who did what), `notifications` (billing told of drafts
handed to them; a badge counting those drafts and the overdue invoices);
receives `member.*`; `network`: `recherche-entreprises.api.gouv.fr` only
(filling a client from its SIREN); `schedules`: `badges` (06:50 every
day, sets the badge again — an invoice becomes overdue by the date alone),
`followup` (07:10 every day: the recurring invoices' drafts, and the
reminders if an administrator turned them on — the only emails a schedule
sends — and a monthly archive missed) and `archive` (04:30 on the 1st).
`chest.proposals.json`: `mail.send`, the events between tools, French
title and role labels. A Chest that has not run the follow-up by the first
visit of the desk that day has it run then (`followed_up_on`).

Its process: Hono serving React rendered on the server, with islands
hydrated in the browser (built by Vite), on the package
`@argentic/chest-app` (vendored). At rest, nothing runs: no timer, no
polling of its own — the desk and the lists read again only while their
reader is active (the package's `useAutoRefresh`), so the Chest can put
the tool to sleep; what a request keeps in memory (the public PDFs by
their fingerprint) is lost then, and made again.

Lifecycle: losing access or leaving changes nothing (documents are the
company's records; pages name the author "Name (former member)"). An
erasure replaces the person's id by `erased` everywhere — creator, sender,
decision, finaliser, payments, clients, items, settings — the documents
themselves stay (a legal record; GDPR art. 17(3)(b)), then the erasure is
acknowledged.

Dates are the Chest's (`chest.today()`, its time zone; the database's
sessions are in it too, so the sample data's `current_date` is the same
day); the currency of new documents is the Chest's (`chest.currency`); the
default language of new documents without a client is the Chest's
(`chest.language`). Documents print the legal name the admin entered in
Settings; pages and emails use the trade name, else the legal name, and
only before Settings are filled in the Chest's organization name
(`chest.organization.name`, `goesBy` in `src/lib/company.ts`).

## Legal (France) — what the tool does, and does not

- **E-invoicing reform.** From 1 September 2026 (large and mid-size
  companies) and 1 September 2027 (SMEs and micro-companies), domestic B2B
  invoices must be structured e-invoices (Factur-X, UBL or CII) transmitted
  through the company's approved platform (*plateforme agréée*, PA); every
  company must be able to receive them from 1 September 2026. **This tool is
  not a PA** and never presents itself as one: it produces the invoice as a
  Factur-X; **it transmits nothing, and receives nothing. Keep your PA**
  (the tile, the settings page and this README say so): give it the
  Factur-X PDFs from here (download, or the period's ZIP), it transmits
  them, reports their statuses, and receives your suppliers' invoices.
  Sending to the PA from here needs an SDK primitive (see "Needs from the
  SDK").
- **Retention.** Invoices must be kept 10 years (Code de commerce L123-22).
  Finalised invoices and credit notes are never deleted by the tool — but
  **removing the tool from the Chest deletes its database and files**,
  the monthly archives included. The desk, the export page and the
  settings say so: download each month's archive and keep it with the
  accounts.
- **Accepting a quote online** records a consent (name typed, "Bon pour
  accord", the date, the time, a hash of the connection, the exact PDF's
  SHA-256) — enough in most B2B practice to show a quote was accepted, but
  **not an electronic signature in the eIDAS sense** (no identity
  verified, no certificate). A company that needs a qualified signature
  uses a signing service. Studio's reading, not a lawyer's.
- **Not a cash register.** Payments are recorded for follow-up. For invoices
  to individuals the payment dialog says it is informational: the tool is
  not a certified cash system (art. 286 I 3° bis CGI) — this reading is the
  studio's research, to be confirmed by a tax adviser.
- **Not verified with a lawyer or an accountant**: the exact wording of the
  reverse-charge mention (we print art. 283-2 CGI and art. 196 of Directive
  2006/112/EC; exports of goods and intra-EU supplies of goods have other
  wordings, not offered), whether the €40 indemnity should be omitted for
  individuals (we omit it), the penalty default wording, the date rule (a
  document is dated the day it is numbered; back-dating is impossible by
  design). The fictitious SIREN/VAT numbers of the sample data are valid by
  their keys only.

## Factur-X

Every issued invoice (380), deposit invoice (386) and credit note (381) is
a Factur-X 1.0, conformance level **EN 16931**: a PDF/A-3B (fonts embedded,
sRGB output intent, XMP with the Factur-X extension schema) carrying
`factur-x.xml` (CII D16B, `AFRelationship /Alternative`). It is the PDF of
record, stored once with its SHA-256 (`documents.pdf_format = 'factur-x'`);
documents issued before this version keep their plain PDF of record.
`src/lib/einvoice.ts` says what goes where: the French mandatory notes (PMT,
PMD, AAB), the billing framework BT-23 (B1/S1/M1, B4/S4/M4 after
deposits), SIREN (0002), SIRET (0009), the directory addresses (0225,
the SIREN), VAT categories S / E (0 %, franchise `VATEX-FR-FRANCHISE`) /
AE (`VATEX-EU-AE`, `VATEX-FR-AE`), negative prices as negative quantities,
discounts as price allowances, VAT on debits as due-date code 5.

**Verified** (2026-09-29, studio machine): sample invoices, deposit
invoices, credit notes, reverse charge (EU and France), franchise and
individual buyers, and the harness's own issued invoices were validated by
Mustang-CLI 2.26.0: **PDF/A-3b compliant (veraPDF, 0 failed of 3,200–4,000
checks)**, **valid against the Factur-X 1.09.2 EN 16931 XSD and
schematron**, and **no error from the French CTC schematron "BR-FR Flux 2"
V1.3.0**. The only remarks were German XRechnung notices (not applicable)
and, for an individual buyer (B2C, outside the e-invoicing flow), the
French warnings "PMT missing" and "BT-49 missing" — the €40 indemnity does
not apply to consumers and they have no directory address. The XSD check
runs in the tests when `FACTURX_XSD` points to the schema.
**Currencies.** The Chest's currency is the documents' (`chest.currency`).
In euros, everything above. **Another currency of two or no decimals**
(USD, CHF, GBP, JPY…): the member gives the exchange rate on the paper
("Exchange rate, 1 € = 1.0823 USD", as the ECB publishes it) before
finalising; the PDF states the VAT in euros at that rate and the Factur-X
carries it (BT-6 `TaxCurrencyCode` EUR, BT-111 the VAT total in euros:
BR-FR-CO-12); a credit note keeps its invoice's rate. This follows art. 230
of the VAT Directive (2006/112/EC: the VAT amount in the national currency)
— the studio's reading, not checked with an accountant, and which rate the
law wants (the ECB's of the day the VAT became chargeable, or the bank's)
is the company's to choose; checked here: the XSD (USD and JPY samples),
not Mustang-CLI's schematrons. **A currency of three decimals** (KWD, BHD,
TND…): EN 16931 writes at most two decimals (BR-DEC-*), so such an invoice
is issued as a PDF/A **without** the Factur-X data (`pdf_format = 'pdf'`,
the page does not call it a Factur-X): the e-invoicing reform cannot be
met in that currency here. Invoices issued outside the euro before this
version (no rate) keep a plain PDF.

**The XSD check, with the schema fetched at test time**:
`npm run test:facturx` downloads the `factur-x` 7.3 wheel from PyPI
(BSD licence; pinned by SHA-256, `scripts/facturx-xsd.mjs`), unpacks its
Factur-X EN 16931 XSD into `node_modules/.cache/facturx-xsd/` (never
committed), and runs the tests with `FACTURX_XSD` set (needs network once,
`unzip` and `xmllint`). A CI job runs that command; the studio has no CI
of its own yet, so it is run by hand before a release.

**Not verified**: acceptance by a real PA (none reachable from the
studio); the choice of E for a 0 % line in the standard regime (the tool
does not ask which exemption applies: ask the accountant); SIREN as the
tax registration (FC) of a franchise company without a VAT number (EN
16931 BR-E-02 requires one); the Factur-X specification's own text
(fnfe-mpe.org could not be reached; its rules were read from the official
schemas and schematrons).

## Needs from the SDK

Built on SDK 0.4.1-studio.4 (contract 0.4 + studio proposals) and the package `@argentic/chest-app` 0.1.0-studio.6, in `vendor/`.

- **mail** (studio proposal, `chest.proposals.json` `mail.send`): send the
  quote, invoice, credit note or reminder with its PDF attached. Call site:
  `src/lib/sending.ts` only. On a Chest without mail (`CapabilityNotGranted`)
  nothing is sent, the tool remembers it (`company.mail_works`) and offers
  "Download the PDF" + "Mark as sent". Before offering, it asks the Chest
  (`mail.available()`, studio.16; `src/lib/mailing.ts`): the send dialog opens
  on "Send it yourself" and says why (not connected, paused, the day's
  emails used) when the Chest would not send; Settings says the same under
  "Email the client"; the morning's reminders go to the bell alone when the
  Chest has no mail or it is not connected. When the Chest does not
  answer, what the last send taught. A quote or an invoice a member
  sends by hand is `transactional` (studio.15): it arrives even when the
  addressee is a member who chose no email from the tools; the automatic
  reminders honour that choice (`mailPreference` in the members API, applied by
  `mail.send`). An automatic reminder's key carries its recipient
  (`reminder-<invoice>-<step>-<address>`): after a restore, an invoice id
  may name another invoice.
- **schedules** (contract 0.4, `chest.json`): `badges`, `followup`,
  `archive`. Badges are also set after each change, and the follow-up
  runs at the first desk visit of a day it has not run.
- **chest**: `today()`, `timeZone`, `language`, `organization.name`
  (SDK 0.3.0); `currency`, `publicUrl`, `toolLink` (studio proposals).
- **Events between tools** (studio proposal, `chest.proposals.json`
  `receives`): `crm.deal.won`, `crm.deal.reopened` from Clients,
  `timesheets.billable`, `timesheets.billable_cancelled` from Timesheets;
  `emits` `quotes.invoiced` — see "With the other tools". `chest.toolLink`
  for the link back to Timesheets (studio proposal, vendored). A
  `quotes.invoiced` the Chest refuses when the invoice is issued is
  published by the next morning's follow-up, once (its key
  `quotes:invoiced:<handoff>`), with `occurredAt` the time the invoice was
  issued (studio.16) when that is less than 24 hours back (five minutes of
  margin); older, without it — the Chest then stamps the publish.
- **Sending to the company's PA — not built, needs the SDK.** The
  Factur-X is ready; transmitting it needs a primitive the Chest does not
  have: *declared outbound HTTPS to a partner, with a per-company secret the
  tool never reads*. Proposed shape (for the SDK report):
  `chest.json` `"partners": [{"name": "pa", "kinds": ["einvoicing"]}]`
  (the owner picks which PA and pastes its credentials in the Chest; the
  approval sentence "Sends your invoices to your approved platform and
  reads their statuses"); `import * as partners from
  "@argentic/chest-sdk/partners"`: `partners.send("pa", { kind:
  "einvoice.submit", file: {name, type, content}, key })` → `{id, status}`
  (AFNOR XP Z12-013 "flux 1/2" under the hood, done by the Chest's
  connector), `partners.status("pa", id)`, and status events delivered to
  `POST /chest-events` (`partner.einvoice.status`: déposée, rejetée,
  refusée, encaissée…); `CapabilityNotGranted` until configured. The tool
  side would be one module (`src/lib/transmit.ts`) called after finalising,
  plus a status on the invoice page. Not built as a fake: until then,
  "keep your PA".
- **visitors** (studio proposal) for the public answer form: the signed
  "shown at" token (`formToken`/`checkForm`: a form sent within 3 s is
  refused as a robot's), the Chest's counting (`count`, 20 answers an hour
  per visitor; a Chest that cannot count yet is tolerated — each link
  answers once), and `visitor()` (the hash of the address kept as proof).
  The form's token and its bounds are now the package's `publicAction`
  with `bound` (`formSeconds` 3; per link: 20 accepts and 20 declines,
  per visitor 20, 600 a day for the whole public part), never a call to
  the Chest per public request. Call site: `src/actions.ts`
  (`answerQuote`). And `chest.tool.publicUrl` for every link's
  address — the company's own domain once connected — in emails and on the
  team's pages (`src/lib/public-origin.ts`; never the request's host). Without **mail** on a real Chest, the member copies the
  link from the quote's margin into their own email.
- **Declared network** (`chest.json` `network`, in the Chest today, not a
  proposal): the public directory of companies, called with plain
  `fetch()` through the Chest's egress proxy (`src/lib/registry.ts`; Node
  follows it with `NODE_USE_ENV_PROXY`). The tests answer the host with the
  SDK's `fakeChest({ network })` (studio.15): a successful lookup, a
  refusal by the egress, every honest failure (`test/registry.test.ts`).
  The studio's harness runs the tool in its own process, which the fake
  egress does not reach: in the flow the lookup says "could not be
  reached" (nothing invented), and the success is shown by the tests only.
- **Guest accounts** (for the external accountant): not in the Chest;
  until then the accountant gets the period's ZIP.

## With the other tools

**Clients (CRM) → Quotes** (Proposal (studio): events between tools, once an
admin linked the two tools in the Chest). Quotes receives:

- `crm.deal.won` `{ deal, title, amount (cents) | null, currency, company:
  { ref, name, address, postcode, city, country, siren, vat, email } | null,
  contact: { name, email } | null, owner: "mbr_…" | null }` — a **draft
  quote** titled like the deal, with one line of the amount (a price of 0
  when there is none, or when the currency is not the Chest's) at 20 % VAT,
  for the deal's client; owned by the deal's owner if they may write quotes
  here (their Quotes role, asked of the Chest), otherwise by the tool; the
  owner — or else everyone with the `sales` role — told in the bell. The
  quote's margin and history say "From Clients: <deal title>", and it waits
  on the desk. **Once per deal**: a second delivery (or a second "won")
  never makes a second quote (a unique index on the deal's reference).
- `crm.deal.reopened` `{ deal }` — the draft is deleted if nobody touched it
  (never saved since it was made, never sent), and its bell item withdrawn;
  otherwise the quote stays and its history says the deal was reopened.
  Won again later, an untouched-and-deleted deal makes a new draft.

**The client**: found by the CRM's reference (`clients.external_ref` =
`crm:<ref>`), else by SIREN (and then linked), else created from the
company (or, with no company, from the contact, as an individual). **Rule:
Clients only fills what is empty in Quotes.** A field a person wrote here
is never overwritten — this card prints on legal documents, and someone may
have corrected it on purpose. Every field is checked (SIREN and VAT keys,
email, country); an invalid value is dropped, an event of another shape is
accepted and ignored. Nothing is invented: what Clients does not send stays
empty (today it sends the company's name and its address as free text, and
the contact) — the client card then asks for the city before an invoice.
The country is the card's own default (France), as for a client added by
hand. Code: `src/lib/crm.ts`, `src/lib/deliveries.ts`;
tests: `test/crm.test.ts` (`chest.deliver`).

**Timesheets → Quotes → Timesheets** (Proposal (studio): events between
tools; `chest.proposals.json` `receives` `timesheets.billable`,
`timesheets.billable_cancelled`, `emits` `quotes.invoiced`). Contract:
Timesheets' README, "With the other tools" (version 1).

- `timesheets.billable {version: 1, handoff, project, client, period,
  currency, lines[], source}` — **one draft invoice per `handoff`**, for
  ever (the `handoffs` table keeps each id: a second delivery, even after
  the draft was dropped, changes nothing). The client is the one whose name
  is Timesheets' (accents, case, spaces and punctuation aside: an indexed key, migration `0015_client_name_key.sql`), when exactly one
  matches; otherwise none, and the invoice's margin says which name
  Timesheets gave ("choose it on the invoice"). One line per `lines[]`
  item: its label, `minutes / 60` **hours** (unit "heure"/"hour"), the
  hourly `rate` as unit price (0 when none, or when the currency is not the
  Chest's), at the standard 20 % VAT (the company's exemption or the
  client's reverse charge apply as on any invoice; Timesheets sends no VAT
  rate). Titled "<project>, du <from> au <to>", created by "Timesheets",
  **handed to billing** (bell, desk "Ready to finalise — prepared by
  Timesheets"), and linked back to the project with
  `chest.toolLink("timesheets", source.path)` ("Open in Timesheets"; no
  link when Timesheets is not installed or the path is not under `/chest`).
- **Rounding, the two sides.** Timesheets freezes the rates at hand-off
  and counts `amount` as each entry's minutes × rate ÷ 60 **rounded to the
  cent, then added**. Quotes writes each line as its hours **to the
  thousandth** (`round(minutes × 1000 / 60)`) × the hourly rate, the line's
  net rounded once to the cent (half away from zero, `src/shared/totals.ts`),
  because an invoice line's net must be its quantity × its price (EN 16931,
  checked by Factur-X). The two can differ by a few cents: 50 minutes at
  90.00 an hour are 75.00 for Timesheets, 0.833 h × 90.00 = 74.97 on the
  invoice. Quotes does not force the invoice to Timesheets' figure; it
  keeps Timesheets' `amount` (when in the Chest's currency) and, when the
  invoice's total excluding VAT differs, the draft's margin says both, as a
  caution ("Timesheets says €75.00; this invoice says €74.97 (€0.03 of
  rounding). Adjust a line if you want them equal.").
  They agree whenever each entry's amount is a whole number of cents and
  each line's minutes make hours to the thousandth (e.g. rates in whole
  units of currency and entries in quarters of an hour).
- `timesheets.billable_cancelled {version: 1, handoff}` — the draft is
  deleted if it was not issued; an issued invoice is **kept** (a legal
  record) and billing hear it in the bell ("make a credit note if it
  should not stand").
- When billing **finalises** such an invoice, Quotes publishes
  `quotes.invoiced {handoff, invoice: "F-2026-0008", path:
  "/chest/documents/<id>", by: "mbr_…"}` with the key
  `quotes:invoiced:<handoff>`, once; a Chest that cannot publish at that
  moment is tried again by the daily follow-up.
- Untrusted data: version 1 only; `handoff` 1–18 digits; names and labels
  cleaned and bounded; 1 to 300 lines; minutes and rates whole, bounded,
  never negative; a day `YYYY-MM-DD`; the path a `/chest…` path of 300
  characters at most. Anything else is accepted and ignored.
  Code: `src/lib/timesheets.ts`, `src/lib/deliveries.ts` (`/chest-events`),
  migrations `0009_timesheets.sql`, `0012_handoff_amount.sql`; tests:
  `test/timesheets.test.ts`.

## Develop

```sh
npm ci
npm run dev                                              # Vite + the server, reloaded on change (needs the Chest's variables: use the harness)
npm test                                                 # tsc, the server built to dist/test, then node --test (PGlite)
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # real PostgreSQL (the concurrency test runs truly in parallel)
npm run build                                            # tsc, the browser files (dist/client), the server (dist/server)
npm start                                                # node dist/server/main.js
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 5700   # from the studio: the harness with the sample company
node ../../../lab/chest-dev/flows/quotes.mjs 5700                  # the browser flow
```

`seed/sample.sql` fills "Atelier Martin SARL", a Lyon design studio: 6
clients, 12 items, 8 quotes in every state, 7 invoices (paid, partly paid,
overdue, unpaid, a draft handed to billing), 1 credit note. Quote D-…-0006 has a client's
answer link with a fixed secret (`/q/SampleAnswerLinkQuoteD0006Roux01`)
for the screenshots and the flows.
`test/fixtures/` holds clients and catalogue exports in the style of
Axonaut, Sellsy and Pennylane (see THIRD_PARTY.md for what could be
verified of their formats).

## What it does not do (yet)

- **Transmit e-invoices to a PA, or receive supplier invoices** (needs the
  SDK "partners" primitive above): keep your PA. No UBL output (Factur-X
  only).
- **Payment in the tool** (card, SEPA): a static payment link is printed
  instead.
- **An electronic signature** (eIDAS): the online acceptance is a record
  of agreement, not a signature; the client gets no email of their answer
  (the page offers the PDF they accepted).
- **Past paid invoices** are not imported (only those still to collect);
  an imported invoice has no PDF here (it stays in the previous tool). The
  export formats of Axonaut, Sellsy and Pennylane for unpaid invoices could
  not be verified (THIRD_PARTY.md): the importer matches usual headers and
  lets the person match the rest.
- The link with the Clients tool is one way (a won deal makes a quote);
  a client's card edited in Clients does not update here.
- Reminder emails use the standard text (in the client's language); their
  words are not editable per company.
- A 0 % line is sent in the Factur-X as "exempt" (E) without the precise
  exemption; debits/disbursements outside the scope of VAT are not handled.
- Bank: no connection to the bank (a file the person exports); CAMT.053
  and OFX files are not read; a payment covering several invoices is
  recorded on one (split it by hand); card and SEPA collection are not in
  the tool.
- Revenue: no chart over the months, no export of it (the accountant's
  export has the figures); imported invoices are not counted.
- A quote's variants or optional lines ("option : pose +200 €"), and
  knowing whether the client opened the quote: not built.
- The client's page speaks the visitor's browser language, not the
  document's (the switch is one tap).
- Multi-currency within one company; purchase invoices; full bookkeeping
  (the entries are a sales journal, not a whole FEC); other VAT rates than 20/10/5.5/2.1/0 % (Corsica, overseas);
  situation invoices and retention money (*factures de situation*,
  *retenue de garantie*): **not for construction firms billing by
  progress**.
- An archive **outside** the Chest: the monthly archive is kept in the
  tool's own files, deleted with the tool — someone must download it (the
  desk asks). Its scheduled delivery by email to the accountant needs
  `mail` + a guest seat (not built).
