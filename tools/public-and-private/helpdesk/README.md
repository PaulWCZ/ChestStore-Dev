# Support — answer your customers together

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server. It replaces **Zendesk, Freshdesk or Help Scout** for a small
company: a public contact form, one shared inbox, replies and internal notes.

## What it does

**For customers (the public part, no account):**
- A contact form in the company's name (name, email, subject, message), in
  English or French with a visible switch, protected without a captcha (a
  hidden field, a signed "shown at" time, 5 requests an hour per visitor and
  100 an hour in all).
- **Files** on the form and when writing again: photos, PDF, Word, Excel
  or text, 10 MB each, 5 a message. They go from the visitor's browser
  straight to the Chest; what comes back is a one-time claim only that
  visitor holds, so nobody can attach (or open) someone else's file.
  Files never sent with a message are deleted by the Chest after a day.
- After sending, a **follow-up page** whose address is a secret link (192
  bits; only its hash is stored): the answers, the state, and a box to write
  again (which reopens the request). The link is also emailed when the Chest
  can send email. The files of the request (theirs, and those the team
  sent with its answers — never a note's) download from there.

**For the team (`/chest`):**
- A shared **inbox** in folders — *Unassigned, Mine, Open, Waiting, Closed*
  (and *Spam* when there is some) — the customer who has waited longest
  first; search by words, customer email or number; filter by **priority**
  or **tag**, or sort *Most urgent* or *Latest activity* first.
- **Waiting since**: each open ticket says how long its customer has
  waited for an answer ("Waiting 3 h") — from their first message the team
  has not answered; a reply ends it. Past the threshold an admin sets
  (24 hours by default; 1 hour to 3 days, or never) it is highlighted in
  the customer's colour, in bold, and said to screen readers. Hours of the
  clock, nights and weekends included (no business hours yet).
- **Priority**: *Low, Normal, High, Urgent*, in words with a sign (a
  flag for urgent, outlined in red; chevrons for high and low) — never
  colour alone. Normal says nothing; urgent rows carry a red edge.
- **Tags**: a short shared list. Whoever answers adds one on a ticket
  (typed, or picked from the list: new ones are created on the fly, the
  same name whatever its case), removes it, clicks it to see every ticket
  carrying it. Ten a ticket, 200 in all. An admin renames them (a name
  that exists merges the two) and deletes them, with *Undo*.
- A **ticket**: the conversation, a composer with *Reply* or *Internal note*
  (notes never reach the customer), *Send* or *Send and close*, **saved
  replies** with `{customer}` and `{agent}`, **files** on a reply (sent
  with the email) or a note, priority and tags, assign (or *Take it*), close
  with *Undo*, spam, the customer's other requests, and "Hugo is on this
  ticket too" when someone else has it open.
- **New ticket** for a customer who called or came by.
- **Settings**: the company name and a sentence on the form, open or close
  the form, the "waiting too long" threshold, the tags, saved replies,
  retention of closed tickets, **erase a
  customer's data** (their right to erasure), export all tickets (CSV).
- **The bell**: a new request tells everyone who answers; a customer's new
  message tells the ticket's agent; giving a ticket to someone tells them —
  each in their own language. The tile's number: open tickets nobody took
  plus open ones given to you.

**By email** (when the Chest has mail — see "Needs from the SDK"): replies
go out from the company's support address, threaded ("Re: … [#1042]");
email sent to that address opens a ticket or continues one (by the email's
headers, or its number from the same customer); a closed ticket reopens.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `admin` | Administrator | everything, the settings (threshold, renaming and deleting tags), erasing a customer's data |
| `agent` | Agent | read, answer, note, assign, close, priority, tags (adding a new one), files, saved replies, export |
| `viewer` | Viewer | read the tickets |
| (none) | — | "You can't use Support yet" |

## First minute

- **What a new agent sees:** *Unassigned*, with the oldest waiting request
  on top. On an empty Chest: "Your shared inbox is ready", and a button to
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
| `/` | anyone | the contact form |
| `/t/<secret>` | whoever has the link | a request's follow-up page |
| `/t/<secret>/files/<id>` | idem | a file of that request (not a note's), as a download |
| `/lang/<code>` | anyone | remembers the public language |
| `/chest` (`?folder=`, `?q=`, `?priority=`, `?tag=`, `?sort=`) | members with a role | the inbox (a tag without a folder: every ticket carrying it) |
| `/chest/tickets/<number>` | idem | a ticket |
| `/chest/new`, `/chest/settings`, `/chest/export` | idem (writing: agents, admins) | new ticket, settings, CSV |
| `/chest/files/<id>` | idem | an attachment (a fresh 15-minute link) |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-mail` | the Chest only (signed) — proposal | received email |
| `/chest-jobs/cleanup` | the Chest only (signed) — proposal | nightly retention |

## On a Chest

- `public: true`, `csp: "tool"` (Next.js needs its own nonce policy).
- `capabilities`: `database`; `files` (attachments: the form's, the
  team's, received emails');
  `members` (names, and who answers: roles `admin`, `agent`);
  `notifications`; `receives: ["member.*"]`.
- **Customers are not members**: their email and name are kept to answer
  them, erased on request (Settings), and closed tickets are deleted after
  the retention (24 months by default; 0 keeps them). The CNIL's guidance
  on customer data applies: say it in your privacy notice.
- **A member leaves**: their tickets go back to *Unassigned*. **Erasure**:
  their answers stay (customers received them), signed "Former member".
- No WebSocket: the inbox and a ticket re-read themselves every 20 s.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`.
- **`mail`** — **Proposal (studio)** (`chest.proposals.json`: `send`,
  mailbox `support`). Without it the tool is fully usable: replies are on
  the customer's follow-up page, marked *On the follow-up page only*, and
  Settings says so.
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
- **The public host's address** is derived from the request (and
  remembered for emails sent outside a request); the Chest should give it
  (`CHEST_PUBLIC_URL`).
- **The visitor's address** for the form's counters is read from
  `X-Forwarded-For`, assumed set by the Chest's front.

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

SLA timers, business hours and reminders (the wait is highlighted, nobody
is emailed), automatic rules (tag or prioritise on arrival), bulk actions
on several tickets, satisfaction ratings, merging tickets, reports,
imports from Zendesk/Freshdesk, live chat, a knowledge base (that is the
Wiki), image previews in the thread (files open in a new tab), a
customer choosing the priority. The tool does not scan files for viruses
(neither does the Chest); it serves them only as downloads.
