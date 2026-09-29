# Adapting Polls — a guide for AI agents

`README.md` says what Polls does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | Manifest: roles `organiser`, `member`; `database`, `members`, `notifications`; `receives` |
| `chest.proposals.json` | The `pass` schedule (every 15 minutes) and `mail: {send}` (email reminders) — Proposals of the studio's SDK |
| `migrations/0001_polls.sql` | Schema: polls, questions, options, participants, answers (named), tallies and texts (anonymous), tellings, chest_events |
| `migrations/0002_team_polls.sql` | Settings (who starts polls), people picked by name, sign-up places, edits after answers, reminders on demand, series (repeating pulses), eNPS, comments; anonymous ⇒ results after the close (a constraint). Never edit a shipped file; add `0003_…` |
| `lib/access.ts` | **Who may do what**: roles and the admin's policy (`can`, `settles`), `asked` (everyone, groups, people), `sees`, `manages`, `edits`, `resultsState` (live / after close; anonymous: closed and five answers, for everyone) |
| `lib/model.ts` | Bounds, reading a poll (`readPoll`) and an answer (`readAnswer`), `checkOpening` — pure |
| `lib/polls.ts` | Services: create, drafts, edit, send, close, reopen, delete, restore, purge, final date, home, view, export, tile counts |
| `lib/answers.ts` | Answering; the anonymous rewrite (see README, "Anonymous polls") |
| `lib/results.ts` | Counts → results (bars, grid, best date, averages, eNPS) — pure |
| `lib/series.ts` | Repeating pulses: `startSeries`, `openRounds` (on the pass), `repeatSeries` (stop / again), `trend` (a number per round) |
| `lib/comments.ts` | Comments on named polls: list, add, remove, restore |
| `lib/tell.ts` | The bell, the tile and email reminders: ask, remind (day before), nudge (the organiser's reminder), final date (broadcast, or pages resumable past the quota), comments, settle after closing, `pass`/`catchUp` |
| `lib/audience.ts` | Who a poll asks (`members.list`, groups, people by name), finding people by name |
| `lib/ics.ts`, `lib/csv.ts` | .ics (RFC 5545) and CSV writers — pure, tested |
| `lib/time.ts`, `lib/zone.ts`, `lib/dates.ts` | Days and times on the Chest's clock, in the reader's words |
| `lib/composer-value.ts` | The composer's data shape (browser-safe) |
| `lib/lifecycle.ts` | Leaving and erasure |
| `lib/theme.ts` | The identity "Confetti" as a kit theme (`defineTheme`, equal to the catalogue's) and `currentLook()` (the Chest's choice, else the identity) |
| `app/tokens.css`, `app/globals.css` | Polls' own tokens, defined from the contract's; its components. Contract tokens only, never a colour (`test/theme.test.ts`) |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `app/chest/actions.ts` | Server actions: thin; each re-reads the member; answer `Result` codes |
| `app/chest/page.tsx` | Home (server); `policy-switch.tsx` the admin's setting |
| `app/chest/composer.tsx` | The composer (client): kinds, answers, calendar, survey questions, settings |
| `app/chest/polls/[id]/` | The poll page (server), `answer-area.tsx`, `manage.tsx`, `comments.tsx` (client), `results.tsx`, `trend.tsx` (server), `export/`, `calendar/` routes |
| `app/chest-events/route.ts`, `app/chest-jobs/[name]/route.ts` | The Chest's signed calls |
| `seed/sample.sql` | Sample polls for local runs: a question, a date poll, a weekly pulse (5 rounds), a sign-up sheet, a draft, comments |
| `test/` | `node:test` with `fakeChest` and PostgreSQL (PGlite or `TEST_DATABASE_URL`) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **The look is the Chest's choice.** `app/layout.tsx` writes it
  (`<ThemeStyle>` with the page's nonce); CSS names only contract tokens
  (`ui/tokens/CONTRACT.md` in the studio) and `app/tokens.css`'s. Text only
  on measured pairs (`--accent-ink` on `--accent`, `--cat-N-ink` on
  `--cat-N-soft`, a state's `-ink` on its `-soft`, `--ink` on
  `--highlight`); field borders `--line-strong`; `color-mix(in oklab, …)`
  for decoration only. A kind or an answer always has its icon and word.
- **Kit components first** (`@argentic/chest-ui/components`): `AppShell`,
  `BrandMark`, `NoAccess`, `Toasts`/`useToast`, `Confirm`, `PeoplePicker`,
  `DateField`, `TimeSelect`, `Avatar`, `StatusBadge`, `EmptyState`,
  `PageHeader`, `LanguageSwitch`, `useAutoRefresh`. Their words are the
  `toast`, `peoplePicker` and `date` sections of the catalogues. A reversible
  act → a toast with `undo`; a bell item that left → `sent: true`; the
  irreversible (closing an anonymous poll) → `Confirm`. Never
  `window.confirm`, never `<input type="date">`.
- Kept on purpose: the multi-day month grid of the composer (the kit's
  calendar picks one day), the date grid of results (a people × dates
  matrix with its best column lit — `DataTable` is a list of records), the
  kind chips with their icons, the chunky answer controls.

- **Identity only from `member()`** (`lib/session.ts`); answers bind to it.
  Never accept a member id from a form (see Rallly's vote IDOR).
- **A poll someone may not see is `not_found`**, never `forbidden`.
- **Anonymous means no link.** Never add a member id, a time, a sequence or
  anything orderable to `tallies` or `texts`; never join `participants` to
  them; keep the whole-poll rewrite in one transaction; show results only
  once closed and from five answers, to everyone (organiser and admins
  included); never reopen a closed anonymous poll; never list participants
  of an anonymous poll; no comments, no place limits on it. `test/answers.test.ts` checks the
  row stamps.
- **Telling many people** goes through `lib/tell.ts`: one key per poll and
  kind (`poll:<id>:ask`, `poll:<id>:final`), so telling again replaces; a
  lease so two passes never tell at once; the cursor kept when the quota
  stops it.
- **Closing is evaluated on read** (`closeDue`): no feature may depend on the
  schedule to be correct, only to be on time.
- **Words** live in `lib/i18n/en.ts` and `fr.ts` (same keys, tested); dates
  are formatted on the server (`lib/dates.ts`), never in a client component.
