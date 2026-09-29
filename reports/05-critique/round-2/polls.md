# Polls (tools/private/polls) vs Doodle, Officevibe — critique round 2

Run on 2026-09-29, harness port 7100:

- **Build and setup:** `npm run build`; `dev.mjs --prod --reset` (seeded) and `--reset --empty`.
- **The tool's own flow:** `flows/polls.mjs` passes 16/16.
- **My passes** (`critique2/collab/`, `shots/p-*`, `pe-*`, `ph-*`):
  - people: Sofia (organiser), Camille (admin), Hugo (member, en), Nora and Léa (members, fr);
  - pages: home, closed date poll, open sign-up date poll, pulse round, open anonymous round, composer;
  - viewports: 1280 px, 390 px phone with touch emulation, dark mode;
  - looks: own (Confetti), Chest, the sample brand, Receipt.
- **Result:** the page never scrolls sideways (the date grid scrolls inside its frame), and there are no errors.

## Verdict

**Can a 50-person French company cancel Doodle or Officevibe tomorrow?**

- **Doodle for internal dates and sign-up sheets: yes.**
- **Doodle for clients and candidates: no.** There is still no outside guest link.
- **Officevibe: not yet.** The weekly pulse, eNPS and the trend are now real. What is missing is what an Officevibe buyer actually pays for: breakdowns by team or manager, the question bank, and reminders that reach people outside the Chest.

**Completeness 5.5 → 7.5.** Added since round 1:

- members create polls;
- repeating surveys with an "Over time" trend and eNPS;
- people picked by name as an audience;
- comments, sign-up limits, "Remind those who haven't answered";
- email reminders via the proposal;
- options locked after answers ("Edited after 3 answers").

**UX 8 → 8.5.** The home and composer are still the store's model. The phone grid is contained. The anonymity rules are now strict and said in plain words.

Strength: the anonymity design is now stricter than Officevibe's. Nobody sees anything, admins included, until close, from 5 answers. A closed anonymous poll never reopens. And the README tells the buyer what it does *not* protect.

## Round-1 findings

| Round 1 | Status | How checked |
|---|---|---|
| B1 No recurring pulse / trend / eNPS | **Fixed (core)** | "La météo de l'équipe" tile; round 5 of a weekly pulse; "Over time" chart and table with the change since last round; eNPS "+33" with Critics/Neutral/Promoters. There are no team breakdowns (see still blocking) |
| B2 Only admins can create | **Fixed** | Hugo (member) on an empty Chest sees "Nouveau sondage" and four kinds. An admin can restrict it (flow) |
| M1 Date grid overflows phone | **Fixed** | `scrollWidth` 390 for Nora, Tom and Léa on a 4-slot date poll. The grid scrolls in its frame, but see new problem 2 |
| M2 Anonymous results live for organisers | **Fixed** | Camille (admin, organiser) on open anonymous round 5: "les résultats s'affichent pour tous à la fin du sondage — l'organisateur compris". Live is refused with anonymous; the CSV is refused while open |
| M3 No outside guests | **Not fixed** | README "never (for now)". Depends on the SDK public part |
| M4 No email reminder | **Fixed on the studio Chest (platform-dependent)** | Via `mail`. "Closes tomorrow" and "Remind" go by email where the Chest sends it |
| M5 "Some groups" only lists groups that give Polls | **Partly** | People picked by name work. Any Chest group does **not**: Polls does not declare the `groups: "read"` proposal that News uses |
| M6 No comments | **Fixed** | Comments on named polls ("I can bring the banner from the office") |
| M7 No slot limits | **Fixed** | "Limit the places per answer"; full slots refused (flow) |
| Minors: wording, copy times to all days, reduced motion, seed times, lock options after answers | Mostly fixed | "Edited after 3 answers". The confetti respects reduced motion per the flow (not re-checked here) |

## Still blocking

1. **No external guests.** The weekly Doodle for "a slot with the client" or "candidate interview times" stays on Doodle. This is the most common reason a 50-person company keeps a paid Doodle seat.
2. **No pulse breakdown by team or manager.** Officevibe's product is the team heat map a manager sees. Here there is one number for the whole company. A per-group result with its own 5-answer floor is described in the README as possible but is not built. Without it, the Officevibe claim is "a weekly anonymous form with a trend line".
3. **No question bank and no driver model.** Officevibe asks rotating, validated questions (recognition, workload, relationship with manager) and scores them. Here the pulse ships three fixed questions. It is honest, but a comms or HR buyer compares it with a 120-question library.
4. **Reminders stop at the Chest.** Participation in pulse surveys lives on nudges. Email covers part of it (`mail` proposal); there is no push and no Slack or Teams.

## New problems found this round

1. **Any member can start a company-wide, weekly, anonymous pulse.** The empty home offers Hugo (plain member) "La météo de l'équipe", sent "every week" to "everyone". The round-1 fix (members may ask "pizza or sushi?") now also lets anyone run an HR survey on the whole company, every Monday, forever, with eNPS. In France this touches CSE consultation (a recurring employee-opinion survey), and it floods the bell. Keep the one-off question and date poll open to members. Keep repeating surveys and eNPS for organisers by default.
2. **The sign-up sheet's summary row lies on phones and in French.** On "Open day: who holds the stand?" (2 places per slot), the bottom row reads "**Disponibles 2** · 2 oui, 0 si besoin" (`ph-date-lea.png`). "Disponibles" here means "people who said yes", but on a sign-up sheet it reads as "2 places available" for a slot that is **full**. The per-answer "Full" or "2 places left" is on the answer form, not in the grid.
   - On the phone only 2 of 4 slots are visible, with no scroll hint (no fade, no "2 more →").
   - Fix: on a limited poll, label the row "Places taken 2/2 — Full", and add a scroll hint.
3. **French and English mixed in seeded data.** Examples: "How was this week?" and its questions in the French UI; "Météo de l'équipe" and "Notre semaine" in the English UI. This is data, but the pulse template is the tool's own text. It should be created in the asker's language. Here the seed uses the English template for a French admin (store rule §2.11).
4. **Phone decoration collides with the main button.** The confetti dots on the home page overlap the top edge of "Nouveau sondage" at 390 px (`pe-own-hugo-fr-p-_chest.png`).
5. **The organiser's home is only "To answer".** Sofia, who asked 5 polls, finds them mixed into "To answer" with every other poll. There is no "Asked by me" list with their state (open, 4 of 7, closes Thu). Doodle's dashboard is exactly that list.
6. **Store coherence:**
   - "Tell everyone" on a date poll gives an `.ics`, while News puts its events straight into the Chest calendar with the `calendar` proposal. The same company sees two behaviours for "add the chosen date to my calendar".
   - "Organisateur" and "Membre" role names are fine.
   - "Édition 5" in French versus "Round 5" in English: good.

Looks: in the Chest theme the date grid keeps ✓, ~ and ✕ as shapes, not colour only (good). The sample brand in dark and Receipt are readable. Nothing broken.

## Platform-dependent

- Email reminders ("closes tomorrow", Remind): **`mail` proposal**.
- The closing pass and pulse rounds opening by themselves: **`schedules` proposal** (the "pass" every 15 min).
- Any Chest group as an audience: **`groups: "read"` proposal** (built; Polls should declare it).
- The chosen date in everyone's calendar: **`calendar` proposal** (built; used by News).
- Outside guests for date polls: **SDK public part**. It needs a public answering route with rate limits and visitor identity (`visitors` module, studio.8) and, ideally, `mail` to send the link.
- Push to phones: not proposed.

## Top 3 fixes now

1. **Guard the pulse and add team breakdowns (M).**
   - Repeating surveys and eNPS go to organisers by default. Members keep one-off questions and date polls.
   - Add a per-group result view (Chest groups via `groups: "read"`), each with its own 5-answer floor. Hide a group below the floor, and hide its complement too so it cannot be deduced by subtraction.
2. **External date-poll link on the public host (L, SDK public part).** Name field and no account, rate-limited, answers marked "guest", and the organiser shares the link. This is what makes "cancel Doodle" true.
3. **Organiser dashboard and honest sign-up grid (S).**
   - An "Asked by me" section with state and participation.
   - On limited polls, a grid footer "Places taken 2/2 · Full", and a scroll hint on phones.
   - The pulse template in the asker's language.
