# Tasks (tools/private/tasks) vs Trello, Asana, Monday: severe critique

Screenshots: `critique/collab/shots/t-*.png`. Run: harness on port 7100, `--prod --reset`, then emptied with `truncate boards, labels, cards, comments, activity, attachments, reminders … cascade` to see a new company's first visit (the harness cannot start empty; see "Harness" at the end). Tested as Camille (admin/manager, fr), Hugo (member, en), Sofia (viewer), Nora (no role); desktop 1280, phone 390, dark, French, and keyboard only.

## Verdict

**Can a 50-person company cancel Trello tomorrow?** For a team that uses Trello as a plain kanban board, **nearly**. **Not yet** if it relies on Asana or Monday. A keyboard user cannot open a card, a card cannot move to another board, there is no email for anything, and the tool has no calendar or timeline and no subtasks. Replacing Monday is **no**: it has no custom fields, no views beyond board and list, and no automations.
**Completeness 6/10** (the Trello core is there and solid, and repeats, a morning digest and imports are real; the Asana/Monday layer is absent). **UX 7/10** (a strong, clear identity, one-tap done with Undo, good empty state; but keyboard opening is broken, the create-board dialog focuses the wrong element, and "done" inside a card is hidden in a Column dropdown).

Strength in one line: *My tasks* with one-tap done and Undo is better than Trello's home page.

## Blockers

1. **Keyboard users cannot open a card from the board.** Where: `app/chest/boards/[id]/board-view.tsx` lines 120-124 and 336-342. dnd-kit's `KeyboardSensor` uses Space **and Enter** as its start keys by default. Enter starts a drag (`aria-pressed="true"`) and calls `preventDefault()`, so the `if (e.key === "Enter" && !e.defaultPrevented) open()` branch never runs. Verified: focus a card, press Enter, and the URL does not change (`t4.mjs`: "url after Enter: …/boards/1", focus is on a card-handle with aria-pressed=true). The list view has no link or button per row either (`table a, table button` counts 2, and those are the view toggles). So a keyboard or screen-reader user cannot reach a card's details at all, which fails the brief's UX bar ("Keyboard, screen readers"). **Fix (S):** `useSensor(KeyboardSensor, { coordinateGetter, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } })`, and make each list-view row title a `<Link href="?card=id">`. Add a flow step that opens a card with Enter.
2. **No email for anything.** Where: README "What it does not do". Assignment, @mention, the due-date reminder: everything goes to the Chest bell only. Trello and Asana users live on email and mobile push for "you were assigned" and "due tomorrow". An employee who does not open the Chest that day misses the task. The buyer's first question will be "how do I know I have something to do?". **Fix (M, SDK):** use the outbox/email proposal (if the SDK working copy has one) for assignment, mention and the morning digest, with a per-person switch. If it does not exist, it is the SDK report's first line for this tool.
3. **A card cannot move to another board.** Where: `lib/cards.ts` `moveCard(…, columnId…)` resolves the column through `liveColumn(sql, b.id, columnId)`, so it only moves within the same board. The card panel's "Column" select lists only this board's columns. Trello's "Move → board" and Asana's "multi-home" are used weekly (triage board to team board, a request passed to another team). Today the workaround is to retype the card and lose its comments, history and files. **Fix (M):** add "Move to…" (board, then column) in the card panel; carry labels by name, drop assignees who cannot see the target board, and write both histories.

## Major

1. **"Mark done" is hidden inside the card.** Where: card panel (`t-card-hugo.png`). From *My tasks* you tick a circle, but in the card itself the only way to finish is to change the **Column** select to "Done" (`t-card-done.png`). Trello (the "complete" checkbox), Asana ("Mark complete") and Monday (Status) all have one obvious button. **Fix (S):** add a large "Mark done" / "Marquer comme fait" button at the top of the panel that moves the card to the first done column, with Undo.
2. **The create-board dialog puts focus on ✕, not on the Name field.** Where: New board dialog (`t-newboard-dialog.png`). A user who opens it and types loses the text; keyboard users must Tab first. Verified: after Enter on "Create a board" the focused element is `button.icon-button` (close), and typing "Marketing" went nowhere. **Fix (S):** `autoFocus` on the Name input.
3. **"Only people I choose" chooses nobody.** Where: New board dialog (`t-newboard-private.png`). Selecting it shows no people picker. The board is created private with only its creator (DB: `visibility = private`, one person), and the board page does not say it is private (`t-newboard-created.png`: no lock, and the filter still reads "Everyone"). The creator believes they shared it; colleagues cannot see it. **Fix (S/M):** when "Only people I choose" is selected, show the same people/group picker as in Settings inside the dialog. Show a lock and "Only you" / "Only you and 3 others" in the board header.
4. **An imported board is visible to the whole company.** Where: `lib/importers.ts` line 55 inserts the board without `visibility`, so the default is `'team'`. The import screen (`t-import.png`) offers no choice and no warning. A manager importing the HR "Onboarding / salaries" Trello board publishes it to everyone at once. **Fix (S):** default imports to private (importer only), add a "Who sees it" choice on the import screen, and show a preview step (cards count, columns, people matched or not matched) before creating anything. The research promised a "column mapping screen with preview"; it is not there.
5. **Archiving a column hides its cards silently.** Where: column menu › "Archive the column" (`t-col-archived.png`). I archived "To do" with a card inside: the card vanished, the toast only said "Column archived", and search no longer finds the card ("No card found for 'LinkedIn'"). If the toast is missed, the only trace is "Archived columns" deep in Settings. **Fix (S):** say "Column archived with its 1 card" in the toast. When the column has open cards, ask where they should go (the next column / archive them too). Include archived items in search behind an "Include archived" toggle.
6. **No calendar or timeline view.** Asana's calendar and timeline and Monday's timeline and Gantt are weekly tools for anyone planning a launch or event. The README lists it as not done. **Fix (M):** a month calendar of due dates (read-only first, then drag to reschedule). Drop the timeline for now, but say so.
7. **No subtasks, dependencies, start dates or custom fields.** Asana users use subtasks daily (a checklist is not assignable and has no date), and Monday users build their whole board on custom columns (status, number, dropdown, person). These are the reasons a company is on Asana or Monday rather than Trello. **Fix (L):** assignable checklist items with a due date (covers 80 % of subtasks), a start date, and 3 custom field types (text, number, dropdown) per board shown in the list view. Automations stay out, but write that in the README.
8. **The list view is not a work tool.** Where: `t-list.png`. Columns cannot be sorted (by date, person), rows cannot be opened with the keyboard, there is no inline edit and no grouping. Asana's list is its main view. **Fix (M):** sortable headers, a title link, group by column/person/date, and "Show done" off by default.
9. **Comments cannot be edited or deleted in the UI.** Where: `lib/cards.ts` has `editComment` and `removeComment` and `app/chest/actions.ts` exposes them, but `card-panel.tsx` never calls them (grep). A typo, or a password pasted in a comment, stays forever. **Fix (S):** "Edit" and "Delete" (with Undo) on your own comments; managers delete any.
10. **The viewer's empty state tells them to do what they cannot do.** Where: Sofia (viewer), empty Chest (`t-empty-viewer.png`). It says "Start with a board… Create one, then add the first cards." with no button, because viewers cannot create. **Fix (S):** for viewers, "No board shared with you yet. Ask a manager (Camille Martin) to add you."
11. **Search misses comments, checklists, archived cards and labels.** Where: `lib/cards.ts` `searchCards`, which covers title and description only. "Where did someone write the supplier's phone number?" is a comment. **Fix (S/M):** add comments and checklist text to the `search` tsvector, plus an "Include archived" toggle.

## Minor

1. **The description is plain text.** Links are clickable, but there is no bold, no list and no heading. Trello uses Markdown. **Fix (S):** a small Markdown subset (bold, lists, links), rendered safely.
2. **One checklist per card.** The research itself said "several checklists allowed (Planka's one-checklist limit is a known complaint)". **Fix (S).**
3. **The due date has no time.** "Call the client at 3pm" is not possible. **Fix (S):** an optional time.
4. **No card cover, no copy card, no card templates, no "watch" (follow) a card.** "Copy" is used weekly on process boards. **Fix (S):** "Duplicate" in the card panel.
5. **"Drop cards here" on every empty column** (`t-newboard-created.png`) reads as an instruction on a first visit; the real action is "Add a card" just below it. **Fix (S):** show that text only while dragging.
6. **The person filter is labelled "Everyone" / "Tout le monde"**, which reads like a visibility setting on a board that is private. **Fix (S):** "Anyone" / "Tout le monde" becomes "All people" / "Toutes les personnes", or a "Person: all" label.
7. **Settings mix "Everyone in Tasks" with a visible Groups row** that does nothing in that mode (`t-settings.png`). **Fix (S):** show people and groups only when "Only these people and groups" is selected.
8. **Adding a person in Settings takes two steps** (a select, then a separate "Add someone" button that stays disabled). **Fix (S):** add on select.
9. **The board header stays bright yellow in dark mode** (`t-board1-dark.png`). It is fine for identity, but the whole page glares at night. **Fix (S):** a darker board tint token in dark mode.
10. **The seed history says "created the card 1 minute ago" under a comment from "3 hours ago"** (card panel). This shows in the screenshots the owner judges. **Fix (S):** set `created_at` in `seed/sample.sql`.
11. **The native `<input type=date>` showed `mm/dd/yyyy` (`09/27/2026`) in my en-GB run** (`t-card-emptytitle.png`, and `docs/screens/card-desktop.png` too). The format follows the browser's UI language, not the member's Chest locale, so a French member on an English browser gets US dates. **Fix (M):** a small date picker that formats in the member's locale, or show the formatted date beside the input.

## Bugs

1. Enter on a focused card starts a drag instead of opening it (Blocker 1). Steps: Tab to a card, press Enter; `aria-pressed` becomes true and the panel does not open.
2. The New board dialog's autofocus is on Close (Major 2). Steps: *Create a board*, type a name; nothing is typed.
3. A private board is created with no people and no private marker (Major 3).
4. An archived column's cards disappear from search (Major 5). Steps: archive a column containing "Post on LinkedIn", then search "LinkedIn" and get "No card found".
5. Clearing the card title and tabbing away silently reverts it, with no message (`t-card-emptytitle.png`). Minor, but say "A card needs a title".

## Migration in / out

- **In:** Trello JSON (lists, cards, checklists, comments, labels, archived state), Asana CSV and a generic CSV (with French `;` sheets) exist. Good. Missing: **attachments** (never imported; the user is not told how many were dropped), **Monday** (Monday exports to Excel; accept `.xlsx` or document "save as CSV"), **multiple boards at once** (a Trello workspace has 10-30 boards: one file at a time is an afternoon of clicks), a **preview/mapping step**, and a report of **unmatched people** before import (today unmatched assignees are silently dropped and comment authors become the importer with an "imported_author" name).
- **Out:** CSV and JSON per board. Missing: **all boards at once** (a company leaving needs one archive) and files in the export (links only). **Fix (M):** "Export everything" in an admin page, as a zip of JSON plus files.

## UX notes

- First minute (empty): "Start with a board" plus one button, which is good (`t-empty-admin.png`, `t-empty-phone.png`). The first board is 3 clicks to create and one Enter per card. Quick add keeps focus for the next card, which is excellent.
- Page loads are 0.8-1.6 s to network-idle on the harness (Next production build): acceptable, and not slow.
- On a phone the board shows one column and a sliver of the next (`t-board1-phone.png`). There is no column switcher; horizontal swipe is the only way to reach "Done" on a 6-column board. **Fix (S):** column tabs or snap scrolling with a "2 / 5" indicator.
- French is natural ("Rien au programme", "Apportez vos tableaux", "Me rappeler chaque matin de semaine…"; the last one is a bit heavy: "Me rappeler chaque matin (lun.–ven.) ce qui est à faire").
- Roles are clear: "Camille · Manager" in the header is good, and Nora (no role) gets "You can't use Tasks yet".

## Trust for the buyer

Good: archive-not-delete everywhere, Undo toasts, per-card history, a JSON export, leavers' cards unassigned with a history line, and GDPR erasure. Missing: a **board-level history** ("who deleted the column?"), an **admin view of all private boards** (managers can open them, but there is no list that says "private" plus owners), a warning when a board's **last owner leaves** (who owns it then?), and a company-wide export. Private-by-mistake and public-by-import (Majors 3 and 4) are the two things that would make an office manager distrust it.

## Fix plan (ordered)

1. Keyboard: Enter opens the card, list rows are links, plus a flow test. **S**
2. Autofocus the Name field; add a people picker to "Only people I choose"; show a private marker in the header. **S**
3. Imports: private by default, a "Who sees it" choice, and a preview step with unmatched people and dropped attachments. **M**
4. A "Mark done" button in the card panel. **S**
5. Archive column: count the cards and offer where they go; search can include archived. **S**
6. Edit and delete own comments. **S**
7. Move or copy a card to another board. **M**
8. Viewer empty state. **S**
9. Email for assignment, mention and the morning digest via the SDK outbox proposal (or an SDK report entry). **M**
10. List view: sortable, grouped, openable. **M**
11. Calendar view of due dates. **M**
12. Assignable checklist items with dates (subtasks), a start date, 3 custom field types. **L**
13. Export all boards at once; import several Trello boards at once. **M**
14. Minors: Markdown description, several checklists, due time, duplicate card, dark header tint, locale-proof date input, seed dates. **S each**

Harness note: `lab/chest-dev/dev.mjs` says "--reset starts it empty", but line 94 loads `seed/sample.sql` whenever the database is fresh, so `--reset` always seeds. An `--empty` flag is needed to judge first visits. I emptied the tables by hand.


## October 2026: after the move to the new stack

_Added 6 October 2026 from Tasks's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **142.2 → 74.7 MiB**;
  image 461 → 32 MiB; first members' page 761 →
  382 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: drag between columns without a render loop (React error #185 near the bottom of an empty column, or after Escape); one panel per card, the focus given back to the card that opened it; cards keep the order they were typed in — every path that places a card locks its column, with concurrent-add tests that fail without the lock on PostgreSQL (`ba2e41e`). Pages left open re-read themselves only when their reader comes back (the package's `useAutoRefresh`, `c1a83b7`).
- **Pending**: Nothing listed as pending in its commits.
