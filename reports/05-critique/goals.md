# Goals (tools/private/goals) vs Lattice Goals, Perdoo: severe critique

Screenshots: `critique/collab/shots/g-*.png`. Harness on port 7100 (`--prod --reset`, seeded), then emptied (`truncate cycles, objectives, teams, key_results, check_ins, comments, departed`). Tested as Camille (admin, fr/en), Hugo (member, en), Nora (no role); desktop, 390 px phone, dark, French, keyboard, a wrong value.

## Verdict

**Can a 50-person company cancel Perdoo, or Lattice *Goals*, tomorrow?**
- **A company that runs OKRs in a spreadsheet or Perdoo's basics:** not yet, but very close. There is no import, the one-click start picks the wrong quarter, and there is no manager "who has not checked in" view and no email nudge.
- **Lattice:** no, because Lattice customers buy Goals bundled with 1:1s, reviews and feedback, which this tool deliberately refuses (legally reasoned).

**Completeness 6.5/10**: cycles, alignment tree, weighted key results, check-ins with confidence, charts, carry-over and CSV are solid. Import, integrations, private goals and manager views are missing. **UX 8/10**: a two-click weekly check-in with Undo, readable charts, and plain confidence words. There is some OKR jargon, and the start-cycle bug is the first thing an admin meets.

Strength in one line: the weekly check-in card on *My goals* is faster than Perdoo's.

## Blockers

1. **An empty Chest on 29 September offers "Start Q3 2026", a cycle with 1 day left.** Where: empty *My goals* for an admin (`g-empty-admin.png`), then `g-started.png`: "Q3 2026 · 1 Jul – 30 Sept 2026 · Week 13 of 14 · 1 day left". The README's own First minute says "Start Q4 2026". An admin who installs Goals at the end of a quarter (the moment companies plan OKRs) starts a dead cycle, and then has to find *Cycles* to fix it. **Fix (S):**
   - From 2 weeks before a quarter ends, offer the **next** quarter ("Start Q4 2026 (1 Oct – 31 Dec)"), with a secondary "or the current one".
   - Show the dates on the button.
   - Add a test for 29 September.
2. **No import at all.** Where: README "What it does not do": "Import from Lattice or a spreadsheet (the research lists it; not built)". `reports/02-open-source/goals.md` lines 76-77 mark both as **MVP**, with the Lattice CSV columns already researched. A company with 40 objectives and 120 key results in Perdoo or a Google Sheet will not retype them, and the admin will stop at "Write the first objective". **Fix (M):** a CSV import with a column-mapping step (Objective, Key result, Owner email or name, Start, Target, Current, Unit, Team, Parent objective). Match owners by name or email through `members`, and preview unmatched rows. Accept the Lattice bulk template as a preset.

## Major

1. **No manager view of who has not checked in.** The research's "digest to managers" was not built. An admin sees "1 Quiet" (a tally) but not *who* is late across the company. Perdoo and Weekdone's weekly ritual is "the list of people who have not updated", which the manager chases on Friday. **Fix (S):** on *Company*, a "Waiting for a check-in this week" list (key result, owner, days since the last one), with "Remind" (a bell item, once a day at most).
2. **Reminders exist only in the bell.** The Friday reminder is a bell item only; Perdoo and Lattice email and Slack people. The whole OKR method dies when check-ins stop in week 4. **Fix (M, SDK outbox):** email the Friday reminder, with a per-person switch.
3. **The Company tree cannot be filtered.** On `g-company-camille-fr.png` and phone `g-company-phone.png` there is no filter by team, owner or status ("show me only At risk / Off track"). At 200 people and 60 objectives the page is a long scroll. **Fix (S):** status chips (At risk / Off track / Quiet) and a team or owner select, kept in the URL.
4. **No automatic values.** "Revenue from new customers €18,000" is typed by hand, though the store has a CRM and Quotes tool. Perdoo and Lattice integrate with Salesforce and HubSpot. This is the suite argument the brief asks for. **Fix (L, SDK):** a "fed by another tool" key-result source through an inter-tool data API. Write the proposal in the SDK report, with CRM "deals won this cycle" as the first use.
5. **No private or confidential objectives.** Everything is visible to everyone. The legal reasoning for personal goals is good, but *team* confidentiality ("Management: reduce headcount cost 10 %") is a real need. Lattice has private goals. **Fix (M):** "Visible to: everyone / this team / these people" on an objective, off by default.
6. **The key-result form speaks OKR.** Where: `/chest/objectives/new` (`g-new-objective.png`):
   - "Key result", "Counts: Normal" (the weight), and "Supports: Nothing, it stands alone".
   - The hint "From 0 to 20 customers" shows under an **empty** "To" field, built from placeholders, so it reads as a value already set.
   - "Team" is the first field while focus lands on "Objective".

   A 58-year-old office manager writing her first objective will hesitate. **Fix (S):**
   - Label "Key result" as "How we'll measure it (key result)".
   - Hide "Counts" behind "More options".
   - Show the hint only once "To" has a value.
   - Put "Team" after the title, or focus it first.

## Minor

1. **"Now 1 customers" / "1 customers / 0 customers"** (`g-my-hugo.png`). The unit is free text and never pluralised. **Fix (S):** ask for the unit in the plural and show numbers without the unit when the value is 1, or accept "customer/customers".
2. **The "What happened?" placeholder is the same on every key result**: "Two new customers signed this week" on "Customers lost". **Fix (S):** a neutral example ("What moved this week?").
3. **"Nothing changed" takes 2 clicks, not 1.** For a quiet week the value is prefilled, but the owner still presses *Check in*. **Fix (S):** a quiet "Same as last week" button that keeps the value and confidence.
4. **Chart labels collide**: "0 customers" overlaps "21 Aug" at the chart's bottom-left (`g-objective.png`). **Fix (S):** offset the y-axis label.
5. **Progress bars are all the same orange whatever the confidence.** Confidence is shown as a chip beside the bar. At a glance the tree reads "everything is orange". **Fix (S):** a neutral bar colour, with confidence carried by the chip (or tint the bar by confidence, with shapes kept for accessibility).
6. **The cycle name "Autumn 2026" is not translated** (French screens show "Autumn 2026 · En cours"). That is data, but the default names ("Q4 2026" or "T4 2026") should follow the admin's language. **Fix (S).**
7. **Scoring/grading at close** (0.0-1.0, Google-style) is in the research MVP ("final score per key result"). The review shows final progress; check that a *score* is asked for and exported.

## Bugs

1. The one-click cycle is the current quarter even with 1 day left (Blocker 1). Steps: an empty Chest on 29 September, as admin, "Start Q3 2026".
2. Pluralisation of units (Minor 1).

No other bug met: check-in, Undo toast, and "Write a number, like 12 or 12.5." for "abc" (`g-invalid.png`) all work; the keyboard order on *My goals* is logical (value, confidence radios, note, Check in); pages load in 0.7-1.1 s; no horizontal overflow at 390 px.

## Migration in / out

- **In:** nothing (Blocker 2).
- **Out:** a CSV per cycle in the reader's language (`;` and decimal commas in French). Good. Missing: the check-in *history* in the export (only the current values?). Verify, and add a "check-ins" CSV, which is what a company leaving needs to keep its trend.

## UX notes

- First minute: the empty admin sees one button (with the wrong quarter). Members see "An admin starts the first cycle", which is honest. After a start, "Write the first objective" plus "Add an example" is good.
- The weekly check-in on *My goals* is the best-designed main action in this batch: the prefilled value, three confidence buttons with shapes, one line of note, then *Check in* and an Undo toast (`g-after-checkin.png`).
- French is natural ("En bonne voie", "Sans nouvelles", "Objectifs d'équipe sans lien avec un objectif d'entreprise"). "Sans nouvelles" for quiet is a good choice.
- Dark mode (`g-objective-dark.png`) is consistent.

## Trust for the buyer

Good: Undo everywhere, closed cycles frozen but readable, the "needs a new owner" list when someone leaves, and the refusal of ratings and pay links documented with the Code du travail. Missing: an **edit history on an objective** (a target silently lowered from 20 to 12 in week 10 changes the progress: who did it?). **Fix (S):** log changes of target, start and weight, and show them in the key result's history.

## Fix plan (ordered)

1. Start the next quarter near a quarter's end, plus a test. **S**
2. A CSV import with mapping (plus the Lattice preset). **M**
3. The manager "waiting for a check-in" list with Remind. **S**
4. Company filters (status, team, owner). **S**
5. Form wording: key result, weight under "More options", the hint, field order. **S**
6. An edit history for targets and weights. **S**
7. "Same as last week"; placeholder; plurals; chart label; bar colour; localised cycle names. **S**
8. Email Friday reminders via the SDK outbox. **M**
9. Confidential objectives. **M**
10. Automatic values from the CRM through an SDK inter-tool API (SDK report). **L**
