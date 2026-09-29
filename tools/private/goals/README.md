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
- **Key results**: a number from a start to a target with a unit (written
  with its two forms, "customer/customers", it reads "1 customer"), a
  percentage, an amount of money (in the Chest's currency), or done / not
  done — or **fed by Clients, the CRM**: the amount won, or the number of
  deals won, in the cycle's dates, set by the deals the CRM reports (see
  *On a Chest*). Progress is computed (0–100 %, capped, also for targets below the
  start: "returns from 6 % to 2 %"); an objective's progress is the mean of
  its key results, weighted (normal, double, triple).
- **Weekly check-ins**: on a key result, the value now, how sure its owner
  is (*on track*, *at risk*, *off track*) and one optional line. Each key
  result shows its history as a line chart drawn in SVG (the same as a
  table for screen readers), its last check-in, and is marked **quiet**
  after 14 days without news. The latest check-in can be taken back for 30
  minutes (*Undo*); a quiet week is one click, *Same as last week*. **Every
  change** to a key result after it was written (target, start, weight,
  owner, unit, title) is kept in its history with who made it: a target
  lowered in week 10 is never silent.
- **My goals** (home): what waits for my check-in this week, each with its
  one-screen form (most weeks: one tap and *Check in*), then everything I
  own.
- **Company**: filters by how it goes (*At risk*, *Off track*, *Quiet*), by
  team and by owner, kept in the address; **Waiting for a check-in this
  week**: who has not checked in since Monday, key result by key result,
  with when they last did, and **Remind** (a bell item and an email, at
  most once a day per person, whoever asks) — the admins see and remind
  everyone ("Remind all"), an objective's owner the key results of their
  objective. The tree of the cycle — company objectives, what supports
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
  results wait for your weekly check-in") in the bell **and by email** —
  unless the person unticks *Also email me…* at the bottom of *My goals*.
  Admins hear when goals need a new owner.
- **Import** (admins): a CSV file — a spreadsheet, Goals' own export, or
  Lattice's goals file. The page guesses which column is which (one select
  each to change it), matches owners by name (or the name in an email
  address, "camille.martin@…"), lists the people it did not find so the
  admin gives what they owned to someone, names the teams it will add, the
  rows it leaves out and why, skips objectives already in the cycle, then
  imports in one transaction — with *Undo*.
- **Export**: a cycle as a spreadsheet (CSV, one row per key result), and
  every check-in of the cycle (*Download every check-in*: the trend a
  company keeps when it leaves), headers, words and number format in the
  reader's language (`;` and decimal commas in French).
- **Confidential objectives**: *Who can see it* — everyone (the default),
  its team only (a team that is a group of the Chest), or some people
  chosen. Its owner, the owners of its key results and the admins always
  see it; nobody else finds it anywhere (the tree, the team page, the
  review, the export, what an objective may support, comments). Those
  chosen hear of it in the bell.
- **Nothing is lost by a click**: objectives, key results and comments are
  deleted with *Undo*, teams archived with *Undo*; a closed cycle reopens.
  Only an empty cycle is deleted for good, and the page asks first. A
  dialog with something typed in it asks before closing.

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
objectives on, the setting says so; a personal objective is visible to
everyone unless its owner chooses who sees it (for example only their
manager).

## Looks

Goals wears its own identity, **Trail map** (sand paper, forest ink, a
sunrise orange for progress; `DESIGN.md`), unless the company chooses
otherwise in its Chest: **any theme of the store's catalogue** (the other
tools' identities, "Chest", "High contrast") or **its own brand** (its
colours, fonts, corners and logo, which then stands where Goals' mark is)
— for all its tools, or for Goals alone. Every feature is the same in
every look, light and dark, and every text stays readable (WCAG AA: the
kit checks each theme). The look is the store's UI kit
(`@argentic/chest-ui`, vendored in `vendor/`), and so are the shell, the
toasts, dialogs, people pickers, date fields, filters and file picker —
the same in every store tool.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `admin` | Administrator | cycles, company objectives, teams, settings, import; change any objective or key result, check in for anyone, remind anyone, see every confidential objective, hand over what someone who left owned, delete any comment |
| `member` | Member | write team objectives (of their groups, or of named teams) and personal ones when allowed; change what they own (and who sees it); check in on their key results; remind the owners of key results of their objectives; comment |
| (none) | — | sees "You can't use Goals yet" |

Everyone with a role reads every objective, except a confidential one they
were not given (see *What it does*): objectives are shared by default. The
owner, the admins and the tool's builders come in with the first role.

## First minute

- **What a new user sees:** *My goals*, with this week's check-ins on top.
  On an empty Chest, an admin sees "No cycle yet" and one button with the
  quarter's dates, *Start Q4 2026 (1 Oct – 31 Dec)*: the current calendar
  quarter, or — in the last 14 days of a quarter, on the Chest's calendar
  and in its time zone — the **next** one, with the current one as a quiet
  second choice ("Or start Q3 2026 now (1 day left)"). Its name follows the
  admin's language ("T4 2026" in French). Then *Company* offers *Write the
  first objective*, *Add an example* (a complete objective with three key
  results, to change) or *Import from a spreadsheet*.
- **The first thing they do:** check in — change the number, tap a
  confidence, *Check in*. Writing an objective is one page: its title, why,
  what it supports, and its key results in the same form.
- **Clicks for the main job:** the weekly check-in is 2 clicks when the
  confidence did not change (the value, *Check in*); opening the company's
  tree is 1.
- **A mistake:** a wrong check-in → *Undo* in the toast (or in its history
  for 30 minutes); a deleted objective → *Undo*; a cycle closed too early →
  *Undo* or *Reopen*. A refused action says why, in plain words, and keeps
  what was typed.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | members | My goals: this week's check-ins, what I own |
| `/chest/company` (`?cycle=&status=&team=&owner=`) | members | the cycle's tree, progress, tally, filters; who waits for a check-in (admins, objectives' owners) |
| `/chest/teams`, `/chest/teams/<id>` (`?cycle=`) | members | teams; a team's objectives |
| `/chest/objectives/new` (`?cycle=&level=&team=&parent=`) | who may write | a new objective and its key results |
| `/chest/objectives/<id>` (`?checkin=<kr>`) | members | an objective; its edit page `…/edit` for its owner and admins |
| `/chest/cycles`, `/chest/cycles/<id>` | members (changes: admins) | cycles; a cycle's review |
| `/chest/cycles/<id>/export` (`?what=check-ins`) | members | the cycle as CSV (or every check-in); confidential objectives only for those who see them |
| `/chest/import` (`?cycle=`), `/chest/import/example` | admins | import a spreadsheet; an example file to fill |
| `/chest/settings` | admins | personal objectives, teams, needs a new owner |
| `/chest-events` | the Chest only (signed) | members' lifecycle; deals won or reopened in Clients (the CRM) |
| `/chest-jobs/<name>` | the Chest only (signed) | scheduled tasks (proposal) |
| `/` | anyone | "Goals lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `members` (names, photos, groups for teams);
  `notifications` (the bell and the tile's number); `receives: ["member.*"]`.
  Proposals (studio, `chest.proposals.json`): `mail.send` (the Friday
  reminder and *Remind* by email, to `{member}`: the tool never knows an
  address), `receives` `crm.deal.won` / `crm.deal.reopened` (events
  between tools), `schedules`.
- **Fed by Clients (the CRM)**: once an admin links Clients to Goals in the
  Chest, each deal won or reopened there reaches Goals; a key result fed by
  it shows the amount won (in its currency; deals in another currency are
  counted as deals, not added) or the number of deals won between its
  cycle's first and last day. Goals keeps only each deal's reference,
  amount, currency and when it was won. Its owner still checks in weekly to
  say how sure they are; the value is the CRM's.
- **Someone leaves** (or loses access): nothing is removed. Their objectives,
  key results, check-ins and comments stay; the owner reads "Camille Martin
  (former member)", what they owned in open cycles is listed in *Settings →
  Needs a new owner* (one by one, or "Give everything of … to"), and the
  admins get one bell item, kept up to date, withdrawn when all is handed
  over. **An erasure** replaces their id with `erased` everywhere (owner,
  author, retrospective, who changed a key result); their email choice,
  the reminders they got and the confidential objectives opened to them
  are forgotten; check-ins and comments stay, signed "Former member"; then
  the erasure is acknowledged.
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
- `mail` — **Proposal (studio)**: the Friday reminder and *Remind* by email.
  Without it, nothing fails: the bell still says it.
- **Events between tools** — **Proposal (studio)**: `crm.deal.won` and
  `crm.deal.reopened` from Clients feed key results.
- `chest.theme()` — **Proposal (studio)**: the company's look (a catalogue
  theme or its brand); outside a Chest that has it, Goals wears its own.
- **Not in the SDK, needed** (see the final report / SDK report):
  - **A manager relation** (`member.manager` or `members.reportsTo(id)`):
    "visible to the owner's manager chain" and "remind my team" need it; today
    confidential objectives name people one by one, and "who chases whom"
    is the admins or an objective's owner.
  - **A query between tools** (`tools.query("crm", "deals.won", {from, to})`,
    read-only, granted like events): a key result fed by the CRM counts only
    the deals won after the two tools were linked; the CRM's past is out of
    reach.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/goals --reset --port 5600`
(Atelier Martin's cycles from `seed/sample.sql`: a current Autumn 2026 in its
sixth week, a closed Q3 with scores and learnings, Paul Lefèvre gone, a
confidential payroll objective opened to Tom, a lowered target in a key
result's history),
`node lab/chest-dev/flows/goals.mjs 5600`, `node lab/chest-dev/screens.mjs
tools/private/goals --port 5600`, `node lab/chest-dev/audit.mjs
tools/private/goals --port 5600`.

## What it does not do (yet)

- **Import**: a CSV only (not .xlsx: save as CSV first); owners are matched
  by name, or by the name in an email address — Goals does not read
  members' addresses, so "cm@atelier.fr" is not found and is listed for the
  admin to give; Lattice's file carries no parent links (key results go
  under the objective row above them, the preview shows it); the Lattice
  column names come from its help centre as search results showed it
  (THIRD_PARTY.md), not from a real Lattice export; Perdoo has no fixed
  export shape, so its file always goes through the column mapping.
  Check-in history is not imported (the values now are; a confidence
  column becomes one first check-in).
- **Values from Clients (the CRM)**: only deals won after the tools were
  linked (no query between tools yet); company-wide (not "deals won by the
  key result's owner"); no other tool feeds values yet.
- **Confidential objectives**: no "their manager" (the Chest has no manager
  relation); people are chosen one by one, or a group team.
- **Reminders**: *Remind* goes to one person, once a day; no Slack or Teams.
- **History**: the changes of a key result are kept; an objective's own
  title, owner or parent changes are not.
- **Scores**: one score per objective at the end (0–100 %, in the review and
  the export); no score per key result (its final progress is exported).
- KPIs without a target date, reordering objectives by hand.
- **Never:** performance reviews, ratings of people, links to pay,
  AI-written OKRs.
