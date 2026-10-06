# Building a Chest tool with `@argentic/chest-app` — the reference for agents

A tool made from the starter is a Hono server that renders React pages,
with a few islands in the browser. This package is that machinery; the
tool's own code is routes, pages, islands, actions, rules and SQL, words.
The SDK (`@argentic/chest-sdk`, its `README.md` in `node_modules`) is the
Chest's side; the UI kit (`@argentic/chest-ui`, its `README.md`) the look.

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
  (a position, a count) never interleave; the next goes once the one
  before is answered (30 seconds at most). **A slow action (AI, an
  import, an upload) is parallel**: `action(fields, run, { parallel:
  true })` — `call()` and forms then send it at once, and it holds
  nothing else; `data-parallel` on a form, or `call(name, input, {
  parallel: true })`, for one call (a search, a preview).
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
  // a form of a public page or of an island: <Honeypot action="…" /> in it
  <form method="post" action="/actions/book"><Honeypot action="book" />…</form>
  // src/actions.ts
  book: publicAction(fields, async (input, { charge }) => {
    const slot = await freeSlot(input.slot);          // check first: a refusal costs nothing
    if (!slot) fail("invalid");
    await charge(input.secret ? "change" : "new");    // then spend the budget it uses
    …write…
  }, { bound: { budgets: { new: { perVisitor: 3, perDay: 200 }, change: { perVisitor: 10, perDay: 500 } } } }),
  // one kind of write: { bound: { perVisitor: 5, perDay: 200 } }, no charge()
  ```
  The package then: requires the page's **form token for that action**
  (`<Honeypot action="book" />` carries it in the form; an action an
  island only calls — an upload's grant — needs `<FormToken
  action="upload" />` on the page, and `call("upload", …)` sends it — as
  does a form an island shows only later (a step after a choice, "Change
  my answer"): the token must be in what the server rendered; a
  token issued for one action is refused by another; 120 minutes, `formMinutes` to change;
  `formSeconds: 2` makes a form sent sooner than a person fills it wait
  the seconds left; it serves once whatever the answer, and the answer —
  or the page a plain form goes back to — brings the next; else the code
  `expired`); answers "done" without running to a robot that fills the
  honeypot; counts a call **only once it is valid** (token, fields, and in
  your run what you check before `charge()`; a run that throws gives its
  counts back) per visitor and for everyone a day, in `chest_bounds`;
  past it, the code `limit`. `perSubject` (budgets by kind only, with
  `charge(kind, { subject: link })`) bounds one thing written to — a
  guest link, a booking — whoever writes: per job, per guest link, keep
  `perSubject` well under `perDay` (`perDay` ≥ `perSubject` × the subjects
  busy on one day), so that one subject's flood spends its own budget and
  leaves the rest of the day's to the others. **Refusals** (your run
  refused: a wrong secret, a time taken) are counted per visitor and for
  everyone: a visitor (address or cookie) past ten times their budget (at
  least 20) is refused before the run — their flood closes the form to
  them only; everyone's ceiling (ten times `perDay`) **never refuses**: a
  call that passes your checks still writes, and your run is told
  (`{ flooded }` in its context) to keep its checks cheap. A forged or
  old token is refused from its signature alone, before any query.
  **A proof of work** against a robot that loads the page for each fresh
  token (a form of few places, a booking): `bound: { …, work: true }` —
  each token asks one (16 bits: about half a second on a mid-range phone,
  in a Worker, `/assets/chest-work.js`, while the page says it is
  checking; two bits more once half the day's budget is spent, two more
  past four fifths). Checked from a hash before anything is counted: a
  flood that does not compute it costs a signature and a hash. No puzzle,
  nothing to see or hear, no third party; the form then needs
  JavaScript. A test sends `{ chest_form: token, chest_work:
  solveWork(token) }` (`formToken(action, Date.now(), 16)`).
  **What it does not do:** the visitor is the address the Chest's front
  gives (`Chest-Visitor-Address`, a studio proposal — no Chest gives it
  yet), else the browser's cookie; a robot that clears its cookie and
  loads the page for each fresh token can spend `perDay` with calls that
  pass your checks, and the people after it meet `limit` until tomorrow
  (those who wrote earlier today keep a reserve of a tenth). Choose
  `perDay` as the most the tool can take in a day, not the most people
  send. A kiosk, or one office behind one address, is one visitor:
  `perVisitor` must allow it.
  **Never call the Chest per public request** (`members.get`,
  `members.list`, `groups`…): a flood of visitors would spend the tool's
  limits at the Chest, and the members' own pages would fail. Cache a
  minute, or read the tool's own table. **Never list the members on a
  public page** (it publishes the staff directory): offer one role's
  members only, or a search on the server that answers a few names.
  Words: `t.errors.limit` and `t.errors.expired` ("This form expired:
  send it again.") — `checkSources` asks them in every catalogue when a
  bounded action exists. A test sends `{ chest_form: formToken("book") }`.
  `bound: false` only for an action that writes nothing (`checkSources`
  fails on a `publicAction` without `bound`, on budgets without
  `charge(`, on `perSubject` without a subject). A page with a bounded
  form is never cached by a shared cache (its token would be everyone's).

## Fields of an action

A field's refusal names its field (`{ ok: false, error, message, field }`):
a form sent in place shows the sentence under that field (`.ck-error`,
`aria-invalid`, the focus there) instead of a toast; an island reads
`outcome.field` to do the same.

Each field has two types: what `run()` receives (read) and what `call()`
may send (the wire): `money()` receives cents, a `number`, and accepts
`"12,50"`, `"1 234,50"`, `"1,234.50"`, `"1.000.000"` or `12.5` on the wire — send what
the person typed, never `Number(…)` or `parseFloat(…)` of it.

`text({ min?, max })` (trimmed; `min` 1 by default: `empty`, `too_long`;
`max` in code points; control characters `invalid`, bidirectional
overrides removed, only invisible characters `empty`),
`int({ min, max })` (digits only: `""` is `empty`, `"0x5"`, `"1e1"`,
`"1.0"` are `invalid`), `money({ min?, max, decimals? })` (in minor units — cents with the
default `decimals: 2`; 0 for yen, 3 for dinars — min and max too; a
currency known only at run time: `readMoney(text, decimals)`, the same
rules, in an action or an island;
store `bigint` cents; write `f.money(cents, { cents: true })`; spaces
only between groups of three; `"1,250"` or `"1.234"` alone is
`amount_ambiguous` — say it in the catalogue, "Write 1250 or 1,25", else
it reads as `invalid`), `id()` (a
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
`db()` returns as text) and writes that day wherever the reader is (a
day that does not exist, `""` or `"2026-02-31"`, is `fail("invalid")`:
read a day from an address with `field.day()` first);
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
**A page others change, left open** (a board, a queue, a timesheet) —
an island that calls `useAutoRefresh(60)` from
`@argentic/chest-app/client` (not the kit's: it reads all day long), and
`page(render, { version: () => changeStamp() })` (below: "A page's
version that stays right"): the page is read again when the tab comes back and every minute while
its reader was active in the last ten (idle, it stops: the Chest may
put the tool to sleep), less often while nothing changes, and a read
with the same version is a 304 — nothing rendered.
**A page's version that stays right** (a page left open, read again with
`useAutoRefresh`) — the change log of the package, never your own:
copy `node_modules/@argentic/chest-app/sql/changes.sql` into a migration
(`migrations/0007_chest_changes.sql`), then in it, for each table the
pages read, `select chest_watch('deals');`; and
`page(render, { version: () => changeStamp() })` (`@argentic/chest-app/db`),
with what else the page depends on: `` async () => `${await changeStamp()}.${chest.today()}` ``.
Each transaction that changes watched rows adds one log row, visible when
it commits; a statement that changes nothing adds none; `page()` reads
the version before it renders. Proven on PostgreSQL by the package's
tests: a write still uncommitted while a page is read moves the stamp
when it commits; two writers committing out of order both move it; a
5,000-row import leaves another write waiting 5 ms. **Never a counter
row** (`update stamp set n = n + 1` serialises every writer behind an
import: quadratic, deadlocks), **never a sequence** (`nextval` is seen
before the commit: a reader stamps the new number on the old rows, and
every refresh after is a stale 304), **never `max(updated_at)` or
`now()`** (a transaction's `now()` is its start: a late commit hides
behind an earlier stamp). The package keys the version by the reader —
their role, admin or not, their groups — and their language. Anything
that depends on the time (a button that opens ten minutes before a
start, "in 5 min") is decided in an island from the browser's clock,
never under a version that changes only with the data.
**A big list in an island** (an inventory, a directory) — never the whole
table in its props: they are rendered and sent twice in the page (7,045
items made 14 MB of HTML and 272 MiB, past the tool's 256). Give the
island counts and a first page (`limit 50`), page or search on the
server (`?q=`, `?page=`: links or a GET form), and fetch what a dialog
needs when it opens, with an action declared `parallel: true`. In
development, props over 256 KB are warned about.
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
`members.lookup(ids)` (`members` capability), then `const locale =
localeIn(locales, member.language)` (a language the tool speaks, else
its first), `words(locale)` (the tool's `src/i18n/index.ts`) and
`formatter(locale, member.timeZone, chest.currency)` from
`@argentic/chest-app`. A notification's title is 80
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
public part. A big one: `body: textStream(lines())` — an async generator
yielding `csvLine([...])` (quotes and defuses formulas) per row of a
cursor — or `zipStream()`. **A link to a file carries `download`**
(`<a href="/chest/export.csv" download>`): the browser fetches it once.
(A link to an address ending with an extension — `.csv`, `.zip`, `.ics`
— is never followed in place either; any other that answers a file is
answered 204 to the in-place fetch, the file unmade, then loaded.)
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
**Structured data on a public page** (a job posting, an event for search
engines) — a data block in the page's `head`: `<script
type="application/ld+json" dangerouslySetInnerHTML={{ __html:
JSON.stringify(data).replaceAll("<", "\\u003c") }} />`. The browser never
runs it, so the strict policy (`script-src 'self'`) lets it be, and
`checkPage` accepts it (an executable inline script stays refused).
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

`npm test`: tsc, the browser's files built (`dist/client`: a test that
asks `/assets/…` finds them), the server built into `dist/test`, then
`test/*.test.*`.
From `@argentic/chest-app/testing`: `testDatabase()` (start `fakeChest()`
first: the returned `sql` seeds in the Chest's zone, as `db()` reads;
TEST_DATABASE_URL —
a server whose user may create roles: a throwaway database; else the
preview's DATABASE_URL: a throwaway schema; else PGlite in the process:
1.2–1.3 GiB for the test run, more than the workbench can spare beside
the dev server), `checkPage(html)`, `checkWords(catalogues)`,
`settled()` (every `after()` task done — then read what it sent),
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
| An island shows a new thing with the old one's state (a draft, an open menu) after a refresh or a navigation | Same island, same place, other subject: give it an id, `<Island id={"card-" + card.id} …/>` (in development the browser warns when a prop `id` changes under an island without one; its wrapper's DOM id is then `island-card-12`, apart from any id of its content) |
| A page with a big list is slow, then the tool restarts (out of memory) | The whole table in an island's props: counts and a first page instead, the rest by search, paging or a parallel action ("A big list in an island") |
| A unit test calls `chest.clearCaches()` (or changes the fake's members) and the built server still answers from its cache | The server built into `dist/test` bundles its own copy of the SDK: its caches are not the test's. Call the tool's own functions (the delivery, the rule in `src/lib/`) directly in a unit test, and keep server tests to what a request shows |
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
