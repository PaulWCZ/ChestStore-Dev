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
- **A post**: a headline, a text with simple formatting (paragraphs,
  subheadings, **bold**, *italic*, lists, quotes, links — typed as in an
  email, with a toolbar and a preview; never HTML), a **cover picture**
  (shown as the Chest's 1024 px thumbnail) and up to 10 attached files.
- **Important posts**: everyone who has News is told in the Chest's bell, in
  their own language, and asked to click **"I have read it"**. The
  publisher sees *Read by 4 of 7*, who confirmed and when, who has not yet;
  reminds them (once a day at most); downloads the list (CSV). Only the
  click counts: News never records who opened a post (see "On a Chest").
- **Events**: day, time (or all day), place; **I'm coming / Not coming**
  until the end of the day, with who is coming; **Add to my calendar**
  (an `.ics` file).
- **Welcome posts**: pick the new colleague; their photo and name lead the
  post, and they are told in their bell that the team says hello.
- **Reactions** (👍 ❤️ 🎉 👏 😄) and flat **comments**; the author of a post
  is told of new comments.
- **Scheduled posts**: pick a day and time; until then only publishers see
  it (*Scheduled*, on the side of the front page).
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

## First minute

- **What a new user sees:** the front page with today's date and the lead
  story. If an Important post waits for them, a yellow strip says so first:
  *One post asks you to confirm you have read it* — **Read it**. On an empty
  Chest, a publisher sees *Nothing published yet* and **Write the first
  post**.
- **The first thing they do:** a reader opens the strip's post and clicks
  **I have read it**; a publisher clicks **Write a post**, keeps
  *Announcement*, types a headline and a text, **Publish**.
- **Clicks for the main job:** confirming an Important post is 2 clicks from
  the front page; answering an event is 2; publishing is 1 after typing.
- **A mistake:** a deleted post or comment → *Undo* in the toast; a closed
  tab → the draft comes back ("Your draft is back", or *Start over*); an
  event answer is changed by clicking the other button (or the same one
  again to take it back); a refused action puts the screen back and says why.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` (`?kind=`, `?page=`) | members with a role | the front page |
| `/chest/posts/<id>` | who sees the post | the article; for publishers of an Important post, who read it |
| `/chest/new` (`?kind=`), `/chest/posts/<id>/edit` | publishers | the composer |
| `/chest/posts/<id>/calendar` | who sees the event | the `.ics` file |
| `/chest/posts/<id>/confirmations` | publishers | who confirmed, as CSV |
| `/chest/api/uploads` | publishers | authorise (POST) then record (PUT) a picture or a file |
| `/chest/files/<id>` (`?size=256\|1024`, `?download`) | who sees the post (or its uploader, before saving) | a 15-minute link signed by the Chest |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/chest-jobs/publish` | the Chest only (signed) | the "publish" schedule (Proposal) |
| `/` | anyone | "News lives in your Chest" |

## On a Chest

- `capabilities`: `database`; `files` (covers 15 MB — JPEG, PNG, GIF, WebP,
  the pictures the Chest makes thumbnails of — attachments 25 MB, uploaded
  from the browser to the Chest); `members` (names, photos, who has News);
  `notifications` (the bell, the tile's number); `receives: ["member.*"]`.
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
  Important post's confirmations — an explicit click — and one "last visit"
  time per person (for the *New* marks, never shown to anyone). It never
  records who opened which post. A company of 50 or more should still
  inform its CSE before using confirmations; this paragraph is written so
  it can be handed to them.
- No WebSocket: the front page re-reads itself every 60 s, a post every
  30 s, while visible.

## Needs from the SDK

- `member.locale` — **Proposal (studio)**, in `vendor/`: the interface and
  the bell in each member's language.
- **Scheduled tasks** (`schedules`) — **Proposal (studio)**, in `vendor/`:
  `chest.proposals.json` declares `publish` every 15 minutes
  (`app/chest-jobs/[name]/route.ts`). Without it News still works: the same
  pass runs when someone opens the front page.
- The Chest's **time zone** (`CHEST_TIMEZONE`, same proposal): event times
  and schedules are typed on the Chest's clock; Europe/Paris otherwise.
- **Localized manifest title** (studio report): the tile says "News" to a
  French member; the interface says *Actualités*.
- Wanted, not built: **email** for Important posts (the bell reaches only
  people who open their Chest) and a **"notify at least once" quota
  exemption or a bulk notification** so a large company is told at once.

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

Email or push notifications (only the Chest's bell), audience targeting
(a post for one team), @mentions, polls in a post, multi-day events, a
weekly digest, reading statistics beyond confirmations, import from a
Slack channel export, search, editing a comment's history, video.
