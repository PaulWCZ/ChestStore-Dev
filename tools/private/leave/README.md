# Leave — ask for time off, get an answer, know who is away

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Lucca Absences, Factorial
time off, PayFit absences or the shared leave spreadsheet** for companies of
5 to 250 people — in France first: its French interface is called *Congés*.

## What it does

- **My leave** (home): my balances as big cards (paid leave, RTT…: days
  left, earned each month, days waiting for an answer), one button *Ask for
  time off*, who is away this week, and my requests (coming up, earlier)
  with *Cancel* (with *Undo*) or *Ask to cancel*.
- **Asking**: the kind of leave, the first and last day, a half day at
  either end (or *Morning* / *Afternoon* for one day), an optional note. What
  it costs is counted **as the days are picked** — with the company's rule
  and its public holidays ("11 Nov is a public holiday: not counted") — and
  what will be left. The server counts again when it is sent. Two requests
  of a person never overlap, not even by half a day.
- **Answering**: each person's approver is set by HR (by default HR
  answers). *To answer* lists the requests as cards — who, when, what it
  costs, the balance after, who else is away then — with *Approve* and
  *Refuse* (an optional word); an answer can be taken back for 10 minutes
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
  the person, their approver and HR. On a phone, the month becomes a list of
  days.
- **Balances as a ledger**: every change is a line — opening balance,
  HR adjustment (with a reason), days taken (when approved), days given
  back (when cancelled) — never changed nor deleted (a database trigger
  refuses it). Earned leave is **computed when read**, month by month since
  the person's start date or their opening balance: 25 days a year (2.08 a
  month) in jours ouvrés, 30 (2.5) in jours ouvrables.
- **People** (HR): everyone's approver (changed in place), balances and
  waiting days; a person's page with their start date, balances, history and
  requests; *Add or remove days*, *Set the balance*; *Give days to everyone*
  (this year's RTT).
- **Import balances** from Lucca, Factorial or a spreadsheet: a CSV with the
  person's full name, then one column per kind of leave (in English or
  French, `;` or `,`, `12,5` or `12.5`). Names are matched to the Chest's
  members whatever their accents, case or order; nothing is guessed (an
  unknown or ambiguous name is shown, not imported). No address needed.
- **Payroll export**: a month's approved absences as a CSV — person, kind,
  first day and from when, last day and until when, days this month (a leave
  across two months is split), days in all — in HR's language (`;` and
  decimal commas in French).
- **Settings** (HR): jours ouvrés (Monday–Friday) or jours ouvrables
  (Monday–Saturday); Alsace-Moselle; the public holidays the company works
  (e.g. Whit Monday as the solidarity day); the month the leave year starts
  (1 June); the kinds of leave — name, colour, counted against a balance,
  days earned a year, half days, working or calendar days, needs an answer,
  note allowed; hide and show again.
- **Weekday morning reminder** (a Proposal of the SDK working copy): an
  approver with requests waiting more than two days finds one item in their
  bell, "3 requests wait for your answer".

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `hr` | HR | everything: settings, kinds of leave, everyone's approver, start date and balances, import, payroll export; answers anyone's requests |
| `manager` | Manager | asks for their own leave; answers the requests of the people HR made them the approver of; sees those people's balances, history and the kind of their leave |
| `employee` | Employee | asks for their own leave, follows their requests and balances, sees who is away |
| (none) | — | sees "You can't use Leave yet" |

The owner, the admins and the tool's builders come in with the first role,
`hr`. Nobody answers their own request — except the only HR person of the
company, when nobody was named their approver. Rights are enforced on the
server (`lib/access.ts`), tested for each role (`test/access.test.ts`,
`test/requests.test.ts`, `test/balances.test.ts`).

## First minute

- **What a new user sees:** *Hello Camille*, "7.25 days of paid leave
  left", one big button *Ask for time off*, their balances, who is away this
  week. Before HR entered anything a balance card says "Not set up yet. HR
  will enter your balance."; asking already works.
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
| `/chest/people` | HR (everyone), managers (their people) | people, approvers, balances; HR's import, export, days for everyone |
| `/chest/people/<mbr_…>` | HR, the person's approver | a person's balances, history, requests (HR changes them) |
| `/chest/people/import` | HR | import opening balances |
| `/chest/people/export?month=YYYY-MM` | HR | the payroll CSV |
| `/chest/settings` | HR | rules and kinds of leave |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-jobs/morning` | the Chest only (signed; Proposal) | the weekday reminder |
| `/` | anyone | "Leave lives in your Chest" |

## French rules — what is built in, what is configurable, what is not verified

Built in and tested (`lib/calendar.ts`, `test/calendar.test.ts`):

- The 11 public holidays of the Code du travail (art. L3133-1), computed for
  any year (Easter by the Meeus/Jones/Butcher algorithm; Easter Monday,
  Ascension, Whit Monday from it), and Alsace-Moselle's Good Friday and
  26 December (art. L3134-13) when the company says so.
- **Jours ouvrés**: Monday to Friday, public holidays not worked excluded.
  **Jours ouvrables**: Monday to Saturday, and the Saturday after a leave
  that ends on the last worked day of a week (a week off costs 6).
- Paid leave earned month by month: 25 days a year in jours ouvrés, 30 in
  jours ouvrables (art. L3141-3: 2.5 jours ouvrables a month); a month is
  earned once complete; the leave year starts 1 June by default.

Configurable, because the research could not verify them first-hand
(Légifrance was out of reach; see `reports/02-open-source/leave.md`) or
because each company decides them:

- the counting rule (ouvrés / ouvrables), the month the leave year starts,
  the yearly amount of each kind of leave;
- which public holidays the company works (only 1 May is compulsorily not
  worked; the solidarity day is often Whit Monday);
- RTT: a kind of leave with no amount of its own; HR gives the days (*Give
  days to everyone*), as each collective agreement sets them;
- sick leave counted in calendar days (a kind's setting).

**Not done — HR adjusts by hand** (each is an *Adjustment* with a reason):
leave earned during sick leave (loi 2024-364: 2 days a month, cap 24) and
its 15-month carry-over; *fractionnement* days (art. L3141-23); days not
taken at the end of the leave year (they are neither lost nor carried
automatically: the balance simply continues); leave falling sick (Cass.
soc. 10 Sept 2025); a rounding of earned days to the whole day above
(art. L3141-7 — shown with two decimals); the "never less favourable"
comparison of ouvrés with ouvrables when a holiday falls on a Saturday;
months not worked (unpaid leave) that do not earn leave. A lawyer or payroll
expert should confirm the rules above before the tool ships.

## On a Chest

- `capabilities`: `database`; `members` (names, photos, roles and groups
  for the calendar, the approvers and the import — no addresses);
  `notifications` (the bell and the tile's number); `receives: ["member.*"]`.
- **Someone leaves** (or loses access): their requests still waiting are
  cancelled (the history says why), the people they approved go back to HR.
  Their approved leave and balance lines stay: they are HR's records.
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
- **Nothing runs in the background**: earned leave is computed when read;
  the tile's numbers are set whenever a request changes (and each weekday
  morning with the schedule proposal).
- No WebSocket: the pages re-read themselves every 30–60 s while visible.

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
- **Scheduled tasks** — **Proposal (studio)** (`chest.proposals.json`,
  `app/chest-jobs/[name]/route.ts`): the weekday morning reminder at 08:30.
  Without it, requests still reach approvers through the bell and the tile.
- Wished, not built (see the final report of this tool): **email** to reach
  an approver who does not open the Chest; a **per-member secret feed**
  (iCal) of absences for Outlook/Google; the Chest's **time zone** (today is
  Europe/Paris); a member's **manager** or team lead known by the Chest (HR
  sets approvers here instead); **events between tools** (a leave shown in
  Rooms, a new hire's start date from People).

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

The automatic French computations listed above; overtime and time-off in
lieu; multi-step approval and delegation while an approver is away; HR
recording leave on someone's behalf (the person asks; sick leave by phone
is recorded by HR as an adjustment only); an iCal feed; email; company days
off (bridge days) other than public holidays; overseas departments'
holidays; attachments (sick notes stay with payroll); payroll integrations
(DSN, PayFit API).
