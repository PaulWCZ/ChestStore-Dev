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
  English or French with a visible switch — the visitor's choice, else
  their browser's language, else the Chest's own language —, and the
  company's sentence in that language (French falls back on English). Protected without a
  captcha, by the package's `bound` (publicAction): a field only robots
  fill (answered "done", nothing kept); a single-use form token the page
  carries for that action, with a proof of work the browser computes in a
  fraction of a second (sending a request needs JavaScript) (two hours; a form sent sooner than 3 s after the page showed
  waits the rest in silence, never refused as "too fast"); then, once the
  call is valid — a refused one is not counted — 10 requests a day per
  visitor and 300 a day in all. A visitor is the address the Chest's
  front saw when it names one, else the browser's own cookie
  (`chest_v`): a real 0.4 Chest names none, and junk (bad tokens, the
  robots' field, refused words) spends nothing, so a flood of it never
  blocks a real customer.
- **In the company's website**: an administrator lists its addresses
  (https, ten at most); the form and its follow-up pages may then be
  framed there, and nowhere else (`frame-ancestors`; the team's pages
  never). Settings gives the code to paste — a plain `<iframe>`, no
  script — in English or French. **Not on a Chest of contract 0.4 yet**:
  its front refuses every frame of a public page (below, "Needs from the
  SDK"); Settings says so.
- A link to the company's **help centre** above the form when an admin
  gives one (the Wiki's public pages, or any page of answers).
- **Files** on the form and when writing again: photos, PDF, Word, Excel
  or text, 10 MB each, 5 a message. They go from the visitor's browser
  straight to the Chest; what comes back is a one-time claim only that
  visitor holds, so nobody can attach (or open) someone else's file.
  Files never sent with a message are deleted by the Chest after a day.
  A Chest that takes no visitors' files (the proposal below not granted):
  the page asks it before offering any, and says "This form takes no
  files: describe it in words." instead of a picker.
- After sending, a **follow-up page** whose address is a secret link (192
  bits; only its hash is stored): the answers, the state, and a box to write
  again (which reopens the request). The link is also emailed when the Chest
  can send email. The thank-you is said once (the address loses `?new=1`
  in the browser). A link that does not work is a 404 that says so, with
  the way to write a new request. Each link writes again 60 times a day
  and rates 10 times (the package's `perSubject`), adds 40 files and
  downloads 60 an hour — whoever holds it, counted once the link is
  known; another request's link is its own count. The team's first
  names on that page come from the Chest at most once a minute (never a
  call to the Chest per visit). The files of the request (theirs, and those the team
  sent with its answers — never a note's) download from there, two at a
  time in the whole tool (a file is read whole: 10 MB at most; the others
  are told to come back in 5 seconds, `503` + `Retry-After`); a download
  that has not ended after two minutes is cut. It speaks
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
  are the same tag (`src/lib/seed-words.ts`).
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
  Chest's clock — and `tickets.json`). The ZIP is written as it is sent:
  tickets read 200 at a time (three queries a batch), each file deflated
  as it goes, so memory stays flat whatever the size of the desk (5,000
  tickets and 20,000 messages: 72 MB of text, peak 160 MiB for the whole
  process, from 117 at rest). Each file reads the tickets anew: a ticket
  that arrives during the export may be in one file and not the one
  before.
- **The bell**: a new request tells everyone who answers; a customer's new
  message tells the ticket's agent; giving a ticket to someone tells them —
  each in their own language. The tile's number: open tickets nobody took
  plus open ones given to you.
- **Slack and Teams** (Settings, administrators — `webhooks`, Proposal
  (studio)): paste a Slack incoming webhook, a Teams workflow's address or
  any https receiver (Zapier, Make, your server: JSON signed by the
  Chest, its secret key shown once), name it, and tick what it is told —
  *a new request arrives*, *a customer writes again*, *a request waits too
  long* (past the threshold, in working hours, once per wait; checked every
  15 minutes by the `late` schedule). What leaves: the number, the
  subject, who asked and a link to the ticket — never a message, never a
  note — in the Chest's language. The Chest checks the address before
  anything is kept (https, public, the provider's shape; a generic receiver
  must answer a signed ping), keeps it encrypted (Settings shows it without
  its secret part), delivers, retries, and stops an address that keeps
  failing: Settings then says *Stopped* with the reason and *Try again*,
  and the administrators hear of it in the bell. Removing a channel asks
  first (the Chest forgets the address). Settings asks the Chest first
  (`webhooks.available()`, studio.16): on a Chest without webhooks, one
  whose owner paused Support's notices (the channels are kept), or one
  that did not answer, it says which and hides the form. Each notice's key
  carries who asked and the channels it goes to, so a restore from a
  backup never makes the Chest take a new request for an old one.
- **An incident in progress** (from **Status**, below): a line above the
  inbox and every ticket — "Incident in progress: Payments unavailable",
  the services it touches, a link to its public page — and, first in
  *Saved replies*, "Incident: Payments unavailable": a reply in the
  customer's language that says so and links the public page. Both go
  once Status resolves (or removes) it.

**For colleagues (`/chest/mine`, any member of the Chest who has
Support):**
- **My requests**: a colleague who asked the team something with a team
  form of Forms (an IT request, a facilities request) — most have no role
  in Support — reads their own requests here, newest first: the team's
  answers (never a note), the state, their files and the team's; writes
  again (with files; a closed request reopens); rates a closed one. Only
  the tickets they asked (`requester` = their member id): any other
  ticket, a customer's or another colleague's, is "not found", exactly as
  one that does not exist. A member without a role lands here when they
  open Support (any other page leads here; a ticket's address to their own
  view of it); someone who answers tickets sees the tab when they asked
  something themselves. The bell "Inès answered your request 1017" opens
  their view of it. With nothing asked yet: "Open Forms" when Forms is on
  the Chest.


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
- **The ticket**: a subject worth reading — the event's, unless it is only
  the form's title (Forms' default mapping): then what the request is
  about (a short answer to a question labelled *subject*, *topic*, *about*,
  *sujet*, *objet*…) and the first line of the message, "Un devis —
  Bonjour, je voudrais un devis pour six chaises en chêne."; the form's
  title only when there is nothing better. **The message first**: the
  details, else the answer that is the message (labelled *message*,
  *details*, *question*…, else the longest free text), then every other
  answer, one a line ("Your phone number: …", in the answer's language).
  On the team's side phone numbers are `tel:` links and addresses
  `mailto:` (an agent on a phone calls back in one tap). Channel *Forms*;
  under the title, **From the form “Contact us”**, linked to the answer in
  Forms while Forms is installed on the Chest (below).
- **As a request of the public form**: the rules on arrival, the bell for
  those who answer (or the one a rule gave it to), the tiles; to a
  customer, the confirmation email with the follow-up link when the Chest
  can send email (never to a robot's address, three an hour to one address
  at most). A colleague gets no email — Support keeps no address of
  theirs —: answers to them stay in Support (*In Support only*); they read
  them in **My requests** and hear of each one in the Chest's bell (its
  item opens their request).
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
  page makes the link when it is shown, with `chest.tools.link("forms",
  path)` (`src/lib/forms-in.ts`, `formsLink`). While Forms is not installed on
  the Chest, the form is named without a link. Following it opens Forms
  only for a member who has Forms; its host tells the others.

Support **receives `status.incident`** (version 1) from **Status**
(declared in `chest.proposals.json` `"receives"`; an administrator links
the two). The contract is Status' (its README, "With the other tools"):
`{v, action: opened|updated|resolved|removed, incident: {id, title,
language, titles, status, impact, started_at, resolved_at, url, services:
[{id, names, state}]}, update: {id, status, at}}`. Read as untrusted
(`src/lib/incidents-in.ts`: texts bounded and cleaned, the link https only,
states from a closed list); kept by the incident's id; an event published
earlier (the Chest's `occurredAt`) never replaces a later one — they may
arrive out of order. What the team sees of it: above.

Support **publishes `helpdesk.ticket.solved` and `helpdesk.ticket.reopened`**
(declared in `chest.proposals.json` `"emits"`), which **Goals** counts for
a key result "Tickets solved" (only the owner's, by `assignee`). The
contract is Goals' (its README, "With the other tools"):

| Event | Data | Key | When |
|---|---|---|---|
| `helpdesk.ticket.solved` | `{ticket, assignee: "mbr_…" \| null}` | `helpdesk:<ticket>:solved:<time>` | an open or waiting ticket is closed |
| `helpdesk.ticket.reopened` | `{ticket}` | `helpdesk:<ticket>:reopened:<time>` | a solved ticket leaves "closed" |

- `ticket` is the ticket's number as text (`"1042"`, the one people say);
  `assignee` the ticket's agent when it was closed — the one who answered
  and closed it, or the one it was given to —, `null` when nobody had it;
  `<time>` when it happened (milliseconds): solved again, it is published
  again, and Goals keeps the latest.
- **Every path**: a reply sent with *Close*, the status menu, a bulk close
  and its Undo, the customer writing again on the follow-up page or by
  email, a solved ticket marked as spam (taken back). A duplicate closed
  by a merge is not solved; closing spam solves nothing.
- **Never lost, never twice**: a trigger (`0007_ticket_events.sql`)
  writes each change in the same transaction as the ticket;
  `src/lib/ticket-events.ts` publishes it after the action, and the `late`
  schedule (every 15 minutes) again while the Chest refuses (not linked
  yet, quota): the action itself never fails for it. The same key twice is
  one event. What the Chest refused for a week is forgotten by the nightly
  cleanup, and what was told, after a day. An erased agent's id is removed
  from what waits.
- The event's time (`occurredAt`, studio.16) is when the ticket was
  solved or reopened, even when the schedule tells it later: Goals counts
  a ticket solved at 23:55 on a cycle's last day in that cycle. The Chest
  takes a time at most 24 hours back (five minutes of margin are kept for
  the clocks); an older event — a Chest down for a night — goes without
  it and is dated when the Chest took it (its key keeps the real time).

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `admin` | Administrator | everything, the settings (hours and threshold, rules, framing, renaming and deleting tags), erasing a customer's data, reports |
| `agent` | Agent | read, answer, note, assign, close, priority, tags (adding a new one), files, saved replies, merge, several at once, saved views, correct a customer's address, export |
| `viewer` | Viewer | read the tickets |
| (none) | — | **My requests** only: the tickets they asked, and nothing else |

## First minute

- **What a new agent sees:** *Unassigned*, with the most urgent request on
  top (then the one waiting longest). On an empty Chest: "Your shared inbox is ready", and a button to
  open the public form.
- **The first thing they do:** open the request, type the answer, *Send*.
- **Clicks for the main job:** 2 (open, send) plus the typing; a saved
  reply is 2 more.
- **A colleague without a role** (they asked IT something with a form):
  the bell "Inès answered your request 1017" opens it in My requests —
  the answer, a box to write again. Zero clicks to read, one to answer.
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
| `/chest/mine`, `/chest/mine/<number>` | any member, their own requests only | My requests; one of them (answers, write again, rate) |
| `/chest/mine/<number>/files/<id>` | idem | a file of their own request (never a note's), as a download |
| `/chest/files/<id>` (`?thumbnail=1`) | idem | an attachment (a fresh 15-minute link), or a photo's thumbnail |
| `/chest-events` | the Chest only (signed) | members' lifecycle; `forms.request` from Forms, `status.incident` from Status (proposal) |
| `/chest-mail` | the Chest only (signed) — proposal | received email and bounces |
| `/chest-schedules` | the Chest only (signed, `Chest-Schedule`) | the runs of `chest.json`'s schedules: `cleanup` (nightly retention), `late` (every 15 minutes: requests waiting too long told to the channels that asked; ticket events published again) |
| `/chest-webhooks` | the Chest only (signed) — proposal | a Slack/Teams channel the Chest stopped (`webhook.disabled`) |
| `/chest/actions/<name>`, `/actions/<name>` | members; anyone (the public form, a follow-up link) | every change (`src/actions.ts`): from an island or a plain form |
| `/chest/look.css`, `/look.css`, `/assets/…` | members; anyone | the look (the company's choice), the browser's files, fonts and icon |

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
(`src/theme.ts`, `chest.theme()` — Proposal (studio)), served as a
stylesheet of the tool's own (`/chest/look.css`, `/look.css` on the public
host, cached by its hash); nothing runs in the browser for it. Outside a Chest that offers looks, Support wears its own.

## On a Chest

- Contract **0.4** (`"chest": "0.4"`), `public: true` — **no `csp`
  permission**: no inline script, no inline style; the Chest's default
  policy for a public part is the tool's own.
- `capabilities`: `database`; `files` (attachments: the form's, the
  team's, received emails'); `members` (names, and who answers: roles
  `admin`, `agent`); `notifications`; `receives: ["member.*"]`;
  `schedules`: `cleanup` (03:15 every night) and `late` (every 15
  minutes), in `chest.json`, posted to `/chest-schedules`. In
  `chest.proposals.json` (Proposal (studio)): `mail`, public uploads,
  `receives` `forms.request` and `status.incident`, `emits`, `webhooks`.
- `build.static`: `["/assets/"]` — the browser's files, the fonts
  (`/assets/fonts/`) and the icon (`/assets/icon.svg`); nothing is served
  at the host's root.
- **Customers are not members**: their email and name are kept to answer
  them, erased on request (Settings), and closed tickets are deleted after
  the retention (24 months by default; 0 keeps them). The CNIL's guidance
  on customer data applies: say it in your privacy notice.
- **A member leaves**: their tickets go back to *Unassigned*. **Erasure**:
  their answers stay (customers received them), signed "Former member";
  what they asked with a team form stays, asked by "Former member". A
  member still in the Chest who lost access to Support is named "Léa
  Dubois (no access)".
- **Sleep**: nothing is kept in the process's memory; the first request
  after a sleep is answered in about 0.5 s (measured in the harness).
- No WebSocket: the inbox and a ticket re-read themselves every 20 s
  (the kit's `useAutoRefresh`; what is being typed is kept).

## Needs from the SDK

Built on SDK 0.4.1 + studio proposals (0.4.1-studio.3), a packed copy in
`vendor/`, and the studio's app package `@argentic/chest-app` (also in
`vendor/`). The member's `language` and `timeZone`, the Chest's
`organization`, `timeZone`, `language`, `chest.tool.teamUrl` and
`chest.tool.publicUrl`, and the schedules are the released 0.4.1; what
follows is not in it yet.

- **`chest.theme()`** — **Proposal (studio)**: the look the company chose
  (README, "Looks"); without it, Support's own.
- **`mail`** — **Proposal (studio)** (`chest.proposals.json`: `send`,
  mailbox `support`), with **receiving** (studio.12): thread addresses
  (`send({mailbox, thread})`, `Received.thread`), `mail.handle` with
  `message` and `bounce`, the HTML cleaned by the Chest, the original
  `.eml`, `authenticated`, `auto`, `dropped`. Without mail the tool is
  fully usable through the form: replies are on the customer's follow-up
  page, marked *On the follow-up page only*, and Settings says so.
  The customer's confirmation and the team's answers are
  `transactional` (studio.15): the answer to their own request arrives
  even when the address is a member's who chose no email from the tools.
  Their keys carry the customer's address (studio.16): after a restore
  from a backup, a ticket number can name another customer's request.
  **On a real Chest today there is no mail**: until the Chest ships it,
  sell Support as "a contact form and a shared inbox", not as a Zendesk
  replacement for email.
- **Links in emails and notices** use `chest.tool.publicUrl` (0.4.1: the
  company's own domain once it connected one — `support.acme.com` — else
  the public host) and `chest.tool.teamUrl`, and nothing else: outside a
  Chest (tests, a build) there is no public address, and nothing is
  remembered from a request's `Host`. The day and the working hours are the Chest's time
  zone; email tickets and the public pages' last fallback take the
  Chest's language.
- **Public uploads** — **Proposal (studio)** (`chest.proposals.json`:
  `"files": {"publicUploads": true}`): `files.publicUploadUrl` (a path,
  `/_chest/upload/<token>`, that the browser sends to the address it is
  on — the company's own domain too), `files.claim` and
  `expiresUnclaimedAfter` (a day). Without it the form works as before,
  without files: the public pages ask the Chest once (kept ten minutes)
  and say plainly that files are not taken. A visitor's file reaches them back through
  the tool (`/t/<secret>/files/<id>`, streamed with `files.get`): the
  Chest's signed links are for members' browsers; a signed link on the
  public host would spare the tool the bytes.
- **Several mailboxes** (support@ and sales@, two brands) need nothing
  new of the SDK but a manifest change per company: `mailboxes` is fixed
  in the manifest, so a company cannot add one from Settings. The SDK
  report asks for mailboxes an admin names at install time.
- **Being shown in the company's website** (Settings, "On your
  website"): the public pages send the listed websites in their
  `frame-ancestors`, but the Chest's front adds `frame-ancestors 'none'`
  to every public answer, even with `csp: "tool"` (contract 0.4, "Content-
  Security-Policy"), and two policies intersect: **the frame cannot work
  on a Chest today**, and Settings says so. It needs the Chest to let an
  administrator allow the company's websites (SDK report, "Framing public
  pages").
- **The visitor's address** for the public counters: the package reads
  `Chest-Visitor-Address` (Proposal (studio), set by the Chest's front),
  never `X-Forwarded-For` (the Chest adds none: it would be whatever the
  visitor wrote). Without it — a real 0.4 Chest — a visitor is the
  browser's cookie, and a robot that drops cookies counts only against
  the day's total (300 requests): enough to close the form to everyone
  for the day if it also fetches a fresh token each time and writes
  valid requests. The address would let the Chest's front count it
  alone.

- **Events between tools** — **Proposal (studio)**: `forms.request` from
  Forms, `status.incident` from Status (above); `emits`
  `helpdesk.ticket.solved` and `helpdesk.ticket.reopened` for Goals.
  Without it, Forms' answers stay in Forms, the inbox shows no incident,
  and Goals counts no ticket.
- **`webhooks`** — **Proposal (studio)** (SDK report §4.17,
  `chest.proposals.json` `"webhooks": {"max": 10}`): the Slack, Teams and
  web-address notices (Settings). Without it, Settings says the Chest
  cannot send them yet. The "waiting too long" notice also needs
  **scheduled tasks** (the `late` schedule, every 15 minutes).
- **`chest.tools.link`** — **Proposal (studio)** (SDK report §4.18): the
  link back to an answer in Forms, from the addresses the Chest gives in
  `CHEST_TOOL_URLS`. On a Chest without it, the form is named without a
  link.

## Develop

The stack is the studio starter's: Hono and React rendered on the server,
a few islands in the browser, Vite (`@argentic/chest-app`, its
`AGENTS.md` in `node_modules/@argentic/chest-app/`).

```sh
npm ci
npm run dev       # rebuilds on every change, restarts the server
npm run build     # the type check, the browser's files, the server
npm test          # tsc, the server built into dist/test, the tests (TEST_DATABASE_URL, else PGlite)
npm start         # the built server, as the Chest runs it
```

In the studio: `node lab/chest-dev/dev.mjs tools/public-and-private/helpdesk --reset`
(the `/_dev` page shows the outbox and can send an email to the support
mailbox), `node lab/chest-dev/flows/helpdesk.mjs`,
`node lab/chest-dev/screens.mjs tools/public-and-private/helpdesk`,
`node lab/chest-dev/audit.mjs tools/public-and-private/helpdesk`.

Measured (`lab/measure`, 6 October 2026, the same bench for every tool):
at rest 65 MiB PSS (136.9 on Next.js), first answer after a start 489 ms
(880), image 30 MiB (460); the install and the build fit 512 MiB and one
CPU (they did not on Next.js).

## What it does not do (yet)

- **Email on a real Chest**: the `mail` proposal is not shipped; until
  it is, email in and out works only in the studio's harness.
- **The form inside the company's website** on a real Chest (above,
  "Needs from the SDK"): link to the form's address instead.
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
- **SLA reminders by email**: the wait is counted in working hours and
  highlighted, reports give the first-answer time, and a Slack/Teams
  channel can be told when a request waits too long; nobody is emailed
  when a target is missed, and there is no separate "resolution" target.
- **Asking the team from Support itself**: a colleague's request comes
  from a team form of Forms; My requests shows and answers it, but has no
  "New request" of its own.
- **The ticket's state in Forms**: Forms' "What you sent" does not show
  whether the team answered — the colleague reads it in Support's My
  requests. (A `support.request.updated` event back to Forms would need
  Forms to receive it.)
- **Settings save with a button per box**, unlike Forms' autosave.
- **An event to Status or from it that the Chest cannot take** is not
  retried by Support: the next event of the incident brings it up to
  date.
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
