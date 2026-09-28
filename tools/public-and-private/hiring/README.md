# Hiring — publish your jobs, choose your candidates together

**Hiring** (French: *Recrutement*) replaces the applicant-tracking part of
Welcome to the Jungle, Teamtailor or Recruitee — and the "jobs@" mailbox plus
a spreadsheet — for a company of 10 to 200 people. The company gets its own
careers page; candidates apply with a short form and their CV; the team
follows each candidate on one board per job, gives structured feedback, and
decides together.

## What it does

- **A careers page** (`/`): the company's name, a few words about it, its
  open jobs (title, team, place, contract, remote work) — an editorial
  table of contents. English/French switch, remembered in a cookie.
- **A page per job** (`/<job>`): what, where, how much (the salary range is
  shown by default — EU pay transparency), a description with headings,
  lists and bold (marks anyone can type, rendered as text, never HTML), and
  one action: *Apply*.
- **The application form** (`/<job>/apply`): name, email, phone and a
  LinkedIn or portfolio link (optional), **the CV** (PDF or Word, 10 MB at
  most), a few words, and the consent with the retention in plain words.
  The CV goes from the browser to the Chest (Proposal *public uploads*); the
  tool checks its type, size and first bytes before keeping it. No captcha:
  a honeypot, a signed "shown at" time and counters (Proposal *visitors*).
  A thank-you page; a confirmation email in the candidate's language
  (Proposal *mail*) — no candidate account: the email says the team will
  write.
- **Jobs** (`/chest`): open jobs with their pipeline at a glance and their
  new applications, drafts, closed jobs; what waits for *my* feedback
  first. Write a job (draft), publish, close, reopen — each with *Undo*.
- **A board per job**: its stages (New, Screening, Interview, Offer, Hired
  by default; renamed, added, reordered, removed when empty). Candidate
  cards show the average rating and the days in the stage. Drag with the
  mouse, a finger or the keyboard (space, arrows, space) — with *Undo*. The
  rejected are folded below.
- **A candidate's page**: contact, the CV shown inline (PDF) or downloaded,
  the cover letter, **structured feedback** (1–4, strengths, concerns,
  hire or not) that an interviewer sees from others only once they gave
  theirs, notes, the history, *Move to…*, *Ask for feedback*, *Reject* with a
  reason (only the team sees it) and an optional email drafted in the
  candidate's language, *Bring back*, *Edit the details*, *Replace the CV*,
  *Erase this candidate*. Other applications from the same address are
  listed.
- **Add a candidate by hand** (a referral, a CV received by email), with
  their CV and language.
- **Interviewers per job**: they see only the jobs they are on.
- **The bell and the tile**: recruiters hear of each new application (the
  tile counts those they have not opened); interviewers hear when asked
  for feedback; whoever asked hears when it is given.
- **GDPR / CNIL**: candidates are deleted with their CV 2 years (or 1 year,
  6 months: *Settings*) after their last news, every night (Proposal
  *schedules*); CVs sent but never claimed go after a day; a recruiter
  erases a candidate on request; the form and each job page say it. Each
  job's candidates export as CSV.

## Roles

| Role | Can |
|---|---|
| `recruiter` (first: owner, admins, builders) | Everything: jobs, stages, interviewers, candidates, moves, rejections and emails, notes, feedback, erasure, export, settings |
| `interviewer` | Only the jobs they are on: see candidates and CVs, read notes, give feedback. No moves, no settings |

A member with no role sees why, not an error.

## First minute

- **What does a new recruiter see first?** An empty page that says *Post
  your first job* and one button, *Write a job*.
- **What is the first thing they do?** Write the title, contract and
  description (a template in the placeholder), save the draft, press
  *Publish*: the job is on the careers page, its link one click away.
- **How many clicks for the main job?** Moving a candidate on: one drag, or
  one click on *Move to Interview* on their page. Giving feedback: one
  rating, one recommendation, *Send* (three clicks). Applying: fill the
  form, one file, one click.
- **What happens on a mistake?** A move, a rejection, publishing or closing
  a job: a toast with *Undo*. A candidate who typed something wrong keeps
  everything they typed; a recruiter corrects their details. Erasing is
  the only thing that asks first (it cannot be undone).

## Routes

| Route | Who | What |
|---|---|---|
| `/`, `/<job>`, `/<job>/apply`, `/<job>/thanks` | anyone | The careers page |
| `POST /api/cv` | anyone (form token, counters) | Authorise one CV upload (public) |
| `/lang/<code>` | anyone | The language switch |
| `/chest` | members | Jobs, what waits for me |
| `/chest/jobs/new`, `/chest/jobs/<id>/edit` | recruiter | Write a job |
| `/chest/jobs/<id>` | recruiter, its interviewers | The board |
| `/chest/jobs/<id>/settings` | recruiter | Stages, interviewers, delete an unused job |
| `/chest/jobs/<id>/add` | recruiter | Add a candidate |
| `/chest/jobs/<id>/export` | recruiter | CSV |
| `/chest/candidates/<id>`, `…/cv` | recruiter, the job's interviewers | A candidate, their CV (a fresh signed link) |
| `POST /chest/api/cv` | recruiter | Authorise one CV upload (team) |
| `/chest/settings` | recruiter | Careers page settings, retention |
| `POST /chest-events` | the Chest | Members' lifecycle |
| `POST /chest-jobs/cleanup` | the Chest | Nightly retention (Proposal) |

## On a Chest

Capabilities: `database`, `files`, `members`, `notifications`; receives
`member.*`. Proposals (in `chest.proposals.json` until a Chest accepts
them): `mail.send`, `files.publicUploads`, `schedules` (`cleanup`, 03:25),
`emits` (`hiring.hired`, `hiring.hire_cancelled`) and the tile's French words. When a member loses access or leaves, they are
taken off their jobs and no longer asked for feedback; what they wrote stays
under "(former member)". On erasure, their id goes from notes, feedback,
history (including "asked X for feedback"), jobs and candidates they added,
then the erasure is acknowledged.

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

**The consent sentence was not changed.** The name and address go to
People only once the person is hired, inside the same company (the same
controller, not a third party), and from then on for their employment,
whose legal basis is the work contract, not the application's consent. The
application form's consent covers what it says: keeping the application to
consider it, and for how long. Telling People is the company's internal
onboarding, which the Chest's link between the two tools makes explicit to
its admin.

## Needs from the SDK

All exist as proposals in the studio's working copy; the tool calls them as
if shipped and keeps working without them:

- **Public uploads** (`files.uploadUrl(name, { public: true })`): without
  them (`CapabilityNotGranted`), the form asks for a link to the CV instead.
- **Mail** (`mail.send`): without it, the thank-you page and the rejection
  toast say no email left; the candidate is told the team will write.
- **Schedules** (`cleanup`): without it the retention does not run by
  itself (see *What it does not do yet*).
- **Visitors** (`visitors.formToken/checkForm/count/language`): without the
  Chest's counting, the tool counts in its own table.
- **Events between tools** (`events.publish`): without them, People is not told of hires.
- **Chest settings** (`chest.company()`, `chest.publicUrl()`): the company
  name by default, the careers page's address for emails and links.

## Develop

```sh
npm ci
npm test                                   # PGlite; TEST_DATABASE_URL=… for PostgreSQL
npm run build
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 5300   # from the studio: harness with seed data
```

`seed/sample.sql` fills Atelier Martin's careers page: three open jobs (one
written in French), a closed one, fifteen candidates with feedback, notes
and history. Sample CVs cannot be seeded (files are the Chest's): the flows
upload one.

## What it does not do yet

- No multiposting to job boards (needs outbound network and partner APIs).
- No interview scheduling (Booking could offer it — events between tools).
- No talent pool across jobs, no screening questions per job, no hiring
  requests to approve.
- No import from Teamtailor / Workable / WTTJ exports (their CSV columns
  were not read first-hand; a mapping step is needed).
- No replies from candidates into the tool (a `jobs` mailbox would need the
  mail proposal's received mail).
- On a Chest without schedules, the 2-year retention does not run by
  itself; recruiters still erase by hand.
- The inline CV preview frames the Chest's signed file link; whether a
  real Chest lets the tool frame it is not specified (Open/Download work
  either way).
