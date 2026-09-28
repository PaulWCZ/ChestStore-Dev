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
- After sending, a **follow-up page** whose address is a secret link (192
  bits; only its hash is stored): the answers, the state, and a box to write
  again (which reopens the request). The link is also emailed when the Chest
  can send email.

**For the team (`/chest`):**
- A shared **inbox** in folders — *Unassigned, Mine, Open, Waiting, Closed*
  (and *Spam* when there is some) — oldest waiting first; search by words,
  customer email or number.
- A **ticket**: the conversation, a composer with *Reply* or *Internal note*
  (notes never reach the customer), *Send* or *Send and close*, **saved
  replies** with `{customer}` and `{agent}`, assign (or *Take it*), close
  with *Undo*, spam, the customer's other requests, and "Hugo is on this
  ticket too" when someone else has it open.
- **New ticket** for a customer who called or came by.
- **Settings**: the company name and a sentence on the form, open or close
  the form, saved replies, retention of closed tickets, **erase a
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
| `admin` | Administrator | everything, the settings, erasing a customer's data |
| `agent` | Agent | read, answer, note, assign, close, saved replies, export |
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
| `/lang/<code>` | anyone | remembers the public language |
| `/chest` (`?folder=`, `?q=`) | members with a role | the inbox |
| `/chest/tickets/<number>` | idem | a ticket |
| `/chest/new`, `/chest/settings`, `/chest/export` | idem (writing: agents, admins) | new ticket, settings, CSV |
| `/chest/files/<id>` | idem | an attachment (a fresh 15-minute link) |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-mail` | the Chest only (signed) — proposal | received email |
| `/chest-jobs/cleanup` | the Chest only (signed) — proposal | nightly retention |

## On a Chest

- `public: true`, `csp: "tool"` (Next.js needs its own nonce policy).
- `capabilities`: `database`; `files` (attachments of received emails);
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
- **Public uploads** (not built): customers cannot attach a file to the
  form yet (they can by email, once mail exists).
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

Tags, priorities, SLA timers and reminders, satisfaction ratings, merging
tickets, reports, imports from Zendesk/Freshdesk, live chat, a knowledge
base (that is the Wiki), attachments on the public form.
