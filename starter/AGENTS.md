# My tool

What the tool does, for whom, in a few sentences. Keep this file current:
the purpose, the data model, the decisions, the commands. How the tool is
built — pages, islands, actions, words, the database, tests, recipes,
rules — is `node_modules/@argentic/chest-app/AGENTS.md`: read it first.

## Data model

- `chest_seen` (`migrations/0001_chest.sql`): what the Chest delivered
  already. Keep it.
- EXAMPLE — `notes` (`migrations/0002_notes.sql`): `body`, `author` (a
  member id, or 'erased'), `pinned`, `deleted_at`.

## Decisions

- Look: the Chest's own theme (`src/theme.ts`), light only.
- No public part (a permission: add one only when the tool needs it —
  the package's AGENTS.md, "The public part").

## Replacing the example

Everything marked `EXAMPLE (Notes)` is the example: `src/pages/`,
`src/islands/DeleteNote.tsx`, `src/lib/notes.ts`, the example's entries of
`src/actions.ts` and `src/app.tsx`, `migrations/0002_notes.sql` (an
unpublished draft may rewrite its migrations), its words in `src/i18n/`,
its tests. Then make `chest.json` ask exactly what the tool uses
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
