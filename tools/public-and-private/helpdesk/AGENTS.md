# Adapting Support — a guide for AI agents

`README.md` says what Support does; this page says where things are and
what must not break.

## Map

How a tool on the studio starter is built — pages, islands, actions,
words, the database, tests, its rules — is
`node_modules/@argentic/chest-app/AGENTS.md`: read it first. Support's
own:

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (contract 0.4: roles `admin`, `agent`, `viewer`; public part; schedules `cleanup` and `late`; `build.static` `/assets/`) and the proposals it uses (`mail`, public uploads, `receives` `forms.request` and `status.incident`, `emits`, `webhooks`) |
| `vendor/` | SDK 0.4.1-studio.2, the UI kit, `@argentic/chest-app`: packed copies, never edited |
| `src/app.tsx` | Every route: the team's pages in their frame (`team()`: a member without a role reaches My requests only), downloads, the public pages, the Chest's deliveries; around them, the frame-ancestors of the public pages and the sandbox of files |
| `src/actions.ts` | Every change, by name (members' and public); the rules check values and rights |
| `src/pages/` | Pages (server): `inbox`, `ticket`, `new-ticket`, `settings`, `reports`, `mine`, `contact`, `follow-up`; `frame.tsx` (the team's frame: shell, folders, saved views), `public-shell.tsx` (the public frame, the language switch with `?lang=`) |
| `src/islands/` | What runs in the browser: the inbox's list and tools, a ticket's composer and side card, settings' boxes, the public form, write again, rate, keys, auto-refresh |
| `src/components/` | Shared by pages and islands (island rules: no server code): icons, badges, a message's body, attachments (the kit's FilePicker), the incident banner, a settings box |
| `src/shared/` | Pure rules the islands use too: `model.ts` (bounds, kinds, priorities, folders), `hours.ts` (working hours, time zones, France's holidays), `text.ts` (quoted history, links, subjects) |
| `src/lib/` | The rules and the SQL (below), `deliveries.ts` (`/chest-events`, `/chest-mail`, `/chest-schedules`, `/chest-webhooks`), `downloads.ts` (files, the original email, the export), `format.ts` (dates, plurals, sizes; Intl objects kept) |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`; `kit` holds the kit's words |
| `src/theme.ts`, `src/tokens.css`, `src/styles.css` | The identity "Calm counter" and `sheetOf` (the company's choice, served as `/chest/look.css` and `/look.css`); Support's tokens; the styles (contract tokens only) |
| `src/lib/access.ts` | Who may do what |
| `src/lib/tickets.ts` | The service: public form, follow-up link, email filing, bounces, inbox, answers, notes, assignment, priority, tags, merge, bulk, customer's address, rating, saved replies, settings, erasure, cleanup, export; "A colleague's own requests" (My requests) |
| `src/lib/forms-in.ts`, `src/lib/incidents-in.ts`, `src/lib/mail-in.ts` | What Forms, Status and the mailbox send |
| `src/lib/notices.ts` | Slack, Teams and web-address notices (`webhooks`) |
| `src/lib/rules.ts`, `src/lib/views.ts`, `src/lib/reports.ts`, `src/lib/export.ts`, `src/lib/zip.ts` | Rules on arrival, saved views, reports, the ZIP export |
| `src/lib/attachments.ts` | Files on messages: grants (public: `files.publicUploadUrl`), claims, the nightly sweep |
| `src/lib/form-token.ts`, `src/lib/public-origin.ts` | The form's signed "shown at" time; the public address (`chest.tool.publicUrl`) and the visitor's key (`visitors.address()`) |
| `src/lib/ticket-events.ts`, `src/lib/tell.ts`, `src/lib/lifecycle.ts`, `src/lib/frame.ts` | Events for Goals; bell and tile; members leaving; the websites that may frame the form |
| `test/` | `app.test.mjs` (the built server), `stack.test.ts` (the package's rules, words), the rules' own tests |

## Commands

```sh
npm ci && npm run build && npm test   # all must pass (PGlite, or TEST_DATABASE_URL)
```

## Added in round 2 of the critique

- `src/lib/seed-words.ts` — the tags a desk starts with are kept as keys
  (`@damaged`) and shown with `shownTag` in the reader's language; every
  service that returns tag names maps them (`readerWords(actor)`);
  `tagFor` finds a seeded tag by any of its translations; `renameTag`
  ignores a save of the shown name; `deleteTag` returns `name` (kept, for
  Undo) and `shown`.
- `ticket_links` (migration 0004) — a request sent twice within ten minutes
  (`fromForm`) is the same ticket with a second follow-up link; `linked()`
  reads both.
- Phones: `src/islands/InboxTools.tsx` (filters behind one button), the
  folder choice `src/islands/FolderSelect.tsx`, `src/islands/PeriodTabs.tsx`
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

## Added in round 3 of the critique

- `migrations/0006_notices_incidents.sql`: `notice_targets` (the channels:
  the Chest's target id, never the address), `tickets.late_noticed_for`
  (one "waiting too long" notice per wait), `incidents` (Status' news).
- `src/app.tsx` `team()` sends a member without a role to My requests. It
  chooses a page only; every service checks rights.
- `src/lib/forms-in.ts`: `betterSubject`, `messageField` — the subject and
  the message of a request from Forms' default mapping.
- `src/lib/text.ts` `linkify(text, {contacts})`: `mailto:` and `tel:` on the
  team's side only (`src/components/body.tsx` `contacts`).
- Tests: `test/mine.test.ts` (isolation), `test/notices.test.ts`,
  `test/incidents-in.test.ts`; flow steps "critique 3" in
  `lab/chest-dev/flows/helpdesk.mjs`.

## Rules

- **My requests shows a member their own tickets and nothing else**: every
  query filters on `requester = actor.id`; any other ticket is
  `not_found` (never `forbidden`: nothing tells that it exists); only
  `publicKinds` (never a note, never an automatic answer); files through
  `myFile`. A member without a role reaches nothing else of `/chest`
  (`src/lib/access.ts` gives them no ability). Keep `test/mine.test.ts` green.
- **Notices leave the Chest**: the number, the subject, who asked, a link —
  never a message or a note; the address stays with the Chest (the tool
  keeps the target id and the shown address only).

- **The public part never shows a note, another customer's request, or a
  member's full name** — only what the visitor's own link opens, and
  agents' first names. Public actions hold no member: keep them so.
- **The follow-up secret is shown once** (the redirect after the form, the
  confirmation email) and only its SHA-256 is stored. Never log it.
- **A colleague's request stores their member id only** — never the name
  or address an event carries; no email to them; never merged with
  another person's request; *Change* (the address) is refused on it.
  `src/lib/lifecycle.ts` marks it `'erased'` on erasure.
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
  `src/lib/tickets.ts`): a refused message must not spend a visitor's claims,
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
- **Framing**: only `/` and `/t/…` may carry the admin's
  `frame-ancestors` (`src/app.tsx`, `framed`); `/chest` always `'none'`.
  A Chest of contract 0.4 refuses every frame anyway (README).
- **Working hours** are computed on the server (`src/lib/hours.ts`, the
  Chest's time zone); islands write dates with the kit's
  `formatDate` and date words; the server's `Intl` objects are made once
  (`src/lib/format.ts`, the package's `f`), never per row.
- **The UI kit first** (`@argentic/chest-ui/components`, `lab/BUILDING.md`):
  toasts (`undo` returns `true` or the reason it failed; an answer that
  left is `sent: true`, never an Undo), `Dialog`/`Confirm` (never
  `window.confirm`), `PeoplePicker`, `DateField` (never a browser date
  field), `FilePicker`, `Filters`, `SearchBox`, `StatusBadge`, `Tabs`,
  `DataTable`, `EmptyState`, `Avatar`, `AppShell`. The kit's words are
  the catalogues' `kit` (`toast`, `dialog`, `peoplePicker`, `date`,
  `files`, `table`); `node scripts/lint-words.mjs` stays at 0 errors.
  Kit 0.2.2 (re-vendored 2026-09-29): assignees are single `PeoplePicker`s
  with `clearable` (no "Unassign" link beside them); the saved replies are
  the kit's `Menu` with a `note` per item (the start of the reply); menu
  items of people carry `id` (two people named alike); the inbox's
  `Filters` use `phone="scroll"` (no CSS of our own); the header's width
  is `AppShell width="full"`.
- **No colour in CSS or TSX**: contract tokens only (`test/theme.test.ts`
  checks it); text only on measured pairs.
- Identity from the package's `member` only; rights in `src/lib/access.ts`;
  words in every catalogue; islands and `src/components/` never import
  the SDK or `src/lib/` (`checkSources`).
- **The visitor's address** only from `visitors.address()` — never
  `X-Forwarded-For`.
- **No inline script or style**: no `style={}`, no `<style>`; the look is
  `/chest/look.css` and `/look.css`.
