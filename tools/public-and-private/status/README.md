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
- **Uptime** is computed from what the team posted, by **Atlassian
  Statuspage's documented rule** (so a company moving from it keeps its
  figures): at each moment the worst state of a service counts — a major
  outage in full, a partial outage for 30 %; degraded performance and
  planned maintenance not at all ("Display historical uptime of
  components", support.atlassian.com, read through a web search on
  2026-09-29). Slower days are said beside the figure ("100.00% uptime ·
  1 day slower than usual"), so the percentage never stands alone next to
  yellow ticks. The page says the rule under the list. **A service younger
  than the bar has no history before it existed**: those days are drawn
  empty ("No data"), and its figure reads "100.00% since 29 September" —
  never "90 days, 100 %" for a service added a minute ago (screen readers
  hear the same). An incident entered afterwards counts from its own
  start, even before the service was added.
- **Before any service is listed** the page says only "This status page is
  being set up" — never "All systems operational" about nothing (the API
  and the badge say the same).
- **Two languages**: an incident is written in its editor's language, not
  the Chest's — the form's **Written in** is set to the editor's own
  language (a French editor on an English Chest writes French, and her
  text is served, marked and mailed as French) and can be changed. The
  editor may tick "Also write it in English" (the other language) and give
  each title and text a second version. Visitors, feeds and subscribers' emails get the version
  in their language when there is one; otherwise the first, marked with
  its language (`lang`) so screen readers read it right. Automatic
  maintenance posts are written in both. **Services too**: a name and a
  description in the language they were written in (*Written in*, the
  editor's own by default) and, behind "Also in English" (or French), a
  second version — the public page, the subscribe form, emails, chat
  updates and the team's pages name each service in the reader's
  language. *Start with an example* makes the usual services in both
  languages. **The team's pages** (*Now*, *History*) show an incident's
  title in the member's language when it has one.
- **Post-mortem**: once resolved, an incident gets an optional "What
  happened and what we changed" section, shown under its timeline on the
  public page (and linked from the history). Corrections are logged like
  any update; nobody is emailed.
- **Public pages wear the company's brand or Status's own look** (kit
  0.2.3, `resolveTheme(…, { surface: "public" })` in `lib/theme.ts`): a
  catalogue theme the company chose for its team's tools (for all of
  them, or for Status) dresses only the team's pages — customers never see
  "Confetti" because the team likes it.
- **Looks** (Proposal `chest.theme()`, the UI kit `@argentic/chest-ui`):
  the tool wears any look the company chooses in its Chest — its own
  identity ("Control room"), any theme of the catalogue ("Chest", "High
  contrast", the other tools' identities), or the company's brand
  (colours, fonts, corners, logo) — for all its tools or for Status
  alone, with the same features. The team's pages and the public pages
  wear the same look, resolved once per request on the server (one
  `<style>` with the page's nonce, no script); in brand mode the company's
  logo stands where the mark or the monogram is. **The five state colours
  never change**: they are meaning (Okabe–Ito, each with its shape and
  its word), fixed in every look and measured against every theme's
  grounds (`lib/states.ts`, `test/states.test.ts`). The badge's label and
  the banner's focus ring take the brand's colour when it reads safely.
  *Settings* adds the company's website ("Back to atelier-martin.fr") and
  where customers reach support.
- **On other sites** (*Settings*): a **badge** (`/badge.svg`, a plain SVG:
  no script, no link, `?lang=`), a **banner** for the company's own site
  or app (`/embed`, one line in a frame, no script; only the sites the
  editors list may frame it — they are its `frame-ancestors`), and a
  **JSON API in Statuspage's shape** (below).
- **Public JSON API** (`/api/v2/…`): `summary.json`, `status.json`,
  `components.json`, `incidents.json`, `incidents/unresolved.json`,
  `scheduled-maintenances.json` and its `upcoming.json` / `active.json` —
  the paths and fields of Atlassian Statuspage's public status API
  (`page`, `status.indicator` / `description`, components with
  `group_id` and groups listing their `components`, incidents with
  `impact`, `shortlink`, `incident_updates` and their
  `affected_components`, maintenance with `scheduled_for` /
  `scheduled_until`), so dashboards, Slack apps and widgets written for
  Statuspage read it unchanged. The indicator and each incident's impact
  follow Statuspage's documented rule ("Top-level status and incident
  impact calculations"). Readable from any site (CORS `*`, GET only),
  kept 30 seconds by caches. Resolved incidents also carry
  `postmortem_body` / `postmortem_published_at`. Never: hidden services,
  services for the team only, removed incidents, members.
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
  **Which emails are transactional** (SDK studio.15: the Chest applies a
  member's email choice — all, one a day, none — to every recipient who
  is a member, unless the message is `transactional`): subscribers are
  mostly customers, outside addresses the preference never touches; it
  matters when an employee subscribes with their own work address. Decided
  per email: the **confirmation link** (and "you are already subscribed",
  with the link of their page) is transactional — it answers what the
  person just asked for in the form, and without it nothing works. **Each
  update's email** is not: it is a notice like any other, so a member who
  chose "none" gets none and one who chose "one a day" finds it in the
  Chest's daily email (the page, the feeds and the team's inbox still
  say it at once). There is **no unsubscribe confirmation email**:
  *Unsubscribe* is a page, which says it is done, and the address is
  deleted at once — writing to an address one has just been asked to
  forget would be the wrong way round. Each key names its recipient's
  address (`update:<update>:<subscriber>:<address>`, sent whole, hashed by
  the SDK when long), so a subscriber's id reused after a restored
  database can never collide with another address's key.
- **Updates in a chat** (Proposal *webhooks*): under the email form, "Or
  in Slack, Teams or your own tool" → where (Slack, Microsoft Teams, a web
  address that receives JSON), the channel's webhook address (where to
  find it is one fold away), what to follow → *Connect*. The Chest checks
  the address before anything is kept (https, public, the provider's
  shape; a web address must answer a signed ping — the proof someone set
  it up), keeps it encrypted and delivers: each update of an incident or
  maintenance the subscription follows, in its language — for Slack and
  Teams a few lines (company, step, title, text, services, time, link);
  for a web address JSON (`page`, `incident`, `update`, `components`)
  signed with a secret key shown once. The subscription's own page
  (`/w/<secret>`, shown once, like a password): where updates go, what it
  follows, *Stopped: the address kept failing (http_410)* with *Try
  again* once the Chest stopped it, *Stop the updates* (the Chest forgets
  the address). Same rules as email: never a backfill, never about
  services for the team only; the same form guard (hidden field, signed
  time, 5 an hour per visitor). On a Chest without webhooks the link
  disappears. Editors see these subscriptions on *Subscribers* (the
  address without its secret part, language, what they follow, stopped
  or not) and remove one on request.
- **Times**: written by the server in the Chest's time zone with its
  short name ("14:05 CEST"), readable without JavaScript, then rewritten
  in the visitor's own zone by the browser.
- **Fast**: every public page is rendered on the server, works without
  JavaScript, and may be kept 30 seconds by the browser
  (`Cache-Control: private, max-age=30`; see *What it does not do yet*).
- **For the team** (`/chest`):
  - **Now**: *Post an incident* first; the open incidents with *Add an
    update*; maintenance planned or under way; services a check says are
    down, with *Open an incident*; the page as customers see it;
    recently resolved.
  - **Post an incident** in one screen: what is wrong, which services and
    how badly (degraded / partial / major), where you are, what customers
    read. Ticked *It already happened*, it becomes a past incident with
    its start and end (**backfill**): it joins the history and the uptime,
    and nobody is notified. The title and text are kept as a draft until
    posted. **Templates**: "Start from a template" fills title, text,
    services and impacts (and the second language); "Save as a template"
    keeps what was typed. A field left empty says so beside it, in the
    tool's words.
  - **An incident**: post an update (step, text, optionally the
    services' new states — otherwise they stay as they were);
    **Resolve** asks once, in a dialog that says which services go back to
    *Operational*, with last words to customers. Once resolved, the update
    form is gone: **Reopen** opens a dialog that says customers see it
    again and subscribers are emailed, and only its confirmation reopens
    (the server refuses any other step on a resolved incident). Correct an update's text, or remove it (Undo):
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
  - **Checks**: see *Automatic checks* above.
  - **Services**: add a service or a group, *Edit* (rename, describe,
    group); the rarer actions in a "···" menu with words — move up and
    down, hide from the page (its history stays), **for the team only**,
    delete one that was never in an incident (otherwise: hide it). *Start
    with an example* makes four usual services in one click, named in both
    languages. Each service has *Written in* and "Also in English" (or
    French): its name and description in the other language.
  - **Services for the team only** (the office network, the back office):
    shown on the members' status page, never on the public page; an
    incident touching only such services never reaches the public page,
    its feeds, its API, its history or its subscribers.
  - **The team's status page**: a member without a role opens the tool and
    sees what works now — every service, those for the team only
    included, what is happening and the maintenance ahead. Read only.
  - **Settings**: website and support links; badge, banner (and the sites
    allowed to frame it) and the API address, each with *Copy*;
    templates; **import from Statuspage**; **download everything**.
  - **Import from Statuspage**: the files of a Statuspage page's public
    API (`incidents.json`, `components.json`, `scheduled-maintenances.json`
    — several at once) or its manage API. Components are matched by name
    (created with their groups when missing); resolved incidents come with
    every update, the services each touched and how badly
    (`affected_components`, else the incident's impact), and the
    post-mortem; completed maintenance with its window. Open incidents and
    maintenance ahead are left out (said so). Each keeps its Statuspage
    id: the same file twice adds nothing. Nobody is notified. Tested with
    files in the documented shape (`test/fixtures/`).
  - **Download everything**: one JSON file (services, every incident with
    removed updates and the log, templates, settings; members as ids),
    and the subscribers as a CSV (formula-safe).
  - **Heartbeats** (on *Checks*): a job of the company (a nightly backup)
    calls a secret address after each run (`curl -fsS …`, shown once;
    only its hash is kept). Silent past its deadline (every 15 minutes to
    once a week, plus 5 minutes), the editors are told — bell, and *Now*
    proposes an incident — up to 15 minutes late (the "updates" pass).
    Nothing is posted publicly by itself.
  - **Subscribers**: who, what they follow, whether email works on this
    Chest, emails still waiting; remove one on request.
  - **History**: every incident and maintenance, removed ones included.
  - **The other tools are told** (Proposal *events between tools*): see
    *With the other tools*.
  - **The team is told**: a new incident rings the bell of every editor,
    each in their language (`notifications.broadcast`, Proposal; on a
    Chest without it, the tool lists its editors and notifies each
    language's group); its resolution replaces that item; the tile's
    badge counts the open incidents.
- **Automatic checks** (Proposal *checks*): on *Checks*, an editor gives a
  service a web address (https), how often (1 to 60 minutes), the answer
  expected (HTTP status) and when it is too slow. Saving hands the whole
  list to the Chest, which opens the addresses **from outside** (the tool
  has no network) and posts each result, signed, to `/chest-checks`.
  Results are kept once (by id), 90 days (purged by the `updates`
  schedule). After **three failures in a row** every editor's bell says
  "Website is not answering" with the reason, and *Now* shows it with
  **Open an incident**, prefilled (the service at *Major outage*, a title
  and words to start from). **Nothing is ever posted publicly by itself**:
  a person checks and decides. When the address answers again, the bell
  says so once (the same item, replaced). The public page shows, under a
  watched service's bar, the **measured** uptime (share of checks answered
  in time, since the first result in 90 days) beside the **declared** one
  computed from incidents — each labelled, and explained under the list.
  **The measured figure appears only once it means something: at least a
  full day of checks (the first result 24 hours old) and at least 24 of
  them** (`measuredSample` in `lib/checks.ts`). Before that the page says
  "Automatic checks since 29 September: the measured uptime appears after
  a full day of checks" — one failed check out of four is never shown to
  customers as "25 %".
  On a Chest that cannot run checks, the page says so plainly, the
  addresses stay saved, and everything else works as before.

## With the other tools

Status **publishes `status.incident`** (version 1; `chest.proposals.json`
`"emits"`; a receiving tool declares it, and an administrator links the
two in the Chest). **Support receives it** (its README, "With the other
tools"): while an incident is open, its inbox and tickets say "Incident in
progress: Payments unavailable" with the public page, and its saved
replies start with one that tells the customer, with the link; both go
once it is resolved or removed.

Sent when an incident customers can see is posted (`opened`), gets an
update or a correction (`updated`; `opened` again when reopened or
restored), is resolved (`resolved`), or removed (`removed`) — never for a
maintenance, a backfilled incident (already over) or one only about
services for the team. Published after the incident is saved; if the
Chest cannot take it, the incident is kept all the same (the next change
brings receivers up to date). The same news twice is one event (the key
is a digest of it).

```jsonc
{
  "v": 1,
  "action": "opened",                        // opened | updated | resolved | removed
  "incident": {
    "id": "42",
    "title": "Paiements en échec",           // as written, in `language`
    "language": "fr",
    "titles": { "fr": "Paiements en échec", "en": "Payments failing" },
    "status": "investigating",               // investigating | identified | monitoring | resolved
    "impact": "major",                       // the worst now: degraded | partial | major; operational once resolved
    "started_at": "2026-09-29T14:00:00.000Z",
    "resolved_at": null,
    "url": "https://status.atelier-martin.fr/incidents/42",   // its public page, or null
    "services": [{ "id": "3", "names": { "fr": "Paiement", "en": "Payments" }, "state": "major" }]
  },
  "update": { "id": "311", "status": "investigating", "at": "2026-09-29T14:00:00.000Z" }
}
```

No member, no text of the updates (the public page has them). Events may
arrive out of order: a receiver orders them by the Chest's `occurredAt`.
Version 1; a later version adds fields, never changes one.

## Roles

| Role | May |
|---|---|
| `editor` | Everything: incidents, maintenance, services, subscribers |

Anyone who has the tool without a role sees the team's status page, read
only (services for the team only included). The owner, admins and builders
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
| `/api/v2/summary.json`, `status.json`, `components.json`, `incidents.json`, `incidents/unresolved.json`, `scheduled-maintenances.json`, `scheduled-maintenances/upcoming.json`, `scheduled-maintenances/active.json` | The public API, in Statuspage's shape (CORS) |
| `/badge.svg`, `/embed` | The badge; the banner for a frame |
| `/heartbeat/<secret>` | A job's call (GET or POST) |
| `/incidents/<id>` | One incident or maintenance |
| `/history?page=N` | Past incidents by month |
| `/feed.atom`, `/feed.rss`, `/maintenance.ics` | Feeds |
| `/subscribe`, `/s/<token>`, `/unsubscribed` | Email updates: subscribe; a subscriber's own page (confirm, choose, unsubscribe) |
| `/subscribe/chat`, `/w/<token>` | Updates in Slack, Teams or at a web address: connect; the subscription's own page (choose, try again, stop) |
| `/lang/<code>` | The public part's language switch |
| `/chest`, `/chest/incidents/new`, `/chest/incidents/<id>`, `/chest/maintenance/new`, `/chest/components`, `/chest/checks`, `/chest/subscribers`, `/chest/history`, `/chest/settings` | The team's part |
| `/chest/import` (POST), `/chest/export`, `/chest/export/subscribers.csv` | Import from Statuspage; download everything |
| `/chest-events`, `/chest-jobs/updates`, `/chest-checks`, `/chest-webhooks` | Deliveries from the Chest (signed): member events, the schedule, check results, a chat address the Chest stopped |

## On a Chest

`chest.json`: roles `editor`; a public part; capabilities `database`,
`members`, `notifications`; `receives: ["member.*"]`.
`chest.proposals.json` (the studio's proposals, not yet accepted by a
Chest): `checks` (`{"max": 10}`), `mail.send`, the `updates` schedule
(`*/15 * * * *`), `emits: ["status.incident"]`, `webhooks` (`{"max":
200}`), the tile's French words.

Lifecycle: an editor who leaves or loses access changes nothing (their
posts stay; names read "(former member)"). An **erasure** writes `erased`
wherever the person is named — author of an incident or an update, who
corrected or removed one — and keeps the texts: they were published to
customers. Then the erasure is acknowledged.

Personal data kept: members' ids (authors); subscribers' address,
language and choices only; chat subscriptions' target id, the address as
the Chest shows it (without its secret part), language and choices. The
public page never shows who posted.

## Needs from the SDK

| Proposal | Used for | Without it |
|---|---|---|
| `mail` | Confirmation and update emails | The form is hidden; the page offers the feeds |
| `schedules` | Automatic maintenance posts, sending queued emails | An editor's visit does it; the page switches on time anyway |
| `notifications.broadcast` | The bell of every editor in one call | The tool pages through its members and notifies each language's group |
| `visitors` | The form's signed time and the Chest's visitor counts | The tool's own counters (`form_counts`) |
| `checks` | The Chest opens the services' addresses and posts results; measured uptime; alerts | The *Checks* page says the Chest cannot run them yet; incidents are posted by hand as before |
| `webhooks` | Updates delivered to Slack, Teams and web addresses (SDK report §4.17) | "Or in Slack, Teams…" disappears after the first refusal (tried again after a day) |
| events between tools | `status.incident` to Support | Support shows no incident; nothing else changes |
| `chest` | Company name, time zone, language, public address; `theme()` for the look the company chose (a catalogue theme or its brand) | — (the SDK's defaults; the tool's own look) |

What it would need next (in the final report of the studio):

- **Custom domains** (`status.your-company.com`): a platform item, SDK
  report §4.15 — the Chest maps the hostname and its certificate, and
  `chest.publicUrl()` already carries the address, so no tool change.
  Until then the page lives at the Chest's own address; *Settings* says so.
- **`webhooks.available()`** (or the granted proposals in the
  environment): the tool learns that the Chest has no webhooks from a
  refused `add`, so the "Or in Slack, Teams…" link shows once on such a
  Chest.
- **A label the owner reads, per webhook target, without personal data**:
  a public subscriber has no name; the tool labels it "Status subscriber
  (slack) 3f9a1c" (a digest of the address).
- **Independence**: the page shares its Chest's fate — if the Chest's
  server is down, so is the status page. The Chest could publish the
  public pages as static files to a second origin on every change.
- **Certificate expiry and keyword checks** from `checks` (a
  `certExpiresAt` in each result).
- **`mail.available()`** (see below).

- **Checks** are now a proposal (`checks`, above). Next wishes: a
  heartbeat URL a job could call (silence = down), checks of a keyword in
  the page, and the Chest's own history of results so a new tool starts
  with data.
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

- **No address of its own** (`status.your-company.com`): the Chest must
  offer custom domains (SDK report §4.15). A company whose customers link
  to its Statuspage address cannot move without changing those links.
- **Customers are reached by email** (on a Chest that runs `mail`) **or in
  Slack, Teams or at a web address** (on a Chest that runs `webhooks`);
  otherwise the page offers RSS/Atom. No SMS. A chat subscription follows
  services, not groups of them, and is never confirmed by a person (the
  Chest's check of the address is the proof).
- **The public API has one name per service** (the first language):
  Statuspage's shape has no languages.
- **Settings save with a button per box**, unlike Forms' autosave.
- **A service's state changes only with an incident**: there is no
  one-click "Degraded" switch as in Statuspage (Services says so: post an
  incident to show it).
- **Shares its Chest's fate**: when the Chest's server is down, the page
  is down too — a hosted status page runs elsewhere. Say so to customers
  whose product runs on the same server.
- Checks look at an address's status and speed only (no keyword, no
  login, no certificate expiry); the 90-day ticks stay those of the
  incidents posted — measured uptime is a separate figure. No on-call
  rota or escalation (out of scope: Better Stack's monitoring side).
- Two languages only (English and French): a third needs its catalogue
  and a choice of the second language per incident.

- Undoing a deleted service puts it back in its place, but not its
  automatic check nor the subscribers who followed only it.
- No audience-specific pages (one per big client) and no password on the
  public page; the team's own page is the members' view in the Chest.
- Imports from Statuspage only (not Instatus or Better Stack); subscribers
  are not imported (they must confirm again: GDPR).
- No Markdown: texts are plain, with paragraphs and links made from web
  addresses.
- Public pages are kept 30 seconds by browsers only, not by shared caches
  (see *Needs from the SDK*). An editor's links to the public page always
  show it fresh.
