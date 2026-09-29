# News — the company's front page, and who has read what matters

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. It replaces **Workvivo, Staffbase or
Simpplr** for a small company — and the all-staff email and the `#general`
channel where announcements drown.

## What it does

- **The front page**: the lead story large, then the others newest first,
  **pinned posts on top**; filters *Announcements, Events, Welcome, Info*;
  *Coming up* (the next events, with my answer); a **New** mark on what came
  since my last visit; 20 posts a page.
- **A post**: a headline and a text formatted as it will read — a toolbar
  (bold, italic, subheading, lists, numbered lists, quote, link, picture)
  and the usual shortcuts (Ctrl+B, Ctrl+I); nobody types marks. News keeps
  the text as plain text with a few marks (`lib/markdown.ts`, never HTML),
  which search, the bell and email read. A **cover picture**, **pictures
  inside the text**, a **gallery** of up to 20 pictures and videos (MP4,
  WebM up to 25 MB, played as they are) and up to 10 attached files.
- **Two languages**: a post may have its headline and text in English and
  in French; each reader sees theirs (the bell, the email, the calendar
  too), with a link to read the other one.
- **Important posts**: everyone it is for is told in the Chest's bell **and
  by email** (Proposal (studio): mail), in their own language — the
  headline, the whole text, the link to confirm — and asked to click **"I
  have read it"**. The button says what will happen: *Publish and tell 6
  people by bell and email*. For **10 seconds** after it, nothing has left:
  **Undo** (in the toast, or on the post) takes it back to the composer.
  The publisher sees *Read by 4 of 7*, who confirmed and when, who has not
  yet; reminds them (once a day at most, bell and email); downloads the
  list (CSV, with the version each person confirmed). Only the click
  counts: News never shows who opened a post (see "Works council").
- **Versions**: each change of a published post's words keeps the words
  it replaced (*1 earlier version*, for publishers). When an Important
  post's text changes, the publisher may **ask everyone to confirm again**:
  earlier confirmations stop counting (the list says who confirmed an
  earlier version) and everyone is told again.
- **Views, a number only**: for publishers, how many different people of
  a post's audience opened it (*Opened by 12 of the 40 people it is for*),
  shown from 5 people and counted every hour, next to *Read by* and how many
  were sent it by email — never who (see "Works council").
- **Events**: a day or several, time (or all day), place, and **places**
  if they are limited: past them, *Join the waiting list*; a place freed
  goes to the first waiting, who is told. **I'm coming / Not coming**
  until the end of the last day, with who is coming. Whoever comes finds
  the event **in their Chest calendar** (Proposal (studio): calendar — the
  one feed a member adds to Google, Outlook or Apple once); the `.ics`
  file stays.
- **Welcome posts**: pick the new colleague; their photo and name lead the
  post, and they are told in their bell that the team says hello.
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
  any group of the Chest (Sales, the workshop…, Proposal (studio): groups
  read), and people picked by name; the composer counts them (*6 people
  can see it*). A post kept to an audience is marked *For Sales and 2
  people* and seen by it, its author and the Chest's admins; **nobody
  else** sees it, its comments, reactions, files, calendar file or search
  results (a link to it answers "not found"). Only its audience is told,
  emailed, asked to confirm, reminded and counted (*Read by 1 of 2*); an
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
  headline with a typo is still found. The words found are marked; a
  comment found shows under its post, with its author, its mentions
  written as names. A mention is not a word of its comment: a member id,
  "mbr" or "erased" finds nothing (`migrations/0005_…`).
- **The weekly digest**: on Monday morning (08:30, the Chest's time zone),
  each person finds one item in their bell, in their language — *This
  week: 3 posts you haven't seen yet* and their headlines — only when there
  are some: posts of the last 7 days for them, not theirs, published after
  their last visit to the front page (an Important post they confirmed does
  not count). Next week's replaces it; opening the front page removes it.
  **By email too**, unless the person chooses *Stop the email* at the foot
  of the front page.
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
| `publisher` | Publisher | writes, edits, schedules, pins and deletes posts; marks a post Important and sees who confirmed; removes any comment |
| `reader` | Reader | reads, reacts, comments, confirms "I have read it", answers events |
| (none) | — | sees "You can't read News yet" |

The owner, the admins and the tool's builders come in with the first role,
`publisher`. A scheduled or deleted post does not exist for a reader (404).
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
  and the button says who will be told and how (*Publish and tell 6 people
  by bell and email*).
- **A mistake:** an Important post sent by mistake → *Undo* within 10
  seconds, nothing has left; a typo found later → edit it (the earlier
  version is kept; *Ask everyone to confirm again* if it matters); a
  deleted post or comment → *Undo* in the toast; a closed tab → the draft
  comes back ("Your draft is back", or *Start over*); an import from Slack
  → *Undo*; an event answer is changed by clicking the other button (or
  the same one again to take it back); a refused action puts the screen
  back and says why.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` (`?kind=`, `?page=`) | members with a role | the front page |
| `/chest/posts/<id>` | who sees the post | the article; for publishers of an Important post, who read it |
| `/chest/search` (`?q=`) | members with a role | search: the posts and comments they may see |
| `/chest/new` (`?kind=`), `/chest/posts/<id>/edit` | publishers | the composer |
| `/chest/posts/<id>/calendar` | who sees the event | the `.ics` file |
| `/chest/posts/<id>/confirmations` | publishers | who confirmed, as CSV |
| `/chest/api/uploads` | publishers | authorise (POST) then record (PUT) a picture, a video or a file |
| `/chest/transfer` | publishers | import a Slack channel; download all posts |
| `/chest/api/import` | publishers | a Slack export (POST, the ZIP): its channels, or (`?channel=`) one imported |
| `/chest/transfer/export` | publishers | every post they see, as a ZIP |
| `/chest/files/<id>` (`?size=256\|1024`, `?download`) | who sees the post (or its uploader, before saving) | a 15-minute link signed by the Chest |
| `/chest-events` | the Chest only (signed) | members' lifecycle; groups (`group.changed`, `group.removed`) |
| `/chest-jobs/publish`, `/chest-jobs/digest` | the Chest only (signed) | the "publish" and "digest" schedules (Proposal) |
| `/` | anyone | "News lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `files` (covers 15 MB — JPEG, PNG, GIF, WebP,
  the pictures the Chest makes thumbnails of — attachments 25 MB, uploaded
  from the browser to the Chest); `members` (names, photos, who has News);
  `notifications` (the bell, the tile's number); `receives: ["member.*"]`.
- **Groups** are the Chest's. With the **groups** permission (Proposal
  (studio): `"groups": "read"`, "Sees your Chest's groups and who is in
  them") News offers **every** group (`members.groups.all()`), and each
  member's `groups` are all of theirs — a company that opens News to
  everyone can still write for Sales. It receives `group.*`: someone who
  leaves a group (`member.updated`, `group.changed`) or a group removed
  (`group.removed`) takes the bell item of the Important posts they are no
  longer in the audience of away, and their number. Without the
  permission, only the groups that **give** News are offered (the Chest
  shows a tool no other group). A group the Chest no longer has stays on
  the posts it was on (read *a former group*).
- **Email** (Proposal (studio): `"mail": {"send": true}`, "Sends emails in
  your company's name"): one message per person, `to: {member}` — News
  never knows an address — in their language, keyed so a retry never sends
  twice; the Chest's default quota is 500 a day: past it, the rest of an
  Important post's audience is told in the bell only and the publisher
  sees *The Chest's email limit for the day stopped the rest*. On a Chest
  that cannot send email yet, nothing fails; News remembers it
  (`chest_state`) and the composer then says *Publish and tell 6 people in
  their bell*. (Until News has tried once, it assumes email works.)
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
  the time of their last visit to the front page (for the *New* marks and
  the digest). For **views** it keeps a number, never a name:
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
  which is the monitoring a CSE must be consulted on. It also records who
  was **sent** an Important post by email (a delivery, so it is never sent
  twice). A company of 50 or more should still inform its CSE before
  using confirmations and view counts; this paragraph is written so it can
  be handed to them.
- No WebSocket: the front page re-reads itself every 60 s, a post every
  30 s, while visible.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: the interface and
  the bell in each member's language.
- **Scheduled tasks** (`schedules`) — **Proposal (studio)**, in `vendor/`:
  `chest.proposals.json` declares `publish` every 15 minutes and `digest`
  on Monday at 08:30 (`app/chest-jobs/[name]/route.ts`). Without it News
  still works — the publish pass runs when someone opens the front page —
  but **there is no weekly digest** (a visit never sends one). The digest
  shares the Chest's 1,000 recipients an hour with Important posts (they
  go first): in a larger company it goes on with each publish pass, a page
  of 500 at a time, within the week; someone told twice gets the same item
  again (one key), never two.
- The Chest's **time zone** (`CHEST_TIMEZONE`, same proposal): event times
  and schedules are typed on the Chest's clock; Europe/Paris otherwise.
- **Localized manifest title** (studio report): the tile says "News" to a
  French member; the interface says *Actualités*.
- **Groups read** (`"groups": "read"`, `receives: ["group.*"]`),
  **mail** (`send`) and the **calendar** — Proposals (studio), in
  `vendor/` (SDK 0.3.0-studio.12), described above.
- Wanted, not built: **push to a phone** (the bell and email are all a
  Chest gives); a way to **ask whether email works** before sending (News
  learns it from its last try); a **per-member digest broadcast** and a
  **"notify at least once" quota exemption** so a large company is told
  at once; a **video thumbnail/transcoding** service (videos play as
  uploaded); a **polls** embed across tools.

## Looks

News wears **any look the company chooses in its Chest**: its own identity
"Newsprint" (newsprint paper, black rules, a headline serif, one press red
— the default), any theme of the store's catalogue (the 17 identities,
"Chest", "High contrast"), or the company's brand imported from its
guidelines — for all tools or for News alone, with the same features. The
look arrives with the page (one `<style>` with the page's nonce, no
script); in brand mode the company's logo stands beside the name, on the
members' pages and the public root. The newspaper's heavier weights are
steps above the theme's own (`app/tokens.css`), so a theme whose hierarchy
is size alone (the "Chest" theme) stays at one weight. Screens:
`docs/screens/*-chest-*`, `*-theme-*` (Workshop, Library), `*-brand-*` (the
sample brand); `important-undo-*` and `important-sent-*` show the Undo of an
Important post and the same toast once it went out.

## Develop

```sh
npm ci
npm test          # node:test; PGlite, or TEST_DATABASE_URL for a real PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs tools/private/news --prod --reset
--port 4500` (a seven-person company's last month, from `seed/sample.sql`),
`node lab/chest-dev/flows/news.mjs 4500` (browser flows),
`node lab/chest-dev/screens.mjs tools/private/news --port 4500`
(screenshots; run after the flows, which add the cover pictures — the seed
cannot hold files).

## What it does not do (yet)

Push notifications to a phone (the bell and email only), an app; automatic
translation (the second language is written by hand: News has no
network); reading statistics per person (by design: counts only, see
"Works council"); a digest more often than weekly; **polls in a post**
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
on the front page).
