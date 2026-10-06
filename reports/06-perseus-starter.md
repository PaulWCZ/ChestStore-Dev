# A better starter for Perseus Code

_Version 2, 6 October 2026. It follows an independent review of version 1
and the first two tools moved onto the starter (Polls and Tasks). The
reference snapshot is the one of 5 October (`reference/perseus-starter/`,
Chest `0c2bcfd`; `@argentic/chest-sdk` 0.4.1)._

_Where things are:_
- _the template: [`starter/`](../starter/);_
- _its machinery, now a package: [`app/`](../app/) (`@argentic/chest-app`
  0.1.0-studio.1);_
- _the measuring tools: [`lab/starter-bench/`](../lab/starter-bench/), with
  their raw output in `lab/starter-bench/results/`._

_Each measurement says how it was made. Anything assumed is marked as
such._

## 1. In short

- **Keep the reference starter's stack.** Hono, React rendered on the
  server, islands, Vite and TypeScript are the right choice, and they are
  light. Nothing measured justifies changing stack. The studio's Next.js
  template:
  - rests at 141 MiB, against 70–75 MiB;
  - builds in 14 s, with an 894 MiB peak — more than the 512 MiB build
    container, as this host counts memory;
  - keeps 443 MiB of `node_modules` in the image.
- **The reference starter lacks what every tool needs on its second
  turn:** a way to change data (actions, CSRF protection), a refresh after
  a change, two languages, dates in the member's time zone, error pages, a
  database, the Chest's events and schedules, the UI kit, logs and tests.
  Each agent re-invents them. The two pilots each patched the same holes.
- **`starter/` keeps the stack and adds those.** Its machinery is no longer
  copied into each tool. It is a versioned package, `@argentic/chest-app`,
  vendored the way the UI kit is, so a fix reaches every tool when the
  tool re-vendors it. The lead decided this; §7 compares both options.
- **What it costs, measured with the candidates run in turn (§4):**
  - **At rest**, the starter's server takes **74.5 MiB RSS**. The
    reference takes **70.4 MiB with the same V8 flag** (A′) and 75.3 MiB as
    shipped (A).
  - **Where the extra 4 MiB over A′ goes:** the example page's database
    connection, kit components and Intl formats. The same server with a
    plain page rests at 67 MiB, below A′.
  - **Cold start:** 15 to 20 ms slower (median 193 ms against 174–179 ms,
    started without npm; the host was noisy).
  - **In the Perseus workbench:** with a real PostgreSQL, `npm test` peaks
    at 331 MiB RSS (237 MiB PSS) and the dev server rests at 427 MiB RSS
    (251 MiB PSS). Together they stay under the workbench's 1 GiB.
  - **With PGlite**, the last-resort database, `npm test` alone takes
    1.3 GiB. So the tests use the preview's database whenever there is one.
- **No `"csp": "tool"` permission is needed for a public part.** The pages
  have no inline script, no inline `<style>` and no `style=""` attribute,
  so they are exactly what the Chest's default public policy accepts.
- **Two decisions belong to the owner (§8):**
  - whether the Chest ships the package, as it ships the SDK tarball;
  - whether the Chest ships the UI kit.

  Today the Chest ships neither: both are studio packages.

## 2. What Perseus needs from a starter

These needs come from `reference/product/specs/perseus-build.md` ("The
workbench", "Knowledge", "The starter") and
`reference/contract/application-contract.md`.

1. **It builds, runs and passes its test on the first turn**, in two places:
   - the workbench: `NODE_ENV=development`, the draft's own `CHEST_API`,
     three fake members, a database `pb_<project>`, and 1 GiB on the
     Starter plan with the dev server running;
   - the Chest's build: `npm ci`, then `npm run build` in 512 MiB and one
     CPU, then `npm prune --omit=dev`, a read-only tree,
     `NODE_ENV=production`, started as `node /chest/launcher.mjs npm start`.
2. **It is lean.**
   - Little memory at rest: 256 MiB per tool by default, and the Chest
     reserves memory only for awake tools.
   - A fast cold start: a sleeping tool wakes on the first request, and a
     browser shows "Waking up…" after 2 s.
3. **An agent extends it and never starts over.** The agent reads the
   project's `AGENTS.md` on every turn, so the starter needs:
   - one way to do each thing;
   - conventions an agent can copy;
   - types and tests that catch the mistakes an agent makes.
4. **It follows the Chest's rules out of the box:**
   - identity only from `member()`;
   - the capabilities the tool uses declared, and nothing more;
   - the strict content security policy;
   - nothing on disk or in memory that must survive;
   - logs an operator can read, with no secret and no personal data — they
     are kept 7 days and readable through `/api/v1/logs`.

## 3. Candidates

| | What | Measured |
|---|---|---|
| **A** | `reference/perseus-starter/` as it is (the SDK tgz from npm 0.4.1 in `vendor/`) | yes |
| **A′** | A with `node --optimize-for-size` in `start`. B uses this flag; A′ separates the flag's effect from the design | yes |
| **B1** | `starter/` version 1: the machinery copied into the tool (`src/core/`, 579 lines) | yes (5 October, run 2) |
| **B2** | `starter/` version 2: the machinery as the package `@argentic/chest-app`, vendored | yes (6 October, run 3) |
| **C** | `lab/template/`, the studio's Next.js 16.3.6 template | yes (run 2) |

B1 and B2 run the same code. The server bundles the package either way, so
a page costs the same whether the machinery was copied or vendored: 74.3
and 74.5 MiB at rest. They differ in what an agent reads and in how a fix
reaches the tools (§7).

Considered but not built:
- Preact in the browser;
- Hono's own JSX on the server.

Both were ruled out because the kit's components are React.

## 4. Measurements

**Machine.** The studio's container: 4 CPUs, 16 GB, Linux 6.18. It is
**shared with other agents' builds**, so timings are noisy: a cold start's
maximum was 2 to 4 times its minimum. Memory figures are stable: 5 runs
fall within 0.5 MiB. Node **v24.21.0**, the Chest's pinned version.

### Run 3 — the candidates in turn

Date: 6 October. Script: `lab/starter-bench/interleaved.mjs`. A, A′ and B2
run one after the other, round after round, so the host's load falls on
all of them alike.

- **Cold start:** from spawn to the first 200 on `/chest` as a signed
  member. 15 rounds, started both with the start script's `node …`
  command and through `npm start`.
- **At rest:** started with `npm start`, `/chest` requested 5 times, then
  30 s idle. Then the server process's RSS, USS (private memory) and PSS,
  read from `/proc/<pid>/smaps_rollup`. 5 rounds.
- B's page reads its database: a PostgreSQL 16 on the host, a fresh
  database for each start. A's page has no database.

| | A reference | A′ ref. + flag | **B2 starter v2** |
|---|---|---|---|
| **At rest, server RSS** (median of 5) | 75.3 MiB | **70.4 MiB** | **74.5 MiB** |
| At rest, server USS / PSS | 23.8 / 27.1 MiB | 18.4 / 21.9 MiB | 22.7 / 26.9 MiB |
| Cold start, `node …` (median, min–max of 15) | 174 ms (109–392) | 179 ms (125–536) | 193 ms (137–481) |
| Cold start, `npm start` | 339 ms (200–634) | 357 ms (228–745) | 396 ms (228–858) |
| `npm start` process beside the server | 68 MiB RSS / 18 MiB USS | same | same |

**The reviewer's numbers agree.** On another run on the same machine they
measured:
- at rest: A 69.2 MiB, A′ 65.0 MiB, B 74.4 MiB;
- cold start, interleaved, 15 starts each: A 134 ms (90–188), B 173 ms
  (150–223).

So **B costs about 4 to 9 MiB and 15 to 40 ms more than A′.**

**Where the extra memory goes.** Same harness, 3 runs each, `node
--optimize-for-size`, all in the same session:

| B2's server with… | At rest |
|---|---|
| its `/chest` page reduced to a plain `<p>` | **67.2 MiB** |
| that plain page and a plain layout too | 66.9 MiB |
| A′, for comparison | 70.4 MiB |

- The machinery itself (actions, refresh, i18n, the policy, bundling)
  costs nothing at rest.
- The example page's PostgreSQL connection, the kit's shell and components,
  and the ICU date formats cost about 7 MiB. Any tool that reads a database
  and uses the kit pays that, whatever its starter.
- Most of the extra cold-start time is the first database connection; A
  connects to nothing.

### Run 2 — the earlier, one-at-a-time run

Date: 5 October. Script: `measure.mjs`, one candidate after the other.
Run 3 did not repeat these figures; B2's were checked again on 6 October.

| | A | B1 (copied core) | **B2 (package)** | C Next.js |
|---|---|---|---|---|
| `node_modules` after `npm ci` | 109 MiB | 110 MiB | 110 MiB | 504 MiB |
| … after `npm prune --omit=dev` (what the image keeps) | 12.8 MiB | 14.9 MiB | 16 MiB | 443 MiB |
| Build time (median of 3) | 0.9 s | 1.2 s | 1.1 s | 13.7 s |
| Build peak, tree PSS / largest RSS | 185 / 203 MiB | 250 / 266 MiB | 233 / 260 MiB | 894 / 907 MiB |
| Members' page JS, gzip | 66 KiB | 71 KiB | 72 KiB | 135 KiB, 7 requests |
| Members' page CSS, gzip | 0.2 KiB | 7.9 KiB | 7.9 KiB | 7.3 KiB |
| axe-core violations on `/chest` | 0 | 0 | 0 | 0 |
| At rest, server RSS (run 2) | 75.3 MiB | 74.3 MiB | (run 3: 74.5) | 140.9 MiB |

### In the workbench

Date: 6 October. Script: `lab/starter-bench/workbench.mjs`. The process
tree is sampled every 50 ms. The dev server is measured after its first
build and 20 s idle. `npm test` is measured alone, then again beside the
running dev server.

| | A | B2, tests on PGlite | **B2, tests on a PostgreSQL server** |
|---|---|---|---|
| `npm test` peak, RSS / PSS | 194 / 122 MiB, 0.9 s | **1,298 / 1,164 MiB**, 5.6 s | **331 / 237 MiB**, 1.9 s |
| `npm run dev` at rest, RSS / PSS | 389 / 210 MiB | 424 / 247 MiB | 427 / 251 MiB |
| Both at once (sum of the peaks, an upper bound) | 586 / 332 MiB | 1,722 / 1,411 MiB | **758 / 488 MiB** |

- **B2 fits the 1 GiB workbench only when its tests use a real
  PostgreSQL.** `testDatabase()` picks one by itself:
  - in the workbench, the preview's `DATABASE_URL`, with a throwaway
    schema;
  - in the studio, `TEST_DATABASE_URL`, with a throwaway role and
    database;
  - PGlite only as a last resort: `PGlite.create()` alone takes about
    500 MiB. The package's AGENTS page says so.
- **B's `npm test` peak comes from its server build,** which bundles the
  packages as the production build does.
- **Its dev server is lighter than version 1's** (499 MiB): `npm run dev`
  no longer bundles the server's packages.

### Also measured

- **Intl objects made per call.** Version 1 made one
  `Intl.DateTimeFormat` per date shown, which is what the SDK's guidance
  leads to. After 400 renders of a 30-note page, its server held 427 MiB.
  ICU objects live outside V8's heap, so the garbage collector is in no
  hurry to free them. Made once per language, zone and style, the same
  load holds 87 to 106 MiB. The package caches them.
- **Stopping.** B's server exits 6 ms after `SIGTERM` with its database
  pool open. The reviewer found that the reference's `SIGTERM` handler,
  with its own `db()` recipe, waits more than 10 s: it calls
  `server.close()` and never exits.

### Not measured

- A real Chest (its launcher is one more Node process).
- The real Perseus workbench.
- Firefox and Safari.
- Dark mode. Version 1's "dark" axe audits were not dark: the starter's
  theme, the Chest's own sheet, is light only, so they audited the light
  page again.

## 5. Judgement, criterion by criterion

**Memory at rest.** A′ 70.4 MiB, B2 74.5, A 75.3, C 140.9. B2 is about
4 MiB above A′ because its example reads a database and uses the kit; its
machinery alone is lighter than A′. Every candidate also keeps a 68 MiB
`npm start` process beside its server (§9.1).

**Cold start.** A and A′ about 175 ms, B2 about 195 ms (started without
npm; medians on a noisy host), C about 820 ms. All are well under the 2 s
before the browser shows "Waking up…".

**Install, build, workbench.**
- A and B: 110 MiB installed, 13 to 16 MiB in the image, builds in about
  1 s under 270 MiB.
- B2's tests and dev server fit the workbench when they use a real
  database (§4).
- C: 443 MiB in the image, a 14 s build, and a build peak above 512 MiB.

### Simplicity for an AI agent

| Change | A reference | B2 `starter/` | C Next.js template |
|---|---|---|---|
| A page | a component + a route (2 files); no words, no layout | a component in `src/pages/` + a route in `src/app.tsx` + words in `en.ts`/`fr.ts` (4 files) | `app/chest/x/page.tsx` + words (3 files) |
| A mutation | **not provided** | one entry in `src/actions.ts` + its rule in `src/lib/`; a `<form>` or `call()` | a `"use server"` function + a client component + `router.refresh()` |
| A table | a recipe in prose | a migration + queries in `src/lib/` | same as B2 |
| A public page | a route + `"public": true` | `publicPage()`/`publicAction()` + `"public": true` | the same + `"csp": "tool"` |
| A schedule | not shown | a line in `chest.json` + a handler in `src/app.tsx` | the studio's pre-0.4 `chest-jobs` |
| A translation | none | a key in `en.ts` and `fr.ts`; tsc refuses a missing one | same as B2 |

**What B2's types and tests refuse.** Each case is either checked by a
test of the package or was checked by breaking the starter once.
- A prop given to an island that is a function or a Date.
- `call()` with a wrong input or an unknown action. The tool registers its
  actions, words and islands once, in `src/register.ts`.
- A key missing from `fr.ts`.
- A `{placeholder}` that differs between languages.
- French text without its narrow no-break space before `: ; ? !`.
- `style={}`, or a spread that carries one, anywhere in `src/`.
- An island or a shared component that imports the SDK or server code.
- A colour written in the CSS.
- **A CSS class defined nowhere.** The reviewer's agent guessed
  `ck-field-group`; that now fails.
- **A capability declared and unused, or used and not declared** — what
  Perseus forgets to prune.
- A schedule without a handler.
- A rendered page with an inline script, a `<style>` or a `style=""`
  (checked on every page the tests fetch).
- A cross-site POST.
- A test file left with fewer tests than it promised (`atLeast(n)`).

Not caught: business rules, that is, who may do what. The example shows
where they go: `src/lib/`, decided from `member`.

**Size of what the agent reads.**
- The project's `AGENTS.md` is now 39 lines: what Perseus rewrites
  (purpose, data model, decisions, what to delete from the example).
- The reference page is the package's `AGENTS.md`, 222 lines, read from
  `node_modules/@argentic/chest-app/`. It covers how the package works,
  fields, words, the database, recipes, rules, the kit's classes, tests
  and pitfalls.
- The template is 28 files and 861 lines. The package is 1,292 lines of
  source and 234 of tests.

**UI quality with the kit.**
- A: unstyled HTML.
- B2 and C: the kit's shell, page header, empty state, toasts with an Undo
  that tells the truth, buttons and fields.
- B2's default look is the Chest's own sheet, light only. A catalogue
  theme, or the tool's own, is a one-line change.
- A look chosen at run time is supported by the package (the `look`
  option: a stylesheet served with its hash). This is for when an SDK
  gives the company's choice.

**Accessibility.** axe-core finds zero violations for A, B and C on
`/chest`, and for B also on `/` and on `/chest` with a note, at phone
width (light only, see §4). B adds:
- a label for every field;
- `aria-describedby` from each row's buttons to its note;
- the shell's skip link and `main` landmark;
- focus moved to `main` when a refresh removes the focused element;
- `aria-busy` while a form is sent, and "still sending" on a second submit;
- toasts in live regions, outside `main`, kept across pages;
- reduced motion, and 44 px targets.

Checked in Chromium only.

**Languages.** B has:
- one catalogue per language: English is the source and fallback, French
  second; the kit's words sit inside it (`t.kit`);
- `member.language` for members; for visitors on the public part, their
  own choice, then Accept-Language, then the Chest's language;
- plural rules, on the server and in islands;
- dates and numbers written on the server in the member's language and
  time zone;
- amounts in cents (`field.money`, `f.money(…, { cents: true })`), and
  date columns read as text.

**Tests.** B2 has:
- 15 tests in the starter: 11 against the built server, with the SDK's
  fakeChest and a real PostgreSQL, and 4 on the sources;
- 13 tests in the package: its fields, redirects, formats and checks, and
  a small tool built on the packaged code;
- 10 Chromium tests (`lab/starter-bench/browser.test.mjs`). They check
  hydration under the policy, forms sent in place, and a refresh that
  keeps typed text, scroll, an island's state and a moved row's island.
  They also check Undo, a refusal shown as a toast, a refresh that meets a
  502 (the page is kept) or a 403 (the page reloads), and Delete and the
  forms without JavaScript. Finally, a second submit, the public page
  under both policies, and the cache headers on `/assets/`.

**Security.**
- Identity only from `member()`.
- The strict policy on every answer, plus `nosniff`,
  `Referrer-Policy: same-origin`, COOP, and `no-store` on pages.
- Mutations only by POST to an action, refused unless
  `Sec-Fetch-Site: same-origin`, or an `Origin` equal to the `Host`. JSON
  is accepted only with a header a cross-site page cannot send without a
  preflight.
- A body limit per action.
- **Redirects only to a path of the tool.** Version 1 let `/\evil` and
  `/<tab>/evil` through `redirect()` and the language switch — an open
  redirect the review found. `toolPath()` now resolves the target and
  refuses any other origin. The tests cover `//`, `/\`, `/%5C`, `/%09/` and
  `https:`.
- A public write is bounded (the example allows 50 a day, counted in the
  database) and has a honeypot field.
- **The request log names the route's pattern** (`/p/:link/actions/:name`),
  never the path or the query. Otherwise a guest's link or a token in an
  address would sit in the log for 7 days.
- Database errors are logged without their detail, which can hold row
  values.

## 6. The reference starter: what to keep, what it lacks

**Keep — B keeps all of it:**
- the stack;
- two Vite builds of one source, with fixed asset names under one
  `build.static` prefix;
- islands named in one registry and hydrated from `data-props`, with no
  inline script;
- tests of the built server with fakeChest, with `--test-force-exit`;
- `dev.mjs`, which needs no shell;
- a short `AGENTS.md`.

**What it lacks:**
- mutations and CSRF protection;
- a refresh after a change;
- error pages;
- a public part;
- languages;
- database wiring in code: there is only a recipe in prose, and with it
  `SIGTERM` hangs;
- events and schedules;
- the kit;
- cache headers on `/assets/`;
- logs;
- tests beyond the greeting.

Also, its policy's nonce is never used, and its `AGENTS.md` does not say
that React's `style={}` is blocked on a public part.

## 7. Copied core or a package — for Perseus

| | Copied core (B1) | Package (B2) |
|---|---|---|
| A fix (an open redirect, a caching bug) | Reaches no existing tool: each copy must be patched by hand. The two pilots diverged from the starter, and from each other, within a day | Re-vendored with `scripts/add-app.mjs`, like the kit; the version number says which tool has it |
| What the agent reads | All of it, every turn (579 lines) — and it may "improve" it | The tool's code and the package's `AGENTS.md`; the machinery stays out of its way |
| What the agent can change | Everything, for one tool | Nothing in the package. A need it does not meet becomes a request to the package, not a fork |
| Runtime cost | — | None measured (both are bundled the same way) |
| Typing | Direct imports of the tool's actions | One `src/register.ts` (module augmentation) |
| Who ships it | The starter | **The Chest must ship it** for Perseus, as it ships the SDK tarball. A tool's `vendor/` holds the copy it was built with |

The lead decided on the package. For the Chest, that means a third
vendored tarball beside the SDK (and the kit, §8), versioned with each
Chest release so that Perseus always knows the exact API — the same
arrangement as the SDK's knowledge-pack page. The owner decides.

## 8. Recommendation

1. **Ship B2.** Make the starter's conventions the official Perseus
   starter, and ship its machinery as `@argentic/chest-app`, vendored like
   the SDK — if the owner agrees that the Chest ships it (§7).
2. **Decide on the UI kit separately.** Today the Chest ships only the SDK
   tarball; the kit (`@argentic/chest-ui`) is the studio's. The starter's
   UI quality depends on it.
3. **Keep the strict default policy** and no `"csp"` permission for tools
   made from the starter.
4. **Generate the knowledge-pack page** from the package's `AGENTS.md`.

## 9. What the platform or the SDK makes hard (for the SDK report)

1. **`npm start` stays resident.** Each awake tool keeps an npm process of
   68 MiB RSS (18 MiB private) — as much as the starter's server. The
   launcher adds a third Node process. Ask: let `build.start` be
   `node <file> [flags]`.
2. **Intl objects made per call** (§4). The SDK could export a cached
   formatter, or warn about this in its AGENTS.md. Its own `chest.timeZone`
   builds an `Intl.DateTimeFormat` on every read (`client/src/chest.ts`,
   `knownZone`).
3. **`fakeChest` has no database,** yet every tool's tests need one.
   - PGlite costs about 500 MiB per test file, too much for the workbench.
   - `pglite-socket` accepts a single connection unless told otherwise.
   - An official `fakeChest({ database })` would serve every tool: a schema
     in the preview's database, with the migrations played as the Chest
     plays them.
4. **The official SDK has no theme.** When it gets one, the look should be
   a stylesheet (the package already serves `/chest/look.css?v=<hash>`),
   so tools can keep `style-src 'self'`.
5. **The Chest strips `Chest-*` headers from browser requests.** So a
   tool's CSRF header must be named something else (`x-tool-action`).
6. **The public host does not check `Sec-Fetch-Site` or `Origin` on
   POST** (the team host does). The tool must do it.
7. **Member assertions.** `fakeChest` signs them for 60 s, and `member()`
   allows 5 s of clock skew (`client/src/member.ts`, `testing.ts`).
   Version 1 of this report wrongly said they live 5 s. A local browser
   test still needs a front that signs each request
   (`lab/starter-bench/chest.mjs`).
8. **Logs are kept 7 days and agents can read them.** A framework that
   logs raw paths leaks whatever an address carries. This deserves a line
   in the contract's "Logs" section.
9. **The reference starter itself:**
   - its policy carries a nonce nothing uses;
   - `/assets/` has no cache headers;
   - `SIGTERM` hangs once a database pool is open;
   - nothing warns that `style={}` is blocked on a public part. The SDK's
     contract suggests `style-src-attr 'unsafe-inline'`, which a public part
     without `"csp": "tool"` cannot use.

## 10. What I verified, and what I did not

**Verified:**
- In `starter/`: `npm ci && npm run build && npm test` (15 tests), run
  against three databases — PGlite; a PostgreSQL server through
  `TEST_DATABASE_URL`; and a `pb_…` preview-shaped database through
  `DATABASE_URL`. Each run cleans up after itself.
- `node scripts/chest-check.mjs starter`: OK for contract 0.4; the tool
  asks for database, members and receives.
- `npm run dev` and `npm start` serve the tool.
- In `app/`: `npm test` (13 tests).
- The 10 Chromium tests and the axe audits.
- Every number in §4, by the method stated there.

**Not verified:**
- a real Chest and its launcher;
- the real Perseus workbench;
- Firefox and Safari;
- the CSRF `Origin` fallback in a browser that does not send
  `Sec-Fetch-Site`;
- dark mode: the starter's theme has none.
