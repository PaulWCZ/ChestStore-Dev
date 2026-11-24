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
- **Email is the Chest's, not Tasks'** (the owner's decision of 6 October
  2026): Tasks sends no email. Every item above is a notification, written
  in English and French (`translations`), and **the Chest mails each member
  their notifications by their own choice in the Chest** (each one, once or
  twice a day, or off; off for Tasks alone). *My tasks* says so in one line
  under the reminder switch. What changed: the email switch of *My tasks*,
  the emails grouped per person (`mail_queue`) and the morning email are
  gone; the moments people are told are the same.
- **A deleted comment leaves nothing behind**: its items in colleagues'
  bells go at once (each mention is an item of its own; the card's comment
  item shows it only if it was the last), in every language. *Undo*
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
  So nothing finished last spring rings the bell, the morning reminder or the
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
- **Goals hears of the work done** (events between tools, SDK 0.5+):
  once the owner approves the link Tasks → Goals, a card that becomes done —
  by its *Mark done* button, a move into a "done" column (drag, keyboard,
  the card's column menu, *Move to board*), the tick of *My tasks*, a
  column made "done", a column archived into Done, a card added or copied
  into Done — is told to Goals with its board and its people, and a card
  that leaves done (every *Undo* included) is taken back. Goals' key
  results "Cards done" count them. Cards an import brings in already done
  are history, not told. A private board's card is told with its
  audience (the board's people and groups, and the managers): Goals shows
  it to them only. See *With the other tools*.
- **Live**: a board left open, *My tasks* and *Boards* follow what others
  change (a card moved, a step ticked, a comment) as it is written —
  realtime, held by the Chest, so Tasks sleeps while the tab stays open.
  No timer.
- **Links that follow the card**: bell items and calendar events
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
| `/chest/cards/<id>` | members who see the card's board | opens the card on the board it is on now (bell and calendar links) |
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
| `/chest-schedules` | the Chest only (signed `Chest-Schedule`) | the runs of `chest.json`'s schedules: `morning` (weekdays 07:30) and `retry` (every 15 minutes: the cards done or reopened the Chest could not take yet — also sent after each action) |
| `/` | anyone | "Tasks lives in your Chest" |

## On a Chest

- **Contract 0.7** (`"chest": "0.7"`). `capabilities`: `database`;
  `files` (card attachments, 25 MB each, browser → Chest uploads);
  `members` (names, photos, who sees a board); `members.groups` (a private
  board shared with any group of the Chest); `notifications` (the bell and
  the tile's number); `realtime` (the open pages follow the boards);
  `receives: ["member.*"]`; `emits` `tasks.card.done` and
  `tasks.card.reopened`, each with its fields (Goals' "Cards done");
  `realtime`: the channel `board:{id}`, joined through the table
  `board_live`, and the feeds `cards`, `columns`, `labels`, `fields`,
  `boards` (ids only). Proposals (studio) in
  `chest.proposals.json`: `calendar: true` (each person's due dates in
  their Chest calendar feed) and `translations` (the store's words in
  French). No `mail`: Tasks mails no one (see "Mail to people outside the
  company").
- **Someone leaves** (or loses access): their open cards and steps are
  unassigned (the history says so), they leave the boards' people; done
  cards keep them. A board whose last owner left is managed by the
  managers (they own every board).
  **An erasure** removes their id everywhere; what they wrote stays for the
  team, signed "Former member". Then the erasure is acknowledged.
- **Schedules** (`chest.json`): `morning`,
  weekdays at 07:30 in the Chest's time zone, posted to
  `POST /chest-schedules` (with `retry`, every quarter of an hour, for the linked tools). It makes any missing next card of a repeating
  card, sends the reminders (and takes back those no longer true), and sets
  every tile's number, since dates moved overnight, and checks every due
  date in the members' calendars again. A run delivered twice
  makes no second card and no second item. Nothing else runs in the
  background: deleted-for-good is a click; the tile's number is also
  recomputed whenever something changes and when its owner opens *My tasks*.
- **"Today"** is the company's day (`chest.timeZone`, the company's
  reference zone, taken once from the owner's browser — SDK 0.7.0), the
  same for every member wherever they are: late cards, "due today", the
  reminder, the next date of a repeat. The Chest makes that zone its
  database sessions' too, so `current_date` (the sample data) is the same
  day. A due date is a calendar day (the same everywhere) and a due time
  the company's hour; a comment's date and time are shown on the reader's
  own clock (`member.timeZone`, where their browser is). Tasks has no
  time-zone setting.

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
- **Live without a timer**: a page of Tasks joins `board:<id>` of each
  board it shows (realtime: the Chest holds the connection, Tasks sleeps).
  **Only who sees a board joins its channel**: the Chest checks the table
  `board_live` at every join (migration 0009, the channel's `join`), where
  Tasks writes a row once it has checked the member sees the board (the
  board's page, *Boards*, *My tasks*). The rows go wherever that may have
  changed — a board made team or private, a private board's people or
  groups changed, the board deleted, the member's groups or role changed,
  their access revoked, their departure or erasure — and the Chest takes
  them out of the channel at once; their page reads itself again and is
  let in again if still allowed (a new mark, so its live island joins
  again). Nobody can join a private board's channel to learn when its
  cards change.
  The Chest turns each committed row of `cards`, `columns`, `labels`,
  `fields` and `boards` into an event there, carrying ids only; a change
  inside a card (people, labels, steps, checklists, comments, files,
  field values, blockers) touches the card (`cards.changed_at`, triggers
  of `migrations/0008_live.sql`). The page then reads itself again (the
  package's `useLive`: typed text, scroll and open panels stay) — so what
  a member sees is always what their own access allows. *My tasks* and
  *Boards* follow every board their reader sees.

## With the other tools

Tasks emits two events (events between tools, SDK 0.5+: `chest.json`
`"emits"` declares each with its fields; the owner approves each link).
The contract is **Goals'** (its README, "With the other tools"), v1:

| Event | Data | Key |
|---|---|---|
| `tasks.card.done` | `{card: id, board: id, boardName: text, assignees: members}`: ids as text, the board's name (1–80 characters), the card's people (member ids, 20 at most) when the event leaves | `tasks:<card>:done:<time>` |
| `tasks.card.reopened` | `{card: id}` | `tasks:<card>:reopened:<time>` |

Each has the subject `card:<id>` (a receiver gets one card's events in
order). **Audience**: a card of a team board goes without one (everyone
who has Tasks may see it); a card of a private board carries `{members:
the board's people, groups: its groups, roles: ["manager"]}`, so a
receiver shows it to them only.

`<time>` is when it happened (milliseconds): a card done again is told
again, and Goals keeps the latest. The same time goes as the event's
`occurredAt` when it is less than 72 hours old, so Goals counts a card
done at 23:55 on a cycle's last day in that cycle even when it is told at
00:10; older (a Chest down for three days), the Chest refuses a time that
far back and the event goes without it (its time still in the key). **Reliable**: a trigger
(`migrations/0006_card_events.sql`) writes each change in the same
transaction as the card, whatever made it; `src/lib/card-events.ts` emits
after the action (`after()` of `@argentic/chest-app`), and the `retry` schedule every quarter
of an hour again while the Chest cannot take them (before the owner
approved the version, `Unavailable`); a key the Chest already holds is
one event, never two (`key_reused`, or data the Chest refuses, is said in
the log and not retried). What waits a week is forgotten (Goals
cannot count what happened before the tools were linked). Only the card
and board ids wait there: the board's name and the people are read when
the event leaves, so an erasure has nothing to change in it. Not told:
cards an import brings in already done (history), a done card archived or
deleted (the work was done), a card moved from one "done" column to
another.

## Mail to people outside the company

None. Tasks has no public part and writes to no one outside the company:
every message is a notification to a member (above). It declares no `mail`.

| Recipient | Purpose | When | Content | Attachments | Reply-To |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## Needs from the SDK

Built on SDK 0.7.0 + studio proposals (`0.7.0-studio.2`), in `vendor/`,
with `@argentic/chest-app` 0.1.0-studio.12 (the studio's server and
browser machinery) and `@argentic/chest-ui` (the kit), packed beside it.

- `member` (0.7.0): the interface in each member's language; `groups`
  may be `null` (more groups than an assertion carries): Tasks then asks
  `members.get` (kept a minute; `createApp`'s `complete`,
  `src/lib/groups.ts`), and so for the members of a list.
- `chest`: `chest.timeZone` and `chest.today()`, the company's day (and the
  day of a schedule's run); `members.lookup`'s `no_access`: "Léa Dubois
  (no access)".
- `members.groups` (0.5+, `chest.json`): a private board may be shared
  with any group of the Chest (`members.groups.list`, paged), not only
  those that give Tasks — usually none, as Tasks is open to everyone.
  Every member the Chest gives Tasks carries every group they are in: who
  sees a board is read from the member, never kept. The list of groups is
  kept a minute; `member.updated {changed: ["groups"]}` forgets it.
- `notifications` (0.5+) with `translations`: every item in English with
  its French; a key per card and reason replaces or withdraws it. The
  Chest mails and pushes them by each member's choice.
- `events.emit` (0.5+): `tasks.card.done` / `tasks.card.reopened` with
  subject, key, `occurredAt` and audience (*With the other tools*).
- `realtime` (0.5+): the open pages follow `board:<id>` (*On a Chest*).
- `schedules`: the morning run (reminders, the repeats' safety net, the
  tiles' numbers) and the `retry` run; each run's id is kept in the
  database (`chest_events`, 30 days), so a run delivered twice is handled
  once.
- `calendar` — **Proposal (studio)**: `calendar.putMany` (100 events a
  call; each event answered: one the Chest refuses — a wrong date, its
  5,000 events full — is tried again at the next run, the rest put) /
  `remove` of each person's due dates (keys `card:<id>`, `step:<id>`;
  `src/lib/due-calendar.ts`), after each change (`after()`), at each visit
  of *My tasks* and each morning. On a Chest without it (every 0.7
  Chest), `CapabilityNotGranted`: remembered (`tool_state`), nothing
  fails, the link on *My tasks* is not shown.
- Recurring cards do not depend on the schedules (the next card is made the
  moment one is done); the morning run is a safety net.

### What SDK 0.7.0 cannot give Tasks (and what it does instead)

- **Due dates in each person's calendar app**: no calendar feed in 0.7.0
  (the `calendar` proposal): on a real Chest the feature is off and *My
  tasks* does not offer it.
- **The store's words in French** (title, description, role names): 0.7.0
  has one language for them; the French ones wait in
  `chest.proposals.json` `translations`.
- **A live channel per member**: 0.7.0's `chest check` refuses a feed on
  a `{member}` channel, so *My tasks* follows every board its reader sees
  (each through `board_live`) rather than only their own cards.
- **To do items** (the contract's `todo` capability): no API in 0.7.0;
  due cards stay in the morning reminder and *My tasks*.
- **The company's look**: none in 0.7.0; Tasks shows its own identity
  (Workshop).
- `migrations/0007_mail_is_the_chests.sql` drops a table and a column
  without the `-- chest: contract` line 0.7's `chest check` asks for (a
  warning): it shipped before the rule and is never edited.

In the studio: `node lab/chest-dev/dev.mjs tools/private/tasks --reset`
(sample boards from `seed/sample.sql`), `node lab/chest-dev/flows/tasks.mjs`
(the browser flows), `node lab/chest-dev/screens.mjs tools/private/tasks`.

## What it does not do (yet)

- **No email of its own**: Tasks tells people through the Chest's
  notifications only; when and whether they also come by email or as a
  push on a phone is each member's choice in the Chest.
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
- **When the Chest does not say who is in the company** (unreachable, or a
  page of members it refuses), cards cannot be given or boards shared for
  that moment: the board, its settings, the card and the new-board dialog
  say "The list of people could not be read right now. Try again in a
  moment." rather than showing an empty picker. The pickers read every
  page of members (500 a call), with no cap of the tool's own.
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
