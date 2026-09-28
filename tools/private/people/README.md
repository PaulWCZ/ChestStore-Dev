# People — who does what, and welcoming new colleagues

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server. It replaces the **directory, org chart and onboarding parts of
BambooHR, Factorial or Lucca Poplee**, the Google Workspace directory, and
the Notion "team" page or shared "who's who" spreadsheet.

## What it does

- **Directory** — everyone who has the tool, as portraits: the Chest is the
  truth of who is in the company, with their name and photo; People keeps
  only what the Chest does not know: job title, team, office, manager, work
  phone, pronouns, a short bio, "Ask me about" topics, start date, and a
  birthday (day and month only, shown only if the person turns it on).
  Search as you type on name, job, team, office and topics (accents and case
  aside); filter by team and office; the search stays in the address.
- **A profile page** per person: how to reach them (one tap to call), what
  to ask them, whom they report to and who reports to them, how long they
  have been here, their checklists (for those allowed to see them).
- **Edit** — each person edits their own phone, pronouns, bio, topics and
  birthday; HR edits anyone's job title, team, office, manager, start date
  and work phone. A manager can never be someone below the person: the
  server refuses loops (and the picker does not offer them).
- **Org chart**, drawn from the managers: top-down trees with thin
  connectors, each team folding open and shut; an indented list on phones;
  "Not in the chart yet" lists those without a manager or team.
- **New colleagues** — people who started in the last 30 days are greeted
  on the directory ("Say hello to Nora"), those arriving in the next 60
  days listed; **this month**'s birthdays (opt-in) and work anniversaries.
- **Checklists for arrivals and departures** — HR writes templates ("Office
  newcomer", "Leaving"; two examples in one click): each step is given to
  *the newcomer / the person leaving*, *their manager*, *HR (whoever starts
  it)* or a named member, on a day counted from the first (or last) day.
  HR starts one for a person; each step goes to someone, who finds it in
  **My to-dos** and in the Chest's bell, in their language; they tick it
  (with *Undo*). HR follows progress, gives a step to someone else, moves
  its day, adds or removes steps, stops a checklist (with *Undo*) or
  deletes a stopped one. The person who started it is told when it is
  complete.
- **Import** a CSV (a shared spreadsheet, BambooHR's "Employee directory"
  report, a Google Workspace users export, Lucca's export): people matched
  by full name (accents, case and "Last First" order aside); columns for
  title, team, manager (by name), phone, office, start date recognised in
  English and French; day-first or month-first dates detected; a preview
  says what will change and what is left out; empty cells change nothing.
  **Export** the directory as CSV (the same columns: it round-trips).

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `hr` | HR | everything below, and: everyone's job fields, templates, start/follow/stop checklists, tick any step, import, export |
| `member` | Member | read the directory and the org chart, edit their own profile, do and tick the steps given to them, see the checklists they take part in (theirs, their reports', those with a step for them) |
| (none) | — | "You can't use People yet" |

The owner, the admins and the tool's builders arrive as `hr`.

## First minute

- **What a new person sees first:** the team as a wall of portraits, a big
  search field, and — if they are new — their own face under "Say hello",
  plus "Add a few words about you" when their profile is empty.
- **The first thing they do:** type a name or a topic ("invoices") — the
  wall filters as they type — and open a card; or complete their profile.
- **Clicks for the main jobs:** find someone and call them: type + 2
  clicks. Tick a to-do: 1 click from *My to-dos* (the bell links there).
  HR starting an arrival: *Start a checklist* → person, template, date →
  *Start* (4 clicks; the first day is pre-filled from the start date).
- **A mistake:** ticking has *Undo*; removing a step or stopping a checklist
  has *Undo*; a refused save says why and keeps what was typed; a manager
  that would make a loop is refused in plain words.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` (`?q=`, `?team=`, `?office=`) | members with a role | the directory |
| `/chest/people/<id>` | idem | a profile |
| `/chest/people/<id>/edit` | the person, HR | edit a profile |
| `/chest/chart` | members with a role | the org chart |
| `/chest/todo` | idem | my to-dos |
| `/chest/checklists`, `/chest/checklists/new` | HR | arrivals and departures, templates; start one |
| `/chest/checklists/<id>` | HR, the person, their manager, those with a step | one checklist |
| `/chest/checklists/templates/<id>` | HR | a template |
| `/chest/import`, `/chest/export` | HR | CSV import, CSV download |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-jobs/morning` | the Chest only (signed) — proposal | the weekday morning reminder |
| `/` | anyone | "People lives in your Chest" |

## On a Chest

- `capabilities`: `database`, `members` (names, photos, roles: the directory
  itself), `notifications` (the bell and the tile's number: open to-dos);
  `receives: ["member.*"]`. No files, no network.
- **The directory is the Chest's members who have the tool.** Give People
  to everyone (open to all) so the directory is the whole company.
- **Someone leaves** (or loses access): they leave the directory at once;
  their profile is kept 30 days in case they come back, then purged. The
  people they managed no longer have a manager, their open steps go to
  "Nobody yet", templates naming them give the step to HR — and HR is told
  in the bell. Checklist history keeps them as "(former member)".
- **An erasure** deletes their profile and the checklists about them (their
  HR record), and replaces their id everywhere else; then it is
  acknowledged.
- **Privacy**: no photo is stored (the Chest's own); a birthday is day and
  month only, and only when the person turns it on — turning it off forgets
  it. No sensitive HR data (salary, contract, ID) is kept: that is not a
  directory's job.
- No WebSocket: pages re-read themselves every 30–60 s while visible.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: the interface and
  the bell in each member's language.
- **Scheduled tasks** — **Proposal (studio)** (`chest.proposals.json`:
  `morning`, weekdays 07:40): one bell item per person with steps due today
  or late, tiles' numbers kept true overnight, and the 30-day purge of
  departed profiles. **Without it** the tool is fully usable: the tile's
  number is set whenever a step changes and when its owner opens *My
  to-dos*, and the purge runs whenever the directory is read.
- **Wished for, not built**: **email** would let HR send a welcome message before day 1 (the newcomer
  often has no Chest access yet); **events between tools** would let
  *Hiring* create the profile and start the arrival checklist, and
  *Equipment* add "return the laptop" steps automatically.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/people --reset`
(a sample company from `seed/sample.sql`: Nora started six days ago, her
welcome checklist is under way), `node lab/chest-dev/flows/people.mjs 4700`
(the browser flows), `node lab/chest-dev/screens.mjs tools/private/people`.

## What it does not do (yet)

A column-mapping step in the import (column names are recognised from a
list of English and French headers), vCard export, custom profile fields,
languages spoken as a field, an "away until" badge (would come from Leave),
teams as Chest groups, drag-and-drop in the org chart, reminders by email,
emailing the newcomer before day 1, sensitive HR files (never).
