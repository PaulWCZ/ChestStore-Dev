# Polls — ask the team a quick question, find a date, run a short survey

*Polls* (French interface: *Sondages*) replaces Doodle, Framadate, Slack and
Teams polls, and Officevibe-style weekly pulse surveys (with eNPS and the
trend over time), inside the company's own Chest. Everyone signed in to the
Chest can ask the team and answer in a few seconds; the organiser sees the
results as they come in, or when the poll closes — an anonymous poll shows
them to everyone, organiser included, only once it closes.

## What it does

- **Three kinds of poll**, each explained in one line on the home page:
  - **A question** — one answer or several, with an optional "Other" in the
    person's own words.
  - **Find a date** — candidate days tapped on a calendar, each all day or
    with times; everyone answers *Yes*, *If need be* or *No* per date
    (Doodle/Framadate style). The best date (most who can come, then most
    *Yes*, then the earliest) is highlighted.
  - **A short survey** — up to ten questions: choices, a 1–5 scale (with
    words for both ends), free text, and **eNPS** (0–10, "How likely are
    you to recommend working here to a friend?"; the score — share of 9–10
    minus share of 0–6 — is shown with its meaning in plain words).
  - **A team pulse** (fourth tile) — a survey ready to send: anonymous,
    every week, three questions (how the week was, eNPS, anything to say).
- **Anyone asks.** Every member of the tool can start a poll (as in Slack
  or Teams); an admin can keep that to organisers (*Settings* on the home
  page). A member's own poll is theirs to edit, close and delete.
- **Repeating surveys**: *Repeat — every week / every month*. Each round is
  a poll of its own, opened by itself at the same time for the same people,
  and open until the next one starts. The poll page shows **Over time**: the
  average of each 1–5 question and the eNPS score, round after round, with
  the change since the last round and the numbers in a table. *Stop
  repeating* (undo: *Repeat again*).
- **Who is asked**: everyone who has Polls, or chosen Chest groups and/or
  **people picked by name**. Those asked get **one item in the Chest's
  bell**, in their own language, and a **number on the Polls tile** until
  they answer.
- **Sign-up sheets**: *Limit the places per answer* on a question or a date
  poll ("2 people per stand slot", "3 seats per car"). Each answer shows
  "2 places left" or "Full"; a full answer cannot be taken (the last place
  goes to one person only); on dates, a *Yes* takes a place and *If need
  be* is not offered. Named polls only.
- **Comments** on a named poll ("I can do the 17th, but only after 8 pm"),
  by those asked and those who manage it; the organiser hears of them in the
  bell; deleting one is undone from the toast. Anonymous polls take none.
- **Remind those who haven't answered** (the organiser, at most every 12
  hours): a bell item and, where the Chest sends email, one email each.
- **One answer per member**, bound to the member the Chest signs in — never
  to anything the browser sends. A named answer can be changed until the
  poll closes.
- **Closing**: at a date and time (optional) or by hand (*Close now*, undone
  by *Undo*/*Reopen*). **Results** show live or only after the close — the
  organiser chooses; the organiser always sees them — except in an
  anonymous poll (below).
- **Results**: bars with counts and percentages; who answered what (named
  polls only); participation ("4 of 7 answered") and, for the organiser, who
  has not answered yet; the date poll's grid (people × dates); scale
  averages; free texts; **CSV download** in the reader's language.
- **The chosen date**: after a date poll closes, the organiser picks the date
  and *Tell everyone*: everyone asked gets a bell item with the date in their
  language, sees it on the poll, and can **add it to their calendar** (.ics,
  RFC 5545; all-day or timed, on the Chest's clock).
- **Reminder**: the day before a poll closes, those who have not answered
  get one bell item ("Closes tomorrow: …"), and an email where the Chest
  sends them — only for polls sent more than a day before their close. The organiser is told when their poll closed by
  its date (for a date poll: "Pick the date and tell everyone").
- **Drafts**: save a poll as a draft and send it later; a new poll's words
  are also kept in the browser until saved, so a closed tab loses nothing.
- **Delete with undo**; a deleted poll is purged after 30 days.
- **Honest edits**: once people have answered, only the words and the
  closing time change, and the poll then says "Edited after 3 answers".

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
- **Results show only once the poll is closed — to everyone at once, the
  organiser and the Chest's admins included — and only from 5 answers.**
  While it is open nobody sees a number move: watching the results after
  each answer ("6 of 7", then "7 of 7" right after a colleague says "done")
  would tell what that colleague answered. *Live results* cannot be chosen
  with *Anonymous* (the composer does not offer it; the server and the
  database refuse it). The CSV is refused while it is open.
- **A closed anonymous poll is never reopened** — not by its organiser, not
  by an admin: reopening and closing again would let anyone compare the two
  results and read the answers given in between. *Close now* asks a second
  tap ("Close for good") instead of offering *Undo*.
- Free texts are shown in a random order. The organiser never sees *who*
  has answered an anonymous poll, only how many; *Remind those who haven't
  answered* reaches them without naming them. The CSV holds counts and
  texts only. An anonymous poll takes no comments and no place limits (both
  name people).
- **A repeating pulse** compares rounds, never answers: each round is its
  own anonymous poll, shown once closed and from 5 answers.
- **An anonymous answer cannot be changed**: nothing says which one is yours.
  The form says so before you send it.

What anonymity here does **not** protect against, honestly:

- **Who has answered.** The participation count ("6 of 7 answered") moves
  as people answer: it says *that* someone answered, never what. Results
  never move while the poll is open.
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

## Looks

Polls wears the look the company chooses in its Chest, with the same
features: its own identity, **Confetti** (coral, deep navy and mint on warm
paper, chunky rounded shapes — `lib/theme.ts`), any theme of the store's
catalogue (the 17 tools' identities, "Chest", "High contrast"), or the
company's own brand (its colours, fonts, corners and logo — the logo then
stands where the Polls mark is). The choice may be for all tools or for
Polls alone; the page reads it on the server (`chest.theme()`), no script.
Every look keeps every text readable (WCAG AA): the kinds of poll and the
charts use the theme's categorical palette, "yes" and "if need be" its ok
and wait states — each always with its icon and its word. The screens of
`docs/screens/` show Workshop, Library, Chest and a sample brand beside the
tool's own look.

Its shared pieces come from the store's UI kit (`@argentic/chest-ui`,
`vendor/`): the app shell, toasts with an Undo that tells the truth, the
Confirm before closing an anonymous poll for good, the people picker, the
date field and time lists of the composer, avatars, badges and empty
states.

## Roles

| Role | Can |
|---|---|
| `organiser` | Everything a member can, and always create polls — even when an admin keeps that to organisers |
| `member` | Answer the polls put to them; see results when the organiser allows it; comment on named polls; **create polls** (unless an admin turned *Everyone can start a poll* off), and for their own polls: see the results at any time (an anonymous poll's only once closed), edit the words and closing time, remind, close, reopen, delete, restore, pick a date poll's final date, stop a pulse's rounds, download the answers |

Admins of the Chest (who arrive as organisers) also manage every poll that is
not a draft: see its results (an anonymous poll's only once closed, like
everyone), close, reopen, delete, download, delete comments; and they choose
whether every member may start a poll. Nobody — admin
or organiser — sees who answered what in an anonymous poll. A poll someone may
not see answers *not found*: a draft is its organiser's alone; an open or
closed poll is seen by those asked, its organiser and admins.

## First minute

- **What a new person sees first**: the home page. *To answer* comes first,
  with each poll's closing time and a big *Answer* button; then *Ask the
  team* with four tiles — a question, find a date, a short survey, a team
  pulse — each one line (for everyone, unless an admin keeps it to
  organisers). With nothing to
  answer: "Nothing to answer. You're all caught up!"
- **The first thing they do**: tap the bell item or the card, tap an answer,
  *Send my answer*. **Two taps** for a question, one tap per date plus
  *Send* for a date poll. Confetti, then "Thanks! Your answer is in."
- **An organiser's main job**: *A question* → type the question and two
  answers → *Send to the team*: **three fields and one button**. Everyone is
  told in their bell. *A team pulse* → *Send to the team*: **one button**,
  and it comes back every week.
- **A mistake**: a wrong answer → *Change my answer* (named polls, until the
  close); closed too early → *Undo* in the toast, or *Reopen* (not an
  anonymous poll: its close is confirmed instead); deleted →
  *Undo*; a date chosen by mistake → *Change the date* (everyone is told
  again, the calendar event replaced). An anonymous answer cannot be changed —
  the form says so before sending.

## Routes

| Route | What |
|---|---|
| `/` | Public host: "Polls lives in your Chest", with a language switch |
| `/chest` | Home: to answer, ask the team, your polls, answered and still open, closed recently (a pulse once: its latest round); for admins, *Settings* |
| `/chest/new?kind=choice\|date\|survey` | Composer (whoever may start a poll); `&preset=pulse`: the team pulse |
| `/chest/polls/[id]` | A poll: answer, results, participation, organise |
| `/chest/polls/[id]/edit` | A draft to finish, or an open poll's words and closing time |
| `/chest/polls/[id]/export` | CSV of the answers (those who manage the poll) |
| `/chest/polls/[id]/calendar` | The chosen date as an .ics file |
| `POST /chest-events` | The Chest's lifecycle events (signed) |
| `POST /chest-jobs/pass` | The scheduled pass (signed; Proposal (studio)) |

## On a Chest

- `capabilities`: `database`; `members` (names, photos, groups, who is
  asked, people found by name); `notifications` (the bell, the tile's
  number); `receives: ["member.*"]`. Proposal (studio), in
  `chest.proposals.json`: `mail: {send: true}` — reminders by email, one
  per person, sent to `{member}` (Polls never sees an address); without it,
  reminders are bell items only.
- **Telling those asked** uses one `notifications.broadcast` per poll
  (Proposal (studio): each member's item in their language, 30 an hour,
  outside the recipients quota). Where the Chest has no broadcast, and for
  reminders (only those who have not answered), Polls lists members 500 at
  a time and tells them in their language; the Chest takes **1,000
  recipients an hour**: beyond, Polls keeps where it stopped and goes on at
  the next pass.
- **Without schedules**: polls close by their date on the next page view
  (closing is evaluated on every read), and the same pass (closing
  follow-ups, the next rounds of repeating surveys, reminders, tellings,
  purge) runs at most once a minute when someone opens a page. With the
  `pass` schedule (every 15 minutes) it runs on time. A round missed while
  nobody came is skipped, never opened in a burst.
- **Groups**: the Chest shows a tool only the groups that *give* it access.
  If Polls is open to everyone through no group, the composer offers people
  by name ("No group gives Polls here: add people by name").
- **Someone loses access**: nothing changes; they are no longer asked or
  counted. **Someone leaves**: their open polls stay open (organiser shown
  "(former member)"; an admin can close them), their answers and comments
  stay, their drafts are deleted, their repeating surveys stop. **An
  erasure**: their named answers stay counted but read "Former member", so
  do their comments; polls they organised are authored `erased`; their
  repeating surveys stop; their id leaves the lists of people picked by
  name; their drafts are deleted; the erasure is acknowledged.
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
- `mail` — **Proposal (studio)**: reminders by email (`send` to `{member}`).
- Wanted, not built:
  - **A public part for guests without a Chest account** — Doodle's main
    outside use (a client meeting, a candidate's interview slot). Polls is
    a private-only tool; it would need `public: true` and a way for a
    visitor to answer one date poll through an unguessable link, with a
    name field and no account, rate-limited per link and per address. The
    public-part and `visitors` proposals give the pieces; turning a private
    tool into a public-and-private one (a second host, its own CSP, a
    public page per poll) is a structure change for the studio to decide.
  - **`members.groups.list({ all: true })`** — all of the Chest's groups
    (not only those that give the tool) so a tool open to everyone can
    still ask "Sales only"; until then, people picked by name.
  - A **broadcast to members by id** (`to: { members: [ids] }`) and one
    that **excludes members** (`except: [ids]`), so a poll put to people by
    name, a reminder or a poll's first telling need not page through
    members.
  - **Push to a phone**: the bell reaches only those who open their Chest;
    email helps; a push would be Officevibe's Slack nudge.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/polls --prod --reset
--port 5500` (the sample polls of `seed/sample.sql`),
`node lab/chest-dev/flows/polls.mjs 5500` (browser flows),
`node lab/chest-dev/screens.mjs tools/private/polls --port 5500`,
`node lab/chest-dev/audit.mjs tools/private/polls --port 5500`.

## What it does not do (yet)

- **Guests outside the Chest**: no public answering link (see *Needs from
  the SDK*). A meeting with a client or a candidate still needs Doodle or an
  email thread.
- **Pulse breakdowns per team or manager** (Officevibe's heat map): only the
  whole audience's results. A per-group breakdown with its own five-answer
  floor is possible, not built.
- **Importing past Officevibe or Doodle data**: none. A pulse's history
  starts with its first round in Polls; the old one stays in Officevibe's
  export. (Doodle exports only an Excel file, on paid plans — nothing worth
  importing for short-lived polls.)
- **An export of every poll at once** for an admin: one CSV per poll.
- Participants adding options; ranking questions; a date picker showing
  more than one month (the days to propose are the kit's calendar, one
  month at a time); calendar conflict hints on dates; time zones other
  than the Chest's for date options; push reminders.
