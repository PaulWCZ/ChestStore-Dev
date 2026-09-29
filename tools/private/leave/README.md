# Leave — ask for time off, get an answer, know who is away

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Lucca Absences, Factorial
time off, PayFit absences or the shared leave spreadsheet** for companies of
5 to 250 people — in France first: its French interface is called *Congés*.

## What it does

- **My leave** (home): my balances as big cards — one "days left" number,
  the same on every screen (`lib/left.ts`); for paid leave, below it, the
  days **to take now (N-1)** and those **being earned (N)**, as a French pay
  slip shows them; days waiting for an answer beside it, never taken off
  it — one button *Ask for time off*, who is away this week, and my requests
  (coming up: the soonest first; earlier: the latest first) with *Cancel*
  (with *Undo*) or *Ask to cancel*. HR also sees a three-step **first-run
  checklist** (counting rule, import, approvers) until it is done.
- **Asking**: the kind of leave, the first and last day, a half day at
  either end (or *Morning* / *Afternoon* for one day), an optional note. What
  it costs is counted **as the days are picked** — with the company's rule,
  its public holidays ("11 Nov is a public holiday: not counted") and **the
  person's week** (part time, four-day week) — and what will be left once
  the requests still waiting are counted. The server counts again when it
  is sent. Two requests of a person never overlap, not even by half a day.
  A kind may refuse to go below zero (a setting). A **family event** says
  which one (wedding or PACS, birth, death…) and shows the days the law
  gives (art. L3142-4).
- **Recording for someone**: HR, or a person's approver, records leave for
  them from their page (*Record leave*: the warehouse worker without a
  computer, a sick day phoned in, a correction) — approved at once, the
  person told in their bell.
- **Answering**: each person's approver is set by HR (by default HR
  answers). *To answer* lists the requests as cards — who, when, what it
  costs, the balance after, who else is away then — with *Approve* and
  *Refuse* (an optional word). "Balance after" counts the person's other
  waiting requests of the kind that come before it ("counting 1 earlier
  request still waiting"). An answer can be taken back for 10 minutes
  (*Undo*). The bell brings the approver to the request, and the answer to
  the requester, **each in their own language**. The tile's number is the
  requests waiting for that approver.
- **Cancelling**: a waiting request is cancelled by its person at once; an
  approved one is *asked* to be cancelled, and the approver confirms (the
  days come back) or keeps it. An approver or HR may also cancel approved
  leave themselves, with a word (a correction).
- **Sick leave is declared, not asked**: recorded at once, counted in
  calendar days, **never with a note** (no medical detail is ever stored);
  the approver is told.
- **Who's away**: a month grid, one row per person, one column per day —
  approved leave in its colour, leave waiting for an answer striped and
  lighter, half days as half cells, week-ends and public holidays shaded,
  today marked. Filter by *My people* (approvers) or by the Chest's groups.
  Colleagues see that someone is *Away*, never why: the kind is shown only to
  the person, their approver and HR (remote work is no secret: shown as
  *Remote work*). The days a part-timer does not work are hatched in their
  row. On a phone, the month becomes a list of absences — one card each,
  grouped by week, from today in the current month.
- **Balances as a ledger**: every change is a line — opening balance,
  HR adjustment (with a reason), days taken (when approved), days given
  back (when cancelled) — never changed nor deleted (a database trigger
  refuses it). Earned leave is **computed when read**, month by month since
  the person's start date or their opening balance, **until their last
  day**: 25 days a year (2.08 a month) in jours ouvrés, 30 (2.5) in jours
  ouvrables.
- **Leave years** (`lib/balances.ts`, `compute`): paid leave earned during
  a reference period (1 June – 31 May by default, the month is a setting)
  is *being earned* (CP N); on the next 1 June it becomes *acquired* (CP
  N-1) — computed from the dates, no job at night. Days taken come out of
  the oldest days first; taking days still being earned is taking them
  early. When a year is over, the days not taken are **carried over or
  lost, as HR chose for the kind** (a line "End of the year" in the
  history, computed when read). RTT live by calendar year (a setting); any
  kind may keep one running balance instead.
- **People** (HR): everyone's approver (changed in place), employee
  number, balances and waiting days; **Former**: those who left, with their
  last day and final balance. A person's page: start date, **last day**,
  **employee number**, **the days of the week they work**, balances,
  history and requests; *Record leave*; *Add or remove days* (paid leave:
  to the acquired or the being-earned part), *Set the balance* (paid leave:
  both parts); *Give days to everyone* (this year's RTT).
- **Import from another tool** (Lucca, Factorial, PayFit, a spreadsheet),
  two files:
  1. *People and balances*: who (a full name, or `Nom` and `Prénom`, or the
     employee number), then any of: start date (`Date d'entrée`), employee
     number (`Matricule`), balances — one column per kind, paid leave
     possibly as `CP N-1` and `CP N` (also *acquis*, *en cours*, *Solde CP*…).
  2. *Approved leave*: one line per absence — Lucca's absence export as it
     is (`employeeNumber`, `lastName`, `firstName`, `accountId`,
     `startDate`, `flagStartDate` AM/PM, `endDate`, `flagEndDate`,
     `isApproved`) or the French/English equivalents. Only approved lines
     are imported, counted with this company's rules; "the balances I
     imported already count this leave" keeps them from coming off twice
     (cancelling later still gives the days back).
  Headers in English or French, `;` or `,`, `12,5` or `12.5`, `05/10/2026`
  or `2026-10-05`. A column (or a kind of leave, e.g. an account id) the
  tool does not recognise is shown and HR says what it is. Names are matched
  whatever their accents, case or order; nothing is guessed (an unknown or
  ambiguous person, a number that is someone else's, an unreadable date is
  shown, not imported). No address needed.
- **Payroll files** (*People → Payroll files*): a month's approved absences
  as a CSV — employee number, person, kind, first day and from when, last
  day and until when, days this month (a leave across two months is split,
  with the person's week), days in all; and **everyone's balances on a
  day** — paid leave N-1 and N (earned, taken, left), carried over, leave
  approved for later, what is left, waiting — those who left included (the
  final pay). In HR's language (`;` and decimal commas in French).
- **Settings** (HR): jours ouvrés (Monday–Friday) or jours ouvrables
  (Monday–Saturday); Alsace-Moselle; the public holidays the company works
  (e.g. Whit Monday as the solidarity day); the month the leave year starts
  (1 June); the kinds of leave — name, colour, counted against a balance,
  days earned a year, its year (N-1 / N, calendar year, or one running
  balance), the month it starts, unused days carried over or lost, may go
  below zero, half days, counted with the company's rule / the days the
  person works / calendar days, needs an answer, note allowed, counts as an
  absence; hide and show again. Each change is saved at once (a toast), so
  nothing waits for a button. New companies get seven kinds: paid leave,
  RTT, unpaid leave, sick leave, other absence, **family event**, **remote
  work**.
- **Weekday morning reminder** (a Proposal of the SDK working copy): an
  approver with requests waiting more than two days finds one item in their
  bell, "3 requests wait for your answer".

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `hr` | HR | everything: settings, kinds of leave, everyone's approver, dates, week, employee number and balances, imports, payroll files; answers anyone's requests; records leave for anyone |
| `manager` | Manager | asks for their own leave; answers the requests of the people HR made them the approver of, and records leave for them; sees those people's balances, history and the kind of their leave |
| `employee` | Employee | asks for their own leave, follows their requests and balances, sees who is away |
| (none) | — | sees "You can't use Leave yet" |

The owner, the admins and the tool's builders come in with the first role,
`hr`. Nobody answers their own request — except the only HR person of the
company, when nobody was named their approver. Rights are enforced on the
server (`lib/access.ts`), tested for each role (`test/access.test.ts`,
`test/requests.test.ts`, `test/balances.test.ts`).

## First minute

- **What a new user sees:** *Hello Camille*, "7.25 days of paid leave
  left. 2 days wait for an answer.", one big button *Ask for time off*,
  their balances, who is away this week. Before HR entered anything a
  balance card says "Not set up yet. HR will enter your balance."; asking
  already works. HR sees "Set up Leave" and its three steps.
- **The first thing they do:** *Ask for time off* → the kind is already
  *Paid leave*, the first day already the next working day → pick the last
  day → the cost shows → *Send the request*.
- **Clicks for the main job:** a one-day request is 2 clicks (*Ask*, *Send*);
  a week is 2 clicks and a date; answering is 1 click (*Approve*), from the
  bell or from *To answer*.
- **A mistake:** cancelled by mistake → *Undo* in the toast; approved or
  refused by mistake → *Undo* (10 minutes), or *Take my answer back* on the
  request; dates that cost nothing (a week-end) → the button stays off and
  says why; days asked twice → "You already asked for some of these days."

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | everyone with a role | my balances, ask, away this week, my requests (`?done=sent\|declared` after asking) |
| `/chest/new` | everyone with a role | ask for time off |
| `/chest/requests/<id>` | the person, their approver, HR | one request, its actions and history (the bell links here) |
| `/chest/approvals` | managers, HR | what waits for my answer |
| `/chest/calendar?month=YYYY-MM&show=all\|mine\|grp_…` | everyone with a role | who is away |
| `/chest/new?for=<mbr_…>` | HR, the person's approver | record leave for someone |
| `/chest/people?show=former` | HR (everyone), managers (their people) | people, approvers, balances; HR's import, payroll files, days for everyone; `former`: those who left |
| `/chest/people/<mbr_…>` | HR, the person's approver | a person's balances, history, requests (HR changes them) |
| `/chest/people/import?what=leave` | HR | import people and balances; `leave`: approved leave |
| `/chest/people/payroll` | HR | the two payroll files |
| `/chest/people/export?month=YYYY-MM` | HR | the month's absences CSV |
| `/chest/people/balances?on=YYYY-MM-DD` | HR | everyone's balances CSV |
| `/chest/settings` | HR | rules and kinds of leave |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-jobs/morning` | the Chest only (signed; Proposal) | the weekday reminder |
| `/` | anyone | "Leave lives in your Chest" |

## French rules — what is built in, what is configurable, what is not verified

**Sources** (read on 2026-09-29; service-public.fr, legifrance.gouv.fr,
code.travail.gouv.fr and lucca.fr are blocked by this studio's network, so
each rule below comes from **search-result summaries of those pages**, not
from the pages themselves — a payroll expert must confirm them before the
tool ships):

- Acquisition 2.5 jours ouvrables a month, 30 a year, reference period
  1 June – 31 May unless an agreement sets another, leave open from hiring:
  Code du travail art. L3141-3, L3141-10, R3141-4, L3141-12, via
  [service-public.gouv.fr F2258](https://www.service-public.gouv.fr/particuliers/vosdroits/F2258?lang=en)
  and [urssaf.fr](https://www.urssaf.fr/accueil/particulier/particulier-employeur/gerer-les-absences/gestion-conges-payes.html).
- Part-time staff earn as much leave; their leave is counted from the first
  day they would have worked to the last jour ouvrable before they are back
  (a Monday–Wednesday worker off Monday to Wednesday is charged 6 jours
  ouvrables): [GHR](https://www.ghr.fr/social/actualites/conges-payes-des-salaries-a-temps-partiel-piqure-de-rappel-sur-le-decompte),
  [l-expert-comptable.com](https://www.l-expert-comptable.com/a/532462-les-conges-payes-des-salaries-temps-partiel.html),
  [Skello](https://www.skello.io/blog/decompte-des-conges-payes-a-temps-partiel).
- Days not taken by the end of the period are lost in principle, except
  when the person could not take them (sick leave: 15-month carry-over, loi
  2024-364; employer's refusal) or an agreement carries them over; unused
  paid leave is paid only when the contract ends (indemnité compensatrice,
  art. L3141-28): [LégiSocial](https://www.legisocial.fr/actualites-sociales/7953-jours-conges-pris-31-mai-2026.html),
  [Juritravail](https://www.juritravail.com/Actualite/report-des-conges-payes-motifs-delai-demarches/Id/378240).
  So the tool offers *carried over* (the default: it never deletes days by
  itself) or *lost*, never "paid".
- Family events, at least: wedding or PACS 4 days, a child's wedding 1,
  birth or adoption 3, death of a child 12 (14 under 25), of a spouse or
  partner 3, of a parent, parent-in-law, brother or sister 3, a child's
  disability or serious illness 5 — art. L3142-4 via
  [code.travail.gouv.fr](https://code.travail.gouv.fr/code-du-travail/l3142-4);
  counted in jours ouvrables in principle
  ([code.travail.gouv.fr](https://code.travail.gouv.fr/contribution/les-conges-pour-evenements-familiaux)).
  The child's-wedding and parents'-death amounts are from the studio's
  knowledge of the article, **not** in the summaries read.

Built in and tested (`lib/calendar.ts`, `lib/balances.ts`,
`test/calendar.test.ts`, `test/years.test.ts`):

- The 11 public holidays of the Code du travail (art. L3133-1), computed for
  any year (Easter by the Meeus/Jones/Butcher algorithm), and
  Alsace-Moselle's Good Friday and 26 December (art. L3134-13).
- **Jours ouvrés** (Monday to Friday) and **jours ouvrables** (Monday to
  Saturday), public holidays not worked excluded; paid leave starts on the
  first day the person would have worked and runs to the day before they
  are back — for full-time and part-time staff alike (a week off costs 6
  jours ouvrables; someone who does not work Fridays and is off Monday to
  Thursday is charged the Friday). RTT and remote days count only the days
  the person works.
- Paid leave earned month by month (a month is earned once complete), in
  the period it was worked in; N-1 / N; oldest days taken first; the end of
  a period (carried over or lost); nothing earned after the last day.

Configurable, because each company decides them: the counting rule, the
month the leave year starts (and each kind's), each kind's yearly amount,
what happens to unused days, whether a kind may go below zero, the public
holidays the company works, RTT days (*Give days to everyone*).

**Not done — HR adjusts by hand** (each is an *Adjustment* with a reason):
leave earned during sick leave (loi 2024-364: 2 days a month, cap 24) and
its 15-month carry-over; *fractionnement* days (art. L3141-23); leave
falling sick (Cass. soc. 10 Sept 2025); rounding earned days up to the whole
day (art. L3141-7 — shown with two decimals); a month started but not
complete when someone joins or leaves (payroll prorates it); months not
worked (unpaid leave) that do not earn leave; the "never less favourable"
comparison of ouvrés with ouvrables.

## On a Chest

- `capabilities`: `database`; `members` (names, photos, roles and groups
  for the calendar, the approvers and the import — no addresses);
  `notifications` (the bell and the tile's number); `receives: ["member.*"]`.
- **Someone leaves** (or loses access): their requests still waiting are
  cancelled (the history says why), the people they approved go back to HR,
  and **their last day is set** to that day (unless HR set one before):
  nothing is earned after it. Their approved leave and balance lines stay:
  they are HR's records; they are listed under *People → Former* with their
  final balance, and in the balances file. If they come back, HR clears the
  last day.
- **An erasure**: the same, then their id, notes, reasons and start date
  disappear; requests and balance lines keep their dates, kinds and days,
  signed "Former member" (`erased`), so HR's totals still add up. Then the
  erasure is acknowledged. **Retention caveat**: absences that were paid or
  deducted are payroll records the employer may have to keep, *identified*,
  for the wage prescription (3 years, art. L3245-1) or longer under the
  CNIL's HR retention referential (April 2026, not verified first-hand).
  The owner decides an erasure in the Chest; HR should download the payroll
  exports it must keep **before** asking for one. The tool cannot keep a
  person's identity against an erasure.
- **Its look** follows the company's choice in the Chest (see "Looks");
  without that choice (or on a Chest without themes) it is Seaside.
- **Nothing runs in the background**: earned leave is computed when read;
  the tile's numbers are set whenever a request changes (and each weekday
  morning with the schedule proposal).
- No WebSocket: the pages re-read themselves every 30–60 s while visible.

## Looks

Leave wears its own look, **Seaside** (a pastel sky, peach and mint, big
rounded cards; `lib/theme.ts`, DESIGN.md) — or any theme of the Chest's
catalogue (the store's 17 identities, "Chest", "High contrast"), or the
**company's brand** (its colours, fonts, corners and logo), as the company
chooses in its Chest for all its tools or for Leave alone (`chest.theme()`,
**Proposal (studio)**, SDK 0.3.0-studio.12). Every feature is the same in
every look, and every text stays readable (WCAG AA, light and dark): the
kinds of leave keep their colour family (sky stays bluish, peach
orange-ish…) in every theme, and are told by their name where a theme has
no colour (the "Chest" theme). In brand mode the company's logo stands
beside "Leave". The look is resolved on the server, one `<style>` with the
page's nonce; nothing runs in the browser for it.

The pages are built from the store's UI kit (`@argentic/chest-ui`, in
`vendor/`): its shell, toasts, dialogs, date fields, people picker, table,
filters and badges, so Leave behaves like the other tools of the store.

## With the other tools

Leave tells the other tools of the Chest when a leave is approved and when
it no longer stands (**Proposal (studio)**: events between tools;
`chest.proposals.json` `"emits": ["leave.approved", "leave.cancelled"]`),
once an administrator linked them: **Rooms** then shows the person "Off"
those days and frees their desk. What is told: the person (their member
id), the first and last day and the halves — never the kind of leave nor
the note (`lib/share.ts`). Without events between tools, nothing changes
here.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: the interface and
  the bell in each member's language.
- `chest.theme()` — **Proposal (studio)**: the look the company chose
  (see "Looks"). Without it, Leave wears Seaside.
- **Scheduled tasks** — **Proposal (studio)** (`chest.proposals.json`,
  `app/chest-jobs/[name]/route.ts`): the weekday morning reminder at 08:30.
  Without it, requests still reach approvers through the bell and the tile.
- **Events between tools** — **Proposal (studio)**: `leave.approved` /
  `leave.cancelled` to Rooms (payload unchanged: member, from, to, halves,
  request — never the kind, the note or the family event).
- Wished, not built: **email** (the mail proposal exists in the SDK working
  copy; this tool does not use it yet — an approver who never opens the
  Chest only sees the tile and the bell); a **per-member secret feed** for
  an iCal/Outlook/Google calendar of absences (needs a route the Chest
  serves without a signed-in member, tied to one member, revocable:
  `feeds.url(memberId, name)` + `feeds.verify(request) → memberId`); the
  Chest's **time zone** (today is Europe/Paris); a member's **manager**
  known by the Chest (HR sets approvers here instead); a member's **employee
  number** and **start date** from the Chest or People (HR types or imports
  them here).

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/leave --prod --reset --port 4400`
(a seven-person company from `seed/sample.sql`, dates around today),
`node lab/chest-dev/flows/leave.mjs 4400` (the browser flows),
`node lab/chest-dev/screens.mjs tools/private/leave --port 4400`.

## What it does not do (yet)

- **No email and no calendar feed** (see "Needs from the SDK"): approvers
  learn of requests from the tile and the bell only.
- The automatic French computations listed under "Not done — HR adjusts by
  hand".
- No week view of *Who's away* (a month, and a list by week on a phone); no
  date picker showing holidays and colleagues already away (native date
  fields).
- No blackout periods, minimum staffing rules or "3 people from Sales
  already off" warning when asking (approvers see "Also away" on each
  card).
- Work schedules are whole days of the week (no half-day schedules, no
  alternating weeks); a person's week applies to all their leave, past
  requests keep the cost they had when asked.
- Overtime and time off in lieu; multi-step approval and delegation while
  an approver is away; company days off (bridge days) other than public
  holidays; overseas departments' holidays; attachments (sick notes stay
  with payroll); payroll integrations (DSN, PayFit or Silae APIs) — the
  files are CSV.
- The import does not bring history older than a year, nor Lucca's own
  counters beyond the balances in the file (a column the tool does not know
  is left out unless HR maps it).
