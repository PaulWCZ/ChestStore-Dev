# The store as a whole — severe critique

Critic run 2026-09-29. Sources: every `tools/*/*/docs/screens/*.png` and `chest/preview.png` (seen as contact sheets in `critique/rest/sheets/<tool>.png` and `sheets/phones.png`), every README's "does not do yet", every `lib/i18n/en.ts` + `fr.ts` (word counts by script), every `components/` folder (compared by checksum), and hands-on use of Rooms, Hiring and Status (see their files). **Hands-on verdicts are only for those three; for the other 15 the judgements below come from screenshots, READMEs and code, and say so.**

Note: the store has **18** tools, not 17. `tools/public-and-private/forms/` has **no screenshots and no `chest/preview.png`** — it cannot appear properly in the showcase or the store, and could not be judged visually here.

## 1. The pitch test

"Cancel your SaaS subscriptions… and you will not miss features." Below, the subscriptions a 50-person French SME typically pays for (categories from `reports/01-ranking.md`, plus the office suite and communication tools the ranking puts outside the store). Prices are only those already sourced in `reports/01-ranking.md` / `01-pricing-sources.md`; none added here.

### Covered by a store tool

| SaaS paid today | Store tool | Cancel tomorrow? | What stops it (short) |
|---|---|---|---|
| Trello / Asana / Monday | Tasks | **Trello: mostly yes. Asana/Monday: partly** | No calendar/timeline view, no email/push reminders, no start dates, no automations (README). Trello and Asana importers exist — a real strength. |
| Notion (docs) / Confluence | Wiki | **Partly** | No live co-editing (realtime), no Notion databases, no @mentions, no "read and acknowledged". Notion import exists. |
| Lucca Absences / Factorial time off | Leave | **Yes for most SMEs** | No iCal/Outlook "out of office", no email/push to approvers, no payroll connector (export only), no delegation when approver away. |
| Workvivo / Staffbase / all-staff email | News | **Yes** (rarely paid anyway) | No push/email for Important posts: people who do not open the Chest miss them. |
| BambooHR / Factorial directory + onboarding | People | **Partly** | No HR file (by design), no custom fields, org chart only by manager. |
| HubSpot CRM / Pipedrive | Clients (crm) | **Partly** | No email sync/sending, one pipeline, no products, no mobile calling log. Salespeople live in their inbox. |
| N2F / Expensify | Expenses | **Partly** | No receipt OCR (AI gateway), no cards/bank feed, no import. The accountant export is good. |
| Zendesk / Freshdesk / Crisp | Support (helpdesk) | **No** | A support desk without email in and out is a contact form. Everything waits for the `mail` proposal (send + receive). |
| deskbird / Robin / Google rooms | Rooms | **Partly** (hands-on: `rooms.md`) | No calendar bridge, no recurring presence, no team view. |
| Harvest / Toggl / Clockify | Timesheets | **Toggl/Clockify: yes. Harvest: partly** | No invoicing (Quotes is separate, not linked), no approval. Importers exist. |
| Calendly / Cal.com | Booking | **No** | Does not read the host's calendar (README first line). A booking page that double-books the host's real meetings cannot replace Calendly. |
| Welcome to the Jungle / Teamtailor | Hiring | **No** (hands-on: `hiring.md`) | No reach (no job boards, no Google for Jobs), recruiter cannot write to candidates, no scheduling. |
| Snipe-IT / spreadsheets | Equipment | **Yes** | QR labels, licences with seats, leaving flow — looks complete from screens. |
| Doodle / Polly / Officevibe | Polls | **Yes** | Anonymous pulse + date polls in one. No email reminders to non-responders. |
| Lattice goals / Perdoo | Goals | **Yes for team OKRs** | Deliberately no individual reviews (legal note in Settings — good). |
| Sellsy / Axonaut invoicing / Henrri | Quotes | **Partly** | Drafts and numbers; the e-invoicing reform needs a certified platform to transmit/receive — the tool says so. |
| Statuspage / Instatus | Status | **Not yet** (hands-on: `status.md`) | No custom domain *(October 2026: now exists)*, no working notifications without `mail`, no JSON/widget. |
| Typeform / Tally / Google Forms | Forms | **Not judged** | No screenshots; not reviewed here. |

**Honest count:** of 18 categories, a company could cancel about **6 today** (Trello-level tasks, Leave, News, Equipment, Polls, Goals, plus Toggl-level time), **8 partly**, **4 not** (Support, Booking, Hiring, Status) — the four *public-facing* ones, all blocked by the same platform gaps (mail, calendar, custom domain).

### Missing categories the pitch needs

The biggest per-seat line of a French SME is usually the office suite and chat, not any tool above. If the founder says "cancel your SaaS", the buyer thinks of these first.

| Category (typical SaaS) | Can the Chest support it today? (brief/02 limits) | SDK / platform primitive it needs |
|---|---|---|
| **Email + calendar** (Google Workspace, Microsoft 365) | **No.** No mail, no CalDAV, no inbound SMTP. | Not a tool: out of scope. But the store must **integrate** with it: per-member signed **iCal feed** URLs (read-only) and `.ics` everywhere; later a read-only free/busy connector (declared `network` + OAuth secret in `env`). |
| **Team chat** (Slack, Teams) | **No.** WebSocket refused; polling chat is worse than Slack (ranking #18). | `realtime` (SSE or WebSocket through the front) + push. |
| **File sharing / drive** (Google Drive, Dropbox) | **Partly.** `files` gives 1–100 GiB private storage and direct uploads; no sharing links outside, no desktop sync. | Public/signed share links with expiry (the "public files" proposal), folder permissions by group, WebDAV (L) for desktop sync. A "Drive" tool is buildable now for team-internal sharing. |
| **Docs / sheets co-editing** (Google Docs, Notion) | **No** (realtime). Wiki with a lock is the substitute. | `realtime` + CRDT (Yjs) persistence. |
| **Video meetings** (Zoom, Meet) | **No.** WebRTC signalling needs realtime; TURN needs UDP. | Out of scope; integrate by link. |
| **Password manager** (1Password, Bitwarden, Dashlane) | **Technically yes, safely no.** Browser WebCrypto + database would work; the ranking rejects it for risk. | A per-member key-wrapping primitive (member public keys held by the Chest, recovery by admin escrow), an audit log, and an external security audit. |
| **E-signature** (Yousign, Docusign) | **Simple signature only.** Legal-value (eIDAS advanced/qualified) is regulated — out of scope (brief/01). | `mail` (send the link), public one-time links for outside signers, audit trail + trusted timestamp (network to a TSA). A "send for signature through Yousign" connector is the honest version. |
| **Accounting / bookkeeping** (Pennylane, Tiime) | **No — regulated.** | Exports only (Expenses, Quotes already export). An FEC export from Quotes + Expenses would help the accountant. |
| **Payroll** (PayFit, Silae) | **Never** (brief/01). | Leave and Expenses exports to it — Leave's DSN/PayFit connector is missing. |
| **Spend cards / banking** (Qonto, Spendesk) | **Never** (regulated). | Bank feed import (CSV) into Expenses. |
| **Newsletters / marketing email** (Brevo, Mailchimp) | **No** (mail at volume, bounces, unsubscribes). | `mail` with bulk, bounce webhooks, list-unsubscribe. |
| **Whiteboard** (Miro) | **No** (realtime). | `realtime`. |
| **LMS / onboarding training** (360Learning) | **Yes, buildable** (files for video, database for progress). | Video streaming with range requests from `files`; nothing new. |
| **Performance reviews / 1:1s** (Lattice reviews) | **Buildable**, legally sensitive (Goals notes L1222-3). | Audit log, restricted visibility per manager chain (needs manager relation from the Chest or People). |
| **Visitor / reception log** | **Buildable** (kiosk page on the private host). | `mail` or SMS to warn the host; nothing else. |
| **Dashboards** (Metabase) | **No** (no cross-tool data). | Events between tools or a read-replica API per tool. |

**Pitch consequence:** the sentence should become "cancel the per-seat *business tools*" and name them; the office suite, chat and video stay. And the store's calendar-shaped tools (Rooms, Leave, Booking, Hiring interviews, News events, Tasks due dates) must at least *feed* Google/Outlook calendars, or the Chest is a second island next to the calendar everyone lives in.

## 2. Coherence across tools an employee uses daily

(Identity differs on purpose and is not criticised. These are behaviour and wording differences an employee meets switching tabs.)

1. **Navigation has five patterns.** Top tabs with icons and words (Rooms, CRM, Equipment, Expenses, Status, Timesheets, Quotes, Goals), rounded pills (Leave, People, Hiring, Tasks, Booking), a left sidebar (Wiki, Helpdesk), almost none (News, Polls: a logo and a search). In the phone screenshots (`sheets/phones.png`): People and Tasks shrink to **icon-only** buttons, Leave and News **hide the nav**, CRM puts it under "···", Wiki behind a hamburger, Rooms wraps "Who's where" on two lines. Fix: one rule for phones — labelled tabs (≤5) at the top or bottom, never icon-only.
2. **Where the main action sits varies.** Top-right page button (Hiring "New job", Status "Post an incident", Quotes "New quote", Goals "New objective"), in the app bar on every page (Expenses "+ Add", News "Write a post", Polls "New poll"), in a hero card (Leave "Ask for time off"), under the date strip at left (Rooms "Book a room"), as a tile in the grid (Tasks "New board"). Pick one: top-right of the page header on desktop, full-width button at the top on phone; an app-bar "+" only for tools whose one job is creating (Expenses).
3. **"Undo" vs "Cancel" in French collides.** 25 `undo` strings across the tools translate Undo as **"Annuler"** — the same word as Cancel. In Rooms the toast after cancelling a booking reads "Réservation annulée. **Annuler**"; Leave already solved it with "Annuler l'action"; Timesheets uses **"Rétablir"** (= redo/restore) for Undo (`timesheets/lib/i18n/fr.ts:61`). Fix: one word store-wide, "Annuler l'action" (or "Défaire"), in the shared toast.
4. **Delete / Remove / Erase used interchangeably.** Counts in `en.ts`: Wiki 13 "Delete" + a Trash; Rooms 6 "Remove", 0 "Delete"; CRM "Delete {name} for good?"; Tasks "Delete for good" + Archive; Goals a red **"Remove"** button for an objective; News "Delete"; Hiring "Erase this candidate"; Booking/Helpdesk/Forms "Erase … data" for GDPR. Rule to adopt: **Remove** = take out of a list, nothing lost (a guest from a meeting, a tag); **Delete** = gone, with Undo or Trash; **Erase** = GDPR, irreversible, asks first. French: Retirer / Supprimer / Effacer, applied the same way.
5. **Confirmations differ.** Most tools do "act + Undo" (good). Booking uses the browser's `window.confirm` (`booking/app/chest/types/type-form.tsx:116`) — a grey English/OS-language box in a French UI; Wiki has its own confirm; Rooms asks "a second click" on places; Hiring asks only for Erase. Rule: Undo toast for anything reversible; an in-page dialog (never `window.confirm`) only for irreversible acts; **never offer Undo after an email or a bell item already left** (Hiring's reject email does exactly that).
6. **Dates: three formats and two field types.** Every tool uses the native `<input type="date">` (16 of 18 tools), which shows the *browser's* locale format (`mm/dd/yyyy` in these screenshots, `jj/mm/aaaa` on a French browser) whatever the member's Chest language — while the same page prints "Tuesday 29 September" or "29 sept." in the tool's language. Relative ("il y a 3 semaines" CRM, "asked 4 days ago" Leave) and absolute ("Due 23 Oct 2026" Quotes) mix across tools for the same idea ("when was this touched"). Times: 24-hour selects in Booking/Status/Rooms, but News uses the native `type="time"` (AM/PM on many computers — Booking's own comment explains why that is wrong).
7. **People pickers behave four ways**: native `<select>` "Choose someone" (Hiring interviewers, People arrivals, Leave approver per row, CRM owner), a typeahead with suggestion buttons (Rooms guests: no arrow keys), a filtered list (Equipment), a proper combobox (Tasks @mentions). An employee who types "lé" in one tool and scrolls a 200-name select in another will notice.
8. **Search exists in 11 tools and not in 7** (Expenses, Goals, Leave, Polls, Timesheets, Booking, Hiring, Status have no search box). CRM has a "/" shortcut; nobody else does.
9. **Toasts are identical code** (same file in all 18) — consistent, but 4 s / 8 s with no pause on hover or focus: a keyboard or screen-reader user cannot reach "Undo" in time (WCAG 2.2.1 Timing Adjustable).
10. **Dialogs close on backdrop click** in the 11 tools that share `components/dialog.tsx` — a stray tap loses a half-filled form (Rooms booking, CRM, Tasks). Seven tools have no dialog component and improvise inline panels.
11. **Language of data leaks into the UI.** Seeded/default names are stored as text in the creator's language: Hiring stages ("Présélection" in the English UI, "Screening" in the French UI), Rooms floors and Status example services (seen); other tools' seeded lists were not checked. Defaults must be keys rendered in the reader's language until renamed.
12. **"Settings" is named differently**: "Settings" (most), "Places" with Rules/Export tabs (Rooms), "Stages and interviewers" (Hiring per job), "Réglages" in French everywhere except one "Paramètres" string in Wiki. Keep "Settings/Réglages" as the nav word; sub-pages can be specific.
13. **The member chip** "Name · Role" top-right is consistent (good), except Helpdesk (bottom-left of the sidebar).
14. **"No access" page** is consistent ("You can't use this tool yet… Ask an administrator") — good; keep it in the kit.
15. **French quality**: generally natural and idiomatic (Leave, Rooms, Hiring, Status reviewed closely). Specific slips: the Undo collision (3); Timesheets "Rétablir"; Status "Nous sommes au courant et cherchons" (verb without object); English content shown on French public pages (Hiring intro, Status incident text) because user content has one language.

## 3. Components built many times — best and weakest (for the shared UI kit)

| Component | Best implementation (start from this) | Weakest (replace first) | Notes for the kit |
|---|---|---|---|
| **People picker** | `tools/private/tasks/app/chest/boards/[id]/card-panel.tsx` (lines ~281–560: assign search + @mention combobox with `aria-activedescendant`, arrow keys, listbox); search logic from `tools/private/equipment/app/chest/items/[id]/item-controls.tsx` `PeoplePicker` (accent-folding, first/last name prefix, 50 cap) | `tools/public-and-private/hiring/app/chest/jobs/[id]/settings/job-settings-view.tsx:90` native `<select>`; `tools/private/rooms/app/chest/rooms/rooms-view.tsx:329` suggestions as buttons, no listbox/arrows; People arrivals "Choose a person" select; Leave approver select in every table row | One `<PeoplePicker multiple groups>`: typeahead, avatars, Chest groups as choices ("Sales"), recent people first, keyboard combobox, chips for multiple. |
| **Date field** | `tools/private/rooms/components/day-strip.tsx` (39 lines, near days as big tappable tiles) for "which day soon"; Booking's month grid on `pick-a-time` for public calendars | Native `type="date"` in 16 tools (browser-locale format, tiny target on phones) | `<DateField>` printing in the tool's language, typed input + calendar popover, "Today/Tomorrow" chips; `<DayStrip>` for short horizons. |
| **Time select** | `tools/public-and-private/booking/components/time-select.tsx` (15-min steps, 24-hour, `24:00` end, rationale in comment) | `tools/private/news/app/chest/composer.tsx` native `type="time"` ("--:--", AM/PM); Status's separate hour + minute selects (two controls for one value) | One `<TimeSelect step end>`; keep duration when the start moves (Rooms bug). |
| **File upload** | `tools/public-and-private/helpdesk/components/file-picker.tsx` (99 lines: several files, stated limits, per-file remove); server-side type sniffing from Hiring (`lib/cv.ts`) | Each importer's own inline "Choose the file" (Tasks, CRM, Wiki, Equipment, People, Leave, Timesheets) with different wording and no drag-and-drop | `<FilePicker accept max multiple capture>` + progress for direct uploads + the same "What will be imported" preview step. |
| **Dialog** | `components/dialog.tsx` (identical in 11 tools: native `<dialog>`, focus trap and restore by the browser) | Same file's backdrop-click close and fixed `id="dialog-title"`; Booking's `window.confirm` | Add `dirty` guard, unique ids, an `alertdialog` variant for irreversible acts. |
| **Toast** | `components/toast.tsx` (identical in 18) | Same file: no pause on hover/focus, 8 s max, no "action already sent" state; Hiring calls it twice on one drop | Pause on hover/focus, extend when focused by keyboard, one toast per action id. |
| **Tabs / segmented** | Booking bookings tabs (Upcoming / Past / Cancelled), CRM Board/List segmented control | Rooms desks page: part-of-day + 5 filters + Plan/List in one row that overflows on a phone without a scroll hint | `<Tabs>` with counts; `<Segmented>` ≤3 options. |
| **Table / list** | `tools/private/quotes/components/list-page.tsx` + `ledger.tsx` (filter chips with counts, totals row, search, state pills) | Leave People table (a select in every row), Status (no list at all for services beyond the editor's) | `<DataTable>` with sticky header, totals, row actions menu, CSV export button. |
| **Filters** | `tools/public-and-private/helpdesk/components/inbox-filters.tsx` (48 lines, URL-driven) and Quotes' count chips | Equipment's four full-width selects above the list; Rooms' filter chips without labels on icons | Filters in the URL (shareable), chips with counts, "Clear". |
| **Search box** | `tools/private/crm/components/slash-search.tsx` ("/" shortcut, grouped results page) | None in 7 tools | `<SearchBox shortcut="/">` + a results page pattern. |
| **Empty state** | Status "Add your services first" + **"Start with an example"**; Hiring "Post your first job / Write a job"; Polls "You're all caught up" | Rooms rooms page for an **admin** (says "An admin adds…" with no button); Status public page "All systems operational" before any service exists | `<EmptyState title body action example>` with role-aware action. |
| **Avatar** | `components/avatar.tsx` variant used by CRM/Rooms/Tasks/Booking/Helpdesk/Hiring (checksum 232dc1…: optional `title` makes it an accessible `img` when the name is not written beside it); `tools/private/people/components/portrait.tsx` (CSS-variable size, lazy loading) | Rooms avatar stacks crop every initial but the last (`docs/screens/week-fr-phone.png`); 3 diverging copies + Portrait + Goals `person.tsx` | `<Avatar>` + `<AvatarStack max=3 more>`. |
| **Badge / status** | `tools/public-and-private/status/components/state.tsx` (icon + word + Okabe–Ito colour: never colour alone) | Hiring "New" badge on cards in the "New" column; mono uppercase boxes (Equipment "IN USE", Expenses "PAID") fine visually but unlabelled for screen readers when only colour differs | `<StatusBadge tone icon>` always with a word. |

Also duplicated 18 times with one checksum: `auto-refresh.tsx`, `language-switch.tsx`, `mark.tsx`, `nav-link.tsx`. They are already identical — move them to the kit as-is.

## 4. Top 15 cross-cutting fixes, ranked

1. **Calendar bridge for the whole Chest** (platform + SDK, M): per-member signed iCal feed URL that tools publish events into (Rooms bookings, desk days, Leave, Booking meetings, Hiring interviews, News events, Tasks due dates) + an `.ics` button everywhere. Without it Rooms, Booking, Leave and Hiring stay islands next to Google/Outlook.
2. **Ship `mail` send *and* receive on the Chest** (platform, L): unblocks Support, Hiring messaging, Status subscribers, Booking confirmations, CRM email logging — the four "No" rows of the pitch table.
3. **Reach people outside the Chest tab** (platform, M): web push from the Chest bell (PWA install on phones) and a daily email digest. Approvals (Leave, Expenses), assignments (Tasks) and Important news rot in a bell nobody opens.
4. **Custom domains for public hosts** (platform, M): `status.`, `careers.`, `book.`, `support.` on the company's domain with automatic certificates. Required to replace any public-facing SaaS. *(October 2026: done on the Chest — the owner connects the company's own domain to a tool's public part and the Chest serves its certificate; brief/08, `reports/05-critique.md` "October 2026".)*
5. **Shared `<PeoplePicker>`** (kit, M) with groups, typeahead, keyboard combobox — replace every native "Choose someone" select.
6. **Shared `<DateField>` / `<TimeSelect>`** in the tool's language (kit, M); drop native date/time inputs; fixes locale mismatch and small phone targets.
7. **Undo that tells the truth** (kit + tools, S): toast pauses on hover/focus; no Undo once an email/notification left (or delay the send); French "Annuler l'action" everywhere; fix Timesheets "Rétablir".
8. **Dialog safety** (kit, S): no backdrop close when dirty, unique ids, replace `window.confirm` (Booking).
9. **One phone navigation rule** (kit, S/M): labelled tabs, never icon-only, never hidden; main action at the top of each page.
10. **Search in every tool that holds records** (tools, S each): Hiring candidates, Expenses, Leave requests, Timesheets entries, Booking bookings, Status incidents, Polls.
11. **Import from the competitor + "Export everything"** (tools, S/M each): missing imports in Rooms, Hiring, Status, Expenses, Helpdesk, Booking; a standard ZIP export and a per-person GDPR export in every tool. Switching day needs both directions.
12. **Store glossary + linter** (S): Remove/Delete/Erase, Settings/Réglages, Undo/Cancel, Give/Assign, date phrasing; a script in `lab/` that flags off-glossary strings in `en.ts`/`fr.ts`.
13. **Defaults as keys, user content with a language** (tools, S): seeded stage names, categories, example services rendered in the reader's language until renamed; public tools let admins write intro/incident text in both languages.
14. **Company branding on public pages** (tools, M): adopt `chest.theme()` brand mode (SDK report 4.10) in Hiring, Status, Booking, Helpdesk — today they show a letter tile or just the name.
15. **Words on every icon-only control** (tools, S): Rooms equipment glyphs and floor trash icon, Status service rows (6 icons), People/Tasks phone nav; `aria-label` is not enough for the 58-year-old accountant.

Also for the showcase/store: give **Forms** its screenshots and `chest/preview.png` before anyone judges the contest.
