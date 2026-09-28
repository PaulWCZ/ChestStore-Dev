# 3. Building a tool

## Layout

**One tool (one SaaS replacement) = one folder of its own**, filed by kind:

```
tools/
  private/<name>/               tools used only by the team, behind the Chest's sign-in (tasks, wiki, leave…)
  public-and-private/<name>/    tools that also have a public part (booking page, customer portal, job board…)
```

Each tool folder is **a complete repository on its own**: the day it is
ready, it is copied as-is into its own GitHub repository and installed by a
Chest. Everything about the tool lives in it — code, design system,
screenshots, docs — and nothing in it may point outside its folder. Tools
share nothing at runtime; what several tools need goes into the SDK fork
(below) or `lab/`, never into a sibling tool.

```
tools/<kind>/<name>/
  chest.json              the manifest (brief/02)
  package.json            scripts: dev, build, start, test
  package-lock.json       required by the Chest (npm ci)
  vendor/                 only if the tool uses a proposal of the SDK fork (scripts/add-sdk.mjs)
  chest/icon.svg          the tile icon (≤ 64 KiB, restricted SVG)
  chest/preview.png       the store preview (≤ 512 KiB, ≤ 4096 px) — a real screenshot
  migrations/0001_*.sql   the schema, run by the Chest in order
  app/ lib/ …             the code
  test/                   node:test, with the SDK's fakeChest
  seed/sample.sql         realistic sample data for screenshots and local runs (never run by the Chest)
  README.md               what it does, what it replaces, roles, routes, what is stubbed
  DESIGN.md               its identity and design system (brief/05)
  AGENTS.md               how an agent adapts it safely (model: reference/forms/AGENTS.md)
  THIRD_PARTY.md          code reused from other projects: source, licence, files (brief/04)
  LICENSE                 MIT, © 2026 Argentic (same as the SDK), unless PROGRESS.md says otherwise
```

## The SDK

**By default, a tool depends on the published SDK**:
`"@argentic/chest-sdk": "^0.2.0"` from npm. Import its subpaths:
`@argentic/chest-sdk/member`, `/database`, `/files`, `/members`,
`/notifications`, `/events`, `/errors`, `/testing`. Server side only — never
in a `"use client"` module.

**`sdk/` is the studio's fork of the SDK, and you are expected to push it
forward.** It starts as an exact copy of the published 0.2.0
(`chest-by-argentic/Chest-SDK` commit `387ae90`). When a SaaS you rebuild
needs something the Chest does not give (email, scheduled tasks, jobs,
accounts for outside users, payments, AI, events between tools, audit log,
realtime…), design the primitive **in the fork**, as it would ship:

1. a module `sdk/client/src/<feature>.ts` with its public API, exported like
   the others (`client/index.ts`, `exports` in `package.json`,
   `scripts/check-package.mjs`), dependency-free (`node:*` only);
2. it talks to the Chest's API (`CHEST_API`) on the routes you propose; on a
   real Chest those routes do not exist yet, so it throws
   `CapabilityNotGranted` or `Unavailable` — the tool must catch it and stay
   useful ("Emails will be sent once your Chest can send them");
3. **`fakeChest` implements it** in `sdk/client/src/testing.ts`, with the
   quotas and errors you propose: this is how you show, in tests and in the
   dev harness, how the primitive would behave — an email outbox you can
   read, a scheduled task you can trigger, a payment you can complete;
4. tests in `sdk/client/test/`, a section in `sdk/README.md` marked
   **Proposal (studio)**, and its entry in the SDK report (brief/06) with the
   manifest key and the owner's approval sentence;
5. the fork's version becomes `0.3.0-studio.N` (N bumped at each change);
   `npm test` and `npm run check:package` stay green in `sdk/`.

A tool that uses a proposal gets the fork packed into its own folder:

```sh
node scripts/add-sdk.mjs tools/private/<name>   # packs sdk/ into tools/private/<name>/vendor/, sets the dependency
cd tools/private/<name> && npm install          # the lock records file:vendor/…, npm ci works
```

Re-run it after every change to `sdk/`. The fork's diff against its first
commit is the concrete SDK proposal the owner will review.

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
- **A dev harness, once, for every tool**: build `lab/chest-dev/` in step 2 — it starts `fakeChest` with a few sample members, runs a tool with the
  right environment, and serves it on `localhost` with a small member switcher
  that signs `Chest-Member` for the chosen member (`signAssertion`). It is a
  lab tool, never part of a tool. It uses the SDK fork's `fakeChest`, so the
  proposed primitives work in it too (show an outbox, fire a scheduled task,
  complete a fake payment). Everything that was hard about it goes into the
  SDK report: it is exactly the `chest dev` we are about to build.
- **Screenshots**: if a headless browser works in your environment
  (Playwright), capture each tool's main screens at 1440 px and 390 px into
  `docs/screens/` of the tool's folder, and the store preview into `chest/preview.png`.
  If it does not, say so in PROGRESS.md; the owner will capture them.

## Missing platform features

When a tool needs what the Chest does not give yet, the answer is a proposal
in the SDK fork (see "The SDK" above), never a private workaround inside the
tool:

- the tool calls the proposed module exactly as it would call a shipped one;
- the dev harness and the tests run it against `fakeChest`, so the owner can
  see the feature working (the outbox shows the email, the fake checkout
  completes the payment, the scheduled task fires);
- on a real Chest today, the tool catches `CapabilityNotGranted` /
  `Unavailable` and stays useful, saying in plain words what will come;
- the tool's README lists the proposals it uses ("Needs from the SDK").

Only when something cannot belong in the SDK (business logic of that one
tool) does it stay in the tool. Never ship credentials, never reach a service
that is not declared in `network`.

## Definition of done

A tool is done when, from a clean checkout of its folder:

- [ ] It lives in its own folder, `tools/private/<name>/` or
      `tools/public-and-private/<name>/`, and depends on nothing outside it.
- [ ] `npm ci && npm test && npm run build` pass; `npm start` serves `/` and `/chest`.
- [ ] `chest.json` follows every rule of the contract (write
      `scripts/check-manifest.mjs` once, from the contract, and run it; the
      real `chest check` does not exist yet — say in the SDK report what it
      should catch).
- [ ] Every `/chest` route checks the member; each role's rights are tested.
- [ ] Migrations run on an empty database; sample data loads.
- [ ] English and French complete, same keys.
- [ ] Empty, loading, error and "no access" states designed; works at 390 px;
      keyboard and screen-reader usable; WCAG AA contrast.
- [ ] No runtime request leaves the tool (fonts, icons, scripts all local).
- [ ] Lifecycle events handled if member ids are stored.
- [ ] `README.md`, `DESIGN.md`, `AGENTS.md`, `THIRD_PARTY.md` (if any reuse),
      `chest/icon.svg`, `chest/preview.png`.
- [ ] Its row in PROGRESS.md and its card in the showcase are up to date.
