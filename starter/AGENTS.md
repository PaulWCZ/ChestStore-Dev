# My tool

What the tool does, for whom, in a few sentences. Keep this file current:
the purpose, the data model, the decisions, the commands. How the tool is
built — pages, islands, actions, words, the database, tests, recipes,
rules — is `node_modules/@argentic/chest-app/AGENTS.md`: read it first.

## Data model

- `migrations/0001_chest.sql` — the package's tables, keep them:
  `chest_seen` (what the Chest delivered already, and the public forms'
  tokens served), `chest_bounds` (what public actions counted today), and
  the change log (`chest_changes`, `chest_changes_base`, `chest_watch()`)
  for pages' versions — already there: never copy `sql/changes.sql` again.
- EXAMPLE — `notes` (`migrations/0002_notes.sql`): `body`, `author` (a
  member id, or 'erased'), `pinned`, `deleted_at`; watched for the page's
  version (`select chest_watch('notes')`).

## Decisions

- Look: the Chest's own theme (`src/theme.ts`), light only.
- No public part (a permission: add one only when the tool needs it —
  the package's AGENTS.md, "The public part").

## Replacing the example

Everything marked `EXAMPLE (Notes)` is the example: `src/pages/`,
`src/islands/DeleteNote.tsx`, `src/islands/AutoRefresh.tsx` (and their
lines in `src/islands/index.ts`), `src/lib/notes.ts`, the example's entries of
`src/actions.ts` and `src/app.tsx`, `migrations/0002_notes.sql` (an
unpublished draft may rewrite its migrations), its words in `src/i18n/`,
its tests (`checkSources` warns while a marker is left in a tool renamed
from `my-tool`). Then make `chest.json` ask exactly what the tool uses
(`npm test` fails on a capability declared and unused, or used and not
declared): the example asks `database`, `members` (authors' names) and
`receives` (to forget an erased member).

## Commands

- `npm run dev`: rebuilds on every change, restarts the server.
- `npm run build`: the type check, the browser's files, the server.
- `npm test`: the type check, the server built into `dist/test`, the
  tests. A database: `TEST_DATABASE_URL`, else the preview's, else PGlite
  (1.3 GiB). They pass with the workbench's `NODE_ENV=development` too.
- `npm start`: the built server, as the Chest runs it.
