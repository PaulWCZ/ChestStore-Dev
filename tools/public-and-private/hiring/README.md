# Hiring — publish your jobs, choose your candidates together

**Hiring** (French: *Recrutement*) replaces the applicant-tracking part of
Welcome to the Jungle, Teamtailor or Recruitee — and the "jobs@" mailbox plus
a spreadsheet — for a company of 10 to 200 people. The company gets its own
careers page; candidates apply with a short form and their CV; the team
follows each candidate on one board per job, gives structured feedback, and
decides together.

## What it does

- **A careers page** (`/`): the company's name or logo, a few words about
  it *in each language* (the French page never shows the English words),
  up to three photos, its open jobs — an editorial table of contents — in
  the company's colour (six accents, each checked for contrast in light
  and dark), a link to its website. English/French switch, remembered in a
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
  lists and bold (marks anyone can type, rendered as text, never HTML), and
  one action: *Apply*.
- **The application form** (`/<job>/apply`): name, email, phone and a
  LinkedIn or portfolio link (optional), **the CV** (PDF or Word, 10 MB at
  most), a few words, **the job's screening questions** (0 to 5: a few
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
  job, the company, the sender): the email leaves from the `jobs` mailbox
  with the candidate's own thread address as Reply-To, so **their answer
  lands back in their conversation** (the thread, else In-Reply-To /
  References, else their address when the sender's domain is verified;
  anything else waits in *Emails to file*). **Invite to an interview**:
  a day, a time in the Chest's zone, a length, who meets them (with the
  times they are already in an interview that day, and a warning on a
  clash), a place or video link, a note; the candidate gets an email with
  an `.ics` (and a CANCEL one if called off), the interviewers get it in
  their Chest calendar feed, and a reminder on the morning of it.
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
  on request, or gives them their data; the form and each job page say
  it. Each job's candidates export as CSV.

## Roles

| Role | Can |
|---|---|
| `recruiter` (first: owner, admins, builders) | Everything: jobs, stages, interviewers, candidates, moves, rejections, emails and templates, interviews, notes, feedback, pool, import, reports, erasure, export, settings |
| `interviewer` | Only the jobs they are on: see candidates and CVs, read notes, give feedback, see the interviews they are on. Never the emails, no moves, no settings |

A member with no role sees why, not an error.

## First minute

- **What does a new recruiter see first?** An empty page that says *Post
  your first job* and one button, *Write a job*.
- **What is the first thing they do?** Write the title, contract and
  description (a template in the placeholder), save the draft, press
  *Publish*: the job is on the careers page, its link one click away.
- **How many clicks for the main job?** Moving a candidate on: one drag, or
  one click on *Move to Interview* on their page. Writing to them: *Write*,
  a template, *Send* (three clicks). Inviting: *Interview*, a day, a time,
  *Send the invitation*. Giving feedback: one rating, one recommendation,
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
- **Events between tools** (`events.publish`): without them, People is not told of hires.
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
- **Interview times are not self-scheduled** by the candidate (no booking
  link) and busy times come from Hiring's own interviews only, not from
  the interviewers' agendas. The `.ics` is a PUBLISH file ("add to my
  calendar"), not an iTIP invitation with Accept/Decline buttons.
- **Templates are plain text**; no attachments when writing (an offer
  letter is pasted or sent from one's mailbox).
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
