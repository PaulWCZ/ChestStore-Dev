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
["database", "members", "files", "notifications", "ai", "realtime"]`, only those used);
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
`await members.lookup(ids)` to name the ids kept in a table. With
`members.groups` too, `await members.groups.list()` pages every group of the
Chest ({groups: [{id, name, size}], next}) and `member.groups` all of a
member's (null beyond about 150: `members.get(id)`): offer “the Sales team”.
No count bounds a team: read every list page after page (`next`).

**Notifications** (`notifications`): `import * as notifications from
"@argentic/chest-sdk/notifications"`; `await notifications.notify([id], {
title: "New record", path: "/chest", translations: { fr: { title: "Nouvel
enregistrement" } } })`; everyone who has the tool, or a group:
`await notifications.broadcast({ title: "New poll" }, { to: { groups: [id] },
except: [author] })`.

**Files** (`files`): `import * as files from "@argentic/chest-sdk/files"`;
`await files.put(name, bytes, type)`, `await files.get(name)`,
`(await files.url(name)).url` for a link.

**AI** (`ai`, with `"ai": {"models": ["default"], "purpose": "…"}`):
`import * as ai from "@argentic/chest-sdk/ai"`; `(await ai.chat({ model:
"default", messages })).text`; catch `AiCapReached` and `AiUnavailable`.

**Live updates** (`realtime`, with `"realtime": {"channels", "feeds"}`): a
page that must stay up to date — a chat, a board, who is here — never polls
and never opens a socket of the tool's own: the Chest holds the pages'
connections, tells them each row of a feed at its commit, and the tool
sleeps meanwhile. Declare the channels, who joins them, and the tables whose
writes are events:

```json
"realtime": {
  "channels": [{ "name": "room:{id}", "join": { "table": "room_members", "key": "room_id", "member": "member_id" }, "send": true, "presence": true }],
  "feeds": [{ "table": "messages", "channel": "room:{room_id}", "columns": ["id", "room_id", "author", "text"] }]
}
```

Listen in an island — `@argentic/chest-sdk/realtime/client` is the one SDK
module made for the browser:

```tsx
// src/ui/Room.tsx, named in islands.tsx
import { useEffect, useState } from "react";
import { connect } from "@argentic/chest-sdk/realtime/client";

type Message = { id: number; author: string; text: string };

export function Room({ id, first }: { id: number; first: Message[] }) {
  const [messages, setMessages] = useState(first);
  useEffect(() => {
    const live = connect();
    const room = live.channel(`room:${id}`);
    const load = () => fetch(`/chest/api/rooms/${id}/messages`).then(r => r.json()).then(setMessages);
    room.onJoined(({ replayed }) => replayed || load());
    room.onResync(load);
    live.focus(`room:${id}`);
    room.on("messages.insert", row => setMessages(m => m.some(x => x.id === (row as Message).id) ? m : [...m, row as Message]));
    return () => live.close();
  }, [id]);
  return <ul>{messages.map(m => <li key={m.id}>{m.text}</li>)}</ul>;
}
```

Write through the tool's own `/chest/api` routes, which check `member()`: a
row inserted reaches every page of the room; a row of `room_members`
deleted takes that member out at once. A page back after any absence — a
phone asleep, a network change — is given every row it missed by the Chest,
once each: `load()` runs only when the Chest says it could not
(`replayed` false, `resync`). On the server,
`import * as realtime from "@argentic/chest-sdk/realtime"`:
`await realtime.publish("room:42", "renamed", { name })` for what is not a
row, `await realtime.online(ids, { channel: "room:42" })` before notifying
— `online` those with a page open, `watching` those looking at that room: a
`notify` for those not online, an unread count for the others. A member's
ephemeral message (typing) goes through `room.peers.send("typing")` and
`room.peers.on("typing", (_, from) => …)`, apart from the Chest's events
(`room.on`), its name without a dot. The
preview's pages connect as the fake member the draft is viewed as.

The whole reference: `docs` pages `sdk-database`, `sdk-members`,
`sdk-notifications`, `sdk-files`, `sdk-ai`, `sdk-realtime`, `chest-json`.
