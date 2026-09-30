# Adapting this tool — a guide for AI agents

`README.md` says what the tool does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | The manifest; the SDK proposals it uses (weekly schedule, French tile) |
| `migrations/0001_equipment.sql` | Categories, items, seats, problems, history (append-only trigger), chest_events |
| `migrations/0002_departures.sql` | Departures told by People (member, last day, when told) |
| `migrations/0004_field_keys_rules_reminders.sql` | Field keys (names in each language), the example rules (`charters.example`), `receipts.reminded_at` |
| `migrations/0003_receipts_requests_fields.sql` | Receipts, rules (charters), requests, fields per category, supplies (quantity, minimum), inventories, invoice; history gains qty, cost, ref, due and new kinds |
| `migrations/0005_members_see_history_time.sql` | `categories.members_see` (off for keys and badges, vehicles — existing Chests too); the history's time is `clock_timestamp()` |
| `migrations/0006_intune.sql` | `intune_devices` (the last read, by folded serial; the member Intune names, as an id) and `intune_reads` (each read's outcome) |
| `lib/intune.ts` | Microsoft Intune, read only: settings from `env`, token (client credentials), paged `managedDevices`, `refresh` (nightly or asked), `status` / `factsOf` for the pages, `missingAsCsv` for the importer; plain `fetch`, answered in tests by `fakeChest({ network })`; users matched with `members.matchEmails` (names only on a Chest without it) |
| `lib/access.ts` | **Who may do what** — the only place roles are read |
| `lib/model.ts` | Pure rules: limits, statuses, tags, money, dates, `clean()` |
| `lib/items.ts` | Items: list (pages), detail (full / brief), create (one or several), edit, give, take back, status and repairs, seats, supplies (hand out, restock), problems, holdings, invoice, overview; opening and closing receipts |
| `lib/receipts.ts` | "I received it", the rules (charter versions), the handover and return sheets |
| `lib/requests.ts` | Requests: ask, approve, refuse, fulfil (give / seat / hand out), cancel |
| `lib/fields.ts` | Fields per category and reading their values |
| `lib/inventory.ts` | Inventories: start, seen (tag, label link, id), close with the missing, report, last seen |
| `lib/categories.ts` | Categories |
| `lib/importer.ts` | Snipe-IT / spreadsheet import: `plan()` is pure, `applyImport()` writes; other columns become fields when kept; `test/fixtures/` holds Snipe-IT exports |
| `lib/export.ts`, `lib/csv.ts` | CSV out (reads back through the importer) |
| `lib/qr.ts` | The QR encoder (tested by decoding) |
| `lib/tell.ts`, `lib/notify.ts` | Bell items (keyed, withdrawn when settled), managers' badges |
| `lib/departures.ts` | Departures told by People (events between tools): read and check each event, ordering by `occurredAt`, the "To take back" list, purge |
| `lib/lifecycle.ts`, `lib/weekly.ts` | Members leaving (their departure leaves the lists, kept for `equipment.returned`) / erased (forgets it); Monday's run |
| `migrations/0007_returned.sql`, `lib/returned.ts` | `equipment.returned {member}` to People once everything a leaving person held is back: a deferred trigger writes the outbox in the take-back's transaction; published after each action (`app/chest/actions.ts` `act`) and by the `returns` schedule; key `equipment:<member>:returned:<ms>` — People's contract, never change its shape |
| `lib/view.ts`, `lib/words.ts` | Items as rows in words for the views; `categoryName`, `fieldName`, `charterText`: the tool's own names and example rules in the reader's language |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser; the UI kit's word sections (`toast`, `dialog`, `peoplePicker`, `date`, `files`, `table`, `filters`, `search`) |
| `lib/theme.ts` | The identity "Tool crib" (`defineTheme`, equal to the kit's catalogue theme `labels`) and `currentLook()` |
| `app/tokens.css` | The tool's own tokens, all defined from contract tokens (steel bar, tag, paper) |
| `components/claim-button.tsx`, `components/fold.tsx` | *Claim the warranty* (to repair with the supplier's details); a long overview section folded to three lines |
| `components/shell.tsx`, `components/bits.tsx` | The kit's `AppShell` with Next's `Link`; asset tag, status stamps (the kit's `StatusBadge`), item lines |
| `app/chest/` | Pages (server) and views (`"use client"`); `actions.ts` server actions |
| `seed/sample.sql` | Sample equipment of the studio's cast |

## Rules

- Identity only from `member(request)` (`lib/session.ts`); store `mbr_…`
  ids, names come from `members.lookup` at render.
- Every service starts with the actor's rights; a member never sees money,
  suppliers, notes or history (`brief()`); an item they may not see is
  `not_found`.
- **Privacy for members** lives in `lib/items.ts`: `forMember()` blanks
  anyone else's serial number, and the holder, place and "since" where the
  category's `members_see` is off (`holderHidden`: "Given to someone");
  `where()` gives a member's search and filters the same limits (serials
  and field values on their own items only, holders and places only where
  shown). A new way to read items for members goes through both
  (`test/privacy.test.ts`).
- The item's history is ordered by `at` (then id), never by id alone: a
  line's id is when it was inserted, not when it happened.
- **Intune**: only `login.microsoftonline.com` and `graph.microsoft.com`
  (`chest.json` `network`); a next page is followed only on Graph; the
  secret never leaves `lib/intune.ts` (no log, no page, no database);
  Intune's user is kept only as a matched member id. Nothing is written to
  Intune. Its shapes come from Microsoft's documentation (sources in
  `lib/intune.ts`): do not add a field or an MDM from memory.
- Services return data or throw `AppError(code)`; words live in
  `lib/i18n` only (`test/literals.test.ts`, `test/i18n.test.ts`).
- **Defaults are keys**: a category, a field or the rules the tool proposes
  is shown in the reader's language (`categoryName`, `fieldName`,
  `charterText`) until a manager changes it; never seed an English name
  without its key.
- **One refusal for managers' pages**: `if (!can(member, "items.manage"))
  forbidden();` first thing (403, `app/chest/forbidden.tsx`, the kit's
  NoAccess); add a new managers' page to `test/refusals.test.ts`.
- **Printed sheets are proof**: people by `plainName` (never "(former
  member)"), no placeholder left in any text, hidden or not.
- The history is append-only: add a `kind` (migration + catalogue
  `history.*`) rather than editing rows. A shipped migration is never
  edited.
- A receipt is opened by `give()` to a member and closed (never deleted)
  whenever the item leaves them; an Undo of a take-back reopens it. Only
  the holder confirms it. The tile's count is `tell.refreshBadges`.
- Field values live in `items.extra` keyed by field id; a form or an
  import is checked with `readExtra()` / `fieldValue()`.
- A tool event is validated field by field and ignored when it does not
  fit; a departure keeps only the member, the day and when it was told.
  The `leaving:<member>` bell item is withdrawn when all is back, when the
  departure is cancelled, and when the member leaves or is erased.
- Nothing leaves the tool: fonts, icons and QR codes are local.
- **The UI kit** (`@argentic/chest-ui`, vendored in `vendor/`): `AppShell`
  (+ `Nav`, `BrandMark`, `NoAccess`), `Toasts`/`useToast` (Undo returns
  `true` or why not; `sent: true` once a bell left), `Dialog` (pass
  `dirty` when something was typed), `Confirm` (only for the irreversible:
  deleting a photo or an invoice), `PeoplePicker` (`localSearch` over the
  team), `DateField` (never `type="date"`), `Segmented`, `Menu`,
  `Filters`, `SearchBox`, `FilePicker` (importer), `DataTable` (import
  preview), `EmptyState`, `Avatar`, `StatusBadge`, `PageHeader`,
  `LanguageSwitch`. Kept on purpose: the item lines (labels with a tick
  to print), the stock pickers in dialogs (records, not people), the
  category icon menu, the photo and invoice buttons, the paper forms,
  and the list's "With" filter (a select with option groups — team,
  places — and its own "Anyone": the kit's `Filters` select has neither).
  Kit 0.2.2 (re-vendored 2026-09-29): the steel bar is `--inverse` (no
  dark-mode override of our own; it no longer collapses to black ink),
  status stamps are `StatusBadge className` (no wrapper span), "More" is
  `Menu size="m"`, the category filter becomes a select past 8
  categories (`as: "select"`).
- **CSS names only contract tokens** and the tool's own from
  `app/tokens.css` (`test/theme.test.ts`); never a colour. The paper
  (sheets, labels) uses the system's `Canvas`/`CanvasText` (and a dark grey mixed from them)
  with `color-scheme: light`, so it prints black on white in every look.
- Words follow `lab/GLOSSARY.md` (`node scripts/lint-words.mjs` in the
  studio: 0 errors): Undo « Annuler l’action », Delete « Supprimer »,
  narrow no-break spaces in French.
- Client components never import the SDK, `lib/db.ts`, `lib/session.ts`,
  `lib/people.ts`.
- Verify with `npm test` (PGlite and `TEST_DATABASE_URL`), `npm run build`,
  the flows, the screenshots and the audit (README, "Develop").
