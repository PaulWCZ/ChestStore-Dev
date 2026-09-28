# 3. Building a tool

## Layout

Each tool lives in `tools/<name>/` and is **a complete repository on its own**:
the day it is ready, it is copied as-is into its own GitHub repository and
installed by a Chest. Nothing in it may point outside its folder.

```
tools/<name>/
  chest.json              the manifest (brief/02)
  package.json            scripts: dev, build, start, test
  package-lock.json       required by the Chest (npm ci)
  vendor/                 the SDK tarball (scripts/add-sdk.mjs puts it there)
  chest/icon.svg          the tile icon (≤ 64 KiB, restricted SVG)
  chest/preview.png       the store preview (≤ 512 KiB, ≤ 4096 px) — a real screenshot
  migrations/0001_*.sql   the schema, run by the Chest in order
  app/ lib/ …             the code
  test/                   node:test, with the SDK's fakeChest
  demo/seed.sql           realistic demo data for screenshots and local runs (never run by the Chest)
  README.md               what it does, what it replaces, roles, routes, what is stubbed
  DESIGN.md               its identity and design system (brief/05)
  AGENTS.md               how an agent adapts it safely (model: reference/forms/AGENTS.md)
  THIRD_PARTY.md          code reused from other projects: source, licence, files (brief/04)
  LICENSE                 MIT, © 2026 Argentic (same as the SDK), unless PROGRESS.md says otherwise
```

## The SDK

The SDK 0.2.0 is not on npm yet. `sdk/argentic-chest-sdk-0.2.0.tgz` is its
packed build (same code as `reference/chest-sdk/`, tests green). To give a
tool its copy:

```sh
node scripts/add-sdk.mjs tools/<name>   # copies the tarball to tools/<name>/vendor/, sets the dependency
cd tools/<name> && npm install          # the lock records file:vendor/…, npm ci works
```

Then import it as the published package: `@argentic/chest-sdk/member`,
`/database`, `/files`, `/members`, `/notifications`, `/events`, `/errors`,
`/testing`. Server side only — never in a `"use client"` module.

## The stack

**Default: Next.js (App Router) + React + `postgres`, as Forms does** — it is
proven on a Chest. Copy Forms' solutions rather than rediscovering them:

- `proxy.ts`: a nonce Content-Security-Policy on every page (Next.js inline
  scripts), 401 on `/chest` without a member;
- `export const dynamic = "force-dynamic"` (nothing cached on the read-only
  disk), `images.unoptimized`;
- `next build --webpack` (Turbopack exceeds the build memory);
- `next start -H 127.0.0.1`, port from `PORT`;
- own TypeScript files imported with the `.ts` extension;
- `lib/i18n.ts`: every word of the interface in one catalogue per language
  (English default, French), a test that the catalogues have the same keys;
- services return codes, never sentences.

You may choose a lighter stack for a tool (e.g. plain `node:http` like
`reference/testweb`, or Preact + esbuild) when it is clearly better for it —
say why in its README. Keep dependencies few and well-known; every dependency
is code a company inherits.

**Frontend libraries**: no UI kit that imposes its own look (Material,
Bootstrap, Ant…): each tool has its own identity. Headless primitives (Radix,
React Aria), small focused libraries (a date picker, a rich-text editor such
as Tiptap, a chart library) are fine. Fonts and icons are **self-hosted** in
the repository (open licences such as OFL): the tool has no network.

## Access rules — the heart of every tool

- Every route and server action under `/chest` starts with `member(request)`;
  `null` → 401. Roles are enforced **on the server**, in one place
  (`lib/access.ts` or similar), with tests for each role.
- The first declared role is the strongest; admins and builders arrive with it.
- Store `mbr_…` ids; render names with `members.lookup` (a departed person
  reads "Camille Martin (former member)").
- If the tool stores member ids, it handles `access.revoked`,
  `member.removed` and `member.erased` (anonymise, then
  `events.acknowledgeErasure`). This is part of the product (GDPR), not an
  extra.
- Public pages (root of the tool) never expose private data.

## Data

- Schema in `migrations/NNNN_name.sql`, run by the Chest in order, each in a
  transaction. A migration that shipped is never edited; a new version must
  keep the previous one working on the new schema.
- Parameterised queries only.
- Search, tags, counters, queues: Postgres (`tsvector`, `pg_trgm`, `jsonb`).
- Import/export CSV where a company would migrate from a SaaS — **import is
  what makes switching possible**: when the SaaS has a standard export
  (Trello JSON, Notion Markdown, CSV), an importer is a strong feature.

## Running and testing locally

There is no `chest dev` yet (it is specified:
`reference/product/specs/develop-and-test-tools.md`). Until then:

- **Unit and route tests** with `@argentic/chest-sdk/testing`: `fakeChest`
  (members, groups, files, notifications, events) and `withMember` to sign a
  request as a given member. See `reference/testweb/apps/testweb/test/` and
  `reference/forms/test/`.
- **PostgreSQL**: use a real one if the environment allows it (`apt-get
  install postgresql`, or a container). If not, PGlite
  (`@electric-sql/pglite`, with `pglite-socket` to serve the `postgres`
  client) as a **dev-only** dependency. Never ship it.
- **A dev harness, once, for every tool**: build `lab/chest-dev/` early in
  phase 3 — it starts `fakeChest` with a few demo members, runs a tool with the
  right environment, and serves it on `localhost` with a small member switcher
  that signs `Chest-Member` for the chosen member (`signAssertion`). It is a
  lab tool, never part of a tool. Everything that was hard about it goes into
  the SDK report: it is exactly the `chest dev` we are about to build.
- **Screenshots**: if a headless browser works in your environment
  (Playwright), capture each tool's main screens at 1440 px and 390 px into
  `tools/<name>/docs/screens/`, and the store preview into `chest/preview.png`.
  If it does not, say so in PROGRESS.md; the owner will capture them.

## Missing platform features

When a tool needs what the Chest does not give yet (email, scheduled work,
accounts for outside users, payments, AI, events between tools, realtime…):

1. Put it behind a small interface in `lib/platform/<feature>.ts`, shaped as
   **the SDK API you propose** for it.
2. Give it a prototype implementation that works inside today's limits
   (e.g. mail → an "outbox" table shown on an admin page; scheduled work →
   done lazily on the next request; payments → a fake checkout that marks an
   order paid). The first line of the file says
   `PROTOTYPE — replaced by <proposal> (reports/03-sdk-report.md#<anchor>)`.
3. The tool must stay useful with the feature off, and say so on screen in
   plain words when it matters ("Emails will be sent once your Chest has a
   mail connector").
4. List it in the tool's README ("What is stubbed") and in the SDK report.

Never hide a stub, never ship credentials, never reach a service that is not
declared in `network`.

## Definition of done

A tool is done when, from a clean checkout of its folder:

- [ ] `npm ci && npm test && npm run build` pass; `npm start` serves `/` and `/chest`.
- [ ] `chest.json` follows every rule of the contract (write
      `scripts/check-manifest.mjs` once, from the contract, and run it; the
      real `chest check` does not exist yet — say in the SDK report what it
      should catch).
- [ ] Every `/chest` route checks the member; each role's rights are tested.
- [ ] Migrations run on an empty database; demo seed loads.
- [ ] English and French complete, same keys.
- [ ] Empty, loading, error and "no access" states designed; works at 390 px;
      keyboard and screen-reader usable; WCAG AA contrast.
- [ ] No runtime request leaves the tool (fonts, icons, scripts all local).
- [ ] Lifecycle events handled if member ids are stored.
- [ ] `README.md`, `DESIGN.md`, `AGENTS.md`, `THIRD_PARTY.md` (if any reuse),
      `chest/icon.svg`, `chest/preview.png`.
- [ ] Its row in PROGRESS.md and its card in the showcase are up to date.
