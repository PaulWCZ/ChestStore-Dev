# Adapting Expenses — a guide for AI agents

`README.md` says what Expenses does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest: roles `accountant`, `approver`, `employee`; `database`, `files`, `members`, `notifications`; `receives`. Proposals: schedules `reminder`, `cleanup` |
| `lib/access.ts` | **Who may do what**: `can(actor, ability)` and `expenseAccess(actor, facts)` (see, own, decide) |
| `lib/expenses.ts` | Expenses, trips and flat rates, warnings, send, decide (the refusal fingerprint: a refused expense cannot come back unchanged), pay, badges' counts, export rows, kilometres before the tool — every function `(sql, actor, …)` |
| `lib/settings.ts` | Company settings (currency, reminder, setup done, journal accounts, payer name), categories, flat rates, exchange rates, mileage scales, vehicles and their certificates, approvers, each person's journal account |
| `lib/bank.ts`, `lib/iban.ts`, `lib/seal.ts` | Bank details: rights (own, accountants), IBAN/BIC checks (mod 97; pure, browser-safe), sealing with `BANK_DETAILS_KEY` |
| `lib/payments.ts`, `lib/sepa.ts` | Transfer files: the batch (create, cancel, list, write again) and the pain.001.001.03 XML (pure) |
| `lib/journal.ts` | Accounting entries in the FEC column layout |
| `lib/csv-read.ts`, `lib/imports.ts` | Reading another tool's CSV and guessing its columns (browser-safe); importing past expenses as history |
| `lib/receipt-text.ts`, `components/ocr.ts` | What a receipt's text says (pure, tested); reading the photo in the browser with tesseract.js (files copied to `public/ocr/` by `scripts/ocr-assets.mjs`) |
| `components/upload.ts`, `components/bank-form.tsx` | A file from the browser to the Chest; the bank details form |
| `lib/scale.ts` | The mileage scale as data and a trip's amount — **pure, browser-safe, tested** |
| `lib/money.ts` | Integer minor units, parsing what people type, Intl formatting, VAT — browser-safe |
| `lib/model.ts` | Bounds, text cleaning, days and months — pure |
| `lib/receipts.ts` | Browser uploads: authorise (the tool names the object), inspect (arrived, type, size, SHA-256), forget |
| `lib/export.ts`, `lib/csv.ts`, `lib/zip.ts` | CSV (formula-safe, `;` in French) and the streamed ZIP (own stored-ZIP writer) |
| `lib/tell.ts`, `lib/notify.ts` | The bell, each recipient in their language; the tile's number |
| `lib/lifecycle.ts` | Leaving and erasure (accounting records kept, ids replaced by `erased`) |
| `lib/jobs.ts` | Schedules: the 25th's reminder, the nightly cleanup |
| `lib/rows.ts`, `lib/compose.ts`, `lib/words.ts` | What pages hand to views, in the reader's words |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/compose.tsx` | The add/edit screens (client): receipt upload, amount, trip estimate |
| `app/chest/api/receipts/route.ts`, `app/chest/receipts/[id]/route.ts` | Upload grant; open a receipt through a fresh signed link |
| `app/chest/export/{csv,zip,journal}/route.ts`, `app/chest/pay/files/[id]/route.ts`, `app/chest/vehicles/[member]/proof/route.ts` | Downloads for accountants (and a certificate for its owner) |
| `app/chest/settings/page.tsx`, `app/chest/settings/company/page.tsx`, `settings-view.tsx`, `import-view.tsx` | Settings → Me; Settings → Company (accountants) |
| `migrations/` | Schema and the default categories and scale (`0001`), everything after the critique (`0002`). Never edit a shipped file; add `0003_…` |
| `seed/sample.sql` | A month of sample expenses for local runs |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`, `lib/http.ts`); store
  `mbr_…` ids, never names.
- **Money is integers** of the currency's minor unit; never floats in the
  database or in sums. Parse with `parseAmount`, write with `formatMoney`.
- **The scale is data** (`mileage_scales`), never constants in code; a trip's
  amount always comes from `tripCents` over the year's earlier distance, and
  `recomputeTrips` runs after any change to a person's trips of a year.
- **Receipts are never modified or replaced after sending.** A new receipt is
  a new object; only drafts drop their old one.
- **Services return codes** (`AppError`), pages turn them into words. Every
  word is in `lib/i18n/en.ts` and `fr.ts` (the tests compare them and look
  for words in `.tsx`).
- **Client components** import only `lib/i18n/format.ts`, `lib/money.ts`,
  `lib/scale.ts`, `lib/model.ts`, `lib/words.ts`, `lib/app-error.ts`, and
  types — never the SDK, `lib/db.ts`, `lib/session.ts`, `lib/people.ts`.
- **Erasure keeps accounting records** (legal obligation) and removes the
  person: extend `lib/lifecycle.ts` for any new column that stores an id or a
  personal text.
- A new column holding member ids: add it to `erase()` and to the lifecycle
  test.
- **A new field of an expense its owner fills** goes into `fingerprint()`
  (lib/expenses.ts), or a refusal could be answered by sending the same
  expense again.
- **Money in two currencies**: `amount` is in the expense's currency,
  `base` in the company's (null without a rate). Totals, pay-back, the
  transfer file and the journal use `base`; any new insert of an expense
  sets it.
- **Bank details are never shown whole** in a page, a log or an export
  other than the transfer file; only the person and the accountants reach
  them (`lib/bank.ts`).
- Imported expenses (`imported_at`) are history: keep them out of pay,
  exports and the journal (`within()`).
