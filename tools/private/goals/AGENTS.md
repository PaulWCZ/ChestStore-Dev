# Adapting Goals — a guide for AI agents

`README.md` says what the tool does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | The manifest; the proposed `schedules` (studio) |
| `lib/access.ts` | **Who may do what** — roles, `mayCreate`, `mayEdit`, `mayCheckIn`: the only place rights are decided |
| `lib/model.ts` | Pure rules: bounds, values ("12,5"), measures, progress, confidence, cycles' time, scores |
| `lib/read.ts` | Read models: cycles, objectives with key results, progress, stale, "this week", waiting counts, check-ins |
| `lib/cycles.ts`, `lib/teams.ts`, `lib/objectives.ts`, `lib/key-results.ts`, `lib/comments.ts`, `lib/orphans.ts` | Services `(sql, actor, …input)`: rights first, bounds, parameterised SQL, codes |
| `lib/tell.ts`, `lib/notify.ts` | The bell (each recipient's language), badges, the Friday reminder, admins told of orphans |
| `lib/lifecycle.ts` | Leaving, losing access, erasure |
| `lib/export.ts`, `lib/csv.ts` | A cycle as CSV in the reader's language |
| `lib/views.ts`, `lib/page-data.ts`, `lib/form-data.ts` | What pages hand to views: words, names, dates and values already written |
| `lib/time.ts`, `lib/zone.ts` | The Chest's today and this week (its time zone) |
| `lib/values.ts`, `lib/i18n/format.ts` | Browser-safe formatting |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts` |
| `app/chest/` | Pages (server) and views (client); `actions.ts` thin server actions |
| `app/chest-events/`, `app/chest-jobs/[name]/` | The Chest's signed calls |
| `components/` | Shared pieces: progress, confidence, chart, contours, icons, cards |
| `migrations/` | The schema, run by the Chest in order |
| `seed/sample.sql` | Atelier Martin (never run by the Chest) |
| `test/` | `node:test` with the SDK's `fakeChest`; PGlite or `TEST_DATABASE_URL` |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity comes only from `member()`** (`lib/session.ts`). Store `mbr_…`
  ids, never names or emails; `'erased'` stands for an erased person.
- **Rights live in `lib/access.ts`**; every service checks before acting; a
  test in `test/access.test.ts` or `test/goals.test.ts` for each new right.
- **A closed cycle is frozen** (`openCycle()`): only retrospectives and
  comments change. Keep it so in any new service.
- **Services return codes, never sentences**; words go in every catalogue.
- **Never add ratings of people, reviews or links to pay**: see the legal
  note in `README.md`. Personal objectives stay off by default.
- **Dates**: "today" and "this week" come from `lib/time.ts` (the Chest's
  zone); format instants on the server; days with `formatDay`.
- **Client components never import the SDK**, `lib/session.ts`,
  `lib/people.ts`, `lib/db.ts` or services.
- **Schema changes are new migration files.** Never edit one that shipped.
- **No network, no disk, no background work** outside the Chest's signed
  schedules; the tool must stay useful without them.
- **Keep the CSP** in `proxy.ts`.
