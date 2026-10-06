# Adapting Quotes & invoices — a guide for AI agents

Read `README.md` first (what it does, the legal line). This tool issues
legal documents: a change that breaks numbering, freezing or mentions is a
legal defect for the company using it.

## Map

The stack: Hono serving React rendered on the server, islands hydrated in
the browser, built by Vite, on the package `@argentic/chest-app`
(vendored: `createApp`, `page`/`publicPage`, `download`, `action`/
`publicAction` with `field.*` and `bound`, `Island`, `call`/`refresh`/
`navigate`/`toast`/`useAutoRefresh` from `/client`) and the SDK
`@argentic/chest-sdk` 0.4.1-studio.6. Never copy the package's code into
the tool.

- `src/main.ts` (the server), `src/app.tsx` (every route: the team's pages,
  its files, the public part, `/chest-events`, `/chest-schedules`),
  `src/register.ts` (actions, islands, words, layout), `src/entry.tsx` (the
  browser: styles, islands), `src/layout.tsx` (the team's shell, the public
  frame), `src/theme.ts` (Letterpress and the look's stylesheet),
  `src/styles.css`, `src/tokens.css` (only the tool's own tokens).
- `src/actions.ts` — **every action**, thin: fields checked at the
  boundary (`typed`, `amount` for money in the document's currency), then a
  `src/lib/` function that checks rights before writing. `answerQuote` is
  the only public action (`bound`: per link and per visitor).
- `src/pages/` — the pages (server only: read, then hand an island its
  props). Big lists go by pages (`src/components/pager.tsx`, 200 a page);
  the document's pickers search on the server (`findClients`,
  `findItems`): an island's props stay small (the package warns past
  256 KB).
- `src/islands/` — what runs in the browser (`index.ts` lists them);
  `document/` is the paper editor and its margin (`paper.tsx`,
  `DocumentView.tsx`, `dialogs.tsx`, the pickers). Islands import from
  `src/shared/`, `src/components/` and types only from `src/lib/`
  (`checkSources` refuses server code in the browser).
- `src/shared/` — browser-safe: `model.ts` (bounds, identifiers — SIREN/
  SIRET Luhn, VAT keys, IBAN —, dates, numbering format), `money.ts`,
  `totals.ts` (money in cents, parsing, **the rounding rule**: per line,
  then per rate — the editor uses the same code), `units.ts`, `parties.ts`,
  `fold.ts`, `csv.ts`, `parse-import.ts`, `bank-parse.ts`, `app-error.ts`.
- `src/i18n/` — `en.ts`, `fr.ts` (every word, the PDF's and emails' too,
  and the UI kit's under `kit`), `index.ts`, `format.ts` (**every** Intl
  object, made once and kept: `new Intl.` anywhere else fails a test).
- `src/lib/access.ts` — roles and abilities, the only place rights are decided.
- `src/lib/db.ts` — the tool's pool (int8 as numbers, dates as text, the
  Chest's zone) beside the package's (form tokens, bounds).
- `src/lib/documents.ts` — quotes, invoices, credit notes: drafts,
  numbering (`nextNumber`, counter row lock), `finalise`, deposits and
  balances, states. `payments.ts`, `clients.ts`, `items.ts`, `company.ts`.
- `src/pdf/` — `writer.ts` (the PDF/A-3 writer: embedded fonts, sRGB
  output intent, XMP, the attached factur-x.xml), `document.ts` (the layout
  and mandatory mentions), `truetype.ts` (TrueType reader and subsetter),
  `fonts.ts` + `fonts/` (the Liberation fonts, OFL), `icc.ts` (the sRGB
  profile), `image.ts` (logo), `metrics.ts` (font names, WinAnsi).
- `src/lib/einvoice.ts` — the Factur-X data (CII, EN 16931). Any change: run
  the tests with `FACTURX_XSD`, and validate a PDF with Mustang-CLI
  (`--action validate`): PDF/A, EN 16931 and BR-FR schematrons.
- `src/lib/numbering.ts` — the numbering format and continuing a sequence
  (forward only, before the first number, logged).
- `src/lib/importers.ts` (server: checks, savepoints) — the CSV import.
- `src/lib/journal.ts` — the accounting entries (FEC columns).
- `src/lib/reminders.ts`, `repeats.ts`, `followup.ts` — what runs each
  morning (schedule `followup`, or the first desk visit of the day).
- `src/lib/deliveries.ts` — `/chest-events` (members, Clients, Timesheets)
  and `/chest-schedules` (`badges`, `followup`, `archive`).
- `src/lib/archive.ts` — the PDF of record, kept in the Chest's files.
- `src/lib/online.ts` — **the public part's core**: a sent quote's secret
  link (`quote_links`), the PDF the client is shown (kept, with its
  SHA-256), the client's answer with its proof (`quote_answers`); nothing
  opens without the secret. `src/pages/Answer.tsx` (the client's page),
  `src/islands/AnswerForm.tsx` (its form, a plain POST without script),
  `src/pages/QuoteSheet.tsx` (the quote as a page, read only),
  `src/lib/downloads.ts` (the public files' bounds: 2 in flight, 60 an
  hour per link), `src/lib/kept.ts` (their bytes kept by fingerprint,
  24 MiB), `src/lib/public-origin.ts` (`chest.tool.publicUrl` only).
- `src/lib/monthly.ts` — the monthly archive ZIP in the Chest's files (schedule
  `archive`, caught up by the follow-up), parts under 14 MiB, the desk's
  "keep a copy" until one is downloaded.
- Imported invoices (`status = 'imported'`, migration `0005_switching.sql`):
  `src/lib/importers.ts` (`importInvoice`, `undoImport`), `collectable()` in
  `src/lib/documents.ts`.
- `src/lib/sending.ts` — the only call site of the mail proposal; a quote's
  email opens with its answer line (`answerLine`) and carries the terms.
- `src/lib/versions.ts` — versions of a sent quote (`quote_versions`,
  migration `0006_versions.sql`): `reviseQuote`, `discardVersion`,
  `versionPdf`, `changesSince`/`diffLines` (what the client is told
  changed). A sent quote is **never** edited in place (`editable()` is
  drafts only); `versioned()` in `src/shared/model.ts` writes "D-… v2".
- `src/lib/terms.ts` — the terms and conditions of sale (migration
  `0007_terms.sql`); routes `/chest/terms`, `/q/:secret/terms`.
- `src/lib/bank.ts` — a bank statement matched to open invoices (migration
  `0008_bank.sql`: `payments.bank_line`); `src/pages/Bank.tsx`.
- `src/lib/revenue.ts` — the desk's revenue card (as the journal counts sales).
- `src/lib/timesheets.ts` — Timesheets' hand-offs (`handoffs`, migrations
  `0009_timesheets.sql`, `0012_handoff_amount.sql`): one draft invoice per
  hand-off, cancel, `quotes.invoiced` published on finalise and retried by
  the follow-up; what Timesheets counted kept beside the invoice (the
  rounding of the two sides: README, "With the other tools").
- `src/lib/registry.ts` — the public directory of companies, the tool's only
  declared network host (`chest.json` `network`), plain `fetch`; tests
  answer it with `fakeChest({ network })`.
- `src/lib/stamp.ts` — the desk's and lists' version (a refresh with
  nothing new is a 304): the package's change stamp over
  `migrations/0016_chest_changes.sql` — a new table the lists read gets
  `select chest_watch('…')` in a new migration.
- `src/lib/export.ts` — CSV and ZIP for the accountant.
- `src/lib/lifecycle.ts`, `tell.ts`, `notify.ts`, `people.ts` — the Chest glue.
- `migrations/0001_quotes.sql` — the schema **and the freezing triggers**;
  `0003_continue.sql` redefines `frozen_document()` (adds `pdf_format`);
  `0004_online.sql` the answer links and answers; `0005_switching.sql`
  the imported series (its own unique index, no year nor seq) and
  `frozen_document()` again (an imported invoice is frozen too), the
  archives; `0010_chest.sql` the package's tables (`chest_seen`,
  `chest_bounds`); `0011_link_reads.sql` the public files' count per link.
- `src/components/` — `stamp.tsx` (StatusBadge as a stamp), `mark.tsx` and
  `icons.tsx` (the tool's own drawings), `client-form.tsx`, `pager.tsx`.
  The ledger is `src/islands/DocTable.tsx` (the kit's DataTable: `rowHref`
  opens the document from anywhere in its row, `phone="stack"` makes cards
  on a phone).

## Commands

`npm test` (PGlite; it builds the server to `dist/test` first),
`TEST_DATABASE_URL=… npm test` (PostgreSQL — run it for anything touching
numbering), `npm run build`, the studio's
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
- Money is integers of cents. Use `src/shared/totals.ts`; never round twice.
- A new mandatory mention goes into `src/pdf/document.ts` **and** the paper
  (`paper.tsx`), with its words in both catalogues and a test in
  `test/pdf.test.ts` that reads it back from the PDF bytes.
- Identity only from `member(request)`; store `mbr_…` ids; rights in
  `src/lib/access.ts` with a test per role.
- Words only in `src/i18n/*` (the tests look for words in `.tsx` files;
  `checkWords` checks both catalogues and French typography);
  `node scripts/lint-words.mjs tools/public-and-private/quotes` stays at 0 (the
  store's glossary: Undo « Annuler l’action », Delete « Supprimer »,
  narrow no-break spaces in French).
- The look: CSS names only contract tokens (`@argentic/chest-ui`,
  `tokens/CONTRACT.md`) and `src/tokens.css`; never a colour. Every class
  used in a `.tsx` exists in a stylesheet (`checkSources`). Text only on
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
  member, and never asks the Chest per request (bounds are the package's
  `bound`, kept in the database); its look is the public stylesheet (brand, else the tool's own — never a
  catalogue theme). An answer is refused unless the quote is still `sent`,
  valid, its link live, and the PDF fingerprint the form carries is the
  one kept for this version (`changed`). Never call it a signature: it is
  a record of agreement, not eIDAS.
- **Imported invoices** keep the previous tool's numbers in their own
  series: never give them a year or a `seq`, never number, finalise, draw
  a PDF of, credit or export them as this tool's sales; only payments and
  reminders.
- **The PDF never follows the look**: nothing in `src/pdf/`,
  `src/lib/archive.ts` or `src/lib/einvoice.ts` reads the theme (tested). Legal
  documents keep their neutral print design.
- **Nothing runs at rest**: no timer, no polling of your own (the package's
  `useAutoRefresh` only), nothing in process memory that must survive a
  sleep. Every Intl object comes from `src/i18n/format.ts`.
- **An island's props stay small**: a list that grows with the company
  goes by pages or is searched on the server; never hand an island a whole
  table, or the whole catalogue of words (`test/sources.test.ts`).
