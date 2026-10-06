# Adapting this tool — a guide for AI agents

`README.md` says what the tool does; this page says where things are and
what must not break.

## Map

How the tool is built — pages, islands, actions, words, the database,
tests, recipes, rules of the stack — is
`node_modules/@argentic/chest-app/AGENTS.md`: read it first. Equipment's
own:

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | The manifest (contract 0.4: roles, capabilities, the three schedules, Microsoft's two hosts, Intune's settings); the SDK proposals it uses (mail, events between tools, the French tile) |
| `src/app.tsx` | Every route: pages (`equipment()`: a role is needed; `managers()`: 403 with the kit's NoAccess otherwise), the photo and invoice links, the streamed CSV export, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | Every change, by name (`call("giveItem", …)` from an island); after each, `equipment.returned` is told (`lib/returned.ts`) |
| `src/pages/` | The pages, rendered on the server (`Overview`, `Mine`, `Items`, `Item`, `NewItem`/`EditItem`, `People`, `Person`, `Handover`/`ReturnSheet` with `sheet.tsx`, `Inventory`, `InventoryReport`, `Labels`, `Import`, `Settings`) |
| `src/islands/` | What runs in the browser (`index.ts` lists them); `undo.ts` (an Undo that tells the truth), `upload.ts` (grant, PUT, record) |
| `src/components/` | Shared by pages and islands: icons, the mark, asset tags and stamps (`bits.tsx`), the label's face and QR, the folded sections, the watched date field |
| `src/shared/` | Pure rules both sides use: `model.ts` (limits, statuses, tags, money, dates, `clean()`), `words.ts` (names in the reader's language), `qr.ts` (the QR encoder, tested by decoding) |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts`, the only place an `Intl` object is made (kept); the UI kit's words |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity "Tool crib" (the kit's catalogue theme `labels`), the look served as `/chest/look.css`; the tool's own tokens, made of contract tokens; its CSS |
| `src/lib/access.ts` | **Who may do what** — the only place roles are read |
| `src/lib/items.ts` | Items: list (pages), detail (full / brief), create (one or several), edit, give, take back (rows locked in the transaction), status and repairs, seats, supplies, problems, holdings, invoice, overview; receipts opened and closed |
| `src/lib/receipts.ts`, `requests.ts`, `fields.ts`, `inventory.ts`, `categories.ts` | "I received it", the rules and the sheets; requests; fields per category; inventories; categories |
| `src/lib/importer.ts`, `export.ts`, `csv.ts` | Snipe-IT / spreadsheet import (`plan()` is pure); the CSV export (header and rows apart, for the stream) |
| `src/lib/intune.ts` | Microsoft Intune, read only (see Rules) |
| `src/lib/tell.ts`, `notify.ts`, `people.ts` | Bell items (keyed, withdrawn when settled), badges; names from the Chest (`former`, `no_access`, `erased`) |
| `src/lib/deliveries.ts`, `lifecycle.ts`, `departures.ts`, `returned.ts`, `weekly.ts` | What the Chest posts: members' lifecycle, People's departures, the runs of `weekly`, `intune`, `returns`; the delivered ids kept in `chest_events` (forgotten after 30 days, weekly) |
| `src/lib/view.ts` | Items as rows in words for the views |
| `src/lib/origin.ts`, `db.ts` | The team host for QR links (`chest.tool.teamUrl`); the package's database pool |
| `migrations/` | 0001 to 0007 (history append-only by trigger, departures, receipts, fields, members_see, Intune, the `equipment.returned` outbox): never edit one that shipped |
| `test/` | The services (`*.test.ts` on a real database), the built server (`app.test.ts`), the stack's rules (`sources.test.ts`); `support/` |
| `seed/sample.sql` | Sample equipment of the studio's cast |

## Rules

- Identity only from the package's `member` (the Chest's assertion); store `mbr_…`
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
- Services return data or throw `AppError(code)` (the package's); words
  live in `src/i18n` only (`test/literals.test.ts`, `test/i18n.test.ts`).
- **Days are the Chest's**: `chest.today()` (or `chest.today(at)` for an
  instant), the same day as the database's `current_date` and `at::date`
  (the Chest puts the sessions in its zone). Never
  `toISOString().slice(0, 10)` of now, nor a zone written in the code.
- **Defaults are keys**: a category, a field or the rules the tool proposes
  is shown in the reader's language (`categoryName`, `fieldName`,
  `charterText`) until a manager changes it; never seed an English name
  without its key.
- **One refusal for managers' pages**: route it with `managers()` in
  `src/app.tsx` (403, the kit's NoAccess, before anything is read); add it
  to `managersPages` in `test/app.test.ts`.
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
  (+ `Nav`, `BrandMark`, `NoAccess`), toasts through the package's `toast()` (Undo returns
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
  `src/tokens.css` (`test/theme.test.ts`); never a colour. The paper
  (sheets, labels) uses the system's `Canvas`/`CanvasText` (and a dark grey mixed from them)
  with `color-scheme: light`, so it prints black on white in every look.
- Words follow `lab/GLOSSARY.md` (`node scripts/lint-words.mjs` in the
  studio: 0 errors): Undo « Annuler l’action », Delete « Supprimer »,
  narrow no-break spaces in French.
- Islands and components never import the SDK nor `src/lib/` (types
  aside): `checkSources()` refuses it. Give an island an `id` of its
  subject (`i-item-<id>`) so its state never moves to another item.
- Verify with `npm test` (PGlite and `TEST_DATABASE_URL`), `npm run build`,
  the flows, the screenshots and the audit (README, "Develop").
