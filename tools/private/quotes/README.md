# Quotes & invoices — a proper quote, then the invoice

*Devis et factures.* A store tool for a Chest: a small French company writes
a quote from its catalogue, sends it, turns it into an invoice when the
client says yes, finalises the invoice with the next legal number, sends it,
records the payments, reminds the late payers, and hands its accountant a
clean export. It replaces the invoicing part of Axonaut, Sellsy, Henrri,
Tiime or Pennylane's invoicing module.

## What it does

- **The company's legal details**, once (admin): legal name and form, share
  capital, address, SIREN, SIRET, RCS city, VAT number, VAT regime (including
  the *franchise en base* — "TVA non applicable, art. 293 B du CGI"), VAT on
  debits, logo (stored in the Chest's files), bank and IBAN/BIC, payment
  terms, late-payment penalty rate (empty: the legal ECB + 10 points), early
  discount, footer, numbering prefixes. What is missing is listed on the desk
  and blocks sending — the documents would lack mandatory mentions.
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
  refused; a sent quote past its date reads *expired*. Duplicate. A sent
  quote may still be corrected (quotes are not regulated documents).
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
  (`A-2026-0001`), never more than what remains of the invoice.
- **Totals**, in integer cents: each line rounded once (half away from
  zero), summed per VAT rate, VAT computed once per rate, totals added —
  the rule is written and tested in `lib/totals.ts` (it is also what the
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
  "Draft" mark on every page.
- **Sending** by email with the PDF attached, in the client's language, the
  words changeable, through the Chest's mail (a studio proposal). Where the
  Chest cannot send email, the tool says so: download the PDF, send it
  yourself, mark it as sent.
- **Payments**: date, amount, method, reference; partial payments; states
  *unpaid*, *partly paid*, *paid*, *overdue* (by the Chest's today),
  *cancelled* (credited in full). Reminders are a button (email with the
  PDF, or recorded by hand) — nothing is sent automatically.
- **Export for the accountant**: the invoices and credit notes of a period as
  a CSV (in French: ";" and decimal commas; journal, date, number, client,
  excl. VAT and VAT for each rate, totals, due date, corrected invoice,
  state) and a ZIP of their PDFs with the same CSV.

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
  invoice), the latest documents. Empty, it says what the tool is for and
  offers "Write a quote". If the company's legal details are missing, a
  callout says so first (with a button for the admin).
- **The first thing they do**: "New quote" → the paper opens; "Choose the
  client" (or add one without leaving); "From the catalogue" adds a line;
  the totals follow each keystroke; it saves by itself.
- **Clicks for the main job**: a quote from the catalogue and sent by email:
  New quote, Choose the client, pick, From the catalogue, pick, Send the
  quote, Send — 7 clicks. Quote → invoice: The client accepted, Make the
  invoice, Make the invoice, then (billing) Finalise the invoice, Finalise
  as F-…, Send to the client, Send.
- **Mistakes**: every line removal, deleted draft, archived client or item,
  removed payment and refused quote has *Undo*; drafts are never lost
  (autosave, and the browser warns before leaving unsaved changes). The one
  step that cannot be undone — finalising — says so in plain words, shows
  the number it will take, and lists what is missing first.

## Routes

| Route | What |
|---|---|
| `/` | Public host: "this tool lives in your Chest" (no public part) |
| `/chest` | The desk |
| `/chest/quotes`, `/chest/invoices` | Lists with state filters and search (`?state=`, `?q=`) |
| `/chest/documents/:id` | The paper (editable while a draft, or a sent quote) and its margin |
| `/chest/documents/:id/pdf` | The PDF (`?download` to save it) |
| `/chest/clients`, `/chest/clients/:id` | Clients; one client's card and documents |
| `/chest/catalogue` | The catalogue |
| `/chest/export`, `/chest/export/csv`, `/chest/export/zip` | The accountant's export (`?from=&to=`) |
| `/chest/settings` | The company's details (admin; read only for others) |
| `/chest/api/logo`, `/chest/logo` | Authorise a logo upload; the logo through a fresh signed link |
| `/chest-events` | Members' lifecycle (Chest only) |
| `/chest-jobs/badges` | The morning badge refresh (proposal, Chest only) |

## On a Chest

`chest.json`: capabilities `database`, `files` (the logo, the PDFs kept),
`members` (names of who did what), `notifications` (billing told of drafts
handed to them; a badge counting those drafts and the overdue invoices);
receives `member.*`. `chest.proposals.json`: `mail.send`, the schedule
`badges` (06:50 every day, sets the badge again — an invoice becomes overdue
by the date alone; nothing is emailed by a schedule), French title and
role labels.

Lifecycle: losing access or leaving changes nothing (documents are the
company's records; pages name the author "Name (former member)"). An
erasure replaces the person's id by `erased` everywhere — creator, sender,
decision, finaliser, payments, clients, items, settings — the documents
themselves stay (a legal record; GDPR art. 17(3)(b)), then the erasure is
acknowledged.

Dates are the Chest's (`chest.today()`, its time zone); the currency of new
documents is the Chest's (`chest.currency()`); the default language of new
documents without a client is the Chest's (`chest.locale()`).

## Legal (France) — what the tool does, and does not

- **E-invoicing reform.** From 1 September 2026 (large and mid-size
  companies) and 1 September 2027 (SMEs and micro-companies), domestic B2B
  invoices must be structured e-invoices (Factur-X, UBL or CII) transmitted
  through the company's approved platform (*plateforme agréée*, PA); every
  company must be able to receive them from 1 September 2026. **This tool is
  not a PA** and never presents itself as one: it produces the invoice, its
  PDF and its data; it transmits nothing. It does **not** produce Factur-X
  yet: after its issuing date, a company must issue its B2B invoices on its
  PA (the settings page says so). A PDF from this tool remains a valid
  invoice until then, and for sales outside the reform's scope.
- **Retention.** Invoices must be kept 10 years (Code de commerce L123-22).
  Finalised invoices and credit notes are never deleted by the tool — but
  **removing the tool from the Chest deletes its database and files**. The
  export page and the settings say so: export each period and keep the ZIP.
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

## Needs from the SDK

- **mail** (studio proposal, `chest.proposals.json` `mail.send`): send the
  quote, invoice, credit note or reminder with its PDF attached. Call site:
  `lib/sending.ts` only. On a Chest without mail (`CapabilityNotGranted`)
  nothing is sent, the tool remembers it (`company.mail_works`) and offers
  "Download the PDF" + "Mark as sent".
- **schedules** (studio proposal): `badges`, daily. Without it, badges are
  set after each change and are only stale for invoices that became overdue
  overnight.
- **chest** (studio proposal): `today()`, `timeZone()`, `currency()`,
  `locale()`.
- **Events between tools** (studio proposal), the hook for **Clients (CRM)**:
  `clients.external_ref` is reserved for the CRM's reference of a company.
  The API we would want: the CRM declares `"emits": ["crm.company.saved",
  "crm.deal.won"]`; Quotes declares them in `receives` and, in
  `app/chest-events/route.ts`, `tools: { "crm.company.saved": e =>
  upsertFromCrm(e.data) /* by external_ref */, "crm.deal.won": e =>
  createDocument("quote", clientFromCrm(e.data.company)) }`. Not wired yet:
  the CRM does not publish these events.
- **Structured e-invoices** are the tool's own work to come (Factur-X
  EN 16931 from the same data), not the SDK's; sending them to a PA would
  need an SDK primitive for declared outbound network with per-company
  credentials (AFNOR XP Z12-013 API) — see the studio's SDK report.

## Develop

```sh
npm ci
npm test                                                 # PGlite
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # real PostgreSQL (the concurrency test runs truly in parallel)
npm run build
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 5700   # from the studio: the harness with the sample company
```

`seed/sample.sql` fills "Atelier Martin SARL", a Lyon design studio: 6
clients, 12 items, 8 quotes in every state, 7 invoices (paid, partly paid,
overdue, unpaid, a draft handed to billing), 1 credit note.

## What it does not do (yet)

Factur-X / UBL / CII files and sending to a PA; recurring invoices;
automatic reminders; online payment; the client accepting a quote online;
multi-currency within one company; purchase invoices; bookkeeping, FEC,
bank reconciliation; other VAT rates than 20/10/5.5/2.1/0 % (Corsica,
overseas); situation invoices (*factures de situation*); import from
Axonaut/Sellsy CSV.
