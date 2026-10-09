# Polls (tools/private/polls) vs Doodle, Google Forms polls, Officevibe: severe critique

Screenshots: `critique/collab/shots/p-*.png`. Harness on port 7100 (`--prod --reset`, seeded), then emptied (`truncate polls, … cascade`). Tested as Camille (admin organiser, fr), Sofia (organiser), Hugo (member, en), Nora (member); desktop, 390 px phone (with mobile emulation), dark, French, keyboard.

## Verdict

**Can a 50-person company cancel Doodle tomorrow?**
- **Internal date-finding:** yes. The grid, Yes / If need be / No, "best date" and "Tell everyone" with a .ics are all there.
- **Doodle as a whole:** not yet. There are no outside guests (Doodle's main use is clients and candidates), plain members cannot create a poll by default, and the grid breaks on phones.

**Officevibe?** No. There are no recurring pulse surveys, no trends, no eNPS, and no manager or team breakdowns.

**Google Forms polls?** Mostly yes for internal quick questions.

**Completeness 5.5/10**: excellent one-off polls; the "pulse" and "external" halves are missing. **UX 8/10**: the clearest composer in the store (autofocus, three plain kinds, "Send to the team"); the phone grid and the anonymity wording hold it back.

Strength in one line: the anonymous-answer storage design and the honest README about its limits are better than any competitor's documentation.

## Blockers

1. **No recurring pulse survey, trend or eNPS, so the claim to replace Officevibe is false.** Where: README "What it does not do": "recurring pulse surveys with a trend chart (needs schedules per poll)". Officevibe *is* the weekly pulse plus its trend per team. A one-off anonymous survey is Google Forms. **Fix (M/L):**
   - "Repeat every week / month" on a survey, using the SDK schedules proposal the tool already uses for its pass.
   - Each run is a poll linked to a series.
   - A trend chart of scale averages across runs (aggregates only, threshold 5 per run).
   - An eNPS question type (0-10 scale, promoters minus detractors).

   Otherwise remove Officevibe from the claim.
2. **Only admins can create a poll by default.** Where: `lib/access.ts` (`organiser: ["answer","create"]`, `member: ["answer"]`) and roles `["organiser","member"]`. Admins get the first role, everyone else the last. In Doodle, Slack and Teams polls **anyone** asks "pizza or sushi?". In a fresh Chest, Hugo sees "No polls yet. When someone asks the team a question, it shows up here." (`p-empty-member.png`) and has no way to ask one. **Fix (S):** let `member` create polls addressed to the whole tool or their own groups, and keep `organiser` for managing everyone's polls. Alternatively swap the default role order so new people are organisers.

## Major

1. **The date grid overflows the phone.** Where: `/chest/polls/2` at 390 px with mobile emulation. `document.documentElement.scrollWidth = 580` against a 390 px screen (`p-date-phone.png`): the whole page zooms out and the **"Best" column (18 Dec) is off-screen**. A date poll with 4 options is the most common case, and people answer on their phone. **Fix (S):**
   - Contain the grid in `overflow-x: auto` with a sticky first (name) column.
   - On phones, show the answer form as a vertical list of dates (date, then three buttons) instead of the grid, and put the results grid behind a "See everyone's answers" toggle.
   - Add `scrollWidth <= innerWidth` to the flows.
2. **An anonymous poll's organiser (and every Chest admin) sees results change live after each answer.** Where: `lib/access.ts` `resultsState()`: `if (manages(actor, poll)) return "shown"`, whatever "Show them when the poll closes" says, once 5 answers exist. The poll text in the seed promises "Nobody, not even me, can see who answered what" (`p-survey-camille.png`). The organiser refreshes after each "6 of 7, 7 of 7" and reads the delta. In a team of 7 where people say "done!" in the corridor, answers are attributable. The README admits this for *live* results only, not for managers under "when closed". The seed also ships its anonymous survey with `results = live`, the unsafe combination. **Fix (S):** for anonymous polls, managers see results only when the poll is closed, or refreshed only in steps of 5 answers. Forbid (not just default away from) "live" when Anonymous is ticked. Fix the seed.
3. **No guests outside the Chest.** Doodle's weekly use in a 20-200 company is often *external*: a meeting with a client, a candidate interview slot, a supplier visit. The README says "never (for now)". Without it, the company keeps a Doodle account. **Fix (L, SDK):** a public link on the public host for date polls only, with a name field and no account, rate-limited. It needs the SDK's public-part proposals, which should be listed in the SDK report as this tool's need.
4. **No email or push reminder.** "Closes tomorrow" is a bell item only. Doodle emails invitees and Officevibe's participation relies on email or Slack nudges. **Fix (M, SDK outbox).**
5. **"Some groups" only lists groups that give Polls access** (`lib/audience.ts` uses `members.groups.list()`), the same SDK gap as News. In a Chest where Polls is open to everyone, "ask only Tech" is impossible. **Fix (M):** hand-picked people as an audience now; the SDK `groups` capability later.
6. **No comments on a poll.** "I can do the 17th but only after 20:00" has nowhere to go (Doodle and Framadate have comments). **Fix (S):** flat comments, or at least a note per answer on date polls.
7. **No slot limits (sign-up sheet).** "3 people per shift / per stand slot / per car" is a top Doodle use. **Fix (M):** an optional "max N per answer" with "Full" shown.

## Minor

1. **"Who is asked: Everyone who has Polls" / "Tous ceux qui ont Sondages".** The tool name is used as a noun of access, which reads oddly. **Fix (S):** "Everyone" / "Tout le monde" (the Chest decides who that is).
2. **The date picker shows one month and greys past days**, with no week or multi-month view (`p-new-date.png`), and no "same times for all dates" shortcut is visible. **Fix (S):** "Copy these times to all days".
3. **No ranking question and no "participants add options"**, both "later" in research. Fine, but say so in the composer's help for surveys.
4. **Confetti on answer** is charming but must respect `prefers-reduced-motion` (check `DESIGN.md`; not verified in this run).
5. **The "Closed Mon 28 Sept, 01:51" seed time** shows in the showcase at 01:51 at night. Seed cosmetics.

## Bugs

1. The phone page overflows on a date poll (Major 1). Steps: open any date poll with 4 or more dates at 390 px on a real phone or with mobile emulation; the page zooms out to 580 px.
2. Anonymous and live results are allowed together, and the seed uses them (Major 2).

No other functional bug found. Keyboard answering works (radios, "Other" text, Send), the composer autofocuses the question, and pages load in 0.6-0.9 s.

## Migration in / out

- **In:** none, which is fine for short-lived polls. For Officevibe, a CSV import of past pulse averages would keep the trend line. Say "your history stays in Officevibe's export".
- **Out:** CSV per poll (counts only for anonymous). Good. Missing: an export of all polls for an admin.

## UX notes

- First minute: the organiser sees three plain kinds, each one line (`p-empty-organiser.png`), and a question poll is 3 fields plus "Send to the team". This is a model for the store.
- The empty state for members is honest, but see Blocker 2: it should offer "Ask a question".
- The results page (`p-date-closed-camille.png`) is clear: THE DATE block, the best column, "7 of 7 answered".
- French is natural ("Rien à répondre. Vous êtes à jour !", "Interroger l'équipe", "Un petit questionnaire").

## Trust for the buyer

Good: one answer per member from `member()`, Undo on close and delete, a 30-day purge, CSV, and an honest anonymity section. Risky: anonymity wording versus manager live view (Major 2). For a CSE-sensitive survey, the buyer must be able to say "even the admin sees results only at the end". Also missing: a record of *who changed* a poll's options after answers came in (editing words after answers can change their meaning). **Fix (S):** lock options once someone has answered, or show "Changed after 3 answers".

## Fix plan (ordered)

1. Members can create polls. **S**
2. The phone date grid: contained, a sticky name column, a vertical answer list. **S**
3. Anonymous: results for managers only at close or in steps of 5; no live for anonymous; fix the seed. **S**
4. Comments on polls; lock options after answers. **S**
5. The audience: hand-picked people (the SDK groups capability later). **M**
6. Slot limits (a sign-up sheet). **M**
7. Recurring pulse plus trend plus eNPS (via schedules). **M/L**
8. Email reminders via the SDK outbox. **M**
9. Public guest link for date polls (SDK public part). **L**
10. Minors: wording, copying times to all days, reduced motion, seed times. **S**


## October 2026: after the move to the new stack

_Added 6 October 2026 from Polls's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-package`; PSS of the
  server's process tree at rest, median of 5): **131.4 → 64.7 MiB**;
  image 458 → 29 MiB; first members' page 726 →
  375 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: each member's groups kept a minute (a stale answer when the Chest says "too many"); the request log names the route, never a guest's secret link; the public 404 in its own frame (`ae4d740`); the guest form on the package's bounded public actions (single-use form token, honeypot, budgets counted once valid; `e765eac`). Checked in Chromium: the island sends the page's token and the answer renews it.
- **Pending**: Nothing listed as pending in its commits. Like every public form, a guest link can be spent for the day by a robot the Chest cannot name (`reports/03-sdk-report.md` §4.17).
