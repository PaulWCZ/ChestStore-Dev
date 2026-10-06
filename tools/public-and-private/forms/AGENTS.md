# Adapting Forms — a guide for AI agents

`README.md` says what Forms does; this page says where things are and what
must not break.

## Map

How the tool is built — pages, islands, actions, words, the database,
tests, recipes, rules of the stack — is
`node_modules/@argentic/chest-app/AGENTS.md` (the studio's package, Hono +
React rendered on the server, islands, Vite): read it first. Forms' own:

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | The manifest (contract 0.4: roles `manager`, `creator`, `member`; the public part; the schedules `bell` and `cleanup`; `/assets/` static) and the SDK proposals it uses (`mail`, `files.publicUploads`/`publicFiles`, events between tools, webhooks, the tile's French) |
| `src/app.tsx` | Every route: the team's pages (`members()`: the database, the language, the zone; a role is needed), the public ones (`visitors()`), page versions for a cheap refresh (`lib/versions.ts`), the CSV and ZIP downloads (`/export`, `/archive`), a file's signed link, `/chest-events`, `/chest-schedules`, `/chest-webhooks`; `framed()` names the company's websites in a public form's `frame-ancestors` |
| `src/actions.ts` | Every change, by name (`call("publishForm", …)` from an island), its fields checked at the boundary, the rights read before any write; the two public ones (`answerPublic`, `visitorUpload`) are `bound` (budgets per visitor, per form, per day; a time floor; the honeypot) and charged only once the answer is valid |
| `src/pages/` | The pages, rendered on the server: `Home`, `New` (templates, import), `Trash`, `Privacy`, `Sent`, a form's tabs in `form-frame.tsx` (`Build`, `Share`, `Settings`, `Answers`, `Summary`, `Answer`), `Respond` (the public form, the team form, the public host's root) |
| `src/islands/` | What runs in the browser (`index.ts` lists them): `Builder`, `Runner` (the respondent's form, also the builder's preview), `Settings`, `Share`, `AnswersTable` (cards on a phone), `AnswersFilters` (behind one button on a phone), `ColumnsPick`, `AnswerActions`, `FollowUp`, `ImportForm`, `EraseForm`, `Picker`, `StatusControl`, `FormTitle`, `KeepInView`, `AutoRefresh` (the package's `useAutoRefresh`: on focus only), `ToastHost` |
| `src/components/` | Shared by pages and islands: icons, the mark, state badges, the copy button, the web addresses' box, the respond frame |
| `src/shared/` | Browser-safe and pure: `model.ts` (a form's shape, limits, `definition()`, `problems()`, file types and first-bytes sniffing), `logic.ts` (`walk()`, `read()`, `check()`, `prefill()`, `answerText()`), `summary.ts` (`summarise()` of the database's counts, NPS, columns), `format.ts` (**the only place an `Intl` object is made**, cached; a year shown only when not this year), `zone.ts`, `leave.ts` (unsaved changes saved before a link leaves; `sendOnLeave` when the page goes), `upload-client.ts` (grant, PUT with progress) |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts` (same keys); the kit's words (`kit`) |
| `src/register.ts`, `main.ts`, `entry.tsx`, `layout.tsx` | The package's register (words, actions, islands, the layout's data), the server's start, the browser's entry, the two layouts (team: `AppShell`; public: the form's own frame) |
| `src/tokens.css`, `src/styles.css`, `src/lib/theme.ts` | Forms' identity "Invitation" (`identityOf("forms")`), `teamLook()`/`publicLook()` served as `/chest/look.css` and `/look.css`; the tool's own tokens, made of contract tokens; a form's colour (`[data-accent]` → `--form*`) |
| `src/lib/access.ts`, `creators.ts` | **Who may do what** — roles, a member's level on a form (`owner`, `editor`, `viewer`; others `not_found`), who may create |
| `src/lib/forms.ts` | Forms: open (with level), list, team forms, create, save draft (revision), publish (versions), discard, close/reopen, settings, share, duplicate, delete/restore |
| `src/lib/answers.ts` | Taking an answer (`submit`: version, files, limit, once, the anonymous rewrite in one statement), reading (neighbours by window), filters, follow-up under a row lock, delete/restore, find and erase a person, retention cleanup |
| `src/lib/stats.ts`, `export.ts`, `csv.ts`, `downloads.ts` | The summary's counts in SQL (`answerStats`), a bounded sample of anonymous texts; CSV rows (formula-safe, `;` in French), the CSV and the ZIP streamed by batches of 500 |
| `src/lib/respond.ts` | The one path from a respondent's page: `take()` = submit + events + web addresses + copy by email (none when Support took it: `supportConfirms`) + `answers.sent` + bell |
| `src/lib/uploads.ts`, `signature.ts`, `images.ts` | Files: grant (public claim via `files.publicUploadUrl` / team signed ticket), accept (claim, type, size, first bytes, move to `answers/<form>/`), sweep, signed links; covers and pictures (`files.publicPath`) |
| `src/lib/tell.ts`, `notify.ts`, `mailer.ts`, `alerts.ts` | The bell (batched, keyed `answers:<form>`), badges, the copy of an answer, new answers by email |
| `src/lib/answered.ts`, `routes.ts`, `linked.ts` | Publishing to the other tools (`forms.answered`, `forms.contact`, `forms.request`; never anonymous, never blocks an answer), the author's mapping (contract v1), which receivers are installed and linked (`chest.tools.get`, `events.receivers`) |
| `src/lib/hooks.ts` | Each answer to web addresses (Proposal webhooks): add/remove/retry, `told()` on `webhook.disabled` |
| `src/lib/embed.ts`, `settings.ts`, `public-origin.ts` | The websites allowed to frame the public forms; the tool's settings; the two hosts' addresses (`chest.tool.publicUrl`/`teamUrl`, never built by hand) |
| `src/lib/importer.ts`, `templates.ts`, `lifecycle.ts`, `people.ts`, `versions.ts` | Google Forms / Typeform → a draft (pure); templates; members leaving or erased; names from the Chest (`no_access`, `erased`); page versions |
| `migrations/` | 0001 to 0005 (`0005_chest.sql`: the package's `chest_bounds` and `chest_seen`): never edit one that shipped |
| `test/` | The services (`*.test.ts` on a real database or PGlite), the built server (`app.test.mjs`), the scale test (`scale.test.ts`: 10,000 answers, the server in its own process, peak memory from `/proc`), the stack's rules (`sources.test.ts`); `support/` |
| `seed/sample.sql`, `docs/` | Sample forms of the studio's cast; screens (`docs/screens.json`) |

## The UI kit (`@argentic/chest-ui` 0.2.6-studio.1, `vendor/`)

Used: `AppShell`, `BrandMark`, `NoAccess`, `Dialog` (the form is live),
`Confirm` (erasing a person's answers), `Tabs` (a form's tabs,
answers/summary), `Segmented`, `PeoplePicker` (sharing), `DateField`
(closing day, answers' days, a share link's prefill, the date question),
`TimeSelect` (closing hour), `Switch` (every on/off of the builder and the
settings: they save at once), `FilePicker` (the file question, importing a
form), `DataTable` (answers, a person's answers), `Filters` (where an
answer stands), `SearchBox`, `EmptyState`, `Avatar`, `StatusBadge`,
`LanguageSwitch`, `putWithProgress`. Toasts (with Undo) and the refresh on
focus are the package's (`toast`, `useAutoRefresh` from
`@argentic/chest-app/client`). The identity is the catalogue's
`identityOf("forms")` (`src/lib/theme.ts`, held equal by
`test/theme.test.ts`). The kit's words are the catalogues' `kit` section,
checked by `node scripts/lint-words.mjs`.

Kept on purpose: the runner's own choice pills, stars, scales, matrix and
ranking (the product's heart, in the form's colour); the answers' "where"
filter as a `<select>` with one group per question (`Filters`' select has
no option groups) and its own "Clear filters" (it keeps the chosen
columns); the answers' two days as two `DateField`s; the picture slot of a
picture-choice option and the cover picker; the privacy lookup form (at
least 3 characters, a *Find* button); the first-visit card (three templates
in one click). Bars and shares are SVG and classes (`share-0`…`share-10`):
the strict CSP allows no inline style.

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass (tests run on PGlite)
TEST_DATABASE_URL=postgres://… npm test   # on PostgreSQL, with the scale test
npm run dev                               # scripts/dev.mjs: Vite and the server
```

## Rules

- **Events to other tools keep their contract** (README "With the other
  tools", `src/lib/routes.ts`, v1): add fields, never change or remove one;
  never for an anonymous form (`anonymous_no_routes` in the database); a
  new route is mapped by the author in Settings and tested with
  `chest.published`.
- **One message, one email**: no respondent copy for an answer Support
  took (`supportConfirms` in `src/lib/respond.ts`) — Support confirms it.
  Keep the rule in step with Support's README.
- Web addresses (`src/lib/hooks.ts`) get only what Settings says (the form,
  its questions and answers as text, a link, the email) — never a file,
  never an anonymous form's answer. The tool keeps only the target's id.

- Identity only from the package's `member` (the Chest's assertion); store `mbr_…`
  ids, names at render (`src/lib/people.ts`). A public respondent is never a
  member: never trust an id or email from a request as identity.
- Every answer is checked on the server by `check()` against **the
  version it answered**; answers to questions not asked are dropped. Never
  store what the browser sent without it.
- A version, once published, is never changed: add a new one. Question and
  option ids stay the same across versions (the table and summary match on
  them); `copyDefinition()` renames them for a new form.
- Anonymous forms: never add a member id, an address, a time finer than
  the month, or a file to an anonymous answer; keep the rewrite in random
  order and the floor of five (`limits.anonymousFloor`); never list one
  person's row (no table, no single answer, no row filter, no per-row CSV,
  no event, no answer content in an email). Tests in `test/answers.test.ts`
  and `test/followup.test.ts` guard it.
- Every page saves by itself (one model): a new editing island calls
  `guardLinks(waiting, flush)` and `sendOnLeave` (`src/shared/leave.ts`),
  so a link or a closed tab never loses what waits.
- The public part never asks the Chest per request (addresses, names,
  members are read where a member is), never lists members, and its two
  actions stay `bound`; a new public action is `bound` too.
- Exports and summaries stay bounded at 10,000 answers: counts in SQL,
  rows streamed by batches, island props bounded (`test/scale.test.ts`).
- CSS names only contract tokens and `src/tokens.css`'s own; never a
  colour (`test/theme.test.ts`). A form's colour is `--form`, `--form-ink`,
  `--form-text`, `--form-line`, `--form-soft`, `--form-ground`: text on
  a form's page uses `--form-text`, fills `--form` with `--form-ink`.
- Never `window.confirm`/`prompt`: reversible acts get Undo in a toast,
  irreversible ones the kit's `Confirm`.
- A form's second language only holds texts (`alt.texts`, keyed by what
  they translate); ids and logic are the form's own. `localize()` before
  rendering to a respondent, never before `check()`.
- The answer limit is taken in the same statement that counts the answer
  (`update … where answer_count < max_answers`); keep it there.
- A public upload is attached only through its claim (or the tool's
  signed ticket on a team form), and checked (type, size, first bytes).
- Words only in `src/i18n/en.ts` and `fr.ts` (same keys; tests check);
  services return codes. The CSV separator is a catalogue word.
- Migrations that shipped are never edited: add `0006_…` (`0005_chest.sql`: the package's tables; `0002_follow_up.sql`: follow-up, email alerts, events, cover, settings; `0003_routes.sql`: the links; `0004_sent_and_hooks.sql`: where an answer went, web addresses).
- Anything the Chest does not give goes through the SDK working copy's
  proposals, caught when absent — never faked inside the tool.
