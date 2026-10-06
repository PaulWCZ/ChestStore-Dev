# Adapting Wiki — a guide for AI agents

`README.md` says what the wiki does; this page says where things are and
what must not break.

The stack is the studio's starter: Hono + React rendered on the server +
islands + Vite, on the package `@argentic/chest-app` (vendored; its
`AGENTS.md` in `node_modules/@argentic/chest-app/` is the reference for
pages, actions, islands, `call()`, `refresh()`, `navigate()`, `fail()`,
`notFound()`). Never copy or patch the package: a generic need goes into
the studio's `app/`.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest (contract 0.4): roles `editor`, `reader`; `database`, `files`, `members`, `notifications`; `receives`; the `reviews` schedule (weekdays 07:40); `build.static: ["/assets/"]` |
| `chest.proposals.json` | Proposals of the studio's SDK: `mail` (send), `groups: read` and `receives: ["group.*"]`, the French tile |
| `src/app.tsx` | **Every route**: `createApp({…})` (actions, islands, words, layouts, `complete: withGroups`, the look), the pages, files, downloads, the import's upload, the editor's beacon, `/chest-events`, `/chest-schedules` |
| `src/calls.ts` | What is not a page nor an action, as plain functions of a Request: `chestEvents`, `chestSchedules` (`reviews`), `leaveEditor` (the beacon), `importUpload`, `openFile`, the exports, `readsCsv` |
| `src/actions.ts` | **Every mutation**, by name (`call("movePage", …)` from an island); thin: the rules are in `src/lib/`. Times the editor shows (a lock's, a draft's) are written here, in the member's zone |
| `src/frame.tsx` | Around every page of /chest: the sidebar's tree (an island), `NoAccess` for a member without a role; what the layout's Trash tab depends on |
| `src/layout.tsx` | The kit's `AppShell` (sections Home · Pages · Search · Trash as labelled tabs, `BrandMark`, member chip, the header's search), the toasts (outside `<main>`, `id="toasts"`: they survive `navigate()`) |
| `src/pages/` | The pages, rendered on the server: `Home`, `Pages`, `Space`, `SpaceSettings`, `Page` (read), `Edit`, `History`, `Reads`, `Search`, `Synonyms`, `Trash`, `Import`, `PublicHome` |
| `src/islands/` | What runs in the browser, listed in `index.ts`: `Sidebar`/`Contents` (the tree, drag and drop, new page and new space dialogs), `PageActions` (+ `ReviewAsk`, `DraftNotice`, `ReadRequest`), `Comments`, `Editor` (the lock, then `editor/Writing.tsx`: Tiptap, toolbar, `paste.ts`, the "/" menu `slash.tsx`, `extensions.ts` = the schema on the browser's side — a chunk fetched only when the editor opens), `Buttons` (new page, new space, example handbook, a menu of links), `History` (restore, reads' actions), `SpaceSettings`, `SynonymsEditor`, `TrashRow`, `Importer`, `Page.tsx` (`Search`, `Ready`, `AutoRefresh`, `Flash`) |
| `src/components/` | Shared by pages and islands (no server code): icons, the mark, the tree, the new page and new space dialogs, `prose.tsx` (a page's HTML as the server wrote it: the one place HTML goes in as it is) |
| `src/shared/` | Pure rules both sides use: `doc.ts` (the document's types, `safeHref`, `safeImage`, bounds), `model.ts` (limits, timings, colours, `linkParts`) |
| `src/lib/access.ts` | **Who may do what**: abilities (`can`) and a space's access (`spaceAccess`: none, read, write — seeing by `visibility`/groups, editing by `editing`/`editors`; `private` = "My pages", its creator's alone, admins included out) |
| `src/lib/doc.ts` | **The document schema**: `normalize()` (the only door for content), `lines`/`plainText`, `references` — pure |
| `src/lib/render.ts` | Document → HTML, every word escaped — pure |
| `src/lib/markdown.ts` | Markdown in (markdown-it → document) and out |
| `src/lib/spaces.ts`, `src/lib/pages.ts` | Spaces; the tree, pages, moves, trash, recent, backlinks, `writeContent` (every new version goes through it) |
| `src/lib/editing.ts` | The lock (taken, kept by `heartbeat`, given back by `leave` — the beacon — lapsing after `lockLeaseSeconds`), drafts, `publish` |
| `src/lib/history.ts` | Versions, the comparison in words, restore |
| `src/lib/search.ts`, `src/lib/synonyms.ts` | Full-text search (stems, compounds, typos, little words, synonyms, the relevance floor) and the words that mean the same |
| `src/lib/mail.ts` | Email beside the bell (Proposal (studio) `mail`) |
| `src/lib/files.ts` | Files of pages (records; the bytes are the Chest's; a name as the Chest gives it, with or without an extension) |
| `src/lib/importer.ts`, `zip.ts`, `html.ts`, `docx.ts` | Imports (Markdown, Notion, Confluence, Google Docs, Word, HTML), never HTML kept |
| `src/lib/export.ts`, `origin.ts` | Markdown, HTML and zip exports; the team host's address (`chest.tool.teamUrl`) |
| `src/lib/comments.ts`, `watching.ts`, `templates.ts`, `reviews.ts`, `reads.ts`, `pins.ts` | Comments, watching, templates, review reminders, read and acknowledged, pins |
| `src/lib/groups.ts` | Every group of the Chest and each person's groups (`withGroups`, `withAllGroups`), kept a minute, forgotten on `group.*` events |
| `src/lib/tell.ts`, `notify.ts` | **Everything the bell says**, each recipient checked against the space's access at that moment; the `reviews` schedule's work |
| `src/lib/starter.ts`, `lifecycle.ts`, `people.ts`, `db.ts` | The example handbook; leaving and erasure; names (former, no access, erased); the package's `db()` |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`; `index.ts` (`catalogue`, `format`, `plural`, `formatDate`, `relative`, `moment`, `orList` — Intl objects made once per language and zone) |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity "Library" (`defineTheme`), the look of a request as a stylesheet (`lookFor`: `/chest/look.css`); the wiki's own tokens; its CSS (`.island` is `display: contents`: select an island's insides by class, never with `>` from outside) |
| `migrations/` | Schema. Never edit a shipped file; add `0007_…` |
| `seed/` | `pages/*.md` + `spaces.json` → `build.ts` → `sample.sql` |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (`support/db.ts`: the package's `testDatabase`, TEST_DATABASE_URL else PGlite with `unaccent` and `pg_trgm`); `app.test.mjs` asks the built server (`dist/test`); `stack.test.ts` the package's `checkSources({ requireTests: true })`; `i18n.test.ts` its `checkWords()`; `test/fixtures/` files shaped as Confluence, Google Docs and Word export them |

## The UI kit (`@argentic/chest-ui`, vendored in `vendor/`)

The wiki uses the kit's components rather than its own: toasts (the
package's `toast()` from an island, which reaches the layout's `ToastHost`;
one toast per action id; `undo` resolves `true` or says why not), `Dialog`
(opens on its first field; `dirty` asks before losing typed text), `Confirm`
(only *Delete for good*), `Menu` (a page's and a space's *More*),
`AppShell`/`BrandMark`/`NoAccess`, `SearchBox`, `Avatar`, `EmptyState`,
`Tabs` (history, plain links), `StatusBadge` (reads),
`FilePicker` (import),
`LanguageSwitch` (public page), `useAutoRefresh`; `searchChoices` and
`matches` (the store's search rule) for "@" mentions, the page picker and
the editors filter. Its words are the catalogues' `kit` section (`toast`,
`dialog`, `search`, `files`). `Menu` takes `size="m"` (as tall as the
wiki's buttons) and `download` on export items; a component that opens
(Menu, Dialog) is always inside an island (`LinkMenu` for a menu of links). Long text uses the contract's `--font-read`,
never a font of the wiki's own; titles use `--font-display`. The wiki
keeps its own "/" menu (a
listbox that inserts blocks at the caret, not a menu button), its "@"
list, its buttons, fields and choice cards, and its sidebar tree.
Re-vendor with `node scripts/add-ui.mjs tools/private/wiki` (from the
studio's root).

## Commands

```sh
npm ci && npm run build && npm test        # all must pass (Node 24)
TEST_DATABASE_URL=postgres://… npm test    # the same on a real PostgreSQL
NODE_ENV=development npm test              # as Perseus's workbench runs it
```

## Rules

- **Identity only from `member`** (`page()`/`action()`: the package reads the Chest's assertion, `complete` adds every group); store `mbr_…` ids.
- **Every service function takes `(sql, actor, …)`**, checks access through
  `space()`/`page()` (a space or page the actor cannot see is `not_found`,
  never `forbidden`), and throws `AppError(code)`.
- **Content only through `normalize()`**, HTML only from `render()`. A new
  node or mark means: `src/lib/doc.ts` (schema + bounds), `src/lib/render.ts`,
  `src/lib/markdown.ts` (both ways), `src/islands/editor/extensions.ts` (editor), CSS, and tests
  in `test/doc.test.ts` — including what must be refused.
- **Nothing a person pasted vanishes silently**: `normalize(doc, dropped)`
  counts the pictures it leaves out; `publish` answers `dropped` and the
  page says it. A new kind of content the schema refuses needs the same.
- **"My pages" is private for everyone else**: a `private` space answers
  `none` to all but its creator (never an admin rule before it); a page
  of a shared space never moves in; nothing asks others about it.
- **New versions only through `writeContent()`**: it keeps the search words
  and the links table right.
- **Islands import only** `@argentic/chest-app/client`, the kit,
  `src/components/`, `src/shared/` and types (`checkSources` refuses the
  SDK, `src/lib/`, the actions). The browser formats nothing: dates and
  times come written by the server (an action returns them written).
- **Send documents to actions as JSON strings** (ProseMirror objects are
  not plain data for an island's props nor an action's fields).
- **No inline style, no style element**: the page's policy refuses them.
  Tiptap runs with `injectCSS: false` (its base styles are in
  `src/styles.css`); the "/" menu and the quote offer are placed through
  their element's `style` from a ref; pasted HTML has its style attributes
  renamed before anything parses it in the page (`paste.ts`, `unstyled`),
  and their bold, italics and strike become marks.
- **Words live in `src/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **Compare timestamps in SQL**, never through JavaScript `Date`s
  (PostgreSQL keeps microseconds).
- **Writing in a space is `space(…, "write")` / `page(…, "write")`**, never
  `can(actor, "write")` alone: a space may name its editors.
- **An import never keeps HTML**: HTML and Word become documents in
  `src/lib/html.ts` / `src/lib/docx.ts`, then `normalize()`. A new format comes
  with a fixture shaped as the other product writes it (`test/fixtures/`)
  and its source in `THIRD_PARTY.md`.
- **Tell people only through `src/lib/tell.ts`**: it drops anyone who cannot
  read the page now and the actor; a new reason gets its own key, replaced
  per page, and is withdrawn in `forget()`/`moved()`.
- **Never a colour in CSS or a page**: contract tokens only (`--bg`,
  `--ink`, `--accent-text`, `--line-strong`, `--cat-N`…), the wiki's own
  tokens defined from them in `src/tokens.css`; text only on a measured pair
  (`--cat-N-ink` on `--cat-N-soft`, `--ink` on `--highlight`…). The mark
  (`src/components/mark.tsx`, `chest/icon.svg`) is the one fixed drawing.
  `test/theme.test.ts` checks it.
- **A space's colour is a categorical slot** (`.color-*` in
  `src/styles.css`): green 2, blue 1, plum 4, rust 3, ochre 7, slate 8.
- **Reversible → a toast with Undo; irreversible → `Confirm`**; never
  `window.confirm`, never "Are you sure?". Words follow `lab/GLOSSARY.md`
  (`node scripts/lint-words.mjs tools/private/wiki` must say 0).
- **No network, no disk, no background work** (timed work is the
  `reviews` schedule of `chest.json`, run on `POST /chest-schedules`).
- **A deleted comment leaves the bell at once** (`tell.commentGone` after
  `comments.removeComment`); any new place that shows a comment's words to
  others must record it in `comment_notices`.
- **Imports keep their source's date** through `writeContent({ at })`;
  the home page's *Recently updated* uses `recent({ withoutImports: true })`.
