# Adapting this tool — a guide for AI agents

`README.md` says what the tool does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | The manifest: name, roles, capabilities, build |
| `lib/access.ts` | **Who may do what** — the only place roles are read |
| `lib/notes.ts` | The service: rules, bounds, SQL (parameterised); takes `sql` and the member, throws `AppError(code)` |
| `lib/errors.ts` | Error codes, `Result`, `attempt()` for server actions |
| `lib/i18n/` | Every word: `en.ts` (source), `fr.ts`; `format.ts` for the browser |
| `lib/session.ts` | The member (`member()` of the SDK) and their language |
| `lib/people.ts` | Names and photos from member ids (`members.lookup`) |
| `lib/notify.ts` | Bell items in each recipient's language; badges |
| `lib/lifecycle.ts` | What happens when a member leaves or is erased |
| `app/chest/` | The members' part: pages (server) and views (client) |
| `app/chest/actions.ts` | Server actions: thin, each re-reads the member |
| `app/chest-events/route.ts` | The Chest's lifecycle events (signed) |
| `proxy.ts` | Content-Security-Policy with a nonce; 401 on `/chest` without a member |
| `migrations/` | The schema, run by the Chest in order |
| `seed/sample.sql` | Sample data for local runs (never run by the Chest) |
| `test/` | `node:test` with the SDK's `fakeChest` and a real PostgreSQL (PGlite) |
| `vendor/` | The SDK working copy, packed — do not edit |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **Identity comes only from `member()`** (`lib/session.ts`). Never from a
  body, a query, a cookie. Store `mbr_…` ids, never names or emails.
- **Rights live in `lib/access.ts`**; services call `can()` before acting;
  add a line to `test/access.test.ts` for each new ability.
- **Services return codes, never sentences**; words go in every catalogue
  of `lib/i18n/` (the tests compare them and look for words in the pages).
- **Client components never import the SDK**, `lib/session.ts`,
  `lib/people.ts` or `lib/db.ts` (the build fails: `node:crypto`).
- **Schema changes are new migration files.** Never edit one that shipped;
  the previous version must keep working on the new schema.
- **No network, no disk, no background work.** Deferred work is done on the
  next request (see the purge in `listNotes`).
- **Keep the CSP** in `proxy.ts`: no inline script without the nonce, no
  other origin.
