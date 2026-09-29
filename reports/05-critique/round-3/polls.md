# Polls (tools/private/polls) vs Doodle, Officevibe — critique round 3

**Setup.** I ran this on 2026-09-29, harness port 11100: `npm run build`, then `dev.mjs --prod --reset` (seeded), then `--reset --empty`.

**The tool's flow** (`flows/polls.mjs`) passes 20/21. The failing step is "a closing day before today is refused … the day field has the focus". I reproduced it by hand three times (`polls-past.mjs`), and each time the focus *is* on `#closes-day`, both after Save draft and after Send. So this is a **flaky assertion** (a focus race), not a product bug. It still has to be made deterministic: a red flow on the lead's machine hides real regressions.

**My passes.** Scripts: `sweep.mjs`, `one.mjs`. Screenshots: `shots/polls-*`, `p-*`, `pe-*`. Coverage:
- **People:** Sofia (organiser), Hugo (member, en), Camille (admin, fr), Nora (member, fr).
- **Pages:** home, the sign-up date poll, the open pulse round, a closed survey, the date composer.
- **Displays:** 1280 px, 390 px, dark; own (Confetti), Chest, brand:sample, brand:port in light and dark.

No page scrolls sideways and there are no console errors.

## Verdict

**Can a 50-person French company cancel Doodle or Officevibe tomorrow?**
- **Doodle for internal dates and sign-up sheets: yes.** Doodle for clients and candidates: **no**, because there is still no guest link.
- **Officevibe: not yet.** Per-team results, the guard on pulse surveys, and eNPS are now real. What is still missing is Officevibe's **anonymous two-way feedback** (a manager replies to an anonymous comment), a question bank, and manager-level views (platform).

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 5.5 | 7.5 | **8** |
| UX | 8 | 8.5 | **9** |

Strength: the anonymity model, which now includes per-team results with subtraction-proof hiding, is the most careful in the store and a real sales argument to a CSE.

## Round-2 top fixes and blockers

| Round 2 | Status | How checked |
|---|---|---|
| Fix 1a: pulse and eNPS for organisers only | **Fixed** | Hugo's empty home (`pe-p-hugo-0.png`) offers only Question, Date and Survey. An admin switch opens the rest to everyone |
| Fix 1b: per-team results | **Fixed** | Chest groups via `groups: "read"`, a floor of 5 answers, deducible groups hidden and the page says so (flow step) |
| Fix 2: external date-poll link | **Not fixed** | README: "Guests outside the Chest: no public answering link" |
| Fix 3a: "Asked by you" | **Fixed** | `polls-d-sofia-0.png`: state, "4 of 7 answered" with a bar, closing time. Her own polls are no longer in To answer |
| Fix 3b: honest sign-up grid | **Fixed** | `p-nora10.png`: "Places prises 2/2 Complet · 1/2 1 place restante"; "4 dates : faites glisser pour toutes les voir →"; a full slot's *Oui* is disabled |
| Fix 3c: pulse template in the asker's language | Fixed per the flow | Flow step "the sample pulse is in its asker's language" |
| Minor: confetti over the button on phones | **Fixed** | `pe-p-hugo-0.png` |
| Coherence: `.ics` vs the Chest calendar (News) | **Not fixed** | `chest.proposals.json` declares no `calendar`; "Tell everyone" still gives an `.ics` (README l.81) |
| Blocker: question bank / drivers | Not fixed | |
| Blocker: reminders beyond the Chest | Email yes (proposal); no push | |

## Still blocking (weekly, for a paying customer)

1. **Doodle guests.** "Find a slot with the client / the candidate / the accountant" is Doodle's most frequent paid use in an SME, and it stays on Doodle. Round 2 called it L and platform-dependent. It is not: `tools/public-and-private/` exists, and Booking and Forms already answer visitors on the public host. The builder can move Polls there and add a guest link to date polls with the store's existing public pattern: a name field, rate limits, "guest" answers.
2. **Officevibe's anonymous conversations.** In Officevibe the manager **replies** to an anonymous comment ("Thanks — what would help with the workload?") and the author, still anonymous, can answer. That dialogue is the reason teams keep Officevibe after the novelty of the scores. Here free texts are a dead end: shown in random order after close, with no reply possible.
3. **No question bank, no drivers.** The pulse has three fixed questions. An HR buyer compares that with Officevibe's rotating, validated library (recognition, workload, manager relationship, wellness).
4. **Per manager** (Officevibe's heat map): platform-dependent, since the Chest has no manager relation. Per group is a good substitute only if groups mirror teams.

## New problems (missed by round 2)

1. **The seeded sign-up poll contradicts itself.** "Open day: who holds the stand?" says "Two people per slot at the **Saturday** open day", but all four slots are **dimanche 11 octobre** (11 Oct 2026 is a Sunday). The owner demos this exact poll. Fix the seed text or the dates.
2. **The flow is red** (above). The lead verified every tool, yet this run fails one step. Either the assertion is racy or the focus moves after the error renders. Wait for the focus (`waitForFunction`) instead of reading it once.
3. **Chest calendar coherence is still open.**
   - A date chosen in Polls lands as a downloaded `.ics`.
   - An event in News lands in the person's Chest calendar feed.
   - Same company, same question ("put it in my calendar"), two behaviours.
   - The `calendar` proposal is built and News uses it.
4. **The same pulse twice in "To answer".** Sofia sees "Météo de l'équipe · Round 5 · closes Sun 4 Oct" and "Météo de l'équipe · Round 1 · closes Tue 6 Oct" as two identical-looking cards side by side (`polls-d-sofia-0.png`). The round 1 is a new pulse started by the flow, but nothing tells them apart except the tiny "Round" chip. Two pulses with the same title should be refused, or the new one should be named ("Météo de l'équipe (2)").

## Platform-dependent

- **Per-manager results:** a manager relation in the Chest's members (not proposed).
- **Push reminders:** not proposed.
- **Guests:** *not* platform. The public host exists (see still blocking 1).
- **The Chest calendar:** the `calendar` proposal is built and just needs declaring.

## Top 3 fixes now

1. **Guest answers on date polls, on the public host (M/L).**
   - Move Polls to `public-and-private`.
   - An organiser switches "Anyone with the link can answer" on a date poll. Guests type a name, their answers are marked "guest", rate-limited, never anonymous, with no comments.
   - The organiser copies the link. This is the line that makes "cancel Doodle" true.
2. **Anonymous replies (M).** On a closed anonymous survey, the organiser can reply under a free text. The author, who holds nothing identifying, receives it through a random per-answer token kept only in their own browser (a "your answer was replied to" page lookup by that token). No member id is linked to the text. Document it in the Works council paragraph.
3. **Coherence and polish (S).**
   - Declare `calendar` and put the chosen date in each person's Chest calendar, as News does (keep the `.ics`).
   - Fix the Saturday/Sunday seed.
   - Make the flaky focus step deterministic.
   - Disambiguate pulses with the same name.
