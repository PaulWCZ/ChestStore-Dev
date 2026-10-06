# Adapting News — a guide for AI agents

`README.md` says what News does; this page says where things are and what
must not break.

The stack is the studio's starter: Hono + React rendered on the server +
islands + Vite, on the package `@argentic/chest-app` (vendored; its
`AGENTS.md` in `node_modules/@argentic/chest-app/` is the reference for
pages, actions, islands, `call()`, `refresh()`, `navigate()`, `fail()`,
`notFound()`). Never copy or patch the package: a generic need goes into
the studio's `app/`.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest (contract 0.4): roles `publisher`, `reader`; `database`, `files`, `members`, `notifications`; `receives`; the `publish` and `digest` schedules; `build.static: ["/assets/"]` |
| `chest.proposals.json` | Proposals of the studio's SDK: `mail` (send), `calendar`, `groups: read` and `receives: ["group.*"]`, the French tile |
| `src/app.tsx` | **Every route**: `createApp({…})` (actions, islands, words, layouts, `complete: withGroups`, the look), the pages, files, downloads, the Slack import, `/chest-events`, `/chest-schedules` |
| `src/calls.ts` | What the Chest calls by itself (`chestEvents`, `chestSchedules`) and the one-tap answer link (`answerLink`): plain functions of a Request, tested directly |
| `src/actions.ts` | **Every mutation**, by name (`call("savePost", …)` from an island); thin: the rules are in `src/lib/` |
| `src/pages/` | The pages, rendered on the server: `Front.tsx` (+ `Story.tsx`), `Post.tsx`, `Compose.tsx` (new, edit), `Propose.tsx`, `Proposals.tsx`, `Search.tsx`, `Transfer.tsx`, `PublicHome.tsx` |
| `src/islands/` | What runs in the browser, listed in `index.ts`: `Composer` (+ `TextEditor` → `Tiptap`, fetched only by the composer), `Post.tsx` (`PostTools`, `ConfirmBox`, `SendingNotice`, `Rsvp`, `Reactions`, `RemindButton`, `AnsweredNotice`), `Comments`, `ProposeForm`/`TakeBack`, `Decide`, `SlackImport`, `DigestSwitch`, `Search`, `AutoRefresh`, `Ready` (the `html[data-hydrated]` marker flows wait for); `upload.ts` (the three-step upload) |
| `src/components/` | Shared by pages and islands (no server code): icons, the mark, `RichText` (a post's text as React elements), `Highlighted` |
| `src/shared/` | Pure rules both sides use: `model.ts` (bounds, kinds, audience), `markdown.ts`, `editor-doc.ts` (text ↔ the editor's document) |
| `src/layout.tsx` | The kit's `AppShell` (search, "Write a post"/"Share something", member chip, the company's logo), `NoAccess`, the toasts (outside `<main>`, `id="toasts"`: they survive `navigate()`) |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity "Newsprint" (`defineTheme`), the look of a request as a stylesheet (`lookFor`); the tool's own tokens; its CSS |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`; `index.ts` (`catalogue`, `format`, `plural`, `formatDate`, `relative`, `orList` — Intl objects made once) |
| `src/lib/access.ts` | **Who may do what** (`can`): read, react, publish, moderate, confirmations; **audience** (`inAudience`, `seesPost`) |
| `src/lib/input.ts` | What a person sends, read and refused with a code (texts, ids, groups, people) |
| `src/lib/posts.ts` | Posts, files, reactions, comments, confirmations, event answers, visits, the tile's count, purge — every service `(sql, actor, …)` |
| `src/lib/proposals.ts` | **Posts from everyone**: propose, mine, waiting, approve (never one's own), decline/restore; seen only by its author and publishers |
| `src/lib/answer-links.ts`, `src/lib/answering.ts` | "I'm coming" from an email: an HMAC token per person, event and button (key in `chest_state`) |
| `src/lib/tell.ts` | The bell, email and the tile: telling Important posts (paged, resumable past the quota, one email per person and version), welcomes, comments, replies, mentions, reminders, a freed seat; `reconcile`; `pass`/`catchUp` |
| `src/lib/mailer.ts`, `agenda.ts`, `state.ts`, `preferences.ts` | Email through the Chest; events in the Chest's calendar; what News learned of the Chest; the digest's email switch |
| `src/lib/transfer.ts`, `zip.ts` | Download all posts (ZIP); import a Slack channel export |
| `src/lib/audience.ts`, `groups.ts` | Who has News (500 a page); the Chest's groups and each person's (`withGroups`, kept a minute) |
| `src/lib/search.ts`, `highlight.ts`, `digest.ts`, `views.ts`, `ics.ts`, `time.ts`, `zone.ts`, `dates.ts`, `lifecycle.ts`, `people.ts`, `db.ts` | Search; the weekly digest; view counts (a number only); `.ics`; days and times on the Chest's clock; leaving and erasure; names; the package's `db()` |
| `migrations/` | Schema. Never edit a shipped file; add `0008_…` |
| `seed/sample.sql` | A small company's month, for local runs |
| `test/` | `node:test`: services with `fakeChest` and PostgreSQL (`support/db.ts`: TEST_DATABASE_URL, else PGlite with `unaccent` and `pg_trgm`); `app.test.mjs` asks the built server (`dist/test`); `stack.test.ts` the package's `checkSources()`; `i18n.test.ts` its `checkWords()` |

## Commands

```sh
npm ci && npm run build && npm test   # all must pass (Node 24)
TEST_DATABASE_URL=postgres://… npm test   # the same on a real PostgreSQL
```

## Rules

- **Identity only from `member`** (`page()`/`action()`, the package reads the Chest's assertion); store `mbr_…` ids.
- **A post a reader must not see is `not_found`**, never `forbidden`
  (scheduled and deleted posts do not leak).
- **Audience in one place**: every query that reads posts goes through
  `seen()` / `audienceSeen()` / `forPerson()` in `src/lib/posts.ts` (SQL) and
  `inAudience()` in `src/lib/access.ts` (who is told, asked, counted). A new
  query on posts or comments → use them, and add a case to
  `test/audience.test.ts` (an outsider gets nothing).
- **Never render a post's text as HTML.** `src/components/rich-text.tsx` builds
  React elements from `src/shared/markdown.ts`; links pass `isSafeHref` (http,
  https, mailto only). Add a mark → a test in `test/text.test.ts`.
- **Confirmation is an explicit click only.** Views are a number only
  (`src/lib/views.ts`, README "Works council"): a keyed fingerprint per post and
  viewer, never a member id; shown from 5 (`floor`), as of the last full
  hour; frozen and fingerprints deleted after 30 days. Never add a list of
  who opened a post, a per-person time on a post, or a lower floor.
- **The text stays text.** The editor may only hold what `src/shared/markdown.ts`
  reads; a new mark → `src/shared/editor-doc.ts` both ways, a round-trip case in
  `test/editor.test.ts`.
- **Nothing leaves during the Undo seconds**: a new Important post is
  published `undoSeconds` later (`publish_at`, `undo_until`); `announce`
  never picks it before.
- **Telling many people**: go through `src/lib/tell.ts` — pages of 500, one key
  per post (`post:<id>:important`) so telling again replaces, a lease so two
  passes never tell at once, the cursor kept when the quota stops it —
  only the post's audience. The digest follows the same rules (key
  `digest`, `digest_runs.after`).
- **A proposal is not a post.** Nothing that reads posts sees
  `proposals`; only `src/lib/proposals.ts` does, for its author and the
  publishers (`test/round3.test.ts`). A new place that shows proposals
  goes through it.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role and its refusals.
- **Islands import only** React, the kit, `src/components/`, `src/shared/`,
  types, and `call`, `refresh`, `navigate`, `toast`, `fill`, `plural` from
  `@argentic/chest-app/client` — never the SDK, `src/lib/`, the actions
  (`checkSources()` in `test/stack.test.ts`). An island uses `toast()`, not
  the kit's `useToast()` (each island is a React root of its own). No
  `style={}`, no inline script or `<style>`: the policy refuses them (the
  readers' bar is a `<meter>`).
- **The UI kit first** (`@argentic/chest-ui/components`, `ui/README.md`):
  toasts (`toast()` of the package: `{ id, text, undo }`, the Undo returns `true` or why
  it failed; errors `tone: "error"`; what already left — reminders, an
  Important post once its seconds are over — `sent: true`, never an Undo),
  `DateField` and `TimeSelect` (never `type="date"`/`"time"`; `today` from
  the server), `PeoplePicker` (`localSearch` over who has News),
  `FilePicker` (the Slack ZIP, read in the browser), `Tabs`, `SearchBox`,
  `EmptyState`, `Avatar`, `AppShell`, `LanguageSwitch`, `useAutoRefresh`.
  Their words are the catalogues' `kit` section (`toast`, `peoplePicker`,
  `date`, `files`, `search`, over the kit's own). Kept on purpose: the front page's section tabs
  (newspaper section names, links that filter), the kind cards and the
  audience radios of the composer (each with a hint), the cover, gallery
  and attachment pickers (they show thumbnails and go through News's
  three-step upload), the "@" mention list (it writes into the text), the
  in-page "goes out in 8 s" notice with its own Undo. Kit 0.2.2
  (re-vendored 2026-09-29): an article's text (`.prose`, the editor too)
  is in `--font-read`, the theme's reading face; the header's full width
  is the kit's (`AppShell width="full"`), not a CSS override. The
  composer's pickers could become `FilePicker` with `preview` and stored
  files as `ready` entries — not done: it would change the three-step
  upload and the draft's state for no gain a reader sees. Kit 0.2.3
  (re-vendored 2026-09-29): the composer's on/off options (Important, ask
  again, pin) wait for Publish, so they are the kit's `Checkbox`; the
  audience's group list stays plain checkboxes (a choice in a list).
- **Only contract tokens in CSS** (`ui/tokens/CONTRACT.md`); a tool token
  is defined from them in `src/tokens.css`; never a colour; weights from the
  theme's tokens, 400 aside (`test/theme.test.ts`).
- **French typography**: `node scripts/lint-words.mjs tools/private/news`
  stays at 0 errors (narrow no-break spaces; Undo is « Annuler l’action »;
  Delete = Supprimer, Remove = Retirer). `cut()` and `clean()` keep the
  no-break spaces.
- **Words live in `src/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Deferred work runs on the
  schedule or on the next visit (`catchUp`). Nothing kept in memory between
  requests: the tool sleeps when idle.
