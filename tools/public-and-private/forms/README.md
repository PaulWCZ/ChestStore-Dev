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
  includes / is more than / is less than / is answered — up to five
  conditions joined by *and* or *or*; after a page, rules *If … go to page
  N* or *the end*. Rules only go forward, so a form can never loop. A page
  no answer can reach (the page before always jumps elsewhere) is said in
  the builder. The same engine runs in the browser and on the server.
- **Repeat an answer**: a question named in links (`first_name`) is
  repeated by `{first_name}` in a later question, its help or the
  thank-you message ("Thanks, {first_name}!").
- **Values from the link** (hidden fields): Settings names what the
  form's link may carry (`utm_source, ref`, ten at most); each answer keeps
  them (200 characters each), shown on its page and as CSV columns, and
  `{utm_source}` repeats one in a text. Never on an anonymous form.
- **A shared device** (Settings): a tablet at an event keeps nothing typed,
  and the form starts again for the next person after each answer.
  Elsewhere, what is typed waits on the device for 12 hours at most.
- **Who it reached** (Summary): how many times the form's page was opened,
  how many answers came since, the share that answered, and the answers
  of the last 30 days, a column a day (not for an anonymous form: a day
  would say when someone answered).
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
  (SDK 0.7.0's visitors' uploads, into `uploads/public/`): the Chest names
  it (20 random characters: nobody guesses another visitor's), checks its
  type by its bytes and paces each visitor; the answer hands the name back
  and the tool checks it before keeping it (`stat`, type, size). A visitor
  may send images, PDF, today's Office files (.docx, .xlsx, .pptx) and
  OpenDocument files — **never plain text, CSV nor the old .doc and .xls**
  (0.7.0 does not recognise them by their bytes and refuses to grant their
  upload; a member still may on a team form). On a team form the tool signs the file's name. What no
  answer records is deleted after a day (schedule `cleanup`).
- **Spam**: no captcha — the form's signed "shown at" time and counters
  per visitor and for everyone (the package's `bound`).
- **Answers** (one tab, *Answers* and *Summary*): a table on a wide
  screen; **on a phone, one card per answer** — who, when, the first three
  answers (each named by its question), where it stands; the whole row
  or card opens the answer. Search; filters that apply at once (a choice
  or yes/no, a follow-up state with counts, a range of days) — on a phone
  behind one *Filter* button (open when a filter is on); newest or oldest
  first; *Columns shown* (a button with a chevron) picks the questions;
  questions read in the member's language when the form has a version in
  it (the answers, one answer, the summary); one answer on its
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
- **The bell and the tile**: the people chosen for a form (among those
  who may open it) hear of new answers in their Chest notifications — at
  most one item per form and person every 10 minutes, replaced, never
  doubled, one notice in English and French; the tile counts what they
  have not seen. Opening the answers clears both. The Chest mails members
  their notifications by their own choice (each one, once or twice a
  day, or off; off per tool) — Forms itself never emails a member.
- **Other tools of the Chest** (Settings → *Send answers to*): *Also
  create a contact in Clients* and *Also open a ticket in Support* — the
  form's author says which question gives the name, the email, the phone,
  the company, the message, or the ticket's subject and details (each
  choice lists only the questions that can give it; the obvious ones are
  guessed by the kinds of the questions: the first choice or list is the
  subject, the first long text the details or the message, the second
  short text the company) — and *The other tools of your Chest* for every
  answer as it is. A switch is **greyed, with a sentence** while nothing
  would receive it: "Clients is not installed in your Chest…"
  (`chest.tools.get`, a studio proposal); it says "Clients did not receive
  the last contact: ask the owner of your Chest to approve its link…" when
  the last `forms.contact` reached no tool (`events.emit` answers how many
  tools it was written for; 0.7.0 names none) — still usable then: the
  next answer says whether the link is on now. It can always be turned
  off. **The Contact template starts linked to Clients** when
  Clients is installed and nothing says the link is off, its mapping
  made; it has a *Your company* question. Each
  answer's page says **where it went** ("Also sent to: Clients (a
  contact) · Support (a ticket) · your web addresses · a copy to the
  person", Clients and Support as links); an answer Support took shows
  no *New / In progress / Done* of its own — Support's ticket follows it
  up — and only when the request reached a tool and Support is installed:
  otherwise the copy goes. An answer lists a tool only when one received it
  (`emit`'s `receivers`). See **With the other tools** below. Never for
  an anonymous form.
- **Each answer to a web address** (Settings → *Send each answer to a web
  address*, Proposal *webhooks*): a Slack or Microsoft Teams channel is
  told of each new answer (the form, its questions and answers as text,
  a link), or any receiver — Zapier, Make, a spreadsheet's script, the
  company's server — gets the answer as JSON, signed by the Chest (its
  secret key shown once). Five addresses per form. The Chest checks the
  address, delivers, retries; one that keeps failing is stopped, Settings
  says so with *Try again*, and the form's owner is told in the bell.
  Never for an anonymous form.
- **Deleted forms** stay 30 days in *Deleted forms* (their owner, or any
  manager, brings one back); deleting a form with answers asks first and
  says how many go. Forms started and never touched go after a day.
- **Search** on the forms list (title words, accents aside).
- **A copy** of their answers, off unless the form's editor turns it on:
  for a member (team forms), a notification opening what they sent
  (*What you sent*, with where it stands); on a public form, an email to
  the address given, **only when the visitor ticks *Email me a copy of my
  answers***, and holding **only the form's own words** (the questions,
  the options picked, numbers and dates; never a text the visitor typed,
  so no link and no message goes out in the company's name), one an
  address a day and 20 a form an hour. In their language (Proposal
  *mail*). Never for anonymous forms. **Not when Support took the answer**
  (see "One message, one email" below).
- **Privacy**: answers deleted after 1–36 months if chosen (every night,
  with their files: Proposal *schedules*); a manager finds a person's
  answers by email address or name and erases them (*Erase a person's
  answers*).

## With the other tools

Forms tells the other tools of the Chest about answers through SDK 0.7.0's
**events between tools** (`chest.json` `"emits"`, each type with the schema
of its data). Forms emits; a receiving tool declares the type in its
`"receives"`, and **the owner approves the link in the Chest** ("Forms →
Support: An answer asks for help") — a tool never picks its publishers.
Delivery is the Chest's: signed, at least once, in order per answer (the
`subject`, `answer:<id>`), to the receiver's `POST /chest-events`. Each
event is emitted once per answer (its `key`, `forms:<answer>:contact`…),
within the Chest's 16 KiB as it travels (the longest text gives way
first), **never for an anonymous form**, and never blocks the answer: if
the Chest cannot take it, the answer is kept all the same. The data is
**flat**, of the Chest's kinds (`id`, `text`, `time`, `member`…): a list
of answers travels as JSON text. People are member ids (`mbr_…`), never
names from the Chest; texts are what the respondent wrote, trimmed and
bounded; yes/no and *Other* in the language the respondent read. `path`
is the answer's page in Forms (`/chest/forms/5/answers/…`), a path, never
an origin. **No audience**: the form's author chose to send its answers to
the other tools (the form's Settings), so every member of a receiving tool
may see them there.
Each text is told without format characters (an emoji's zero-width
joiner, a zero-width space: SDK 0.7.0 refuses an event holding one); the
answer keeps what was typed.

**Clients receives `forms.contact`** (its README, "What Clients receives":
the contact found by email — or by phone only when the name is the same
too, otherwise a new contact marked "maybe the same person" —; one line
"Filled in the form …" in its history with the message and what the form
gave; a lead in its *My day*; never twice for one event or one answer).
**Support receives `forms.request`** (its README, "With the other
tools": a ticket, once per event and per answer, and its "we received
your request" email to the requester). Version 1 (`v: 1`); a type's data
only grows — a new shape would be a new type.

**One message, one email.** When a form's *Also open a ticket in Support*
is on, Support is installed and the ticket event reached a tool for an
answer, **Forms sends no copy of that answer** even with *Send them a
copy* on: Support confirms the request by email itself, and a visitor
must not get two emails from two senders for one message. Settings says
so under the copy switch ("Support confirms each request by email…").
Without Support installed, or for an answer that opens no ticket (no
email given, or no tool received it), the copy goes as usual. Support's
side needs nothing new (it already confirms every `forms.request`);
should Support ever stop confirming, it must say so in its README and
Forms must drop this rule (`src/lib/respond.ts`, `supportConfirms`).

### `forms.contact` — make or update a contact (Clients)

Sent when the form maps a contact (Settings) **and** the answer gives an
email or a phone. The receiver matches an existing contact by
`contactEmail` (lower case); by `contactPhone` only when `contactName`
agrees too (a phone is often shared: a switchboard, a shop); else creates
one. It keeps `message` and the given name, email, phone and company in
the contact's history, with `path` for a link back.

```jsonc
{
  "v": 1,                                   // number
  "form": "5",                              // id
  "formTitle": "Contact us",                // text: the title as answered
  "answer": "k3…16 letters",                // id
  "answeredAt": "2026-09-29T10:00:00.000Z", // time
  "language": "fr",                         // text
  "path": "/chest/forms/5/answers/k3…",     // text
  "contactName": "Nina Roux",               // text?, ≤ 120
  "contactEmail": "nina@example.com",       // text?, lower case, ≤ 254
  "contactPhone": "+33 6 12 34 56 78",      // text?, as typed, ≤ 40 — email or phone is always there
  "contactCompany": "Roux SARL",            // text?, ≤ 120
  "message": "Six oak chairs…",             // text?, ≤ 4,000
  "member": null                            // member?: who answered a named team form
}
```

### `forms.request` — open a ticket (Support)

Sent when the form maps a ticket **and** there is someone to answer: an
email (public forms: the mapping requires the email question) or the
member who answered (team forms).

```jsonc
{
  "v": 1, "form": "5", "formTitle": "Contact us", "answer": "…", "answeredAt": "…",
  "language": "fr", "path": "/chest/forms/5/answers/…",
  "subject": "A quote",              // text: the mapped answer, else the form's title; ≤ 150
  "details": "Six oak chairs…",      // text?, ≤ 8,000
  "requester": null,                 // member?: the member of a team form
  "requesterName": "Nina Roux",      // text?
  "requesterEmail": "nina@example.com", // text?
  "fields": "[{\"question\":\"q1d…\",\"label\":\"Your phone number\",\"value\":\"+33 6 12 34 56 78\"}]"
                                     // text: JSON, every other answer in the form's order (dropped from the end past 16 KiB)
}
```

### `forms.answered` — every answer, as it is

With *The other tools of your Chest* on: `{ form, title, answer, language,
fields, email, member }` (`id`, `text`, `id`, `text`, `text`, `text?`,
`member?`) — `fields` is JSON text of `[{ question, key, label, kind,
value }]`, values as text (choices by their labels, files by their names,
never a file), numbers as numbers, yes/no as `true`/`false`; `key` is the
question's name in links (`?nps=9`). For a receiver that wants everything
(Tasks, a future sheet). The form's web addresses get the same answer
unflattened (below).

What the mapping holds (`forms.routes`, `src/lib/routes.ts`): question ids per
piece, checked against the form's questions when Settings save (a piece
whose question is gone or changed kind is dropped; a contact without an
email or a phone question, a public ticket without an email question, is
refused with a sentence). At answer time the answered version is read: a
question removed since gives `null`. Duplicating a form does not copy the
mapping (its questions get new ids). Tests: `test/routes.test.ts`
(`chest.emitted`, checked against `chest.json` by the fake Chest).

## Looks

Forms wears any look, with the same features: its own identity
(*Invitation*: lavender mist, aubergine ink, one berry, DM Serif Display
and DM Sans — `src/lib/theme.ts`), any theme of the kit's catalogue, or the
company's brand imported in its Chest — for all its tools or for Forms
alone. The Chest chooses (`chest.theme()`, `src/lib/theme.ts`; the package serves it as `/chest/look.css` and `/look.css`);
Forms has no switch of its own. **A public form** wears the company's
brand when it has one and Forms' own look otherwise — never a catalogue
theme chosen for the team's pages, never the Chest's sheet (kit 0.2.3); a
team form, inside the Chest, wears the team's look. In brand mode the
company's logo shows beside the name in the header and at the top of
every respondent's page.

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
  member's own session), sends **no copies**, reads **nothing from its
  link**, and **cannot change its anonymity once someone answered**.
- **No version, no language gives anyone away**: every answer is kept in
  the form's own language (not the reader's), and once an anonymous form
  has answers **its questions cannot change** — its words can, and every
  answer moves to the new version — so no answer says it came before or
  after a change. To ask other questions, duplicate it.
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
| `member` | Answer the team's forms; open the forms shared with them; **make forms too when a manager turns on *Everyone can make forms*** |

**Everyone can make forms** (critique round 3, N6). In Google Forms and
Tally anyone makes a form; here a manager turns one switch at the foot of
the home page, instead of giving the Creator role person by person. It is
off until a manager turns it on (a Chest that upgrades keeps what it had).
With it on, a Member makes forms exactly as a Creator does — owns them,
shares them, publishes them, public ones included — and still opens only
the forms they own or that are shared with them: only managers open every
form. It fits the access model without a new level: on one form, its
maker is its owner whatever their role (`src/lib/access.ts` `levelOn`); the
switch only answers "may this person start a new form?"
(`src/lib/creators.ts` `mayCreate`). Turned off again, nobody loses a form: a
Member keeps owning, editing and sharing what they made (and its
*Deleted forms*), and starts no new one. The Creator role stays for a
company that keeps the switch off.

On one form: **owner** (its creator, or any manager) shares it and deletes
it; **editor** builds, publishes, closes, changes settings, follows
answers up, deletes answers; **viewer** reads the answers and the summary,
exports (the Settings tab is not shown to a viewer). A form
someone may not open is *not found*. A member with no role sees why, not
an error.

## First minute

- **What does a new user see first?** "Ask anything, get clear answers",
  one button — *Make your first form* — and three templates as chips. A
  member without the Creator role (while *Everyone can make forms* is off)
  sees the team's forms to answer, and is told a manager can let everyone
  make forms.
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
| `POST /actions/answerPublic`, `/actions/visitorUpload` | anyone (bound: a form token, budgets per visitor, per form and per day, the honeypot) | Send an answer; authorise one file upload |
| `/lang/<code>` | anyone | The language switch (the package's) |
| `/chest` | members | Forms to answer, mine, shared with me, everyone's (managers) |
| `/chest/new` | manager, creator | Start a form |
| `/chest/forms/<id>` (+ `/share`, `/settings`, `/answers`, `/answers/<answer>`, `/summary`, `/export`, `/archive`, `/files/<answer>/<question>`) | owner, editors, viewers of that form | Build, share, settings (editors), answers, summary, CSV, ZIP (both streamed), a file (a fresh signed link) |
| `POST /chest/actions/<name>` | members (the package's same-origin check) | Every change of the team's part (`src/actions.ts`): the builder's saves (also its last one, keepalive, when the page goes), pictures, sharing, settings, follow-up, the team form's answer and upload… |
| `/chest/sent/<answer>` | the member who sent it | What I sent, and where it stands |
| `/chest/trash` | owners, managers | Deleted forms, 30 days |
| `/chest/f/<form>` | members | Answer a team form |
| `/chest/privacy` | manager | Find and erase a person's answers |
| `POST /chest-events` | the Chest (signed) | Members' lifecycle |
| `POST /chest-webhooks` | the Chest (signed) | A web address the Chest stopped (`webhook.disabled`) — Proposal |
| `POST /chest-schedules` | the Chest (signed) | `bell` (the bell's batches, every 15 min) and `cleanup` (retention, 03:20) — `chest.json` `schedules` |

## Stack

Hono and React rendered on the server, with islands for what runs in the
browser, built by Vite — through the studio's package
`@argentic/chest-app` (0.1.0-studio.12, `vendor/`), on SDK 0.7.0-studio.2 and the
UI kit 0.2.6-studio.1. Contract 0.7: the Chest's strict CSP (no inline
script or style: bars are SVG, widths are classes). `npm start` runs
`dist/server/main.js`; the browser's files are `/assets/` (`build.static`).
Measured on the studio's bench (`lab/measure`, 2026-10-06, against the
Next.js 16 version): image 469 → 39 MiB, memory at rest (PSS) 137 → 67
MiB, first page after a cold start 949 → 582 ms, and the build fits the
Chest's 512 MiB (310 MiB peak).

## On a Chest

Contract 0.7 (`chest check` says OK). Capabilities: `database`, `files`
(visitors' uploads included), `members`, `notifications`, `realtime` (a
page left open — the forms, a form's answers and summary — follows the
channel `forms`: the feeds of `answers` and `forms` carry a row's id
only, and the page's read, versioned, decides what its reader sees; no
timer); receives `member.*`; emits `forms.answered`, `forms.contact`,
`forms.request` with their schemas; `schedules` (`bell`, `cleanup`).
Proposals (in `chest.proposals.json`): `mail.send`, `files.publicFiles`
(covers and pictures), `"webhooks": true`, and the tile's French words.
The tool also calls `chest` (company, time zone, `tool.publicUrl` and
`tool.teamUrl` for its addresses, `tools.get` for the others' — a
proposal —, `theme()` for the look and the logo) and
`notifications.broadcast`.
The public part never asks the Chest at each visitor's request, and never
lists members. **What anyone on the Internet can make a form do**, a day
(`src/lib/flood.ts`, said in Settings): 2,000 answers a form (100 a
visitor, 20,000 for all forms); a form whose answers go further — a
contact in Clients, a ticket in Support, a web address, a copy by email —
200 (20 a visitor, 2,000 for all); 200 files a form (30 a visitor, 1,000
for all, 10 MiB each). Each answer waits for the page's single-use token
(bound to this action), its proof of work (the package's `bound.work`: a
fraction of a second in a Worker, harder as the day's budget runs low;
the form then needs JavaScript) and three seconds, and a robot that fills the hidden field is answered
"sent" with nothing kept. The tool's log says when a form's day is half,
four fifths and fully spent (counts and the form's id only). Answers to
questions a form does not ask, and link values it does not name, are
dropped, never kept. The Chest checks the first bytes of images and PDFs
itself (and of every file a visitor sends); the tool reads the others'
(a member's Office and text files), two at a time. When a member loses access or leaves, they are taken off the forms shared
with them and the bell; forms they own stay (managers open them). On
erasure, their answers to team forms are deleted with their files, their
mark in anonymous forms becomes "erased" (counted, never named), forms they
owned are owned by "erased", then the erasure is acknowledged.

## Mail to people outside the company

Forms emails only visitors — people outside the company — and only the
copy they ask for. Members are told in their Chest notifications: the
people chosen for a form hear of new answers, a member who answered a
team form gets their copy, everyone hears of a team form that opens.

| Recipient | Purpose | When | Content | Attachments | Reply-To |
|---|---|---|---|---|---|
| The visitor who answered a public form | A copy of their answers (a receipt) | They answer, with *Email me a copy of my answers* ticked, when the form's editor turned copies on (never for an answer Support confirms itself, never for an anonymous form); one an address a day, 20 a form an hour | The form's questions with only the form's own words (options picked, numbers, dates; never a text they typed), in the language they read the form in, signed with the company's name; "To write to {company}, reply to this email" | — | The company's address (the connector's default) |

Sent through the Chest's mail connector (studio proposal, not built yet).
Replies reach the company's usual inbox, never Forms. When the connector
is absent or paused, nothing is lost: the answer is kept and told to the
team, the thank-you page says "We could not email you a copy this time.
Your answer was received." (also when the copy is held back: one an
address a day, 20 a form an hour), and Settings says why copies do not
go.

**Changed on 6 October 2026** (the owner's mail decisions): *Also send
them each batch by email* is gone (the people told get the bell, and the
Chest mails it to them by their own choice); a member's copy of a team
form is a notification opening *What you sent*, no longer an email; the
team's *New form to answer* is one broadcast with its French
translation. The `forms.notify_email` and `forms.mailed_at` columns are no
longer read or written (`notify_email` is `not null default false`, so
new forms need nothing from this version); they stay so that the
previous version keeps working during a rolling update, and a later
version drops them (`alter table forms drop column notify_email, drop
column mailed_at`) once no instance runs the previous one.

## Needs from the SDK

Built on SDK **0.7.0** + the studio's proposals (`0.7.0-studio.2`) and
the studio's package `@argentic/chest-app` (0.1.0-studio.12). From 0.7.0
itself: members, notifications with `translations` and `broadcast`,
events between tools with schemas, visitors' uploads into a folder,
realtime, schedules, `chest.organization.name`, `chest.timeZone` (the
company's day: a closing date, the answers' filter, the database's
`current_date`), `chest.language`, `chest.tool.publicUrl` and
`teamUrl`. The package bounds the public actions (`bound`: a form token,
a time floor, the honeypot, budgets per visitor, per form and per day
kept in `chest_bounds`, charged only once an answer is valid).

**What Forms cannot do on a 0.7.0 Chest, and why** (the studio's
proposals still run in its tests and harness; on a real 0.7 Chest those
calls are refused and the tool falls back as said):

- **Email a visitor their copy** — `mail` is a **proposal** (`mail.send`
  to an address, the visitor's copy only; see *Mail to people outside the
  company*): 0.7.0 sends no mail to people outside. Without it, no copy is
  sent and the thank-you page does not promise one; Settings says why
  (`mail.available`).
- **Covers and pictures on a public form** — public files are a
  **proposal** (`files.publicPath`, `"files": {"publicFiles": true}`):
  0.7.0's files are private, its links live 15 minutes on the team host.
  Without it the pictures do not show on the public page.
- **Each answer to Slack, Teams or a web address** — `webhooks` is a
  **proposal** (`webhooks.add`, `send`, `list`, `enable`, `remove`,
  `handle` on `POST /chest-webhooks`; `"webhooks": true`): 0.7.0 has none.
  Settings asks the Chest first (`webhooks.available`): without webhooks,
  when the owner paused Forms' sending, or when the Chest did not answer,
  it says which and hides the form to add one; answers are kept. Adding
  many addresses in an hour is paced (`RateLimited`: "Try again in an
  hour").
- **Whether Clients or Support is installed** — `chest.tools` is a
  **proposal** (`CHEST_TOOL_URLS`): 0.7.0 names no other tool, and
  `events.emit` answers how many tools an event reached, never which.
  On a Chest that gives no list of tools, Forms never says "not
  installed"; it says "did not receive the last one" when an event of
  that kind reached no tool, and lists on an answer only the tools that
  received it. The links from an answer to Clients or Support need the
  proposal too.
- **A visitor's plain text, CSV, .doc or .xls file** — 0.7.0 takes from a
  visitor only what it recognises by its bytes (no plain text, no CSV, no
  old Office format); a public form's file question offers images, PDF,
  .docx, .xlsx, .pptx and OpenDocument files.
- **Per-visitor limits** — the visitor's key is a **proposal**
  (`visitors.visitor()`): 0.7.0's front names no visitor, so a robot that
  drops its cookie can spend a form's day for everyone (*What it does
  not do yet*).
- **The store's words in French** — `translations` is a **proposal**:
  the tile and the role names read in English for a French member.
- **Live public forms** — realtime is for members: a visitor's page is
  as it was read (a form closed meanwhile refuses the answer and says
  so).
- **Being framed by the company's website**: the Chest's front adds
  `frame-ancestors 'none'` to every public response unless the owner
  allows the company's sites (0.7.0: the tool's Public tab; not checked
  against a running Chest). The button code works.

The UI kit's catalogue (`@argentic/chest-ui`, 0.2.6-studio.1): public
forms wear the company's brand or Forms' own look, never a catalogue
theme chosen for the team (`surface: "public"`); Forms' identity is its
20th theme, `forms` ("Invitation"), with the fonts `dm-sans` and
`dm-serif-display`: `src/lib/theme.ts` is `identityOf("forms")`.

## Develop

```sh
npm ci
npm test                                   # PGlite; TEST_DATABASE_URL=… for PostgreSQL (and the scale test)
npm run build
npm run dev                                # Vite and the server, reloaded on change
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 6800 --tools crm,helpdesk   # from the studio: harness with seed data, Clients and Support installed
node ../../../lab/chest-dev/flows/forms.mjs 6800
```

The scale test (`test/scale.test.ts`, PostgreSQL only) fills a form with
10,000 answers and 300 files and runs the server in its own process: pages
measure under 120 KB (island props under 45 KB; the test fails past 600 KB and 256 KB), the CSV (4.1 MiB) and the
ZIP (32.8 MiB) are streamed, an anonymous answer is taken in ~0.4 s, and
the server's peak stays at 110–130 MiB (limit 256 MiB).

`seed/sample.sql` fills Atelier Martin's forms, each written in English
with its French version (the form's second language: a French reader
sees the French titles, a French visitor the French form): customer feedback with NPS
and logic (27 answers), an open day registration with a limit and a date,
an IT request (a team form, shared with an editor), an anonymous weekly
check-in, a draft contact form, a closed form. Sample files cannot be
seeded (files are the Chest's): the flow uploads one.

## What it does not do yet

- No payments, no quizzes or scores, no calculated fields, no signature
  question.
- No partial answers (what someone typed but did not send stays on their
  device, 12 hours at most) — a privacy decision to take first.
- A robot can still fill a public form up to its day's budget (above):
  without a visitor's identity, the budgets bound the harm but do not stop
  it. The proof of work stops robots that run no JavaScript, but a script
  that computes it pays about a millisecond per answer (reasoned, not
  measured): the budgets are what bound the harm, and the Chest's own
  bot protection with the visitor's address (the SDK report) would do
  better. A visitor without JavaScript is told the form needs it.
- **Not shown in another website yet** (the Chest's frame policy, above);
  the button code works. Web addresses get each answer (webhooks), but
  there is **no two-way spreadsheet sync** and no Google Sheets
  connector of its own (a Zapier or Make scenario, or a sheet's Apps
  Script receiving the JSON, does it). Clients receives `forms.contact`
  and Support `forms.request` (above) once the owner approved each link;
  **no store tool receives
  `forms.answered` yet**. A contact is made from one answer's fields only
  (no merging rules chosen by the author). The first guess of a mapping
  reads the kinds and order of the questions, never their words: an
  unusual form may need its mapping chosen by hand. Forms cannot know
  whether Clients or Support took an event (only that the Chest did), nor
  the ticket's number.
- Web addresses: per form (no "every form to this channel" setting); the
  text for Slack and Teams is plain (no buttons, no cards); the JSON
  carries files by their names only.
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
- Files over 10 MB are not taken (the tool's own bound). A visitor
  cannot send a plain text or CSV file (above). Pictures of a team form are published files too (random names,
  never listed).
- **10,000 answers a form at most** (taken in the same statement as the
  form's own limit; Settings says it): the summary counts them in the
  database, the CSV and the ZIP are streamed (`test/scale.test.ts`).
- On a Chest without schedules, retention does not run by itself;
  answers are still erased by hand.
