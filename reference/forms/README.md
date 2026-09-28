# Forms — create forms and collect the responses

A tool of the Chest by Argentic catalogue. A Chest builds it itself from this
repository, at a pinned commit: it is a Next.js server (tool contract v2:
`chest.json` `"version": 2`) with its own PostgreSQL database.

To adapt it: fork this repository, change it with your agent (see
`AGENTS.md`), and link your fork to your Chest.

## What it does

- **Members' part** (`/chest`, on the team host `forms-chest.<chest>`): the
  list of forms, the editor of a draft (title, description, 1 to 50 fields:
  short text, long text or email address, required or not), explicit
  publishing, closing the collection, and the responses of a form (the latest
  200 on screen, all of them as CSV).
- **Public part** (`/f/<address>`, on the public host `forms.<chest>`, once
  the public part is opened in the Chest): a published form is filled in
  without an account, then a thank-you page; a closed form says so and keeps
  its responses; a draft or an unknown address is nothing (404).

**Roles** (`roles` in the manifest): `editor` ("Editor") creates, edits,
publishes, closes and deletes a draft; `reader` ("Reader") reads the forms and
their responses. The owner, the admins and the Builder come in with the first
one, `editor`. `role_labels` only changes how the Chest shows them; the tool
always receives the identifier. A member without access to the tool never
reaches `/chest`: the Chest refuses them before the tool; a request without a
valid `Chest-Member` assertion also gets 401 from the tool itself
(`proxy.ts`), and every page and every action reads the role again
(`lib/forms.ts`).

**Bounds**, checked on the server (`lib/model.ts`): title 200 characters,
description 1000, 50 fields, label 200, answer 5000, 10,000 responses per
form. Every SQL query is parameterised (`lib/store.ts`); the schema is
`migrations/0001_forms.sql`, run by the Chest before the first version. A
response cannot be deleted (foreign key `RESTRICT`): only a draft — which has
none — can be deleted.

## Languages

The interface speaks English by default and French to a browser that prefers
it (`Accept-Language`). Every word of the interface is in `lib/i18n.ts`, one
catalogue per language; the service and the model return codes, never
sentences. To add a language, add its code to `locales` and a catalogue of the
same shape (a test checks that every catalogue has every word).

## On a Chest

`chest.json` declares what the tool asks for, shown at approval:

- `public: true` — a public part;
- `csp: "tool"` — its own security policy: Next.js runs inline scripts
  (hydration), which the Chest's default policy forbids. `proxy.ts` sends its
  own `Content-Security-Policy` on every page, with a nonce per response
  (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`…);
  the Chest then only adds `frame-ancestors 'none'; base-uri 'self';
  object-src 'none'` on the public host. A page without a policy keeps the
  Chest's strict one;
- `capabilities: ["database"]` — a database: the Chest gives `DATABASE_URL`.

What the Chest imposes on a server, and how the tool complies:

- **Read-only file system** (and a 64 MiB `/tmp`): every page is rendered on
  demand (`dynamic = "force-dynamic"`), without the image optimiser
  (`images.unoptimized`) — nothing is written to `.next/cache` at run time;
- **build in 512 MiB and 1 CPU**: `npm run build` checks the types
  (`next typegen`, `tsc`) then builds with webpack (`next build --webpack`,
  one process, no cache left in the image) rather than Turbopack, whose memory
  cannot be bounded;
- **server**: `next start -H 127.0.0.1` on `PORT` (3000, set by the Chest),
  Next.js telemetry off;
- `npm prune --omit=dev` after the build: `next`, `react`, `react-dom` and
  `postgres` are dependencies, TypeScript and the types are not.

`packages/chest-client` is a vendored copy of the SDK
(`chest-by-argentic/Chest-SDK`, see its `VENDORED.md`): `member(request)`
reads the Chest's assertion. Relative imports carry the `.ts` extension
(`allowImportingTsExtensions`): webpack and Turbopack do not resolve `./x.js`
to `./x.ts`.

## Develop

```sh
npm ci
npm test           # model, service and catalogues (node:test, in-memory store)
npm run build      # types, then the build, as the Chest does
```

`npm run dev` serves the tool on `localhost:3000`; the members' part expects
the Chest's signed assertion (`CHEST_TOKEN`, `CHEST_TOOL`) and a database
(`DATABASE_URL`).

## Since version 1

Version 1 was a worker (contract v1: a private channel, a 1 KiB record, a
single form). A Chest refuses to update a tool from one contract to the
other: an installed Forms v1 is **removed then reinstalled** from the
catalogue; its v1 responses are not carried over.
