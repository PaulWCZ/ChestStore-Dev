# My tool

What the tool does, for whom, in a few sentences. Keep this file current:
the purpose, the data model, the decisions, the commands. The example it
starts with — Notes — is there to be changed into the tool.

## Commands

- `npm run dev`: rebuilds on every change and restarts the server.
- `npm run build`: the type check, then the browser's files and the server.
- `npm test`: the type check, the server built into `dist/test`, then
  `test/*.test.*` (PostgreSQL runs inside the test, no setup).
- `npm start`: the built server, as the Chest runs it.

## Where things are

| Path | What it is | Edit? |
|---|---|---|
| `chest.json` | The manifest: name, roles, capabilities, schedules, `build.static: ["/assets/"]` | yes |
| `src/app.tsx` | **Every route**: pages, downloads, `/chest-events`, `/chest-schedules` | yes |
| `src/actions.ts` | **Every mutation**, by name | yes |
| `src/pages/` | Pages: React components rendered on the server | yes |
| `src/islands/` | Components that also run in the browser; `index.ts` lists them | yes |
| `src/layout.tsx` | Around every page: the kit's shell, the sections (`nav`), the toasts | yes |
| `src/lib/` | Rules and SQL (`notes.ts`), the database (`db.ts`), names of members (`people.ts`), CSV | yes |
| `src/i18n/` | Every word: `en.ts` (source, fallback), `fr.ts`; `index.ts` formats | yes |
| `src/theme.ts`, `src/styles.css` | The look (a theme of the UI kit) and the tool's own CSS | yes |
| `migrations/` | The tables: `0001_name.sql`, run by the Chest in name order | add only |
| `test/` | `app.test.mjs` (the built server, a fake Chest, PostgreSQL), `units.test.ts` | yes |
| `src/core/` | The starter's machinery: server, actions, islands, refresh, log | rarely |
| `vendor/` | The Chest SDK and the UI kit, packed: never change them | no |

## How it works

- **Pages render on the server.** A route in `src/app.tsx` reads what the
  page needs, then returns `{ title, body }`; `page()` gives the member,
  their words `t` and their formats `f`, and checks the member (401
  without). The browser gets HTML and one script, `/assets/client.js`.
- **Islands** are the only components that run in the browser:
  `<Island name="DeleteNote" props={{ id, words }} />`. Props are plain
  data (checked by the types: no function, no Date) and include their
  words (`t.home.remove`…), dates already written by `f`, and the path if
  they need it: islands never import the catalogue or the SDK.
- **Actions** are the only way to change data: `action(fields, run)` in
  `src/actions.ts`, served at `POST /chest/actions/<name>`. Two callers:
  - a form: `<form method="post" action="/chest/actions/addNote">` with
    inputs named like the fields. Works without JavaScript (the server
    redirects back); with it, the form is sent in place, emptied, the page
    refreshed, a refusal shown as a toast.
  - an island: `await call("addNote", { body })` — typed by the action's
    fields; the page refreshes after a success; a refusal is a toast and
    `{ ok: false, error, message }`.
- **Refresh** re-reads the page and changes only what changed: focus,
  scroll, what is typed, open `<details>` and each island's state stay;
  islands receive their new props. Give items of a changing list an `id`
  (`id={"note-" + note.id}`) so they keep their place. `refresh()` from
  `src/core/client.tsx` does it by hand (after a timer: the kit's
  `useAutoRefresh(refresh, 30)` in an island).
- **Refusals are codes**: `fail("not_found")`, `fail("too_long", { max })`;
  each code is a sentence in `t.errors`. In a page: `notFound()`,
  `forbidden()`, `redirect("/chest/x")` (from `src/core/tool.ts`).
- **The public part** (only with `"public": true` in `chest.json`, which is
  a permission the owner approves): any path outside `/chest`, built with
  `publicPage()` and `publicAction()`; there is no member, the language is
  the visitor's (switch at `/lang/<code>`).

## Recipes

**A page** — `src/pages/Report.tsx` (a component taking `t`, `f`, data),
then in `src/app.tsx`:

```tsx
app.get("/chest/report/:id", page(async ({ member, t, f, param }) => {
  const report = await getReport(db(), member, param("id")); // fail("not_found") inside
  return { title: t.report.title, body: <Report report={report} t={t} f={f} /> };
}));
```
A section of the tool: one line in `nav` of `src/layout.tsx`.

**An action** — in `src/actions.ts`, the rule in `src/lib/`:

```ts
renameNote: action({ id: field.id(), title: field.text({ max: 120 }) },
  async ({ id, title }, { member }) => notes.rename(db(), member, id, title)),
```
Fields: `text({ min?, max })`, `int({ min, max })`, `id()`, `bool()`,
`choice([...])`, `day()`, `optional(f)`, `list(f, max)`. A run may
`redirect("/chest/notes/" + id)` (the island follows it). Who may do what is
checked in `src/lib/`, from `member` (its `id`, `role`, `isAdmin`), never
from the input.

**An island** — `src/islands/Rename.tsx` (`"use client"` is not needed),
listed in `src/islands/index.ts`, rendered with `<Island name="Rename" …/>`.
It imports only React, the kit, and `call`, `refresh`, `toast` from
`../core/client.tsx`. A dialog, a picker, a date field: the kit's
components (`@argentic/chest-ui/components`, words from `t.kit`).

**A table** — a new file `migrations/0002_tags.sql` (never edit one that
ran; the previous version must keep working on the new schema). Ids are
`bigint generated always as identity`, members are `text` ids (`mbr_…`),
instants `timestamptz`, days `date`. Queries: ``db()`select … where id = ${id}` ``
(values are always parameters; `sql.unsafe` never takes input).
`sql.begin(async tx => …)` for several writes that go together.

**A public page** — set `"public": true` in `chest.json`; then
`app.get("/jobs", publicPage(async ({ t, f }) => ({ title, body })))` and
`publicAction(fields, run)`. Never a member's data, a file link or an
`uploadUrl` there; keep the honeypot field of `Contact.tsx` on forms.

**A schedule** — `"schedules": [{"name": "digest", "cron": "0 7 * * 1-5"}]`
in `chest.json` (the Chest's time zone, 15 minutes apart at least), then a
handler in `src/app.tsx` beside `purge`. It must finish within 5 minutes
and be idempotent (a failed run comes again with the same id).

**A translation** — every text in `src/i18n/en.ts`, the same key in
`fr.ts` (tsc refuses a missing one). Values with `{name}`: `fill(t.x, {
name })`; plurals `{ one, other }` (and `zero`): `f.plural(t.x, n)`.
Dates and numbers only through `f` (`f.date`, `f.dateTime`, `f.day`,
`f.number`, `f.money`): the member's language and time zone, on the
server. A new language: one file like `fr.ts`, its code in `locales`.

**A download** — a route returning a `Response`: `/chest/notes.csv` streams
rows with a cursor (`csvLine` quotes cells and defuses formulas).

**An upload** (`files`) — an action answers `await files.uploadUrl("photos/",
{ maxSize, types })`; the island `PUT`s the file there, then calls a second
action that checks `files.stat(name)` before recording it.

**Static files** (images, icons, fonts) — `public/assets/…`, served at
`/assets/…`. The catalogue's icon and picture: `chest/icon.svg`,
`chest/preview.png`, named in `chest.json`.

**Work after the answer** (a notification, a badge) —
`after("notify", () => notifications.notify(…))` from `src/core/tool.ts`:
logged if it fails, never minutes long.

**Members' lifecycle** — `/chest-events` in `src/app.tsx` (needs
`"receives": ["member.*"]` and `members`): on `member.erased`, delete or
anonymise their data, then `acknowledgeErasure`.

## Rules

- **Identity only from the Chest**: `member` in `page()`/`action()` (the
  SDK's `member(request)`). Never a user id, name or role from a form, a
  query or a cookie. Store `mbr_…` ids; show names with `names()`.
- **No inline script, no inline style, no `style={}`**: the policy
  (`src/core/http.tsx`) refuses them, as the Chest does on a public part. A
  size from data: an SVG attribute (`<rect width={pct}>`), `<progress>`,
  `<meter>`, or a class. CSS uses the kit's tokens only (`var(--ink)`),
  never a colour (`test/units.test.ts` checks both).
- **Nothing kept in memory between requests**: the tool sleeps when idle
  and may run twice during an update. Data in the database, files through
  the SDK's `files`, nothing on disk.
- **Logs**: `log.info("what happened", { note: id })` from
  `src/core/log.ts`. Ids and counts only: never a secret, a token, a
  name, an email, or what someone wrote. Every request is logged already.
- **Server only**: the SDK, `src/lib/` and `src/actions.ts` never reach
  the browser (`test/units.test.ts` fails on an island that imports them).
- **Accessible**: a label for every field, a heading for every page,
  buttons that say what they do (`aria-describedby` to their item), the
  kit's components for dialogs, menus, dates, toasts.
- **Each capability** used (`database`, `members`, `files`,
  `notifications`, `ai`) is declared in `chest.json`, and nothing more.

## Pitfalls

| Symptom | Cause |
|---|---|
| 401 on `/chest` locally | No Chest: run it in the Chest's preview, or test with `fakeChest` |
| A style or a script is ignored in the browser | It is inline (`style=`, `<script>…</script>`): the policy blocks it |
| `call()` answers 404 | The action is not in `src/actions.ts`, or a member's action called from a public page (or the reverse) |
| An island loses its state on refresh | Its place changed: give the list's items an `id` |
| A date is a day off | Formatted without `f`, or a `date` column formatted with `f.date` (use `f.day`) |
| The build warns about `node:` modules in the browser | An island imports server code (the SDK, `src/lib/`) |
