# Polls — ask the team a quick question, find a date, run a short survey

*Polls* (French interface: *Sondages*) replaces Doodle, Framadate, Slack and
Teams polls, and Officevibe-style weekly pulse surveys (with eNPS, the
trend over time and anonymous two-way feedback), inside the company's own
Chest. A date poll can also be opened to **guests outside the Chest** (a
client, a candidate) through a secret link, on the tool's public host —
which is why Polls is a tool with a public part
(`tools/public-and-private/polls`, moved from `tools/private/` on
2026-09-29). Everyone signed in to the
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
  - **A team pulse** (fourth tile, organisers) — a survey ready to send:
    anonymous, every week, three questions (how the week was, eNPS, anything
    to say), written in the language of whoever asks it.
- **Guests outside the Chest** (date polls): the organiser (or an admin)
  turns on *Anyone with the link can answer* on a named date poll and
  copies the link. A guest opens it on the public host, types a name (an
  email if they want the chosen date), says yes / if need be / no per date
  — no account. They see the poll's words and their own answer, never the
  others' answers or the team's names. Their browser keeps a secret
  (a cookie for that poll's page only; the database keeps its hash) to
  come back and change the answer until the poll closes. The team sees
  them in the grid, marked **Guest**, counted apart ("4 of 7 answered · and
  2 guests"); the organiser sees their emails and may remove an answer
  (after a confirmation: it is deleted for good). Turned off, the link
  stops; on again, it is a new link. Guarded like Forms' and Booking's
  public forms: a field only robots fill, a signed "shown at" token (a
  form sent faster than a person types waits), the Chest's visitor
  counters (20 answers a visitor an hour, 600 for everyone; Polls' own
  counters without them), 300 guests a poll. Once the date is chosen, the
  guest's page shows it with a calendar file, and guests who gave an email
  get it by email (where the Chest sends email).
- **Anyone asks.** Every member of the tool can start a poll (as in Slack
  or Teams); an admin can keep that to organisers (*Settings* on the home
  page). A member's own poll is theirs to edit, close and delete.
- **Company surveys are for organisers.** A survey that **repeats** (a
  pulse) or asks **eNPS** is started by organisers only, unless an admin
  turns on *Everyone can start a team pulse or eNPS*: a weekly opinion
  survey of the whole staff rings everyone's bell every week, and in
  France it is a matter for the works council (see "Works council").
  One-off questions, date polls and plain surveys stay open to everyone.
- **Asked by you**: the organiser's list of what they asked — open ones
  first (closing soonest), drafts, then those closed lately — each with its
  state (*Open*, *Draft*, *Closed*), how many of those asked answered
  ("4 of 7 answered", with a bar) and when it closes. Your own polls are
  not mixed into *To answer*.
- **Two pulses, two names**: a new repeating survey named like one already
  running is named apart — "Météo de l'équipe (2)" — so two identical cards
  never sit side by side in *To answer*.
- **Repeating surveys**: *Repeat — every week / every month*. Each round is
  a poll of its own, opened by itself at the same time for the same people,
  and open until the next one starts. The poll page shows **Over time**: the
  average of each 1–5 question and the eNPS score, round after round, with
  the change since the last round and the numbers in a table. *Stop
  repeating* (undo: *Repeat again*).
- **By team** (anonymous surveys): once closed, the results also per group
  of the Chest — each 1–5 question's average, eNPS, a choice's most given
  answer — for the groups with **5 answers or more**. A group that could
  be worked out by subtraction is hidden too (see "Anonymous polls").
  Free texts are never split by team.
- **Who is asked**: everyone who has Polls, or chosen Chest groups (any
  group of the Chest, with the `groups` proposal) and/or
  **people picked by name**. Those asked get **one item in the Chest's
  bell**, in their own language, and a **number on the Polls tile** until
  they answer.
- **Sign-up sheets**: *Limit the places per answer* on a question or a date
  poll ("2 people per stand slot", "3 seats per car"). Each answer shows
  "2 places left" or "Full"; a full answer cannot be taken (the last place
  goes to one person only); on dates, a *Yes* takes a place and *If need
  be* is not offered; the results grid ends with **Places taken 2/2 ·
  Full**. Named polls only. On a phone, a date grid wider than the screen
  says so ("4 dates: swipe sideways to see them all →").
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
  language, sees it on the poll, and finds it **in their Chest calendar**
  (the `calendar` proposal, as News: one feed per person that Google,
  Outlook or Apple Calendar subscribe to) — everyone asked except those who
  said *No* to that date; it moves when the date changes and leaves when
  the choice is taken back or the poll deleted. The .ics file (RFC 5545;
  all-day or timed, on the Chest's clock) stays, for a Chest without the
  calendar and for anyone who prefers it.
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
- **Per team** (`lib/teams.ts`): an anonymous survey also keeps its counts
  per group of the Chest the answerer belongs to — only groups of **5
  members or more**, never a free text, with no name and no time, rewritten
  with the poll's other anonymous rows in one shuffled transaction. Once
  the survey is closed (and only if its whole results show), a group shows
  from **5 answers**; and never when it could be worked out from what else
  shows: a group inside another shown group (or inside the whole company)
  with 1 to 4 answers less is hidden, and so is the smallest of groups
  apart from each other that together leave 1 to 4 answers out. Who is in
  which group is read from the Chest at that moment; when it cannot say,
  every pair is treated as nested (the safe side). The page says how many
  groups are not shown, and why.
- **An anonymous answer cannot be changed**: nothing says which one is yours.
  The form says so before you send it.
- **Replies to anonymous free texts** (Officevibe's two-way feedback,
  `lib/replies.ts`): when someone writes a free text in an anonymous poll,
  their browser makes a random key and sends only its hash with the text
  (`texts.reply_key`); the key stays in that browser (localStorage). Nothing
  else changes: no member id, no time with the text or its hash. Once the
  poll is closed and its results show (5 answers), those who manage it
  reply under a text (named); everyone asked gets one bell item "Sofia
  replied to an anonymous comment" — never to whom. On the poll's page, the
  author's browser sends its keys; the server hashes them, answers the
  conversations they open and keeps nothing of the asking; the author reads
  the reply ("Only you see this, in this browser") and may answer back,
  stored as *The author (anonymous)* with no time (its id orders the
  conversation). Nobody else asked sees the conversation.

What anonymity here does **not** protect against, honestly:

- **Who has answered.** The participation count ("6 of 7 answered") moves
  as people answer: it says *that* someone answered, never what. Results
  never move while the poll is open.
- **Small groups and free text.** Five answers is a floor, not a guarantee:
  a free text can give its author away by what it says; in a team of six,
  a unanimous result says what everyone answered. The same holds per team.
- **Per-team counts in the database.** While a survey is open, its counts
  per group sit in the database: someone with direct access to it who also
  reads who has answered (`participants`) could, in a group where only one
  person has answered so far, read that person's answer. Nobody can do it
  through Polls, its pages or exports. Groups of fewer than 5 members are
  never counted.
- **Replies, on another browser.** The key lives in the browser the author
  answered with: on another device, or after clearing the browser's data,
  they cannot read the replies (nobody can tell them — that is the point).
- **Replies and the server.** Reading or answering a reply sends the key in
  a request the Chest signs with the member's identity; Polls keeps nothing
  of it, but someone who changed the tool's code, or logs requests with
  their body, could tie the key to the member. The same holds for the
  anonymous answer itself (below).
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
| `organiser` | Everything a member can, and always create polls — even when an admin keeps that to organisers — including company surveys (a repeating pulse, eNPS) |
| `member` | Answer the polls put to them; see results when the organiser allows it; comment on named polls; **create polls** (unless an admin turned *Everyone can start a poll* off) — but not a repeating survey or an eNPS question unless an admin turned *Everyone can start a team pulse or eNPS* on — and for their own polls: see the results at any time (an anonymous poll's only once closed), edit the words and closing time, remind, close, reopen, delete, restore, pick a date poll's final date, stop a pulse's rounds, download the answers |

Admins of the Chest (who arrive as organisers) also manage every poll that is
not a draft: see its results (an anonymous poll's only once closed, like
everyone), close, reopen, delete, download, delete comments; and they choose
whether every member may start a poll, and a company survey. Nobody — admin
or organiser — sees who answered what in an anonymous poll. A poll someone may
not see answers *not found*: a draft is its organiser's alone; an open or
closed poll is seen by those asked, its organiser and admins.

## First minute

- **What a new person sees first**: the home page. *To answer* comes first,
  with each poll's closing time and a big *Answer* button; then *Ask the
  team* with the tiles — a question, find a date, a short survey, and for
  organisers a team pulse — each one line (for everyone, unless an admin
  keeps it to organisers). An organiser finds what they asked in *Asked by
  you*, with how many answered. With nothing to
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
| `/p/[link]` | Public host: a date poll open to guests — the dates, a name (and email), their answer; the chosen date once picked (a language switch) |
| `/p/[link]/calendar` | Public host: the chosen date as an .ics file for guests |
| `/chest` | Home: to answer, asked by you, ask the team, answered and still open, closed recently (a pulse once: its latest round); for admins, *Settings* |
| `/chest/new?kind=choice\|date\|survey` | Composer (whoever may start a poll); `&preset=pulse`: the team pulse (who may start a company survey) |
| `/chest/polls/[id]` | A poll: answer, results, participation, organise |
| `/chest/polls/[id]/edit` | A draft to finish, or an open poll's words and closing time |
| `/chest/polls/[id]/export` | CSV of the answers (those who manage the poll) |
| `/chest/polls/[id]/calendar` | The chosen date as an .ics file (the Chest calendar has it too) |
| `POST /chest-events` | The Chest's lifecycle events (signed) |
| `POST /chest-jobs/pass` | The scheduled pass (signed; Proposal (studio)) |

## On a Chest

- `public: true` with `"csp": "tool"` (the guest pages, Next.js's own
  policy as Forms and Booking); the owner opens the public part in the
  Chest — until then, the guest link cannot be reached (and the organiser's
  card cannot show a public address). Public pages wear the company's brand
  or Polls' own look, never a catalogue theme chosen for the team.
- `capabilities`: `database`; `members` (names, photos, groups, who is
  asked, people found by name); `notifications` (the bell, the tile's
  number); `receives: ["member.*"]`. Proposal (studio), in
  `chest.proposals.json`: `mail: {send: true}` — reminders by email, one
  per person, sent to `{member}` (Polls never sees an address); without it,
  reminders are bell items only; it also sends a guest the chosen date.
  `calendar: true` — the chosen date in each person's Chest calendar.
  `groups: "read"` with `receives:
  ["group.*"]` — every group of the Chest as an audience, and results per
  team; without it, only the groups that give Polls.
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
- **Groups**: with the `groups` proposal Polls sees every group of the
  Chest (Sales, Tech…) even when it is open to everyone; without it, the
  Chest shows a tool only the groups that *give* it access, and if none
  does, the composer offers people by name ("No group gives Polls here:
  add people by name").
- **Works council (France, Code du travail L.2312-38)**: a survey of the
  staff's opinion that comes back every week, or an eNPS, is the kind of
  tool a company of 50 or more informs its CSE about. That is why it is for
  organisers by default, and why an admin who opens it to everyone reads
  so under the switch. Results are counts only, from 5 answers, per team
  from 5 answers (above); nobody sees who answered what.
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
- `groups: "read"` — **Proposal (studio)**, in `vendor/` (`members.groups.all`,
  `members.groups.members`, `group.*` events): any group of the Chest as an
  audience; results per team (`lib/groups.ts`, adapted from News).
- `calendar` — **Proposal (studio)**: the chosen date in each person's
  Chest calendar (`calendar.put`, key `poll:<id>`); without it, the .ics
  file (Polls remembers the Chest's answer in `settings.calendar`).
- `visitors` — **Proposal (studio)**: the guest form's token and the
  Chest's counters of visitors; without them, Polls counts in its own
  table (`guest_counts`).
- `chest.publicUrl()` — **Proposal (studio)**: the guest link's address
  (else derived from the request, as Booking does).
- Wanted, not built:
  - **A broadcast to members by id** (`to: { members: [ids] }`) and one
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

In the studio: `node lab/chest-dev/dev.mjs tools/public-and-private/polls --prod --reset
--port 5500` (the sample polls of `seed/sample.sql`),
`node lab/chest-dev/flows/polls.mjs 5500` (browser flows),
`node lab/chest-dev/screens.mjs tools/public-and-private/polls --port 5500`,
`node lab/chest-dev/audit.mjs tools/public-and-private/polls --port 5500`.

## What it does not do (yet)

- **Guests**: on date polls only (not a question, not a survey), never
  anonymous; no comments by guests; a guest changes their answer from the
  browser they answered with only (no "edit link" by email); guests are not
  reminded; a guest's answer is kept with the poll (deleted with it, or by
  the organiser) — there is no separate retention for guests' names and
  emails yet. The public part must be opened by the Chest's owner.
- **Replies to anonymous texts**: only on free-text questions (not an
  "Other" answer), only once the poll is closed with 5 answers, 20 messages
  a conversation; the author reads them in the browser they answered with;
  no email to the author (nobody knows who they are).
- **Per manager** (Officevibe's heat map by manager): results are per Chest
  group only — the Chest has no manager relation. Named polls have no team
  view (their names are shown already). A question bank and a driver model
  (recognition, workload…) are not there: the pulse has three questions.
- **Importing past Officevibe or Doodle data**: none. A pulse's history
  starts with its first round in Polls; the old one stays in Officevibe's
  export. (Doodle exports only an Excel file, on paid plans — nothing worth
  importing for short-lived polls.)
- **An export of every poll at once** for an admin: one CSV per poll.
- Participants adding options; ranking questions; a date picker showing
  more than one month (the days to propose are the kit's calendar, one
  month at a time); calendar conflict hints on dates; time zones other
  than the Chest's for date options; push reminders.
