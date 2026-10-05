# A better starter for Perseus Code

_Written on 5 October 2026 against the reference snapshot of that day
(`reference/perseus-starter/`, Chest `0c2bcfd`; `@argentic/chest-sdk`
0.4.1). The proposed template is [`starter/`](../starter/); the measuring
tools are [`lab/starter-bench/`](../lab/starter-bench/), their raw output
[`lab/starter-bench/results/run-2.json`](../lab/starter-bench/results/run-2.json).
What is measured is said with its method; what is assumed is marked so._

## 1. In short

- **The reference starter's stack is right** — Hono, React rendered on the
  server, islands, Vite, TypeScript — and it is light: 75 MiB at rest
  (RSS of the server process), a 0.9 s build. Nothing measured justifies
  another stack: Next.js (the studio's template) rests at 141 MiB, builds
  in 14 s with an 894 MiB peak, installs 504 MiB.
- **What it lacks is everything a real tool does next**: a way to change
  data (no action, no form handling, no CSRF rule), a refresh after a
  change, words in two languages, dates in the member's zone, error pages,
  a database, the Chest's events and schedules, the UI kit, logs, and
  tests beyond one greeting. Each agent re-invents them, differently.
- **`starter/` keeps the stack and adds those, at the same weight**:
  74 MiB at rest (vs 75), build 1.2 s with a 250 MiB peak (fits the
  512 MiB build container), 79 KiB of gzip JS+CSS for the members' page,
  axe-core clean. 35 files, 1,698 lines (the reference: 16 files, 311
  lines) — of which 579 are machinery an agent rarely opens (`src/core/`).
- **It needs no `"csp": "tool"` permission for a public part**: no inline
  script, no inline style element, no `style=""` — the page is exactly
  what the Chest's default public policy admits, and its own policy is the
  same one. The look of the UI kit is built into the stylesheet.
- **Recommendation**: ship `starter/`'s conventions as the official
  starter (§8), and change two things in the platform that cost every tool
  more than any starter choice: the resident `npm` process (≈ 68 MiB RSS,
  18 MiB private, per awake tool) and Intl objects made per row (§9).

## 2. What Perseus needs from a starter

From `reference/product/specs/perseus-build.md` ("Knowledge", "The
starter") and `reference/contract/application-contract.md`:

1. It **builds, runs and passes its test** on the first turn, in the
   workbench (`NODE_ENV=development`, the draft's own `CHEST_API`, three
   fake members, a database `pb_<project>`) and in the Chest's build
   (`npm ci`, `npm run build` in 512 MiB and one CPU, `npm prune
   --omit=dev`, read-only tree, `NODE_ENV=production`, started as
   `node /chest/launcher.mjs npm start`).
2. **Lean**: little memory at rest (256 MiB per tool by default; the Chest
   reserves memory for awake tools only), fast cold start (a sleeping tool
   wakes on the first request; a browser sees "Waking up…" after 2 s).
3. **Extended, never restarted** ("extend the starter, never start over"):
   the agent reads it in full each turn, with the project's `AGENTS.md`
   (kept current at each checkpoint) and the Chest memory (4,000 tokens).
   So: one way to do each thing, conventions the agent can copy, types
   and tests that catch the mistakes it will make.
4. The Chest's rules out of the box: identity only from `member()`, the
   capabilities declared, the strict policy, nothing on disk or in memory
   that must survive, logs an operator reads (stdout/stderr, 7 days, 4 KiB
   a line), English source with translatable strings.

## 3. Candidates

| | What | Built and measured |
|---|---|---|
| **A** | `reference/perseus-starter/` as it is (SDK tgz from npm 0.4.1 in `vendor/`) | yes |
| **A′** | A with one change: `node --optimize-for-size` in `start` — to separate the flag's effect from the starter's design | yes |
| **B** | `starter/` (this work) | yes |
| **C** | `lab/template/` — the studio's Next.js 16.3.6 template (SDK 0.3.1-studio.1, kit 0.2.3) | yes |

Considered, not built: **Preact** in the browser (would cut ~50 KiB gzip of
the 71 KiB of JS, but the kit's components are React 19 and untested on
`preact/compat`; the page's JS is not where the memory is), **no React on
the server** (Hono's JSX: the kit's components are React components, and
the islands must render the same on both sides). Neither was measured, so
neither is recommended.

## 4. Measurements

**Method** (`lab/starter-bench/measure.mjs`, one candidate after the other,
never two builds at once). Machine: the studio's container, 4 CPUs, 16 GB,
Linux 6.18, shared with other agents' builds (timings are noisy; memory is
not: 5 runs within 0.4 MiB). Node **v24.21.0** (`/opt/node24/bin`, the
Chest's pinned version). 5 October 2026, 23:30–23:55 UTC.

- **Install**: `npm ci` from a clean copy (files Git tracks); size of
  `node_modules` (`du -sk`), then again after `npm prune --omit=dev` (what
  the Chest's image keeps).
- **Build**: `npm run build`, 3 runs, median time. Peak memory sampled
  every 50 ms over the whole process tree (no GNU `time` on this host):
  the sum of PSS, and the largest single process's RSS.
- **Cold start**: spawn `npm start` (with `PORT`, a fakeChest from the
  candidate's own SDK, and for B and C a fresh PostgreSQL database with the
  migrations played) → first 200 on `/chest` with a signed member; 10
  runs, median. It includes npm's own start (~100 ms).
- **At rest**: start as above, the members' page loaded in Chromium
  through a local front that adds a fresh `Chest-Member` assertion (run 1)
  or 5 GETs of `/chest` (runs 2–5), 30 s idle, then
  `/proc/<pid>/smaps_rollup` of every process of the tree; 5 runs, median.
  "Server" is the tool's own process (B and C query their database on that
  page; A has none).
- **Browser**: every script and stylesheet the members' page loads,
  gzip -9; axe-core 4.10.3, tags wcag2a, 2aa, 21a, 21aa, 22aa.

| | A reference | A′ ref. + flag | **B starter/** | C Next.js template |
|---|---|---|---|---|
| `node_modules` after `npm ci` | 109 MiB (1,715 files) | 109 MiB | 110 MiB (2,369 files) | 504 MiB (11,635 files) |
| … after `npm prune --omit=dev` | 12.8 MiB | 12.8 MiB | 14.9 MiB | 443 MiB |
| `npm ci` | 1.7 s | 1.6 s | 1.8 s | 9.4 s |
| Build time (median of 3) | 0.9 s | 0.9 s | 1.2 s | 13.7 s |
| Build peak, tree PSS / largest RSS | 185 / 203 MiB | 167 / 185 MiB | 250 / 266 MiB | **894 / 907 MiB** |
| Build output | 0.2 MiB | 0.2 MiB | 1.0 MiB | 3.4 MiB |
| Cold start to first 200 (median, min–max) | 196 ms (180–222) | 239 ms (227–273) | 230 ms (218–281) | 823 ms (655–1,090) |
| **At rest, server RSS** (median of 5) | **75.3 MiB** | 70.5 MiB | **74.3 MiB** | **140.9 MiB** |
| At rest, server USS (private) | 23.8 MiB | 18.7 MiB | 22.6 MiB | 84.8 MiB |
| At rest, `npm start` process beside it | 68 RSS / 18 USS | same | same | same |
| At rest, whole tree RSS / USS | 145 / 42 MiB | 140 / 37 MiB | 144 / 41 MiB | 211 / 104 MiB |
| Members' page JS, gzip (raw) | 66 KiB (214) | 66 KiB | 71 KiB (228) | 135 KiB (455), 7 requests |
| Members' page CSS, gzip | 0.2 KiB | 0.2 KiB | 7.9 KiB | 7.3 KiB |
| axe-core violations on `/chest` | 0 | 0 | 0 | 0 |

Raw output: [`lab/starter-bench/results/run-2.json`](../lab/starter-bench/results/run-2.json)
(5 October, 23:30–23:55 UTC). A first full run 30 minutes earlier gave
the same memory (within 0.2 MiB; C's USS 64 instead of 85 MiB, its RSS
the same) but left the servers of earlier runs alive — a harness bug,
since fixed: npm does not pass `SIGTERM` on to its script, so the harness
now stops the whole tree. Its timings were noisier; this table is the
second run's.

Notes on the table:

- **Cold start** is dominated by the machine's load here: A and A′ run the
  same code, and A′ measured 40 ms slower. Started without npm (`node
  dist/server/main.js`, 3 runs each, same harness), A answered in
  120–145 ms and B in 118–152 ms. Read the column as "A and B are equal,
  C is 3× slower".
- **B's own memory, before and after this work's fixes** (same harness,
  `node dist/server/main.js`, 3 runs): 92 MiB as first written; 90 MiB with
  `react-dom/client` kept out of the server; 76.6 MiB with the starter's
  packages bundled into the server (React's development build removed);
  74.4 MiB with `--optimize-for-size`. The flag costs nothing visible:
  /chest with 30 notes, 400 requests, p50 2.7 ms vs 2.6 ms, and the RSS
  after that load is 87 MiB instead of 106.
- **Under load, a bug the starter now avoids**: B as first written made
  one `Intl.DateTimeFormat` per date shown. 400 renders of a 30-note page
  took the server to **427 MiB** (and p50 latency to 8 ms): ICU objects
  live outside V8's heap, so the garbage collector does not see them
  pile up. Made once per language/zone/style, the same load ends at
  87–106 MiB, p50 2.6 ms. The studio's tools make `Intl` objects per row
  (e.g. `tools/private/tasks/app/chest/page.tsx`, `dayLabel`), and so
  will an agent unless the starter gives it a formatter that does not.
- **C's build** peaks above the Chest's 512 MiB build container on this
  host's accounting (sum of PSS; the container's cgroup may count shared
  pages differently — not verified in a real container), although
  `lab/template/next.config.ts` already has the Forms settings (`cpus: 1`,
  no build worker, webpack memory optimisations).
- Not measured: a real Chest container (the launcher adds one more Node
  process — `node /chest/launcher.mjs` — that I could not run here),
  Firefox and Safari.

## 5. Judgement, criterion by criterion

**Memory at rest.** A and B are equal (75.3 vs 74.3 MiB server RSS);
B carries a database driver with a live connection, the kit's
components, ICU formatting and 6 more routes, and pays for them by bundling
its packages and the V8 flag. C costs 66 MiB more per awake tool (61 MiB more private memory). Beside
each of them, `npm start` keeps a 68 MiB process (§9.1).

**Cold start.** A ≈ B (≈ 130 ms without npm, ≈ 200–230 ms with it);
C 823 ms. All far under the Chest's 2 s before "Waking up…".

**Install and build.** A and B: about 110 MiB installed (typescript 7's
native binary, vite/rolldown, and for B PGlite for tests), 13–15 MiB kept
after prune, builds in about 1 s under 270 MiB. C: 443 MiB kept, 14 s, more
than the build container.

**Simplicity for an AI agent.** What each change takes:

| Change | A reference | B `starter/` | C Next.js template |
|---|---|---|---|
| A page | a component + a route (2 files); no words, no layout | a component in `src/pages/` + a route in `src/app.tsx` + words in `en.ts`/`fr.ts` (4) | `app/chest/x/page.tsx` + words (3) |
| A mutation | **not provided**: invent a POST route, body parsing, CSRF, a client fetch, a reload | one entry in `src/actions.ts` (+ the rule in `src/lib/`); a `<form>` or `call()` (2) | a `"use server"` function + a client component + `router.refresh()` (3) |
| A table | the recipe in AGENTS.md (create `db.ts`, add `postgres`) | a migration file + queries in `src/lib/` (2) | same (2) |
| A public page | a route outside `/chest` + `"public": true` | `publicPage()` + `"public": true`; a `publicAction()` for its form | a page + `"public": true` **and `"csp": "tool"`** (Next's inline scripts) |
| A schedule | not shown (the SDK's README) | a line in `chest.json` + a handler beside `purge` (2) | the studio's own `chest-jobs` (pre-0.4) |
| A translation | none (one English string) | a key in `en.ts` and `fr.ts`; tsc refuses a missing one | same, checked by a test |

What B's types and tests refuse (those marked † I verified by breaking the
code once and seeing the check fail; the others I did not break on purpose): an island prop that is a function or a `Date`† (or a Map) (tsc:
`Plain<…>`); `call()` with a wrong input shape† or an unknown action (tsc,
from the action's fields); a key missing from `fr.ts`† (tsc); a
`{placeholder}` that differs between languages, a colour in the CSS†, a
`style={}` anywhere in `src/`†, an island that imports the SDK†, `src/lib/`
or `src/actions.ts`, a theme that fails the kit's contrast contract
(`test/units.test.ts`); a rendered page with an inline script, a `<style>`
or a `style=""`, a cross-site POST, a members' action reached from the
public part (`test/app.test.mjs`); enums and other syntax Node cannot strip
(`erasableSyntaxOnly`), unchecked index access (`noUncheckedIndexedAccess`).

Concepts an agent must learn in B: route + `page()`, `Island`, `action()`
+ fields, `call()`/forms, `fail`/`notFound`/`redirect`, `t`/`f`, `db()`.
Next.js asks for more and subtler ones (server vs client components,
`"use server"`, caching and `revalidatePath`, `proxy.ts` for the nonce,
`next/link` as a client reference for the kit). A asks for fewer but
leaves the hard ones (mutations, refresh, i18n) to be invented.

**UI quality with the kit.** A: unstyled HTML. B and C: the kit's shell,
page header, empty state, toasts with a truthful Undo, buttons and fields,
in the theme of the tool's choice (B: the Chest's own sheet by default,
one line to change). B has no runtime theming: with SDK 0.4.1 there is no
`chest.theme()`, so the look is the tool's and is built into the stylesheet
(§9.4).

**Accessibility.** axe-core: zero violations for A, B, C on `/chest`, and
for B also on `/` and on `/chest` with a note, light and dark, at phone
width (390 px). B adds: a label for every field, `aria-describedby` from
each row's buttons to its note, the skip link and `main` landmark of the
kit's shell, focus moved to `main` when a refresh removes the focused
element, `aria-busy` while a form is sent, toasts in live regions,
reduced motion (kit tokens + a global rule), 44 px targets. Checked by hand
in Chromium only.

**i18n.** A: none (`Hello ${firstName}`, `lang` from the member). B: one
catalogue per language (English source and fallback, French second; a new
language is one file and one code), the kit's words in the same catalogue
(`t.kit`), `member.language` on `/chest`, the visitor's choice / Accept-
Language / the Chest's language on the public part, plural rules
(`Intl.PluralRules`: French "0 note"), dates and numbers written on the
server in the member's language and zone, amounts in `chest.currency`.
C: the same rules, spread over more files.

**Tests.** A: one test of the built server. B: 16 in 4–6 s (`npm test`):
10 of the built server with the official fakeChest and a real PostgreSQL
(PGlite in the process, served on 127.0.0.1 in the Chest's URL shape, so
`databaseUrl()` is untouched), 6 unit tests run by Node directly from the
`.ts` sources; plus 6 browser tests in `lab/starter-bench/` (Chromium):
hydration without warning under the policy, a form sent in place, a refresh
that keeps typed text, scroll, a toast (an island's state) and a moved
row's island, Undo, a refusal as a toast, the same forms without
JavaScript, the public page under both policies. C: unit tests of its
library, none of the built server.

**Security.** All three take identity only from `member()`. B adds: the
same strict policy on every answer (`default-src 'self'`, no inline
anything), `nosniff`, `Referrer-Policy: same-origin`, COOP,
`Cache-Control: no-store` on pages; mutations only by POST to an action,
refused unless `Sec-Fetch-Site: same-origin` (or, without it, an `Origin`
equal to the `Host`), and JSON only with a header a cross-site page cannot
send without a preflight (`x-tool-action`); a 1 MiB body limit; inputs read
by typed fields; SQL only as tagged templates; CSV cells that would run as
formulas defused; the language cookie `HttpOnly; Secure; SameSite=Lax`;
logs of ids and counts only (a database error's text is not logged: it
can hold a row's values). A's policy carries a nonce nothing uses and no
mutation rule. C needs `"csp": "tool"` and `style-src-attr 'unsafe-inline'`.

## 6. The reference starter: keep, and what it lacks

**Keep** (B keeps all of it): the stack; two Vite builds of one source with
fixed asset names under one `build.static` prefix; islands named in one
registry and hydrated from `data-props` (no inline script); tests of the
built server with fakeChest; `--test-force-exit`; `dev.mjs` without a
shell; `SIGTERM` handling; a short `AGENTS.md` with a map.

**Lacks**: mutations and CSRF; refresh after a change; 404/403/500 pages
(Hono's plain "404 Not Found"); the public part; i18n and formatting;
database wiring in code (only in prose); events and schedules; the kit;
cache headers on `/assets/` (none: every page load revalidates); logs; a
test of anything but the greeting. Its policy's `'nonce-…'` in
`style-src`/`script-src` is unused (there is no inline script or style),
and its `AGENTS.md` does not say that React's `style={}` is blocked on a
public part.

## 7. What `starter/` decides

- **Pages** are React components rendered on the server by a route of
  `src/app.tsx`: `page(async ({ member, t, f, param, query }) => ({ title,
  body }))`; `publicPage()` for the public part. The layout
  (`src/layout.tsx`) goes around: the kit's `AppShell` for members, a plain
  header with the language switch for visitors.
- **Islands** are the only browser code: `<Island name props />`, listed in
  `src/islands/index.ts`; props are plain data and carry their words.
- **Actions** are the only mutations: `action(fields, run)` in
  `src/actions.ts` at `POST /chest/actions/<name>`; `publicAction` at
  `/actions/<name>`. Called by `call(name, input)` from an island (typed;
  JSON) or by a plain `<form method="post">` (redirect after post without
  JavaScript; sent in place with it, the form emptied, a refusal as a
  toast).
- **Refresh**: after a successful call or form, the page is fetched again
  and merged node by node (a morph of about 70 lines in `src/core/client.tsx`): what
  did not change is not touched, so focus, scroll, typed text, open
  `<details>`/`<dialog>` and each island's React state stay; islands get
  their new props; rows keep their place by `id`. No framework router.
- **Refusals** are codes (`fail("too_long", { max })`), said in the reader's
  language by the server (`{ ok: false, error, message }`); `notFound()`,
  `forbidden()`, `redirect(path)` work in pages and actions.
- **`style={}` is forbidden**, in the members' part too: the Chest's
  public policy blocks style attributes, and a page rendered on the server
  with one does not hydrate right (React does not patch attributes the
  browser refused). Sizes from data are SVG attributes, `<progress>`,
  `<meter>` or classes; an island may set a style through a ref (CSSOM is
  not blocked). The kit already complies: its components set positions
  through CSSOM (`float.ts`, `toast.tsx`), never as attributes. **No kit
  change was needed.** The 18 tools use `style={}` 88 times (bars,
  drag-and-drop transforms, a timeline's custom properties): their
  migration must replace them.
- **The look** is a theme of the kit (`src/theme.ts`, the Chest's sheet by
  default), turned into CSS at build time by a 6-line Vite plugin.
- **Everything else**: `db()` (postgres.js, opened on first use), `seen`
  (a table) for `events.handle`/`schedules.handle`, `names()` for member
  ids, `log.info/warn/error`, `after()` for work after the answer, a
  streamed CSV download.

## 8. Recommendation

1. **Ship `starter/` as the official Perseus starter**, or fold its
   conventions into `reference/perseus-starter/`: they are what every tool
   needs on its second turn, and the measurements show they cost nothing at
   rest. If the Chest wants the smallest possible first read, the
   example (Notes: `src/pages`, `src/islands/DeleteNote.tsx`, `src/lib/notes.ts`,
   the migration, the tests' cases) can shrink; the machinery
   (`src/core/`) should not.
2. **Generate its knowledge-pack page from its `AGENTS.md`** (174 lines:
   map, how it works, recipes, rules, pitfalls) as the spec says.
3. **Keep the strict default policy and no `"csp"` permission** for
   tools made from it: a public part then asks only `"public": true`.
4. Move the 18 studio tools onto it (the lead's next step); the summary of
   conventions for the migrating agents is in the final message to the
   lead and §7.

## 9. What the platform or the SDK makes hard (for the SDK report)

1. **`npm start` stays resident.** `build.start` must be `npm start` or
   `npm run <script>`, so every awake tool keeps an npm process: measured
   68 MiB RSS, 18 MiB private, for every candidate — as much as the
   whole server of A or B. In the Chest the launcher (`node
   /chest/launcher.mjs`) is a third Node process (not measured here).
   Ask: let `build.start` be `node <file> [flags]` (an argument vector,
   no shell), or have the launcher read `scripts.start` and run it
   itself. Saves ~18 MiB private (68 MiB RSS) per awake tool.
2. **Intl objects outside V8's heap.** Not a Chest bug, but the SDK's
   guidance ("format with `timeZone: member.timeZone`") leads straight to
   `new Intl.DateTimeFormat` per row: 427 MiB after 400 renders in B's first
   version. The SDK could export a cached formatter
   (`format.date(member, value)`), or its AGENTS.md could warn. The SDK's
   own `chest.timeZone` getter builds an `Intl.DateTimeFormat` on every
   read to validate the zone (`client/src/chest.ts`, `knownZone`): the
   same pattern, once per request.
3. **No database in `fakeChest`.** Every tool's tests need one; the studio
   uses PGlite behind `pglite-socket` (with `maxConnections` raised: its
   default is 1, and a pool of 4 gets `ECONNRESET`). An official
   `fakeChest({ database: true })` would give every tool the same,
   with the migrations played as the Chest plays them.
4. **No theme in the official SDK.** The kit can only build the tool's own
   look into its stylesheet. When `chest.theme()` comes, a starter that
   wants no inline `<style>` needs the look as a **file**: e.g. the Chest
   serving `/_chest/theme/look.css` per tool (it already serves
   `/_chest/` on the tool's hosts), so tools keep `style-src 'self'`.
5. **`Chest-*` headers are stripped from the browser's requests** (rightly),
   so a tool's own CSRF header must be named otherwise (`x-tool-action`);
   worth one line in the contract, an agent's first guess is
   `Chest-Action`.
6. **The public host does not check `Sec-Fetch-Site`/`Origin` on POST**
   (the team host does, application-contract "Team host"); every public
   form must. Worth saying in the contract's "public part".
7. **Assertions live 5 s** (`iat`/`exp`): fine for the Chest, but a local
   browser test needs a front that signs each request (`lab/starter-bench/chest.mjs`).
   The SDK's `testing` could offer `fakeChest().front(port, member)`.
8. **The reference starter** (`reference/perseus-starter/`): an unused
   nonce in its policy, no cache headers on `/assets/`, and an AGENTS.md
   that does not warn that `style={}` is blocked on a public part (§6).
   The SDK's `contract/README.md` "Inline styles" suggests
   `style-src-attr 'unsafe-inline'` for the tool's own policy — which a
   public part without `"csp": "tool"` cannot use.

## 10. What I verified, and what I did not

Verified here: `npm ci && npm run build && npm test` (16 tests) and
`node scripts/chest-check.mjs starter` ("OK … contract 0.4"; it asks
database, members, receives, schedule purge); `npm run dev` rebuilds and
serves; `npm start` serves `/chest` and `/`; the 6 browser tests and the
axe audits in Chromium; every number of §4 by the method said.
Not verified: a real Chest (its launcher, its cgroup accounting, its
front), the Perseus workbench, Firefox and Safari, the `Origin` fallback
of the CSRF check with a browser that lacks `Sec-Fetch-Site` (tested with
crafted requests only), and the starter's `public` mode behind the Chest's
real public host (emulated: the local front adds the Chest's default
policy beside the tool's).
