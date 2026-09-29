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
| `lib/brand.ts` | The company's logo from `chest.theme()` |
| `lib/summary.ts`, `lib/export.ts`, `lib/csv.ts` | Summary per question across versions, NPS; CSV rows and the formula-safe writer |
| `lib/templates.ts` | Templates; their words are in the catalogues (`templates.*`) |
| `lib/lifecycle.ts` | Members leaving or erased |
| `components/runner.tsx` | The respondent's form (public page, team page, builder preview) |
| `app/[slug]`, `app/public-actions.ts`, `app/api/upload` | The public part (anonymous visitors) |
| `app/chest/(work)/…`, `app/chest/actions.ts` | The team's part: home, templates, the form's tabs, privacy |
| `app/chest/f/[slug]` | A team form, answered in the Chest |
| `app/chest-jobs/[name]`, `app/chest-events` | Deliveries from the Chest (signed) |

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
  its flush with `holdLeaving` and links go through `NavLink`.
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
