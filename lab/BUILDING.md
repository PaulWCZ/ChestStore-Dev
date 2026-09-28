# Building a store tool in the studio — the working standard

Read `CLAUDE.md`, `brief/03-building-a-tool.md` and `brief/05-design-contest.md`
first; this page is how we meet them here. **The reference implementation is
`tools/private/tasks/`**: when in doubt, look at how Tasks does it, and copy
and adapt its code into your own folder (same licence, same studio) — never
import from it: a tool depends on nothing outside its folder.

## 1. Start

```sh
service postgresql start                      # once per session (tests do not need it; the harness does)
node scripts/new-tool.mjs private <name>      # or public-and-private; copies lab/template, packs sdk/, npm install
cd tools/private/<name>
```

Then delete the starter's notes feature (`lib/notes.ts`, `app/chest/notes-view.tsx`,
`migrations/0001_notes.sql`, `test/notes.test.ts`), its font (`app/fonts/figtree.css`,
`public/fonts/figtree*`, `LICENSE-figtree.txt`) and add yours:
`node scripts/add-font.mjs tools/private/<name> @fontsource-variable/<font>` (or `@fontsource/<font> 400,700`).

## 2. Architecture (keep it)

| Layer | Where | Rules |
|---|---|---|
| Rights | `lib/access.ts` | Roles strongest first; abilities per role; resource-level access if needed (see Tasks' `boardAccess`). A resource the actor cannot see is `not_found`, never `forbidden` |
| Rules and bounds | `lib/model.ts` | Pure: `clean()`, ids, limits, dates. Throws `AppError(code)` (`lib/app-error.ts`, browser-safe) |
| Services | `lib/<domain>.ts` | Every function `(sql, actor, …input: unknown)`; checks rights first; parameterised SQL only; transactions with `sql.begin` (steps get a `Query`); returns data, never sentences |
| Chest glue | `lib/people.ts`, `lib/notify.ts`, `lib/lifecycle.ts` | Names from ids at render (`people()`, `nameOf()`); bell items in each recipient's language (`notify(ids, t => …)`); keyed notifications withdrawn when settled; badges as true counts; lifecycle handlers idempotent |
| Server actions | `app/chest/actions.ts` | Thin: `act(actor => service(db(), actor, …))` returning `Result`; `revalidatePath("/chest", "layout")` |
| Pages | `app/chest/**/page.tsx` (server) | `viewer()` gives member, locale, words; resolve names; pass plain data and the catalogue sections a view needs |
| Views | `*.tsx` with `"use client"` | Optimistic (`useOptimistic`) or local state + action + toast with *Undo*; import only `lib/i18n/format.ts`, `lib/app-error.ts`, `lib/initials.ts`, pure libs and types — **never** the SDK, `lib/db.ts`, `lib/session.ts`, `lib/people.ts` (the build fails on `node:crypto`) |
| Routes | `app/chest/api/**/route.ts`, downloads | Re-read the member; files: `uploadUrl` → browser PUT → `files.stat` → record; open files through a route that signs a fresh `files.url` |
| Lifecycle | `app/chest-events/route.ts` | `access.revoked`, `member.removed`, `member.erased` (+ `acknowledgeErasure`) |
| Schedules (proposal) | `chest.proposals.json`, `app/chest-jobs/[name]/route.ts` | Only if the tool needs work at set times; see `sdk/README.md` "schedules" and Tasks' `lib/morning.ts` |

Words: `lib/i18n/en.ts` (source) and `fr.ts` (complete, natural French, not
a word-for-word translation), plurals as `{one, other}` (`zero` optional),
`{placeholders}`. The tests compare keys and placeholders and look for words
written in `.tsx` files.

## 3. Design

Your own identity (brief/05): a direction nobody else in the store uses,
tokens in `app/tokens.css` (light + dark), components in `app/globals.css`,
icons drawn in `components/icons.tsx` (24-unit strokes), a mark in
`components/mark.tsx` and `chest/icon.svg` (+ `app/icon.svg`), contrast
checked with `node scripts/contrast.mjs "#fg on #bg"` (AA 4.5:1). The
default rule `svg { width: 1.1em }` sizes icons with their text.

The UX bar: one obvious action per screen, plain words, useful empty states
(one action, or a one-click example), undo instead of confirmations, 44 px
targets, keyboard and screen reader (labels, `aria-live` toasts, focus),
works at 390 px (no horizontal page scroll), `prefers-reduced-motion`.

## 4. Verify (all of it, before saying done)

```sh
npm test                                            # PGlite
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # real PostgreSQL
npm run build
node scripts/check-manifest.mjs tools/<kind>/<name>
node lab/chest-dev/dev.mjs tools/<kind>/<name> --prod --reset --port <yours>   # background (nohup … &)
node lab/chest-dev/flows/<name>.mjs <yours>          # your browser flows (lab/chest-dev/flows/lib.mjs; model: flows/tasks.mjs)
node lab/chest-dev/screens.mjs tools/<kind>/<name> --port <yours>   # docs/screens.json → docs/screens/, chest/preview.png
sh lab/chest-dev/stop.sh <yours>
```

Look at every screenshot yourself (desktop, phone, French, dark). Tests cover
each role's rights, every service's refusals, lifecycle events, importers,
the catalogues. `docs/dev.json` gives the cast the roles that make sense
(`{"roles": {"ines": "approver"}}`); `seed/sample.sql` fills a realistic
small company (ids of `lab/chest-dev/cast.mjs`: camille, ines, hugo, lea,
tom, sofia, nora).

Never `pkill -f` a pattern that appears in your own command line (it kills
your shell): use `sh lab/chest-dev/stop.sh <port>`.

## 5. Document

`README.md` (what it does, roles table, **First minute**, routes, on a Chest,
**Needs from the SDK**, develop, what it does not do yet), `DESIGN.md` (with
the ```json showcase``` block the showcase reads), `AGENTS.md` (map, rules),
`THIRD_PARTY.md` (fonts, any reused code or ideas), `LICENSE` (MIT, © 2026
Argentic). Models: Tasks' own files.

## 6. The SDK

Use what the working copy gives (`sdk/README.md`, sections marked
**Proposal (studio)**). If the tool needs a primitive that does not exist
(email, public accounts, public uploads, payments, events between tools…),
do not fake it inside the tool: design its call site behind one small
module of the tool, catch `CapabilityNotGranted`/`Unavailable`, and say what
it needs — the studio designs the primitive in `sdk/`.
