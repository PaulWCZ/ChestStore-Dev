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
  `onLinkClick`, `toast`, `fill`, `plural`, `fail` (and `send` for a form
  it posts itself) from `@argentic/chest-app/client` — with the types an
  island names (`Outcome`, `SentOf`, `ErrorCode`, `Words`, `Plain`), never
  from the package's root (server code). Islands do not nest. Each island is a
  React root of its own: the kit's `useToast()` sees no `<Toasts>` there —
  use `toast()`, which reaches the layout's `ToastHost` (outside `<main>`,
  `id="toasts"`, so it survives `navigate()`). The island's HTML sits in a
  `<div class="island">` (`display: contents`, first in `client.css` from
  `chestConfig()`: it takes no room, an empty island leaves no gap; an
  island sized as a flex item gets its box back: `.bar > .island {
  display: block; flex: … }`): render whole elements in an island — a list's
  `<ul>`, not its `<li>` — and select its insides by class, not with `>`
  from outside.
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
  toast says so and the page stays, with what is typed (the Chest's 5xx,
  "Waking up…" included). `refresh()` and `navigate(path)` by hand
  (`{ top: false }`: the scroll and the focus stay — a panel opened beside
  a list); `useAutoRefresh(refresh, 30)` (kit) on a timer. A navigation is
  never lost to a refresh or an action on its way; an island it brings is
  live the moment it shows.
- **Links** between pages of the same part go in place too (`start()`
  intercepts a plain click on `<a href>`): no page load, the layout's
  islands kept (a toast's Undo), focus on the new page's `<h1>`, Back and
  Forward restoring the page and its scroll. A link stays a page load for
  another part or site, a `target`, a `download`, a modifier key, a `#`
  on the same page, `/assets/`, or `data-reload` on the link or an
  ancestor (the opt-out: a page that must start afresh).
- **Actions run one at a time**, in the order asked, from `call()` and
  from forms (as Next.js's server actions did): two that read then write
  (a position, a count) never interleave. `call(name, input, { parallel:
  true })` for one that touches nothing in common (a search, a preview).
  Rules that compute from existing rows must still be safe in SQL: two
  people act at once too (`db().begin(…)` with a lock, or a unique
  constraint).
- **Compressed**: pages, JSON and downloads of 1 KiB and more are gzipped
  as they go; the browser's files are compressed at build (`.br`, `.gz`
  beside each, served by `Accept-Encoding`). The Chest's front compresses
  nothing itself.
- **Refusals are codes**, one way everywhere: `fail("not_found")`,
  `fail("too_long", { max })`; each code is a sentence in `t.errors`. In an
  action the caller gets the code and the sentence; in a page,
  `fail("forbidden")` is the 403 page and any other code the 404 page.
  `notFound()` and `forbidden()` are its shorthands. `redirect("/chest/x")`
  takes a path of the tool only (no `//`, `\`, `.` or `..` segment:
  anything else throws).
- **The public part** — only with `"public": true` in `chest.json`, a
  permission the owner approves (`checkSources` fails on a `publicAction`
  without it, and on it with nothing public served): any path outside `/chest`, served by `publicPage()` and
  `publicAction()`; no member; the visitor's language (`/lang/<code>`
  switch). **Every public action is bounded** — the one way, the same in
  every tool:
  ```tsx
  // a form of a public page or of an island: <Honeypot /> in it
  <form method="post" action="/actions/book"><Honeypot />…</form>
  // src/actions.ts
  book: publicAction(fields, async (input, { charge }) => {
    const slot = await freeSlot(input.slot);          // check first: a refusal costs nothing
    if (!slot) fail("invalid");
    await charge(input.secret ? "change" : "new");    // then spend the budget it uses
    …write…
  }, { bound: { budgets: { new: { perVisitor: 3, perDay: 200 }, change: { perVisitor: 10, perDay: 500 } } } }),
  // one kind of write: { bound: { perVisitor: 5, perDay: 200 } }, no charge()
  ```
  The package then: requires the page's **form token** (`<Honeypot />`
  carries it, `call()` sends it; 120 minutes, `formMinutes` to change;
  `formSeconds: 2` makes a form sent sooner than a person fills it wait
  the seconds left;
  serves once, the answer brings the next; else the code `expired`);
  answers "done" without running to a robot that fills the honeypot;
  counts the call **only once it is valid** (token, fields, and in your
  run, what you check before `charge()`; a run that throws gives its count
  and token back) per visitor and for everyone a day, in `chest_bounds`;
  past it, the code `limit`. The visitor is the address the Chest's front
  gives (`Chest-Visitor-Address`, a studio proposal: none today), else
  the browser's cookie; one with neither counts in `perDay` only. Words:
  `t.errors.limit` and `t.errors.expired` ("This form expired: send it
  again."). A test sends `{ chest_form: formToken() }`. `bound: false`
  only for an action that writes nothing (`checkSources` fails on a
  `publicAction` without `bound`, and on budgets without `charge(`).
  A page with a bounded form is never cached by a shared cache (its
  token would be everyone's).

## Fields of an action

Each field has two types: what `run()` receives (read) and what `call()`
may send (the wire): `money()` receives cents, a `number`, and accepts
`"12,50"`, `"1 234,50"`, `"1,234.50"` or `12.5` on the wire — send what
the person typed, never `Number(…)` or `parseFloat(…)` of it.

`text({ min?, max })` (trimmed; `min` 1 by default: `empty`, `too_long`),
`int({ min, max })` (digits only: `""` is `empty`, `"0x5"`, `"1e1"`,
`"1.0"` are `invalid`), `money({ min?, max })` (in cents, min and max too;
store `bigint` cents; write `f.money(cents, { cents: true })`), `id()` (a
bigint id as text), `bool()` (a checkbox), `choice([...])`, `day()` (a day
that exists, YYYY-MM-DD: 2026-02-31 is `invalid`), `optional(f)` (absent/""/null → undefined),
`nullable(f)` (absent → undefined, ""/null → null: "clear it"), `sent(f)`
(absent → undefined, "" kept), `list(f, max)`, `keyed(/^d(\d+)$/u, f, max)`
(fields named by a pattern), `json()` (an island's object, checked by the
rule). A field of the tool's own is `{ read(value) { …; return v or
fail("invalid") } }`. Who may do what is checked in `src/lib/` from
`member` (`id`, `role`, `isAdmin`), never from the input.

## Words and formats

`t` is the reader's catalogue; `fill(t.x, { name })` fills values;
`f.plural(t.x, n)` picks `{ zero?, one, other }`. `f.date`, `f.time`,
`f.dateTime` take a `Date` (an instant, a `timestamptz`) and write it in
the reader's zone; `f.day` takes a `"YYYY-MM-DD"` (a `date` column, which
`db()` returns as text) and writes that day wherever the reader is;
`f.today()` is the reader's own day (a member's personal deadline);
the company's day is `chest.today()` (SDK), and in SQL `current_date`,
`now()::date` and `date_trunc` run in the Chest's zone (the database
session's), not the member's. `f.number`, `f.money`. Never format in the browser, never `new Intl.…` per row (each
Intl object lives outside V8's heap: hundreds of MiB pile up). French: a
narrow no-break space (U+202F) before `: ; ? !` (`checkWords` refuses
otherwise). The catalogue must hold `tool.name`, `pages` (notFound,
forbidden, failed, signIn, busy, language), `errors` (invalid, empty,
too_long, too_large, forbidden, not_found, unavailable, unknown — plus the
tool's own codes) and `kit` (the kit's words). The layout uses only those
sections and its own (`nav`: the sections' labels), never a page's.

## The database

`db()` from `@argentic/chest-app/db`: ``db()`select … where id = ${id}` ``
(values are always parameters; `db().unsafe` never takes input).
`db().begin(async tx => …)` for writes that go together. Ids are `bigint
generated always as identity` (text in JS), members `text` (`mbr_…`),
instants `timestamptz` (Date), days `date` (text). `bigint`, `numeric`
and what `count()` and `sum()` answer come back as **text** (they may not
fit a JS number): cast in SQL (`count(*)::int`, `sum(amount_cents)::float8`
when it fits) or `Number(…)` once read. `seen` (same module) is
the store `events.handle` and `schedules.handle` take; its table is
`migrations/0001_chest.sql` (`seenIn("my_table")` keeps them in a table of
the tool's own). It grows one row per delivery: call `seen.forget()` (30
days by default) from a schedule or after an event. **Migrations**: `NNNN_name.sql`, run by the
Chest in name order. While the tool is an unpublished draft, its
migrations may be rewritten; once a version is published, a migration
that ran is never edited — a change is a new file, and the previous
version must keep working on the new schema.

## Recipes

**Optimistic state in a big island** (a board dragged, a list reordered)
— show the server's props, unless a local state exists while a drag or a
call is in flight: `const shown = pending ?? props.cards`; set `pending`
when the person acts, `await call(…)` (it refreshes: the new props
arrive), then clear `pending` — the clear and the new props land in the
same render, with no flash of the old order.

**A page** — a component in `src/pages/`, a route in `src/app.tsx`, its
words in `en.ts` and `fr.ts`; a section: one line in `nav` of `src/layout.tsx`.
**A page that tells the layout something** (a tab shown only when the
page found it has content, a count in the nav) — return `{ title, body,
layout: { trash: true } }`; the layout reads `data.trash` (`{}` on an
error page: give each a default). Its shape: `layout: { trash: boolean }`
in `src/register.ts`'s `Register`. Never a module-level or per-member
cache: two requests run at once.
**A table** — `migrations/0003_tags.sql`, its rules and SQL in `src/lib/`.
**Roles** — `"roles": ["manager", "member"]` in `chest.json` (the first
is the default a new member gets; `"role_labels": { "manager": "Manager" }`
for the Chest's screens); `member.role` says which, `member.isAdmin` too.
Who may do what is one function in `src/lib/` (`can(member, "x")`), used
by pages (to show the button) and actions (to refuse with `forbidden`).
**Writing to another member** (a notification, a digest), outside their
request: their language and zone from `members.get(id)` or
`members.lookup(ids)` (`members` capability), then `words(member.language)`
(the tool's `src/i18n/index.ts`) and `formatter(language, member.timeZone,
chest.currency)` from `@argentic/chest-app`. A notification's title is 80
characters at most and its body 280 (the SDK refuses longer, and a
schedule that sends one fails at every run): `cutText(title, 80)`. Send
it in `after("notify", () => notifications.notify(…))` from an action: a
Chest hiccup then never fails an action whose data is written.
**Long lists** — page them: `order by created_at desc, id desc limit
${pageSize + 1}` after the last row's `(created_at, id)` from the address
(`?after=…`); the extra row says whether a next page exists. Never a
silent `limit 500`.
**A schedule** — `"schedules": [{"name": "digest", "cron": "0 7 * * 1-5"}]`
in `chest.json` (the Chest's zone; 15 minutes apart at least), a handler
`digest: async run => …` in `schedules.handle` of `src/app.tsx`; within 5
minutes, idempotent (a failed run comes again with the same id). Test it:
`await chest.run("digest", request => app.fetch(request))` (the SDK's
`fakeChest`) answers the status; `chest.notifications` lists what it sent.
**Members' lifecycle** — `"receives": ["member.*"]` (with `members`), a
handler in `events.handle`: on `member.erased`, delete or anonymise, then
`acknowledgeErasure`.
**Names of members** — `names(ids, t.people)` from
`@argentic/chest-app/members` (`members` capability).
**A download** — `app.get("/chest/export.csv", download(async ({ member, t }) => {
if (!can(member)) fail("forbidden"); return { name, type: "text/csv; charset=utf-8",
body } }))`: sent as an attachment (any name, accents too), never cached; a
refusal is a page in the reader's words with its status (403, 400 with
the error's values, 404) — not a bare text. `publicDownload()` for the
public part. A big one: `body` a stream (a cursor, `zipStream()`);
`csvLine([...])` quotes and defuses formulas.
**An archive** (an export with the files) — `zipStream(entries())` from
`@argentic/chest-app`, given an async generator that yields `{ name,
data }` one file at a time (`(await files.get(name)).data`, or a stream):
the zip is written as it is read, never whole in memory (256 MiB per
tool). Stored, not compressed; up to 65,535 files and 4 GiB.
**An import** (a body the tool reads itself) — `app.post("/chest/import",
rawRoute({ maxBytes: 20 << 20 }, async (body, { viewer, c }) => …))`:
same-origin checked, the body counted while read (chunked too), 413 past
`maxBytes`. An action takes `{ maxBody }` instead when its input is a form
or JSON. `sameOrigin(request)` is exported for a route of the tool's own.
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
**A public page in its own language** (a request's page in the language it
was written in) — return `{ title, body, locale }` from `publicPage()`:
`<html lang>` and the layout's words follow it (a language the tool speaks).
**The head** (an icon, robots) —
`createApp({ head: viewer => <><link rel="icon" href="/assets/icon.svg" /></> })`.
**A page's own head or title** — `{ title, body, head: <meta name="robots"
content="index, follow" />, exactTitle: true }`: `head` goes in that page's
`<head>`; `exactTitle` keeps the title as given (no " · <tool>").
**A route with its own policy** (a banner other sites frame, a picture) —
answer a `Response` with its own `Content-Security-Policy` (and
`Referrer-Policy`): the package keeps them; a page or an action gets the
strict one. A middleware may set `Referrer-Policy` (`no-referrer` for a
page whose address holds a secret).
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
preview's DATABASE_URL: a throwaway schema; else PGlite in the process:
1.2–1.3 GiB for the test run, more than the workbench can spare beside
the dev server), `checkPage(html)`, `checkWords(catalogues)`,
`checkSources({ requireTests: true })` (with it, every `src/lib/` module
is imported by a test;
class names built at run time — `` `c-${color}` `` — need their family in
the CSS),
`atLeast(n)` (a file whose tests were removed fails). Run the tests as the
workbench does too: `NODE_ENV=development npm test`.
The SDK's `fakeChest`, `withMember` sign the member.

## Pitfalls

| Symptom | Cause |
|---|---|
| An island shows a new thing with the old one's state (a draft, an open menu) after a refresh or a navigation | Same island, same place, other subject: give it an id, `<Island id={"card-" + card.id} …/>` (in development the browser warns when a prop `id` changes under an island without one) |
| Two quick actions reorder rows | Calls with `parallel: true`, or two people at once: serialise in SQL (a transaction with a lock) |
| Pasted HTML loses its bold and italics, the console reports a refused style | A `DOMParser` document inherits the page's policy: its `style=""` attributes are refused. Rename them in the text before parsing and read them by hand (Wiki's `src/islands/editor/paste.ts`, `unstyled()` and `inlineStyles()`) |
| TS7022/TS7024: `actions` "implicitly has type any" | A cycle through `Register`: an action's inferred type depends on `t` or on `fail()` in an expression. Annotate its run's return type (`async (…): Promise<{ id: string }> => …`) |
| A migration's `create extension` fails in the tests on PGlite | Give `testDatabase({ extensions: ["unaccent", "pg_trgm"] })`, or use a server |
| 401 on `/chest` locally | No Chest: run in the Chest's preview, or test with `fakeChest` |
| A style or a script is ignored in the browser | It is inline (`style=`, `<script>…</script>`): the policy blocks it |
| `call()` answers 404 | The action is not in `src/actions.ts`, or a members' action called from a public page (or the reverse) |
| An island loses its state on refresh | Its place changed: give the list's items an `id` |
| A date is a day off | Formatted without `f`, or a `date` column given to `f.date` (use `f.day`) |
| The build warns about `node:` modules in the browser | An island imports server code |
| A type error on `<Island props>` | A prop is a function or a Date: send data, keep the function in the island |
| `npm test` takes 1.3 GiB | No TEST_DATABASE_URL nor preview database: PGlite runs in the process |
| `npm test` passes, the tool does not build in the workbench | Tests run with the workbench's `NODE_ENV=development`: run them so too |
| A total is "1234" (text) | `sum()`/`count()` are bigint: cast in SQL |
| A POST answers 415 | Its body is neither a form nor JSON |
