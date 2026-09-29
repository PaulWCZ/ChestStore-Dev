# Goals (tools/private/goals) vs Lattice Goals, Perdoo — critique round 2

Run on 2026-09-29, harness port 7100. Build: `npm run build`, then `dev.mjs --prod --reset` (seeded) and `--reset --empty`. The tool's own flow (`flows/goals.mjs`) passes 25/25.

My own passes are in `critique2/collab/` (`shots/g-*`, `ge-*`, `gh-*`):
- **People:** Camille (admin, fr), Hugo (member, en), Nora (no role).
- **Pages:** My goals, Company, an objective, new objective, teams, import, settings.
- **Views:** 1280 px, 390 px phone, dark.
- **Looks:** own (Trail map), Chest, sample brand, Magazine.
- **Also:** keyboard tab order on *My goals*.

No page scrolls sideways and there are no errors. Hugo gets a 404 on `/chest/settings`, which is expected.

## Verdict

**Can a 50-person French company cancel Perdoo (or its OKR spreadsheet) tomorrow? Yes**, on a Chest that sends email (the Friday reminder and *Remind*). Without `mail`, the method dies in week 4, just as round 1 said.

**Lattice: no.** This is by design: its buyers pay for reviews, 1:1s and feedback, which Goals refuses for legal reasons.

- **Completeness 6.5 → 8.5.** Both round-1 blockers are fixed: the next quarter near a quarter's end, and CSV import with a Lattice preset. Six majors are fixed too: the manager "waiting for a check-in" list with *Remind*, company filters, confidential objectives, plain key-result wording, target-change history, and a CRM-fed key result.
- **UX 8 → 8.5.** The check-in is still the best main action in the batch. It is kept from a 9 by OKR words that remain ("Check in", "customer/customers"), the phone *Company* page, and a Chest-theme mismatch.

Strength: two clicks for a weekly check-in, "Same as last week" in one, and a history that says who lowered a target. More honest than Perdoo.

## Round-1 findings

| Round 1 | Status | How checked |
|---|---|---|
| B1 Empty Chest on 29 Sept offers Q3 with 1 day left | **Fixed** | `--empty`, Camille: "Le T3 2026 touche à sa fin (1 jour restant) : préparez le trimestre suivant." Main button "Lancer le T4 2026 (1 oct. – 31 déc.)"; "Ou lancer le T3 2026 tout de suite" is secondary |
| B2 No import | **Fixed** | Flow: Lattice file, columns guessed, unknown owner reassigned, Undo. Import page offers "Télécharger un exemple" |
| M1 No "who has not checked in" | **Fixed** | Company page, "En attente d'un point cette semaine · 4 personnes en attente"; Remind sends a bell item and an email (flow) |
| M2 Reminders only in the bell | **Fixed on the studio Chest (platform-dependent)** | Friday reminder by email via `mail`, with a per-person switch (flow) |
| M3 Company tree not filterable | **Fixed** | Chips for state (with counts), team and owner, kept in the URL |
| M4 No automatic values | **Partly** | Key result fed by Clients (deals won, amount). Company-wide only, deals after linking only, no other source |
| M5 No confidential objectives | **Fixed** | "Who can see it": everyone, its team, or chosen people (flow: Tom sees it, Sofia does not) |
| M6 KR form speaks OKR | **Mostly fixed** | "How we'll measure it (key results)", weight under "More options", team after the title. Still: the unit field asks for "customer/customers" |
| Minors: plurals, placeholder, "Same as last week", chart label, bar colour, localised cycle names, scoring | **Fixed**, except that cycle names are data in one language (below) | "What moved, or what is in the way"; one score per objective at close |
| Trust: edit history of targets | **Fixed for key results** | Flow: a lowered target shows with who changed it. Title, owner and parent changes of an *objective* are not kept (README) |

## Still blocking (what a Perdoo customer misses weekly)

1. **Only the CRM feeds values, and only company-wide.** Perdoo customers wire key results to spreadsheets, Jira or HubSpot so nobody types numbers. Here "deals won by the key result's owner" and "deals won before the link" are missing. No other store tool feeds values: Tasks cards done, Helpdesk tickets solved and Timesheets hours are all in the same Chest.
2. **The nudge channel is email only.** The check-in ritual runs on Slack/Teams nudges in most Perdoo accounts. There is no push, and no chat integration.
3. **No KPIs (metrics without a target date).** Perdoo sells "KPIs + OKRs" together. Companies track "NPS", "cash runway" and "on-time delivery" continuously next to their quarterly objectives. The README lists this as not done.
4. **No history of the objective itself.** A title rewritten or a parent changed in week 10 is silent. It is the same trust hole as round 1, one level up.

## New problems found this round

1. **Data in one language leaks across languages.**
   - Hugo (English) sees the cycle chip **"T1 2027"**, because Camille created it in French.
   - Camille (French) reads "**0 customer / 9 customers / 20 customers**" on "Win 20 new customers in Lyon" (`g-own-camille-d-_chest_objectives_4.png`).

   Cycle names that the tool generated ("Q1 2027" / "T1 2027") are the tool's own text and should render in each reader's language until an admin renames them (store rule §2.11). Units are user text, so leave them as they are.
2. **The unit field asks for a slash form.** "customer/customers — Write both forms, like customer/customers, to read '1 customer'" (`gh-new-full.png`). This is a developer's pluralisation rule pushed onto the office manager. Better: ask for the plural ("customers") and show a small "one: customer" field only when the start or target could be 1. French also needs gender-free wording ("1 client", "2 clients").
3. **"Check in" is still the English verb on the main button**, next to "Same as last week". French "Faire le point" is good; English "Check in" reads as hotel or airport to a non-native speaker. Consider "Update" / "Save this week's number".
4. **The phone *Company* page buries the tree.** At 390 px, the title, the cycle chips (wrapping to two rows), "Importer depuis un tableur", "Télécharger en tableur", the progress card, the confidence card and the waiting list all come before the first objective. That is about three screens down in the Chest theme (`g-catalogue_chest-camille-p-_chest_company.png`). Import and download are rare admin actions: put them in a menu.
5. **In the Chest look, Goals keeps a black app bar** ("Goals' header on --inverse", commit 83450ff). Tasks and Wiki are light in the same look. A company that picks "Chest for all tools" to get one coherent look gets Goals as the odd one out. In brand mode the bar also stays dark. That is fine for identity, but the look contract is "same features, the company's look".
6. **Empty-state inconsistencies.**
   - A member reads "An admin starts the first cycle", while Tasks names the managers ("Ask Camille Martin").
   - The admin's empty page offers "start a cycle" but not "import from a spreadsheet". A Perdoo switcher must start a cycle, then find *Import* on *Company*.
7. **The French "En retard" for *off track*** collides with Tasks' "En retard" (*late*). An off-track objective is not late. "Hors trajectoire" or "Décroché" would avoid a store-wide collision.
8. **Minor:** the phone nav wraps "Mes objectifs" onto two lines in a five-tab bar, which is readable.

Looks: Chest (shapes ●▲■ keep confidence readable without colour), sample brand in dark, and Magazine are all readable. Charts hold. Nothing broken beyond item 5.

## Platform-dependent

- Friday reminder and *Remind* by email: **`mail` proposal**.
- Friday and Monday runs: **`schedules` proposal**.
- CRM-fed key results: studio **events between tools** (`receives: crm.deal.won`). What is missing is a **read API between tools** ("deals won in these dates, by this owner", history before the link): an SDK-report item.
- Team = Chest group for a tool open to everyone: **`groups: "read"` proposal**, which News uses and Goals does not.
- `members.lookup` answers `unknown` for someone who lost access (README / PROGRESS): SDK wish `{status: "revoked"}`.
- "Their manager" as an audience: needs a manager relation from the Chest (not proposed).

## Top 3 fixes now

1. **Key results fed by the store's own tools, per owner (M/L).** Add a read API between tools in the SDK, then offer "Deals won by the owner" (Clients), "Cards done on board X" (Tasks), "Tickets solved" (Helpdesk) and "Hours logged" (Timesheets). This is the suite argument no Perdoo can make, and it removes the weekly typing.
2. **Language-proof generated names and a plain unit field (S).**
   - Render tool-generated cycle names in the reader's language until renamed.
   - The unit field asks for the plural only.
   - Rename English "Check in" to "Update" and French "En retard" (off track) to a word that is not Tasks' "late".
3. **Phone *Company* and Chest-look coherence (S).**
   - Move import and download into a "···" menu, and put the tree right after the progress.
   - Use the theme's normal bar in catalogue and brand looks, keeping the inverse header for Trail only.
   - Add "Import from a spreadsheet" to the admin's empty state.
