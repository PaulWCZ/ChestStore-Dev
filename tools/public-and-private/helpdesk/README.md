# Support — answer your customers together

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server. It replaces **Zendesk, Freshdesk or Help Scout** for a small
company: email to support@ and a public contact form, one shared inbox,
replies and internal notes. It is **not** a live-chat tool (Crisp,
Intercom): there is no chat bubble.

## What it does

**By email** (the Chest's mail — Proposal (studio), see "Needs from the SDK"):
- An email to the support address **opens a ticket**, confirmed to the
  customer (with their follow-up link) in the Chest's language, threaded
  under their email. Its HTML (cleaned by the Chest) is one click away
  ("Show formatting"); the text shows by default, the quoted history
  folded ("Show the quoted text"), web addresses as links; the original
  `.eml` downloads ("Original email"); attachments are kept (photos shown
  as thumbnails), and those the Chest refused are named ("Not kept:
  setup.exe (a program)").
- **Replies thread onto their ticket**, most certain first: the ticket's
  own reply address (`support+t1042-…@`, a tag only this tool can make);
  else In-Reply-To/References matching an email we sent (or one the same,
  authenticated customer sent); last, only when the Chest vouches for the
  sender, the same address with "[#1042]" or the same subject on a ticket
  still open that moved in the last 14 days. Otherwise a new ticket: a
  stranger never lands in someone else's conversation. A colleague who
  answers on the thread is shown by their address.
- **Agents' replies go out by email** from the support address, on the
  ticket's thread, with the conversation's headers and their files. A
  **bounce** shows on the reply ("Not delivered: 550 …") and above the
  ticket ("Emails to … do not arrive"), and tells whoever wrote it;
  correcting the customer's address (*Change*) clears it. An address the
  Chest refuses since a bounce is said on the next reply.
- **No loops, no spam tickets**: an automatic answer (out of office) is
  kept quietly on the ticket it answers — it reopens nothing, starts no
  wait, tells no one, is never answered — and opens no ticket; robots'
  addresses (no-reply@, mailer-daemon@) get no confirmation, one address
  three an hour at most; spam scores 5 and above go to *Spam*, untold.
- A merged ticket's emails go to the ticket it was merged into.

**For customers (the public part, no account):**
- A contact form in the company's name (name, email, subject, message), in
  English or French with a visible switch, and the company's sentence in
  that language (French falls back on English). Protected without a
  captcha: a hidden field, 5 requests an hour per visitor and 100 in all,
  and a signed "shown at" time — a form sent in under 1.5 s is refused;
  between 1.5 and 3 s the server waits the rest in silence. The time is
  the page's first, kept across corrections: a person who fixes a field
  and sends again is never taken for a robot.
- **In the company's website**: an administrator lists its addresses
  (https, ten at most); the form and its follow-up pages may then be
  framed there, and nowhere else (`frame-ancestors`; the team's pages
  never). Settings gives the code to paste — a plain `<iframe>`, no
  script — in English or French.
- A link to the company's **help centre** above the form when an admin
  gives one (the Wiki's public pages, or any page of answers).
- **Files** on the form and when writing again: photos, PDF, Word, Excel
  or text, 10 MB each, 5 a message. They go from the visitor's browser
  straight to the Chest; what comes back is a one-time claim only that
  visitor holds, so nobody can attach (or open) someone else's file.
  Files never sent with a message are deleted by the Chest after a day.
- After sending, a **follow-up page** whose address is a secret link (192
  bits; only its hash is stored): the answers, the state, and a box to write
  again (which reopens the request). The link is also emailed when the Chest
  can send email. The files of the request (theirs, and those the team
  sent with its answers — never a note's) download from there. It speaks
  the request's language (the switch still works). Once closed: "Did we
  solve your problem?" — *Yes, thank you* / *Not really*, one click, the
  agent told.

**For the team (`/chest`):**
- A shared **inbox** in folders — *Unassigned, Mine, Open, Waiting, Closed*
  (and *Spam* when there is some) — the **most urgent first**, then the
  customer who has waited longest; search by words, customer email or
  number; filter by **priority** or **tag**, or sort *Waiting longest* or
  *Latest activity* first. Unassigned tickets say so in a quiet grey pill.
- **Several at once**: tick tickets (or *Select all*), then give them to
  someone, set a priority, add a tag, close them or mark them spam — each
  with *Undo* (100 at once).
- **Saved views**: "Save this view" keeps the words, priority, tag and
  order under a name, in everyone's side column; its maker or an admin
  removes it (with *Undo*).
- **Waiting since**: each open ticket says how long its customer has
  waited for an answer ("Waiting 3 h") — from their first message the team
  has not answered; a reply ends it. Counted in **working hours** (a week
  grid, Monday–Friday 9:00–18:00 by default, and days off, with France's
  public holidays in one click), or every hour of the clock if the admin
  turns them off. Past the threshold an admin sets (24 hours by default; 1
  hour to 3 days, or never) it is highlighted, in bold, and said to screen
  readers.
- **Priority**: *Low, Normal, High, Urgent*, in words with a sign (a
  flag for urgent, outlined in red; chevrons for high and low) — never
  colour alone. Normal says nothing; urgent rows carry a red edge.
- **Tags**: a short shared list. Whoever answers adds one on a ticket
  (typed, or picked from the list: new ones are created on the fly, the
  same name whatever its case), removes it, clicks it to see every ticket
  carrying it. Ten a ticket, 200 in all. An admin renames them (a name
  that exists merges the two) and deletes them, with *Undo*.
- **Rules on arrival** (admins): when a new request (form or email)
  contains some words, or comes from an address or a domain — tag it, set
  its priority, give it to someone (thirty rules; tags add up, the first
  priority and person win; a person who leaves drops out of the rules).
- **Merge** a ticket into another of the **same customer** (they wrote
  twice): messages combined in time order, tags and the higher priority
  kept, the other closed and leading there (its link, its email thread);
  *Undo* splits them again. Never across customers: nobody sees another
  person's messages.
- **Reports** (admins): new, closed and still-open requests, the typical
  first-answer time (median, in working hours) and the share answered
  within the threshold, week by week, per person, per tag, per channel, and
  customers' opinions — 4 to 26 weeks. On a phone the period is one
  choice, the figures two a row and every table a column of small cards:
  nothing scrolls sideways.
- **On a phone**, the inbox's first ticket stays near the top: the folder
  is one choice ("Unassigned (3) ▾", saved views too), the filters
  (priority, tag, order, save a view) wait behind one *Filter (n)* button,
  and "select this page" shows once a ticket is ticked.
- **A request sent twice** (a double tap, Back then Send) within ten
  minutes — same address, subject and words — is the same ticket: the
  second sending gets its own follow-up link to it and is told "we had
  already received this request"; the team is not told twice, the
  customer not emailed twice.
- **Tags a desk starts with** (the sample's "Damaged", "Delivery",
  "Invoice", "Order change") read in each reader's language ("Abîmé",
  "Livraison"…) until someone renames them; typed in either language they
  are the same tag (`lib/seed-words.ts`).
- **Keyboard**: `j`/`k` move, `Enter` opens, `x` ticks, `r` reply, `n`
  note, `e` close, `c` new ticket, `/` search, `?` the list.
- A **ticket**: the conversation, a composer with *Reply* or *Internal note*
  (notes never reach the customer), *Send* or *Send and close*, **saved
  replies** with `{customer}` and `{agent}`, **files** on a reply (sent
  with the email) or a note, priority and tags, assign (or *Take it*), close
  with *Undo*, spam, the customer's other requests, and "Hugo is on this
  ticket too" when someone else has it open.
- **New ticket** for a customer who called or came by.
- **Settings**: the company name, the form's sentence per language, the
  help centre's address, open or close the form, working hours and days
  off, the "waiting too long" threshold, rules on arrival, the websites
  that may show the form, the tags, saved replies, retention of closed
  tickets, **erase a customer's data** (their right to erasure; who
  erased how many tickets, and when, is listed — never whose), and
  **export everything** (a ZIP: `tickets.csv`, `messages.csv` — every
  message, notes included, who wrote it, its files' names, dates on the
  Chest's clock — and `tickets.json`).
- **The bell**: a new request tells everyone who answers; a customer's new
  message tells the ticket's agent; giving a ticket to someone tells them —
  each in their own language. The tile's number: open tickets nobody took
  plus open ones given to you.


## With the other tools

Support **receives `forms.request`** (version 1) from **Forms** — events
between tools, Proposal (studio), `sdk/README.md`; declared in
`chest.proposals.json` `"receives"`, and an administrator links the two in
the Chest. The contract is Forms' (its README, "With the other tools"). An
answer to a form its author mapped to a ticket opens one here, on the path
of the public form:

- **Who asked**: a public form's respondent by the address in the event
  (checked, kept lower case) and their name; a team form's respondent by
  their member id only (`requester`), never a name or an address, even if
  the event carries them. The team sees them by name when they have
  Support, "A colleague" otherwise, "Former member" once erased.
- **The ticket**: the event's subject (else the form's title), its details,
  then every other answer, one a line ("Your phone number: …", in the
  answer's language); channel *Forms*; under the title, **From the form
  “Contact us”**, linked to the answer in Forms while Forms is installed
  on the Chest (below).
- **As a request of the public form**: the rules on arrival, the bell for
  those who answer (or the one a rule gave it to), the tiles; to a
  customer, the confirmation email with the follow-up link when the Chest
  can send email (never to a robot's address, three an hour to one address
  at most). A colleague gets no email — Support keeps no address of
  theirs —: answers to them stay in Support (*In Support only*), and they
  hear of each one in the Chest's bell when they have Support.
- **Once**: the same event delivered again, or another event for the same
  answer, opens nothing and tells no one (the event's id and the form and
  answer ids are unique in `tickets`).
- **Untrusted**: every text is bounded (subject 200, name 120, details
  8,000, 100 answers of 1,000, a message 20,000) and cleaned (no control or
  direction characters); the link back is only a `/chest/…` path. An event
  of another shape, or with nobody to answer, is accepted and ignored — the
  log says so without a word of its content.
- **The link back**: the ticket keeps the answer's path only (never an
  address, which changes when Forms gets a custom domain); the ticket's
  page makes the link when it is shown, with `chest.toolLink("forms",
  path)` (`lib/forms-in.ts`, `formsLink`). While Forms is not installed on
  the Chest, the form is named without a link. Following it opens Forms
  only for a member who has Forms; its host tells the others.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `admin` | Administrator | everything, the settings (hours and threshold, rules, framing, renaming and deleting tags), erasing a customer's data, reports |
| `agent` | Agent | read, answer, note, assign, close, priority, tags (adding a new one), files, saved replies, merge, several at once, saved views, correct a customer's address, export |
| `viewer` | Viewer | read the tickets |
| (none) | — | "You can't use Support yet" |

## First minute

- **What a new agent sees:** *Unassigned*, with the most urgent request on
  top (then the one waiting longest). On an empty Chest: "Your shared inbox is ready", and a button to
  open the public form.
- **The first thing they do:** open the request, type the answer, *Send*.
- **Clicks for the main job:** 2 (open, send) plus the typing; a saved
  reply is 2 more.
- **A mistake:** *Close* has *Undo*; a note is written in yellow, in its own
  tab, so it is not mistaken for a reply; a refused action says why and
  keeps the text.

## Routes

| Path | Who | What |
|---|---|---|
| `/` (`?lang=en\|fr`, `?embed=1`) | anyone | the contact form (in a frame of the company's website: `embed`) |
| `/t/<secret>` | whoever has the link | a request's follow-up page |
| `/t/<secret>/files/<id>` | idem | a file of that request (not a note's), as a download |
| `/lang/<code>` | anyone | remembers the public language |
| `/chest` (`?folder=`, `?q=`, `?priority=`, `?tag=`, `?sort=`) | members with a role | the inbox (a tag without a folder: every ticket carrying it) |
| `/chest/tickets/<number>` | idem | a ticket |
| `/chest/new`, `/chest/settings`, `/chest/export` | idem (writing: agents, admins) | new ticket, settings, the ZIP export |
| `/chest/reports` (`?weeks=`) | admins | reports |
| `/chest/messages/<id>/original` | members with a role | a received email's original `.eml` (a download) |
| `/chest/files/<id>` (`?thumbnail=1`) | idem | an attachment (a fresh 15-minute link), or a photo's thumbnail |
| `/chest-events` | the Chest only (signed) | members' lifecycle; `forms.request` from Forms (proposal) |
| `/chest-mail` | the Chest only (signed) — proposal | received email and bounces |
| `/chest-jobs/cleanup` | the Chest only (signed) — proposal | nightly retention |

## Looks

Support wears its own look, "Calm counter" (DESIGN.md) — or any theme of
the store's catalogue (the 17 tools' identities, "Chest", "High
contrast"), or **the company's brand** (its colours, fonts, corners and
logo), as the company chooses in its Chest, for all its tools or for
Support alone. The features are the same in every look; every text stays
readable (WCAG AA), light and dark. In brand mode the company's logo
replaces Support's mark in the header, and the public contact form and
follow-up pages carry the company's logo, colours and fonts: the customer
is on the company's own page. The look is resolved on the server
(`lib/theme.ts`, `chest.theme()` — Proposal (studio)); nothing runs in the
browser for it. Outside a Chest that offers looks, Support wears its own.

## On a Chest

- `public: true`, `csp: "tool"` (Next.js needs its own nonce policy).
- `capabilities`: `database`; `files` (attachments: the form's, the
  team's, received emails');
  `members` (names, and who answers: roles `admin`, `agent`);
  `notifications`; `receives: ["member.*"]` (and `forms.request` in
  `chest.proposals.json`: Proposal (studio)).
- **Customers are not members**: their email and name are kept to answer
  them, erased on request (Settings), and closed tickets are deleted after
  the retention (24 months by default; 0 keeps them). The CNIL's guidance
  on customer data applies: say it in your privacy notice.
- **A member leaves**: their tickets go back to *Unassigned*. **Erasure**:
  their answers stay (customers received them), signed "Former member";
  what they asked with a team form stays, asked by "Former member".
- No WebSocket: the inbox and a ticket re-read themselves every 20 s (the kit's `useAutoRefresh`).

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`.
- **`chest.theme()`** — **Proposal (studio)**: the look the company chose
  (README, "Looks"); without it, Support's own.
- **`mail`** — **Proposal (studio)** (`chest.proposals.json`: `send`,
  mailbox `support`), with **receiving** (studio.12): thread addresses
  (`send({mailbox, thread})`, `Received.thread`), `mail.handle` with
  `message` and `bounce`, the HTML cleaned by the Chest, the original
  `.eml`, `authenticated`, `auto`, `dropped`. Without mail the tool is
  fully usable through the form: replies are on the customer's follow-up
  page, marked *On the follow-up page only*, and Settings says so.
  **On a real Chest today there is no mail**: until the Chest ships it,
  sell Support as "a contact form and a shared inbox", not as a Zendesk
  replacement for email.
- **`chest`** (company, time zone, language, public address) —
  **Proposal (studio)**: the day and the working hours are the Chest's
  time zone; email tickets take the Chest's language; links in emails use
  `chest.publicUrl()` (else the last public address seen).
- **Scheduled tasks** — **Proposal (studio)**: the nightly `cleanup`.
  Without it, closed tickets are kept until an admin erases them.
- **Public uploads** — **Proposal (studio)** (`chest.proposals.json`:
  `"files": {"publicUploads": true}`), with `files.claim` and
  `expiresUnclaimedAfter` (a day). Without it the form works as before;
  *Add a file* answers "Files cannot be added right now. Describe it in
  words, or try again later." A visitor's file reaches them back through
  the tool (`/t/<secret>/files/<id>`, streamed with `files.get`): the
  Chest's signed links are for members' browsers; a signed link on the
  public host would spare the tool the bytes.
- **Several mailboxes** (support@ and sales@, two brands) need nothing
  new of the SDK but a manifest change per company: `mailboxes` is fixed
  in the manifest, so a company cannot add one from Settings. The SDK
  report asks for mailboxes an admin names at install time.
- **Frame ancestors**: the policy is the tool's own (`csp: "tool"`). The
  Chest's front must pass the tool's `frame-ancestors` through unchanged
  on the public host (and keep refusing frames on the team host).
- **The visitor's address** for the form's counters is read from
  `X-Forwarded-For`, assumed set by the Chest's front.

- **Events between tools** — **Proposal (studio)**: `forms.request` from
  Forms (above). Without it, Forms' answers stay in Forms.
- **`chest.toolLink`** — **Proposal (studio)** (SDK report §4.18): the
  link back to an answer in Forms, from the addresses the Chest gives in
  `CHEST_TOOL_URLS`. On a Chest without it, the form is named without a
  link.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build
```

In the studio: `node lab/chest-dev/dev.mjs tools/public-and-private/helpdesk --reset`
(the `/_dev` page shows the outbox and can send an email to the support
mailbox), `node lab/chest-dev/flows/helpdesk.mjs`,
`node lab/chest-dev/screens.mjs tools/public-and-private/helpdesk`.

## What it does not do (yet)

- **Email on a real Chest**: the `mail` proposal is not shipped; until
  it is, email in and out works only in the studio's harness.
- **Live chat** (Crisp, Intercom): no chat bubble; a chat would need a
  push or long-poll primitive (no WebSocket on a Chest).
- **Imports from Zendesk, Freshdesk or Help Scout**: not built, on
  purpose. Their documented export formats could not be read from the
  studio: on 2026-09-29 support.zendesk.com (article 4408886165402,
  "Exporting ticket, user, or organization data"), developer.zendesk.com
  (incremental exports) and developers.freshdesk.com (the tickets API) were
  refused by the studio's network; a web search only returned
  third-party summaries (Zendesk's JSON export includes comments but not
  attachments, must be enabled by Zendesk, and splits tickets over 1 MB),
  which are not a field-level format to write a parser against. History
  stays in the old tool (a read-only seat) until an importer is written
  against the vendors' documentation or a real export file.
- **A help centre** (knowledge base): the Wiki's job — Support links to
  it (Settings, "help centre's address"); a public mode of the Wiki is in
  the suite's report.
- **Several mailboxes or brands**, one company name per tool.
- **SLA reminders**: the wait is counted in working hours and
  highlighted, reports give the first-answer time, but nobody is emailed
  when a target is missed, and there is no separate "resolution" target.
- **Rules beyond arrival**: rules run when a request arrives, not on
  later events (no "when a ticket waits 2 days…"), no "any of / all of".
- **Merging across customers** (Zendesk adds the other as CC): refused,
  on purpose.
- **Rich text in replies**: agents write plain text (links become
  clickable, line breaks kept); no bold or lists.
- **The files in the export**: the ZIP carries every word and every
  file's name; the files themselves stay in the Chest (no bulk download
  of files in the SDK yet).
- A customer choosing the priority; per-agent notification settings.
- The tool does not scan files for viruses (the Chest drops what its
  provider flags on received mail); it serves them only as downloads.
