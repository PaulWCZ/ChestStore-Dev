# Adapting Expenses — a guide for AI agents

`README.md` says what Expenses does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest: roles `accountant`, `approver`, `employee`; `database`, `files`, `members`, `notifications`; `receives`. Proposals: schedules `reminder`, `cleanup`; `mail` (send) |
| `lib/access.ts` | **Who may do what**: `can(actor, ability)` and `expenseAccess(actor, facts)` (see, own, decide — never one's own) |
| `lib/approvals.ts` | Who approves a member's expenses now (`approversFor`), and the accountants nobody can approve (`alone`) |
| `lib/search.ts`, `app/chest/search/page.tsx` | Search: what the text asks (`readQuery`: reference, amount, words), among what the reader may see |
| `lib/card-guess.ts` | A card label's category from the accountant's words (`card_rules`) — pure, tested |
| `lib/mail.ts` | Email beside the bell (mail proposal): `email(recipients, letter, {path, key})` |
| `lib/expenses.ts` | Expenses, trips and flat rates, warnings, send, decide (the refusal fingerprint: a refused expense cannot come back unchanged), pay, badges' counts, export rows, kilometres before the tool — every function `(sql, actor, …)` |
| `lib/settings.ts` | Company settings (currency, reminder, setup done, journal accounts, payer name), categories, flat rates, exchange rates, mileage scales, vehicles and their certificates, approvers, each person's journal account |
| `lib/bank.ts`, `lib/iban.ts`, `lib/seal.ts` | Bank details: rights (own, accountants), IBAN/BIC checks (mod 97; pure, browser-safe), sealing with `BANK_DETAILS_KEY` |
| `lib/payments.ts`, `lib/sepa.ts` | Transfer files: the batch (create, cancel, list, write again) and the pain.001.001.03 XML (pure) |
| `lib/journal.ts` | Accounting entries in the FEC column layout |
| `lib/card-read.ts`, `lib/card-match.ts`, `lib/cards.ts`, `app/chest/cards/` | Company card statements: columns guessed and payments read in the browser (pure); matching payments to expenses (pure, tested: amount tolerance, date window, label words, one each); the import (matched, or a card draft waiting for its receipt), Undo, the accountant's lists, "checked" |
| `lib/csv-read.ts`, `lib/imports.ts` | Reading another tool's CSV and guessing its columns (browser-safe); importing past expenses as history |
| `lib/receipt-text.ts`, `components/ocr.ts` | What a receipt's text says (pure, tested); reading the photo in the browser with tesseract.js (files copied to `public/ocr/` by `scripts/ocr-assets.mjs`) |
| `components/upload.ts`, `components/bank-form.tsx` | A file from the browser to the Chest (with the kit's `putWithProgress`); the bank details form and `EraseBank` (the kit's `Confirm`) |
| `lib/theme.ts`, `app/tokens.css`, `app/globals.css` | The identity "Receipt" as a kit theme (`defineTheme`, equal to the catalogue's `receipt`) and `currentLook` (the Chest's choice, else the identity); the tool's own tokens, from contract tokens; the CSS (contract tokens only) |
| `components/shell.tsx`, `components/bits.tsx`, `components/mark.tsx` | The kit's `AppShell` with Next's `Link` and path; thumbnails, date boxes, stamps and warnings (the kit's `StatusBadge`); the mark in the look's tokens |
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
| `migrations/` | Schema and the default categories and scale (`0001`), everything after the critique (`0002`), after the second one: card statements, addresses (`0003`); after the third: card statement words (`0004`). Never edit a shipped file; add `0005_…` |
| `seed/sample.sql` | A month of sample expenses for local runs |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **The UI kit first** (`@argentic/chest-ui`, `vendor/`, `node
  ../../../scripts/add-ui.mjs` from the studio): used here are `AppShell`
  (via `components/shell.tsx`), `BrandMark`, `NoAccess`, `Toasts`/`useToast`
  (one toast per `id`; `undo` returns `true` or the reason it failed;
  `sent: true` once someone was told), `Dialog` (`dirty` while an IBAN is
  typed), `Confirm` (erasing bank details), `DateField` (every date: never
  `type="date"`), `FilePicker` (registration certificate, with `camera` and `previewSize` since 0.2.3; CSV import; card statement),
  `DataTable` (import preview), `Tabs`, `Segmented` (Export's "Month of"
  is its link variant), `Filters` (Export's month and person, as select
  groups in the address), `Switch` (the month-end reminder), `EmptyState`,
  `Avatar`, `StatusBadge`, `LanguageSwitch`, `useAutoRefresh`. Their words
  are the catalogues' `toast`, `dialog`, `date`, `files`, `table` sections.
  The registration certificate's `FilePicker` shows a photo's thumbnail
  (`preview`). Kept on purpose: the receipt picker of `compose.tsx`
  (camera and file side by side on every screen, the photo shown large,
  the stored receipt shown when editing, read at once in the browser —
  the kit's `previewSize` goes to 96 px (0.2.3), too small to check what
  the phone read on the photo — amount, date, VAT — against the photo
  itself; its `camera` and `storedFile` would fit, the large photo would
  not), the
  guests field (colleagues and outside names), the paid-with segments (each
  with its meaning), the approver `<select>` per person (a few approvers
  and "the accountants"), the settings' editable grids.
- **CSS names only contract tokens** (`ui/tokens/CONTRACT.md`) or the
  tool's tokens of `app/tokens.css`, themselves defined from contract
  tokens; never a colour (`test/theme.test.ts`). Text sits only on measured
  pairs (`--ok-ink` on `--ok-soft`…); field borders are `--line-strong`.
- **A Confirm inside a Dialog closes alone** (kit 0.2.2): `BankForm`
  asks before erasing with its own `EraseBank`, in a dialog or not.
- **Words**: `node ../../../scripts/lint-words.mjs tools/private/expenses`
  (store glossary) stays at 0 errors — French narrow no-break spaces before
  `: ; ? ! %`, Undo « Annuler l’action », Remove/Delete/Erase =
  Retirer/Supprimer/Effacer.

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
- **Card payments** (`card_lines`) are the company's bank records: erasure
  keeps them with `erased`; a draft made for one (`link = 'created'`) is
  counted in the holder's badge and bell (`card:<member>`, withdrawn by
  `settleCardReceipts` once every receipt is there) until it has its
  receipt. `Expense.fromCard` says so; the matching never takes imported
  history nor an expense already tied to a payment.
- **Bank texts** (the remittance) are in `settings.bankLocale` (the
  company's), never the payee's. An account where `needsAddress(country)`
  goes in a transfer file only with its address and the company's
  (`lib/payments.ts` skips it with a reason otherwise).
- **Nobody decides on their own expense** (`expenseAccess`): keep it so;
  `waitingCounts` and `waiting` follow the same rule.
- **Emails** leave through `lib/mail.ts` only, with a short key (the
  recipient is appended; 64 characters in all).
- Imported expenses (`imported_at`) are history: keep them out of pay,
  exports and the journal (`within()`).
