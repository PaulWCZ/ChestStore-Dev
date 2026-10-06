# Adapting Polls — a guide for AI agents

`README.md` says what Polls does; this page says where things are and what
must not break. Polls is built like the studio's starter: TypeScript,
Hono, React rendered on the server, a few islands, Vite (no Next.js),
on the studio's package `@argentic/chest-app`.

## Commands

```sh
npm ci && npm run build && npm test     # all must pass (Node 24)
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # on a real PostgreSQL
```

## Map

| Path | What it is |
|---|---|
| `chest.json` | Contract 0.4: roles `organiser`, `member`; `public: true`; `database`, `members`, `notifications`; `receives`; schedule `pass` (every 15 min); `build.static: ["/assets/"]` |
| `chest.proposals.json` | Proposals of the studio's SDK: `mail: {send}`, `calendar: true`, `capabilities: ["members.groups"]` + `group.*`, `translations` |
| `src/app.tsx` | **Every route**: home, composer, poll, export, .ics, the looks, the guest page, `/chest-events`, `/chest-schedules` |
| `src/actions.ts` | **Every mutation**, by name (members' `action`, the guest's `publicAction`) |
| `src/pages/` | Pages rendered on the server: `Home`, `Compose` (new, edit), `Poll` (+ `Results`, `Trend`, `Teams`), `Guest`, `PublicHome` |
| `src/islands/` | What runs in the browser: `Composer`, `AnswerArea`, `Manage`/`FinalPicker`, `Comments`, `GuestsCard`, `Replies`, `GuestForm`, `PolicySwitch`, `AutoRefresh`; `index.ts` lists them; `words.ts`, `reply-keys.ts` their helpers |
| `src/components/` | Icons and the mark: plain SVG, used by pages and islands |
| `src/layout.tsx` | The kit's shell (members), the public frame, the toasts (outside `main`, under an id) |
| `src/theme.ts` | The identity "Confetti" and `sheetOf(surface)`: the look as a stylesheet |
| `src/tokens.css`, `src/styles.css` | Polls' own tokens (from the contract's), its components, the `pct-N` length classes. Contract tokens only, never a colour |
| `src/i18n/` | `en.ts` (source), `fr.ts`, `index.ts` (`fill`, `plural`, `formatter`: Intl objects made once) |
| `src/lib/` | The rules and the SQL — see below; framework-free, tested alone |
| `src/register.ts`, `src/main.ts`, `src/entry.tsx`, `vite.config.ts` | Wiring to `@argentic/chest-app` (the studio's package, `vendor/`: server, actions, islands, refresh, navigate, log — its `AGENTS.md`). Never edit the vendored copy |
| `migrations/` | `0001`…`0005`: never edit a shipped one; add `0006_…` |
| `seed/sample.sql` | Sample polls for local runs (never run by the Chest) |
| `test/` | `app.test.mjs` (the built server, a fake Chest, PostgreSQL); `*.test.ts` (`src/lib/`, the words, the look, the stack's rules) |

`src/lib/`: `access.ts` (who may do what), `model.ts` (bounds, `readPoll`,
`readAnswer`), `polls.ts` (services), `answers.ts` (the anonymous
rewrite), `results.ts`, `series.ts` (pulses), `comments.ts`, `tell.ts`
(notifications with `translations`, tile, `pass`/`catchUp`; never an email to a member), `groups.ts`, `teams.ts`,
`audience.ts`, `guests.ts`, `public-origin.ts`,
`guest-cookie.ts`, `replies.ts`, `agenda.ts` (calendar, guests' email),
`export.ts` (CSV), `ics.ts`, `csv.ts`, `time.ts`, `zone.ts`, `dates.ts`,
`people.ts`, `notify.ts`, `lifecycle.ts`, `db.ts`.

## The stack's rules (the starter's)

- **A page**: a route in `src/app.tsx` with `page()` (members) or
  `publicPage()`; it returns `{ title, body }`. Refuse with `notFound()`,
  `forbidden()`, `redirect()` (`@argentic/chest-app`).
- **An action**: `action(fields, run)` in `src/actions.ts`; an island calls
  it with `call("name", input)` (typed; the page refreshes after it unless
  `{ refresh: false }`); a refusal is a code (`AppError`/`fail`) said in
  `t.errors`. A structured input is `field.json()`, read by `src/lib/`.
- **An island** imports only React, the kit, `@argentic/chest-app/client`
  (`call`, `refresh`, `navigate`, `toast`, `send`), `../components/`,
  its helpers, and types. Its props are plain data with their words.
  `toast()` (never the kit's `useToast`: each island is its own root).
- **No inline script, no `style=""`, no `<style>`** (`test/stack.test.ts`):
  a length from data is a `pct-N` class (`src/pages/bits.tsx`); a value
  only a script knows is set on the element (`el.style.setProperty`, the
  confetti).
- **Nothing in memory that must survive**: the tool sleeps. Caches only
  (groups a minute, the look per choice, Intl objects).
- **Logs**: `log.info/warn/error` (`@argentic/chest-app`): ids and counts, never
  a name, an email, a text or a secret.

## Rules

- **The look is the Chest's choice.** `src/theme.ts` makes it a
  stylesheet the tool serves (`/chest/look.css`, `/look.css`), linked in
  every page's head by the package (`createApp({ look })`, `src/app.tsx`) — never a `<style>`; CSS names only contract tokens
  (`ui/tokens/CONTRACT.md` in the studio) and `src/tokens.css`'s. Text only
  on measured pairs (`--accent-ink` on `--accent`, `--cat-N-ink` on
  `--cat-N-soft`, a state's `-ink` on its `-soft`, `--ink` on
  `--highlight`); field borders `--line-strong`; `color-mix(in oklab, …)`
  for decoration only. A kind or an answer always has its icon and word.
- **Kit components first** (`@argentic/chest-ui/components`): `AppShell`,
  `BrandMark`, `NoAccess`, `Toasts`/`useToast`, `Confirm`, `PeoplePicker`,
  `DateField`, `Calendar` (multiple, inline: the days of a date poll),
  `TimeSelect`, `Switch` (the admin's policy), `Avatar`, `StatusBadge`, `EmptyState`,
  `PageHeader`, `LanguageSwitch`, `useAutoRefresh`, `Checkbox`. Their words are the
  `toast`, `peoplePicker` and `date` sections of the catalogues. A reversible
  act → a toast with `undo`; a bell item that left → `sent: true`; the
  irreversible (closing an anonymous poll) → `Confirm`. Never
  `window.confirm`, never `<input type="date">`.
- On/off: what takes effect at once (the admin's settings) is the kit's
  `Switch`; what waits for Send (the composer's choices) is the kit's
  `Checkbox` (kit 0.2.3). Kept on purpose: the date grid of results (a people × dates
  matrix with its best column lit — `DataTable` is a list of records), the
  kind chips with their icons, the chunky answer controls.

- **Identity only from `member()`** (`member` of `page()`/`action()`); answers bind to it.
  Never accept a member id from a form (see Rallly's vote IDOR). With
  `members.groups` its `groups` (and `members.*`'s) are every group the
  member is in; without it, only those that give Polls.
- **Members are told with notifications, never by email** (the owner's
  decision of 6 October 2026): `notice()` in `src/lib/notify.ts` writes
  English with the other languages as `translations`. `mail.send` is for
  guests (people outside the company) only.
- **A poll someone may not see is `not_found`**, never `forbidden`.
- **Per team, counts only.** `group_tallies` holds counts per group, never
  a text, a member or a time; groups of fewer than 5 members are not
  counted; shown only through `visibleTeams` (never lower its floor or drop
  the subtraction rules). A company survey (repeat, eNPS) is checked with
  `surveys()` on create and on a draft's update, not only in the UI.
- **Guests** answer only through `src/lib/guests.ts`: the link opens a named
  date poll; a guest is a participant `guest` (never a member id); their
  secret's hash only; the public page never shows other answers or the
  team's names; the public action is guarded by the package's `bound`
  (its form token, `<Honeypot />` in the form, counts a day: see
  `@argentic/chest-app`'s AGENTS.md). Counts of members (`x of y answered`) exclude guests.
- **Replies** never tie a member to a text: no member id or time in
  `texts` or on an author's reply; `src/lib/replies.ts` reads keys and keeps
  nothing of the request; conversations only for managers and key holders.
- **Anonymous means no link.** Never add a member id, a time, a sequence or
  anything orderable to `tallies` or `texts`; never join `participants` to
  them; keep the whole-poll rewrite in one transaction; show results only
  once closed and from five answers, to everyone (organiser and admins
  included); never reopen a closed anonymous poll; never list participants
  of an anonymous poll; no comments, no place limits on it. `test/answers.test.ts` checks the
  row stamps.
- **Telling many people** goes through `src/lib/tell.ts`: one key per poll and
  kind (`poll:<id>:ask`, `poll:<id>:final`), so telling again replaces; a
  lease so two passes never tell at once; the cursor kept when the quota
  stops it.
- **Closing is evaluated on read** (`closeDue`): no feature may depend on the
  schedule to be correct, only to be on time.
- **Words** live in `src/i18n/en.ts` and `fr.ts` (same keys, tested; the
  kit's words under `kit`); dates are written on the server (`src/lib/dates.ts`
  on the Chest's clock, `f` for numbers, lists, plurals), never in an island.
