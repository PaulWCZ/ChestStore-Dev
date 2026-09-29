# Forms — make a form in minutes, share one link, read the answers

**Forms** (French: *Formulaires*) replaces Typeform, Tally, Google Forms,
Microsoft Forms and Jotform for a company of 5 to 250 people: contact
forms, event sign-ups, customer feedback and NPS, job applications,
internal requests, anonymous team check-ins. It is the studio's version of
the store's beta Forms (`reference/forms`, three field types, no logic):
built again from the studio's template to stand next to Tally and Typeform.

## What it does

- **A builder you write in**: the form's title and introduction, then
  question cards. *Add a question* offers 14 kinds — short answer, long
  answer, email, phone, number, one choice, several choices, dropdown,
  yes/no, rating (3–10 stars), opinion scale (0/1 to 5–10, words at both
  ends: NPS), date, file upload, text only. Each: required, help text,
  limits (length, smallest/largest, how many to pick), options you reorder
  (Enter adds the next one), an *Other* with its own text. Duplicate, move,
  change the kind, delete with *Undo*.
- **Pages and logic**: *Show only if…* an earlier answer is / is not /
  includes / is more than / is less than / is answered; after a page,
  rules *If … go to page N* or *the end*. Rules only go forward, so a form
  can never loop. The same engine runs in the browser and on the server.
- **Live preview**: the real respondent's page beside the builder (a tab on
  a phone), following the question you edit. Every change is saved by
  itself; two editors never overwrite each other silently.
- **Templates in English and French**: contact, event registration,
  feedback and NPS (with logic), job application (with a CV), IT request
  (a team form), an anonymous team check-in. Or a blank form. Duplicate a
  whole form.
- **Publishing**: a draft until *Publish*; editing a published form keeps a
  draft (*Changes not published yet*, *Publish changes* or *Discard*).
  Every answer keeps the version of the questions it answered — the answers
  table and the summary match questions across versions and mark the ones
  removed.
- **Who answers**: *anyone with the link* (the public host, no account),
  *people of the team* (in the Chest, their identity from the Chest; one
  answer each, or several for a request form), or *people of the team,
  anonymously* (see below). A team form can tell everyone in the bell when
  it opens.
- **Taking answers**: a closing date and hour (the Chest's time zone), a
  limit on the number of answers (held under concurrent answers), a custom
  thank-you title and message, or a redirect to an https address.
- **The respondent's page**: one question at a time (letters to choose,
  Enter to go on, a pick with the finger moves on by itself) or all
  questions of a page; a progress bar; a colour among six, each checked
  for contrast; in the visitor's language for the tool's words (the
  switch, then the browser, then the Chest's); what is typed is kept on the
  device until sent; errors in plain words under each question.
- **Prefill**: `?<question>=value` in the link fills an answer (a choice by
  its label); *Share* builds such a link.
- **Files**: a file question takes images, documents or both, 10 MB each.
  On a public form the file goes from the visitor's browser to the Chest
  and is **claimed only by the answer that sent it** (Proposal *public
  uploads*, `files.claim`); on a team form the tool signs the file's name.
  Its type and first bytes are checked before it is kept.
- **Spam**: no captcha — the form's signed "shown at" time and counters
  per visitor and for everyone (Proposal *visitors*).
- **Answers**: a table (a list of cards on a phone) with search, a filter
  on any choice or yes/no, one answer on its page (with its files), delete
  with *Undo*; a summary per question: bars with counts and percents, the
  average for stars and scales, the **NPS** for 0–10 scales, the range of
  numbers and dates, the latest texts; **CSV** for a spreadsheet (a
  byte-order mark, `;` for French spreadsheets, cells that could run as a
  formula written behind a quote, numbers as numbers).
- **The bell and the tile**: the people chosen for a form (among those who
  may open it) hear of new answers — at most one item per form and person
  every 10 minutes, replaced, never doubled; the tile counts what they have
  not seen. Opening the answers clears both.
- **A copy by email** of their answers to the person who gave an address
  (public forms) or to the member (team forms), in their language
  (Proposal *mail*). Never for anonymous forms.
- **Privacy**: answers deleted after 1–36 months if chosen (every night,
  with their files: Proposal *schedules*); a manager finds a person's
  answers by email address or name and erases them (*Erase a person's
  answers*).

## Anonymous team forms — the design, and its limits

- **No member id, no address, no time finer than the month** is stored
  with an answer. Who has answered is in `participants`, never joined to
  the answers (it stops double answers and shows *Answered*).
- **Order and database stamps do not give people away**: each anonymous
  answer rewrites the form's answers and participants in one transaction,
  in a random order (tested: every row carries the last transaction's
  stamp). Answer ids are random.
- **Nothing is shown under five answers** — not the table, the summary or
  the CSV, to anyone (owner and managers included).
- An anonymous form **cannot ask for files** (an upload goes through the
  member's own session), sends **no copies**, and **cannot change its
  anonymity once someone answered**.
- What it does **not** protect against, honestly: someone watching the
  bell's count right after a colleague answered (the bell is batched every
  10 minutes, which blurs it); a free text that gives its author away; the
  server's database administrator comparing copies of the database. Must
  not be used to evaluate individuals.

## Roles

| Role | Can |
|---|---|
| `manager` (first: owner, admins, builders) | Create forms; open and change **every** form (a colleague left); erase a person's answers |
| `creator` | Create forms; open the forms they own or that are shared with them |
| `member` | Answer the team's forms; open the forms shared with them |

On one form: **owner** (its creator, or any manager) shares it and deletes
it; **editor** builds, publishes, closes, changes settings, deletes
answers; **viewer** reads the answers and the summary, exports. A form
someone may not open is *not found*. A member with no role sees why, not
an error.

## First minute

- **What does a new user see first?** "Ask anything, get clear answers",
  one button — *Make your first form* — and three templates as chips. A
  member without the Creator role sees the team's forms to answer.
- **What is the first thing they do?** Pick a template (or blank): the
  builder opens with the form on the left and its live preview on the
  right; they change a question and see it change.
- **How many clicks for the main job?** From home to a published form with
  a template: *New form* → a template → *Publish* → *Copy link*: four.
  Answering: one tap per choice question, Enter or *OK* for a text.
- **What happens on a mistake?** A deleted question, page, answer or form:
  *Undo*. Publishing an unfinished form lists what to fix with *Show me*.
  A respondent's wrong email is refused with the reason under the
  question; a closed tab keeps what they typed. Erasing a person's answers
  is the only thing that asks for a word (it cannot be undone).

## Routes

| Route | Who | What |
|---|---|---|
| `/` | anyone | Says forms are opened by their link |
| `/<form>` | anyone | A public form (8 letters and digits) |
| `POST /api/upload` | anyone (form token, counters) | Authorise one file upload (public) |
| `/lang/<code>` | anyone | The language switch |
| `/chest` | members | Forms to answer, mine, shared with me, everyone's (managers) |
| `/chest/new` | manager, creator | Start a form |
| `/chest/forms/<id>` (+ `/share`, `/settings`, `/answers`, `/answers/<answer>`, `/summary`, `/export`, `/files/<answer>/<question>`) | owner, editors, viewers of that form | Build, share, settings, answers, summary, CSV, a file (a fresh signed link) |
| `/chest/f/<form>` | members | Answer a team form |
| `POST /chest/api/upload` | members | Authorise one file upload (team form) |
| `/chest/privacy` | manager | Find and erase a person's answers |
| `POST /chest-events` | the Chest | Members' lifecycle |
| `POST /chest-jobs/bell`, `/chest-jobs/cleanup` | the Chest | The bell's batches (every 15 min), retention (03:20) — Proposal |

## On a Chest

Capabilities: `database`, `files`, `members`, `notifications`; receives
`member.*`. Proposals (in `chest.proposals.json` until a Chest accepts
them): `mail.send`, `files.publicUploads`, `schedules` (`bell`,
`cleanup`), and the tile's French words; the tool also calls `visitors`,
`chest` (company, time zone, addresses) and `notifications.broadcast`.
When a member loses access or leaves, they are taken off the forms shared
with them and the bell; forms they own stay (managers open them). On
erasure, their answers to team forms are deleted with their files, their
mark in anonymous forms becomes "erased" (counted, never named), forms they
owned are owned by "erased", then the erasure is acknowledged.

## Needs from the SDK

All exist as proposals in the studio's working copy; the tool calls them as
if shipped and keeps working without them:

- **Public uploads with claim** (`files.uploadUrl(…, {public, expiresUnclaimedAfter})`,
  `files.claim`): without them, a public file question says files cannot be
  sent yet.
- **Visitors** (`formToken`, `checkForm`, `count`, `language`, `visitor`):
  without the Chest's counting, the tool counts in its own table.
- **Mail** (`mail.send`, to an address or `{member}`): without it, no copy
  is sent and the thank-you page does not mention one.
- **Schedules** (`bell`, `cleanup`): without them the bell still tells at
  once when the form was quiet for 10 minutes, but a batch waits for the
  next answer; retention does not run by itself (see below).
- **Broadcast** (`notifications.broadcast`): without it, a team form's
  opening is not announced; its link is shared by hand.
- **Chest settings** (`chest.company()`, `timeZone()`, `publicUrl()`,
  `teamUrl()`).

## Develop

```sh
npm ci
npm test                                   # PGlite; TEST_DATABASE_URL=… for PostgreSQL
npm run build
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 6800   # from the studio: harness with seed data
node ../../../lab/chest-dev/flows/forms.mjs 6800
```

`seed/sample.sql` fills Atelier Martin's forms: customer feedback with NPS
and logic (27 answers), an open day registration with a limit and a date,
an IT request (a team form, shared with an editor), an anonymous weekly
check-in, a draft contact form, a closed form. Sample files cannot be
seeded (files are the Chest's): the flow uploads one.

## What it does not do yet

- No payments, quizzes or scores, calculated fields, recall of an earlier
  answer in a question ("Thanks, {name}").
- No partial answers (what someone typed but did not send stays on their
  device) — a privacy decision to take first.
- No matrix/grid, ranking, picture choice or signature questions.
- No webhooks, integrations or spreadsheet sync (needs outbound network or
  events between tools); other tools cannot yet link to a form's answers.
- No import of a form from Typeform, Tally or Google Forms (no stable,
  public export format of form definitions was found).
- No email verification of respondents; no respondent editing an answer
  after sending.
- Several files per file question, and files over 10 MB, are not taken
  (the public upload proposal caps at 10 MiB).
- The summary reads the latest 20,000 answers of a form; the CSV 100,000.
- On a Chest without schedules, retention does not run by itself;
  answers are still erased by hand.
