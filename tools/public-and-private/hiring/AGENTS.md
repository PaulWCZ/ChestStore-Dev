# Adapting Hiring — a guide for AI agents

`README.md` says what Hiring does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (roles `recruiter`, `interviewer`; public part) and the proposals it uses (`mail` with the `jobs` mailbox, `calendar`, `files.publicUploads`/`publicFiles`, `schedules` cleanup/outbox/morning, `emits`, tile translations) |
| `lib/access.ts` | Who may do what; `jobAccess` (recruiter: all jobs; interviewer: jobs they are on — others are `not_found`) |
| `lib/model.ts` | Bounds, lists (contracts, reasons…), email/link/phone checks, slugs, CV types and first-bytes sniffing — pure |
| `lib/rich-text.ts`, `components/rich-text.tsx` | The job description's marks → blocks → React (never HTML) |
| `lib/jobs.ts` | Settings, jobs, stages, interviewers, the careers page's reads |
| `lib/candidates.ts` | Applications, the board, moves, rejections, notes, feedback (and its visibility rule), erasure, retention, export, the tile's counts, the form's fallback counters |
| `lib/cv.ts`, `lib/upload.ts`, `lib/signature.ts` | CV uploads: grant (tool-named file + signed ticket), browser PUT, accept (signature, stat, type, size, first bytes, move to `cv/`), sweep |
| `lib/guard.ts` | The public form's guard (SDK `visitors`, fallback to `form_counts`) |
| `lib/stages.ts` | A stage's name for its reader: the team's word, or the default key in the reader's language (never store a default name) |
| `lib/mailer.ts` | Sending through the `jobs` mailbox with the candidate's thread (`c<id>`); the drafts' words |
| `lib/messages.ts` | The conversation (out and in), the queue (a rejection waits `undoSeconds`), templates, emails to file |
| `lib/outbox.ts` | Sends what is due (claimed, keyed `message:<id>`), then the calendars; called by the team layout, actions and the `outbox` schedule |
| `lib/mail-in.ts`, `app/chest-mail/route.ts` | Received emails: matched by thread, references, then an authenticated address; bounces |
| `lib/interviews.ts`, `lib/time.ts` | Interviews, busy times, the `.ics`, the interviewers' Chest calendars (`flushCalendars`), times in the Chest's zone |
| `lib/reach.ts`, `lib/public-feed.ts`, `app/jobs.xml`, `app/feed.xml`, `app/sitemap.xml`, `app/robots.txt` | JobPosting JSON-LD, Indeed XML, RSS, sitemap — pure writers and their routes |
| `lib/import-map.ts`, `lib/import.ts`, `lib/unzip.ts` | Reading another tool's CSV (guessing columns), importing rows, CVs from a ZIP in the browser |
| `lib/export-all.ts`, `lib/zip.ts` | Export everything (streamed ZIP), a candidate's own data |
| `lib/reports.ts` | Counts for the reports |
| `lib/brand.ts`, `lib/careers.ts` | The careers page's logo and photos (public files), accent, intro per language |
| `lib/tell.ts`, `lib/notify.ts` | Bell and tile |
| `lib/share.ts` | `hiring.hired` / `hiring.hire_cancelled` for People (events between tools; README "With the other tools") — never add application data to them |
| `lib/lifecycle.ts` | Members leaving or erased |
| `app/page.tsx`, `app/[slug]/…`, `app/api/cv`, `app/public-actions.ts` | The public part (anonymous) |
| `app/chest/…`, `app/chest/actions.ts` | The team's part |
| `app/chest-jobs/[name]/route.ts`, `app/chest-events/route.ts` | Deliveries from the Chest (signed) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
TEST_DATABASE_URL=postgres://… npm test
```

## Rules

- Identity only from `member(request)` (`lib/session.ts`); store `mbr_…`
  ids, names at render (`lib/people.ts`). Candidates are not members:
  never use their email as identity.
- Every service checks rights first; an interviewer never moves, rejects,
  notes, erases, exports or changes settings; a job they are not on is
  `not_found`.
- Feedback of others is hidden from an interviewer until they gave theirs
  (`candidate()` and `board()` ratings). Keep it that way.
- A public upload is claimed only with the tool's signed ticket, and the
  file is checked (type, size, first bytes) before it is kept.
- Nothing personal in public URLs (the thank-you page shows no name), in
  the feeds or in the JSON-LD (jobs only).
- Emails to candidates go through `messages.queue` and the outbox, never
  `mail.send` directly: a rejection must stay undoable until it leaves.
- Interviewers never see the conversation; `busy` gives times only.
- A received email is attached to a candidate by its thread or references;
  by its From address only when `authenticated`.
- Words only in `lib/i18n/en.ts` and `fr.ts` (same keys; tests check);
  services return codes.
- Migrations that shipped are never edited: add `0002_…`.
- Anything the Chest does not give goes through the SDK working copy's
  proposals, caught when absent — never faked inside the tool.
