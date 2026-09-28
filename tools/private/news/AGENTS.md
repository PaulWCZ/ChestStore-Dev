# Adapting News — a guide for AI agents

`README.md` says what News does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `publisher`, `reader`; `database`, `files`, `members`, `notifications`; `receives` |
| `chest.proposals.json` | The `publish` schedule (every 15 minutes) — a Proposal of the studio's SDK |
| `lib/access.ts` | **Who may do what** (`can`): read, react, publish, moderate, confirmations |
| `lib/posts.ts` | Posts, files, reactions, comments, confirmations, event answers, visits, the tile's count, purge — every service `(sql, actor, …)` |
| `lib/tell.ts` | The bell and the tile: telling Important posts (paged, resumable past the quota), welcomes, comments, reminders; `pass`/`catchUp` |
| `lib/audience.ts` | Who has News (`members.list`, 500 a page) |
| `lib/markdown.ts` | The text of a post → a small tree (never HTML); excerpts — pure, used in the browser too |
| `lib/ics.ts` | The `.ics` writer (RFC 5545) — pure, tested |
| `lib/time.ts`, `lib/zone.ts`, `lib/dates.ts` | Days and times on the Chest's clock; how pages write them |
| `lib/model.ts` | Bounds, kinds, reactions, text cleaning — pure |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/page.tsx`, `story.tsx` | The front page (server) |
| `app/chest/posts/[id]/page.tsx`, `parts.tsx` | A post (server) and what people act on (client) |
| `app/chest/composer.tsx` | The composer (client): uploads, toolbar, preview, draft |
| `app/chest/api/uploads/route.ts`, `app/chest/files/[id]/route.ts` | Files: authorise, record, open |
| `app/chest-events/route.ts`, `app/chest-jobs/[name]/route.ts` | The Chest's signed calls |
| `migrations/` | Schema. Never edit a shipped file; add `0002_…` |
| `seed/sample.sql` | A small company's month, for local runs |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`); store `mbr_…` ids.
- **A post a reader must not see is `not_found`**, never `forbidden`
  (scheduled and deleted posts do not leak).
- **Never render a post's text as HTML.** `components/rich-text.tsx` builds
  React elements from `lib/markdown.ts`; links pass `isSafeHref` (http,
  https, mailto only). Add a mark → a test in `test/text.test.ts`.
- **Confirmation is an explicit click only.** Do not add view tracking per
  person (README, "Works council").
- **Telling many people**: go through `lib/tell.ts` — pages of 500, one key
  per post (`post:<id>:important`) so telling again replaces, a lease so two
  passes never tell at once, the cursor kept when the quota stops it.
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role and its refusals.
- **Client components import only** `lib/i18n/format.ts`, `lib/app-error.ts`,
  `lib/markdown.ts`, `lib/model.ts`, `lib/initials.ts` and types. Never the
  SDK, `lib/db.ts`, `lib/session.ts`.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Deferred work runs on the
  schedule or on the next visit (`catchUp`).
