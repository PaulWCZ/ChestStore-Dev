# Goals (tools/private/goals) vs Lattice Goals, Perdoo — critique round 3

Run on 2026-09-29, harness port 11100: `npm run build`, then `dev.mjs --prod --reset` (seeded), then `--reset --empty`. The tool's flow (`flows/goals.mjs`) passes 28/28.

My own passes (`sweep.mjs`, `one.mjs`, `goals-y.mjs`; screenshots `shots/goals-*`, `g-*`, `ge-*`) covered:
- **People:** Camille (admin, fr), Hugo (member, en).
- **Pages:** My goals, Company, an objective, New objective.
- **Screens:** 1280 px, 390 px, dark.
- **Looks:** own (Trail map), Chest, brand:sample, brand:port light and dark.
- **Also:** the phone Company page measured.

No page scrolls sideways and there are no errors.

## Verdict

**Can a 50-person French company cancel Perdoo (or the OKR spreadsheet) tomorrow? Yes**, on a Chest that sends email.

**Lattice Goals, for a company that bought Lattice for goals only: yes.** For its buyers of reviews, 1:1s and feedback: **no**, and that is by design.

What still separates Goals from Perdoo weekly is:
- values typed by hand, because only the CRM feeds them;
- no KPIs.

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 6.5 | 8.5 | **8.5** |
| UX | 8 | 8.5 | **8.5** |

Completeness is unchanged: no new data source, no KPIs, no objective history. UX is stuck because the phone Company page still puts the tree more than a screen down.

Strength: the weekly check-in (two clicks, "Same as last week", Undo) and the target-change history remain more honest than Perdoo.

## Round-2 top fixes and blockers

| Round 2 | Status | How checked |
|---|---|---|
| Fix 1: key results fed by the store's tools, per owner | **Not fixed** | README: CRM only, company-wide, deals after the link only; "no other tool feeds values yet" |
| Fix 2a: generated cycle names in the reader's language | **Fixed** | Hugo reads "Q1 2027", "Aug – Nov 2026"; Camille reads "T1 2027", "août – nov. 2026" |
| Fix 2b: unit field asks for the plural | **Fixed** | README: plural typed, singular guessed in a small field |
| Fix 2c: English "Check in" | **Not fixed** | `goals-chest-hugo-0.png`: the link still reads "Check in" |
| Fix 2d: French "En retard" for off track | **Fixed** | "Hors trajectoire" (`goals-p-camille-1.png`) |
| Fix 3a: phone Company, import and download in a menu | **Fixed** | "··· Tableur / Spreadsheet" |
| Fix 3b: tree right after progress | **Not fixed** | The first objective starts at **y ≈ 1,075 px** at 390×844 (`g-company-hugo-full.png`). Above it come: the header, "Nouvel objectif", cycle chips (2 rows), the Spreadsheet menu, the progress card, the confidence card, and three filter groups (Status, Team, Owner). The flow step "shows the tree first" passes, but a person does not see it |
| Fix 3c: Chest look keeps the black bar | **Fixed** | `goals-chest-hugo-0.png`: the kit's light header; Trail keeps its dark band |
| Fix 3d: import in the admin's empty state | **Fixed** | `ge-d-camille-0.png`: "Lancer le T4 2026 et importer un tableur" |
| Blocker: KPIs | **Not fixed** | |
| Blocker: objective history (title, owner, parent) | **Not fixed** | README |
| Blocker: nudges beyond email | Not fixed (platform) | |
| Minor: the member's empty state names nobody | **Not fixed** | `ge-d-hugo-0.png`: "An admin starts the first cycle", while Tasks names the managers |
| Coherence: `groups: "read"` | **Not fixed** | `chest.proposals.json` still does not declare it. A company that opens Goals to everyone, with no groups giving it, gets no Chest groups as teams, while News, Wiki and Polls now all have them |

## Still blocking (weekly, for a Perdoo customer)

1. **Numbers are typed by hand.**
   - Perdoo's weekly value is automatic key results (spreadsheets, Jira, HubSpot).
   - Here, one source (the CRM, company-wide) is all there is.
   - The store holds the obvious other sources in the same Chest and none are wired:
     - Tasks cards done on a board;
     - Helpdesk tickets solved;
     - Timesheets hours;
     - Forms submissions;
     - Hiring hires.
   - Events already flow between tools (Forms → Clients, CRM → Goals). This is buildable **today** for counts that are events: `tasks.card.done`, `helpdesk.ticket.solved`, `hiring.hire`. It does not need to wait for a read API.
2. **No KPIs.** "Cash runway", "on-time delivery" and "NPS" are tracked continuously next to the quarter's OKRs. Perdoo sells both on one screen. A key result with no cycle end ("a health metric") is a small model change.
3. **An objective's own history is silent.** Title rewritten, owner changed, parent moved in week 10: nothing is kept. Key results are covered; objectives are not.
4. **Nudges in chat.** Most Perdoo accounts run the check-in through Slack or Teams. Push and chat are platform items.

## New problems (missed by round 2)

1. **The phone Company page flow check proves the wrong thing.** The step "the phone Company page shows the tree first" passes while the tree is 1.3 screens down. It likely checks DOM order after the cards, not position. Three filter groups (Status, Team, Owner, with a text box) are always open on a phone. Fold them behind one "Filter" button, as Tasks now does: that is the store's own pattern.
2. **Units: French plural rules are applied to English words.**
   - Camille (fr) reads "Départ **0 customer**" beside "9 customers · 20 customers" on "New customers signed" (`goals-d-camille-2.png`).
   - Hugo (en) reads "0 customers" for the same number.
   - The singular/plural choice follows the *reader's* language (French: 0 is singular) while the word is in the *writer's* language. It should follow the unit's language, or treat 0 as plural whenever the plural form differs.
3. **The member's empty page is a dead end** ("An admin starts the first cycle. Until then, there is nothing to set.") with no name. In the first week of a new Chest, every member lands here. Say "Ask Camille Martin to start the first quarter" (the admins' names), as Tasks does.
4. **Store coherence on groups.**
   - After this round, News, Wiki and Polls use `groups: "read"`; Goals is the only one of my five that does not.
   - Teams in Goals are the store's most group-shaped concept.
   - A company that gives Goals to "everyone" sees no Chest groups to add as teams and must type names by hand, duplicating the Chest's list.

## Platform-dependent

- Friday reminder and *Remind* by email: **`mail`**; the Friday and Monday runs: **`schedules`**.
- History before the link, per-owner CRM values: a **read API between tools** (SDK report).
- "Their manager" as an audience, manager views: a **manager relation** in the Chest (not proposed).
- Push and chat nudges: not proposed.
- Not platform: event-fed counts from Tasks, Helpdesk and Hiring (see still blocking 1), and `groups: "read"` (built).

## Top 3 fixes now

1. **More key-result sources from events that already exist or are cheap (M).**
   - Tasks emits `tasks.card.done` (board, assignee); Helpdesk emits `helpdesk.ticket.solved` (assignee); Hiring emits `hiring.candidate.hired`.
   - Goals receives them and offers "Cards done on board X", "Tickets solved (by the owner)", "Hires".
   - Count from the link onward, per owner when the event names the assignee.
   - This is the suite argument, and it needs no read API.
2. **A readable phone Company page (S).**
   - Fold Status, Team and Owner behind one "Filter" button (as Tasks does).
   - Collapse the confidence card into one line under the progress bar, so the first objective shows above the fold.
   - Fix the flow check to measure the position on screen.
3. **Coherence fixes (S).**
   - Declare `groups: "read"` and offer every Chest group as a team.
   - Name the admins in the member's empty state.
   - Pluralise units by the unit's own form (0 is plural when the plural differs).
   - Rename English "Check in" to "Update".
   - KPIs (key results without an end) as the next M.
