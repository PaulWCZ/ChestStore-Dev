# Adapting Hiring — a guide for AI agents

`README.md` says what Hiring does; this page says where things are and what
must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (roles `recruiter`, `interviewer`; public part) and the proposals it uses (`mail`, `files.publicUploads`, `schedules`, tile translations) |
| `lib/access.ts` | Who may do what; `jobAccess` (recruiter: all jobs; interviewer: jobs they are on — others are `not_found`) |
| `lib/model.ts` | Bounds, lists (contracts, reasons…), email/link/phone checks, slugs, CV types and first-bytes sniffing — pure |
| `lib/rich-text.ts`, `components/rich-text.tsx` | The job description's marks → blocks → React (never HTML) |
| `lib/jobs.ts` | Settings, jobs, stages, interviewers, the careers page's reads |
| `lib/candidates.ts` | Applications, the board, moves, rejections, notes, feedback (and its visibility rule), erasure, retention, export, the tile's counts, the form's fallback counters |
| `lib/cv.ts`, `lib/upload.ts`, `lib/signature.ts` | CV uploads: grant (tool-named file + signed ticket), browser PUT, accept (signature, stat, type, size, first bytes, move to `cv/`), sweep |
| `lib/guard.ts` | The public form's guard (SDK `visitors`, fallback to `form_counts`) |
| `lib/mailer.ts` | Confirmation and rejection emails (mail proposal; `none` without it) |
| `lib/tell.ts`, `lib/notify.ts` | Bell and tile |
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
- Nothing personal in public URLs (the thank-you page shows no name).
- Words only in `lib/i18n/en.ts` and `fr.ts` (same keys; tests check);
  services return codes.
- Migrations that shipped are never edited: add `0002_…`.
- Anything the Chest does not give goes through the SDK working copy's
  proposals, caught when absent — never faked inside the tool.
