# Adapting Forms — a guide for AI agents

`README.md` says what Forms does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (roles `manager`, `creator`, `member`; public part) and the proposals it uses (`mail`, `files.publicUploads`, `schedules` bell/cleanup, tile translations) |
| `lib/access.ts` | Roles, abilities, a member's level on a form (`owner`, `editor`, `viewer`) — others are `not_found` |
| `lib/model.ts` | Browser-safe: the shape of a form (pages, questions, conditions, jumps), limits, `definition()` (structure, always), `problems()` (what blocks publishing), settings, ids, file types and first-bytes sniffing |
| `lib/logic.ts` | Browser-safe: the logic engine — `walk()` (pages visited, questions asked), `read()` (one answer by kind), `check()` (what the server keeps), `prefill()`, `answerText()` |
| `lib/forms.ts` | Forms: open (with level), list, team forms, create, save draft (revision), publish (versions), discard, close/reopen, settings, share, duplicate, delete/restore |
| `lib/answers.ts` | Taking an answer (`submit`: version, files, limit, once, anonymity rewrite), reading, filters, delete/restore, find and erase a person, retention cleanup |
| `lib/respond.ts` | The one path from a respondent's page: `take()` = submit + copy by email + bell |
| `lib/uploads.ts`, `lib/upload-client.ts`, `lib/signature.ts` | Files: grant (public claim / team signed ticket), browser PUT, accept (claim, type, size, first bytes, move to `answers/<form>/`), sweep, signed links |
| `lib/guard.ts` | The public form's guard (SDK `visitors`, fallback to `form_counts`) |
| `lib/tell.ts`, `lib/notify.ts` | The bell (batched, keyed `answers:<form>`), badges, the team broadcast |
| `lib/mailer.ts` | The copy of an answer (mail proposal) |
| `lib/alerts.ts` | New answers by email to the people told, in the bell's batches (`mailed_at`) |
| `lib/answered.ts` | `forms.answered` for the other tools (events between tools); never anonymous |
| `lib/images.ts` | Covers and picture-choice pictures: grant, check, publish under `public/`, addresses, sweep |
| `lib/embed.ts`, `lib/settings.ts` | The websites allowed to frame the public forms (proxy.ts), the tool's settings table |
| `lib/importer.ts` | Google Forms / Typeform definitions → a draft (pure) |
| `lib/zip.ts` | A streaming ZIP writer (the "Everything (ZIP)" export) and a reader for tests |
| `lib/leave-guard.ts` | Unsaved changes are saved before the tool's tabs and links leave (builder, settings) |
| `lib/theme.ts` | Forms' identity (`defineTheme`, "Invitation") and `currentLook()`: the look the Chest chose, else the identity; `ownLook()` |
| `app/tokens.css` | Forms' own tokens, made of contract tokens only: sizes, the kinds' colours, the marigold, **a form's colour** (`[data-accent]` → `--form*`) |
| `components/guarded-link.tsx` | The link of the kit's tabs inside a form: saves what waits before leaving |
| `components/state-badge.tsx` | A form's state and an answer's follow-up as the kit's `StatusBadge` |
| `lib/summary.ts`, `lib/export.ts`, `lib/csv.ts` | Summary per question across versions, NPS; CSV rows and the formula-safe writer |
| `lib/templates.ts` | Templates; their words are in the catalogues (`templates.*`) |
| `lib/lifecycle.ts` | Members leaving or erased |
| `components/runner.tsx` | The respondent's form (public page, team page, builder preview) |
| `app/[slug]`, `app/public-actions.ts`, `app/api/upload` | The public part (anonymous visitors) |
| `app/chest/(work)/…`, `app/chest/actions.ts` | The team's part: home, templates, the form's tabs, privacy |
| `app/chest/f/[slug]` | A team form, answered in the Chest |
| `app/chest-jobs/[name]`, `app/chest-events` | Deliveries from the Chest (signed) |

## The UI kit (`@argentic/chest-ui` 0.2.1-studio.1, `vendor/`)

Used: `AppShell`, `BrandMark`, `NoAccess`, `Toasts`/`useToast` (Undo for
deleting a question, a page, an answer, a form, taking someone off a
form, closing/reopening; `sent` once a bell item left), `Dialog` (the form
is live), `Confirm` (erasing a person's answers), `Tabs` (a form's tabs,
answers/summary), `Segmented`, `PeoplePicker` (sharing), `DateField`
(closing day, answers' days, a share link's prefill, the date question),
`TimeSelect` (closing hour), `FilePicker` (the file question, importing a
form), `DataTable` (answers, a person's answers), `Filters` (where an
answer stands), `SearchBox`, `EmptyState`, `Avatar`, `StatusBadge`,
`LanguageSwitch`, `useAutoRefresh`. Words: the kit's sections in the
catalogues (`toast`, `dialog`, `peoplePicker`, `date`, `files`, `table`,
`filters`, `search`), checked by `node scripts/lint-words.mjs`.

Kept on purpose: the runner's own choice pills, stars, scales, matrix and
ranking (the product's heart, in the form's colour); the picture slot of a
picture-choice option and the cover picker (a thumbnail, stored at once);
the privacy lookup form (at least 3 characters, a *Find* button); the
first-visit card (three templates in one click).

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
TEST_DATABASE_URL=postgres://… npm test
```

## Rules

- Identity only from `member(request)` (`lib/session.ts`); store `mbr_…`
  ids, names at render (`lib/people.ts`). A public respondent is never a
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
- Every page saves by itself (one model): a new editing page registers
  its flush with `holdLeaving` and links go through `GuardedLink` (the
  kit's `Tabs` take it as `link`).
- CSS names only contract tokens and `app/tokens.css`'s own; never a
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
- Words only in `lib/i18n/en.ts` and `fr.ts` (same keys; tests check);
  services return codes. The CSV separator is a catalogue word.
- Migrations that shipped are never edited: add `0003_…` (`0002_follow_up.sql`: follow-up, email alerts, events, cover, settings).
- Anything the Chest does not give goes through the SDK working copy's
  proposals, caught when absent — never faked inside the tool.
