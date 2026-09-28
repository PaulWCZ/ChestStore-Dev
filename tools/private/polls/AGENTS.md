# Adapting Polls — a guide for AI agents

`README.md` says what Polls does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `organiser`, `member`; `database`, `members`, `notifications`; `receives` |
| `chest.proposals.json` | The `pass` schedule (every 15 minutes) — a Proposal of the studio's SDK |
| `migrations/0001_polls.sql` | Schema: polls, questions, options, participants, answers (named), tallies and texts (anonymous), tellings, chest_events. Never edit a shipped file; add `0002_…` |
| `lib/access.ts` | **Who may do what**: roles, `asked`, `sees`, `manages`, `edits`, `resultsState` (live / after close / the five-answer threshold) |
| `lib/model.ts` | Bounds, reading a poll (`readPoll`) and an answer (`readAnswer`), `checkOpening` — pure |
| `lib/polls.ts` | Services: create, drafts, edit, send, close, reopen, delete, restore, purge, final date, home, view, export, tile counts |
| `lib/answers.ts` | Answering; the anonymous rewrite (see README, "Anonymous polls") |
| `lib/results.ts` | Counts → results (bars, grid, best date, averages) — pure |
| `lib/tell.ts` | The bell and the tile: ask, remind, final date (broadcast, or pages resumable past the quota), settle after closing, `pass`/`catchUp` |
| `lib/audience.ts` | Who a poll asks (`members.list`, groups) |
| `lib/ics.ts`, `lib/csv.ts` | .ics (RFC 5545) and CSV writers — pure, tested |
| `lib/time.ts`, `lib/zone.ts`, `lib/dates.ts` | Days and times on the Chest's clock, in the reader's words |
| `lib/composer-value.ts` | The composer's data shape (browser-safe) |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/page.tsx` | Home (server) |
| `app/chest/composer.tsx` | The composer (client): kinds, answers, calendar, survey questions, settings |
| `app/chest/polls/[id]/` | The poll page (server), `answer-area.tsx` and `manage.tsx` (client), `results.tsx` (server), `export/`, `calendar/` routes |
| `app/chest-events/route.ts`, `app/chest-jobs/[name]/route.ts` | The Chest's signed calls |
| `seed/sample.sql` | Five sample polls for local runs |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity only from `member()`** (`lib/session.ts`); answers bind to it.
  Never accept a member id from a form (see Rallly's vote IDOR).
- **A poll someone may not see is `not_found`**, never `forbidden`.
- **Anonymous means no link.** Never add a member id, a time, a sequence or
  anything orderable to `tallies` or `texts`; never join `participants` to
  them; keep the whole-poll rewrite in one transaction; keep the five-answer
  threshold for everyone (organiser and admins included); never list
  participants of an anonymous poll. `test/answers.test.ts` checks the
  row stamps.
- **Telling many people** goes through `lib/tell.ts`: one key per poll and
  kind (`poll:<id>:ask`, `poll:<id>:final`), so telling again replaces; a
  lease so two passes never tell at once; the cursor kept when the quota
  stops it.
- **Closing is evaluated on read** (`closeDue`): no feature may depend on the
  schedule to be correct, only to be on time.
- **Words** live in `lib/i18n/en.ts` and `fr.ts` (same keys, tested); dates
  are formatted on the server (`lib/dates.ts`), never in a client component.
