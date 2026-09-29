# The store as a whole — severe critique, round 2

Critic run: 2026-09-29.

**What I used and how.**
- **Screens of all 18 tools.** Every `tools/*/*/docs/screens/*.png` for the tools' own looks and the `-chest`, `-theme` and `-brand` screens, desktop and phone, light and dark. I read them as one contact sheet per tool: `critique2/rest/sheets/<tool>.png` (script `rest/sheet.py`).
- **Every README.** Each tool's "What it does not do (yet)", and each tool's `chest.proposals.json`.
- **Code checks by grep across the 18 tools:** native date and time inputs, `window.confirm`, PeoplePicker and DateField use, search, kit version.
- **Hands-on use** of Rooms, Hiring and Status (see their files).
- **The harness Look panel on 4 tools:**
  - Rooms: Chest; brand in dark; High contrast dark on a phone; Confetti dark; Newsprint for this tool only;
  - Hiring: Chest; brand in dark; Confetti dark on a phone; High contrast dark; brand for this tool only;
  - Status: Chest; brand in dark; Confetti for this tool only; High contrast dark on a phone; Seaside dark;
  - Leave: Seaside, its own look; Confetti; High contrast dark; brand; Chest in dark; Workshop for this tool only. Contrast was measured on the balance tiles.

I switched the looks with the panel's own form (`POST /_dev/theme`), at both levels ("all tools" and "this tool").

**What is hands-on and what is not.** Only Rooms, Hiring and Status verdicts are hands-on. For the other 15 tools, the judgements below come from screenshots, READMEs and code, and say so. Their own critics' round-2 files were not written yet when I wrote this.

## 1. The pitch test, today

"Cancel your SaaS subscriptions… you will not miss anything." Below: the subscriptions a 50-person French SME typically pays for, as in round 1. No price is added here; prices stay those already sourced in `reports/01-ranking.md`.

**The column that matters most is the last one.** Most round-2 gains stand on SDK proposals: `mail`, `calendar`, `groups`, `schedules`, events between tools, `theme`, `checks`, public uploads, `visitors`. They are built in `sdk/` with fakes and run in the harness. **None runs on a real Chest yet** (`dev.mjs` keeps them in `chest.proposals.json` "which a Chest does not accept yet"). Every one of the 18 tools declares `schedules`, and 9 declare `mail`.

| SaaS paid today | Store tool | Round 1 | Cancel tomorrow, round 2 | What still stops it | Needs proposals to be true |
|---|---|---|---|---|---|
| Trello / Asana / Monday | Tasks | Trello mostly; Asana partly | **Trello: yes. Asana/Monday: partly** | No timeline, dependencies or automations; subtasks are checklist steps; email needs `mail` (README) | mail, schedules (reminders, repeats) |
| Notion (docs) / Confluence | Wiki | Partly | **Partly** | No live co-editing, no per-page restrictions, no @mentions in page text. Confluence and Notion imports exist | schedules |
| Lucca / Factorial time off | Leave | Yes for most | **Yes for most SMEs** (screens) | No email and no calendar feed for approvers; no blackout or minimum-staffing rules; payroll export only | calendar, mail to reach approvers outside the tab |
| Workvivo / Staffbase | News | Yes | **Yes** (screens) | Important posts reach only the bell and email, and email needs `mail`; no push | mail, groups (audiences), calendar (events) |
| BambooHR / Factorial HR | People | Partly | **Partly → close** (screens) | It now has HR records, contracts and the *registre unique du personnel* (screen "Dossiers RH"). No e-signature, no payroll | events (Leave → away badge) |
| HubSpot / Pipedrive | Clients | Partly | **Partly** | Emails not captured (no BCC or sync), one pipeline, no report builder | mail |
| N2F / Expensify / Spendesk | Expenses | Partly | **Partly** | No card or bank feeds, no advances, no search | — |
| Zendesk / Freshdesk / Crisp | Support | No | **Not yet** | Email in and out is built and runs only in the harness (README); no live chat, no help centre | mail send + receive, custom domain |
| deskbird / Robin | Rooms | Partly | **Desks: nearly. Rooms: not yet** (hands-on) | No two-way Google/Outlook room sync; future bookings not imported | calendar, groups, schedules |
| Harvest / Toggl / Clockify | Timesheets | Toggl yes, Harvest partly | **Toggl: yes. Harvest: partly** | Doesn't write invoices; no integrations | — |
| Calendly / Cal.com | Booking | No | **Partly** | It now reads the host's calendar through a declared iCal `network` (a real capability), with up to 15 min lag. No collective meetings, no payments; embedding waits for the Chest's frame policy; confirmations need `mail` | mail, schedules, custom domain |
| WTTJ / Teamtailor | Hiring | No | **WTTJ: no. Teamtailor: not yet** (hands-on) | No self-scheduling, no attachments; the CV upload and every email need proposals | public uploads, mail, calendar, schedules, custom domain |
| Snipe-IT / spreadsheets | Equipment | Yes | **Yes** (screens) | — | schedules (reminders) |
| Doodle / Officevibe | Polls | Doodle yes | **Doodle (internal): yes. Officevibe: partly** | No outside guests, no per-team heat map, no import | mail |
| Lattice goals / Perdoo | Goals | Yes for OKRs | **Yes for team OKRs** | No reviews (on purpose) | schedules, mail |
| Sellsy / Axonaut invoicing | Quotes | Partly | **Partly** | Factur-X (EN 16931) is now generated, but not sent to an approved platform (PA); no online acceptance or payment; no import of open invoices | mail; a PA connector (not designed) |
| Statuspage / Instatus | Status | Not yet | **Not yet** (hands-on) | No custom domain, email only, shares the Chest's fate | custom domain, mail, checks, schedules |
| Typeform / Tally / Google Forms | Forms | Not judged | **Partly** (screens) | No email alerts without `mail`; no embedding until frames are allowed; no payments or quizzes | mail, public uploads, custom domain |

**Honest count, today on paper:**
- **7 categories replaceable** for the daily job: Trello-level tasks, Leave, News, Equipment, internal date polls, team OKRs, Toggl-level time. Round 1 had about 6.
- **9 partly:** Wiki, People, CRM, Expenses, Rooms, Booking, Quotes, Forms, Asana-level tasks.
- **2 not yet:** Support and Status. Hiring counts as "not yet" against Teamtailor and "no" against WTTJ.

**Honest count on a real Chest today** (no proposals running): the same 7 hold, with the bell as the only way to reach people. Every public-facing tool (Support, Booking, Hiring, Status, Forms) loses its emails, and Hiring loses its CV upload. Those five are not sellable to a customer until `mail`, public uploads and custom domains ship.

**Missing categories.** Round 1's table still stands: office suite, email and calendar, chat, video, drive, co-editing, password manager, e-signature, accounting, payroll, banking, newsletters. No store tool was added for them, and none of the platform primitives they need (realtime, push, WebDAV, key wrapping) is built. The biggest per-seat line of a French SME, Google Workspace or Microsoft 365 plus Slack or Teams, stays.

## 2. Coherence: do the 18 tools behave and word things the same now?

Round 1 listed 15 differences. The kit (0.2.2, vendored in all 18) and the word lint (0 findings everywhere) fixed most of the wording and the controls. What remains:

| Point | Round 1 | Now | Evidence |
|---|---|---|---|
| Navigation | 5 patterns; phones icon-only or hidden | **Mostly one pattern.** Top tabs with icon and word on desktop; on phones a labelled tab row under the header in 16 of 18 | Sheets. Exceptions: **News and Polls** have no nav (one page plus search), which is acceptable. **Wiki's phone header shows only the tool's mark, no name** (page-*-phone). **Labels break mid-word** on phones: CRM "Companie\|s", "Entrepris\|es"; Booking "Types de / rendez-vous" wraps. CRM and Quotes keep a "··· More". |
| Main action | 6 placements | **Mostly top-right on desktop, full-width at the top on phones** | Exceptions: **Status phone puts "Plan maintenance" above "Post an incident"**; **Equipment phone (FR) puts the main button below three icon-only buttons**; Tasks "New board" is still a tile; Leave uses a hero card (fine). |
| Undo vs Cancel | "Annuler" twice | **Fixed** | Lint `undo` 0 in 18 tools. Seen "Annuler l'action" (Rooms) and "Action annulée." (Polls). |
| Remove / Delete / Erase | Mixed | **Fixed in words** | Lint `verb` 0. Seen "Retirer la date" (Tasks), "Supprimer cet étage" (Rooms). |
| Confirmations | `window.confirm` in Booking | **Fixed** | 0 `window.confirm` in 18 tools (grep). In-page "Discard your changes?" (Rooms). |
| Dates | Native date fields in 16 tools | **Fixed** | 0 `type="date"` and 0 `type="time"` in 18 tools. The kit's DateField with "Today/Tomorrow" and the date spelled under it (Expenses, Tasks, Leave, Rooms). Left: some date *selects* (Rooms' admin dialog lists about 66 days). |
| People pickers | 4 behaviours | **Mostly one** | The kit's PeoplePicker is in 15 tools. Not in Expenses, whose "Who was there" is free text plus "Add", and probably should be the picker with "a guest" as a choice. Hiring still has 22 `<select>`s. |
| Search | Missing in 7 | **Still missing in 7** | No search box in **Expenses, Timesheets, Booking, Status, Goals, Leave, Polls** (grep plus screens). Hiring gained one. |
| Toast timing | No pause | **Fixed in the kit** | Pauses on hover and focus (Rooms README; the Rooms flow Undo passes). |
| Dialog dirty guard | Backdrop loses forms | **Fixed in the kit** | Seen in Rooms. |
| Data language | Seeded names frozen in one language | **Not fixed store-wide** | French screens show English seed data: Rooms "Ground floor / Quiet zone / Open space"; Goals "Autumn 2026 · En cours", "Cible 0 customer"; Tasks "Office move", "To do / Doing / Done" (brand FR phone); Support tags "Damaged / Delivery / Invoice / Order change" (inbox-brand). Hiring fixed its stages with keys. |
| "Settings" | Named differently | **Fixed** | "Réglages" everywhere; sub-pages specific ("Lieux", "Page carrières"). |
| Member chip | Helpdesk bottom-left | **Fixed** | Top-right in all 18. |
| Icon-only controls | Many | **Fewer, still some** | Equipment phone's three secondary actions; Rooms admin desk equipment; Hiring note delete and template edit/delete; Timesheets phone entry edit/delete; Wiki phone header. |
| Phone overflow | — | **New** | Filter rows cut at the screen edge with no hint: Support "Invoi…", "Attente la plus longu…"; Hiring stage tabs; Tasks board columns. |
| **Where the look is set** | — | **New incoherence** | The Chest sets the look for all tools or per tool. But **Hiring** (Settings → Colour and Logo) and **Forms** (Settings → Look → Colour and Picture) keep their own look controls, silently overridden by a Chest brand. |
| Screenshots | Forms had none | **Fixed, but dirty** | All 18 have screens (Forms 75). Some are taken after flows ran. **News** front pages show "New badges from Monday" twice and "Nouveaux badges lundi" twice, "51 seconds ago"; **Goals** "Paul Lefèvre (former member)". The showcase will show test residue. |

## 3. Themes: is switching looks convincing and safe?

**Convincing: mostly yes.**
- **The brand look reads as the company's intranet.** The sample brand (Atelier Martin: green, serif headings, logo left of the tool's name) is applied the same way in all 18 tools, light and dark, desktop and phone. Opening Leave, then Goals, then Support in it feels like one company's suite. That is the strongest argument of this round.
- **The Chest look (Swiss black and white, light only) is coherent everywhere.** It is also the plainest. It keeps each tool's mark in black.
- **Catalogue themes are credible** because they are real identities: Workshop, Confetti, Seaside and the others.

**Identities in their own look: intact.** Each tool's own screens (`*-desktop.png` without a suffix) are unchanged in character: Rooms' blueprint, Hiring's magazine, Status's control room, Leave's sunset, Equipment's tool crib.

**But the identity also leaks into the other looks, which weakens "the company's own".**
- Rooms' graph-paper grid stays under the brand, Confetti and High contrast.
- Equipment's hazard stripe stays under the brand header.
- Leave's sunset illustration, Hiring's arch, Polls' confetti dots and Goals' contour lines stay in brand mode.
- In brand mode this reads as "Rooms by Atelier Martin", not "Atelier Martin's room booking".

It is a defensible choice for recognition. But the owner asked that a brand look "looks like the company's own". Decide it explicitly: a switch "keep each tool's pattern: yes/no", default off in brand mode.

**Safe (nothing unreadable): yes in everything I looked at, with thin margins.**
- No unreadable text in any of the ~120 look screenshots or my ~40 shots.
- Measured on Leave's balance tiles:
  - Workshop: 4.62:1 (dark navy on bright blue) and 4.55:1 (green on green). AA passes, but only just.
  - Seaside: 7.3:1.
  - **High contrast dark: 5.7:1.** A person who picks "High contrast" expects about 7:1 (AAA) on small text, and this theme does not give it on colour-filled tiles. Fix: High contrast should flatten tinted tiles to the ground colour.
- **Meaning lost in the Chest look.**
  - Booking's calendar (pick-a-time-chest): bookable days are pale grey circles, barely distinct from unbookable days.
  - Leave's "Who's away" (calendar-chest): every absence is the same grey.
  - Status keeps its five state colours in every look (by design), which is the right model. States and categories should be exempt from the theme everywhere.
- **Only one brand has ever been tried.** The harness offers exactly one sample brand (`brand:sample`), and every `-brand` screenshot uses it. `importBrand`/`deriveTheme` claim to keep AA for any brand. But "safe for any company" has been shown on one tasteful dark-green brand. It has not been tried with a yellow, pale-grey, neon or dark-only brand, a display font, or a wide or square logo. That is the claim most likely to break at the first customer.

**Public pages.** A theme chosen "for all tools" also dresses the public careers, status, booking, support and forms pages (Status README admits it). A company that likes Confetti for its team would show Confetti to its customers and candidates. **Rule to adopt:** public parts follow the brand if one exists, else the tool's own look, unless a look is chosen for that tool specifically.

**The Look panel works.** Both levels ("all tools" and "this tool"), each page updated at its next load, with a clear line saying which choice applies.

## 4. Top 10 cross-cutting fixes now, ranked

1. **Ship the built proposals on the real Chest (platform, L):** `mail` send and receive, `schedules`, `calendar`, `groups`, public uploads, `visitors`, events between tools, `theme`. Until then most of round 2 exists only in the studio, and five public-facing tools cannot face a customer.
2. **Custom domains for public hosts (platform, M; SDK §4.15).** This is the first blocker for Status, Hiring, Booking, Support and Forms.
3. **Reach people outside the tab (platform, M; §4.14, still "platform only", not built):** web push and a daily bell digest. Approvals, assignments and Important news still wait in a bell.
4. **Defaults as keys, store-wide (tools, S each):** seeded floors and areas (Rooms), cycle names and units (Goals), default columns (Tasks), default tags (Support), example services (Status). Add a lint: no French or English literal in `seed/` or default-creation code.
5. **Search in the 7 tools without it (tools, S each):** Expenses, Timesheets, Booking, Status, Goals, Leave, Polls. Use the kit's search box with "/".
6. **One look rule for public pages and one place to set a brand (kit and tools, S/M).** Public pages follow the brand or the tool's own look. Remove Hiring's and Forms' own colour and logo pickers when a Chest brand exists, or make them the Chest's.
7. **Brand safety matrix (kit, M):** run `importBrand` on 8–10 adversarial brands (yellow, pale grey, neon, dark-only, script font, wide logo) across all 18 tools' screens with the contrast script. Add "tool patterns off in brand mode". Bring High contrast to 7:1 on filled tiles. Keep states and categories un-themed (Booking availability, Leave types).
8. **Phone rules, enforced by the audit (kit, S):**
   - no word broken inside a nav label;
   - filter rows wrap or show a scroll affordance;
   - the page's primary action first;
   - no icon-only buttons (Equipment, Timesheets, Hiring).
9. **"Export everything" and a per-person data export in all 18 (tools, S/M).** Only Clients, Wiki, Hiring, Status, Forms and Rooms (per member) have something of the kind. Switching away must be as easy as switching in. It is a GDPR right of access in every tool that holds personal data.
10. **Studio hygiene before the owner judges the contest (S):**
    - regenerate every `docs/screens` from a clean `--reset` seed, not after flows (News and Goals show test residue);
    - rebuild the showcase with looks;
    - add a second sample brand to the harness so critics and builders can test the brand claim.

## 5. The owner's question

> "Can I tell a company: cancel your subscriptions, everything is included and nothing will be missing?"

**No.** Not today, and "nothing will be missing" will never be true against products with years of features.

- **Built in the studio but not shipped:** the store's round-2 progress stands on SDK proposals (email, calendar feeds, scheduled tasks, groups, public uploads, custom domains) that are built and tested in the studio but not running on a real Chest.
- **Hands-on in this round:** Rooms still cannot replace room booking in Outlook or Google, Hiring cannot reach Welcome to the Jungle's audience, and Status has no address of its own.
- **Outside the store:** the office suite, chat and video, usually the biggest per-seat bill, are not in the store at all.

**What is true today:**

> "Your team can drop its per-seat subscriptions for simple task boards (Trello-level), leave requests, equipment tracking, internal date polls, team objectives, internal news and time tracking. The Chest tools do the daily job your people use them for, with the same colleagues and one sign-in, in your own brand, at no extra cost per person. Some advanced features of each product are missing, and each tool lists them. Keep your email and calendar suite, chat, payroll and accounting. Keep your customer-facing tools (support desk, careers site, status page, booking page) until the Chest ships email and your own web addresses."
