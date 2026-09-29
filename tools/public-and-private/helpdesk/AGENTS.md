# Adapting Support — a guide for AI agents

`README.md` says what Support does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (roles `admin`, `agent`, `viewer`; public part) and the proposals it uses (`mail`, public uploads, `schedules`) |
| `lib/access.ts` | Who may do what |
| `lib/model.ts` | Bounds, statuses, folders, priorities, sorts, file types and limits, "waiting since" and the threshold, email check, `[#number]` in subjects — pure |
| `lib/tickets.ts` | The service: public form, follow-up link (and its files, following merges), email filing (`fromEmail`: thread, headers, then same vouched-for sender), bounces, inbox (filters, sorts), answers, notes, assignment, priority, tags, merge/unmerge, bulk/unbulk, customer's address, rating, saved replies, settings (per-language sentence, hours, frame origins, help URL), erasure (and its log), cleanup, `exportAll` |
| `lib/mail-in.ts` | What `/chest-mail` does: file an email, confirm a new one (never to robots, three an hour per address), tell the team; mark a bounce and tell its author |
| `lib/hours.ts` | Working hours (pure): the week, days off, `workMinutes`, time zones with Intl, France's public holidays, local timestamps |
| `lib/text.ts` | Pure text: an email's quoted history (`splitQuoted`), links (`linkify`), `baseSubject`, robots' addresses |
| `lib/rules.ts` | Rules on arrival: CRUD (admins), matching (`matches`, `decide`), forgetting a member |
| `lib/views.ts` | Saved views: the inbox's parameters, checked |
| `lib/reports.ts` | The reports (admins) |
| `lib/export.ts`, `lib/zip.ts` | The ZIP export: two CSVs and a JSON |
| `lib/frame.ts` | The websites that may frame the public pages, cached 30 s, read by `proxy.ts` |
| `components/body.tsx`, `components/keys.tsx`, `components/folder-menu.tsx` | A message's words (links, folded quotes); keyboard shortcuts; the phone's folder menu and round button |
| `lib/attachments.ts` | Files on messages: who may upload (visitor, member), the grant, taking claims/uploads once and moving them to `files/`, removal, the nightly sweep |
| `components/file-picker.tsx` | The browser side of an upload (public and team) |
| `components/badges.tsx`, `components/inbox-filters.tsx` | Priority chip, "waiting since", the inbox's filters |
| `lib/form-token.ts` | The form's signed "shown at" time |
| `lib/mailer.ts` | Confirmation and replies through the Chest's mail, falling back to the page |
| `lib/tell.ts` | Bell and tile for those who answer |
| `lib/lifecycle.ts` | Members leaving or erased |
| `lib/public-origin.ts` | The public host's address; the visitor's key |
| `app/page.tsx`, `app/t/[secret]/`, `app/public-actions.ts` | The public part (anonymous); `app/t/[secret]/files/[id]/route.ts` streams a request's file to its link |
| `app/chest/…`, `app/chest/actions.ts` | The team's part (`inbox-list.tsx`: ticks and the bulk bar; `save-view.tsx`; `settings/hours-box.tsx`, `rules-box.tsx`, `embed-box.tsx`; `reports/`; `messages/[id]/original`) |
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
- **A visitor's file is theirs only**: public uploads come back as claims,
  traded once (`files.claim`); never accept an object name from a public
  page, never list another ticket's files on a link, never a note's. A
  file is always served as a download with `nosniff` and a sandbox.
- **Take files after the words are checked** (`withFiles` in
  `lib/tickets.ts`): a refused message must not spend a visitor's claims,
  and a message not saved deletes the files it took.
- **Email is optional**: every path must work when `mail.send` throws
  `CapabilityNotGranted` (delivery `page`).
- **Never file a stranger into someone's ticket**: a received email joins
  a ticket only by its verified thread, by the id of an email we sent, or
  — when `authenticated` — by the same customer's address. `[#1042]` in a
  subject is never proof on its own. Keep `test/mail.test.ts` green.
- **Automatic answers** (`auto`) never open a ticket, reopen one, notify
  or get answered; confirmations never go to robots' addresses.
- **Received HTML** is shown only as the Chest cleaned it, only on the
  team's side, only on demand; the original `.eml` is a download.
- **Merging never crosses customers** (the follow-up link of the merged
  ticket opens the other's conversation).
- **Framing**: only `/`, `/t/…` and `/lang/…` may carry the admin's
  `frame-ancestors`; `/chest` always `'none'`.
- **Working hours** are computed on the server (`lib/hours.ts`, the
  Chest's time zone); client components format dates only after mount.
- Identity from `member()` only; rights in `lib/access.ts`; words in every
  catalogue; client components never import the SDK or `lib/db.ts`.
