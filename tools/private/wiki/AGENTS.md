# Adapting Wiki — a guide for AI agents

`README.md` says what the wiki does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `editor`, `reader`; `database`, `files`, `members`; `receives` |
| `lib/access.ts` | **Who may do what**: abilities (`can`) and a space's access (`spaceAccess`: none, read, write — seeing by `visibility`/groups, editing by `editing`/`editors`; `private` = "My pages", its creator's alone, admins included out) |
| `lib/doc.ts` | **The document schema**: `normalize()` (the only door for content), `safeHref`, `lines`/`plainText`, `references` — pure, browser-safe |
| `lib/render.ts` | Document → HTML, every word escaped — pure |
| `lib/markdown.ts` | Markdown in (markdown-it → document) and out |
| `lib/spaces.ts`, `lib/pages.ts` | Spaces; the tree, pages, moves, trash, recent, backlinks, `writeContent` (every new version goes through it) |
| `lib/editing.ts` | The lock (taken, kept by `heartbeat`, given back by `leave` — the beacon route `app/chest/api/pages/[id]/leave` — lapsing after `lockLeaseSeconds`), drafts (`discardDraft`/`keepDraft` from the page), `publish` |
| `lib/history.ts` | Versions, the comparison in words, restore |
| `lib/search.ts` | Full-text search (`wiki` text search config; stems through `wiki_en`/`wiki_fr` and `pages.stems` (migrations/0005); the relevance floor `kept()`; `segments()` joins "Wi"-"Fi" into one mark; hyphenated words joined by `wiki_compounds` in the index; typos through `search_words` and trigrams; little words out (`stopWords`); synonym groups as one word (`units`); all words first, then some) with marked passages |
| `lib/synonyms.ts` | Words that mean the same (table `synonyms`, seeded in `migrations/0004`): terms as search reads them (`termOf`, `phrase`), editors' add/change/delete; page `app/chest/search/synonyms/` |
| `lib/mail.ts` | Email beside the bell (Proposal (studio) `mail`): `email(people, write, key)` — read requests, reminders, review reminders |
| `lib/files.ts` | Files of pages (records; the bytes are the Chest's) |
| `lib/importer.ts`, `lib/zip.ts` | Imports (Markdown, Notion zip, Confluence HTML export, Google Docs HTML, Word, any HTML) and a bounded in-memory ZIP reader/writer |
| `lib/html.ts`, `lib/docx.ts` | HTML → document (Confluence's macros, tree and attachments; Google Docs' class styles) and Word → document; never HTML kept, always through `normalize()` |
| `lib/export.ts`, `lib/origin.ts` | Markdown, HTML and zip exports |
| `lib/comments.ts` | Comments: read, add (a reply: `parentId`, one level; a passage: `quote`), edit (own), resolve (author or editors), remove (own, or the page's editors; a top comment hides its replies) and Undo — always through `page()`, so a comment follows its page's access |
| `lib/watching.ts` | Watching a page |
| `lib/templates.ts` | Templates: the flag, a space's templates, the built-in models (words in the catalogues' `templates.builtin`), `createFrom` |
| `lib/reviews.ts` | Review reminders: set, "still correct", due pages |
| `lib/reads.ts` | Read and acknowledged: ask (everyone or groups), confirm, the report (`/reads`, `/reads/csv` with `csvCell`), pages to read |
| `lib/pins.ts` | Pages pinned to the home page |
| `lib/groups.ts` | Every group of the Chest (`companyGroups`: `groups.all()` with the proposal, else the groups that give the wiki; cached a minute, `forgetGroups` on group events) and members of the tool (`membersOfTool`, `editorsOfTool`); each person's groups asked of the Chest (`withGroups`: `members.groups.of`, for `currentMember()`; `withAllGroups`: the groups' members, for lists), since `member.groups` lists only the groups that give the wiki |
| `lib/tell.ts` | **Everything the bell says** (keys `comments:`, `saved:`, `review:`, `read:`, `mention:`), each recipient checked against the space's access at that moment; `comment_notices` (which comment an item shows: `commentGone`/`commentShown`); emails of read requests and reminders (`readAsked`, `remindReaders`); the `reviews` schedule's work (review reminders, reminders a week after an ask); `reconcileReads` on group changes |
| `app/chest-jobs/[name]/route.ts` | Scheduled tasks (proposal): `reviews` |
| `lib/starter.ts` | The one-click example handbook (words in the catalogues' `starter`) |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `lib/theme.ts` | **The look**: the identity (Library, `defineTheme`, equal to the catalogue's `library`) and `currentLook()` (the company's theme or brand, else the identity) |
| `app/tokens.css`, `app/globals.css` | The wiki's own tokens (defined from contract tokens) and its components (contract tokens only) |
| `app/layout.tsx` | `<ThemeStyle>` with the page's nonce, `themeColor` from the look, the kit's `components.css` first |
| `app/chest/layout.tsx`, `components/shell.tsx`, `components/tree.tsx` | The frame: the kit's `AppShell` (sections Home · Pages · Search · Trash as labelled tabs, `BrandMark`, member chip, `NoAccess`), the header's `SearchBox`, the sidebar tree (drag and drop) on wide screens |
| `app/chest/pages/page.tsx` | "Pages": the same tree on a page of its own (the way to the pages on a phone) |
| `app/chest/pages/[id]/edit/` | The editor (client): Tiptap, toolbar, `paste.ts` (pictures in pasted HTML: the web's become a warning note, the clipboard's are uploaded, ours keep a relative address), the "/" menu (`slash.tsx`), uploads, link and page pickers, heartbeat and leave; `extensions.ts` = the schema on the client side |
| `app/chest/**/page.tsx` | Pages (server): read, resolve names, hand words to views |
| `migrations/` | Schema. Never edit a shipped file; add `0007_…` |
| `seed/` | `pages/*.md` + `spaces.json` → `build.ts` → `sample.sql` |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`); `test/fixtures/` holds files shaped as Confluence, Google Docs and Word export them |

## The UI kit (`@argentic/chest-ui`, vendored in `vendor/`)

The wiki uses the kit's components rather than its own: `Toasts`/`useToast`
(one toast per action id; `undo` resolves `true` or says why not), `Dialog`
(opens on its first field; `dirty` asks before losing typed text), `Confirm`
(only *Delete for good*), `Menu` (a page's and a space's *More*),
`AppShell`/`BrandMark`/`NoAccess`, `SearchBox`, `Avatar`, `EmptyState`,
`Tabs` (history; Next's `Link` through `components/link.tsx`, the
`"use client"` re-export a server page may pass), `StatusBadge` (reads),
`FilePicker` (import),
`LanguageSwitch` (public page), `useAutoRefresh`; `searchChoices` and
`matches` (the store's search rule) for "@" mentions, the page picker and
the editors filter. Its words are the catalogues' `toast`, `dialog`,
`searchBox` and `files` sections. `Menu` takes `size="m"` (as tall as the wiki's buttons), `link` and
`download` on export items. Long text uses the contract's `--font-read`,
never a font of the wiki's own; titles use `--font-display`. The wiki
keeps its own "/" menu (a
listbox that inserts blocks at the caret, not a menu button), its "@"
list, its buttons, fields and choice cards, and its sidebar tree.
Re-vendor with `node scripts/add-ui.mjs tools/private/wiki` (from the
studio's root).

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
- **Nothing a person pasted vanishes silently**: `normalize(doc, dropped)`
  counts the pictures it leaves out; `publish` answers `dropped` and the
  page says it. A new kind of content the schema refuses needs the same.
- **"My pages" is private for everyone else**: a `private` space answers
  `none` to all but its creator (never an admin rule before it); a page
  of a shared space never moves in; nothing asks others about it.
- **New versions only through `writeContent()`**: it keeps the search words
  and the links table right.
- **Client components import only** `lib/i18n/format.ts`, `lib/app-error.ts`,
  `lib/doc.ts`, `lib/model.ts`, `@argentic/chest-ui/components` (and
  `/components/logic`) and types. Never the SDK,
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
- **Writing in a space is `space(…, "write")` / `page(…, "write")`**, never
  `can(actor, "write")` alone: a space may name its editors.
- **An import never keeps HTML**: HTML and Word become documents in
  `lib/html.ts` / `lib/docx.ts`, then `normalize()`. A new format comes
  with a fixture shaped as the other product writes it (`test/fixtures/`)
  and its source in `THIRD_PARTY.md`.
- **Tell people only through `lib/tell.ts`**: it drops anyone who cannot
  read the page now and the actor; a new reason gets its own key, replaced
  per page, and is withdrawn in `forget()`/`moved()`.
- **Never a colour in CSS or a page**: contract tokens only (`--bg`,
  `--ink`, `--accent-text`, `--line-strong`, `--cat-N`…), the wiki's own
  tokens defined from them in `app/tokens.css`; text only on a measured pair
  (`--cat-N-ink` on `--cat-N-soft`, `--ink` on `--highlight`…). The mark
  (`components/mark.tsx`, `chest/icon.svg`) is the one fixed drawing.
  `test/theme.test.ts` checks it.
- **A space's colour is a categorical slot** (`.color-*` in
  `app/globals.css`): green 2, blue 1, plum 4, rust 3, ochre 7, slate 8.
- **Reversible → a toast with Undo; irreversible → `Confirm`**; never
  `window.confirm`, never "Are you sure?". Words follow `lab/GLOSSARY.md`
  (`node scripts/lint-words.mjs tools/private/wiki` must say 0).
- **No network, no disk, no background work** (timed work goes through the
  `schedules` proposal, `chest.proposals.json`).
- **A deleted comment leaves the bell at once** (`tell.commentGone` after
  `comments.removeComment`); any new place that shows a comment's words to
  others must record it in `comment_notices`.
- **Imports keep their source's date** through `writeContent({ at })`;
  the home page's *Recently updated* uses `recent({ withoutImports: true })`.
