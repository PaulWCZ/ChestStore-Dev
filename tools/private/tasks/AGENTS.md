# Adapting Tasks — a guide for AI agents

`README.md` says what Tasks does; this page says where things are and what
must not break.

## Map

Tasks is built on `@argentic/chest-app` (in `vendor/`): read its
`AGENTS.md` (`node_modules/@argentic/chest-app/AGENTS.md`) for how pages,
islands, actions, refresh and words work. Here, what is Tasks' own.

| Path | What it is |
|---|---|
| `chest.json` | Manifest (contract 0.4): roles `manager`, `member`, `viewer`; `database`, `files`, `members`, `notifications`; `receives`; schedules `morning`, `retry`; `build.static: ["/assets/"]`. Proposals in `chest.proposals.json` (`calendar`, `emits`, `capabilities: ["members.groups"]`, `receives`, `translations`) |
| `src/app.tsx` | Every route: `createApp` (actions, islands, words, layouts, `look` = the company's choice, `head`), the pages, the downloads, `/chest/files/<id>`, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | Every change, by name (`act()` = an action, then the calendars and the linked tools after the answer) |
| `src/pages/` | `MyTasks`, `Boards`, `Board` (the board and the open card; the calendar's month and the timeline's window written here; `/chest/cards/<id>`), `Settings`, `Search`, `Import` |
| `src/islands/` | `BoardView` (dnd-kit; with `ListView`, `CalendarView`, `TimelineView` inside it), `CardPanel`, `BoardSettings`, `Importer`, `TaskGroups`, `NewBoard`, `Switches`, `SearchBox`, `AutoRefresh`; `index.ts` lists them |
| `src/components/` | Shared by pages and islands: icons, the mark, Markdown, board tiles |
| `src/layout.tsx` | The kit's shell, the brand's logo (`look.logo`), `NoAccess` for a role that gives nothing, the toasts |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css`, `src/timeline-grid.css` | Workshop (`identityOf("tasks")`) and the page's look (`pageLook`); the tool's tokens; its CSS (contract tokens only); the timeline's place classes |
| `src/lib/access.ts` | **Who may do what**: tool abilities (`can`) and a board's access (`boardAccess`: none, read, comment, write, own) |
| `src/lib/boards.ts` | Boards (shared at creation), columns (archived with or after moving their cards), labels, fields, board people and groups |
| `src/lib/cards.ts` | Cards, assignees, checklists and steps (subtasks), field values, comments (removed with Undo, purged after 10 min), files, history, moving and copying to another board, My tasks and my steps, search, the tile's count |
| `src/lib/due-calendar.ts` | Due dates in each person's Chest calendar (Proposal (studio) `calendar`) |
| `src/lib/tell.ts`, `src/lib/notify.ts` | The bell (`notice()`: English with its French as `translations`; the Chest shows each member theirs) and badges |
| `src/lib/repeats.ts`, `src/lib/morning.ts`, `src/lib/reminders.ts` | A repeating card's series; the weekday morning; the reminder's switch |
| `src/lib/deliveries.ts` | What the Chest posts: events (`onEvent`) and schedule runs (`onSchedule`), each id kept (`chest_events`, 30 days) |
| `src/lib/lifecycle.ts`, `src/lib/groups.ts`, `src/lib/audience.ts`, `src/lib/people.ts`, `src/lib/export.ts`, `src/lib/importers.ts`, `src/lib/card-events.ts`, `src/lib/clock.ts`, `src/lib/db.ts` | Leaving and erasure; the Chest's groups that may share a board (`members.groups`, kept a minute); who sees a board; names (former, no access, erased); exports; writing an import; events to Goals; "today" in the Chest's zone; the database |
| `src/shared/` | Rules used by the server **and** the islands, pure: `repeat.ts`, `calendar.ts` (and the month/timeline window types), `parse-import.ts`, `csv.ts`, `model.ts`, `markdown.ts`, `position.ts`. They refuse with `fail`/`AppError` from `@argentic/chest-app/client` |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` (kept Intl objects, for pages and islands) |
| `migrations/` | Schema. Never edit a shipped file; add the next number |
| `seed/sample.sql` | Sample boards for local runs |
| `test/` | `node:test`: the services against PostgreSQL (PGlite or `TEST_DATABASE_URL`), `app.test.ts` against the built server, `sources.test.ts` (the package's checks) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **"Blocked by"**: `cards.moveCard` refuses `blocked` (values `count`,
  `title`) when a card goes into a done column with open blockers, unless
  `{ force: true }`; every caller that marks done offers the toast action
  "Mark done anyway". Links join cards of one board (`addBlocker` checks
  the board and loops).
- **Tasks sends no email** (the owner's decision, 6 October 2026): members
  are told by notifications only, and the Chest mails them by each one's
  choice. Never `mail.send`, never a digest or an "email me" setting.
- **Column names**: read columns with `{ words: t.templates.columns }` (a
  template's column has a `key`, named in the reader's language).
- **Identity only from the Chest**: `member` in `page()`/`action()`; store `mbr_…` ids.
- **Every service function takes `(sql, actor, …)`**, checks access through
  `board()`/`card()` (a board the actor cannot see is `not_found`, never
  `forbidden`: private boards do not leak), and throws `AppError(code)`.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role.
- **Islands import only** React, the kit, `@argentic/chest-app/client`,
  `src/components/`, `src/shared/`, `src/i18n/format.ts` and types — never
  the SDK, `src/lib/` or `src/actions.ts` (`test/sources.test.ts` fails).
- **No inline style**: a drag's transform is set on the element through a
  ref (`useLayoutEffect`), a size from data is a class (the timeline's
  `tl-from-N`…) or `<progress>`; `style={}` fails the tests.
- **A column's order has one writer at a time**: every path that reads a
  column's edge or a neighbour's key to place a card does it in a
  transaction that first calls `lockColumn(tx, column)` (`src/lib/cards.ts`;
  `repeats.ts` and `boards.ts` lock the same row). Two cards never share a
  key; a move between two that do (an older version's) re-spaces the
  column. Quick adds and new steps are also sent one after the other by
  their island, so they keep the order typed.
- **One panel per card**: the card's island has `id="card-panel-<id>"`, so
  another card opened in place is a new root (no draft, no open editor of
  the last one); closing it gives the focus back to the element with
  `data-card="<id>"` that opened it (board, list, calendar, timeline).
- **Dates and numbers of the board are written on the server** (`written`
  props of `BoardView`: short and long days, a number field's values);
  the islands never format.
- **Why Tasks keeps its own `db()` and `seen`**: `src/lib/db.ts` lets the
  services' tests hand it their connection (`provide`), and the ids of the
  Chest's deliveries are in `chest_events` (migration 0001, older than the
  package's `chest_seen`). Its formats (`src/i18n/format.ts`) are the same
  kept Intl objects as the package's `f`, also used by islands. Moving to
  the package's would cost a migration and the tests' wiring for nothing
  the tool lacks.
- **The board's state while a card moves**: `BoardView` shows the server's
  lanes, except while a card is dragged or its move is on its way
  (`moving`); a refresh meanwhile never moves the card in hand. Opening a
  card, a filter, a month: `navigate(…, { top: false })` (the board keeps
  its scroll); a view: from the top.
- **A drag between columns** follows dnd-kit's multi-column guard: the
  collision keeps its last answer for one frame after a card changed
  column, and `onDragOver` reads the lanes from a ref and ignores the card
  itself (else the card bounces between two columns until React stops it,
  error #185, and the board vanishes).
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
  (`AvatarStack`); the view switch's links navigate in place (`ToTop` in
  `BoardView`). In an island, `toast()` of the package, never `useToast()`.
  Kept on purpose: the who/label filter selects (they sit on the board's
  own colour, where the kit's `Filters` label and "Clear filters" colours
  are not measured pairs), the list view's table (grouping: `DataTable`
  has no groups), the "@" mention list (it writes into the text, with the
  kit's `searchChoices`), the importer's three source cards.
- **The identity is the catalogue's** (`identityOf("tasks")` in
  `src/theme.ts`), never a copy: change Workshop in `ui/src/themes.ts`.
- **Only contract tokens in CSS** (`ui/tokens/CONTRACT.md`); a tool token is
  defined from them in `src/tokens.css`; never a colour
  (`test/theme.test.ts`). Text on a board colour is `--c-ink` on `--c`.
- **French typography**: `node scripts/lint-words.mjs tools/private/tasks`
  must stay at 0 errors (narrow no-break spaces; Undo is « Annuler
  l’action »; Delete = Supprimer, Remove = Retirer).
- **Words live in `src/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **Drag ids are prefixed** (`card:`, `lane:`): a card and a column may
  share a number.
- **Files**: authorise with `files.uploadUrl` in an action after the
  access check (`uploadFile`); record only after `files.stat`
  (`recordFile`); open through
  `/chest/files/<id>` (a fresh signed link), never put a signed link in a page.
- **The keyboard opens cards**: the board's `KeyboardSensor` starts on
  Space only; Enter is the card's own (it opens it). Keep it so.
- **A new sender of news** (a card or step given, a mention) goes through
  `src/lib/tell.ts`, which rings the bell in every language (`notify.ts`'s
  `notice()`: the words of both catalogues).
- **Links to a card from outside a page** (bell, calendar) are
  `/chest/cards/<id>`, never a board's path: a card moves between boards.
- **What makes a card or step due for someone** (its column done, archived,
  its board's people) is read by `src/lib/due-calendar.ts`'s `eligible()` too:
  a new way to finish or hide a card must be reflected there.
- **An import settles what is finished with `arrange()`** on both sides
  (the check shows it; the server does it again with the ticked columns);
  never mark a column done after writing.
- **Something that points at a card from elsewhere** (a step's assignee, a
  field value) must be handled where a card moves between boards
  (`carry()` in `src/lib/cards.ts`) and where a member leaves (`src/lib/lifecycle.ts`).
- **"Today" is `chestToday()`** (`src/lib/clock.ts`), never the server's date
  or a hard-coded zone; the morning uses its run's `scheduledAt` on the
  Chest's zone (`chest.timeZone`).
- **Every path that completes a card calls `makeNext`, every path that
  reopens one `takeBack`**, inside its transaction (`moveCard`,
  `updateColumn`). A card makes its next one once: `next_card_id`.
- **No network, no disk, no background work** but the declared schedules
  (`chest.json`). Other deferred work runs on the next request
  (the badge refresh on the home page).
