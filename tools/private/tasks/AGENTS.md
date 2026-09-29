# Adapting Tasks — a guide for AI agents

`README.md` says what Tasks does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `manager`, `member`, `viewer`; `database`, `files`, `members`, `notifications`; `receives` |
| `lib/access.ts` | **Who may do what**: tool abilities (`can`) and a board's access (`boardAccess`: none, read, comment, write, own) |
| `lib/boards.ts` | Boards (shared at creation), columns (archived with or after moving their cards), labels, fields, board people and groups |
| `lib/cards.ts` | Cards, assignees, checklists and steps (subtasks), field values, comments (removed with Undo, purged after 10 min), files, history, moving and copying to another board, My tasks and my steps, search, the tile's count |
| `lib/mail.ts` | Email beside the bell (Proposal (studio) `mail`): the per-person switch, `email()` in each one's language |
| `lib/markdown.ts`, `components/markdown.tsx` | The description's small Markdown: a tree (pure, tested), drawn with React — never HTML |
| `lib/calendar.ts` | The calendar view's month grid — pure, tested |
| `lib/model.ts` | Bounds, colours, templates, dates, text cleaning — pure |
| `lib/position.ts` | Fractional positions (a key between two others) — pure, tested |
| `lib/parse-import.ts`, `lib/importers.ts` | Trello JSON / CSV reading (pure, used in the browser too), then writing a board |
| `lib/export.ts`, `lib/csv.ts` | CSV and JSON exports; CSV reading and writing (formula-safe) |
| `lib/tell.ts`, `lib/notify.ts` | The bell (each recipient's language) and badges |
| `lib/repeat.ts` | Repeat rules and the next due date — pure, used in the browser too, tested alone (month ends, summer time) |
| `lib/repeats.ts` | A repeating card's series: `makeNext` (once, row locked), `takeBack` (on reopen, if untouched), `catchUp` (the morning) |
| `lib/morning.ts`, `lib/reminders.ts`, `app/chest-jobs/[name]/route.ts` | The weekday morning (schedule `morning`): reminders, catch-up, badges; the per-person switch and taking an item back |
| `lib/clock.ts` | "Today" in the Chest's time zone (`chest.timeZone()`) — server only |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/audience.ts` | Who sees a board, for pickers |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/**/page.tsx` | Pages (server): read, resolve names, hand words to views |
| `app/chest/boards/[id]/board-view.tsx` | The board (client): dnd-kit (Enter opens, Space picks up), keyboard moves, filters, the archive-column dialog |
| `app/chest/boards/[id]/list-view.tsx`, `calendar-view.tsx` | The list (sort, group, done hidden) and the calendar (drag a card to a day) |
| `app/chest/boards/[id]/card-panel.tsx` | A card (client): Mark done, dates, fields, checklists, Move or copy |
| `lib/theme.ts`, `app/tokens.css`, `app/globals.css` | The identity "Workshop" (the catalogue's `workshop` theme, `identityOf("tasks")`) and the page's look (`currentLook`: the company's choice, else the identity); the tool's own tokens (column width, board and label colours → palette slots); its components' CSS, contract tokens only |
| `components/shell.tsx`, `app/chest/layout.tsx` | The kit's `AppShell` (sections, card search, member chip), `BrandMark`, `NoAccess`, `Toasts` |
| `app/chest/export/route.ts` | Every board in one JSON file (managers) |
| `app/chest/api/cards/[id]/upload/route.ts`, `app/chest/files/[id]/route.ts` | Files: authorise, record, open |
| `migrations/` | Schema. Never edit a shipped file; add the next number (`0004_…`) |
| `seed/sample.sql` | Sample boards for local runs |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids.
- **Every service function takes `(sql, actor, …)`**, checks access through
  `board()`/`card()` (a board the actor cannot see is `not_found`, never
  `forbidden`: private boards do not leak), and throws `AppError(code)`.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role.
- **Client components import only** `lib/i18n/format.ts`, `lib/app-error.ts`,
  `lib/parse-import.ts`, `@argentic/chest-ui/components` (and
  `/components/logic`) and types. Never the SDK,
  `lib/db.ts`, `lib/session.ts` (the build fails: `node:crypto`).
- **The UI kit first** (`@argentic/chest-ui/components`, `ui/README.md`):
  toasts (`useToast`: `{ id, text, undo }`, the Undo returns `true` or why
  it failed; errors `tone: "error"`), `Dialog` (buttons in `footer`, a
  form's submit with `form=`), `Confirm` for what cannot be undone (never
  `window.confirm`), `PeoplePicker` (`localSearch` over the board's people),
  `DateField` (never `type="date"`; `today` from the server), `FilePicker`
  (+ `putWithProgress`), `Menu`, `Avatar`, `EmptyState`. Their words are
  the catalogues' `toast`, `dialog`, `peoplePicker`, `date`, `files`,
  `searchBox` sections. Also the kit's (0.2.2): the board's view switch
  (`Segmented`, link variant, `link={Link}`), the due time (`TimeSelect`
  with `empty` "Any time"), the step's person (`PeoplePicker clearable`),
  the personal switches (`Switch`), the faces on a card and in the list
  (`AvatarStack`); `link={Link}` is Next's `Link` as it is (no wrapper).
  Kept on purpose: the who/label filter selects (they sit on the board's
  own colour, where the kit's `Filters` label and "Clear filters" colours
  are not measured pairs), the list view's table (grouping: `DataTable`
  has no groups), the "@" mention list (it writes into the text, with the
  kit's `searchChoices`), the importer's three source cards.
- **The identity is the catalogue's** (`identityOf("tasks")` in
  `lib/theme.ts`), never a copy: change Workshop in `ui/src/themes.ts`.
- **Only contract tokens in CSS** (`ui/tokens/CONTRACT.md`); a tool token is
  defined from them in `app/tokens.css`; never a colour
  (`test/theme.test.ts`). Text on a board colour is `--c-ink` on `--c`.
- **French typography**: `node scripts/lint-words.mjs tools/private/tasks`
  must stay at 0 errors (narrow no-break spaces; Undo is « Annuler
  l’action »; Delete = Supprimer, Remove = Retirer).
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **Drag ids are prefixed** (`card:`, `lane:`): a card and a column may
  share a number.
- **Files**: authorise with `files.uploadUrl` in a `/chest` route after the
  access check; record only after `files.stat`; open through
  `/chest/files/<id>` (a fresh signed link), never put a signed link in a page.
- **The keyboard opens cards**: the board's `KeyboardSensor` starts on
  Space only; Enter is the card's own (it opens it). Keep it so.
- **A new sender of news** (a card or step given, a mention) goes through
  `lib/tell.ts` with the database, which rings the bell and sends the email
  to those who did not turn it off; never `mail.send` directly.
- **Something that points at a card from elsewhere** (a step's assignee, a
  field value) must be handled where a card moves between boards
  (`carry()` in `lib/cards.ts`) and where a member leaves (`lib/lifecycle.ts`).
- **"Today" is `chestToday()`** (`lib/clock.ts`), never the server's date
  or a hard-coded zone; the morning uses its run's `scheduledAt` and
  `timeZone`.
- **Every path that completes a card calls `makeNext`, every path that
  reopens one `takeBack`**, inside its transaction (`moveCard`,
  `updateColumn`). A card makes its next one once: `next_card_id`.
- **No network, no disk, no background work** but the declared schedule
  (`chest.proposals.json`). Other deferred work runs on the next request
  (the badge refresh on the home page).
