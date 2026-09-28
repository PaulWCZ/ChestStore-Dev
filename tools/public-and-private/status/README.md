# Status — tell customers whether the service works

**Status** (French: *État des services*) replaces Atlassian Statuspage,
Instatus and Better Stack status pages for a small company that sells a
service online. Customers open one public page and see at a glance
whether everything works, what is being fixed, and what maintenance is
planned. The team posts incidents and their updates from the Chest, in a
minute, in plain words.

## What it does

- **The public page** (`/`), in the company's name (`chest.company()`):
  the overall state in one line and one colour — *All systems
  operational*, *Degraded performance*, *Partial outage*, *Major outage*,
  *Under maintenance* —; what is happening now, with each incident's
  timeline (Investigating → Identified → Monitoring → Resolved); the
  services, grouped (a group such as *Online shop* holds *Catalogue*,
  *Checkout*, *Payments*), each with its state now, a **90-day bar** (one
  tick a day, coloured by the day's worst state; pointing at a tick or
  focusing a day with an incident shows the day and its incidents) and
  its **uptime over 90 days**; the maintenance ahead; the past 7 days.
  A phone shows the last 30 days.
- **Accessible**: every state has an icon, a word and a colour (the
  Okabe–Ito colours, safe for colour-blind people — never colour alone);
  each bar has one sentence for screen readers and a table of the days
  with incidents; days with an incident are links, reachable with the
  keyboard.
- **Uptime** is computed from what the team posted, never measured: at
  each moment the worst state of a service counts — a major outage as
  down, a partial outage as half down; degraded performance and planned
  maintenance count as up. The page says so under the list. An incident
  entered afterwards counts from its own start, even before the service
  was added.
- **`/incidents/<id>`**: an incident's own page, to send to customers.
  **`/history`**: every incident and maintenance, month by month, three
  months a page.
- **Feeds**: `/feed.atom` and `/feed.rss` (incidents, with every update)
  and `/maintenance.ics` (planned maintenance, a calendar to subscribe
  to; cancelled windows are marked so).
- **Email updates** (Proposal *mail*): *Get updates* → an address and what
  to follow (everything, or some services) → a confirmation email
  (double opt-in: the link opens a page with a *Confirm* button, so a mail
  scanner opening the link confirms nothing) → an email for each update
  of an incident or maintenance that touches what they follow, in their
  language, with the incident's link and their own page's link (choose
  what to follow, *Unsubscribe*: the address is deleted). The form has a
  hidden field robots fill, a signed "shown at" time (refused if sent in
  under 2 seconds) and counters (5 an hour per visitor, 100 an hour for
  everyone — the Chest's `visitors.count`, else the tool's own). The
  answer is the same whether the address was known or not. Unconfirmed
  addresses are forgotten after 7 days. **Without mail on the Chest** the
  form disappears and `/subscribe` gives the RSS address instead.
- **Times**: written by the server in the Chest's time zone with its
  short name ("14:05 CEST"), readable without JavaScript, then rewritten
  in the visitor's own zone by the browser.
- **Fast**: every public page is rendered on the server, works without
  JavaScript, and may be kept 30 seconds by the browser
  (`Cache-Control: private, max-age=30`; see *What it does not do yet*).
- **For the team** (`/chest`):
  - **Now**: *Post an incident* first; the open incidents with *Add an
    update*; maintenance planned or under way; the page as customers see
    it; recently resolved.
  - **Post an incident** in one screen: what is wrong, which services and
    how badly (degraded / partial / major), where you are, what customers
    read. Ticked *It already happened*, it becomes a past incident with
    its start and end (**backfill**): it joins the history and the uptime,
    and nobody is notified. The title and text are kept as a draft until
    posted.
  - **An incident**: post an update (step, text, optionally the
    services' new states — otherwise they stay as they were);
    **Resolve** asks once, in a dialog that says which services go back to
    *Operational*, with last words to customers; posting a step after
    *Resolved* reopens it. Correct an update's text, or remove it (Undo):
    both are **logged** — who, when, the earlier text — because a status
    page is evidence (service credits). Rename; remove the whole incident
    (Undo, and editors still see it, marked).
  - **Plan maintenance**: what, start and end (the Chest's time zone,
    24-hour selects), services, text. It is shown *Planned*, then *In
    progress*, then *Completed* **by the clock** — no job needed for the
    page. *Finish now*, *Cancel*, change the window while it has not
    ended.
  - **Automatic posts** (Proposal *schedules*, on by default): the
    "updates" schedule runs **every 15 minutes** — the Chest's minimum —
    and writes "The maintenance has started" / "is complete" **dated at
    the window's edges**, then emails subscribers. So the page is exact
    to the minute and only the posts and emails can come up to 15 minutes
    late. An editor's visit to *Now* runs the same pass, so a Chest
    without schedules still gets them. A window started or ended more
    than a day before the pass is posted without email.
  - **Services**: add a service or a group, rename, describe, move up and
    down, hide from the page (its history stays), delete one that was
    never in an incident (otherwise: hide it). *Start with an example*
    makes four usual services in one click.
  - **Subscribers**: who, what they follow, whether email works on this
    Chest, emails still waiting; remove one on request.
  - **History**: every incident and maintenance, removed ones included.
  - **The team is told**: a new incident rings the bell of every editor,
    each in their language (`notifications.broadcast`, Proposal; on a
    Chest without it, the tool lists its editors and notifies each
    language's group); its resolution replaces that item; the tile's
    badge counts the open incidents.
- **Nothing is checked automatically.** The tool does not watch your
  website: a Chest tool has no outbound network and no background
  process. The team's *Now* page says so. See *Needs from the SDK*.

## Roles

| Role | May |
|---|---|
| `editor` | Everything: incidents, maintenance, services, subscribers |

Anyone who has the tool without a role sees a page that says so (the
public page is open to everyone anyway). The owner, admins and builders
enter as editors.

## First minute

- **What does a new editor see first?** *Now*. On an empty tool: "Add
  your services first" with *Start with an example* (Website, Online
  shop, Payments, Customer support) and *Add services*.
- **What do they do first?** Rename the examples, then — when something
  breaks — *Post an incident*.
- **How many clicks for the main job?** From *Now*: *Post an incident*,
  type the title, tick the service, (choose how bad), type two sentences,
  *Post the incident*. One screen, one button. Resolving: *Resolve*,
  *Resolve the incident*.
- **What happens on a mistake?** A wrong update: *Edit* or *Remove*
  (Undo); the log keeps the earlier text. A whole incident posted by
  mistake: *Remove this incident* (Undo). A wrong service: change it in
  the next update, or *Change the affected services*. A form refused says
  why in one line and keeps what was typed.
- **A customer?** Opens the page: one line says whether it works; one
  button, *Get updates*.

## Routes

| Route | What |
|---|---|
| `/` | The status page |
| `/incidents/<id>` | One incident or maintenance |
| `/history?page=N` | Past incidents by month |
| `/feed.atom`, `/feed.rss`, `/maintenance.ics` | Feeds |
| `/subscribe`, `/s/<token>`, `/unsubscribed` | Email updates: subscribe; a subscriber's own page (confirm, choose, unsubscribe) |
| `/lang/<code>` | The public part's language switch |
| `/chest`, `/chest/incidents/new`, `/chest/incidents/<id>`, `/chest/maintenance/new`, `/chest/components`, `/chest/subscribers`, `/chest/history` | The team's part |
| `/chest-events`, `/chest-jobs/updates` | Deliveries from the Chest (signed) |

## On a Chest

`chest.json`: roles `editor`; a public part; capabilities `database`,
`members`, `notifications`; `receives: ["member.*"]`.
`chest.proposals.json` (the studio's proposals, not yet accepted by a
Chest): `mail.send`, the `updates` schedule (`*/15 * * * *`), the tile's
French words.

Lifecycle: an editor who leaves or loses access changes nothing (their
posts stay; names read "(former member)"). An **erasure** writes `erased`
wherever the person is named — author of an incident or an update, who
corrected or removed one — and keeps the texts: they were published to
customers. Then the erasure is acknowledged.

Personal data kept: members' ids (authors); subscribers' address,
language and choices only. The public page never shows who posted.

## Needs from the SDK

| Proposal | Used for | Without it |
|---|---|---|
| `mail` | Confirmation and update emails | The form is hidden; the page offers the feeds |
| `schedules` | Automatic maintenance posts, sending queued emails | An editor's visit does it; the page switches on time anyway |
| `notifications.broadcast` | The bell of every editor in one call | The tool pages through its members and notifies each language's group |
| `visitors` | The form's signed time and the Chest's visitor counts | The tool's own counters (`form_counts`) |
| `chest` | Company name, time zone, language, public address | — (the SDK's defaults) |

What it would need next (in the final report of the studio):

- **Checks run by the Chest** — the job customers expect most: the
  manifest declares `"checks": [{"name": "website", "url":
  "https://atelier-martin.fr", "every": "5m", "expect": {"status": 200,
  "maxMs": 3000}}]` (each a permission: "Checks
  https://atelier-martin.fr every 5 minutes"); the Chest probes from
  outside the tool's container and posts results, signed, to
  `POST /chest-checks` (`{name, at, ok, status, ms, error}`), with a
  `checks.handle(request, handler)` in the SDK and `chest.check(name,
  result)` in `fakeChest`. The tool would then open an incident draft
  (or post one) after N failures, and show measured uptime.
- **Knowing whether mail works before sending**: `mail.available()`
  (or the granted proposals in the environment), so the form is hidden
  from the first visit on a Chest without mail — today the tool learns it
  from a failed send.
- **A shared cache per language**: Next.js replaces the `Vary` header of a
  page, so the public page cannot be kept by shared caches without
  mixing languages; either the Chest's front caches public pages keyed
  by the `lang` cookie and `Accept-Language`, or the SDK gives a way to
  mark a response "public, per language".

## Develop

```sh
npm ci
npm test                                   # PGlite; TEST_DATABASE_URL=postgres://… for PostgreSQL
npm run build
node ../../../lab/chest-dev/dev.mjs . --prod --reset --port 5800   # the harness, with the sample shop
```

`seed/sample.sql`: Atelier Martin's online shop — Website, Online shop
(Catalogue, Checkout, Payments), Delivery tracking, Customer support; six
incidents in 90 days (one 2-hour major payment outage), one maintenance
done, one incident being monitored now, a maintenance next Tuesday
evening, three subscribers.

## What it does not do yet

- No automatic checks (see above) and no heartbeat URL a system could
  call.
- Incident texts are written once, in the company's language; only the
  words around them follow each visitor.
- No Markdown: texts are plain, with paragraphs and links made from web
  addresses.
- No import from Statuspage (its components and incidents are only in
  its API) and no public JSON API yet.
- Public pages are kept 30 seconds by browsers only, not by shared caches
  (see *Needs from the SDK*). An editor's links to the public page always
  show it fresh.
- No post-mortem section; post it as a last update.
