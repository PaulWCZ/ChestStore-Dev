# Tasks (tools/private/tasks) vs Trello, Asana — critique round 3

Run 2026-09-29 on harness port 11100. I ran `npm run build`, then `dev.mjs --prod --reset` (seeded), then `--reset --empty`. The tool's flow (`flows/tasks.mjs`) passes 32/32.

My own Playwright scripts are in this folder (`sweep.mjs`, `one.mjs`, `tasks-big.mjs`, `trello-imp.mjs`), with screenshots in `shots/tasks-*`, `t-*` and `te-*`. I checked:
- **Members:** Camille (manager, fr), Hugo (member, en), Inès, Léa, Sofia (viewer) and Nora (no role).
- **Pages:** My tasks, board, timeline, list, card, search and import.
- **Sizes and looks:** 1280 px and 390 px, dark, the own Workshop look, Chest, brand:sample, and brand:port in light and dark.
- **Scale:** a 400-card CSV board.
- **Import:** a realistic Trello export with a Done list, `dueComplete` cards and an archived list.

No page scrolls sideways and no console error appeared.

## Verdict

**Can a 50-person French company cancel Trello tomorrow? Not yet.** The fix is small (S), but it is the moving day itself: a real Trello board imports its "Done" list as open work, so every finished card lands in people's *My tasks* as **Late**, in the morning reminder and in the tile's number (new bug 1). Once that is fixed, the answer is yes.

**Asana: not yet** (no cross-board calendar or portfolio, and subtasks are still checklist lines). **Monday: no** (no automations, no dashboards).

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 6 | 7.5 | **8** |
| UX | 7 | 7.5 | **7.5** |

- **Completeness went up** because of the real timeline (drag, keyboard, dependency lines), "blocked by" with a refusal and "Mark done anyway", and one grouped email per burst.
- **UX stayed flat:** the switch-day import is wrong, links go stale after a move, the French import page overlaps, and the round-2 empty-state minors are still there.

Strength: the timeline and "Blocked" chips read at a glance in every look, including the grey Chest one, where "⚠ Late" and the label names now show.

## Round-2 top fixes and blockers

| Round 2 | Status | How checked |
|---|---|---|
| Fix 1a: a deleted comment's text stays in the bell and the email | **Fixed** | Flow step "SECRETX"; `/_dev` bell after delete shows nothing |
| Fix 1b: "Late" by colour only; labels without names | **Fixed** | Screenshots `tasks-chest-*-1`: "⚠ Late · 28 Sept · 15:00", "Urgent", "Suppliers" in grey with words; "Blocked" has an icon and a word |
| Fix 2: timeline and "blocked by" | **Fixed (one board)** | `tasks-d-hugo-2`: bars, dependency lines, a red dashed bar when it starts before its blocker is due. The flow refuses Mark done, then allows it anyway |
| Fix 3a: phone board chrome | **Fixed** | `tasks-p-hugo-1`: the first card at about 280 px; one "View and filters" button; the list is stacked on a phone |
| Fix 3b: email digest | **Fixed** | `/_dev` outbox: Inès gets **one** "Hugo Bernard : 1 tâche confiée et 1 mention", in French |
| Blocker: timeline / dependencies | Fixed, for one board | Nothing across boards |
| Blocker: automations | **Not fixed** | none |
| Blocker: calendar across boards / feed | **Not fixed** | The calendar is still per board; no iCal feed, although the `calendar` proposal exists |
| Blocker: subtasks are checklist lines | **Not fixed** | By design (README) |
| Blocker: push / the phone | Partly (the phone board is good now; there is no push) | Platform |
| Minor: the French search placeholder was cut | **Fixed** | Now "Rechercher" |
| Minor: seeded columns in English | **Fixed** | Inès reads "À faire / En cours / Fait" |
| Minor: a viewer's empty *Boards* page is bare | **Not fixed** | `te-p-sofia-1.png`: the heading "Boards", then only "Archived boards", with no sentence and no "ask Camille" |
| Minor: the admin's empty state has no example board and no *Import* | **Not fixed** | `te-d-camille-0.png`: "Commencez par un tableau" and one button; Import is not mentioned, although "bring my Trello" is the first thing a switcher wants |

## Still blocking (what a paying customer misses weekly)

1. **Trello:**
   - **"Mark as complete" on the due date (`dueComplete`) is lost.** Trello teams tick the date instead of moving the card: those cards come in as late, and there is nothing equivalent in Tasks except moving the card to a done column.
   - **Guests.** Trello boards are routinely shared with a client or a freelancer. The Chest has no guest (platform).
2. **Asana:**
   - **"My tasks" is not plannable.** There are no sections of my own, no "Today / Upcoming" that I arrange.
   - **No cross-project view.** There is no portfolio, no calendar across boards, and no Outlook/Google feed of my due dates, although the `calendar` proposal already serves News.
   - **Subtasks cannot carry discussion.** A step has no comments or files.
3. **Automations.** Not even one built-in rule ("when a card enters Done, tell the board's owners", "when a card is created in Requests, give it to X"). Trello's Butler is used weekly by most paying teams.
4. **The timeline is one board only**, with no milestones. A manager who asks "what does my team have over the next six weeks, across all projects" gets nothing. *By person* exists only inside one board.

## New problems (missed by round 2)

1. **Bug (switch day): a Trello "Done" list imports as open work, and `dueComplete` is ignored.**
   - **Steps:** Import → Trello, with a JSON export that has lists "To do" and "Done", a card in Done due 1 April, and a card in To do with `dueComplete: true`. Choose *Everyone*, import, then open *My tasks*.
   - **Result:** "LATE 3: Shipped spring campaign · 1 Apr · Marketing; Posted job ad · 1 Sept". There is no tick button on them, because the imported board has **no done column**: `parse-import.ts:96` sets `done: false` for every Trello list, and `dueComplete` is never read. The board shows the "Done" column's card as "⚠ Late".
   - **Impact:** a real Trello board has hundreds of done cards. The first morning after the switch, everyone gets "37 tasks late" by bell and email, and the tile shows a big red number. The same happens with a CSV whose status column says "Fait", "Terminé" or "Done": only a separate "completed" column is understood (`t-big-board.png`: the "Fait" column is not done).
   - **Fix:** mark the last list, or one named Done/Fait/Terminé/Closed, as the done column, and put `dueComplete` cards in it.
2. **Bug: archived Trello lists vanish silently.** Cards in a `closed` list are dropped without a word. The preview says "2 columns · 3 cards" and never says that "Old sprint" (1 card) was left behind. Round 2 praised the honest preview, but this case is missing from it.
3. **Bug: bell and email links go stale after a card moves to another board.**
   - **Steps:** Hugo comments on and gives a step on "Book the stand" (board *Trade show*), then moves the card to *Office move*. Inès clicks the bell item or the email link `/chest/boards/4?card=18`.
   - **Result:** she lands on *Trade show* with no card panel and no message ("moved to Office move"). The notification looks broken.
   - **Fix:** redirect `?card=` to the card's current board, or update the item on move.
4. **Import assignees on a private board are invisible to the people concerned.**
   - The default "Only me" import (round-2 fix M4) keeps people on cards: the preview says "4 personnes trouvées", and the avatars HB, LD… are shown. Those people cannot see the board, so their 80 cards never reach their *My tasks*.
   - Nothing warns the importer: "4 people have cards but won't see them until you share the board".
5. **The French import page overlaps at 1280 px** (`t-big-preview.png`):
   - the Trello card's button "Choisir un ou plusieurs fichiers" sits on top of the last line of the instructions ("choisissez tous leurs fichiers d'un coup") and sticks out of the card's right edge;
   - the Asana button also overflows its card;
   - English overflows too, slightly ("Choose one or more files").
6. **Imported CSV columns come in the order they first appear**, not the workflow order: "En cours · À valider · Fait · À faire" (`t-big-board.png`). A French sheet sorted by task number gives a board that reads backwards, with no reorder step in the preview.
7. **The phone timeline is nearly useless.** At 390 px the title column takes a third of the width, each day is 26 px, only 8 days show, and the bar titles are cut to "Book the moving…" (`tasks-p-camille-2.png`). This is the "manager on the train" case: there is no list-of-weeks fallback, as the calendar has on phones.
8. **Scale is fine, but unpaginated.** A 400-card board renders all 400 cards in 443 KB of HTML (board 0.26 s, list 1.5 s, timeline 0.9 s, locally). That is acceptable, but a 2,000-card archive-heavy Trello board will get heavy; there is no "show 50 more" per column.

## Platform-dependent

- **Email:** the `mail` proposal (built, studio only). A real Chest today sends nothing.
- **The morning reminder and the tile's number overnight:** `schedules` plus the `chest` time zone.
- **Guests (Trello's board sharing with clients):** no platform notion of an external collaborator. This needs a new "guests" proposal (limited members) in the SDK report.
- **Push and live updates:** the platform's push/realtime items (not proposed). A board polls every 15 s.
- **A due-date feed into Outlook/Google:** the `calendar` proposal. It exists, and Tasks does not use it: this is a builder item, not a platform one.

## Top 3 fixes now

1. **Make the Trello/CSV import right on switch day (S).**
   - The last Trello list, or one named Done/Fait/Terminé/Closed, becomes the done column; `dueComplete` cards go there (or are marked done); a CSV status of "Fait/Terminé/Done/Completed" counts as done.
   - Archived lists are counted in the preview ("1 archived list, 1 card: brought archived") and imported as archived columns instead of being dropped.
   - Warn when people found will not see a private board.
   - Let the preview reorder columns, or order the known ones (to do → doing → done).
   - Add a flow step with a real Trello export.
2. **Links that survive a move, and the empty states (S).**
   - `?card=` on the wrong board redirects to the card's board (or the item is updated on move).
   - The viewer's empty *Boards* page gets the sentence *My tasks* already has.
   - The admin's empty state gets a second action, "Bring your Trello or Asana boards".
   - Fix the import cards' button overflow in French.
3. **A calendar feed of my due dates, plus "My tasks" as a week (M).**
   - Subscribe to my cards and steps in Outlook/Google through the `calendar` proposal that News already uses.
   - On phones, render the timeline as a list of weeks (as the calendar does), so a manager can read it on the train.
