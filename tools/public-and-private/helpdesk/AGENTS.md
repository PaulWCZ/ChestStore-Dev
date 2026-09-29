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
| `lib/forms-in.ts` | What `forms.request` from Forms does (`/chest-events`, `tools`): `readRequest` reads the untrusted event (bounds, address, member id, path), `received` opens the ticket (`tickets.fromForms`) then confirms and tells as the public form does; `formsLink`, the link back |
| `lib/mail-in.ts` | What `/chest-mail` does: file an email, confirm a new one (never to robots, three an hour per address), tell the team; mark a bounce and tell its author |
| `lib/hours.ts` | Working hours (pure): the week, days off, `workMinutes`, time zones with Intl, France's public holidays, local timestamps |
| `lib/text.ts` | Pure text: an email's quoted history (`splitQuoted`), links (`linkify`), `baseSubject`, robots' addresses |
| `lib/rules.ts` | Rules on arrival: CRUD (admins), matching (`matches`, `decide`), forgetting a member |
| `lib/views.ts` | Saved views: the inbox's parameters, checked |
| `lib/reports.ts` | The reports (admins) |
| `lib/export.ts`, `lib/zip.ts` | The ZIP export: two CSVs and a JSON |
| `lib/frame.ts` | The websites that may frame the public pages, read from the database on every framed page by `proxy.ts` (no cache: the proxy runs in its own module instance) |
| `lib/theme.ts`, `app/tokens.css`, `app/globals.css` | The identity "Calm counter" (`defineTheme`, equal to the catalogue's `counter`) and `currentLook` (the company's choice, else the identity); Support's own tokens, from contract tokens; the styles (contract tokens only) |
| `components/team-shell.tsx` | The kit's `AppShell` + toasts + auto-refresh, and the column (a row of chips on a phone) of folders and saved views |
| `components/body.tsx`, `components/keys.tsx` | A message's words (links, folded quotes); keyboard shortcuts (`?` sheet in the kit's `Dialog`; `busy()`: never while typing or while a dialog is open) |
| `components/public-shell.tsx` | The public pages' frame: the company's name, or its logo in brand mode; the kit's `LanguageSwitch` |
| `lib/attachments.ts` | Files on messages: who may upload (visitor, member), the grant, taking claims/uploads once and moving them to `files/`, removal, the nightly sweep |
| `components/attachments.tsx` | The kit's `FilePicker` wired to the tool's grants (public claims, members' object names) |
| `components/badges.tsx`, `components/inbox-filters.tsx`, `components/report-table.tsx` | State and priority on the kit's `StatusBadge`, "waiting since"; the kit's `Filters` with Next's `Link`; the reports' `DataTable` |
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

## Added in round 2 of the critique

- `lib/seed-words.ts` — the tags a desk starts with are kept as keys
  (`@damaged`) and shown with `shownTag` in the reader's language; every
  service that returns tag names maps them (`readerWords(actor)`);
  `tagFor` finds a seeded tag by any of its translations; `renameTag`
  ignores a save of the shown name; `deleteTag` returns `name` (kept, for
  Undo) and `shown`.
- `ticket_links` (migration 0004) — a request sent twice within ten minutes
  (`fromForm`) is the same ticket with a second follow-up link; `linked()`
  reads both.
- Phones: `components/filter-toggle.tsx` (filters behind one button), the
  folder choice in `components/team-shell.tsx`, `app/chest/reports/period-tabs.tsx`
  (tabs or one choice), report tables `phone="stack"`.
- Public pages wear `publicLook()` (brand, else the identity; kit 0.2.3).

## Added: requests from Forms

- `migrations/0005_forms_requests.sql`: `tickets.requester` (a colleague's
  member id, `'erased'`; the ticket then has `customer_email = ''`),
  channel `forms`, `source` (form and answer, the path back) and
  `source_event` — both unique: one ticket per event and per answer.
- `test/forms-in.test.ts`: public vs team form, replays, rules, untrusted
  input, the link back. Flow step in `lab/chest-dev/flows/helpdesk.mjs`
  (`/_dev/deliver`).

## Rules

- **The public part never shows a note, another customer's request, or a
  member's full name** — only what the visitor's own link opens, and
  agents' first names. Public actions hold no member: keep them so.
- **The follow-up secret is shown once** (the redirect after the form, the
  confirmation email) and only its SHA-256 is stored. Never log it.
- **A colleague's request stores their member id only** — never the name
  or address an event carries; no email to them; never merged with
  another person's request; *Change* (the address) is refused on it.
  `lib/lifecycle.ts` marks it `'erased'` on erasure.
- **An event from another tool is untrusted**: bound and clean it in
  `readRequest`; a handler that cannot use it returns (204), it never
  throws (the Chest would deliver it again for 72 hours); never log its
  content.
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
  Chest's time zone); client components write dates with the kit's
  `formatDate` and date words (no `Intl` in a client render).
- **The UI kit first** (`@argentic/chest-ui/components`, `lab/BUILDING.md`):
  toasts (`undo` returns `true` or the reason it failed; an answer that
  left is `sent: true`, never an Undo), `Dialog`/`Confirm` (never
  `window.confirm`), `PeoplePicker`, `DateField` (never a browser date
  field), `FilePicker`, `Filters`, `SearchBox`, `StatusBadge`, `Tabs`,
  `DataTable`, `EmptyState`, `Avatar`, `AppShell`. The kit's words are
  sections of the catalogues (`toast`, `dialog`, `peoplePicker`, `dates`,
  `files`, `table`); `node scripts/lint-words.mjs` stays at 0 errors.
  Kit 0.2.2 (re-vendored 2026-09-29): assignees are single `PeoplePicker`s
  with `clearable` (no "Unassign" link beside them); the saved replies are
  the kit's `Menu` with a `note` per item (the start of the reply); menu
  items of people carry `id` (two people named alike); the inbox's
  `Filters` use `phone="scroll"` (no CSS of our own); the header's width
  is `AppShell width="full"`.
- **No colour in CSS or TSX**: contract tokens only (`test/theme.test.ts`
  checks it); text only on measured pairs.
- Identity from `member()` only; rights in `lib/access.ts`; words in every
  catalogue; client components never import the SDK or `lib/db.ts`.
