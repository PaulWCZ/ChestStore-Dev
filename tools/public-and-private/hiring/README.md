# Hiring — publish your jobs, choose your candidates together

**Hiring** (French: *Recrutement*) replaces the applicant-tracking part of
Welcome to the Jungle, Teamtailor or Recruitee — and the "jobs@" mailbox plus
a spreadsheet — for a company of 10 to 200 people. The company gets its own
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
  `JobPosting` structured data (JSON-LD, with the page's CSP nonce) that
  Google for Jobs reads — title, description, datePosted,
  hiringOrganization, jobLocation (street, postal code, country; a fully
  remote job says TELECOMMUTE and who may apply), validThrough (the job's
  last day), employmentType, baseSalary, identifier, directApply; the
  careers page and the jobs are indexable, the team's part never is
  (`robots.txt`, `X-Robots-Tag`). `/jobs.xml` is a feed in Indeed's XML
  format to give Indeed or an aggregator once, `/feed.xml` an RSS 2.0
  feed, `/sitemap.xml` the sitemap. *Share on LinkedIn / X / by email*
  links in the job's menu. Sources and dates: `lib/reach.ts`,
  `THIRD_PARTY.md`.
- **A page per job** (`/<job>`): what, where, how much (the salary range is
  shown by default — EU pay transparency), a description with headings,
  lists and bold, and one action: *Apply*. Recruiters write it in **a real
  editor** (*Heading*, *Bold*, *List*, Ctrl/⌘+B; what they see is what
  candidates read — nobody types a mark); it is stored as a few plain
  marks and rendered as React elements, never as HTML, and a paste brings
  its text only (`components/description-editor.tsx`, `lib/rich-text.ts`).
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
  a honeypot, a signed "shown at" time and counters (Proposal *visitors*).
  A thank-you page; a confirmation email in the candidate's language
  (Proposal *mail*) — no candidate account: the email says the team will
  write.
- **A new company's first screen**: one button, *Write a job*, and three
  jobs to start from (*Office manager*, *Salesperson*, *Customer
  support*, in the recruiter's language: a draft to adapt).
- **Jobs** (`/chest`): open jobs with their pipeline at a glance and their
  new applications, drafts, closed jobs; what waits for *my* feedback
  first, *my next interviews*, emails to file. Write a job (draft, with its
  address, working time, last day to apply and questions), publish,
  close, reopen — each with *Undo*; *Duplicate* a job into a new draft.
- **Search** (top bar): any candidate of the jobs one may see, by name,
  address, phone or a word of their letter or answers, accents aside.
- **A board per job**: its stages (New, Screening, Interview, Offer, Hired
  by default — kept as keys, each reader sees them in their own language
  until someone renames them; renamed, added, reordered, removed when
  empty). Candidate cards show the average rating, the days in the stage,
  "not opened". Drag with the mouse, a finger or the keyboard (space,
  arrows, space) — with *Undo*. *Select* several to move or reject them
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
  kept in the conversation and erased with the candidate): the email leaves from the `jobs` mailbox
  with the candidate's own thread address as Reply-To, so **their answer
  lands back in their conversation** (the thread, else In-Reply-To /
  References, else their address when the sender's domain is verified;
  anything else waits in *Emails to file*). **The candidate chooses the
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
  times they are already busy that day — an interview, or Booking's
  "(Booking)" —, and a warning on a clash), a place or video link, a note; the candidate gets an email with
  an `.ics` (and a CANCEL one if called off), the interviewers get it in
  their Chest calendar feed, and a reminder on the morning of it: an item
  in the bell and one email with the whole day ("08:00 — Bastien Leroy,
  Sales", with each candidate's link), in their language.
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
  (an answer by email is news), every night (Proposal *schedules*); CVs
  sent but never claimed go after a day; a recruiter erases a candidate
  on request, or gives them their data (a ZIP: what they sent, what the
  team wrote, the emails, and the files of those emails both ways — the
  offer letter sent, what they attached — under `emails/<email>/`, named
  in `data.json`); the form and each job page say it. Each job's
  candidates export as CSV; *Export everything* holds those files too,
  named in `emails.csv`.
- **Email and people's choices** (SDK studio.15): each member chooses
  once in their Chest how tools may email them (all, one a day, none);
  the Chest applies it, so Hiring keeps no email switch. **Every email to
  a candidate is transactional** — the confirmation of their application,
  an interview's time, its cancellation, the link to choose a time, a
  recruiter's message, the answer: each answers their own application.
  A candidate is usually an outside address, which no preference
  touches, so the flag changes nothing for them; it matters when an
  employee applies to an internal job with their work address and chose
  "none" — without it, their interview's confirmation would be held back.
  The **interviewers' morning email** is a reminder, not transactional:
  "none" gets the bell item only, "one a day" finds it in the Chest's
  daily email. Keys are whole (`message:<id>:<address>`,
  `morning:<day>:<member>`; the SDK hashes a long one): one email per
  message and recipient, one morning email per person and day, whatever
  the retries.

## Looks

Hiring wears any look the company chooses in its Chest, with the same
features: its own identity (*Magazine*: cream paper, cobalt, tomato —
`lib/theme.ts`), any theme of the store's catalogue (the other tools'
identities, *Chest*, *High contrast*), or the company's own brand (its
colours, fonts, corners and logo), for all its tools or for Hiring alone.
The look is resolved on the server from `chest.theme()` (SDK Proposal
*theme*) and written as one `<style>` with the page's nonce; nothing runs in
the browser for it. Every stylesheet names only the UI kit's contract
tokens, so every text stays readable (WCAG AA) in every look.

**The public pages (careers, a job, the form, a candidate's link) wear the
company's brand, or Hiring's own look — never a catalogue theme** chosen
for the team's tools (kit 0.2.3, `lookOf("public")` in `lib/theme.ts`): a
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

| Route | Who | What |
|---|---|---|
| `/`, `/<job>`, `/<job>/apply`, `/<job>/thanks` | anyone | The careers page |
| `POST /api/cv` | anyone (form token, counters) | Authorise one CV upload (public) |
| `/lang/<code>` | anyone | The language switch |
| `/interview/<secret>` | the candidate who got the link | Choose an interview time (never indexed, `no-store`) |
| `/jobs.xml`, `/feed.xml`, `/sitemap.xml`, `/robots.txt` | anyone | Indeed's feed, RSS, sitemap, robots |
| `/chest` | members | Jobs, what waits for me, my next interviews |
| `/chest/search?q=` | members | Search candidates |
| `/chest/pool`, `/chest/reports`, `/chest/mail` | recruiter | Talent pool, reports, emails to file |
| `/chest/jobs/<id>/import` | recruiter | Import candidates |
| `/chest/export` | recruiter | Everything, as a ZIP |
| `/chest/candidates/<id>/data` | recruiter | A candidate's own data (ZIP) |
| `/chest/messages/<id>/files/<n\|original>` | recruiter | A file an email brought (always downloaded) |
| `/chest/interviews/<id>/ics` | who sees the candidate | An interview's `.ics` (a Chest without calendars) |
| `POST /chest/api/image` | recruiter | Authorise a logo or photo upload |
| `/chest/jobs/new`, `/chest/jobs/<id>/edit` | recruiter | Write a job |
| `/chest/jobs/<id>` | recruiter, its interviewers | The board |
| `/chest/jobs/<id>/settings` | recruiter | Stages, interviewers, delete an unused job |
| `/chest/jobs/<id>/add` | recruiter | Add a candidate |
| `/chest/jobs/<id>/export` | recruiter | CSV |
| `/chest/candidates/<id>`, `…/cv` | recruiter, the job's interviewers | A candidate, their CV (served by the tool, named after its file, framed only by the tool's pages) |
| `POST /chest/api/cv` | recruiter | Authorise one CV upload (team) |
| `/chest/settings` | recruiter | Careers page settings, retention |
| `POST /chest-events` | the Chest | Members' lifecycle |
| `POST /chest-jobs/cleanup`, `…/outbox`, `…/morning` | the Chest | Nightly retention; due emails and calendars every 15 min; the interviewers' morning reminder (Proposal) |
| `POST /chest-mail` | the Chest | Emails to the jobs mailbox, bounces (Proposal) |

## On a Chest

Capabilities: `database`, `files`, `members`, `notifications`; receives
`member.*`. Proposals (in `chest.proposals.json` until a Chest accepts
them): `mail.send` and the `jobs` mailbox (receiving), `calendar`,
`files.publicUploads` and `files.publicFiles` (logo, photos),
`schedules` (`cleanup` 03:25, `outbox` every 15 minutes, `morning` 07:40
on weekdays), `emits` (`hiring.hired`, `hiring.hire_cancelled`) and the
tile's French words. When a member loses access or leaves, they are
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

**What Hiring hears** (`"receives": ["booking.busy"]`): Booking's snapshot
of a host's busy times, in the same shape (`lib/busy-snapshot.ts`, the
same file in both tools). Kept per tool and member, the latest by `at`
only (`told_busy`, `told_spans`); a candidate is never offered those
times, the recruiter sees them marked "(Booking)"; forgotten when the
member leaves or is erased. Hiring never tells again what Booking told it,
and never says who a candidate is, which job, or where.

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

## Needs from the SDK

All exist as proposals in the studio's working copy (0.3.0-studio.12); the
tool calls them as if shipped and keeps working without them:

- **Public uploads and public files** (`files.uploadUrl(name, { public: true })`,
  `files.publicUrl`): without public uploads the form asks for a link to
  the CV instead; without public files the careers page shows the
  company's name, no logo or photos.
- **Mail, sending and receiving** (`mail.send` with `{mailbox: "jobs",
  thread}`, `mail.handle`): without it, a written email is kept as "not
  sent" and the recruiter's own mail app opens with it (the history says
  it was written there); the thank-you page says the team will write;
  interview invitations are saved without email. Without a `jobs`
  mailbox address, emails leave from the Chest's no-reply address and
  answers cannot come back.
- **Calendar** (`calendar.put/remove`, `calendar.ics`): without it, each
  interview offers "Add to my calendar" (an `.ics` with the same UID).
- **Schedules** (`cleanup`, `outbox`, `morning`): without them the
  retention does not run by itself, a rejection email leaves at the next
  page a recruiter opens after its Undo, and there is no morning reminder.
- **Visitors** (`visitors.formToken/checkForm/count/language`): without the
  Chest's counting, the tool counts in its own table.
- **Events between tools** (`events.publish`, `receives`): without them,
  People is not told of hires, Booking does not see interviews, and free
  times come from Hiring's interviews only.
- **Chest settings** (`chest.company()`, `chest.publicUrl()`,
  `chest.timeZone()`, `chest.locale()`): the company name by default, the
  careers page's address, the zone of interview times, the language the
  intro of before was written in.

Still missing (see the SDK report): an iTIP invitation (`METHOD:REQUEST`
with ORGANIZER and ATTENDEE, so Gmail shows Yes/No buttons) in
`calendar.ics`; a read-only free/busy of the interviewers' own
calendars; an outbound-network grant for paid multiposting.

## Develop

```sh
npm ci
npm test                                   # PGlite; TEST_DATABASE_URL=… for PostgreSQL
npm run build
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 5300   # from the studio: harness with seed data
```

`seed/sample.sql` fills Atelier Martin's careers page: three open jobs (one
written in French, one with screening questions), a closed one, fifteen
candidates with feedback, notes, emails, two interviews, a template, an
email to file and history. `test/fixtures/` holds a Teamtailor-style and a
French CSV export for the importer. Sample CVs cannot be seeded (files are the Chest's): the flows
upload one.

## What it does not do yet

- **No paid multiposting**: WTTJ's, Indeed's sponsored or LinkedIn's paid
  audience is not replaced. Google for Jobs reads the pages, Indeed and
  aggregators read `/jobs.xml` once given it; nothing is pushed (no
  outbound network). Whether Google indexes a given careers page, and
  whether a real Chest's public host adds its own `X-Robots-Tag`, was not
  verified (no crawler reaches the studio).
- **Free times** come from Hiring's interviews and what Booking tells
  (its bookings and the Google/Outlook/Apple calendars a host connected
  there). An interviewer who is not a Booking host, or has not connected
  a calendar there, is known by Hiring's interviews only; Booking's own
  reading lags up to about 15 minutes. Lunch is fixed at 12:00–14:00 (not
  per company yet). The candidate cannot move a time they chose (they
  answer the email; the recruiter moves it), and the recruiter cannot
  offer hand-picked times. The `.ics` is a PUBLISH file ("add to my
  calendar", same UID for every version), not an iTIP invitation with
  Accept/Decline buttons.
- **The board on a phone** shows one stage at a time (tabs); moving a
  card is done from the candidate's page there (no drag across hidden
  stages).
- **Templates are plain text** (their files aside); no e-signature of
  the offer letter. On a Chest without email, the recruiter's own mail
  app opens with the text: the files are kept on the page, to attach
  there by hand.
- A HEIC photo of a CV is kept and downloaded; browsers other than Safari
  cannot show it on the page.
- **Emails to file** are filed one by one; an attachment a candidate sends
  is downloaded, never shown inside the tool.
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
