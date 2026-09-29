# Adapting News — a guide for AI agents

`README.md` says what News does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `publisher`, `reader`; `database`, `files`, `members`, `notifications`; `receives` |
| `chest.proposals.json` | Proposals of the studio's SDK: the `publish` and `digest` schedules, `mail` (send), `calendar`, `groups: read` and `receives: ["group.*"]`, the French tile |
| `lib/access.ts` | **Who may do what** (`can`): read, react, publish, moderate, confirmations; **audience** (`inAudience`, `seesPost`) |
| `lib/posts.ts` | Posts, files, reactions, comments, confirmations, event answers, visits, the tile's count, purge — every service `(sql, actor, …)` |
| `lib/tell.ts` | The bell, email and the tile: telling Important posts (paged, resumable past the quota, one email per person and version), welcomes, comments, replies, mentions, reminders, a freed seat; `reconcile` (someone left a group); `pass`/`catchUp` |
| `lib/mailer.ts` | Email through the Chest (`mail.send` to `{member}`), each in its reader's language; learns whether the Chest sends email |
| `lib/agenda.ts` | Events in the Chest's calendar (`calendar.put` for those coming) |
| `lib/state.ts` | What News learned of the Chest (email, calendar on or off) |
| `lib/preferences.ts` | The digest by email: each person's switch |
| `lib/transfer.ts`, `lib/zip.ts` | Download all posts (ZIP); import a Slack channel export |
| `lib/editor-doc.ts` | The post's text ↔ the editor's document (pure, tested round trip) |
| `lib/audience.ts` | Who has News (`members.list`, 500 a page, with their groups); `tally`: confirmations counted on a post's audience |
| `lib/groups.ts` | The Chest's groups (all of them with `groups: read`, else those that give News); a post's audience in words |
| `lib/search.ts`, `lib/highlight.ts` | Search (PostgreSQL `news` text search + trigrams) over what the actor sees; the words found marked (pure) |
| `lib/digest.ts` | The weekly digest: who has not seen what, one keyed item per person, resumable past the quota |
| `lib/markdown.ts` | The text of a post → a small tree (never HTML); excerpts — pure, used in the browser too |
| `lib/ics.ts` | The `.ics` writer (RFC 5545) — pure, tested |
| `lib/time.ts`, `lib/zone.ts`, `lib/dates.ts` | Days and times on the Chest's clock; how pages write them |
| `lib/model.ts` | Bounds, kinds, reactions, text cleaning — pure |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/page.tsx`, `story.tsx` | The front page (server) |
| `app/chest/posts/[id]/page.tsx`, `parts.tsx` | A post (server) and what people act on (client) |
| `app/chest/composer.tsx`, `text-editor.tsx` | The composer (client): the formatted text (Tiptap), languages, audience and its count, uploads, gallery, the button that says who is told, the 10-second Undo, draft |
| `app/chest/transfer/`, `app/chest/api/import/` | Slack import, download all posts |
| `app/chest/api/uploads/route.ts`, `app/chest/files/[id]/route.ts` | Files: authorise, record, open |
| `app/chest/search/page.tsx` | The search page (the topbar's box lands here) |
| `app/chest-events/route.ts`, `app/chest-jobs/[name]/route.ts` | The Chest's signed calls (`publish`, `digest`) |
| `migrations/` | Schema. Never edit a shipped file; add `0004_…` |
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
- **Audience in one place**: every query that reads posts goes through
  `seen()` / `audienceSeen()` / `forPerson()` in `lib/posts.ts` (SQL) and
  `inAudience()` in `lib/access.ts` (who is told, asked, counted). A new
  query on posts or comments → use them, and add a case to
  `test/audience.test.ts` (an outsider gets nothing).
- **Never render a post's text as HTML.** `components/rich-text.tsx` builds
  React elements from `lib/markdown.ts`; links pass `isSafeHref` (http,
  https, mailto only). Add a mark → a test in `test/text.test.ts`.
- **Confirmation is an explicit click only.** Do not add view tracking per
  person or per post (README, "Works council"); reach is counts from the
  one `activity` time per person.
- **The text stays text.** The editor may only hold what `lib/markdown.ts`
  reads; a new mark → `lib/editor-doc.ts` both ways, a round-trip case in
  `test/editor.test.ts`.
- **Nothing leaves during the Undo seconds**: a new Important post is
  published `undoSeconds` later (`publish_at`, `undo_until`); `announce`
  never picks it before.
- **Telling many people**: go through `lib/tell.ts` — pages of 500, one key
  per post (`post:<id>:important`) so telling again replaces, a lease so two
  passes never tell at once, the cursor kept when the quota stops it —
  only the post's audience. The digest follows the same rules (key
  `digest`, `digest_runs.after`).
- **Add an ability → a line in `test/access.test.ts`.** Add a service →
  tests with each role and its refusals.
- **Client components import only** `lib/i18n/format.ts`, `lib/app-error.ts`,
  `lib/markdown.ts`, `lib/model.ts`, `lib/initials.ts` and types. Never the
  SDK, `lib/db.ts`, `lib/session.ts`.
- **Words live in `lib/i18n/`**, in every catalogue (tests compare keys and
  placeholders, and look for words written in pages).
- **No network, no disk, no background work.** Deferred work runs on the
  schedule or on the next visit (`catchUp`).
