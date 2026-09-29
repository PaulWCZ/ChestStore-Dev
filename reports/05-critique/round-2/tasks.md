# Tasks (tools/private/tasks) vs Trello, Asana, Monday — critique round 2

Run 2026-09-29, harness port 7100: `npm run build`, `dev.mjs --prod --reset` (seeded) and `--reset --empty`. The tool's own flow (`flows/tasks.mjs`) passes 25/25. My own Playwright passes (scripts and screenshots in `critique2/collab/`, `shots/t-*`, `te-*`, `th-*`): Camille (manager, fr), Hugo (member, en), Sofia (viewer), Nora (no role). Pages checked: My tasks, board, list, calendar, card panel, search, import and settings. Each at 1280 px light, 390 px phone (touch emulation) and dark. Looks checked: own (Workshop), Chest, the sample brand (Atelier Martin), Confetti and High contrast. No page scrolls sideways and no console errors, except the list view, which is a wide table inside a sideways scroller on a phone.

## Verdict

**Can a 50-person French company cancel Trello tomorrow? Yes**, for teams that use Trello as a board with due dates. **Asana: not yet.** **Monday: no.**

- **Completeness 6 → 7.5.** Every round-1 blocker was closed. Added since round 1: move/copy between boards, subtasks as assignable steps, three field types, sortable/grouped list, calendar, email (via proposal), multi-board Trello import with a preview.
- **UX 7 → 7.5.** Keyboard, focus and "Mark done" are fixed. What holds the score down: the phone board wastes half the screen, "late" is shown by colour alone and disappears in the Chest theme, and some bugs are new.

Strength: *My tasks*, with one-tap done, Undo and the steps given to me, is still better than Trello's and Asana's home pages.

## Round-1 findings

| Round 1 | Status | How checked |
|---|---|---|
| B1 Enter does not open a card (keyboard) | **Fixed** | Flow step; my tab order reaches every card; list rows are links |
| B2 No email | **Fixed on the studio Chest (platform-dependent)** | `/_dev` outbox: assignment, step, mention and morning emails in each member's language. It needs the `mail` proposal; a real Chest today sends nothing |
| B3 Cannot move a card to another board | **Fixed** | Flow: comments come along and the history says where from |
| M1 "Mark done" hidden | **Fixed** | Big button at the top of the panel, with Reopen |
| M2 Dialog focus on ✕ | **Fixed** | The flow types straight into Name. A click on the backdrop with a typed name keeps the dialog open |
| M3 "Only people I choose" chooses nobody | **Fixed** | Picker in the dialog; lock and "Only you / 3 people" in the header |
| M4 Imported board visible to all | **Fixed** | Private by default; preview of people found/not found and of files left behind |
| M5 Archiving a column hides cards silently | **Fixed** | Dialog asks where the cards go; search offers "1 more in the archive" |
| M6 No calendar | **Fixed (one board)** | Month grid; drag changes the date; a list of days on a phone |
| M7 No subtasks, start dates, custom fields | **Partly** | Steps with a person and a date, start date, text/number/choice fields. No dependencies, no date/person fields |
| M8 List view not a work tool | **Mostly fixed** | Sort, group, links, done hidden. No inline edit; the sort is not remembered |
| M9 Comments cannot be edited or deleted | **Fixed, but see new bug 1** | |
| M10 Viewer empty state | **Fixed** | "Aucun tableau n'est encore partagé avec vous — Demandez à Camille Martin". Viewer's *Boards* page is still bare (see minors) |
| M11 Search misses comments etc. | **Fixed** | Comments, checklists and labels, plus "Include archived" |
| Minors (Markdown, several checklists, due time, copy, dark header, locale date, "Everyone" filter) | **Fixed** | Dark board header is now a dark tint; the DateField shows 28/09/2026 in French |

## Still blocking (what a paying Asana/Monday customer misses weekly)

1. **No timeline/Gantt and no dependencies.** Asana and Monday project leads plan launches on these. "Blocked by" is the second most asked-for feature after subtasks. Without it Tasks stays at Trello level.
2. **No automations.** Monday's "when Status becomes Done, notify X / move to board Y" runs half of a Monday account. Not even one rule, such as "when moved to Done, notify the board owner".
3. **No calendar across boards and no calendar feed.** "What is due this week, across all my projects, in Outlook" is not possible. The calendar is per board, and there is no iCal feed even though News already uses the studio `calendar` proposal for events.
4. **Subtasks are checklist lines.** No description, comments or files, and no steps under a step. Asana users break work into subtasks that carry discussion.
5. **Push and the phone.** No push notification (the Chest has none). The phone board is usable but cramped (below). Trello's and Asana's mobile apps are daily tools for people in the field.

## New problems found this round

1. **Bug: a deleted comment keeps its text in the bell.** Steps: as Hugo, comment "Door code is 4321 SECRETX" on card 3, then *Delete* and let the Undo toast expire (12 s). `/_dev` still lists two bell items whose text holds "SECRETX". Round 1 gave "a password pasted in a comment" as the reason for delete. Delete now hides the comment in the card but leaves the words in colleagues' inboxes, and in the email if someone was @mentioned. **Fix:** withdraw or replace the `card:<id>:comment` item on delete, and delay mention emails by the Undo window.
2. **"Late" is colour only, and almost invisible in the Chest theme.** On a card, the late date chip carries the word "late" only in a `visually-hidden` span (`board-view.tsx:395`). In Workshop it is a red fill; in the "Chest" theme (grey palette) it is a light grey fill beside plain white chips (`shots/t-catalogue_chest-hugo-d-_chest_boards_1.png`, zoom `z1.png`). A company that picks the Chest look loses "what is late" on the board. This fails WCAG 1.4.1 and the store's own rule (`_store.md` §3 Badge: "never colour alone").
3. **Labels on card faces are colour bars without names.** In the Chest theme "Urgent" and "Suppliers" become two identical grey pills. The README says "in the Chest theme, colours are greys and the names tell them apart", but names show only in the card panel and the list, never on the board.
4. **Email noise.** Hugo gives Inès a card, a step on it, and mentions her in one comment. Inès gets **3 separate emails in under a minute**, plus the morning email. Asana groups these, and a French SME will switch email off after a week. The emails are plain text (no button, no HTML).
5. **The phone board spends 54 % of the screen on chrome.** At 390×844 the first card starts at y = 454. Stacked above it: app bar, tabs, search, board title, two filters, the view switch, the column chips and the column header. The search box and the filters could sit behind one button on phones.
6. **The phone list view is a 896 px table** in a 358 px scroller. You scroll sideways to see dates. On phones, a stacked row (title, column, date, avatar) would work.
7. **French search placeholder is cut at 1280 px:** "Chercher des carte" plus the "/" chip (`t-own-camille-d-_chest.png`).
8. **Seeded board columns are English for French members** ("To do / Doing / Done" on Camille's French screen). New boards are correct: a French member creating a board gets "À faire / En cours / Fait". Only the showcase seed is affected, but it is what the owner judges (store rule §2.11).
9. **Minors:**
   - a viewer's *Boards* page on an empty Chest shows only "Archived boards", with no sentence;
   - the admin's empty state has no "Start with an example board" (the store's EmptyState pattern) and does not mention *Import* on the home page, which is the first thing a Trello switcher wants;
   - the *My tasks* tick buttons have only a `title` attribute (accessible, but no visible label on hover-less phones).

## Platform-dependent

- Email for assignment, mention and morning: **`mail` proposal** (built in `sdk/`, not on a real Chest). Without it, the bell only, which is the round-1 blocker again.
- Morning reminder, repeat safety net and tile numbers overnight: **`schedules` proposal.** "Today": the **`chest` time zone proposal.**
- A due-date feed into Outlook/Google: the **`calendar` proposal** (News already uses it; Tasks does not).
- Push to phones and live board updates (15 s polling today): the platform's **push** and **realtime** items (store fix 3; not yet proposed).
- Localised tile title: **manifest `translations` proposal** (declared).

## Top 3 fixes now

1. **Nothing leaks after delete, and "late" never relies on colour** (S):
   - withdraw the bell item and hold mention emails for the Undo window on comment delete;
   - show a visible "Late"/"En retard" word or ⚠ icon on late chips and label names on card faces, in every theme;
   - add a flow check in the Chest theme.
2. **Timeline plus "blocked by"** (L): start/due bars per board (read-only first), and a "blocked by" link between cards shown in the panel and on the card face. This is what moves the Asana verdict.
3. **Phone board and email digest** (M):
   - collapse search and filters into one "Filter" button on phones so the first card is above the fold, and render the list as stacked rows;
   - group emails per person per 10 minutes ("Hugo gave you 1 card and 1 step, and mentioned you").
