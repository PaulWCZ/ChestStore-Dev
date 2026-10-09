# Leave — ask for time off, get an answer, know who is away

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Lucca Absences, Factorial
time off, PayFit absences or the shared leave spreadsheet** for companies of
5 to 250 people — in France first: its French interface is called *Congés*.

## What it does

- **My leave** (home): my balances as big cards — one "days left" number,
  the same on every screen (`src/shared/left.ts`); for paid leave, below it, the
  days **to take now (N-1)** and those **being earned (N)**, as a French pay
  slip shows them; days waiting for an answer beside it, never taken off
  it — one button *Ask for time off*, who is away this week, and my requests
  (coming up: the soonest first; earlier: the latest first) with *Cancel*
  (with *Undo*) or *Ask to cancel*. HR also sees a three-step **first-run
  checklist** (counting rule, import, approvers) until it is done; before
  a balance is set, HR's own card says *Set your balance* (a link), an
  employee's "HR will enter your balance".
- **Asking**: the kind of leave, the first and last day, a half day at
  either end (or *Morning* / *Afternoon* for one day), an optional note. What
  it costs is counted **as the days are picked** — with the company's rule,
  its public holidays ("11 Nov is a public holiday: not counted") and **the
  person's week** (part time, four-day week) — and what will be left once
  the requests still waiting are counted. The server counts again when it
  is sent. Two requests of a person never overlap, not even by half a day.
  A kind may refuse to go below zero (a setting). **Paid leave refuses by
  default** (French practice: leave not yet earned is an advance the
  employer decides; Lucca and PayFit refuse by default too, as the studio
  knows them — not verified first-hand): the form says "cannot go below
  zero" and the button stays off. HR (or the person's approver) recording
  leave for someone may go below — the advance they decided, said as such
  on the form — or HR turns "May go below zero" on for the kind. While a
  date is refused by its field, the form counts nothing and says to fix it
  (never one day shown and another counted). A **family event** says
  which one (wedding or PACS, birth, death…), shows the days the law
  gives (art. L3142-4), warns when the dates cost more, and **counts only
  the days the person works** (a part-timer on Monday–Wednesday away
  Monday to Thursday is charged 3 days, not the paid-leave rule's 5; HR
  may choose another counting for the kind).
- **Recording for someone**: HR, or a person's approver, records leave for
  them from their page (*Record leave*: the warehouse worker without a
  computer, a sick day phoned in, a correction) — approved at once, the
  person told in their bell.
- **Answering**: each person's approver is set by HR (by default HR
  answers). *To answer* lists the requests as cards — who, when, what it
  costs, the balance after, who else is away then — with *Approve* and
  *Refuse* (an optional word). "Balance after" counts the person's other
  waiting requests of the kind that come before it ("counting 1 earlier
  request still waiting"). **Approving never re-checks the balance, by
  design**: a request was checked when asked (a kind that may not go below
  zero refuses it then), and if HR removed days since, the card shows the
  balance after in red — approving is then the approver's informed choice
  (an advance), refusing is one tap. An answer can be taken back for 10
  minutes (*Undo*); a refusal taken back waits again only if the person
  has not asked for those days meanwhile. The bell brings the approver to the request, and the answer to
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
  today marked. Filter by *My people* (approvers) or by the Chest's groups
  (every group of the Chest with the `groups` proposal — Leave is usually
  open to everyone, which gives it no group of its own).
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
- **Leave years** (`src/lib/balances.ts`, `compute`): paid leave earned during
  a reference period (1 June – 31 May by default, the month is a setting)
  is *being earned* (CP N); on the next 1 June it becomes *acquired* (CP
  N-1) — computed from the dates, no job at night. Days taken come out of
  the oldest days first; taking days still being earned is taking them
  early. When a year is over, the days not taken are **carried over or
  lost, as HR chose for the kind** (a line "End of the year" in the
  history, computed when read). RTT live by calendar year (a setting); any
  kind may keep one running balance instead.
  A leave across a year's start (RTT over New Year, paid leave over 31
  May) is cut there: each year pays the days in it, counted like payroll's
  month split; payroll's "balances on" file counts the days after its day
  as booked, not taken.
- **People** (HR): everyone's approver (changed in place), employee
  number, balances and waiting days; **Former**: those who left, with their
  last day and final balance. **Setting a last day cancels the leave
  recorded after it, and cuts at that day the leave that runs past it**:
  the days come back in the history ("After their last day"), so the
  final balance payroll pays is right; the toast says how many. A person's
  page: start date, **last day**,
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
- **Email is the Chest's, not Leave's** (the owner's decision of 6
  October 2026): Leave sends no email. The approver's "Hugo Bernard asks
  for time off" (the kind, the days, and the link to answer it), the
  requester's answer (with the approver's word), a request to cancel and
  its outcome, leave recorded for someone, the morning reminder of
  requests waiting — each is a notification, written in English with its
  French (`translations`): the Chest shows each person their language and
  **mails them their notifications by their own choice in the Chest**
  (each one, once or twice a day, or off; off for Leave alone). Never the
  note. *My leave* says where email is chosen, in one line. What changed:
  the email switch of *My leave* and Leave's own emails are gone; the
  moments people are told are the same.
- **My leave in my calendar** (the `calendar` proposal): each approved
  absence — asked and approved, declared, recorded by HR, imported; not
  remote work nor another kind that is not an absence — is an
  event in its person's own Chest calendar feed, the one Google Calendar,
  Outlook or Apple Calendar subscribe to once. **Private, and it never says
  why**: the title is "Off" ("Absent" in French), never the kind of leave
  (not "Sick leave") nor the note, and it is `CLASS:PRIVATE`, so a
  calendar shared with colleagues shows the time busy without a word. Whole
  days are whole days; a half day is noon to midnight (afternoon) or
  midnight to noon (morning), in the zone the person works in (the one the
  Chest says for them: someone working from Montréal is off from
  Montréal's midnight). It opens the
  request. Cancelled, its approval taken back, refused after all, cut or
  cancelled by a last day, erased: it goes. A month after it ends it leaves
  the feed (the Chest keeps 5,000 events per tool). *My leave* links to the
  Chest's calendar page ("Your approved leave is in your calendar") once
  the Chest took an event; on a Chest without the calendar, nothing is
  promised and nothing fails (asked again at most once an hour and each
  morning).
- **Payroll files** (*People → Payroll files*): a month's approved absences
  as a CSV — employee number, person, kind, **payroll code**, first day and from when, last
  day and until when, days this month (a leave across two months is split,
  with the person's week), days in all; and **everyone's balances on a
  day** — **any day up to the end of next month** (payroll is prepared
  around the 20th for the month's end: a later day is a projection —
  earned months added, approved leave up to it taken — and the file is
  named "…-projected.csv"), counted **at the end of that day** (on the
  30th, September's +2.08 is in) — paid leave N-1 and N (earned, taken,
  left), carried over, leave approved for later, what is left, waiting —
  those who left included (the final pay), **names written as they are**
  (never "(former member)": the last-day column says who left); each kind's columns carry its payroll code ("Paid leave (CP)
  left"). In HR's language (`;` and decimal commas in French).
- **Settings** (HR): jours ouvrés (Monday–Friday) or jours ouvrables
  (Monday–Saturday); Alsace-Moselle; the public holidays the company works
  (e.g. Whit Monday as the solidarity day); the month the leave year starts
  (1 June); the kinds of leave — name, colour, counted against a balance,
  days earned a year, its year (N-1 / N, calendar year, or one running
  balance), the month it starts, unused days carried over or lost, may go
  below zero, half days, counted with the company's rule / the days the
  person works / calendar days, needs an answer, note allowed, counts as an
  absence, **payroll code** (the code Silae, PayFit or Sage import the
  absence by: CP, RTT, CSS, MAL and EVF to start with); hide and show
  again. Each change is saved at once (a toast), so
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
server (`src/lib/access.ts`), tested for each role (`test/access.test.ts`,
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
| `/chest-events` | the Chest only (signed) | members' lifecycle; People's events (proposal) |
| `/chest-schedules` | the Chest only (signed) | the runs of `chest.json`'s schedule `morning` (weekdays 08:30, the Chest's zone): the reminder, the tiles, feeds and busy times kept in line |
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

Built in and tested (`src/shared/calendar.ts`, `src/lib/balances.ts`,
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

## Mail to people outside the company

None. Leave writes to no one outside the company: its public page only
says it lives in the Chest, and every message is a notification to a
member (above). It declares no `mail`.

| Recipient | Purpose | When | Content | Attachments | Reply-To |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## On a Chest

- `capabilities`: `database`; `members` (names, photos, roles and groups
  for the calendar, the approvers and the import — no addresses);
  proposals (`chest.proposals.json`): `calendar`, `capabilities:
  ["members.groups"]`, `emits`
  (`leave.approved`, `leave.cancelled`, `leave.busy`), `receives` (People),
  `schedules` (`morning`);
  `notifications` (the bell and the tile's number); `receives: ["member.*"]`.
- **Someone leaves** (or loses access): their requests still waiting are
  cancelled (the history says why), the people they approved go back to HR,
  and **their last day is set** to that day (unless HR set one before):
  nothing is earned after it. Their approved leave up to that day and
  their balance lines stay: they are HR's records. **Approved leave after
  it is cancelled (or cut at it) and its days come back**, and HR is told in
  the bell to check the final balance. They are listed under *People →
  Former* with their final balance, and in the balances file. If they come
  back, HR clears the last day (leave cancelled by it stays cancelled: HR
  records it again).
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
  the tile's numbers, the calendar feeds and the busy times are set right
  after a request changes (after the answer is sent: `after()` in
  `src/actions.ts`), after the Chest's and People's events, and each
  weekday morning with the `morning` schedule of `chest.json` (the busy times' 90-day window
  moves on; a month-old leave leaves the feeds).
- No WebSocket: the pages re-read themselves every 30–60 s while visible.

## Looks

Leave wears its own look, **Seaside** (a pastel sky, peach and mint, big
rounded cards; `src/theme.ts`, DESIGN.md) — or any theme of the Chest's
catalogue (the store's 17 identities, "Chest", "High contrast"), or the
**company's brand** (its colours, fonts, corners and logo), as the company
chooses in its Chest for all its tools or for Leave alone (`chest.theme()`,
**Proposal (studio)**, SDK 0.4.1-studio.2). Every feature is the same in
every look, and every text stays readable (WCAG AA, light and dark): the
kinds of leave keep their colour family (sky stays bluish, peach
orange-ish…) in every theme, and are told by their name where a theme has
no colour (the "Chest" theme). In brand mode the company's logo stands
beside "Leave". The look is resolved on the server and served as a stylesheet of its own
(`/chest/look.css?v=<its hash>`): nothing inline, nothing runs in the
browser for it.

The pages are built from the store's UI kit (`@argentic/chest-ui`, in
`vendor/`): its shell, toasts, dialogs, date fields, people picker, table,
filters and badges, so Leave behaves like the other tools of the store.

## With the other tools

Leave tells the other tools of the Chest when a leave is approved and when
it no longer stands (**Proposal (studio)**: events between tools;
`chest.proposals.json` `"emits": ["leave.approved", "leave.cancelled"]`),
once an administrator linked them: **Rooms** then shows the person "Off"
those days and frees their desk; **People** shows "Away · back on …" on
their card. What is told: the person (their member id), the first and last
day and the halves — never the kind of leave nor the note (`src/lib/share.ts`).
Without events between tools, nothing changes here.

| | |
|---|---|
| `leave.approved` | `{member, from, to, fromHalf, toHalf, request}` — an approved **absence** that is not over. A kind that is not an absence (remote work, training: *not away* in Settings) is never told: neither Rooms nor People reads a kind, and Rooms would mark a remote worker "Off" and free their desk (people say *Remote* in Rooms themselves) |
| `leave.cancelled` | The same data, as it was told — the leave no longer stands: cancelled, refused after all, its approval taken back, cancelled by a last day (HR's, People's or the Chest's when someone leaves), or its kind now *not away* |
| A leave shortened | By a last day that cuts it: `leave.cancelled`, then `leave.approved` for the days that remain (same `request`). Rooms takes back all of a request's days on a cancellation and adds an approval's days; People keeps the latest word per request (by `occurredAt`) — so the pair shortens it for both within the contract they already read, without a new event type |
| When | After every change, after the Chest's and People's events, and each weekday morning: `shared_leave` holds what was told, and each run tells what differs, whichever way the leave changed |
| Reliable | Each event is written to an outbox (`leave_outbox`) in the same transaction as the record of what was told, then published oldest first; while the Chest cannot take them (not linked yet, its hourly quota), they wait and go at the next run. Key `leave:<request>:<approved\|cancelled>:<outbox id>:<member>` (whom it is about, so a restored backup's ids never name another person's word): the same event tried again is one event. Each carries the time of its change (`occurredAt`) while the Chest takes it (23 hours; older, the Chest's own time), and a shortened leave's approval is a millisecond after its cancellation, so receivers that keep the latest word order them as they happened. One waiting for days that are over is dropped |
| Erasure | What was told of the person and what waits is forgotten; the receivers forget them on their own `member.erased` |

**Leave → Booking (and Hiring): `leave.busy`** — so a host who is off is
not bookable, and an interviewer who is off is not offered to a
candidate. Booking and Hiring already tell each other their busy times
(`booking.busy`, `hiring.busy`); Leave speaks the same snapshot, version 1
(`src/lib/busy-snapshot.ts`, the same file as theirs; `src/lib/busy.ts`):

```json
{ "v": 1, "member": "mbr_…", "at": "2026-09-30T08:31:02.114Z",
  "from": "2026-09-30T00:00Z", "to": "2026-12-29T00:00Z",
  "spans": [["2026-10-11T22:00Z", "2026-10-16T22:00Z"], ["2026-11-03T11:00Z", "2026-11-03T23:00Z"]] }
```

| | |
|---|---|
| Who | Each member with approved leave in the window, and once more (empty `spans`) when the last of it goes — never again after that |
| When | After every change, after the Chest's and People's events, and each weekday morning (the window moves on); only when the member's times changed (`shared_busy` keeps each one's SHA-256 fingerprint) |
| Window | From the start of today (UTC) to 90 days later; at most 300 spans (past them, `to` stops where the first one left out starts: nothing unknown is claimed free) |
| Spans | Each **approved** leave's whole days in the zone the member works in (`members.lookup`; the Chest's for someone it no longer answers for; a morning ends at their noon, an afternoon starts at it), as UTC minutes, merged. A waiting request is not busy, nor a kind that is not an absence (remote work, training: *not away* in Settings). Days the person does not work inside a leave are busy too (they are off) |
| Never | The kind of leave, its note, who approved it — nor that it is leave: times only |
| Replaces | Everything the receiver holds **from Leave** for that member between `from` and `to`; `at` orders snapshots (keep one only if newer) |
| Key | `leave.busy:<member>:<ms>:<sha-256>` (whole; the SDK sends it as its digest): the same content told again the same day is one event; busy, free, busy again are three |
| Erasure | What Leave last told is forgotten here; the receiver forgets the member on its own `member.erased` |

**Booking and Hiring hear it** (`"receives": ["hiring.busy", "leave.busy"]` in
Booking, `["booking.busy", "leave.busy"]` in Hiring): a host who is off has
no slot those days, and the agenda shows them "Off"; an interviewer who is
off is not offered to a candidate.

**People → Leave** (**Proposal (studio)**: events between tools;
`chest.proposals.json` `"receives"`), once an admin linked them — HR
types a person's employee number, first day, last day and working week
once, in People's HR record:

- `people.record` `{member, employeeNumber, startDate, lastDay, workDays,
  weeklyHours}`: the number, first day and working week (ISO days → Leave's
  week) follow the record; what People does not say (null) stays as HR set
  it here; a number already someone else's here is left. Its `lastDay`
  sets the last day (and settles the leave after it, HR told in the bell);
  cleared in People, it goes — but never a last day HR typed here or the
  Chest's own when the person left. The person's page says "Kept up to date
  from their HR record in People". Weekly hours are not used (Leave counts
  days).
- `people.leaving` `{member, lastDay}` (a leaving checklist in People) sets
  the last day unless HR typed one here, the record gave one or the person
  already left the Chest; `people.leaving_cancelled` `{member}` takes back
  only the day it set. Leave cancelled by a last day stays cancelled when
  the day goes (HR records it again).
- Every event is checked field by field (another shape changes nothing);
  an event older than the last one applied changes nothing (events come
  at least once, not always in order).

## Needs from the SDK

Leave runs on SDK 0.4.1 + studio proposals (0.4.1-studio.6), in `vendor/`,
with a manifest of contract 0.4 (`"chest": "0.4"`; `chest check` says OK).
Official: `member(request)` with the member's `language` (the interface
and the bell in each member's language) and `timeZone`; `chest.today()`,
the company's day — the same as the database's `current_date`, since the
Chest makes its zone the TimeZone of the tool's database sessions;
`members.lookup` with each member's zone (the hours of their leave), and
`no_access` for someone still in the Chest who lost access to Leave
("Léa Dubois (no access)");
**schedules** (`chest.json`: `morning`, weekdays at 08:30 in the Chest's
zone, posted to `POST /chest-schedules`): the reminder of requests waiting
more than two days, every tile set right, the feeds and busy times kept in
line, deliveries older than 30 days forgotten. Without a run, requests
still reach approvers through the bell and the tile.

- `chest.theme()` — **Proposal (studio)**: the look the company chose
  (see "Looks"). Without it, Leave wears Seaside.
- **The Chest's groups** — **Proposal (studio)**, announced for 0.5
  (`chest.proposals.json` `"capabilities": ["members.groups"]`): *Who's
  away* filtered by any group of the Chest (`members.groups.all()`, who is
  in it with `members.list({ group })`). Without it, only the groups that
  give Leave (none when it is open to everyone). When the Chest does not
  say who is in a group, the page says "Could not read who is in Sales
  right now" and lists no one under that chip (never everyone). The
  official 0.4.1 parsers refuse a member in more than 16 groups (no
  identity: 401 "Sign in…"; `members.*` `Unavailable`), which this
  capability would hit; the vendored SDK 0.4.1-studio.7 lifts it — an
  assertion is bounded by size instead (16 KiB, about 300 groups), so a
  member in any number of groups uses Leave (0.5 announces no fixed cap).
- **Events between tools** — **Proposal (studio)**: `leave.approved` /
  `leave.cancelled` to Rooms and People (payload unchanged: member, from,
  to, halves, request — never the kind, the note or the family event;
  absences only, a cut told as cancelled then approved); `leave.busy` to
  Booking and Hiring (see "With the other tools").
- **Calendar** — **Proposal (studio)** (`chest.proposals.json` `"calendar":
  true`; `calendar.putMany` for a first sync, 100 events a call, answered
  per event: one the Chest refuses is never recorded as put and is tried
  again at the next run): approved leave in each person's feed (see "What
  it does"); a half day at the person's own hours, put again when their
  zone changes.
- **Notifications** (0.4.1) with `translations` (Proposal (studio),
  announced for 0.5): every item in English and French in one call; a key
  per request replaces or withdraws it. No `mail`: Leave mails no one
  (see "Mail to people outside the company").
- **Events from People** — **Proposal (studio)**: receives
  `people.record`, `people.leaving`, `people.leaving_cancelled`.
- Wished, not built: a **shared feed** of a team's absences ("Away", never
  the kind) for managers — the calendar proposal is personal feeds only; a
  member's **manager** known by the Chest (HR sets approvers here
  instead). The counting of days follows French rules whatever the
  Chest's zone.

## How it is made

The studio's starter stack: a **Hono** server that renders **React** pages
(`src/pages/`), with a few **islands** that also run in the browser
(`src/islands/`: the request form, the approval cards, the settings, the
people table and HR's forms), built by **Vite**; the machinery is the
vendored package `@argentic/chest-app` (routes, typed actions callable from
an island or a form, a refresh that keeps what is typed, the member's
words, the strict policy, logs). No inline script or style: the look is a
stylesheet Leave serves itself (`/chest/look.css`, cached by its hash), so
no `"csp"` permission is asked. Static files are under `/assets/`
(`build.static`). `AGENTS.md` maps the files.

Measured on 6 October 2026 with `lab/measure` (Node 24.21, production
build, 10 cold starts, 5 rests of 30 s after 10 pages; PSS of the process
tree), against the Next.js 16 version (`before-next16`):

| | Next.js 16 | Hono + React SSR + islands |
|---|--:|--:|
| Memory at rest (PSS) | 121.3 MiB | 68.2 MiB |
| First 200 after a cold start | 749 ms | 474 ms |
| Image (`node_modules` after prune + build) | 455 MiB | 27 MiB |
| Build in 512 MiB, 1 CPU | out of memory | fits (peak 263 MiB, 4.7 s) |

## Develop

```sh
npm ci
npm run dev       # rebuilds on every change, restarts the server
npm test          # tsc, the server built into dist/test, then node:test:
                  # TEST_DATABASE_URL (a PostgreSQL server) or PGlite
npm run build     # tsc, the browser's files, the server — as the Chest does
npm start         # the built server (PORT)
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/leave --prod --reset --port 4400`
(a seven-person company from `seed/sample.sql`, dates around today),
`node lab/chest-dev/flows/leave.mjs 4400` (the browser flows),
`node lab/chest-dev/screens.mjs tools/private/leave --port 4400`.

## What it does not do (yet)

- **No team calendar feed**: each person gets their own leave in their
  feed; a manager's "who is away" stays in *Who's away* (the Chest's
  feeds are personal for now). Calendar apps fetch a feed at their own
  pace (Google: hours), so an approval shows there later; Leave's pages
  are the truth.
- The automatic French computations listed under "Not done — HR adjusts by
  hand".
- No week view of *Who's away* (a month, and a list by week on a phone);
  the date fields do not show holidays or colleagues already away.
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
- A last day People takes back does not bring back the leave it cancelled
  (HR records it again; the bell said what was cancelled).
