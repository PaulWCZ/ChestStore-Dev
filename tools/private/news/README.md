# News — the company's front page, and who has read what matters

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Workvivo, Staffbase or
Simpplr** for a small company — and the all-staff email and the `#general`
channel where announcements drown.

## What it does

- **The front page**: the lead story large, then the others newest first,
  **pinned posts on top**; filters *Announcements, Events, Welcome, Shout-outs, Info*;
  *Coming up* (the next events, with my answer); a **New** mark on what came
  since my last visit; 20 posts a page.
- **A post**: a headline and a text formatted as it will read — a toolbar
  (bold, italic, subheading, lists, numbered lists, quote, link, picture)
  and the usual shortcuts (Ctrl+B, Ctrl+I); nobody types marks. News keeps
  the text as plain text with a few marks (`src/shared/markdown.ts`, never HTML),
  which search and the notifications read. A **cover picture**, **pictures
  inside the text**, a **gallery** of up to 20 pictures and videos (MP4,
  WebM up to 25 MB, played as they are) and up to 10 attached files.
- **Two languages**: a post may have its headline and text in English and
  in French; each reader sees theirs (the notifications and the calendar
  too), with a link to read the other one.
- **Important posts**: everyone it is for gets a **notification**, in
  their own language — the headline, the start of the text, the link to
  the post — and is asked to click **"I have read it"**. The Chest emails
  members their notifications as each one chose (every one, once or twice
  a day, or off): News never emails anyone. The button says what will
  happen: *Publish and tell 6 people*. For **10 seconds** after it, nothing has left:
  **Undo** (in the toast, or on the post) takes it back to the composer.
  The publisher sees *Read by 4 of 7*, who confirmed and when, who has not
  yet; reminds them (once a day at most, a notification); downloads the
  list (CSV, with the version each person confirmed). Only the click
  counts: News never shows who opened a post (see "Works council").
- **Versions**: each change of a published post's words keeps the words
  it replaced (*1 earlier version*, for publishers). When an Important
  post's text changes, the publisher may **ask everyone to confirm again**:
  earlier confirmations stop counting (the list says who confirmed an
  earlier version) and everyone is told again.
- **Made Important later**: a post made Important when it is already out
  — the day after or a month after — is told then, like a new one, to its
  audience who has not confirmed it, once (the notification is replaced,
  never doubled). The same goes for a new audience or *Ask everyone to
  confirm again*. What is told is due for 7 days from the edit (from
  publishing, for a new post): a post the Chest could not be reached for
  in a week is no longer told (`migrations/0007_…`). Until this version
  the 7 days counted from publishing only, so an older post made
  Important told nobody.
- **Views, a number only**: for publishers, how many different people of
  a post's audience opened it (*Opened by 12 of the 40 people it is for*),
  shown from 5 people and counted every hour, next to *Read by* — never
  who (see "Works council").
- **Events**: a day or several, time (or all day), place, and **places**
  if they are limited: past them, *Join the waiting list*; a place freed
  goes to the first waiting, who is told. **I'm coming / Not coming**
  until the end of the last day, with who is coming. Whoever comes finds
  the event **in their Chest calendar** (Proposal (studio): calendar — the
  one feed a member adds to Google, Outlook or Apple once); the `.ics`
  file stays.
- **Welcome posts**: pick the new colleague; their photo and name lead the
  post, and they are told in their bell that the team says hello.
- **Posts from everyone, moderated** (Workvivo's feed): any member with a
  role clicks **Share something** (the header's button for readers) and
  proposes a **shout-out** — thanks to a colleague, whose photo and name
  lead the post — or a **piece of news**, with a picture if they like. It
  waits for a publisher: publishers see *N posts from colleagues wait for
  your approval* on the front page and one bell item (replaced, withdrawn
  when none is left), and on *To approve* (`/chest/proposals`) they
  **Publish** it as it is (signed by its author; they may edit it after
  like any post) or **Decline** it with an optional reason (*Undo* puts
  it back). The author is told either way; the colleague thanked is told
  once it is published. **Until then only its author and the publishers
  see it**: it is not a post — never on a front page, in search, an
  export or anyone else's bell, and its picture opens for
  them alone. Nobody approves their own proposal; a reader approves
  nothing. The author sees their proposals under the form and may take
  one back (*Undo*). Five may wait per person. Publishers can also write
  shout-outs themselves (a fifth kind, *Shout-outs* on the front page).
- **Reactions** (👍 ❤️ 🎉 👏 😄), **comments** and one level of
  **replies**; **@mentions** (type @ and a name: the people who see the
  post are proposed) tell the person mentioned. The author of a post hears
  of new comments, the author of a comment of its replies.
- **Scheduled posts**: *Schedule…* beside the Publish button, then a day
  and a time; until then only publishers see it (*Scheduled*, on the side
  of the front page).
- **Pinned until**: a pin may end on a day (then the post is no longer
  first).
- **Who is it for**: *Everyone* (the default) or *Some groups or people* —
  any group of the Chest (Sales, the workshop…, Proposal (studio):
  `members.groups`), and people picked by name; the composer counts them (*6 people
  can see it*). A post kept to an audience is marked *For Sales and 2
  people* and seen by it, its author and the Chest's admins; **nobody
  else** sees it, its comments, reactions, files, calendar file or search
  results (a link to it answers "not found"). Only its audience is told,
  asked to confirm, reminded and counted (*Read by 1 of 2*); an
  admin or the author outside it is never asked. Someone who leaves a
  group loses the bell item of its posts (the Chest's `member.updated` /
  `group.changed` / `group.removed`); changing the audience of an
  Important post tells the new audience; confirmations of people it is no
  longer for stop counting.
- **Search**: one box at the top (a button on a phone) across the posts and
  comments the person may see, case and accents aside (*demenagement*
  finds *Déménagement*), each word by its beginning or by its stem in
  English and French (*move* finds *moving*, *déménager* finds
  *déménagement*), every word needed, in any language of the post; a
  headline with a typo is still found. **Results are in the reader's
  language** (headline and passage, as on the front page); when the
  words are only in the post's other language the result says so
  (*Found in its French version*), and when nothing is found while some
  posts exist only in the other language, it suggests trying the word in
  it (*Some posts are written in English only*). The words found are marked; a
  comment found shows under its post, with its author, its mentions
  written as names. A mention is not a word of its comment: a member id,
  "mbr" or "erased" finds nothing (`migrations/0005_…`).
- **Moving in and out** (publishers, *Import from Slack, or download all
  posts* at the foot of the front page): a **Slack export** (the ZIP a
  workspace owner downloads) — one channel at a time, each top-level
  message an Info post by its author when their name is a member's (by the
  importer otherwise, the Slack name in the text), at its date, nobody
  told, never twice, **Undo** in the toast; **Download all posts** — one
  ZIP with `posts.json`, one Markdown file per post (its languages, its
  comments) and its files (200 MB at most; a list says which were left
  out).
- **The tile's number**: the Important posts I have not yet confirmed (the
  last 90 days).
- **Nothing is lost by a click**: a post or a comment deleted comes back
  with *Undo* (kept 30 days); a new post's draft is kept in the browser
  until it is published.

## Roles

| Role (`chest.json`) | Label | May |
|---|---|---|
| `publisher` | Publisher | writes, edits, schedules, pins and deletes posts; marks a post Important and sees who confirmed; removes any comment; publishes or declines what others propose (never their own) |
| `reader` | Reader | reads, reacts, comments, confirms "I have read it", answers events; proposes shout-outs and news (a publisher publishes them) |
| (none) | — | sees "You can't read News yet" |

The owner, the admins and the tool's builders come in with the first role,
`publisher`. A page or a download a reader has no use for (the composer, *To
approve*, *Move posts in and out*, who confirmed, *Download all posts*)
answers as if it did not exist (404, "Nothing here"), as a post kept from
them does; a change they may not make, asked of an action, is refused in
words ("Your role does not allow this.", 403). A scheduled or deleted post does not exist for a reader (404).
A post kept to groups does not exist for anyone outside them — publishers
included — except its author and the Chest's admins (the same rule as the
Wiki's spaces kept to groups).

## First minute

- **What a new user sees:** the front page with today's date and the lead
  story. If an Important post waits for them, a yellow strip says so first:
  *One post asks you to confirm you have read it* — **Read it**. On an empty
  Chest, a publisher sees *Nothing published yet*, **Write the first
  post**, *Welcome a new colleague*, and *Moving from Slack? Import a
  channel* (no empty section tabs). On a post, *I have read it* sits right
  under the headline, above the picture, on a phone too.
- **The first thing they do:** a reader opens the strip's post and clicks
  **I have read it**; a publisher clicks **Write a post**, keeps
  *Announcement*, types a headline and a text (the toolbar for bold or a
  list), **Publish**. For an event, its day, time, place and places come
  right under the headline, before the text. The Publish bar stays in
  reach under the text column only (never over the right column) and, on
  a phone, follows the form.
- **Clicks for the main job:** confirming an Important post is 2 clicks from
  the front page; answering an event is 2; publishing is 1 after typing —
  and the button says who will be told (*Publish and tell 6 people*).
- **A mistake:** an Important post sent by mistake → *Undo* within 10
  seconds, nothing has left; a typo found later → edit it (the earlier
  version is kept; *Ask everyone to confirm again* if it matters); a
  deleted post or comment → *Undo* in the toast; a closed tab → the draft
  comes back ("Your draft is back", or *Start over*); an import from Slack
  → *Undo*; an event answer is changed by clicking the other button (or
  the same one again to take it back); a refused action puts the screen
  back and says why. A reader on an empty front page is told whom to ask
  (*To publish one, ask Sofia Rossi or Camille Martin*) and may **Share
  something**; a publisher sees one Slack import link, not two.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` (`?kind=`, `?page=`) | members with a role | the front page |
| `/chest/posts/<id>` | who sees the post | the article; for publishers of an Important post, who read it |
| `/chest/search` (`?q=`) | members with a role | search: the posts and comments they may see |
| `/chest/new` (`?kind=`), `/chest/posts/<id>/edit` | publishers | the composer |
| `/chest/posts/<id>/calendar` | who sees the event | the `.ics` file |
| `/chest/propose` | members with a role | share something: a shout-out or news, for a publisher to approve; one's own proposals |
| `/chest/proposals` | publishers | what waits for approval: Publish, Decline |
| `/chest/posts/<id>/confirmations` | publishers | who confirmed, as CSV |
| `/chest/actions/requestUpload`, `/chest/actions/recordUpload` | publishers (anyone, for a proposal's picture) | authorise, then record a picture, a video or a file the browser sent to the Chest |
| `/chest/transfer` | publishers | import a Slack channel; download all posts |
| `/chest/transfer/import` | publishers | a Slack export (POST, the ZIP, from the page itself): its channels, or (`?channel=`) one imported |
| `/chest/transfer/export` | publishers | every post they see, as a ZIP |
| `/chest/files/<id>` (`?size=256\|1024`, `?download`) | who sees the post (or its uploader, before saving) | a 15-minute link signed by the Chest |
| `/chest-events` | the Chest only (signed) | members' lifecycle; groups (`group.changed`, `group.removed`) |
| `/chest-schedules` | the Chest only (signed) | the runs of the "publish" schedule of `chest.json` |
| `/chest/actions/<name>` | members (the page itself) | every change (`src/actions.ts`) |
| `/chest/look.css` | members | the look: the company's choice, else Newsprint (a stylesheet, cached by its hash) |
| `/` | anyone | "News lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `files` (covers 15 MB — JPEG, PNG, GIF, WebP,
  the pictures the Chest makes thumbnails of — attachments 25 MB, uploaded
  from the browser to the Chest); `members` (names, photos, who has News);
  `notifications` (the bell, the tile's number); `receives: ["member.*"]`.
- **Groups** are the Chest's. With the capability **`members.groups`**
  (Proposal (studio), the name announced for 0.5, in
  `chest.proposals.json`: "Sees your Chest's groups and who is in them")
  News offers **every** group (`members.groups.all()`), and the Chest names
  every group a member is in — in `member(request).groups` and in
  `members.*` — so a company that opens News to everyone can still write
  for Sales. It receives `group.*`: someone who leaves a group
  (`member.updated`, `group.changed`) or a group removed (`group.removed`)
  takes the item of the Important posts they are no longer in the audience
  of away, and their number. Without the capability, only the groups that
  **give** News are offered (the Chest shows a tool no other group). A
  group the Chest no longer has stays on the posts it was on (read *a
  former group*). The official 0.4.1's `member()` refuses an
  assertion with more than 16 groups; the vendored SDK 0.4.1-studio.7
  lifts it (an assertion up to 16 KiB, about 300 groups).
- **Notifications, never email** (the owner's decisions of 6 October
  2026): every notice is written once, in English with its French
  `translations` (Proposal (studio), announced for 0.5) — an Important
  post's in each language the post has — and the Chest shows each member
  theirs. The Chest emails members their notifications by their own
  choice (every one, once or twice a day, or off; and off per tool) and
  groups them: News has no email, no digest and no "email me" setting of
  its own. News sends **no mail at all**: nobody outside the company is
  ever written to, so it declares no `mail`.
- **Calendar** (Proposal (studio): `"calendar": true`): an event is put in
  the Chest's feed of each person coming (`calendar.put`, key
  `event:<id>`, in their language), again at each answer or change, and
  removed when deleted. Without it, the `.ics` file.
- **Search** uses PostgreSQL: `migrations/0002_…` creates the `unaccent`
  and `pg_trgm` extensions (both *trusted*: the database's owner may create
  them, PostgreSQL 13+) and a text search configuration `news` (`simple` +
  `unaccent`: each word as written, by its beginning, the same in English
  and French), with a generated `tsvector` on posts and comments;
  `migrations/0003_…` adds `news_en` and `news_fr` (`unaccent` then the
  English or French stemmer) and a second generated `stems` vector on
  posts, their other languages and comments, so a word is also found by
  its stem (*déménager* finds *déménagement*). Results always show the
  post in the reader's language; when the words are only in its other
  language, the result says so, and an empty search suggests trying the
  word in the language some posts are written in only.
- **Telling everyone** uses `members.list`, 500 people at a time (up to
  10,000), in each person's language. The Chest takes **1,000 recipients an
  hour** per tool: beyond, News stops, keeps where it stopped, and goes on
  at the next pass — the "publish" schedule every 15 minutes, or the next
  visit to the front page — once the hour has passed. In a company of more
  than ~1,000 people an Important post therefore reaches everyone's bell
  over two hours or more; it is on the front page for everyone at once.
  Badge writes (600 a minute) are set right at each person's next visit.
- **Scheduled posts** appear at their time without any job (the front page
  shows what is due); the bell for a scheduled Important post rings at the
  next pass: within 15 minutes with the schedule, at the first visit after
  the time without it.
- **Someone leaves** (or loses access): their answers to events still to
  come are removed, their last visit forgotten; what they wrote and
  confirmed stays (their name reads "(former member)"). **An erasure**:
  their posts, comments, reactions and files stay for the company, unsigned
  ("Former member"); a welcome post about them names nobody; their
  confirmations, answers and last visit are deleted; then the erasure is
  acknowledged. What *others* wrote about them (a welcome text, a photo)
  is not changed — a publisher deletes that post if it must go.
- **Works council (France, Code du travail L.2312-38)**: News records an
  Important post's confirmations — an explicit click — and, per person,
  the time of their last visit to the front page (for the *New* marks). For **views** it keeps a number, never a name:
  - Each view is stored as a *fingerprint* — a keyed hash (HMAC-SHA-256,
    cut to 128 bits) of the viewer's member id under a random key of that
    post alone — so a second visit is not counted twice. The table has no
    member id, and the key of one post says nothing of another.
  - Publishers see only the count of different people of the post's
    audience who opened it (never its author), and **only from 5**: below,
    it reads "fewer than 5"; a post for fewer than 5 people never shows it.
    The count is as of the **last full hour**, so it cannot be watched rise
    while one person opens the post.
  - **30 days after publication** the count is kept and the post's key and
    every fingerprint are **deleted**: from then on nothing links anyone to
    a post. An erasure deletes the person's fingerprints at once.
  - What it does *not* protect: during those 30 days, someone with direct
    access to the database and a person's member id could test whether
    that person opened a given post. The tool never does it and shows it to
    nobody, admins included.

  We chose this over a per-person record ("Hugo opened it at 10:12"),
  which is the monitoring a CSE must be consulted on. A company of 50 or more should still inform its CSE before
  using confirmations and view counts; this paragraph is written so it can
  be handed to them.
- No WebSocket: the front page re-reads itself every 60 s, a post every
  30 s, while visible.

## Needs from the SDK

Built on SDK 0.4.1 + studio proposals (0.4.1-studio.6), in `vendor/`, and the
studio's app machinery `@argentic/chest-app` (0.1.0-studio.8).

- `member.language` (SDK 0.3.0 and later): the interface in each member's language;
  a notice's `translations` (Proposal (studio), announced for 0.5) for the
  notifications in each recipient's.
- **Scheduled tasks** (`schedules`, SDK 0.4.0): `chest.json` declares
  `publish` every 15 minutes, run on `POST /chest-schedules`
  (`src/calls.ts`). Without it News still works — the publish pass runs
  when someone opens the front page.
- The Chest's **time zone** (`chest.timeZone`, SDK 0.3.0): event times
  and schedules are typed on the Chest's clock. The Chest makes it its
  database sessions' zone too: the sample data's days and times
  (`current_date`, `::timestamptz`) are on that clock.
- **Localized manifest title** (studio report): the tile says "News" to a
  French member; the interface says *Actualités*.
- **`members.groups`** (`receives: ["group.*"]`), notices'
  **`translations`** and the **calendar** — Proposals (studio), in
  `vendor/`, described above.
- Wanted, not built: **actions on a bell item** (`notify(…, { actions:
  [{ label, path }] })`: *I'm coming* / *Not coming* in the Chest's bell
  itself, and in the Chest's emails of notifications — today the
  notification opens the post, where the answer is two taps away);
  **push to a phone**; a **broadcast to roles, groups and people by id
  that also sets each one's tile number**, or a **"notify at least once"
  quota exemption**, so a large company is told at once; a **video thumbnail/transcoding** service (videos play as
  uploaded); a **polls** embed across tools.

## Mail to people outside the company

None. News is for the team only: it writes to nobody outside the company,
and it emails no member either (the Chest emails members their
notifications, by their choice). It declares no `mail`.

## What changed with the mail decisions of 6 October 2026

- **No email from News any more.** Important posts, their reminders, the
  welcomes and everything else are notifications; the Chest emails them
  to each member as they chose. Gone: News's emails of Important posts and
  reminders, the "Sent by email to N people" line, the composer's "by
  bell and email" wording, the one-tap *I'm coming* links of those emails
  (`/chest/posts/<id>/answer`), and the `mail` proposal.
- **No weekly digest.** The Chest groups notifications as each member
  chose; News's Monday digest (its `digest` schedule, bell item and
  email) and the *Stop the email* switch at the foot of the front page
  are gone.
- **Notices carry their translations**: one notice per moment, in English
  with French `translations`, instead of one call per language.
- **Groups** use the capability `members.groups` (the earlier groups read
  proposal is gone): a member's groups come with the member.
- The tables only these used (`preferences`, `digests`, `digest_runs`,
  `emails`, `posts.email_short`) stay until no version in service reads
  them (a Chest runs the new migrations before switching versions, and a
  rollback to the previous version runs none): they are dropped in the
  next release. A leaving or erased member's rows in them are still
  deleted. The digest item an earlier version left in a bell is withdrawn
  at the first pass. The one-tap links of emails already sent
  (`/chest/posts/<id>/answer`) answer nothing: they open the post.

## Looks

News wears **any look the company chooses in its Chest**: its own identity
"Newsprint" (newsprint paper, black rules, a headline serif, one press red
— the default), any theme of the store's catalogue (the 17 identities,
"Chest", "High contrast"), or the company's brand imported from its
guidelines — for all tools or for News alone, with the same features. The
look is a stylesheet News answers itself (`/chest/look.css`, linked with
its hash and cached until the company chooses another: no inline style, no
script); in brand mode the company's logo stands beside the name, on the
members' pages and the public root. The newspaper's heavier weights are
steps above the theme's own (`src/tokens.css`), so a theme whose hierarchy
is size alone (the "Chest" theme) stays at one weight. Screens:
`docs/screens/*-chest-*`, `*-theme-*` (Workshop, Library), `*-brand-*` (the
sample brand); `important-undo-*` and `important-sent-*` show the Undo of an
Important post and the same toast once it went out.

## How it is made

TypeScript on the studio's starter stack: a **Hono** server that renders
**React** pages, with a few **islands** that also run in the browser (the
composer, comments, reactions, "I have read it"…), built by **Vite**; the
machinery (actions, islands, refresh, words, formats, the policy, logs, the
database) is the studio's package `@argentic/chest-app`, vendored in
`vendor/`. The pages carry no inline script and no inline style: the
strict policy the Chest gives a public part holds on every page. The text
editor (Tiptap) is a script of its own, fetched when the composer opens.
Measured with the studio's bench (`lab/measure`, 6 October 2026, Node
24.21, the same 15 pages; Next.js 16 in brackets): at rest 67 MiB PSS
(120), the first page 0.46 s after a cold start (0.82), an image of 28 MiB
(475). The build, limited to 512 MiB and one CPU, takes 5.1 s with a peak
of 272 MiB (41 s, peak 508 MiB, just under the limit); unlimited, 3.0 s
and 340 MiB PSS (17 s and 994 MiB). The Chest's contract gives a build
1.5 GiB; both fit it. "Download all posts" is written while it is sent:
with 160 MiB of files, the server's memory rose from 99 to 177 MiB RSS
(a measured run, the built server in its own process), one file of the
Chest at a time — the SDK's `files.get` answers a file whole, so the
largest attachment (25 MB) is what one export holds at once.

## Develop

```sh
npm ci
npm test          # types, the server built into dist/test, then node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the browser's files and the server (Vite), as the Chest does
npm start         # the built server (dist/server/main.js), as the Chest starts it
npm run dev       # rebuilds on every change and restarts the server
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/news --prod --reset
--port 4500` (a seven-person company's last month, from `seed/sample.sql`;
`npm run build` first),
`node lab/chest-dev/flows/news.mjs 4500` (browser flows),
`node lab/chest-dev/screens.mjs tools/private/news --port 4500`
(screenshots; run after the flows, which add the cover pictures — the seed
cannot hold files).

## What it does not do (yet)

Push notifications to a phone (the Chest's notifications only), an app; automatic
translation (the second language is written by hand: News has no
network); reading statistics per person (by design: counts only, see
"Works council"); **polls in a post**
(the store's Polls tool is separate: a post may link to a poll, but shows
no result card. It needs Polls to publish its result as an event between
tools — `polls.poll.closed` with the counts it already shows everyone —
and a way for News to create a poll in Polls, which events do not give:
left to the SDK report); videos are played as uploaded (no
thumbnail, no transcoding, 25 MB at most); pictures in the text and the
gallery have no captions beyond their name; a Slack import takes the
messages' words, not their files, reactions or thread replies, and
matches authors by their full name only; import from Workvivo or
Staffbase; search in attached files; a comment's own edit history; a
list inside a list (the text has one level); an admin page of every
publisher's scheduled posts (each publisher sees the ones they may see
on the front page); **posts from everyone without approval** (a
company setting to publish them at once: every proposal waits for a
publisher today), a proposal for some groups only (it is for everyone;
the publisher may narrow it after publishing), several pictures or a
video in a proposal, editing a proposal before it is published (the
publisher edits the post after); answering an event from the **bell
itself** (see "Needs from the SDK").
