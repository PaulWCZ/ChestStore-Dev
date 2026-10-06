# Tasks — plan the team's work, give it to someone, see what is late

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Trello, Asana or Monday**
for the work of a small company's teams — the 80 % they use every day.

## What it does

- **My tasks** (home): everything given to me on any board — cards, and
  steps of a card's checklist given to me (subtasks, their card named
  under them) — grouped *Late, Today, This week, Later, No date*; one tap
  ticks it done (a card moves to its board's "done" column), with *Undo*.
  My boards underneath.
- **Boards** of columns of cards, from a template (*To do / Doing / Done*,
  a project, a newcomer's arrival, or empty). Visible to everyone in Tasks,
  or private: the people and groups are chosen right in the *New board*
  dialog, and a private board says so in its header (a lock, "Only you",
  "3 people · 1 group").
- **Cards**: title, description (a small Markdown: **bold**, *italic*,
  lists, headings, links), people, due date with an optional time, start
  date, labels, the board's own **fields**, **checklists** (several, each
  step may be given to someone with a date), comments with **@mentions**
  (edit and delete your own, with *Undo*), files, and a history. A big
  **Mark done** button (and *Reopen*). **Move or copy** a card to another
  board (labels and fields follow by name; people who cannot see that
  board are taken off, and the history says where it came from).
  Drag and drop with the mouse, the finger (long press) or the keyboard:
  **Enter opens a card**, Space picks it up, the arrows move it, Space
  drops it. Quick add at the bottom of each column. On a phone, the
  columns are named above the board; one tap scrolls to one.
- **Fields** (Monday's columns): text, a number, or one choice among
  options, per board, set on each card, shown in the list and exported.
- **List view**: sort by any heading (title, column, people, start, due),
  group by column, person or due date; done cards hidden unless asked;
  every title a link that opens the card. On a phone, stacked cards
  (title, column, date, people) instead of a wide table.
- **On a phone**, the board's view switch, filters and search fold behind
  one **View and filters** button: the first card shows near the top of
  the screen (about 280 px down at 390 × 844, it was 454).
- **"Late" never by colour alone**: a late date says *Late* with a warning
  sign, and **labels show their names** on the card face — in the Chest's
  grey look too, the words tell them apart.
- **"Blocked by"**: a card waits for other cards of its board (*It waits
  for…* in the card; a loop — A waits for B, B for A — is refused). The
  card face says **Blocked** while one of them is open, the card lists
  them and the cards that wait for it. *Mark done* (the button, the
  column, a drag, the tick in *My tasks*) is refused while it waits:
  "Blocked: “Book the truck” is not done yet." with **Mark done anyway**
  (the history then says it was done while waiting). When its last
  blocker is done, the card's people find "You can start …" in their
  bell. Moved to another board, a card leaves its links behind.
- **Timeline view** (Asana's timeline, Monday's Gantt): six weeks of bars
  from each card's start date to its due date (one date: that day), in
  rows **by column** or **by person**; weekends shaded, today marked. A
  line joins a card to the cards it waits for, **red and dashed when it
  starts before one of them is due**. Drag a bar to move both dates, its
  end to move only the due date — with the mouse, a finger, or the
  keyboard (Space picks the bar up, the arrows move it a day, up and down
  a week, Space drops it; Enter opens the card). Earlier / Later move the
  window four weeks; cards without dates are counted above it.
- **Calendar view**: the month of the board's due dates; a card dragged to
  another day (mouse, finger or keyboard) takes that date. On a phone, the
  days that hold cards, as a list.
- **Search** across every board I see: titles, descriptions, comments,
  checklists and labels; *Include archived cards* (cards archived, in an
  archived column or on an archived board, each marked "Archived").
- **Columns** are archived with their cards, or after moving them to
  another column: the menu asks when the column holds cards, and the toast
  says what happened ("Column archived with its 3 cards"), with *Undo*.
- **Recurring cards**: a card can repeat *every day*, *every weekday*
  (Monday to Friday), *every week* on chosen days, or *every month* on a
  day (the 31st falls on the last day of shorter months). The card says it
  in plain words — "Repeats every Monday and Thursday. Once this card is
  done, the next one comes in “To do”, due Thursday 1 October." When it is
  done, the next card appears in the board's first column with the same
  title, description, people and labels, its checklist unticked and the
  next date; the done card links to it. A repeat set on a card without a
  date gives it the first one.
- **The morning reminder**: each weekday at 07:30 in the Chest's time zone,
  whoever has cards due today or late finds **one** item in their bell,
  in their language — "1 task due today, 2 tasks late" and the titles,
  late ones first. It replaces yesterday's, and goes away once nothing is
  due (as soon as their last card is done). One switch at the bottom of
  *My tasks* turns it off for oneself.
- **The bell**: whoever is given a card or a step, mentioned, or has a
  card commented on hears of it in the Chest's inbox, in their own
  language; the tile's number is their tasks and steps late or due today.
- **Email** (Proposal (studio) `mail`): being given a card or a step, being
  mentioned, and the morning reminder also come by email, in each person's
  language, with the link to the card; the Chest sends it to their address
  (the tool never knows it). One switch at the bottom of *My tasks* turns
  email off for oneself, and each person's own choice in the Chest (every
  email, one a day, or none) is followed too: *My tasks* says so under the
  switch when it is "one a day" or "none". **What one person does in one go leaves as one
  email**: the emails wait until the person has had nothing new for a
  minute (ten at most), then "Hugo Bernard: 1 task given to you, 1 step
  and 1 mention", each with its link. What an email names is read again
  as it leaves (a card taken back, a step ticked are left out).
- **A deleted comment leaves nothing behind**: its items in colleagues'
  bells go at once (each mention is an item of its own; the card's comment
  item shows it only if it was the last), and its mention email, still
  waiting, is held while the *Undo* lasts and never sent after. *Undo*
  brings the items back; an edited comment's items show its new words.
- **Import**: Trello boards (JSON export; several at once), an Asana
  project (CSV export) or any spreadsheet (CSV with a title column; French
  sheets with `;` work). Before anything is written, the page shows each
  board's columns and cards, **the people found in the Chest and those who
  are not** (their cards stay unassigned), and how many attached files stay
  behind in Trello (link attachments come into the description). An
  imported board is **private to the importer** unless *Everyone in Tasks*
  is chosen; the page then names the people on its cards who will not see
  them until it is shared.
- **Switch day without "late" noise**: a list or status named *Done,
  Fait, Terminé, Clôturé, Closed, Livré…* holds finished work (ticked in
  the check, which the person may change column by column); a Trello card
  *marked complete* on its due date (`dueComplete`) and an Asana task with
  *Completed At* go to that column (or to a *Done* column of their own).
  So nothing finished last spring rings the bell, the morning email or the
  tile's number the first morning. **Archived Trello lists come archived**,
  with their cards (the check says which, and how many). A sheet's
  statuses are put in a workflow's order (*À faire → En cours → À valider
  → Fait*), whatever order its rows come in.
- **My due dates in my calendar** (Proposal (studio) `calendar`): each
  open card given to someone, with a due date, is in their Chest calendar
  feed (the one Google Calendar, Outlook or Apple Calendar subscribes to),
  and each step in its person's — all day, or 30 minutes at the due time,
  shown free, private on a private board, opening the card. Done,
  archived, deleted or taken from them, it leaves their calendar. Only
  people who see the board get it. *My tasks* links to the Chest's page
  for adding the calendar once the Chest has taken the first event.
- **Goals hears of the work done** (Proposal (studio): events between
  tools): once an admin links Tasks to Goals, a card that becomes done —
  by its *Mark done* button, a move into a "done" column (drag, keyboard,
  the card's column menu, *Move to board*), the tick of *My tasks*, a
  column made "done", a column archived into Done, a card added or copied
  into Done — is told to Goals with its board and its people, and a card
  that leaves done (every *Undo* included) is taken back. Goals' key
  results "Cards done" count them. Cards an import brings in already done
  are history, not told. See *With the other tools*.
- **Links that follow the card**: bell items, emails and calendar events
  open `/chest/cards/<id>`, which finds the card's board when clicked; an
  older link to the previous board opens the card where it is now, and a
  card that is gone says so.
- **Export** a board as CSV (in the reader's language) or JSON
  (everything); managers download **all boards at once** (one JSON file,
  archived and private boards included).
- **Nothing is lost by a click**: cards, columns and boards are archived
  (and restored); they are deleted for good only from the archive.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `manager` | Manager | every board, private ones too; changes any board's settings |
| `member` | Member | creates boards (and owns them), imports, works on the boards they see |
| `viewer` | Viewer | reads the boards they see and comments |
| (none) | — | sees "You can't use Tasks yet" |

A board's **owners** (its creator and whom they name) change its settings:
name, colour, who sees it, labels, archive, delete. The owner, the admins and
the tool's builders come in with the first role, `manager`.

## First minute

- **What a new user sees:** *My tasks*. On an empty Chest: "Start with a
  board", *Create a board*, and *Bring your Trello or Asana boards* (the
  import).
- **The first thing they do:** name a board, keep the suggested columns,
  press *Create the board*, then *Add a card* and type.
- **Clicks for the main job:** giving a task to Inès is 3 clicks from the
  board (open the card, *Give to…*, Inès); ticking my task done is 1 (from
  *My tasks*, or *Mark done* in the card).
- **A viewer on an empty Chest** reads "No board is shared with you yet —
  Ask Camille Martin to add you to a board" (the managers' names), on
  *My tasks* and on *Boards*.
- **A mistake:** a card moved to the wrong column is dragged back; ticked
  by mistake → *Undo* (a repeating card also takes back the next one it
  made, if nobody touched it yet); archived by mistake → *Undo*, or restore it from the
  board's settings. A refused action puts the screen back and says why.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | members | My tasks and my boards |
| `/chest/boards` (`?archived=1`) | members | all boards I see |
| `/chest/cards/<id>` | members who see the card's board | opens the card on the board it is on now (bell, email and calendar links) |
| `/chest/boards/<id>` (`?card=`, `?view=list\|calendar\|timeline`, `?month=YYYY-MM`, `?from=YYYY-MM-DD`, `?who=`, `?label=`) | members who see the board | the board, its list, calendar or timeline, a card open beside it |
| `/chest/boards/<id>/settings` | idem (changes: owners, managers) | settings, archive, export |
| `/chest/boards/<id>/export?format=csv\|json` | idem | a download |
| `/chest/search?q=` (`&archived=1`) | members | search |
| `/chest/export` | managers | every board, one JSON file |
| `/chest/import` | managers, members | import |
| `/chest/actions/<name>` | members (each action checks the board) | every change, by name (`src/actions.ts`): typed fields, refusals as codes; a file is `uploadFile` then `recordFile` around the browser's own upload to the Chest |
| `/chest/look.css?v=…` | members | the look of the page: the company's choice, else Workshop (a stylesheet, never inline) |
| `/chest/files/<id>` (`?download`) | who sees the card | a 15-minute link to the file, signed by the Chest |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-schedules` | the Chest only (signed `Chest-Schedule`) | the runs of `chest.json`'s schedules: `morning` (weekdays 07:30) and `mail` (every 15 minutes: the emails that waited — also sent after each action and page —, and the cards done or reopened the Chest could not take yet) |
| `/` | anyone | "Tasks lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `files` (card attachments, 25 MB each,
  browser → Chest uploads); `members` (names, photos, who sees a board);
  `notifications` (the bell and the tile's number); `receives: ["member.*"]`;
  and, Proposal (studio) in `chest.proposals.json`, `mail: {send: true}`
  (email to members, by their id), `calendar: true` (each person's due
  dates in their Chest calendar feed) and `emits: ["tasks.card.done",
  "tasks.card.reopened"]` (Goals' "Cards done").
- **Someone leaves** (or loses access): their open cards and steps are
  unassigned (the history says so), they leave the boards' people; done
  cards keep them. A board whose last owner left is managed by the
  managers (they own every board).
  **An erasure** removes their id everywhere; what they wrote stays for the
  team, signed "Former member". Then the erasure is acknowledged.
- **Schedules** (contract 0.4, `chest.json`): `morning`,
  weekdays at 07:30 in the Chest's time zone, posted to
  `POST /chest-schedules` (with `mail`, every quarter of an hour). It makes any missing next card of a repeating
  card, sends the reminders (and takes back those no longer true), and sets
  every tile's number, since dates moved overnight, and checks every due
  date in the members' calendars again. A run delivered twice
  makes no second card and no second item. Nothing else runs in the
  background: deleted-for-good is a click; the tile's number is also
  recomputed whenever something changes and when its owner opens *My tasks*.
- **"Today"** is the day in the Chest's time zone (`chest.timeZone`,
  SDK 0.3.0): late cards, the reminder, the next date of a repeat. The
  Chest makes that zone its database sessions' too, so `current_date`
  (the sample data) is the same day. A due time is the Chest's hour; a
  comment's date and time are shown in the reader's own zone
  (`member.timeZone`).

### Why the next card comes when this one is done

Two models exist. Trello's Card Repeater copies a card on a calendar,
whether the last copy was done or not; Asana makes the next task when the
current one is completed. Tasks follows Asana: a team that did not water
the plants on Monday does not want a second "Water the plants" on Thursday
beside the first — it wants the one card, late, and the next one once it
is done. The next date comes from the rule after the card's own date, and
never before today: a weekly card done three days late is not followed by
one already late. Archiving a repeating card stops its series; choosing
"Does not repeat" stops it too.
- No WebSocket: an open board re-reads itself every 15 s while visible.

## With the other tools

Tasks publishes two events (Proposal (studio): events between tools; an
admin links the tools in the Chest). The contract is **Goals'** (its
README, "With the other tools"), v1:

| Event | Data | Key |
|---|---|---|
| `tasks.card.done` | `{card, board, boardName, assignees}`: ids as text, the board's name (1–80 characters), the card's people (member ids, 20 at most) when the event leaves | `tasks:<card>:done:<time>` |
| `tasks.card.reopened` | `{card}` | `tasks:<card>:reopened:<time>` |

`<time>` is when it happened (milliseconds): a card done again is told
again, and Goals keeps the latest. The same time goes as the event's
`occurredAt` (studio.16) when it is less than a day old, so Goals counts a
card done at 23:55 on a cycle's last day in that cycle even when it is
told at 00:10; older (a Chest down for a night), the Chest refuses a time
that far back and the event goes without it (its time still in the key). **Reliable**: a trigger
(`migrations/0006_card_events.sql`) writes each change in the same
transaction as the card, whatever made it; `src/lib/card-events.ts` publishes
after the action (`after()` of `@argentic/chest-app`), and the `mail` schedule every quarter
of an hour again while the Chest cannot take them (a Chest without events
between tools, before an admin approved them); a key the Chest already
holds is one event, never two. What waits a week is forgotten (Goals
cannot count what happened before the tools were linked). Only the card
and board ids wait there: the board's name and the people are read when
the event leaves, so an erasure has nothing to change in it. Not told:
cards an import brings in already done (history), a done card archived or
deleted (the work was done), a card moved from one "done" column to
another.

## Needs from the SDK

Built on SDK 0.4.1 + studio proposals (`0.4.1-studio.3`), in `vendor/`,
with `@argentic/chest-app` (the studio's server and browser machinery) and
`@argentic/chest-ui` (the kit), packed beside it.

- `member.language`: the interface in each member's language;
  `members.*` `language` for the bell and the emails in the recipient's.
- `chest`: `chest.timeZone` and `chest.today()`, for "today" (and the day of
  a schedule's run); `chest.tool.teamUrl` (0.4.1) the address in an email;
  `members.lookup`'s `no_access` (0.4.1): "Léa Dubois (no access)".
- `groups` — **Proposal (studio)** (`"groups": "read"`,
  `chest.proposals.json`): a private board may be shared with any group of
  the Chest (`members.groups.all()`), not only those that give Tasks —
  usually none, as Tasks is open to everyone. Whether someone is in the
  group is asked of the Chest (`members.groups.of` for the person signed in,
  `groups.members` for a list; `src/lib/groups.ts`), since 0.3.0's
  `member.groups` lists only the groups that give the tool. Kept a minute,
  forgotten on `member.updated` / `group.*`. Without the permission: the
  groups that give Tasks, as before.
- `schedules` (0.4.1, official): the morning run (reminders, the repeats'
  safety net, the tiles' numbers) and the mail run; each run's id is kept
  in the database (`chest_events`, 30 days), so a run delivered twice is
  handled once.
- `mail` — **Proposal (studio)**: `mail.send({to: {member}})` for the
  emails of assignment, mention and the morning. Keys are passed whole
  (studio.15 hashes a long one: before, `slice(0, 64)` could give two
  people one key); the person's own choice in the Chest
  (`members.get(id).mailPreference`, which *My tasks* reads to say it) is
  applied by `mail.send` — none of these
  emails is transactional. The grouping and the
  hold are the tool's own (`mail_queue`), sent after each request
  (`after()`) and by a `mail` schedule every 15 minutes; with no schedule
  and nobody using the tool, a waiting email leaves at the next visit. On a Chest without mail,
  `CapabilityNotGranted`: nothing is sent, nothing fails, the bell says it.
  `mail.available()` (studio.16): under the email switch, *My tasks* says
  when the Chest does not send email yet (not granted, not connected,
  paused) or has spent its day's emails, instead of promising them.
- `calendar` — **Proposal (studio)**: `calendar.putMany` (studio.15:
  100 events a call, so the first sync of a board full of due dates is a
  few writes; studio.16 answers each event: one the Chest refuses — a
  wrong date, its 5,000 events full — is not remembered as put and is
  tried again at the next run, the rest of the batch is put)
  / `remove` of each person's due dates (keys `card:<id>`, `step:<id>`;
  `src/lib/due-calendar.ts`),
  after each change (`after()`), at each visit of *My tasks* and
  each morning (who sees a private board asked again). On a Chest without
  it, `CapabilityNotGranted`: remembered (`tool_state`), nothing fails, the
  link on *My tasks* is not shown.
- **Events between tools** — **Proposal (studio)**: `events.publish` of
  `tasks.card.done` / `tasks.card.reopened` (*With the other tools*).
- Recurring cards do not depend on the schedules (the next card is made the
  moment one is done); the morning run is a safety net.

## Looks

Tasks wears **any look the company chooses in its Chest**: its own identity
"Workshop" (paper, ink outlines, sun yellow — the default), any theme of the
store's catalogue (the 18 identities, "Chest", "High contrast"), or the
company's brand imported from its guidelines — for all tools or for Tasks
alone, with the same features. The look is a stylesheet the tool serves,
`/chest/look.css?v=<its hash>` (never an inline `<style>`: the pages' policy
allows no inline style or script at all), made by the kit from the Chest's
`chest.theme()`; in brand mode the company's logo stands beside the name. Board and label colours follow the theme's
palette (a "sky" board stays bluish everywhere; in the "Chest" theme,
colours are greys and the names tell them apart — label names are on the
card faces, and late dates say *Late* with a sign; the flow checks it in
the Chest look). Screens:
`docs/screens/*-chest-*`, `*-theme-*` (Library), `*-brand-*` (the sample
brand), `board-port-*` (the second sample brand, Café du Port).

Columns made by a template (*To do / Doing / Done*…) are named in each
reader's language — the sample board reads "À faire / En cours / Fait"
to Inès and "To do / Doing / Done" to Hugo — until someone renames one.

## Develop

```sh
npm ci
npm run dev       # rebuilds on every change and restarts the server
npm test          # types, the server built into dist/test, then test/*.test.*
                  # (PGlite in the process, or TEST_DATABASE_URL for a real PostgreSQL)
npm run build     # types, then the browser's files and the server (Vite), as the Chest does
npm start         # the built server (dist/server/main.js), as the Chest runs it
```

**How it is made.** A Hono server renders React pages (`src/pages/`); the
parts that run in the browser are islands (`src/islands/`): the board with
its drag and drop and its list, calendar and timeline views
(`BoardView`), the card's panel (`CardPanel`), a board's settings, the
importer, *My tasks*' ticks, the switches, the *New board* dialog, the
search box. Every change is an action of `src/actions.ts`, called from an
island with `call()`; the page then refreshes in place (islands keep their
state; a drag in progress keeps its card until the move is answered).
Opening a card, a filter, a month or a view changes the address and the
page in place (`navigate()`). The machinery is `@argentic/chest-app`
(`vendor/`, its `AGENTS.md`); rules and SQL are in `src/lib/`, rules shared
with the browser (repeats, the calendar's dates, the import's reading,
Markdown) in `src/shared/`. Measured on the studio's bench (`lab/measure`,
6 October 2026, Node 24.21, the sample data): 75 MiB at rest (PSS of the
process tree; the Next.js version 131), first page 382 ms after a cold start
(782), image 32 MiB (461); the build fits the Chest's 512 MiB container.

The timeline's places are classes (`src/timeline-grid.css`, made by a
script for the 42 days of its window: `tl-from-N`, `tl-len-N`, `tl-at-N`);
if `timelineDays` changes in `src/shared/calendar.ts`, write it again.

In the studio: `node lab/chest-dev/dev.mjs tools/private/tasks --reset`
(sample boards from `seed/sample.sql`), `node lab/chest-dev/flows/tasks.mjs`
(the browser flows), `node lab/chest-dev/screens.mjs tools/private/tasks`.

## What it does not do (yet)

- **Email** needs the `mail` proposal on the Chest: until then the bell
  alone tells people. No push to a phone (the Chest has none), no email at
  a time each person chooses (07:30 on weekdays), no email for plain
  comments on one's cards (the bell only). The emails are plain text (no
  button). A comment deleted more than a minute after it was posted may
  already have left by email: the hold covers the minute of grouping and
  any comment deleted before its email left.
- **Timeline**: one board at a time; no zoom (six weeks of days; on a
  phone, a list of those weeks, read only — dates move on a wider screen or
  in the card); no
  lines between bars in the rows *by person* (a card with two people is on
  two rows); a drag never moves the cards that wait for it (no automatic
  rescheduling); no critical path, no baseline, no milestones.
- **"Blocked by"** links cards of one board only (not across boards);
  archiving a column, or making a whole column "done", does not ask about
  the cards waiting inside it; a card moved to a done column of another
  board leaves its links and is not checked.
- **Automations** (Monday's "when status changes, notify…", Trello's
  Butler), **time tracking** (see Timesheets), workload views, dashboards
  and charts.
- **Seeded content** (card titles, board and field names of the sample)
  stays as written; only the columns of a template follow the reader's
  language.
- **Subtasks are checklist steps**: a step has a person and a date and
  shows in their *My tasks*, but it has no description, comments or files
  of its own, and no steps under it.
- **Fields**: text, number and one choice only (no date, person, several
  choices, formula or currency fields); no field is required.
- **Calendar** shows due dates only (a start date does not draw a span),
  one board at a time inside Tasks (no calendar view across boards; across
  boards, a person's due dates are in their Chest calendar feed, which
  needs the `calendar` proposal on the Chest). Calendar apps fetch a feed
  every few hours (Google: 6 to 24): a date changed now shows there later.
  A card with a due date but nobody on it is in no one's calendar.
- **List view**: no inline editing (a title opens the card); sort and
  grouping are not remembered.
- **Import**: attachments uploaded to Trello are not brought (they are
  counted, and stay in Trello); a column of finished work is recognised by
  its name (English and French words) — a list named otherwise ("Shipped
  to client ✓✓") must be ticked in the check; the columns' order cannot be
  changed in the check (Trello's order is kept; a sheet's known statuses
  are ordered, others keep their order); a private import names the people
  who will not see their cards but does not share it with them in one
  click (its settings do); a very large Trello board (thousands of
  archived cards) comes whole, with no paging per column; no Monday import (Monday exports to Excel:
  save it as CSV with a "Name" column); Asana's subtasks become checklist
  steps without their people.
- **Export**: files are listed by name, not included (one JSON file, not a
  zip).
- Repeats every *n* weeks or yearly, repeats on a calendar whether done or
  not (Trello's model), card templates, card covers, watching a card,
  public boards, live co-editing, a board-level history ("who archived
  the column?").
