# Adapting Hiring — a guide for AI agents

`README.md` says what Hiring does; this page says where things are and what
must not break.

## Map

The stack is the studio's starter: Hono, React rendered on the server, a
few islands in the browser, Vite; the machinery is the package
`@argentic/chest-app` (`vendor/`; its own `AGENTS.md` in
`node_modules/@argentic/chest-app/` is the reference: pages, actions,
islands, refresh, fields, words, bounds, tests).

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest, contract 0.4 (roles `recruiter`, `interviewer`; public part; `schedules`: `cleanup`, `outbox`, `morning`; `build.static: ["/assets/"]`) and the proposals it uses (`mail` with the `jobs` mailbox, `calendar`, `files.publicUploads`/`publicFiles`, `emits`, `receives`, tile translations) |
| `vendor/` | SDK 0.4.1 + studio proposals (0.4.1-studio.4), the UI kit (0.2.6-studio.1), `@argentic/chest-app` (0.1.0-studio.6): packed copies, never edited (`scripts/add-*.mjs` of the studio replace them) |
| `src/app.tsx` | **Every route**: `createApp({…})` (actions, islands, words, layouts, the look), the team's pages through `team()` (a member without a role sees why; due emails flushed `after()`), page versions (`/chest`, a board, a candidate: a refresh without change is a 304), downloads (job CSV, a candidate's data, the export, `.ics`), the public pages, feeds, `/chest-events`, `/chest-schedules`, `/chest-mail`; the exported `fetch` adds `X-Robots-Tag` to `/chest` and `/interview`, and `no-store` + no referrer to `/interview` |
| `src/actions.ts` | **Every mutation**, by name, with its fields (`field.*`): the team's (`action`) and the public part's (`publicAction` with `bound` budgets: `publicCvUpload`, `apply`, `chooseTime` — `charge("choose", {subject: link})`); rights are checked before anything is written; notifications and badges `after()` |
| `src/pages/` | Pages rendered on the server: `jobs.tsx`, `job.tsx` (board, write a job, its settings, add, import), `candidate.tsx` (with the conversation and feedback, rendered on the server), `lists.tsx` (search, pool, reports, mail to file), `settings.tsx`; public: `careers.tsx` (careers page, job with its JSON-LD — the one `dangerouslySetInnerHTML`, a test holds it so —, apply, thanks), `interview.tsx`, their frame `public-shell.tsx` |
| `src/islands/` | What runs in the browser (`index.ts` lists them): `BoardView` (dnd-kit; optimistic place over the served one; stages are the only drop targets; ids from the job, never dnd-kit's counter), `JobActions`, `JobForm`, `JobSettingsView`, `AddForm`, `ImportView`, `CandidateActions`, `FeedbackForm`, `Interviews`, `Notes`, `SettingsView`, `SearchBox`, `AutoRefresh` (the package's `useAutoRefresh`, 30 s, never polling of its own); public: `ApplyForm`, `TimePicker` (both work without JavaScript: a plain form, `Honeypot`). An island's wrapper is `#island-<id>`; its props are bounded (counts and pages, never a whole list) |
| `src/components/` | Shared by pages and islands, browser-safe: icons, mark, rich text, the description editor, the hire dialog, reasons, copy button, `use-work.ts`, `upload.ts` (team uploads with a signed ticket; a visitor's CV to the Chest, which returns a claim) |
| `src/shared/` | Pure modules the browser needs too: `model.ts` (bounds, lists, checks, slugs, CV types and first-bytes sniffing), `stages.ts`, `rich-text.ts`, `time.ts`, `csv.ts`, `import-map.ts`, `unzip.ts`, `facts.ts`, `app-error.ts`, and **`format.ts`: the only place that makes `Intl` objects**, each made once (a test refuses `new Intl.` anywhere else); dates in the reader's zone, with the year when it is not this year |
| `src/i18n/` | Every word: `en.ts` (source; `kit` holds the UI kit's words), `fr.ts`; `index.ts` (languages, `words`) |
| `src/layout.tsx` | The members' shell (`AppShell`, search, 30 s refresh, notice, toasts with a stable id, `NoAccess` without a role), the public layout (careers pages draw their own frame; error pages get a plain one); both mark the page with where its look comes from (`data-look`) |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity (*Magazine*: the catalogue's, `identityOf("hiring")`; its `source` only makes the careers accents and a test holds it equal — change Magazine in `ui/src/themes.ts` first), the careers accents (`accentThemes`, `accentCss`), the sheet of each surface (`sheetOf`: the team's from `chest.theme()`, the public one from the brand or the identity in Settings' accent; kept per answer of the Chest); Hiring's tokens (aliases of contract tokens); its styles (contract tokens and classes only) |
| `src/lib/access.ts` | Who may do what; `jobAccess` (recruiter: all jobs; interviewer: jobs they are on — others are `not_found`) |
| `src/lib/jobs.ts` | Settings, jobs, stages, interviewers, the careers page's reads |
| `src/lib/candidates.ts` | Applications, the board (`boardLimits`: 40 per stage, 400 more of one, 100 rejected; counts whole), moves (row locks), rejections, notes, feedback (and its visibility rule), erasure, retention, export, the tile's counts |
| `src/lib/cv.ts`, `src/lib/signature.ts` | CVs: a team upload (tool-named file + signed ticket → `accept`); a visitor's (`publicGrant` → `files.publicUploadUrl`, then `take(claim)` → `files.claim`); both `keep()`: stat, type, size, first bytes, moved to the candidate's folder |
| `src/lib/downloads.ts` | A CV (inline in a sandbox, or attachment), a file an email brought (recruiters, always attachment), a brand image for Settings — streamed, two in flight per server (503 + `Retry-After` beyond), never read twice |
| `src/lib/mailer.ts`, `src/lib/messages.ts`, `src/lib/outbox.ts`, `src/lib/mail-state.ts` | Sending through the `jobs` mailbox with the candidate's thread (`c<id>`); the conversation, the queue (a rejection waits `undoSeconds`), templates and their files, emails to file; `outbox` sends what is due (keyed `message:<id>:<address>`) then the calendars; the mail state (`mailStateKept`: a minute, for public pages) |
| `src/lib/mail-in.ts` | Received emails: matched by thread, references, then an authenticated address; bounces |
| `src/lib/self-schedule.ts`, `migrations/0004_self_scheduling.sql` | The candidate chooses the interview time: a link (secret stored as SHA-256, `?lang=` the candidate's language unless they switched), free times by the people's Hiring interviews, Booking's busy times and Leave's days off, lunch left out, `choose` under `lock table interview_requests`, then the same invitation as `interviews.ts` |
| `src/lib/interviews.ts` | Interviews, busy times, the `.ics`, the interviewers' Chest calendars (`flushCalendars`), times in the Chest's zone |
| `src/lib/reach.ts`, `src/lib/public-feed.ts` | JobPosting JSON-LD, Indeed XML, RSS, sitemap — pure writers (their routes in `src/app.tsx`) |
| `src/lib/import.ts`, `src/lib/export-all.ts`, `src/lib/zip.ts` | Importing rows; export everything (streamed ZIP), a candidate's own data |
| `src/lib/reports.ts` | Counts for the reports |
| `src/lib/brand.ts`, `src/lib/careers.ts` | The careers page's logo and photos (public files, `files.publicPath`), accent, intro per language |
| `src/lib/tell.ts`, `src/lib/notify.ts` | Bell and tile |
| `src/lib/share.ts`, `src/lib/busy-snapshot.ts` | `hiring.hired` / `hiring.hire_cancelled` for People; `hiring.busy` (a member's interviews, times only) for Booking; `booking.busy` and `leave.busy` heard (`takeBusy` → `told_busy`, `told_spans`) — README "With the other tools"; never add application data to them |
| `src/lib/lifecycle.ts` | Members leaving or erased (each event handled once: the package's `seen`, table `chest_seen`) |
| `src/lib/people.ts`, `src/lib/team.ts`, `src/lib/countries.ts` | Members' names at render (former, without access); the members who have the tool, for pickers; countries in the reader's language |
| `src/lib/public-origin.ts` | The Chest's addresses (`chest.tool.publicUrl`, `teamUrl`): every link written for people outside |
| `src/lib/db.ts` | The package's `db()` (the unit tests hand it their connection) |
| `migrations/` | Never edited once shipped; `0006_chest.sql` adds `chest_seen` and `chest_bounds` (the package's) |
| `test/` | `app.test.mjs` (the built server: routes, policy, pages, public actions and their bounds, downloads, events, schedules, versions), `stack.test.ts` (the package's `checkSources`, `checkWords`; purity of `src/shared` and `src/components`; one JSON-LD; no `new Intl.` outside `format.ts`), `pieces.test.ts`, the services' tests; `support/db.ts` (the package's `testDatabase`: PGlite with `pg_trgm`, `unaccent`, `btree_gist`, or `TEST_DATABASE_URL`), `support/app.ts` (the built app) |

## Commands

```sh
npm ci && npm run build && npm test   # all three must pass (and TEST_DATABASE_URL=… npm test)
```

## Rules

- **Public pages** resolve their look with `lookOf("public")` (brand or
  identity, never a catalogue theme); decoration is keyed on `--decor`.
  With a Chest brand, Settings hides Hiring's own colour and logo.
- **Looks**: CSS names only contract tokens (`ui/tokens/CONTRACT.md`) and
  the tool tokens of `src/tokens.css` — never a colour, never a `style`
  attribute (`test/theme.test.ts`, `checkSources`); what varies with the
  data is a class (`.bar.w-N`, `.photos.n-N`, `.score.s-N`). A colour
  belongs in `src/theme.ts`. Text only on
  measured pairs (`--accent-ink` on `--accent`, `--cat-3-ink` on
  `--cat-3-soft`, `--ok-ink` on `--ok-soft`…). Weights from
  `--display-weight` / `--weight-strong`.
- **Kit components first** (`@argentic/chest-ui/components`): Toasts
  (`useToast`: `undo` that resolves true or a sentence; `sent: true` once
  an email left — the rejection toast turns into "sent" when its Undo is
  over), Dialog (with `dirty` for typed forms), Confirm (irreversible
  only), PeoplePicker, DateField, TimeSelect, FilePicker, SearchBox,
  EmptyState, Avatar, StatusBadge, Segmented, AppShell, PageHeader,
  NoAccess, BrandMark, LanguageSwitch. Links are plain `<a>`; an island
  moves with `navigate()` and speaks with `toast()`
  (`@argentic/chest-app/client`: each island is a React root of its own);
  refresh is the package's (`useAutoRefresh`, `refresh()`), never a timer
  of the tool's. A company logo is sized by the kit (`--ck-logo-max`),
  never by the tool's CSS. Their words come from the catalogues' `kit`
  section. Never `window.confirm`/`prompt`, never `type="date"`/`"time"`.
- **Words**: `node scripts/lint-words.mjs tools/public-and-private/hiring`
  stays at 0 (store glossary: Undo « Annuler l’action », narrow no-break
  spaces in French).

- Identity only from the package's viewer (the SDK's `member(request)`);
  store `mbr_…` ids, names at render (`src/lib/people.ts`). Candidates are not members:
  never use their email as identity.
- Every service checks rights first; an interviewer never moves, rejects,
  notes, erases, exports or changes settings; a job they are not on is
  `not_found`.
- Feedback of others is hidden from an interviewer until they gave theirs
  (`candidate()` and `board()` ratings). Keep it that way.
- A team upload is accepted only with the tool's signed ticket; a
  visitor's only through the Chest's claim; either file is checked (type,
  size, first bytes) before it is kept.
- The public part never calls the Chest per request (the look, the mail
  state are kept a minute), never lists members, and every public action
  is bounded (`bound`: per visitor by a cookie key, per day, per interview
  link; no visitor address is ever needed).
- Personal data never in a log, a URL, the feeds or the JSON-LD. CVs are
  served only to who sees the candidate, two at a time per server.
- Nothing personal in public URLs (the thank-you page shows no name), in
  the feeds or in the JSON-LD (jobs only).
- Emails to candidates go through `messages.queue` and the outbox, never
  `mail.send` directly: a rejection must stay undoable until it leaves.
- Interviewers never see the conversation; `busy` gives times only.
- Busy times from another tool (`told_spans`) count wherever free times
  are computed (`freeTimes`, `busy`), and are never told again
  (`hiring.busy` carries only Hiring's own interviews).
- A file sent to a candidate is the email's own copy (`sent/`): delete it
  with the candidate (`forget`); a template's files (`templates/`) go
  only by `sweepTemplateFiles`, so Undo of a deleted template works.
- A received email is attached to a candidate by its thread or references;
  by its From address only when `authenticated`.
- Words only in `src/i18n/en.ts` and `fr.ts` (same keys; tests check);
  services return codes.
- Migrations that shipped are never edited: add `0002_…`.
- Anything the Chest does not give goes through the SDK working copy's
  proposals, caught when absent — never faked inside the tool.
