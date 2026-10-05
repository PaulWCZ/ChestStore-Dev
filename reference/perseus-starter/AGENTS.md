# My tool

What the tool does, for whom, in a few sentences. Keep this file current:
the purpose, the data model, the decisions, the commands.

## How it is made

The Chest's starter: TypeScript, a Hono server that renders React pages on
the server, the browser running only the islands that need it, built by Vite.

| Path | What it is |
|---|---|
| `chest.json` | The manifest: name, title, roles, capabilities, the build — its `static: ["/assets/"]` says where the browser's files are served, to anyone, on the tool's hosts |
| `src/server/main.tsx` | Starts the server on `PORT` |
| `src/server/app.tsx` | The routes: `/chest` (the members' part), `/assets/*` (the browser's files), the policy with a nonce per answer |
| `src/server/document.tsx` | A whole page: the stylesheet, the script, the page rendered by React |
| `src/ui/` | The pages and components; `islands.tsx` names those the browser hydrates |
| `src/client/main.tsx` | The browser's script: hydrates the islands; `styles.css`, the styles |
| `migrations/` | The database's migrations, `0001_name.sql`, when the tool has `"capabilities": ["database"]` |
| `test/` | Tests of the built server, as the Chest asks it (`npm test`) |
| `vendor/` | The SDK the Chest ships: never change it |

## Commands

- `npm run dev`: the preview — Vite rebuilds on every change, the server restarts.
- `npm run build`: the type check, then the browser's files and the server.
- `npm test`: the type check, the server built into `dist/test`, then `test/*.test.mjs` against it — ended once they ran (`--test-force-exit`), whatever stays open: the preview's database pool a route opened.
- `npm start`: the built server, as the Chest runs it.

## Conventions

- A route of the members' part is under `/chest`; `member(c.req.raw)` says
  who asks (null: answer 401). A public part, when `chest.json` says
  `"public": true`, is any path outside `/chest`.
- Pages render on the server; a component that must react in the browser
  is an island: add it to `islands.tsx` and render it with `<Island>`.
- No inline script or style: styles in `src/client/styles.css`, scripts in
  `src/client/`. The policy allows the tool's own files and the nonce.
- The browser's files are built into `dist/client/assets/` and served at
  `/assets/`, the prefix `chest.json` declares in `build.static`: once
  published, the Chest serves the tool only `/chest…` (members), those
  prefixes (anyone) and, with `"public": true`, the rest. A file served
  elsewhere loads in no page; the preview routes the same way.

## Using the Chest

Each function needs its capability in `chest.json` (`"capabilities":
["database", "members", "files", "notifications", "ai"]`, only those used);
one not declared throws `CapabilityNotGranted`. The preview answers as the
Chest will: its own empty database, three fake members (Alex Morgan the
owner, Sam Taylor, Robin Lee), its own files, notifications kept in the
draft and written in the preview's log, AI counted on the Chest's budget.

**Database** (`database`): `npm install postgres`, then one file
`src/server/db.ts`:

```ts
import postgres from "postgres";
import { databaseUrl } from "@argentic/chest-sdk/database";

let sql: postgres.Sql | undefined;
export const db = () => (sql ??= postgres(databaseUrl(), { max: 5 }));
```

Tables in `migrations/0001_scores.sql` (run in name order, never edited once
run; the Chest runs them, the tool never does):

```sql
create table scores (
  id integer primary key generated always as identity,
  member text not null,
  wpm integer not null,
  created_at timestamptz not null default now()
);
```

Queries are parameterised: ``await db()`select * from scores where member = ${who.id}` ``.
`seed.sql` (optional) fills the preview's empty database, never the tool in
service.

**Members** (`members`): `import * as members from "@argentic/chest-sdk/members"`;
`(await members.list()).members` (id, name, role…), `await members.get(id)`,
`await members.lookup(ids)` to name the ids kept in a table.

**Notifications** (`notifications`): `import * as notifications from
"@argentic/chest-sdk/notifications"`; `await notifications.notify([id], {
title: "New record", path: "/chest" })`.

**Files** (`files`): `import * as files from "@argentic/chest-sdk/files"`;
`await files.put(name, bytes, type)`, `await files.get(name)`,
`(await files.url(name)).url` for a link.

**AI** (`ai`, with `"ai": {"models": ["default"], "purpose": "…"}`):
`import * as ai from "@argentic/chest-sdk/ai"`; `(await ai.chat({ model:
"default", messages })).text`; catch `AiCapReached` and `AiUnavailable`.

The whole reference: `docs` pages `sdk-database`, `sdk-members`,
`sdk-notifications`, `sdk-files`, `sdk-ai`, `chest-json`.
