# Goals — agree on what matters this quarter, and see how it goes

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Lattice Goals, Perdoo,
Weekdone, 15Five OKRs — or the OKR spreadsheet** — for a company of 10 to
200 people. French interface name: *Objectifs*.

## What it does

- **Cycles** (a quarter, usually: "Q4 2026", with its dates). Admins create
  them, pick the current one, close one when it ends and may reopen it. A
  closed cycle is frozen but stays readable, with its **review**: every
  objective's final progress, its score and what the team learned.
- **Objectives** at three levels: **company** (admins), **team**, and
  **personal** (off by default, see below). Each has an owner, a title, why
  it matters, and may **support** a bigger one: company → team → personal.
- **Key results**: a number from a start to a target with a unit, a
  percentage, an amount of money (in the Chest's currency), or done / not
  done. Progress is computed (0–100 %, capped, also for targets below the
  start: "returns from 6 % to 2 %"); an objective's progress is the mean of
  its key results, weighted (normal, double, triple).
- **Weekly check-ins**: on a key result, the value now, how sure its owner
  is (*on track*, *at risk*, *off track*) and one optional line. Each key
  result shows its history as a line chart drawn in SVG (the same as a
  table for screen readers), its last check-in, and is marked **quiet**
  after 14 days without news. The latest check-in can be taken back for 30
  minutes (*Undo*).
- **My goals** (home): what waits for my check-in this week, each with its
  one-screen form (most weeks: one tap and *Check in*), then everything I
  own.
- **Company**: the tree of the cycle — company objectives, what supports
  them beneath (fold and unfold), progress bars with the percentage written,
  confidence as a shape, a colour and a word; the company's progress and a
  tally. **Teams**: a tile per team; a **team page** with its objectives and
  their key results. An **objective page**: key results, charts, history,
  check-in, what supports it, comments, retrospective.
- **Carry over**: once a cycle ends, an objective goes to the next cycle in
  one click, its unfinished key results starting where they stopped.
- **The bell**: a key result or an objective given to me, a comment on an
  objective I own, each in my language; the tile's number is my key results
  waiting for this week's check-in; **Friday morning**, one reminder ("3 key
  results wait for your weekly check-in"). Admins hear when goals need a new
  owner.
- **Export**: a cycle as a spreadsheet (CSV, one row per key result),
  headers, words and number format in the reader's language (`;` and
  decimal commas in French).
- **Nothing is lost by a click**: objectives, key results, comments and
  teams are removed with *Undo*; a closed cycle reopens.

### Teams: the Chest's groups first

A team is **a group of the Chest** when the company has made one — its name
and members come from the Chest, so nobody keeps a second list, and only its
members write its objectives — or **a name** given here (many small
companies give their tools to everyone and have no groups): anyone may write
for such a team. Admins add them in *Settings* ("Add the 2 groups of your
Chest" is one click).

### Personal objectives, and what Goals never does

Personal objectives are **off by default**. In France, individual goals weigh
legally as soon as they are used to evaluate someone or are tied to pay: the
employee must be told beforehand of the methods, which must be relevant to
the purpose (Code du travail, art. L1222-3,
https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900860/, read
2026-09-28); introducing an evaluation tool may also call for consulting the
CSE in companies of 50 or more. **Goals rates nobody, has no performance
reviews and is never tied to reviews or pay.** When an admin turns personal
objectives on, the setting says so; a personal objective is visible to the
whole team, like every other.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `admin` | Administrator | cycles, company objectives, teams, settings; change any objective or key result, check in for anyone, hand over what someone who left owned, delete any comment |
| `member` | Member | write team objectives (of their groups, or of named teams) and personal ones when allowed; change what they own; check in on their key results; comment |
| (none) | — | sees "You can't use Goals yet" |

Everyone with a role reads everything: objectives are shared by design. The
owner, the admins and the tool's builders come in with the first role.

## First minute

- **What a new user sees:** *My goals*, with this week's check-ins on top.
  On an empty Chest, an admin sees "No cycle yet" and one button, *Start Q4
  2026*; then *Company* offers *Write the first objective* or *Add an
  example* (a complete objective with three key results, to change).
- **The first thing they do:** check in — change the number, tap a
  confidence, *Check in*. Writing an objective is one page: its title, why,
  what it supports, and its key results in the same form.
- **Clicks for the main job:** the weekly check-in is 2 clicks when the
  confidence did not change (the value, *Check in*); opening the company's
  tree is 1.
- **A mistake:** a wrong check-in → *Undo* in the toast (or in its history
  for 30 minutes); a removed objective → *Undo*; a cycle closed too early →
  *Undo* or *Reopen*. A refused action says why, in plain words, and keeps
  what was typed.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | members | My goals: this week's check-ins, what I own |
| `/chest/company` (`?cycle=`) | members | the cycle's tree, progress, tally |
| `/chest/teams`, `/chest/teams/<id>` (`?cycle=`) | members | teams; a team's objectives |
| `/chest/objectives/new` (`?cycle=&level=&team=&parent=`) | who may write | a new objective and its key results |
| `/chest/objectives/<id>` (`?checkin=<kr>`) | members | an objective; its edit page `…/edit` for its owner and admins |
| `/chest/cycles`, `/chest/cycles/<id>` | members (changes: admins) | cycles; a cycle's review |
| `/chest/cycles/<id>/export` | members | the cycle as CSV |
| `/chest/settings` | admins | personal objectives, teams, needs a new owner |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-jobs/<name>` | the Chest only (signed) | scheduled tasks (proposal) |
| `/` | anyone | "Goals lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `members` (names, photos, groups for teams);
  `notifications` (the bell and the tile's number); `receives: ["member.*"]`.
- **Someone leaves** (or loses access): nothing is removed. Their objectives,
  key results, check-ins and comments stay; the owner reads "Camille Martin
  (former member)", what they owned in open cycles is listed in *Settings →
  Needs a new owner* (one by one, or "Give everything of … to"), and the
  admins get one bell item, kept up to date, withdrawn when all is handed
  over. **An erasure** replaces their id with `erased` everywhere (owner,
  author, retrospective); check-ins and comments stay, signed "Former
  member"; then the erasure is acknowledged.
- Dates: "today" and "this week" (from Monday 00:00) are the Chest's, in its
  time zone (`chest.timeZone()` / `chest.today()`); an amount is in the
  Chest's currency (`chest.currency()`), kept on each key result.
- No WebSocket: the open pages re-read themselves every minute while visible.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**: the interface and the bell in each
  member's language.
- The `chest` module — **Proposal (studio)**: time zone, today, currency.
- **Scheduled tasks** — **Proposal (studio)**, in `chest.proposals.json`:
  `reminder` (Friday 08:45: the weekly check-in reminder) and `week` (Monday
  06:50: every tile's number for the new week). **Without schedules** the
  tool works: badges are set whenever someone checks in, changes an owner or
  opens *My goals*; only the Friday bell item and the Monday refresh wait for
  the Chest to run schedules.
- Later, not built: values fed by other tools (a key result "deals won" read
  from the CRM) need events or data between tools.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/goals --reset --port 5600`
(Atelier Martin's cycles from `seed/sample.sql`: a current Q4 2026 in its
sixth week, a closed Q3 with scores and learnings, Paul Lefèvre gone),
`node lab/chest-dev/flows/goals.mjs 5600`, `node lab/chest-dev/screens.mjs
tools/private/goals --port 5600`, `node lab/chest-dev/audit.mjs
tools/private/goals --port 5600`.

## What it does not do (yet)

Import from Lattice or a spreadsheet (the research lists it; not built),
KPIs without a target date, values fed automatically by other tools, private
objectives, reordering objectives by hand, email reminders. **Never:**
performance reviews, ratings of people, links to pay, AI-written OKRs.
