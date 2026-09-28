# Adapting Wiki — a guide for AI agents

`README.md` says what the wiki does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `editor`, `reader`; `database`, `files`, `members`; `receives` |
| `lib/access.ts` | **Who may do what**: abilities (`can`) and a space's access (`spaceAccess`: none, read, write) |
| `lib/doc.ts` | **The document schema**: `normalize()` (the only door for content), `safeHref`, `lines`/`plainText`, `references` — pure, browser-safe |
| `lib/render.ts` | Document → HTML, every word escaped — pure |
| `lib/markdown.ts` | Markdown in (markdown-it → document) and out |
| `lib/spaces.ts`, `lib/pages.ts` | Spaces; the tree, pages, moves, trash, recent, backlinks, `writeContent` (every new version goes through it) |
| `lib/editing.ts` | The lock, drafts, `publish` |
| `lib/history.ts` | Versions, the comparison in words, restore |
| `lib/search.ts` | Full-text search (`wiki` text search config) with marked passages |
| `lib/files.ts` | Files of pages (records; the bytes are the Chest's) |
| `lib/importer.ts`, `lib/zip.ts` | Imports (Markdown, Notion zip) and a bounded in-memory ZIP reader/writer |
| `lib/export.ts`, `lib/origin.ts` | Markdown, HTML and zip exports |
| `lib/starter.ts` | The one-click example handbook (words in the catalogues' `starter`) |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/layout.tsx`, `components/shell.tsx` | The frame: header, sidebar tree (drag and drop), drawer on phones |
| `app/chest/pages/[id]/edit/` | The editor (client): Tiptap, toolbar, uploads, link and page pickers; `extensions.ts` = the schema on the client side |
| `app/chest/**/page.tsx` | Pages (server): read, resolve names, hand words to views |
| `migrations/` | Schema. Never edit a shipped file; add `0002_…` |
| `seed/` | `pages/*.md` + `spaces.json` → `build.ts` → `sample.sql` |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids.
- **Every service function takes `(sql, actor, …)`**, checks access through
  `space()`/`page()` (a space or page the actor cannot see is `not_found`,
  never `forbidden`), and throws `AppError(code)`.
- **Content only through `normalize()`**, HTML only from `render()`. A new
  node or mark means: `lib/doc.ts` (schema + bounds), `lib/render.ts`,
  `lib/markdown.ts` (both ways), `extensions.ts` (editor), CSS, and tests
  in `test/doc.test.ts` — including what must be refused.
- **New versions only through `writeContent()`**: it keeps the search words
  and the links table right.
- **Client components import only** `lib/i18n/format.ts`, `lib/app-error.ts`,
  `lib/doc.ts`, `lib/model.ts`, `lib/initials.ts` and types. Never the SDK,
  `lib/db.ts`, `lib/session.ts` (the build fails: `node:crypto`).
- **Send documents to server actions as JSON strings** (ProseMirror objects
  are not plain objects for React's serializer).
- **No injected styles**: Tiptap runs with `injectCSS: false`; its base
  styles are in `app/globals.css` (the CSP allows no style element without
  the nonce).
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **Compare timestamps in SQL**, never through JavaScript `Date`s
  (PostgreSQL keeps microseconds).
- **No network, no disk, no background work.**
