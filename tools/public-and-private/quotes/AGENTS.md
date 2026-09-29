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
- `lib/online.ts` — **the public part's core**: a sent quote's secret
  link (`quote_links`), the PDF the client is shown (kept, with its
  SHA-256), the client's answer with its proof (`quote_answers`); nothing
  opens without the secret. `app/q/[secret]/` (the client's page, its
  answer form, its PDF route), `app/public-actions.ts` (the only public
  action: the form guard and counting of the `visitors` proposal),
  `components/quote-sheet.tsx` (the quote as a page, read only),
  `components/public-shell.tsx`, `lib/public-origin.ts`.
- `lib/monthly.ts` — the monthly archive ZIP in the Chest's files (schedule
  `archive`, caught up by the follow-up), parts under 14 MiB, the desk's
  "keep a copy" until one is downloaded.
- Imported invoices (`status = 'imported'`, migration `0005_switching.sql`):
  `lib/importers.ts` (`importInvoice`, `undoImport`), `collectable()` in
  `lib/documents.ts`.
- `lib/sending.ts` — the only call site of the mail proposal; a quote's
  email opens with its answer line (`answerLine`) and carries the terms.
- `lib/versions.ts` — versions of a sent quote (`quote_versions`,
  migration `0006_versions.sql`): `reviseQuote`, `discardVersion`,
  `versionPdf`, `changesSince`/`diffLines` (what the client is told
  changed). A sent quote is **never** edited in place (`editable()` is
  drafts only); `versioned()` in `lib/model.ts` writes "D-… v2".
- `lib/terms.ts` — the terms and conditions of sale (migration
  `0007_terms.sql`); `app/chest/terms`, `app/q/[secret]/terms`.
- `lib/bank-parse.ts` (browser-safe) and `lib/bank.ts` — a bank
  statement matched to open invoices (migration `0008_bank.sql`:
  `payments.bank_line`); `app/chest/bank/`.
- `lib/revenue.ts` — the desk's revenue card (as the journal counts sales).
- `lib/registry.ts` — the public directory of companies, the tool's only
  declared network host (`chest.json` `network`); tests inject a fetcher.
- `lib/export.ts` — CSV and ZIP for the accountant.
- `lib/lifecycle.ts`, `lib/tell.ts`, `lib/notify.ts`, `lib/people.ts` — the Chest glue.
- `migrations/0001_quotes.sql` — the schema **and the freezing triggers**;
  `0003_continue.sql` redefines `frozen_document()` (adds `pdf_format`);
  `0004_online.sql` the answer links and answers; `0005_switching.sql`
  the imported series (its own unique index, no year nor seq) and
  `frozen_document()` again (an imported invoice is frozen too), the
  archives.
- `app/chest/actions.ts` — thin server actions; `app/chest/**` pages and
  views; `app/chest/documents/[id]/paper.tsx` — the paper editor.
- `lib/i18n/en.ts`, `fr.ts` — every word, including the PDF's and emails',
  and the UI kit's sections (`toast`, `dialog`, `date`, `files`, `table`,
  `filters`, `searchBox`).
- `lib/theme.ts` — the identity (Letterpress, the kit catalogue's theme)
  and `currentLook()`; `app/layout.tsx` writes it with the page's nonce;
  `app/tokens.css` holds only the tool's own tokens.
- `components/shell.tsx` (the kit's AppShell and "More" menu),
  `stamp.tsx` (StatusBadge as a stamp, through its `className`),
  `doc-table.tsx` (the kit's DataTable as the ledger: `rowHref` opens the
  document from anywhere in its row, `phone="stack"` makes cards on a
  phone — no hand-made phone columns), `list-page.tsx`; `mark.tsx` and `icons.tsx`
  are the tool's own drawings.

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
- Words only in `lib/i18n/*` (the tests look for words in `.tsx` files);
  `node scripts/lint-words.mjs tools/public-and-private/quotes` stays at 0 (the
  store's glossary: Undo « Annuler l’action », Delete « Supprimer »,
  narrow no-break spaces in French).
- The look: CSS names only contract tokens (`@argentic/chest-ui`,
  `tokens/CONTRACT.md`) and `app/tokens.css`; never a colour. Text only on
  measured pairs (`--accent-text` on `--bg`/`--surface`, a state's `-ink`
  on its soft ground). Use the kit's components (toast, Dialog/Confirm,
  DateField, FilePicker, DataTable, Filters, SearchBox, Tabs, EmptyState,
  StatusBadge, AppShell) before writing one; never `window.confirm`, never
  `<input type="date">`; a reversible act is a toast with `undo`, what
  already left (an email, a bell item) is `sent: true`.
- **Public words**: every catalogue word a public page shows with a
  `{placeholder}` goes through `format()`; `test/public-words.test.ts`
  scans the public files (list a new public page there).
- **The public part** (`/`, `/q/<secret>`) shows nothing without the
  secret, and nothing but the quote the secret opens; it never reads a
  member; its look is `publicLook()` (brand, else the tool's own — never a
  catalogue theme). An answer is refused unless the quote is still `sent`,
  valid, its link live, and the PDF fingerprint the form carries is the
  one kept for this version (`changed`). Never call it a signature: it is
  a record of agreement, not eIDAS.
- **Imported invoices** keep the previous tool's numbers in their own
  series: never give them a year or a `seq`, never number, finalise, draw
  a PDF of, credit or export them as this tool's sales; only payments and
  reminders.
- **The PDF never follows the look**: nothing in `lib/pdf/`,
  `lib/archive.ts` or `lib/einvoice.ts` reads the theme (tested). Legal
  documents keep their neutral print design.
