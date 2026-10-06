# Hiring — publish your jobs, choose your candidates together

**Hiring** (French: *Recrutement*) replaces the applicant-tracking part of
Welcome to the Jungle, Teamtailor or Recruitee — and the spreadsheet beside
the "jobs@" inbox — for a company of 10 to 200 people. The company gets its own
careers page; candidates apply with a short form and their CV; the team
follows each candidate on one board per job, gives structured feedback, and
decides together.

## What it does

- **A careers page** (`/`): the company's name or logo, a few words about
  it *in each language* (the French page never shows the English words;
  **no words until the company writes them** — an empty page never speaks
  for it),
  up to three photos, its open jobs — an editorial table of contents — in
  the company's colour (six accents, each checked for contrast in light
  and dark; the company's brand from its Chest wins — see *Looks*), a link to its website. English/French switch, remembered in a
  cookie.
- **Reach, without calling anyone**: each open job's page carries
  `JobPosting` structured data (JSON-LD: a data block, no script runs; the
  policy stays `script-src 'self'`) that
  Google for Jobs reads — title, description, datePosted,
  hiringOrganization, jobLocation (street, postal code, country; a fully
  remote job says TELECOMMUTE and who may apply), validThrough (the job's
  last day), employmentType, baseSalary, identifier, directApply; the
  careers page and the jobs are indexable, the team's part never is
  (`robots.txt`, `X-Robots-Tag`). `/jobs.xml` is a feed in Indeed's XML
  format to give Indeed or an aggregator once, `/feed.xml` an RSS 2.0
  feed, `/sitemap.xml` the sitemap. *Share on LinkedIn / X / by email*
  links in the job's menu. Sources and dates: `src/lib/reach.ts`,
  `THIRD_PARTY.md`.
- **A page per job** (`/<job>`): what, where, how much (the salary range is
  shown by default — EU pay transparency), a description with headings,
  lists and bold, and one action: *Apply*. Recruiters write it in **a real
  editor** (*Heading*, *Bold*, *List*, Ctrl/⌘+B; what they see is what
  candidates read — nobody types a mark); it is stored as a few plain
  marks and rendered as React elements, never as HTML, and a paste brings
  its text only (`src/components/description-editor.tsx`, `src/shared/rich-text.ts`).
- **The application form** (`/<job>/apply`): name, email, phone and a
  LinkedIn or portfolio link (optional), **the CV** (PDF or Word, 10 MB at
  most) — **or a photo of it** (JPEG, PNG, HEIC: what a phone takes; shown
  on the candidate's page), a few words, **the job's screening questions** (0 to 5: a few
  words, yes/no, one choice; required or not), how long it is kept (a
  sentence, not a box to tick: applying rests on steps before a contract,
  not on consent), and an optional box *Keep me in mind for other jobs*
  (the talent pool).
  The CV goes from the browser to the Chest (Proposal *public uploads*); the
  tool checks its type, size and first bytes before keeping it. No captcha:
  a honeypot, a single-use token bound to the action, a proof of work the
  browser computes in a fraction of a second (the package's `bound.work`:
  sending an application needs JavaScript), and counters.
  A thank-you page; a confirmation email in the candidate's language
  (Proposal *mail*) — no candidate account: the email says the team will
  write.
- **A new company's first screen**: one button, *Write a job*, and three
  jobs to start from (*Office manager*, *Salesperson*, *Customer
  support*, in the recruiter's language: a draft to adapt).
- **Jobs** (`/chest`): open jobs with their pipeline at a glance and their
  new applications, drafts, closed jobs; what waits for *my* feedback
  first, *my next interviews*. Write a job (draft, with its
  address, working time, last day to apply and questions), publish,
  close, reopen — each with *Undo*; *Duplicate* a job into a new draft.
- **Search** (top bar): any candidate of the jobs one may see, by name,
  address, phone or a word of their letter or answers, accents aside.
- **A board per job**: its stages (New, Screening, Interview, Offer, Hired
  by default — kept as keys, each reader sees them in their own language
  until someone renames them; renamed, added, reordered, removed when
  empty). Candidate cards show the average rating, the days in the stage,
  "not opened". Drag with the mouse, a finger or the keyboard (space,
  arrows, space) — with *Undo*; each card's keyboard instructions are
  named with an id stable between the server and the browser. *Select* several to move or reject them
  together (one *Undo*). On a phone, stage tabs with their counts. The
  rejected are folded below.
- **A candidate's page**: contact, the CV shown inline (PDF) or downloaded,
  the cover letter, **structured feedback** (1–4, strengths, concerns,
  hire or not) that an interviewer sees from others only once they gave
  theirs, notes, the history, the answers to the job's questions.
  **Write** to them (templates in both languages — ask availability, news,
  offer, rejection — and the company's own, filled with their name, the
  job, the company, the sender), **with files** (an offer letter, a
  contract: up to five, 9 MB together; a company template may carry its
  own, the offer letter sent every time — each email sends its own copy,
  kept in the conversation and erased with the candidate): the email leaves
  from the company's address (the Chest's mail connector), and **their
  answer goes to the company's usual inbox** — the Chest receives no mail
  (owner's decision, 6 October 2026), so it never comes back into Hiring.
  Every email to a candidate ends with one line that says so ("To answer,
  reply to this email: it goes to Atelier Martin."), and the candidate's
  page says it where the team writes ("Candidates' replies go to
  jobs@atelier-martin.fr, your company's usual inbox — not to this
  page."). **The candidate chooses the
  interview time** (the default of *Interview*): who meets them, how long,
  between which days and hours; the candidate gets a link
  (`/interview/<secret>?lang=<their language>`, never indexed; one open
  link per candidate, a new one replaces it; the secret is stored only as
  its SHA-256; the page speaks the language they applied in, as their
  emails, unless they switch) and picks a time when **everyone chosen is
  free — by their interviews in Hiring and by what Booking says of them**
  (their bookings, blocked times and Google/Outlook/Apple calendars: README
  "With the other tools") — on weekdays, at least 12 hours ahead, **lunch
  (12:00–14:00) left out** unless the recruiter unticks it; on a phone,
  three days first, then *More days*. Nobody is ticked silently: the
  job's interviewers are ticked at first, the recruiter is not, and the
  button names who meets them ("Send the link (Hugo, Inès)"); the history
  keeps one line for it. The time chosen is checked again
  under a lock (two candidates on the last free hour: the second is told
  it was just taken and sees what is left), becomes an interview, the
  confirmation email with its `.ics` leaves, the interviewers' Chest
  calendars get it and they hear it in the bell. On a Chest without email
  the recruiter gets the link to send. Or **the recruiter chooses**:
  a day, a time in the Chest's zone, a length, who meets them (with the
  times they are already busy that day — an interview, Booking's
  "(Booking)", or "off all day" when Leave says they are off —, and a
  warning on a clash), a place or video link, a note; the candidate gets an email with
  an `.ics` (and a CANCEL one if called off), the interviewers get it in
  their Chest calendar feed, and a reminder on the morning of it: an item
  in the bell for each interview ("Interview at 08:00: Bastien Leroy",
  opening the candidate), in their language. The Chest mails it to them
  by their own choice; Hiring builds no reminder email.
  **Reject** with a reason (none chosen for you; "they withdrew" and "they
  stopped answering" close the application without a rejection email) and
  an email in their language that **leaves only once the Undo is over**
  (15 s): Undo stops it before anything left. *Bring back*, *Move to…*,
  *Ask for feedback*, *Propose for another job* (a new application with a
  copy of their CV), *Keep in / take out of the talent pool*, *Edit the
  details*, *Replace the CV*, *Download their data* (their right of
  access: a ZIP), *Erase this candidate*.
- **Talent pool** (`/chest/pool`): who agreed to be kept in mind, each
  once, searchable.
- **Reports** (`/chest/reports`): per job and overall — applications per
  month, where they come from, how far they get (per stage), why they
  stop, median days to hire. Counts only.
- **Import** (`/chest/jobs/<id>/import`): another tool's CSV export
  (Teamtailor, Welcome to the Jungle, Workable, a spreadsheet; `,` `;` or
  tab), columns guessed from English or French headers and corrected by
  the recruiter, their stages matched to the job's, the original
  application date kept (older than the retention: skipped), duplicates
  skipped, then their CVs (files or a ZIP, matched by the email address in
  each file name). *Undo*.
- **Export everything** (Settings): one ZIP with every job, candidate,
  note, feedback, email, interview and history line as CSV, and every
  CV — streamed, one CV in memory at a time.
- **Add a candidate by hand** (a referral, a CV received by email), with
  their CV and language.
- **Interviewers per job**: they see only the jobs they are on.
- **The bell and the tile**: recruiters hear of each new application (the
  tile counts those they have not opened); interviewers hear when asked
  for feedback; whoever asked hears when it is given.
- **GDPR / CNIL**: candidates are deleted with their CV and their emails'
  files 2 years (or 1 year, 6 months: *Settings*) after their last news
  (a message sent, a move, an interview), every night (Proposal *schedules*); CVs
  sent but never claimed go after a day; every bell item that named a
  deleted candidate is withdrawn (new, asked, bounced, feedback
  given, an interview today, chosen, given back or called off); a file
  the Chest could not delete then is kept in `files_gone` and deleted by
  the next night's cleanup — an erased CV never survives silently; a
  recruiter erases a candidate on request, or gives them their data (a ZIP: what they sent, what the
  team wrote, the emails (with those an earlier version received), and
  the files of those emails — the offer letter sent — under `emails/<email>/`, named
  in `data.json`); the form and each job page say it. Each job's
  candidates export as CSV; *Export everything* holds those files too,
  named in `emails.csv`.
- **Members are told in the bell, never by email** (owner's decision, 6
  October 2026): a new application and an email that did not arrive tell
  the recruiters (`notifications.broadcast` to the role, one call), asked
  feedback, feedback given, a time chosen or given back and the morning's
  interviews tell the people concerned (`notify`) — each one notice with
  its French words (`translations`), read in each member's language. How
  notifications reach a member by email (each one, once or twice a day,
  none; none from Hiring) is their choice in the Chest: Hiring keeps no
  email setting. Keys are whole (`message:<id>:<address>`; the SDK hashes
  a long one): one email per message and recipient, whatever the retries.
- **Bounces** are asked of the Chest: the `outbox` schedule asks
  `mail.status` about each email still on its way, less often as it ages
  (three days at most); one that bounced, was marked as spam or failed
  reads "Not delivered" in the conversation, and the recruiters hear of it.
- **No email promised that cannot leave** (SDK studio.16,
  `mail.available()`, `src/lib/mail-state.ts`): the reject form (one or
  several), *Write*, the interview invitation (a time or a link) and its
  cancellation ask the Chest first. Mail not connected or absent: no email
  is offered — each form says so in one line ("tell {name} yourself"; the
  link is given to send by hand; *Write* opens the recruiter's own mail
  app). Mail paused or the day's emails used: the email is kept and the
  form says it will leave as soon as the Chest sends again. A candidate
  who chose a time reads "We sent you the confirmation" only when the
  Chest sends. The toasts after each action still say what really
  happened.

## Looks

Hiring wears any look the company chooses in its Chest, with the same
features: its own identity (*Magazine*: cream paper, cobalt, tomato —
`src/theme.ts`), any theme of the store's catalogue (the other tools'
identities, *Chest*, *High contrast*), or the company's own brand (its
colours, fonts, corners and logo), for all its tools or for Hiring alone.
The look is resolved on the server from `chest.theme()` (SDK Proposal
*theme*) and served as a stylesheet of its own (`/chest/look.css` for the
team, `/look.css` for the public pages, versioned and cached; no inline
style); nothing runs in the browser for it. Every stylesheet names only the UI kit's contract
tokens, so every text stays readable (WCAG AA) in every look.

**The public pages (careers, a job, the form, a candidate's link) wear the
company's brand, or Hiring's own look — never a catalogue theme** chosen
for the team's tools (kit 0.2.3, `lookOf("public")` in `src/theme.ts`): a
company that likes *Confetti* for its team does not get a confetti
careers site. **One place for the careers brand**: when the company has a
brand in its Chest, the page takes its colours and its logo (with its
dark variant), and Settings hides Hiring's own *Colour* and *Logo* and
says where the brand comes from (the Chest). Without a brand, the colour
chosen in Settings (six accents, each a whole theme checked against the
contract) and the logo uploaded in Hiring dress the careers pages. The
photos are content: they show in every look. The arch of the identity is
decoration: it steps aside in a brand, the Chest's sheet and High
contrast (`--decor`).

## Roles

| Role | Can |
|---|---|
| `recruiter` (first: owner, admins, builders) | Everything: jobs, stages, interviewers, candidates, moves, rejections, emails and templates, interviews, notes, feedback, pool, import, reports, erasure, export, settings |
| `interviewer` | Only the jobs they are on: see candidates and CVs, read notes, give feedback, see the interviews they are on. Never the emails, no moves, no settings |

A member with no role sees why, not an error.

## First minute

- **What does a new recruiter see first?** An empty page that says *Post
  your first job*, one button, *Write a job*, and three jobs to start from.
- **What is the first thing they do?** Write the title, contract and
  description (a template in the placeholder), save the draft, press
  *Publish*: the job is on the careers page, its link one click away.
- **How many clicks for the main job?** Moving a candidate on: one drag, or
  one click on *Move to Interview* on their page. Writing to them: *Write*,
  a template, *Send* (three clicks). Inviting: *Interview*, *Send the link* (two
  clicks; the candidate picks the time), or *I choose the time*, a day, a
  time, *Send the invitation*. Giving feedback: one rating, one recommendation,
  *Send* (three clicks). Applying: fill the form, one file, one click.
- **What happens on a mistake?** A move, a rejection (its email waits for
  the Undo), publishing or closing a job, an import: a toast with *Undo*. A candidate who typed something wrong keeps
  everything they typed; a recruiter corrects their details. Erasing is
  the only thing that asks first (it cannot be undone).

## Routes

Every route is in `src/app.tsx`; every action in `src/actions.ts`, posted
by the pages' islands (or a plain form without JavaScript) to
`/chest/actions/<name>` (members) or `/actions/<name>` (visitors:
`publicCvUpload`, `apply`, `chooseTime`, `releaseTime`, each bounded per
visitor, per job or link and per day, a form older than 3 s, a honeypot,
a token bound to its action, and for `apply` a proof of work:
"Visitors" below).

| Route | Who | What |
|---|---|---|
| `/`, `/<job>`, `/<job>/apply`, `/<job>/thanks` | anyone | The careers page |
| `POST /actions/publicCvUpload` | anyone (bounded) | Ask for one CV upload: the Chest's upload address; the file is claimed when the application is sent |
| `POST /actions/releaseTime` | the candidate who got the link (bounded) | Give back a booked time: choose another, or call the interview off |
| `/lang/<code>` | anyone | The language switch |
| `/interview/<secret>` | the candidate who got the link | Choose an interview time (never indexed, `no-store`, no referrer) |
| `/jobs.xml`, `/feed.xml`, `/sitemap.xml`, `/robots.txt` | anyone | Indeed's feed, RSS, sitemap, robots |
| `/look.css`, `/chest/look.css`, `/assets/…` | anyone; members | The look (public, team); fonts, icon, scripts and styles |
| `/chest` | members | Jobs, what waits for me, my next interviews |
| `/chest/search?q=` | members | Search candidates |
| `/chest/pool`, `/chest/reports` | recruiter | Talent pool, reports |
| `/chest/jobs/<id>/import` | recruiter | Import candidates |
| `/chest/export` | recruiter | Everything, as a ZIP |
| `/chest/candidates/<id>/data` | recruiter | A candidate's own data (ZIP) |
| `/chest/messages/<id>/files/<n\|original>` | recruiter | A file an email brought (always downloaded) |
| `/chest/interviews/<id>/ics` | who sees the candidate | An interview's `.ics` (a Chest without calendars) |
| `/chest/settings/images/<name>` | recruiter | The careers page's logo and photos, for Settings' preview (they are public files: the Chest serves them on the public host only) |
| `/chest/jobs/new`, `/chest/jobs/<id>/edit` | recruiter | Write a job |
| `/chest/jobs/<id>` | recruiter, its interviewers | The board (`?more=<stage>`: all of a stage; `?rejected=1`: the rejected) |
| `/chest/jobs/<id>/settings` | recruiter | Stages, interviewers, delete an unused job |
| `/chest/jobs/<id>/add` | recruiter | Add a candidate |
| `/chest/jobs/<id>/export` | recruiter | CSV |
| `/chest/candidates/<id>`, `…/cv` | recruiter, the job's interviewers | A candidate, their CV (served by the tool, two at a time per server, named after its file, framed only by the tool's pages, in a sandbox) |
| `/chest/settings` | recruiter | Careers page settings, retention |
| `POST /chest-events` | the Chest | Members' lifecycle; `booking.busy`, `leave.busy` |
| `POST /chest-schedules` | the Chest | `cleanup` (nightly retention), `outbox` (due emails, their bounces asked, calendars, every 15 min), `morning` (the interviewers' bell items of the day) |

## On a Chest

Contract 0.4 (`chest.json`): capabilities `database`, `files`,
`members`, `notifications`; receives `member.*`; schedules `cleanup`
(03:25), `outbox` (every 15 minutes) and `morning` (07:40 on weekdays), in
the Chest's zone. Proposals (in `chest.proposals.json` until a Chest
accepts them): `mail.send` (to candidates only), `calendar`,
`files.publicUploads` and `files.publicFiles` (visitors' CVs, logo,
photos), `emits` (`hiring.hired`, `hiring.hire_cancelled`, `hiring.busy`),
`receives` (`booking.busy`, `leave.busy`) and the tile's French words. When a member loses access or leaves, they are
taken off their jobs and no longer asked for feedback; what they wrote stays
under "(former member)". On erasure, their id goes from notes, feedback,
history (including "asked X for feedback" and interviews' people), jobs,
candidates, emails, templates and interviews they wrote, they leave the
interviews (whose calendar events are written again), then the erasure is
acknowledged.

## With the other tools

Through the *events between tools* proposal (`chest.proposals.json`
`"emits"`), once an admin of the Chest linked Hiring to People — the Chest's
decision, never the tool's:

| Event | When | Data |
|---|---|---|
| `hiring.hired` | A candidate is moved into the job's *Hired* stage (the recruiter may give their first day in a small dialog); or a rejected candidate sitting in *Hired* is brought back | `{ candidate, name, email, job, team, place, startDate, hiredBy }` — key `hiring:<candidate>:hired:<time of the move>` |
| `hiring.hire_cancelled` | Moved out of *Hired* (*Undo* included), rejected from it, or erased | `{ candidate }` — key `hiring:<candidate>:cancelled:<time>` |
| `hiring.busy` | A member's interviews changed (planned, chosen by a candidate, called off; the `outbox` schedule catches the rest and moves the window each day) — for Booking | A snapshot of times only: `{ v: 1, member, at, from, to, spans: [[start, end], …] }` (UTC minutes, 90 days from today, 300 spans at most) — key `busy:<member>:<ms>:<hash>` |

**What Hiring hears** (`"receives": ["booking.busy", "leave.busy"]`):
Booking's snapshot of a host's busy times, and Leave's of the days a
member is off (approved leave, whole days or halves in the Chest's time
zone — never the kind of leave, which Leave never sends), in the same
shape (`src/lib/busy-snapshot.ts`, the same file in each tool). Both go to
one handler (`takeBusy`), kept per tool and member, the latest by `at`
only (`told_busy`, `told_spans`); a candidate choosing their time is never
offered those times, and in *I choose the time* the recruiter sees them
marked "(Booking)" or "off" ("off all day" for a whole day); a later
snapshot ("now free") gives them back; forgotten when the member leaves
or is erased. Hiring never tells again what another tool told it, and
never says who a candidate is, which job, or where. The owner approves
"Is told by Booking when a member is busy (times only)" and "Is told by
Leave when a member is off".

Only who is joining, for which job, where and when: never the CV, the cover
letter, notes, feedback or ratings. Publishing is a courtesy: when the Chest
cannot take it (not linked, not granted), the move stands and nothing is
said.

**No consent is asked to apply.** Handling an application rests on steps
taken at the candidate's request before a contract (GDPR art. 6(1)(b)),
not on consent, which must be free and cannot be a condition of applying;
the form says what is kept and for how long. The only box is optional:
*Keep me in mind for other jobs* (the talent pool). The name and address
go to People only once the person is hired, inside the same company, for
their employment (the work contract). Telling People is the company's
internal onboarding, which the Chest's link between the two tools makes
explicit to its admin.

## Mail to people outside the company

Hiring emails candidates only — people outside the company — and never a
member (members are told in the Chest's bell, above). Sent through the
Chest's mail connector (studio proposal, not built yet): `mail.send`, from
the company's address, in the candidate's language, each ending with
"To answer, reply to this email: it goes to {company}." Nothing comes back
into Hiring.

| Recipient | Purpose | When | Content | Attachments | Reply-To |
|---|---|---|---|---|---|
| A candidate who applied on the careers page | Confirm the application arrived | Right after the form (the thank-you page says whether it left) | The job, the company, "we read every one and will write to you", the careers page's link | None | The company's reply address (the connector's default) |
| A candidate | A recruiter's message (ask availability, news, an offer — from a template or not) | When the recruiter presses *Send* | The recruiter's words; from "Camille — Atelier Martin" | The files the recruiter added or the template carries (an offer letter, a contract: 5 at most, 9 MB together; the Chest reads the tool's stored files) | The company's reply address |
| A candidate | The link to choose their interview time | When a recruiter sends it | Who they meet, between which days, how long, the link `/interview/<secret>?lang=…` | None | The company's reply address |
| A candidate | An interview's time (chosen by them or by the recruiter) | When it is set | Day, time and zone, place or video link, the note | `invitation.ics` (`text/calendar; method=PUBLISH`, the same UID for every version) | The company's reply address |
| A candidate | An interview called off | When the recruiter cancels it | Day and time called off, "we will write again soon" | `cancelled.ics` (`method=CANCEL`) | The company's reply address |
| A candidate | The rejection | 15 s after the recruiter rejects (after the Undo); never for "they withdrew" or "they stopped answering" | The rejection text in their language (from the company's template or the built-in one) | None | The company's reply address |

When the Chest cannot send (no mail, the company's mail not connected):
no form promises an email, *Write* opens the recruiter's own mail app,
the link to choose a time is given to send by hand, and the conversation
says "Not sent". Paused or the day's quota used: the email waits in the
outbox and leaves when the Chest sends again; the forms say so.

**What changed on 6 October 2026** (the owner's mail decisions): no `jobs`
address that receives email, no answers by email filed on a candidate's
page, no *Emails to file* (`/chest/mail`), no inbound mail route; the interviewers' morning email
is gone (the bell item stays, mailed by the Chest by each member's
choice); bounces are asked of the Chest (`mail.status`); member notices
carry their French words. What an earlier version kept of received
emails stays in the database, unread (`migrations/0008_mail_checks.sql`
says why), so that version keeps working after a rollback; it is erased
with its candidate and given to them in their data.

## Needs from the SDK

The tool is built on SDK 0.4.1 + studio proposals (0.4.1-studio.6). The
needs below are proposals of the studio's working copy; the tool calls
them as if shipped and keeps working without them:

- **Public uploads and public files** (`files.publicUploadUrl`,
  `files.claim`, `files.publicPath`): a visitor's CV goes straight to the
  Chest, which answers the browser with a claim; the application claims it
  (type, size and first bytes checked before it is kept), and an unclaimed
  upload is dropped by the Chest after a day. Without public uploads the
  form asks for a link to the CV instead; without public files the careers
  page shows the company's name, no logo or photos.
- **Mail to people outside** (`mail.send`, `mail.available`,
  `mail.status`; see "Mail to people outside the company"): without it,
  a written email is kept as "not sent" and the recruiter's own mail app
  opens with it (the history says it was written there); the thank-you
  page says the team will write; interview invitations are saved without
  email. **Obstacle**: `mail.send` throws the same `Unavailable` when the
  Chest did not answer and when the owner has not connected the company's
  mail; Hiring asks `mail.available()` again to tell them apart (else an
  email would read "Leaving soon" for weeks). A distinct error
  (`NotConnected`) would spare that question.
- **Notifications**: a notice's `translations` and `broadcast` —
  proposals announced for 0.5. Without broadcast, the tool lists its
  recruiters (`members.list` by role) and notifies them.
- **Calendar** (`calendar.put/remove`, `calendar.ics`): without it, each
  interview offers "Add to my calendar" (an `.ics` with the same UID).
- **Schedules** (`cleanup`, `outbox`, `morning`): without them the
  retention does not run by itself, a rejection email leaves at the next
  page a recruiter opens after its Undo, bounces are not learnt, and
  there is no morning reminder.
- **Visitors**: a contract-0.4 Chest names no visitor. The public
  actions are bounded by the package's `bound` in the tool's own table
  (`chest_bounds`), a day in the Chest's zone (`publicBounds` in
  `src/actions.ts`), with a form at least 3 s old and a honeypot; never a
  call to the Chest per public request (the mail state and the look are
  kept a minute).

  | | Per browser (cookie) | Per job or link | Everyone |
  |---|--:|--:|--:|
  | Applications | 20 | 60 per job | 600 |
  | CVs sent | 20 | 120 per job | 1,500 |
  | Choosing an interview time | 30 | 10 per link | 500 |
  | Giving a time back | 10 | 4 per link | 200 |
  | A link secret that names nothing | 30 | — | 1,000 |

  **What this does not stop, said plainly:** a robot that throws its
  cookie away can send 60 junk applications a day to one job; that job's
  form then says "This job has received all the applications it can take
  today. Try again tomorrow, or contact the company: <website>" (the
  website from Settings, when there is one) until midnight, and every
  other job stays open. Flooding ten jobs reaches everyone's total and
  closes the careers page's forms for the day. Each junk application is a
  card, a bell item and a confirmation email (greeted "Hello," when the
  name holds a link or an address). A guessed interview link spends a
  budget of its own and is never a refusal: it never closes a real link.
  Naming visitors by their address (the studio's proposal
  `Chest-Visitor-Address`) would make all of this per person.
- **Events between tools** (`events.publish`, `receives`): without them,
  People is not told of hires, Booking does not see interviews, and free
  times come from Hiring's interviews only (no Booking, no days off).
- **Chest settings** (`chest.tool.publicUrl`, `chest.tool.teamUrl`;
  official since 0.3.0: `chest.organization.name`, `chest.timeZone`, `chest.language`):
  the company name by default, the careers page's address, the zone of
  interview times and of the day (the database's `current_date` is the
  Chest's too), the language the intro of before was written in.

Still missing (see the SDK report): an iTIP invitation (`METHOD:REQUEST`
with ORGANIZER and ATTENDEE, so Gmail shows Yes/No buttons) in
`calendar.ics`; a read-only free/busy of the interviewers' own
calendars; an outbound-network grant for paid multiposting.

## Develop

The stack is the studio's starter: Hono, React rendered on the server, a
few islands in the browser (the board, the forms), built by Vite; the
machinery (pages, actions, islands, refresh, looks, bounds, tests) is the
package `@argentic/chest-app`, vendored in `vendor/` with the SDK and the
UI kit. No Next.js.

```sh
npm ci
npm test                                   # PGlite; TEST_DATABASE_URL=… for PostgreSQL
npm run build                              # dist/server/main.js, dist/client/
npm run dev                                # rebuilds and restarts on change
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 5300   # from the studio: harness with seed data
node ../../../lab/chest-dev/flows/hiring.mjs 5300                  # the browser flow
```

`seed/sample.sql` fills Atelier Martin's careers page: three open jobs (one
written in French, one with screening questions), a closed one, fifteen
candidates with feedback, notes, emails, three interviews (one at 09:00
this morning, Paris time, whenever it is loaded: the morning reminder
always has a day to tell), a template and history. `test/fixtures/` holds a Teamtailor-style and a
French CSV export for the importer. Sample CVs cannot be seeded (files are the Chest's): the flows
upload one.

## What it does not do yet

- **No paid multiposting**: WTTJ's, Indeed's sponsored or LinkedIn's paid
  audience is not replaced. Google for Jobs reads the pages, Indeed and
  aggregators read `/jobs.xml` once given it; nothing is pushed (no
  outbound network). Whether Google indexes a given careers page, and
  whether a real Chest's public host adds its own `X-Robots-Tag`, was not
  verified (no crawler reaches the studio).
- **Free times** come from Hiring's interviews, what Booking tells
  (its bookings and the Google/Outlook/Apple calendars a host connected
  there) and the days off Leave tells (approved leave only: a request
  still waiting is not a day off). An interviewer who is not a Booking host, or has not connected
  a calendar there, is known by Hiring's interviews only; Booking's own
  reading lags up to about 15 minutes. Lunch is fixed at 12:00–14:00 (not
  per company yet). A candidate who booked can give the time back on
  their link — to choose another while the link's days last, or to call
  the interview off — until it starts (the people who meet them and who
  sent the link are told in their bell); after the link's last day they
  answer the email instead. The recruiter cannot
  offer hand-picked times. The `.ics` is a PUBLISH file ("add to my
  calendar", same UID for every version), not an iTIP invitation with
  Accept/Decline buttons.
- **The board on a phone** shows one stage at a time (tabs); moving a
  card is done from the candidate's page there (no drag across hidden
  stages).
- **A big board is paged**: 40 cards per stage, *Show N more* opens up to
  400 more of one stage, and the rejected show the latest 100; search
  finds the rest. The counts are always whole.
- **CVs are served two at a time** by each server (a third waits a few
  seconds and is asked again), so a slow download never holds the tool.
- **Templates are plain text** (their files aside); no e-signature of
  the offer letter. On a Chest without email, the recruiter's own mail
  app opens with the text: the files are kept on the page, to attach
  there by hand.
- A HEIC photo of a CV is kept and downloaded; browsers other than Safari
  cannot show it on the page.
- **Candidates' answers by email** reach the company's usual inbox, not
  Hiring (the Chest receives no mail): applications by email, "emails to
  file" and answers threaded onto a candidate's page are gone. A recruiter
  who wants an answer on the page adds it as a note.
- **No hiring requests to approve**, no scorecards per stage, no
  reporting beyond counts (no cost per hire, no diversity data).
- **Imports**: the Teamtailor, WTTJ and Workable column sets were not read
  first-hand (their help centres describe exports whose columns the
  exporter chooses); the importer guesses and the recruiter corrects.
  Notes, feedback and emails of the old tool are not imported.
- The consent sentence changed on legal reasoning (GDPR art. 6(1)(b),
  CNIL's recruitment guidance as secondary sources); **a lawyer should
  confirm it** for each company.
- On a Chest without schedules, the retention does not run by itself;
  recruiters still erase by hand.
