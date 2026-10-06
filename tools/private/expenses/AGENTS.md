# Adapting Expenses — a guide for AI agents

`README.md` says what Expenses does; this page says where things are and
what must not break.

## Map

How a tool on this stack is built — pages, islands, actions, words, the
database, tests — is `node_modules/@argentic/chest-app/AGENTS.md`: read it
first. Expenses' own:

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (contract 0.4): roles `accountant`, `approver`, `employee`; `database`, `files`, `members`, `notifications`; `receives`; schedules `reminder`, `cleanup`; `env` `BANK_DETAILS_KEY`; `build.static` `/assets/`. Proposals: `mail` (send), `translations` |
| `src/app.tsx` | **Every route**: the pages (`expenses()` adds the tabs' numbers, `View.layout`), the downloads (receipts, transfer files, CSV, ZIP streamed, journal, certificates), the receipt reader's files `/chest/ocr/` (their own policy: `'wasm-unsafe-eval'`), `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | **Every change**, by name: thin, the member from the Chest, values passed as sent (amounts as typed) to the services, which check them |
| `src/pages/` | One module per page: reads, then hands plain data to its island |
| `src/islands/` | What runs in the browser: one view per page (`HomeView`, `Compose`, `DetailView`, `ApproveView`, `PayView`, `CardsView`, `ExportView`, `MyView`/`CompanyView`), `SetupBanner`, `SearchBox`, `AutoRefresh`; `index.ts` lists them |
| `src/components/` | Shared by islands (the island rules apply): `bits.tsx` (thumbnails, stamps, warnings), `bank-form.tsx`, `import-section.tsx`, `upload.ts` (grant by action, PUT to the Chest), `ocr.ts` (tesseract.js), `date-problems.tsx`, `keep-above-bar.ts`, `settings-calls.ts`, tabs `pay-nav.tsx`, `settings-nav.tsx`, `icons.tsx`, `mark.tsx` |
| `src/layout.tsx` | The kit's shell: tabs with what waits (`data.counts`), search, Add; the toasts |
| `src/lib/access.ts` | **Who may do what**: `can(actor, ability)` and `expenseAccess(actor, facts)` (see, own, decide — never one's own) |
| `src/lib/approvals.ts` | Who approves a member's expenses now (`approversFor`), and the accountants nobody can approve (`alone`) |
| `src/lib/expenses.ts` | Expenses, trips and flat rates, warnings, send, decide (the refusal fingerprint), pay, badges' and tabs' counts, export rows, kilometres before the tool — every function `(sql, actor, …)`; read-then-write paths lock their rows |
| `src/lib/settings.ts` | Company settings, categories, flat rates, exchange rates, mileage scales, vehicles and certificates, approvers, journal accounts, card statement words |
| `src/lib/bank.ts`, `src/lib/seal.ts`, `src/lib/payments.ts`, `src/lib/sepa.ts` | Bank details (own, accountants), sealing with `BANK_DETAILS_KEY`; transfer files and their pain.001.001.03 XML |
| `src/lib/cards.ts`, `src/lib/card-match.ts`, `src/lib/card-guess.ts`, `src/lib/imports.ts` | Card statements (matching, drafts waiting for receipts, Undo), card words, importing past expenses |
| `src/lib/journal.ts`, `src/lib/export.ts`, `src/lib/csv.ts`, `src/lib/zip.ts` | FEC-layout entries; the CSV and the streamed ZIP |
| `src/lib/receipts.ts` | Uploads: authorise, inspect (arrived, type, size, the Chest's SHA-256), forget |
| `src/lib/tell.ts`, `src/lib/notify.ts`, `src/lib/mail.ts` | The bell, the tile's number, email (proposal) — each recipient in their language |
| `src/lib/lifecycle.ts`, `src/lib/jobs.ts` | Leaving and erasure; the 25th's reminder, the nightly cleanup |
| `src/lib/people.ts`, `src/lib/today.ts` | Names from the Chest (`former`, `no_access`, `erased`, `leftAt`); the Chest's day |
| `src/lib/rows.ts`, `src/lib/compose.ts`, `src/lib/compose-words.ts` | What pages hand to islands, in the reader's words |
| `src/shared/` | Rules the browser runs too, pure and tested: `money.ts` (minor units, parsing what people type — ambiguous amounts refused —, formatting), `scale.ts`, `iban.ts`, `model.ts`, `words.ts`, `card-read.ts`, `csv-read.ts`, `receipt-text.ts`, `app-error.ts` |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`, `index.ts`; `format.ts` — **the only place an `Intl` object is made** (kept, never per row) |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity "Receipt" (the kit's) and the company's choice, served as `/chest/look.css`; the tool's tokens; the CSS (contract tokens only) |
| `scripts/ocr-assets.mjs` | Copies tesseract.js's worker, core and French model into `dist/ocr/` after the build |
| `migrations/` | `0001`…`0004`. Never edit a shipped file; add `0005_…` |
| `seed/sample.sql` | A month of sample expenses (local runs, `test/app.test.ts`) |
| `test/` | `node:test`: the services with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`); `app.test.ts` and the route tests on the built server (`test/support/server.ts`); `sources.test.ts` (the package's checks, no `new Intl.` outside `src/i18n/format.ts`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass (and NODE_ENV=development npm test)
```

## Rules

- **The UI kit first** (`@argentic/chest-ui`, `vendor/`, `node
  ../../../scripts/add-ui.mjs` from the studio): used here are `AppShell`
  (in `src/layout.tsx`), `BrandMark`, `NoAccess`, `Toasts`/`useToast`
  (one toast per `id`; `undo` returns `true` or the reason it failed;
  `sent: true` once someone was told), `Dialog` (`dirty` while an IBAN is
  typed), `Confirm` (erasing bank details), `DateField` (every date: never
  `type="date"`), `FilePicker` (registration certificate, with `camera` and `previewSize` since 0.2.3; CSV import; card statement),
  `DataTable` (import preview), `Tabs`, `Segmented` (Export's "Month of"
  is its link variant), `Filters` (Export's month and person, as select
  groups in the address), `Switch` (the month-end reminder), `EmptyState`,
  `Avatar`, `StatusBadge`, `LanguageSwitch` (the re-reading of a page left
  open is the package's `useAutoRefresh`, with the version of
  `src/lib/stamp.ts`). Their words
  are the catalogues' `toast`, `dialog`, `date`, `files`, `table` sections
  (also inside `kit`, which the package reads).
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
  tool's tokens of `src/tokens.css`, themselves defined from contract
  tokens; never a colour (`test/theme.test.ts`). Text sits only on measured
  pairs (`--ok-ink` on `--ok-soft`…); field borders are `--line-strong`.
- **A Confirm inside a Dialog closes alone** (kit 0.2.2): `BankForm`
  asks before erasing with its own `EraseBank`, in a dialog or not.
- **Words**: `node ../../../scripts/lint-words.mjs tools/private/expenses`
  (store glossary) stays at 0 errors — French narrow no-break spaces before
  `: ; ? ! %`, Undo « Annuler l’action », Remove/Delete/Erase =
  Retirer/Supprimer/Effacer.

- **Identity only from the Chest** (`member` in `page()`/`action()`); store
  `mbr_…` ids, never names.
- **Money is integers** of the currency's minor unit; never floats in the
  database or in sums. Parse with `parseAmount` (on the server, from what
  the person typed — never `Number()` in the browser), write with
  `formatMoney`. A lone separator before three digits is refused.
- **The scale is data** (`mileage_scales`), never constants in code; a trip's
  amount always comes from `tripCents` over the year's earlier distance, and
  `recomputeTrips` runs after any change to a person's trips of a year.
- **Receipts are never modified or replaced after sending.** A new receipt is
  a new object; only drafts drop their old one.
- **Services return codes** (`AppError`), pages turn them into words. Every
  word is in `src/i18n/en.ts` and `fr.ts` (the tests compare them and look
  for words in `.tsx`).
- **Islands and `src/components/`** import only `src/shared/`, `src/i18n/`,
  `@argentic/chest-app/client`, the kit, and types — never `src/lib/` nor
  the SDK (`test/sources.test.ts`).
- **Erasure keeps accounting records** (legal obligation) and removes the
  person: extend `src/lib/lifecycle.ts` for any new column that stores an id or a
  personal text.
- A new column holding member ids: add it to `erase()` and to the lifecycle
  test.
- **A new field of an expense its owner fills** goes into `fingerprint()`
  (src/lib/expenses.ts), or a refusal could be answered by sending the same
  expense again.
- **Money in two currencies**: `amount` is in the expense's currency,
  `base` in the company's (null without a rate). Totals, pay-back, the
  transfer file and the journal use `base`; any new insert of an expense
  sets it.
- **Bank details are never shown whole** in a page, a log or an export
  other than the transfer file; only the person and the accountants reach
  them (`src/lib/bank.ts`).
- **Card payments** (`card_lines`) are the company's bank records: erasure
  keeps them with `erased`; a draft made for one (`link = 'created'`) is
  counted in the holder's badge and bell (`card:<member>`, withdrawn by
  `settleCardReceipts` once every receipt is there) until it has its
  receipt. `Expense.fromCard` says so; the matching never takes imported
  history nor an expense already tied to a payment.
- **Bank texts** (the remittance) are in `settings.bankLocale` (the
  company's), never the payee's. An account where `needsAddress(country)`
  goes in a transfer file only with its address and the company's
  (`src/lib/payments.ts` skips it with a reason otherwise).
- **Nobody decides on their own expense** (`expenseAccess`): keep it so;
  `waitingCounts` and `waiting` follow the same rule.
- **Emails** leave through `src/lib/mail.ts` only, with a short key (the
  recipient is appended; 64 characters in all).
- Imported expenses (`imported_at`) are history: keep them out of pay,
  exports and the journal (`within()`).
- **Today** is the Chest's day: `src/lib/today.ts` (`chest.today()`), the same
  as the database's `current_date` (the Chest's zone). Never
  `new Date().toISOString().slice(0, 10)` nor a zone written in the code.
