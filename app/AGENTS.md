# Building a Chest tool with `@argentic/chest-app` — the reference for agents

A tool made from the starter is a Hono server that renders React pages,
with a few islands in the browser. This package is that machinery; the
tool's own code is routes, pages, islands, actions, rules and SQL, words.
The SDK (`@argentic/chest-sdk`, its `AGENTS.md`) is the Chest's side; the UI
kit (`@argentic/chest-ui`, its `AGENTS.md`) the look.

## Where things are in a tool

| Path | What it is |
|---|---|
| `chest.json` | The manifest: capabilities, receives, schedules, public, `build.static: ["/assets/"]` |
| `src/app.tsx` | **Every route**: `createApp({…})`, pages, downloads, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | **Every mutation**, by name |
| `src/pages/` | Pages: React components rendered on the server |
| `src/islands/` | Components that also run in the browser; `index.ts` lists them |
| `src/components/` | Components shared by pages and islands (the island rules apply: no server code) |
| `src/layout.tsx` | Around every page: the kit's shell, the sections (`nav`), the toasts |
| `src/lib/` | Rules and SQL, one file per subject |
| `src/i18n/` | Every word: `en.ts` (source, fallback), `fr.ts`, `index.ts` (languages) |
| `src/theme.ts`, `src/styles.css` | The look (a kit theme) and the tool's own CSS |
| `src/register.ts`, `src/entry.tsx`, `src/main.ts`, `vite.config.ts` | Wiring: rarely touched |
| `migrations/` | `0001_chest.sql` (keep), then the tool's tables |
| `test/` | `app.test.mjs` (the built server), `units.test.ts` (sources, words, rules) |
| `vendor/` | The SDK, the kit, this package, packed: never edit |

## How it works

- **Pages render on the server.** A route reads what the page needs, then
  returns `{ title, body }`: `app.get("/chest/x/:id", page(async ({ member,
  t, f, param, query, url, cookies }) => ({ title, body: <X …/> })))`. It may
  return a `Response` instead (a file). `publicPage()` is the same for
  visitors (`member: null`). The layout goes around.
- **Islands** are the only components that run in the browser:
  `<Island name="DeleteNote" props={{ id, words }} />` (import `Island`
  from `@argentic/chest-app`). Props are plain data — the types refuse a
  function, a Date, a Map — and carry their words (`t.home.remove`…),
  dates already written by `f`, the path if needed. An island imports only
  React, the kit, `src/components/`, and `call`, `refresh`, `navigate`,
  `onLinkClick`, `toast`, `fill`, `plural` from
  `@argentic/chest-app/client`. Islands do not nest. Each island is a
  React root of its own: the kit's `useToast()` sees no `<Toasts>` there —
  use `toast()`, which reaches the layout's `ToastHost` (outside `<main>`,
  `id="toasts"`, so it survives `navigate()`).
- **Actions** are the only way to change data: `action(fields, run,
  { maxBody? })` at `POST /chest/actions/<name>`; `publicAction` at
  `/actions/<name>`. Two callers:
  - a form: `<form method="post" action="/chest/actions/addNote">` with
    inputs named like the fields (a button may carry `formaction`). Without
    JavaScript the server redirects back (a refusal in `?error=`, shown by
    the layout's `notice`); with it the form is sent in place, the page
    refreshed, then the form emptied; a refusal is a toast; a second
    submit while the first is on its way says "still sending".
  - an island: `await call("addNote", { body })` — typed by the action's
    fields; it refreshes the page after a success (or follows the action's
    `redirect()`); a refusal is a toast and `{ ok: false, error, message }`
    (`quiet: true`: no toast; `refresh: false`: no refresh).
- **Refresh** re-reads the page and changes only what changed: focus,
  scroll, typed text, open `<details>`/`<dialog>` and each island's state
  stay; islands receive their new props. Give list items an `id` (or
  `data-key`) so they keep their place. On a 401/403 the page is loaded
  again (the Chest signs in or says "Access removed"); on another error a
  toast says so and the page stays. `refresh()` and `navigate(path)` by
  hand (`{ top: false }`: the scroll and the focus stay — a panel opened
  beside a list); `useAutoRefresh(refresh, 30)` (kit) on a timer. A
  navigation is never lost to a refresh or an action on its way; an island
  it brings is live the moment it shows.
- **Refusals are codes**: `fail("not_found")`, `fail("too_long", { max })`;
  each code is a sentence in `t.errors`. In a page or an action:
  `notFound()`, `forbidden()`, `redirect("/chest/x")` (paths of the tool
  only: anything else throws).
- **The public part** (only with `"public": true`, a permission the owner
  approves): any path outside `/chest`; no member; the language is the
  visitor's (`/lang/<code>` switch). Every public write needs a bound (so
  many a day, counted in the database) and a honeypot field.

## Fields of an action

`text({ min?, max })` (trimmed; `min` 1 by default: `empty`, `too_long`),
`int({ min, max })`, `money({ min?, max })` (read in cents: "1 234,50" →
123450; store `bigint` cents; write `f.money(cents, { cents: true })`),
`id()` (a bigint id as text), `bool()` (a checkbox), `choice([...])`,
`day()` (YYYY-MM-DD), `optional(f)` (absent/""/null → undefined),
`nullable(f)` (absent → undefined, ""/null → null: "clear it"), `sent(f)`
(absent → undefined, "" kept), `list(f, max)`, `keyed(/^d(\d+)$/u, f, max)`
(fields named by a pattern), `json()` (an island's object, checked by the
rule). A field of the tool's own is `{ read(value) { …; return v or
fail("invalid") } }`. Who may do what is checked in `src/lib/` from
`member` (`id`, `role`, `isAdmin`), never from the input.

## Words and formats

`t` is the reader's catalogue; `fill(t.x, { name })` fills values;
`f.plural(t.x, n)` picks `{ zero?, one, other }`. `f.date`, `f.time`,
`f.dateTime` write an instant in the reader's zone; `f.day` a calendar day
(a `date` column comes back from `db()` as "YYYY-MM-DD"); `f.number`,
`f.money`. Never format in the browser, never `new Intl.…` per row (each
Intl object lives outside V8's heap: hundreds of MiB pile up). French: a
narrow no-break space (U+202F) before `: ; ? !` (`checkWords` refuses
otherwise). The catalogue must hold `tool.name`, `pages` (notFound,
forbidden, failed, signIn, busy, language), `errors` (invalid, empty,
too_long, too_large, forbidden, not_found, unavailable, unknown — plus the
tool's own codes) and `kit` (the kit's words). The layout uses only those
sections, never a page's.

## The database

`db()` from `@argentic/chest-app/db`: ``db()`select … where id = ${id}` ``
(values are always parameters; `db().unsafe` never takes input).
`db().begin(async tx => …)` for writes that go together. Ids are `bigint
generated always as identity` (text in JS), members `text` (`mbr_…`),
instants `timestamptz` (Date), days `date` (text). `seen` (same module) is
the store `events.handle` and `schedules.handle` take; its table is
`migrations/0001_chest.sql`. **Migrations**: `NNNN_name.sql`, run by the
Chest in name order. While the tool is an unpublished draft, its
migrations may be rewritten; once a version is published, a migration
that ran is never edited — a change is a new file, and the previous
version must keep working on the new schema.

## Recipes

**A page** — a component in `src/pages/`, a route in `src/app.tsx`, its
words in `en.ts` and `fr.ts`; a section: one line in `nav` of `src/layout.tsx`.
**A table** — `migrations/0003_tags.sql`, its rules and SQL in `src/lib/`.
**A schedule** — `"schedules": [{"name": "digest", "cron": "0 7 * * 1-5"}]`
in `chest.json` (the Chest's zone; 15 minutes apart at least), a handler
`digest: async run => …` in `schedules.handle` of `src/app.tsx`; within 5
minutes, idempotent (a failed run comes again with the same id).
**Members' lifecycle** — `"receives": ["member.*"]` (with `members`), a
handler in `events.handle`: on `member.erased`, delete or anonymise, then
`acknowledgeErasure`.
**Names of members** — `names(ids, t.people)` from
`@argentic/chest-app/members` (`members` capability).
**A download** — a route returning a `Response`, or `stream(c, …)` from
`hono/streaming` with a cursor; `csvLine([...])` quotes and defuses formulas.
**An upload** (`files`) — an action answers `await files.uploadUrl("photos/",
{ maxSize, types })`; the island `PUT`s there, then a second action checks
`files.stat(name)` before recording it.
**Work after the answer** — `after("notify", () => notifications.notify(…))`.
**A page with heavy data** — assemble it in a `src/lib/` function
(`Promise.all` of the queries, `names()` once for every id), return plain
data, keep the page component a pure function of it: the same function
serves a download or an island's props.
**Fields named at run time** (a poll's options d12, d13…) —
`field.keyed(/^d([1-9][0-9]*)$/u, field.int({ min: 0, max: 2 }), 200)`.
**A public action that keeps a cookie** (a guest's secret for one page) —
`cookies.set("guest", secret, { path: "/p/abc", maxAge })` in the action;
serve it under that path too: `app.post("/p/:link/actions/:name",
publicActionsAt())`, and call it there: `call("answer", input, { at:
location.pathname })` or a form `action="/p/abc/actions/answer"`.
**More about the member** (every group they are in) —
`createApp({ complete: async who => ({ ...who, groups }) })`, once per
/chest request (not for /assets/ nor the look); a hook that asks the Chest
must cache its answer a minute (600 members calls a minute per tool).
**A look chosen at run time** (a theme the company picks) —
`createApp({ look: viewer => ({ css, colors, logo }) })` (the layout
receives it as `look`: a brand's logo beside the name): pages link
`/chest/look.css?v=<hash>` or `/look.css?v=<hash>`, served by the package;
`chestConfig()` without `theme`. The layouts receive `look` (its `logo` in brand mode) and the page's
`status` (an error page's public layout may draw its frame); a visitor's
404 reads `pages.notFound.publicBody` when the catalogue has one.
**The head** (an icon, robots) —
`createApp({ head: viewer => <><link rel="icon" href="/assets/icon.svg" /></> })`.
**Static files** — `public/assets/…`, served at `/assets/…`; the
catalogue's icon and picture: `chest/icon.svg`, `chest/preview.png`.
**A package the server needs** — `npm install it`; add it to `bundle` in
`vite.config.ts` when it bundles cleanly (less memory).

## Rules

- **Identity only from the Chest**: `member` in `page()`/`action()`. Never
  a user id, name or role from a form, a query or a cookie.
- **No inline script, no inline style, no `style={}`** (nor a spread that
  carries one): the policy refuses them, as the Chest does on a public
  part. A size from data: an SVG attribute (`<rect width={pct}>`),
  `<progress>`, `<meter>`, a class; an island may set a style through a ref.
- **CSS**: the kit's tokens only (`var(--ink)`), never a colour; a class
  is the kit's (below) or defined in `src/styles.css` — `checkSources`
  fails on a class defined nowhere.
- **Nothing kept in memory between requests**: the tool sleeps when idle.
- **Logs**: `log.info("what happened", { note: id })`; ids and counts
  only, never a name, an email, a token or what someone wrote. Every
  request is logged by its route's pattern (`/p/:link/actions/:name`),
  never its path or query (an address may carry a secret).
- **Capabilities**: each used is declared, each declared is used
  (`checkSources` checks both): the owner approves each one.
- **Accessible**: a label for every field, a heading per page, buttons
  that say what they do (`aria-describedby` to their item), the kit's
  components for dialogs, menus, dates, toasts.

## The kit's classes

Buttons `ck-button` (+ `ck-button-quiet`, `-danger`, `-link`, `-small`),
`ck-icon-button`; fields `ck-label`, `ck-field` (input, textarea),
`ck-select`, `ck-hint`, `ck-error`, `ck-invalid` (on the wrapper),
`ck-check` / `ck-check-input` / `ck-check-label`; layout `ck-row`,
`ck-stack` (+ `-s`, `-l`, `-xl`), `ck-align-center`, `ck-align-end`;
text `ck-caption`, `ck-kbd`, `ck-vh` (visually hidden), `ck-danger`;
badges and chips `ck-badge` (+ `-s`), `ck-tone-ok|wait|danger|info|neutral`,
`ck-chip`, `ck-chips`, `ck-count`, `ck-cat-1`…`ck-cat-8`, `ck-cat-dot`;
tables `ck-table-wrap` > `ck-table` (+ `-sticky`, `-linked`),
`ck-col-narrow|wide|actions`; empty state `ck-empty` (`-title`, `-body`,
`-actions`, `-icon`, `-note`); the shell's and the components' own
classes (`ck-shell`, `ck-page-head`, `ck-dialog`, `ck-toast`…) come with
their components — use the components.

## Tests

`npm test`: tsc, the server built into `dist/test`, then `test/*.test.*`.
From `@argentic/chest-app/testing`: `testDatabase()` (TEST_DATABASE_URL —
a server whose user may create roles: a throwaway database; else the
preview's DATABASE_URL: a throwaway schema; else PGlite in the process,
~500 MiB more), `checkPage(html)`, `checkWords(catalogues)`,
`checkSources()`, `atLeast(n)` (a file whose tests were removed fails).
The SDK's `fakeChest`, `withMember` sign the member.

## Pitfalls

| Symptom | Cause |
|---|---|
| 401 on `/chest` locally | No Chest: run in the Chest's preview, or test with `fakeChest` |
| A style or a script is ignored in the browser | It is inline (`style=`, `<script>…</script>`): the policy blocks it |
| `call()` answers 404 | The action is not in `src/actions.ts`, or a members' action called from a public page (or the reverse) |
| An island loses its state on refresh | Its place changed: give the list's items an `id` |
| A date is a day off | Formatted without `f`, or a `date` column given to `f.date` (use `f.day`) |
| The build warns about `node:` modules in the browser | An island imports server code |
| A type error on `<Island props>` | A prop is a function or a Date: send data, keep the function in the island |
| `npm test` takes 500 MiB | No TEST_DATABASE_URL nor preview database: PGlite runs in the process |
