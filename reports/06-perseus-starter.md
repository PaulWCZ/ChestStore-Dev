# A better starter for Perseus Code

_Version 4.3 (package studio.8), 6 October 2026. It follows four independent reviews (of
versions 1, 2, 3 and 3.1) and the tools moved onto the package (Polls,
Tasks, News, Booking, Support, Status, Wiki, Leave, Expenses, People). The
reference snapshot is the one of 5 October (`reference/perseus-starter/`,
Chest `0c2bcfd`; `@argentic/chest-sdk` 0.4.1)._

_Where things are:_
- _the template: [`starter/`](../starter/);_
- _its machinery, now a package: [`app/`](../app/) (`@argentic/chest-app`
  0.1.0-studio.8; §10 says which tools vendor it and what it asks of
  them);_
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
- **What it costs, measured with the candidates run in turn (§4, run 4):**
  - **At rest**, the starter's server holds **22.6 MiB of private memory
    (USS)**, against **18.7 MiB for the reference with the same V8 flag
    (A′)** and 23.6 MiB for the reference as shipped (A): **about 4 MiB
    more private memory than A′** (RSS 74.4 against 70.5; PSS 29.1 against
    23.7). The reviewer measured the same gap (USS 22.2 against 18.3).
  - **Where it goes:** the same server with a plain page — no database
    read, no kit component — still holds 1.8 MiB more private memory than
    A′ (20.5 against 18.7): that is the machinery's own cost. The rest
    (~2 MiB) is the example page's database connection, kit components and
    date formats.
  - **Cold start:** about 20 ms slower than A′ and 40 ms slower than A
    (medians 155, 136, 118 ms, started without npm); with a plain page,
    137 ms, as A′. The difference is mostly the first database connection.
  - **In the Perseus workbench** (`NODE_ENV=development`): with a real
    PostgreSQL, `npm test` peaks at 331 MiB RSS (236 MiB PSS) and the dev
    server rests at 426 MiB RSS (251 MiB PSS) — together under the
    workbench's 1 GiB. With PGlite, the last resort, `npm test` alone takes
    1.2 GiB, so the tests use the preview's database whenever there is one.
- **Since version 3 (studio.3, run 5):** the server rests at 23.5 MiB USS
  against A′'s 18.5 (+5 MiB; studio.2 measured +4); pages go gzipped
  (a 30-note page 30.2 KB → 2.2 KB, +0.3–0.9 ms) and the browser's files
  brotli from the build (the entry 237 → 64 KB): the Chest's front
  compresses nothing. Links between pages of the same part go in place,
  actions run one at a time, public actions are bounded by the package.
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

### Run 5 — studio.3 against A′ (6 October, after the third review)

`results/interleaved-run-5.json`: 10 cold-start rounds, 5 at rest, A′ and
B in turn. B now includes the pilots' package changes (hashed entry,
islands rendered at once), compression, link interception, the action
queue and bounds.

| | A′ ref. + flag | **B studio.3** |
|---|---|---|
| At rest, USS / PSS / RSS | 18.5 / 21.3 / 70.4 MiB | **23.5 / 27.0 / 75.4 MiB** |
| Cold start, `node …` (median, min–max of 10) | 187 ms (137–298) | 202 ms (161–301) |
| Cold start, `npm start` | 305 ms | 305 ms |

So studio.3 costs about 1 MiB of private memory more than studio.2 (5
MiB above A′ in all). Compression has no cost at rest (it runs per
request); per page it adds 0.3–0.9 ms p50 (400 renders of a 30-note page,
gzip against identity, 2 runs each).

### Run 4 — the candidates in turn (studio.2; the comparison with A)

Date: 6 October, on the v3 starter with its own fixes, before the
pilots' changes to the package were merged in (hashed script names,
islands rendered at once — they touch the browser, not the server at
rest). Script:
`lab/starter-bench/interleaved.mjs`; raw output
`results/interleaved-run-4.json`. A, A′, B2 and B2 with a plain page run
one after the other, round after round, so the host's load falls on all
of them alike. **The headline is private memory (USS) and PSS**: RSS
counts the Node binary's shared pages, the same in every candidate.

- **Cold start:** from spawn to the first 200 on `/chest` as a signed
  member. 15 rounds, started both with the start script's `node …`
  command and through `npm start`.
- **At rest:** started with `npm start`, `/chest` requested 5 times, then
  30 s idle. Then the server process's RSS, USS (private memory) and PSS,
  read from `/proc/<pid>/smaps_rollup`. 5 rounds.
- B's page reads its database: a PostgreSQL 16 on the host, a fresh
  database for each start. A's page has no database.

| | A reference | A′ ref. + flag | **B2 starter** | B2, plain page |
|---|---|---|---|---|
| **At rest, server USS (private)** (median of 5) | 23.6 MiB | **18.7 MiB** | **22.6 MiB** | 20.5 MiB |
| At rest, server PSS | 28.5 MiB | 23.7 MiB | 29.1 MiB | 25.2 MiB |
| At rest, server RSS | 75.1 MiB | 70.5 MiB | 74.4 MiB | 67.2 MiB |
| Cold start, `node …` (median, min–max of 15) | 118 ms (99–250) | 136 ms (124–159) | 155 ms (136–201) | 137 ms (114–171) |
| Cold start, `npm start` | 204 ms (175–328) | 237 ms (204–311) | 243 ms (217–320) | 212 ms (189–317) |
| `npm start` process beside the server | 68 MiB RSS / 18 MiB USS | same | same | same |

"Plain page": B2 with its `/chest` page reduced to a `<p>` (no database
read, no kit component); the layout, the machinery and the bundling stay.

**The reviewer's numbers agree** (5 interleaved rounds, their run): RSS
A 69.4 / A′ 64.9 / B2 74.1 MiB; USS 23.2 / 18.3 / 22.2; PSS 26.3 / 21.9 /
26.3; plain-page B2 USS 20.4 against A′ 18.1; cold start A 122 / A′ 136 /
B2 163 ms.

So **B2 costs about 4 MiB of private memory and 20 ms of cold start more
than A′; its machinery alone about 2 MiB** — the rest is what the example
page does (a database connection, kit components, date formats), which
any tool that reads a database and uses the kit pays whatever its starter.
Version 2 of this report said the machinery cost nothing and rested below
A′: that compared RSS across runs; by USS it is ~2 MiB above. Most of the
extra cold-start time is the first database connection; A connects to
nothing.

Run 3 (6 October, before the v3 fixes, `results/interleaved-run-3.json`)
gave the same at-rest figures within 0.4 MiB. The third reviewer
re-measured the headline on studio.2: USS 22.6, RSS 74.5 MiB — the same.

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

Date: 6 October (run 4, `results/workbench-run-4.jsonl`). Script:
`lab/starter-bench/workbench.mjs`. `npm test` runs with
`NODE_ENV=development`, as in the workbench. The process tree is sampled
every 50 ms. The dev server is measured after its first build and 20 s
idle. `npm test` is measured alone, then again beside the running dev
server.

| | A | B2, tests on PGlite | **B2, tests on a PostgreSQL server** |
|---|---|---|---|
| `npm test` peak, RSS / PSS | 194 / 138 MiB, 1.0 s | **1,172 / 1,041 MiB**, 3.3 s | **331 / 236 MiB**, 2.4 s |
| `npm run dev` at rest, RSS / PSS | 375 / 196 MiB | 433 / 255 MiB | 426 / 251 MiB |
| Both at once (sum of the peaks, an upper bound) | 569 / 334 MiB | 1,605 / 1,296 MiB | **757 / 487 MiB** |

**Version 2's `npm test` failed in the workbench.** With
`NODE_ENV=development` in the shell, 6 of its 15 tests failed
(`jsxDEV is not a function`): the build compiled JSX for development
while bundling React's production build. Version 3 makes the JSX
runtime and React's build follow the Vite mode only; the tests pass with
and without `NODE_ENV=development`, and the bench now runs them so. (The
review found it; version 2's §10 listed `npm test` as verified, but it had
been run without that variable.)

- **B2 fits the 1 GiB workbench only when its tests use a real
  PostgreSQL.** `testDatabase()` picks one by itself:
  - in the workbench, the preview's `DATABASE_URL`, with a throwaway
    schema;
  - in the studio, `TEST_DATABASE_URL`, with a throwaway role and
    database;
  - PGlite only as a last resort: the test run then takes 1.2–1.3 GiB.
    The package's own tests use the local server when one answers.
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

- ~~Memory and cold start since studio.3~~ — **measured on 7 October
  2026** in the quiet-window run (`lab/measure`, label `after-mail`:
  studio starter on package studio.8 and SDK 0.4.1; the reference Perseus
  starter beside it, same machine, same night, one at a time, load
  0.00–0.33; median of 10 cold starts and 5 rests of 30 s;
  `lab/measure/results/after-mail/TABLE.md`):

  | | Studio starter | Reference starter |
  |---|--:|--:|
  | PSS at rest, whole tree with `npm` (MiB) | 76.9 | 66.4 |
  | Server alone, PSS / RSS (MiB) | 42.0 / 73.9 | 34.3 / 68.9 |
  | Port open (ms) | 225 | 194 |
  | First 200 of `/chest` (ms) | 266 | 208 |
  | Image (MiB) | 18 | 13 |
  | Build, 4 CPUs (s) / peak PSS (MiB) | 1.3 / 258 | 0.7 / 186 |
  | `npm ci` in 512 MiB, 1 CPU | fits, peak 284 | fits, peak 292 |

  The studio starter costs about 8 MiB more at rest and 60 ms more to its
  first page than the reference: the package's machinery (islands per
  page, the change log, bounded public writes, compression) and its
  example page. Each of the 18 tools built on it rests at 93–105 MiB
  (whole tree; 62–75 MiB server alone) — `reports/07-stack-and-memory.md`.
- A real Chest (its launcher is one more Node process).
- The real Perseus workbench.
- Firefox and Safari.
- Dark mode. Version 1's "dark" axe audits were not dark: the starter's
  theme, the Chest's own sheet, is light only, so they audited the light
  page again.

## 5. Judgement, criterion by criterion

**Memory at rest** (private memory, USS). A′ 18.7 MiB, B2 22.6, A 23.6;
C 84.8 (run 2). B2 is about 4 MiB above A′: ~2 MiB for its machinery,
~2 MiB for what its example page does. Every candidate also keeps a
68 MiB `npm start` process beside its server (§9.1).

**Cold start.** A 118 ms, A′ 136, B2 155 (started without npm; medians of
15 on a noisy host), C about 820 ms (run 2). All are well under the 2 s
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
  actions, words and islands once, in `src/register.ts`. What `call()`
  sends is each field's wire type (`money` and `int` take what the person
  typed, `"12,50"`), what `run()` gets the read type (cents).
- An integer typed `""`, `"0x5"` or `"1e1"`, a day that does not exist
  (2026-02-31), an amount written ambiguously (`"12.345"`): refused with a
  code, never a silent 0 or a database error.
- A day given to `f.date` (it takes a `Date` only; `f.day` takes a day).
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
- A test file left with fewer tests than it promised (`atLeast(n)`), and
  (with `requireTests`, which the starter sets) a `src/lib/` module no
  test imports.
- A public action without `"public": true` (dead in production), and
  `"public": true` with nothing public served.

Not caught: business rules, that is, who may do what. The example shows
where they go: `src/lib/`, decided from `member`.

**Size of what the agent reads.**
Generated by `node lab/starter-bench/sizes.mjs` (6 October, studio.8; the
reviews found hand-copied figures stale five times: app's `npm test` now
runs `sizes.mjs --check` against this paragraph — the figures, the test
counts, the package's version, and every studio number of the header):
- The package is 0.1.0-studio.8. The package's tests: 50 (10 units,
  35 server, 5 change log); in Chromium: 17 tests; the starter's: 16
  tests.
- The project's `AGENTS.md` is 45 lines: what Perseus rewrites
  (purpose, data model, decisions, what to delete from the example).
- The reference page is the package's `AGENTS.md`, 581 lines, read from
  `node_modules/@argentic/chest-app/`. It covers how the package works,
  fields, words, the database, recipes (roles, writing to another member,
  paging, imports and archives, a schedule's test…), rules, the kit's
  classes, tests and pitfalls.
- The template is 29 files and 926 lines. The package is 3,164 lines of
  source and 1,012 of tests. (The reference starter: 16 files, 311 lines.)

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
  fakeChest and a real PostgreSQL, and 4 on the sources — passing with and
  without `NODE_ENV=development`;
- 35 tests in the package: its fields, redirects, formats and checks, and
  a small tool built on the packaged code (the pilots' own included; and
  bounds — junk that fails the checks spends nothing, a token serves
  once, budgets by kind and by subject, refusals' own ceiling, the
  reserve of a visitor who wrote today, a visitor by the front's
  address —, a download (and one asked in place: 204, unmade),
  compression measured, `settled()`, `rawRoute`, `zipStream` read by `unzip`, the database in a far
  time zone, a route's own policy and referrer policy, a public page in
  its own language, a page's own head and exact title);
- 15 Chromium tests (`lab/starter-bench/browser.test.mjs`). They check
  hydration under the policy, forms sent in place, a download asked
  once, a link to a `#place` followed in place, and a refresh that
  keeps typed text, scroll, an island's state and a moved row's island.
  They also check Undo, a refusal shown as a toast, a refresh that meets a
  502 (an HTML page or not: the page and what is typed are kept) or a 403
  (the page reloads), `call()` meeting the Chest's 403 (reload), Delete
  and the forms without JavaScript, a second submit, and the cache headers.
  The public part under the Chest's own policy was checked in Chromium in
  versions 1 and 2; version 3's starter has no public part (the package's
  tests cover it on the server).

**Security.**
- Identity only from `member()`.
- The strict policy on every answer, plus `nosniff`,
  `Referrer-Policy: same-origin`, COOP, and `no-store` on pages.
- Mutations only by POST to an action, refused unless
  `Sec-Fetch-Site: same-origin`, or an `Origin` equal to the `Host`. JSON
  is accepted only with a header a cross-site page cannot send without a
  preflight.
- A body limit per action.
- **Redirects only to a path of the tool.** Both reviews found an open
  redirect: version 1 let `/\evil` and `/<tab>/evil` through; version 2
  let `/..//evil.com` through (resolved to `//evil.com`), with `/.//`,
  `/%2e%2e//`, `/./\` and `/chest/..//` alike. `toolPath()` now refuses
  backslashes, control characters, any `.` or `..` segment raw or encoded,
  and any result starting with `//`; `redirect()`, the language switch and
  the form-back redirect all use it. The tests cover each of those inputs.
- A public write is bounded the same way in every tool (`publicAction`'s
  `bound`, after the Booking review): a form token the page makes,
  short-lived (2 h) and spent by any answer; a call counted only once
  valid (the token, the fields, what the run checks before
  `charge(kind)`; a run that throws gives its counts back); budgets per
  kind of write (new, change) and per subject (a guest link); refusals
  in a budget of their own (ten times `perDay`); the visitor keyed by
  the front's address (a studio proposal), else a cookie, and one with
  neither counted with everyone only. **What it does not do** (the
  fourth review's test): a robot without an address the Chest can name,
  dropping its cookie and loading the page for each fresh token, can
  spend `perDay` with calls that pass the checks — the people after it
  then meet `limit` until tomorrow; only those who wrote earlier that day
  keep a reserve (a tenth). Junk that fails the checks never writes, but
  fair public writes need the visitor's address from the Chest's front
  (§9, item 12: a blocker). Verified by the package's server tests, and
  in Chromium on Polls' guest form (the island sends the page's token,
  the answer renews it). The
  starter itself has no public part: a public part is a permission, and an
  agent that forgets to prune would leave a form open on the Internet.
- A body that is neither a form nor JSON is a 415, logged as a request,
  not as an error (anyone may post to a public action).
- A refusal shown on a page without JavaScript takes its values from the
  address only when they are numbers.
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
| A fix (an open redirect, a caching bug) | Reaches no existing tool: each copy must be patched by hand. The two pilots diverged from the starter, and from each other, within a day | Re-vendored with `scripts/add-app.mjs`, like the kit; the version number says which tool has it, and `scripts/check-vendor.mjs` that a pack is the working copy's. Today the starter and all eighteen tools vendor studio.8, each re-vendored and tested on it (§10) |
| What the agent reads | All of it, every turn (579 lines) — and it may "improve" it | The tool's code and the package's `AGENTS.md`; the machinery stays out of its way |
| What the agent can change | Everything, for one tool | Nothing in the package. A need it does not meet becomes a request to the package, not a fork |
| Runtime cost | — | None measured (both are bundled the same way) |
| Keeping the API | — | Every change is checked against the tools that vendor it: the pilots' tests found a type cycle v3 had introduced (a typed `locale`) and a function v3 had unexported (`send`), both reverted before release |
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
   - PGlite costs 1.2–1.3 GiB for a test run, too much for the workbench.
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
8. **The Chest's front does not compress** (nothing in the contract says
   it does; Next.js compressed itself, so the tools moving off it lost
   it). The package now compresses (pages gzip as they go, files at
   build), but every tool and server pays for it; the front could do it
   once for all, for every tool.
9. **The Chest relays `/chest` paths whatever their case** (`/CHEST/x`),
   while Hono's routes are case-sensitive: such a request gets a harmless
   404. Worth a line in the contract.
10. **Logs are kept 7 days and agents can read them.** A framework that
   logs raw paths leaks whatever an address carries. This deserves a line
   in the contract's "Logs" section.
11. **No bot protection on public forms.** A cookieless robot that loads
    the page for each token filled a 60-place form in 2.4 s (Forms
    review). The package's `bound.work` (a proof of work in a Worker)
    stops the robots that run no JavaScript — most form spam — and costs
    a person little (measured in Chromium on the studio's laptop: about
    60 ms on average, 0.5 s at worst at 14 bits; a phone assumed four to
    five times slower, not measured). It barely slows a native script:
    14 bits is about 16,000 hashes, about 1 ms per token for optimised
    native code (reasoned, not measured). So the protection that holds
    is the budgets (`perSubject`, `perDay`) and the visitor's address
    below; the platform should give one primitive — its front could ask
    a proof or a challenge once per visitor and vouch for it with that
    address.
12. **No visitor address: a blocker for fair public writes.** The
   front sets no `Chest-Visitor-Address` (or any address a tool can
   trust), so a tool can key a visitor only by a cookie the visitor
   drops at will. Every public tool's budgets then fall back to one
   ceiling for everyone, which one robot can spend (§5). The studio SDK
   proposes the header (`visitors.address()`), and the package already
   reads it.
13. **The reference starter itself:**
   - its policy carries a nonce nothing uses;
   - `/assets/` has no cache headers;
   - `SIGTERM` hangs once a database pool is open;
   - nothing warns that `style={}` is blocked on a public part. The SDK's
     contract suggests `style-src-attr 'unsafe-inline'`, which a public part
     without `"csp": "tool"` cannot use.

## 10. What I verified, and what I did not

**Verified:**
- In `starter/`: `npm ci && npm run build && npm test` (16 tests: the
  count of §5's paragraph, checked), with
  and without `NODE_ENV=development` (the workbench's), on PGlite and on a
  PostgreSQL server through `TEST_DATABASE_URL`; in version 2 also on a
  `pb_…` preview-shaped database through `DATABASE_URL` (a throwaway
  schema). Each run cleans up after itself.
- `node scripts/chest-check.mjs starter`: OK for contract 0.4; the tool
  asks for database, members and receives.
- `npm run dev` (run by the workbench bench) and `npm start` serve the tool.
- In `app/`: `npm test` (50 tests: 10 units, 35 server, 5 change log —
  §5's paragraph, checked by `sizes.mjs --check`), also under
  `NODE_ENV=development` (its peak 277 MiB RSS on the local
  server, against 1.2 GiB on PGlite).
- **studio.8** (6 October, after the fifth review; breaking). The changes:
  - **deploys**: a page's version includes the build (the entry's
    hashed name), so a refresh after a deploy is never a 304 of the old
    HTML; a page read in place that links another `client-*.js` is
    loaded plainly; a failed chunk load is not cached by the package, and
    since the browser keeps a failed module failed, the page is loaded
    again once (never in a loop: a 30-second guard in `sessionStorage`).
    Verified in Chromium (above);
  - **islands from the registry**: `virtual:chest-islands` and
    `chest-islands.json` come from `src/islands/index.ts` — a folder, a
    default export, `export { X }`, a re-export, an alias; an island the
    registry cannot place fails the build and `checkSources`; in
    development, `mount()` warns about an island it has no code for
    (before, such an island was in no bundle and its form posted as a
    GET with its fields in the address). Unit-tested;
  - **proof of work, corrected**: (a) a refusal of a request without a
    valid token brings no token (before, every refusal brought a fresh,
    valid one); the browser reads the page's tokens again and sends
    once more by itself (`retry` in the refusal); (b) the signature and
    the proof are checked before any query (before, the day's bits were
    read from the database first); (c) a token issued at fewer bits than
    today's is refused after the day's escalation, its answer bringing
    one of today's (before, the base sufficed all day); (d) the claims
    reworded here, in AGENTS and in `tool.ts` (§9.11). Tested: 60
    unsolved calls refused with no token back, a replayed token brings
    none, an 8-bit token refused once the day asks 9 and its answer's
    9-bit token passes;
  - **no JavaScript on a `work` form**: the code `needs_javascript`
    (before, "This form expired: send it again" forever) and a
    `<noscript>` line from `<Honeypot>`; `checkSources` asks the words
    in every catalogue of a tool whose public action asks work. Tested;
  - **the render's mark** is set right before the render (after the
    page's last `await`): 30 concurrent public reads each carry their own
    islands' mark (before, 29 of 30 did not). Tested;
  - the version includes the reader's time zone; a refresh compares two
    reads without their form tokens (before, every public page read
    looked changed); `fail(code, values, { field })` names a field from a
    run; `checkSources` warns about the starter's `EXAMPLE (Notes)`
    markers left in a tool; AGENTS: the kit's `useAutoRefresh` no longer
    recommended, the change-log recipe follows the starter's
    `0001_chest.sql`, and recipes for notifying from a public action, a
    picture on a members' or a public page, the toasts' words, a
    visitor's personal data, a wall display (`idleMinutes`);
  - the starter: a test that an empty statement does not move the
    page's version and a write does (§10 claimed it before it existed);
    its AGENTS lists what `0001_chest.sql` holds and `AutoRefresh.tsx`
    among the example's files.
  Booking's browser flow imports its Calendly fixture moved to start
  tomorrow (its fixed date had passed); Forms loads its islands per page
  (`virtual:chest-islands`).
- **studio.7** (6 October; breaking). The changes:
  - **a page's version that stays right**: `changeStamp()` of `/db`,
    over a change log a tool copies into a migration (`sql/changes.sql`,
    then `select chest_watch('<table>')`). Each transaction that changes
    watched rows inserts one log row (statement triggers with transition
    tables: an empty `delete` adds nothing; a transaction-local flag: one
    row per transaction); the stamp is the count of rows, visible only
    at commit, read before the page renders. The tools' own designs were
    wrong both ways: a counter row serialises writers (Clients' import of
    5,000 rows over ten minutes), a sequence's `nextval` is seen before
    the commit (Goals: a stale 304 after a write committed late),
    `max(updated_at)` has the same hole. Proven on PostgreSQL (the
    package's `test/changes.test.mjs`): a write uncommitted while the
    page is read moves the stamp at its commit; two writers committing
    out of order both move it; an empty statement does not; 5,000
    inserts in one transaction take about 0.55 s while another write
    beside them waits 2–5 ms; folding the old rows keeps the stamp;
  - the version is keyed by the reader's role, admin flag and groups too;
  - a field's refusal names its field (`{ …, field }`): a form sent in
    place shows it under the field (`.ck-error`, `aria-invalid`, focus),
    no toast — tests that compared a refusal whole must add `field`
    (News, Wiki, Polls, Support, the starter did);
  - `field.money({ decimals })` (0 to 4) and `readMoney(text, decimals)`
    (server and browser); a currency's sign or code around the number
    is accepted ("€12 500", "12500 EUR");
  - `checkPage` accepts data blocks (`application/ld+json`, JSON) and
    AGENTS shows structured data on a public page; `checkSources({
    requireTests })` sees `lib/`'s folders (breaking for a tool with an
    untested module there); types are not class names; `testDatabase`
    never takes its own earlier address for a preview's.
  - `bound`, after the Hiring review: a form token is signed with its
    action and refused by any other (a token harvested from one page
    no longer opens another action); `<Honeypot action="…" />` (the
    `action` now required) and `<FormToken action="…" />` for an action
    an island only calls or a form shown later; the page's
    `<meta name="chest-form">` is gone. Refusals are counted per visitor
    and for everyone: a visitor past ten times their budget is refused
    before the run (their flood closes the form to them only);
    everyone's ceiling never refuses — the run is told `flooded` and a
    call that passes its checks still writes (tested: a flood of
    refused calls, then a valid call goes through). Polls, Booking,
    Support and Status were changed for it (each form's or island's
    action named; a `FormToken` where a form opens after load).
  - `bound.work`: a proof of work each token asks (14 bits by default —
    measured in Chromium on this machine: 8–94 ms at 12 bits, 16–152 ms
    at 14, 27–695 ms at 16, 33 ms–4.1 s at 18; a phone several times
    slower — one bit more past half the day's budget, one more past four
    fifths), computed in a Worker
    (`/assets/chest-work.js`, emitted by `chestConfig`: the strict policy
    runs only the tool's own files), checked from one hash before
    anything is counted; tested: 60 unsolved calls at once refused, a
    solved one goes; in a real browser through Booking's flow (its
    `bookTime` uses it). A stand-in for a platform primitive (§9);
  - per-page island code: `virtual:chest-islands` + `start(islands,
    lazy)` — each `src/islands/*.tsx` a chunk, preloaded by the pages
    that show it, alive before the page's load event. Measured: Forms'
    answer page 411 → 293 KB of JavaScript (105 → 83 KB brotli; the
    builder and the answers table no longer sent); Tasks' My tasks
    444 → 223 KB (114 → 61 KB brotli), a board 320 KB, with a card open
    383 KB. The styles stay one file;
  - a form sent without JavaScript and refused comes back with what it
    held (`sent(name)` in the page's context; a one-minute cookie, never
    the address).
  Expenses and Timesheets use the change log (their first sequence-based
  stamp never shipped); the starter's notes page too.
- **studio.6** (6 October; breaking). The changes:
  - an island's wrapper DOM id is `island-<id>` (it was `<id>`): CSS or
    tests that select an island's wrapper by id (`#toasts`) must add the
    prefix; the content's own ids no longer clash with it;
  - `useAutoRefresh(seconds, { idleMinutes })` in `/client`, in place of
    the kit's (which read the page every `seconds` all day): read again
    when the tab comes back or the window gets the focus, and while its
    reader was active in the last ten minutes; twice the wait (up to
    eight times) while nothing changes; idle, nothing — the Chest may put
    the tool to sleep. Verified in Chromium with a fake clock: a note
    written by someone else shows within a minute, an unchanged read is a
    304, no read at all in the hour after ten idle minutes, one read on
    coming back;
  - `page(render, { version })` / `publicPage(…, { version })`: a refresh
    that has the page's version gets a 304 before the page is rendered
    (keyed by reader, language, address); pages carry
    `<meta name="chest-render">` (the render's mark) and
    `<meta name="chest-version">` — a tool that hashes its own HTML
    (Status's ETag) must leave `chest-render` out;
  - an island with more than 256 KB of props is warned about in
    development; the starter's `npm test` builds the browser's files
    too (tests that read `/assets/` found nothing without a full build).
  Tools moved to the package's hook: Tasks, News, Leave, Polls, Support,
  Status, People; Wiki's own stamp check (an action every minute, then a
  refresh) became `page(…, { version: pageStamp })` and the package's
  hook. The starter's home page shows the pattern (an `AutoRefresh`
  island, the notes' version).
- **All eighteen tools and the starter on chest-app 0.1.0-studio.8** (6
  October), re-vendored here; each's `npm test` on the local PostgreSQL,
  one at a time, all passing (starter 16, Polls 102, Booking 116,
  Support 107, Status 107, Hiring 121, Forms 151, Quotes 202, Clients
  124, Goals 104, Rooms 134, Expenses 114, Timesheets 121, Tasks 125,
  News 112, Leave 144, Wiki 121, People 123, Equipment 133 — PGlite not
  run this time), and `chest check` for each (exit 0). Browser flows on
  the harness, all steps passing: Booking (its Calendly step too),
  Forms (with Clients and Support linked), Polls, Support, Status,
  Hiring, Tasks. What changed in the tools:
  - the six public tools whose forms ask a proof of work (Booking, Forms,
    Hiring, Support, Status, Polls) say `needs_javascript` in English and
    French;
  - every tool's `npm test` builds the browser's files first (`vite
    build`): Booking's, Quotes' and Clients' tests read `/assets/` and
    passed only after a separate build;
  - Forms loads its islands per page; its answer page now downloads
    323 KB of JavaScript (92 KB brotli), summed from the built files (the
    entry, its static imports and the `Runner` island's chunks) — not the
    same count as the scratch copy's 293 KB above, and not measured in a
    browser;
  - Goals, Rooms, Quotes, Expenses and Timesheets gained the assertion
    that an empty statement does not move the version (Clients had it);
  - two tests that depended on the clock or on concurrent insert order
    fixed: Polls' `runTellings` and `settle` now pass their `now` to the
    badge counts (a closing time of 12:00 today read the real clock), and
    Tasks' test of tied positions picks the tied cards in the column's
    own order.
- **All eighteen tools on chest-app 0.1.0-studio.7** (6 October), each
  re-vendored and adapted here, one commit each; each's build and tests
  on the local PostgreSQL (and PGlite where its code changed), `chest
  check`, and its browser flow where noted:
  - **page versions on the change log**: Clients (its counter row, taken
    back by its 0008, replaced by 0009), Goals (0005's sequence, 0006),
    Rooms (0009's sequence, 0011), Quotes (`max(updated_at)`, 0016),
    Expenses and Timesheets (0006), the starter; each with a test that an
    empty statement does not move the version and a write does;
  - **bound's token bound to its action, and proof of work on the public
    forms**: Booking (`bookTime`), Forms (`answerPublic`), Hiring
    (`apply`), Support (`sendRequest`), Status (`subscribe`,
    `subscribeChat`), Polls (`answerGuest`) — those forms now need
    JavaScript; `<FormToken>` for an action an island calls (uploads,
    "change my answer"); flows pass on the harness without a visitor
    address for Polls, Booking, Forms (with Clients and Support linked),
    Hiring;
  - **per-page island code**: the starter and Tasks (My tasks 444 →
    223 KB of JavaScript); the others keep one entry until they adopt it
    (`virtual:chest-islands`, one line);
  - Equipment, News, Leave, Wiki, People: re-vendored, nothing to adapt.
- `node scripts/check-vendor.mjs`: every vendored studio pack compared
  with `app/`, `ui/`, `sdk/`. It found a real drift: `sdk/` changed after
  it was packed as 0.4.1-studio.2 (`fakeChest.publicApi`, 9f25e80;
  `visitors.count`, bef4f20) — now 0.4.1-studio.3. It lists stale packs
  per tool, exits 1 on a pack that differs at the same version
  (`--stale-fails`: on a stale one too), and 2, with the failing
  command's last lines, when a working copy cannot be packed.
- The 17 Chromium tests (one checks a deploy: a page of another build is
  loaded plainly, and a chunk that failed to load reloads the page once,
  never in a loop; one checks every island wrapper is
  `display: contents` from the package's CSS) and the axe audits.
- Every number in §4, by the method stated there.

**Not verified:**
- a real Chest and its launcher;
- the real Perseus workbench;
- Firefox and Safari;
- the CSRF `Origin` fallback in a browser that does not send
  `Sec-Fetch-Site`;
- dark mode: the starter's theme has none.
