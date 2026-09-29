# Forms — make a form in minutes, share one link, read the answers

**Forms** (French: *Formulaires*) replaces Typeform, Tally, Google Forms,
Microsoft Forms and Jotform for a company of 5 to 250 people: contact
forms, event sign-ups, customer feedback and NPS, job applications,
internal requests, anonymous team check-ins. It is the studio's version of
the store's beta Forms (`reference/forms`, three field types, no logic):
built again from the studio's template to stand next to Tally and Typeform.

## What it does

- **A builder you write in**: the form's title and introduction, then
  question cards. *Add a question* offers 17 kinds — short answer, long
  answer, email, phone, number, one choice, several choices, dropdown,
  **picture choice** (one or several), yes/no, rating (3–10 stars),
  opinion scale (0/1 to 5–10, words at both ends: NPS), **matrix** (rows
  rated on one scale), **ranking** (tap the items in order), date, file
  upload (**up to 10 files**), text only. Each: required, help text,
  limits (length, smallest/largest, how many to pick), options you reorder
  (Enter goes to the next option, adding one when needed — the cursor
  follows), an *Other* with its own text, a **name in links** (`?nps=9`).
  New options are empty with "Option 1" as a placeholder; one left empty
  blocks publishing. Duplicate, move, change the kind, delete with *Undo*.
- **Pages and logic**: *Show only if…* an earlier answer is / is not /
  includes / is more than / is less than / is answered; after a page,
  rules *If … go to page N* or *the end*. Rules only go forward, so a form
  can never loop. The same engine runs in the browser and on the server.
- **Live preview**: the real respondent's page beside the builder (a tab on
  a phone), following the question you edit.
- **Everything saves by itself** — questions and settings alike, one model
  for the whole tool: a moment after the last change, and at once before a
  tab or link of the tool leaves the page (the tab waits for the save); a
  closed tab sends its last change with a keepalive request. Two editors
  never overwrite each other silently: *Reload* to see theirs, or *Keep my
  version*.
- **Two languages per form** (optional): the questions are written in
  English or French; a second version of every text can be added and
  edited beside the first (the builder switches between them and counts
  what is not translated yet). A respondent reads their language when the
  form has it, the form's own otherwise — **the tool's words follow the
  form's language**, so a page never mixes two languages; the public
  switch offers only the form's languages.
- **Import from Google Forms or Typeform**: the form's file as their APIs
  give it (JSON: Google's `forms.get`, Typeform's `GET /forms/{id}`)
  becomes a draft — pages, kinds, choices, *Other*, grids, required,
  limits, Typeform's language and welcome text; the builder lists what did
  not come (logic rules, pictures, payments).
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
  Enter to go on, a pick with the finger moves on by itself, yes/no
  included) or all questions of a page; a progress bar and "40% done"
  (never a total that changes); the button says *OK*, not *Send*, while an
  answer could still bring another question; keyboard hints ("press
  Enter", "Ctrl + Enter" on a long answer, "drop a file") only where there
  is a keyboard; a colour among six, each checked for contrast; the
  **company's logo** when its Chest has its brand (`chest.theme()`), and an
  optional **cover picture** per form; what is typed is kept on the device
  until sent, and a reload offers *Continue where you stopped*; errors in
  plain words under each question.
- **Prefill**: `?<name>=value` (the question's name in links, or its id)
  fills an answer (a choice by its label); *Share* builds such a link.
- **On the company's website**: a manager lists the websites allowed to
  show the public forms (their `frame-ancestors`); *Share* gives a frame
  code that takes the form's height, and a button code that opens it. The
  frame waits for the Chest (below); the button works today.
- **Files**: a file question takes images, documents or both, 10 MB each.
  On a public form the file goes from the visitor's browser to the Chest
  and is **claimed only by the answer that sent it** (Proposal *public
  uploads*, `files.claim`); on a team form the tool signs the file's name.
  Its type and first bytes are checked before it is kept.
- **Spam**: no captcha — the form's signed "shown at" time and counters
  per visitor and for everyone (Proposal *visitors*).
- **Answers** (one tab, *Answers* and *Summary*): a table (a list of cards
  on a phone) with search, filters that apply at once (a choice or yes/no,
  a follow-up state with counts, a range of days), newest or oldest first,
  the columns chosen, a shadow when it scrolls sideways; one answer on its
  page with *Newer* / *Older*, its files, a mail link to the respondent;
  delete with *Undo*; a summary per question: bars with counts and
  percents, the average for stars and scales, the **NPS** for 0–10 scales,
  a matrix row by row, a ranking's average places, the range of numbers
  and dates, the latest texts; **CSV** for a spreadsheet (a byte-order
  mark, `;` for French spreadsheets, cells that could run as a formula
  written behind a quote, numbers as numbers, a matrix one column per
  row); **everything as a ZIP** (the CSV, the form as JSON with every
  version, every file in a folder per answer).
- **Following up** (request forms, and any named form): each answer is
  *New*, *In progress* or *Done*, with a note. On a team form the person
  who sent it finds it under **What you sent** on their home, with its
  state and note, and the bell tells them when it changes.
- **The bell, the tile and email**: the people chosen for a form (among
  those who may open it) hear of new answers — at most one item per form
  and person every 10 minutes, replaced, never doubled; the tile counts
  what they have not seen. Opening the answers clears both. With *Also
  send them each batch by email* (Proposal *mail*), the same batches come
  by email, the answers written in it, and *Reply* writes to the
  respondent when the batch holds one answer that gave an address; an
  anonymous form's email says only how many.
- **Other tools of the Chest**: with *Send answers to: the other tools of
  your Chest*, each answer is published as `forms.answered` (Proposal
  *events between tools*): the form, its title, the answer, its fields as
  `{question, key, label, kind, value}` (files by name), the respondent's
  email if given, the member for a named team form. An admin links the
  receivers (Clients could make a contact, Helpdesk a ticket). Never for
  an anonymous form.
- **Deleted forms** stay 30 days in *Deleted forms* (their owner, or any
  manager, brings one back); deleting a form with answers asks first and
  says how many go. Forms started and never touched go after a day.
- **Search** on the forms list (title words, accents aside).
- **A copy by email** of their answers to the person who gave an address
  (public forms) or to the member (team forms), in their language
  (Proposal *mail*). Never for anonymous forms.
- **Privacy**: answers deleted after 1–36 months if chosen (every night,
  with their files: Proposal *schedules*); a manager finds a person's
  answers by email address or name and erases them (*Erase a person's
  answers*).

## Looks

Forms wears any look, with the same features: its own identity
(*Invitation*: lavender mist, aubergine ink, one berry, DM Serif Display
and DM Sans — `lib/theme.ts`), any theme of the kit's catalogue, or the
company's brand imported in its Chest — for all its tools or for Forms
alone. The Chest chooses (`chest.theme()`, `lib/theme.ts` `currentLook`);
Forms has no switch of its own. In brand mode the company's logo shows
beside the name in the header and at the top of every respondent's page.

**A form's colour** (Settings → Look, six choices) is a family of the
look's categorical palette — indigo the blue, teal the teal, tangerine the
orange, forest the green, ink the slate — so a teal form stays teal in any
look, in that look's own shade. The first colour is the look's own action
colour: Forms' berry in its own look, the theme's accent in a catalogue
theme, **the company's colour in brand mode**. So on a public page the
company's brand wins, unless the form's author chose one of the five other
colours on purpose (Settings says so: "Your company chose how its tools
look: the first colour is its own."). In Forms' own look a form's page
takes its colour's soft ground; in any other look, the theme's surface
(some themes' soft grounds are too strong for the hints and errors). Every
text of a form's page is measured in every colour, in Forms' look, every
catalogue theme and 300 random brands (`test/theme.test.ts`).

The kit's components (`@argentic/chest-ui/components`) give the shell,
toasts with a true *Undo*, dialogs, the people picker, the date fields
(never the browser's own), the file picker, the answers' table, the
filters and the search box; inside a form's page they wear the form's
colour.

Until the kit's catalogue holds Forms (it has the 17 other identities),
other tools cannot wear *Invitation*; the entry it needs is in
`reports/04-themes-and-kit.md` (studio) and below, in *Needs from the
SDK*.

## Anonymous team forms — the design, and its limits

- **No member id, no address, no time finer than the month** is stored
  with an answer. Who has answered is in `participants`, never joined to
  the answers (it stops double answers and shows *Answered*).
- **Order and database stamps do not give people away**: each anonymous
  answer rewrites the form's answers and participants in one transaction,
  in a random order (tested: every row carries the last transaction's
  stamp). Answer ids are random.
- **Never one person's row**: an anonymous form has no answers table, no
  single-answer page, no row filter and no per-row CSV. Its *Answers* show
  the count and each written answer on its own, each list shuffled; its
  *Summary* and CSV are aggregates. Nothing at all under five answers, to
  anyone (owner and managers included).
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
| `manager` (first: owner, admins, builders) | Create forms; open and change **every** form (a colleague left); erase a person's answers; choose the websites that may show the public forms |
| `creator` | Create forms; open the forms they own or that are shared with them |
| `member` | Answer the team's forms; open the forms shared with them |

On one form: **owner** (its creator, or any manager) shares it and deletes
it; **editor** builds, publishes, closes, changes settings, follows
answers up, deletes answers; **viewer** reads the answers and the summary,
exports (the Settings tab is not shown to a viewer). A form
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
- **What happens on a mistake?** A deleted question, page or answer:
  *Undo* (the toast waits while the pointer or keyboard is on it); a
  deleted form: 30 days in *Deleted forms*. Publishing an unfinished form
  lists what to fix with *Show me* (nothing is flagged before that).
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
| `/chest/forms/<id>` (+ `/share`, `/settings`, `/answers`, `/answers/<answer>`, `/summary`, `/export`, `/archive`, `/files/<answer>/<question>`) | owner, editors, viewers of that form | Build, share, settings (editors), answers, summary, CSV, ZIP, a file (a fresh signed link) |
| `POST /chest/forms/<id>/draft` | editors (same origin) | The builder's last save when the page goes away (keepalive) |
| `POST /chest/api/image` | editors of the form | Authorise one picture upload (a cover, a picture choice) |
| `/chest/sent/<answer>` | the member who sent it | What I sent, and where it stands |
| `/chest/trash` | owners, managers | Deleted forms, 30 days |
| `/chest/f/<form>` | members | Answer a team form |
| `POST /chest/api/upload` | members | Authorise one file upload (team form) |
| `/chest/privacy` | manager | Find and erase a person's answers |
| `POST /chest-events` | the Chest | Members' lifecycle |
| `POST /chest-jobs/bell`, `/chest-jobs/cleanup` | the Chest | The bell's batches (every 15 min), retention (03:20) — Proposal |

## On a Chest

Capabilities: `database`, `files`, `members`, `notifications`; receives
`member.*`. Proposals (in `chest.proposals.json` until a Chest accepts
them): `mail.send`, `files.publicUploads`, `files.publicFiles` (covers and
pictures), `emits: ["forms.answered"]`, `schedules` (`bell`, `cleanup`),
and the tile's French words; the tool also calls `visitors`, `chest`
(company, time zone, addresses, `theme()` for the look and the logo) and
`notifications.broadcast`.
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
  `teamUrl()`, `theme()`: the look the company chose, and its logo).
- **The UI kit's catalogue** (`@argentic/chest-ui`, 0.2.1-studio.1): Forms'
  identity as its 20th theme, `forms` (with the fonts `dm-sans` and
  `dm-serif-display` in its registry), so any other tool may wear it and
  `lib/theme.ts` becomes `identityOf("forms")`. Until then the identity
  declares its fonts from its own files, latin subsets only.
- **Public files** (`files.publicUrl`): covers and picture choices; without
  them, the pictures do not show on the public page.
- **Events between tools** (`events.publish("forms.answered")`): without
  them, the switch is harmless — nothing leaves.

Not in the working copy yet (see the SDK report):

- **Being framed by the company's website**: the Chest's front adds
  `frame-ancestors 'none'` to every public response (floor policy), and
  the stricter policy wins, so the frame code cannot work on a Chest
  today. Needed: a manifest permission such as `"embeddable": true` that
  lets the front drop its own `frame-ancestors` for the public host and
  keep the tool's (which lists the sites a manager allowed).
- **Webhooks to a customer's URL** (Zapier, Make, a spreadsheet script):
  a tool has no outbound network except declared hosts, and a customer's
  URL is not known when the manifest is written. Needed: a `webhooks`
  capability — the tool calls `webhooks.send(target, body)` for a target
  its admin configured in the Chest (`https` only, never a private
  address), the Chest signs (HMAC-SHA256, `Chest-Webhook` header),
  delivers at least once with retries for 24 h, journals each delivery and
  shows failures to the admin.

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
  answer in a question ("Thanks, {name}"), signature question.
- No partial answers (what someone typed but did not send stays on their
  device) — a privacy decision to take first.
- **Not shown in another website yet** (the Chest's frame policy, above);
  the button code works. No webhooks or spreadsheet sync (a Chest
  capability is needed, above). Other tools receive answers only once the
  Chest has events between tools and an admin linked them — no store tool
  receives `forms.answered` yet.
- **Email alerts** need the Chest's mail; without it Settings says so and
  the bell alone tells. No daily digest (the batches are every 10 minutes).
- Import: form definitions from Google Forms and Typeform only (not
  Tally, Jotform or Microsoft Forms), without their logic rules, pictures
  or scoring; **no import of past answers** (a company keeps its history
  in the old tool or a CSV).
- A matrix takes one choice per row (no checkbox grid); a picture choice
  has no *Other*; a ranking has no "rank only the top 3".
- Sharing is with one person at a time (no Chest group, no "everyone").
- One anonymous check-in tool too many: Forms' "Anonymous team check-in"
  template overlaps the Polls tool's pulse, and a form cannot recur each
  week — the store still has to decide who owns pulse surveys.
- No email verification of respondents; no respondent editing an answer
  after sending (they see it and its follow-up in *What you sent*).
- Files over 10 MB are not taken (the public upload proposal caps at 10
  MiB). Pictures of a team form are published files too (random names,
  never listed).
- The summary reads the latest 20,000 answers of a form; the CSV 100,000.
- On a Chest without schedules, retention does not run by itself;
  answers are still erased by hand.
