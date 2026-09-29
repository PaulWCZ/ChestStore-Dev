# Adapting Quotes & invoices — a guide for AI agents

Read `README.md` first (what it does, the legal line). This tool issues
legal documents: a change that breaks numbering, freezing or mentions is a
legal defect for the company using it.

## Map

- `lib/access.ts` — roles and abilities, the only place rights are decided.
- `lib/model.ts` — bounds, identifiers (SIREN/SIRET Luhn, VAT keys, IBAN),
  dates, numbering format. Pure.
- `lib/money.ts`, `lib/totals.ts` — money in cents, parsing, **the rounding
  rule** (per line, then per rate). Browser-safe: the editor uses the same code.
- `lib/documents.ts` — quotes, invoices, credit notes: drafts, numbering
  (`nextNumber`, counter row lock), `finalise`, deposits and balances,
  states. `lib/payments.ts`, `lib/clients.ts`, `lib/items.ts`, `lib/company.ts`.
- `lib/pdf/` — `writer.ts` (the PDF/A-3 writer: embedded fonts, sRGB
  output intent, XMP, the attached factur-x.xml), `document.ts` (the layout
  and mandatory mentions), `truetype.ts` (TrueType reader and subsetter),
  `fonts.ts` + `fonts/` (the Liberation fonts, OFL), `icc.ts` (the sRGB
  profile), `image.ts` (logo), `metrics.ts` (font names, WinAnsi).
- `lib/einvoice.ts` — the Factur-X data (CII, EN 16931). Any change: run
  the tests with `FACTURX_XSD`, and validate a PDF with Mustang-CLI
  (`--action validate`): PDF/A, EN 16931 and BR-FR schematrons.
- `lib/numbering.ts` — the numbering format and continuing a sequence
  (forward only, before the first number, logged).
- `lib/units.ts` — units in the plural; UN/ECE codes.
- `lib/parse-import.ts` (browser-safe: headers, values) and
  `lib/importers.ts` (server: checks, savepoints) — the CSV import.
- `lib/journal.ts` — the accounting entries (FEC columns).
- `lib/reminders.ts`, `lib/repeats.ts`, `lib/followup.ts` — what runs each
  morning (schedule `followup`, or the first desk visit of the day).
- `lib/archive.ts` — the PDF of record, kept in the Chest's files.
- `lib/sending.ts` — the only call site of the mail proposal.
- `lib/export.ts` — CSV and ZIP for the accountant.
- `lib/lifecycle.ts`, `lib/tell.ts`, `lib/notify.ts`, `lib/people.ts` — the Chest glue.
- `migrations/0001_quotes.sql` — the schema **and the freezing triggers**;
  `0003_continue.sql` redefines `frozen_document()` (adds `pdf_format`).
- `app/chest/actions.ts` — thin server actions; `app/chest/**` pages and
  views; `app/chest/documents/[id]/paper.tsx` — the paper editor.
- `lib/i18n/en.ts`, `fr.ts` — every word, including the PDF's and emails'.

## Commands

`npm test` (PGlite), `TEST_DATABASE_URL=… npm test` (PostgreSQL — run it for
anything touching numbering), `npm run build`, the studio's
`lab/chest-dev/flows/quotes.mjs` against the harness.

## Rules

- Never edit a shipped migration. Never weaken `frozen_document()` /
  `frozen_lines()`; a new column of `documents` is frozen automatically —
  add it to the `mutable` list only if it records something that happens
  *after* issuing (like `sent_at`), in a new migration.
- Numbers are only given by `nextNumber` inside the transaction that
  numbers the document, with the document's row locked first. Never compute
  a number outside it, never let the user choose the date of an invoice.
  A counter is only ever moved by `continueSequence` (forward, before the
  sequence's first number, logged).
- An issued invoice's PDF is its Factur-X: never drop the attachment or
  the PDF/A parts; a font used in a PDF must be embedded.
- Money is integers of cents. Use `lib/totals.ts`; never round twice.
- A new mandatory mention goes into `lib/pdf/document.ts` **and** the paper
  (`paper.tsx`), with its words in both catalogues and a test in
  `test/pdf.test.ts` that reads it back from the PDF bytes.
- Identity only from `member(request)`; store `mbr_…` ids; rights in
  `lib/access.ts` with a test per role.
- Words only in `lib/i18n/*` (the tests look for words in `.tsx` files).
