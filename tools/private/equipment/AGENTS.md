# Adapting this tool — a guide for AI agents

`README.md` says what the tool does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | The manifest; the SDK proposals it uses (weekly schedule, French tile) |
| `migrations/0001_equipment.sql` | Categories, items, seats, problems, history (append-only trigger), chest_events |
| `migrations/0002_departures.sql` | Departures told by People (member, last day, when told) |
| `lib/access.ts` | **Who may do what** — the only place roles are read |
| `lib/model.ts` | Pure rules: limits, statuses, tags, money, dates, `clean()` |
| `lib/items.ts` | Items: list, detail (full / brief), create, edit, give, take back, status, seats, problems, holdings, overview |
| `lib/categories.ts` | Categories |
| `lib/importer.ts` | Snipe-IT / spreadsheet import: `plan()` is pure, `applyImport()` writes |
| `lib/export.ts`, `lib/csv.ts` | CSV out (reads back through the importer) |
| `lib/qr.ts` | The QR encoder (tested by decoding) |
| `lib/tell.ts`, `lib/notify.ts` | Bell items (keyed, withdrawn when settled), managers' badges |
| `lib/departures.ts` | Departures told by People (events between tools): read and check each event, ordering by `occurredAt`, the "To take back" list, purge |
| `lib/lifecycle.ts`, `lib/weekly.ts` | Members leaving / erased (they also forget a departure); Monday's run |
| `lib/view.ts`, `lib/words.ts` | Items as rows in words for the views |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/` | Pages (server) and views (`"use client"`); `actions.ts` server actions |
| `seed/sample.sql` | Sample equipment of the studio's cast |

## Rules

- Identity only from `member(request)` (`lib/session.ts`); store `mbr_…`
  ids, names come from `members.lookup` at render.
- Every service starts with the actor's rights; a member never sees money,
  suppliers, notes or history (`brief()`); an item they may not see is
  `not_found`.
- Services return data or throw `AppError(code)`; words live in
  `lib/i18n` only (`test/literals.test.ts`, `test/i18n.test.ts`).
- The history is append-only: add a `kind` (migration + catalogue
  `history.*`) rather than editing rows. A shipped migration is never
  edited.
- A tool event is validated field by field and ignored when it does not
  fit; a departure keeps only the member, the day and when it was told.
  The `leaving:<member>` bell item is withdrawn when all is back, when the
  departure is cancelled, and when the member leaves or is erased.
- Nothing leaves the tool: fonts, icons and QR codes are local.
- Client components never import the SDK, `lib/db.ts`, `lib/session.ts`,
  `lib/people.ts`.
- Verify with `npm test` (PGlite and `TEST_DATABASE_URL`), `npm run build`,
  the flows, the screenshots and the audit (README, "Develop").
