# Polls — ask the team a quick question, find a date, run a short survey

*Polls* (French interface: *Sondages*) replaces Doodle, Framadate, Slack and
Teams polls, and Officevibe-style pulse surveys, inside the company's own
Chest. Everyone already signed in to the Chest can answer in a few seconds;
the organiser sees the results as they come in, or when the poll closes.

## What it does

- **Three kinds of poll**, each explained in one line on the home page:
  - **A question** — one answer or several, with an optional "Other" in the
    person's own words.
  - **Find a date** — candidate days tapped on a calendar, each all day or
    with times; everyone answers *Yes*, *If need be* or *No* per date
    (Doodle/Framadate style). The best date (most who can come, then most
    *Yes*, then the earliest) is highlighted.
  - **A short survey** — up to ten questions: choices, a 1–5 scale (with
    words for both ends), free text.
- **Who is asked**: everyone who has Polls, or chosen Chest groups. Those
  asked get **one item in the Chest's bell**, in their own language, and a
  **number on the Polls tile** until they answer.
- **One answer per member**, bound to the member the Chest signs in — never
  to anything the browser sends. A named answer can be changed until the
  poll closes.
- **Closing**: at a date and time (optional) or by hand (*Close now*, undone
  by *Undo*/*Reopen*). **Results** show live or only after the close — the
  organiser chooses; the organiser always sees them.
- **Results**: bars with counts and percentages; who answered what (named
  polls only); participation ("4 of 7 answered") and, for the organiser, who
  has not answered yet; the date poll's grid (people × dates); scale
  averages; free texts; **CSV download** in the reader's language.
- **The chosen date**: after a date poll closes, the organiser picks the date
  and *Tell everyone*: everyone asked gets a bell item with the date in their
  language, sees it on the poll, and can **add it to their calendar** (.ics,
  RFC 5545; all-day or timed, on the Chest's clock).
- **Reminder**: the day before a poll closes, those who have not answered
  get one bell item ("Closes tomorrow: …") — only for polls sent more than a
  day before their close. The organiser is told when their poll closed by
  its date (for a date poll: "Pick the date and tell everyone").
- **Drafts**: save a poll as a draft and send it later; a new poll's words
  are also kept in the browser until saved, so a closed tab loses nothing.
- **Delete with undo**; a deleted poll is purged after 30 days.

## Anonymous polls — the design, and its limits

The organiser ticks *Anonymous* when writing the poll. Then:

- **No member id is stored with an answer.** What people answered is kept
  as counts (`tallies`: "option 12 was chosen 3 times", "4 people gave 5")
  and free texts (`texts`) that name nobody and carry no time.
- **A separate table, `participants`, records only "has answered"**: it
  stops double votes, gives the "x of y answered" count, keeps the badge and
  the reminder right. It is never joined to the answers — there is nothing
  to join on.
- **Order and database stamps do not give people away**: each anonymous
  answer rewrites *all* of the poll's participants, counts and texts in one
  transaction, in a random order (cryptographic shuffle). Every row then
  carries the same transaction id (`xmin`) and a new place on disk; neither
  row order, ids nor PostgreSQL's own stamps say which answer came last
  (tested in `test/answers.test.ts`).
- **Results are hidden while fewer than 5 people have answered** — from
  everyone, including the organiser and the Chest's admins — and free texts
  are shown in a random order. The organiser never sees *who* has answered
  an anonymous poll, only how many. The CSV holds counts and texts only.
- **An anonymous answer cannot be changed**: nothing says which one is yours.
  The form says so before you send it.

What anonymity here does **not** protect against, honestly:

- **Watching live.** With *Show them as answers come in*, someone who sees
  the count go from 7 to 8 right after a colleague says "done" can guess
  that colleague's answer. When anonymity matters, choose *Show them when the
  poll closes* (the composer switches to it when *Anonymous* is ticked).
- **Small groups and free text.** Five answers is a floor, not a guarantee:
  a free text can give its author away by what it says; in a team of six,
  a unanimous result says what everyone answered.
- **The server's administrator.** Someone with direct access to the
  database server (not through the Chest) could keep copies of the database
  between two answers and compare them, or read old row versions on disk
  before PostgreSQL cleans them up. The Chest's request logs may also note
  *when* a member used the tool. Nobody can do this through Polls, its
  pages, its exports or the Chest's admin screens.
- Anonymous polls **must not be used to evaluate individuals** (in France,
  Code du travail L.1222-3 would require prior information on the method).

## Roles

| Role | Can |
|---|---|
| `organiser` | Everything a member can; create polls; see the results of their polls at any time; edit their words and closing time; close, reopen, delete, restore them; pick a date poll's final date; download the answers |
| `member` | Answer the polls put to them; see results when the organiser allows it |

Admins of the Chest (who arrive as organisers) also manage every poll that is
not a draft: see its results, close, reopen, delete, download. Nobody — admin
or organiser — sees who answered what in an anonymous poll. A poll someone may
not see answers *not found*: a draft is its organiser's alone; an open or
closed poll is seen by those asked, its organiser and admins.

## First minute

- **What a new person sees first**: the home page. *To answer* comes first,
  with each poll's closing time and a big *Answer* button; an organiser then
  sees *Ask the team* with the three kinds, each one line. With nothing to
  answer: "Nothing to answer. You're all caught up!"
- **The first thing they do**: tap the bell item or the card, tap an answer,
  *Send my answer*. **Two taps** for a question, one tap per date plus
  *Send* for a date poll. Confetti, then "Thanks! Your answer is in."
- **An organiser's main job**: *A question* → type the question and two
  answers → *Send to the team*: **three fields and one button**. Everyone is
  told in their bell.
- **A mistake**: a wrong answer → *Change my answer* (named polls, until the
  close); closed too early → *Undo* in the toast, or *Reopen*; deleted →
  *Undo*; a date chosen by mistake → *Change the date* (everyone is told
  again, the calendar event replaced). An anonymous answer cannot be changed —
  the form says so before sending.

## Routes

| Route | What |
|---|---|
| `/` | Public host: "Polls lives in your Chest", with a language switch |
| `/chest` | Home: to answer, ask the team (organisers), your polls, answered and still open, closed recently |
| `/chest/new?kind=choice\|date\|survey` | Composer (organisers) |
| `/chest/polls/[id]` | A poll: answer, results, participation, organise |
| `/chest/polls/[id]/edit` | A draft to finish, or an open poll's words and closing time |
| `/chest/polls/[id]/export` | CSV of the answers (those who manage the poll) |
| `/chest/polls/[id]/calendar` | The chosen date as an .ics file |
| `POST /chest-events` | The Chest's lifecycle events (signed) |
| `POST /chest-jobs/pass` | The scheduled pass (signed; Proposal (studio)) |

## On a Chest

- `capabilities`: `database`; `members` (names, photos, groups, who is
  asked); `notifications` (the bell, the tile's number);
  `receives: ["member.*"]`.
- **Telling those asked** uses one `notifications.broadcast` per poll
  (Proposal (studio): each member's item in their language, 30 an hour,
  outside the recipients quota). Where the Chest has no broadcast, and for
  reminders (only those who have not answered), Polls lists members 500 at
  a time and tells them in their language; the Chest takes **1,000
  recipients an hour**: beyond, Polls keeps where it stopped and goes on at
  the next pass.
- **Without schedules**: polls close by their date on the next page view
  (closing is evaluated on every read), and the same pass (closing
  follow-ups, reminders, tellings, purge) runs at most once a minute when
  someone opens a page. With the `pass` schedule (every 15 minutes) it runs
  on time.
- **Groups**: the Chest shows a tool only the groups that *give* it access.
  If Polls is open to everyone through no group, the composer says "No group
  gives Polls here, so everyone is asked."
- **Someone loses access**: nothing changes; they are no longer asked or
  counted. **Someone leaves**: their open polls stay open (organiser shown
  "(former member)"; an admin can close them), their answers stay, their
  drafts are deleted. **An erasure**: their named answers stay counted but
  read "Former member"; polls they organised are authored `erased`; their
  drafts are deleted; the erasure is acknowledged.
- No WebSocket: an open poll re-reads itself every 20 s, the home page every
  30 s, while visible.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: the interface and
  the bell in each member's language.
- `notifications.broadcast` — **Proposal (studio)**: telling a poll's
  audience in one call; Polls falls back to paged `notify` without it.
- `schedules` — **Proposal (studio)**: `chest.proposals.json` declares `pass`
  every 15 minutes. Without it, Polls still works (see above).
- `chest.timeZone()` / `today()` — **Proposal (studio)**: dates and closing
  times on the Chest's clock.
- Wanted, not built: **`members.groups.list({ all: true })`** — all of the
  Chest's groups (not only those that give the tool) so a tool open to
  everyone can still ask "Sales only"; a **broadcast that excludes members**
  (`except: [ids]`) so a reminder or a poll's first telling need not page
  through members; **email** for reminders, since the bell reaches only
  those who open their Chest.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/polls --prod --reset
--port 5500` (five sample polls from `seed/sample.sql`),
`node lab/chest-dev/flows/polls.mjs 5500` (browser flows),
`node lab/chest-dev/screens.mjs tools/private/polls --port 5500`,
`node lab/chest-dev/audit.mjs tools/private/polls --port 5500`.

## What it does not do (yet)

Comments on a poll; participants adding options; limits per option (a
sign-up sheet); recurring pulse surveys with a trend chart (needs
schedules per poll); ranking questions; guests outside the Chest (no public
voting link); email or push reminders; import from Doodle (Doodle exports
only an Excel file, on paid plans — nothing worth importing for short-lived
polls); calendar conflict hints on dates; time zones other than the Chest's
for date options.
