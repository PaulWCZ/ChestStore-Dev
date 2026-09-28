# Tasks — plan the team's work, give it to someone, see what is late

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Trello, Asana or Monday**
for the work of a small company's teams — the 80 % they use every day.

## What it does

- **My tasks** (home): everything given to me on any board, grouped *Late,
  Today, This week, Later, No date*; one tap ticks a task done (it moves to
  its board's "done" column), with *Undo*. My boards underneath.
- **Boards** of columns of cards, from a template (*To do / Doing / Done*,
  a project, a newcomer's arrival, or empty). Visible to everyone in Tasks,
  or private to chosen people and groups.
- **Cards**: title, description (links clickable), people, due date,
  labels, a checklist, comments with **@mentions**, files, and a history.
  Drag and drop with the mouse, the finger (long press) or the keyboard
  (Space, arrows, Space). Quick add at the bottom of each column.
- **List view** of a board; filters by person (or *My cards*) and label.
- **Search** across every board I see (titles and descriptions).
- **The bell**: whoever is given a card, mentioned, or has a card commented
  on hears of it in the Chest's inbox, in their own language; the tile's
  number is their tasks late or due today.
- **Import**: a Trello board (JSON export), an Asana project (CSV export) or
  any spreadsheet (CSV with a title column; French sheets with `;` work).
  People are found in the Chest by their full name.
- **Export** a board as CSV (in the reader's language) or JSON (everything).
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
  board" and one button, *Create a board*.
- **The first thing they do:** name a board, keep the suggested columns,
  press *Create the board*, then *Add a card* and type.
- **Clicks for the main job:** giving a task to Inès is 3 clicks from the
  board (open the card, *Give to…*, Inès); ticking my task done is 1.
- **A mistake:** a card moved to the wrong column is dragged back; ticked
  by mistake → *Undo*; archived by mistake → *Undo*, or restore it from the
  board's settings. A refused action puts the screen back and says why.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | members | My tasks and my boards |
| `/chest/boards` (`?archived=1`) | members | all boards I see |
| `/chest/boards/<id>` (`?card=`, `?view=list`, `?who=`, `?label=`) | members who see the board | the board, a card open beside it |
| `/chest/boards/<id>/settings` | idem (changes: owners, managers) | settings, archive, export |
| `/chest/boards/<id>/export?format=csv\|json` | idem | a download |
| `/chest/search?q=` | members | search |
| `/chest/import` | managers, members | import |
| `/chest/api/cards/<id>/upload` | who works on the board | authorise then record a file (POST, PUT) |
| `/chest/files/<id>` (`?download`) | who sees the card | a 15-minute link to the file, signed by the Chest |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/` | anyone | "Tasks lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `files` (card attachments, 25 MB each,
  browser → Chest uploads); `members` (names, photos, who sees a board);
  `notifications` (the bell and the tile's number); `receives: ["member.*"]`.
- **Someone leaves** (or loses access): their open cards are unassigned (the
  history says so), they leave the boards' people; done cards keep them.
  **An erasure** removes their id everywhere; what they wrote stays for the
  team, signed "Former member". Then the erasure is acknowledged.
- **Nothing runs in the background**: deleted-for-good is a click; the
  tile's number is recomputed whenever something changes and when its owner
  opens *My tasks* (it can be a day stale otherwise — see "Needs from the
  SDK").
- No WebSocket: an open board re-reads itself every 15 s while visible.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: the interface and
  the bell in each member's language.
- **Scheduled tasks** (not built yet): a morning pass to tell people of
  what is due today and to keep the tile's number true overnight.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/tasks --reset`
(sample boards from `seed/sample.sql`), `node lab/chest-dev/flows/tasks.mjs`
(the browser flows), `node lab/chest-dev/screens.mjs tools/private/tasks`.

## What it does not do (yet)

Due-date reminders (needs scheduled tasks), recurring tasks, calendar view,
card templates, custom fields, automations, dependencies, time tracking
(see Timesheets), public boards, live co-editing.
