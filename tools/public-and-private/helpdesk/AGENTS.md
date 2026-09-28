# Adapting Support — a guide for AI agents

`README.md` says what Support does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (roles `admin`, `agent`, `viewer`; public part) and the proposals it uses (`mail`, `schedules`) |
| `lib/access.ts` | Who may do what |
| `lib/model.ts` | Bounds, statuses, folders, email check, `[#number]` in subjects — pure |
| `lib/tickets.ts` | The service: public form, follow-up link, email filing, inbox, answers, notes, assignment, saved replies, settings, erasure, cleanup |
| `lib/form-token.ts` | The form's signed "shown at" time |
| `lib/mailer.ts` | Confirmation and replies through the Chest's mail, falling back to the page |
| `lib/tell.ts` | Bell and tile for those who answer |
| `lib/lifecycle.ts` | Members leaving or erased |
| `lib/public-origin.ts` | The public host's address; the visitor's key |
| `app/page.tsx`, `app/t/[secret]/`, `app/public-actions.ts` | The public part (anonymous) |
| `app/chest/…`, `app/chest/actions.ts` | The team's part |
| `app/chest-mail/route.ts`, `app/chest-jobs/[name]/route.ts`, `app/chest-events/route.ts` | Deliveries from the Chest (signed) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **The public part never shows a note, another customer's request, or a
  member's full name** — only what the visitor's own link opens, and
  agents' first names. Public actions hold no member: keep them so.
- **The follow-up secret is shown once** (the redirect after the form, the
  confirmation email) and only its SHA-256 is stored. Never log it.
- **Customers are data subjects**: anything new you store about them must
  be deleted by `eraseCustomer` and by `cleanup`.
- **Email is optional**: every path must work when `mail.send` throws
  `CapabilityNotGranted` (delivery `page`).
- Identity from `member()` only; rights in `lib/access.ts`; words in every
  catalogue; client components never import the SDK or `lib/db.ts`.
