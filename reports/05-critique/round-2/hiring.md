# Hiring — severe critique, round 2 (vs Welcome to the Jungle, Teamtailor, Recruitee)

Critic run: 2026-09-29, port 7400. Setup: `npm run build`, then `dev.mjs --prod --reset` (sample company) and `--prod --reset --empty` (first visit). `flows/hiring.mjs` passes 28 of 28. On top of it I used my own Playwright scripts (`critique2/rest/shoot.mjs`). Screenshots are `critique2/rest/shots/h-*.png`.

Who I used it as:
- a candidate: public pages, phone, dark;
- Camille (recruiter, FR), Hugo and Inès (interviewers) and Nora (no role);
- in five looks from the Look panel: Chest, the sample brand in dark, Confetti dark on a phone, High contrast dark, and the brand for this tool only.

## Verdict

**Can a 50-person French company cancel Welcome to the Jungle or Teamtailor tomorrow?**

| Product | Answer | Why |
|---|---|---|
| **Welcome to the Jungle** | **No** | What it sells is its audience, and no store tool can replace an audience. |
| **Teamtailor or Recruitee, as an ATS** | **Not yet** | The pipeline is now credible: reach, writing to candidates, interviews, search, bulk actions, reports, import and export. But everything that talks to a candidate runs on studio proposals: sending and receiving mail, calendar, schedules, public uploads. On a real Chest today a candidate cannot even upload a CV (public uploads), and no confirmation, rejection or interview email leaves. |

| Score | Round 1 | Round 2 | Why |
|---|---|---|---|
| Completeness | 4 | **6.5** | Every round-1 blocker and major has an answer. Still missing: candidate self-scheduling, iTIP invitations, attachments, scorecards per stage, approvals and paid multiposting. |
| UX | 7 | **8** | Clean board, search, stage tabs on the phone, one primary per screen. Points lost to two places to set the brand, some leftover icon-only controls, and the phone board that still scrolls sideways under its tabs. |

Strength, one line: a candidate's answer to "Write" lands back on their page, and the rejection email waits 15 s behind Undo. Few ATSs at this price get both right.

## Round-1 findings

| # | Round 1 | Now | Checked how |
|---|---|---|---|
| B1 | No reach | **Fixed for the free part** | JSON-LD `JobPosting` with the page nonce, `/jobs.xml`, `/feed.xml` and `/sitemap.xml` all pass in the flow. Settings explains them (h-settings.png). No paid multiposting. Google indexing is unverified (README). |
| B2 | Recruiter can't write | **Fixed, platform-dependent** | Templates in both languages. The reply lands on the candidate page (flow step; h-cand-camille.png shows the thread and "1 e-mail à classer"). Needs `mail` send and receive. |
| B3 | No scheduling | **Partly** | "Invite to an interview" shows interviewers' Hiring-only busy times and sends an `.ics` (flow). The candidate cannot pick a slot. The `.ics` is PUBLISH, not an invitation with Accept/Decline. |
| 4 | No search | **Fixed** | Top-bar search is accent-insensitive (flow: "Hélène" found without the accent). |
| 5 | No talent pool | **Fixed** | "Vivier" tab, "Propose for another job", and an optional box on the form (seen). |
| 6 | No screening questions | **Fixed (claimed)** | README and job form. The sample job I opened had none, so I did not answer one as a candidate. |
| 7 | No bulk actions | **Fixed** | Select two, move them, one Undo (flow). |
| 8 | Careers page has no brand | **Fixed** | Logo, photos, 6 accents, website link, intro per language (Settings, seen). With the Chest brand the page wears it (h-careers-brand-dark). |
| 9 | Undo can't undo the email | **Fixed** | Send is delayed 15 s and Undo stops it (flow). |
| 10 | Stage names mix languages | **Fixed** | Stages are keys. The French overview and board read Nouveaux, Présélection, Entretien, Proposition, Embauché (h-jobs-camille.png). |
| 11 | Pre-selected reject reason | **Fixed** | No reason is chosen for you (flow). |
| 12 | No reporting | **Fixed (counts only)** | "Statistiques" tab. |
| 13 | No duplicate | **Fixed** | Flow step. |
| 14 | Mandatory consent box | **Fixed** | A sentence plus an optional "Keep me in mind" box (h-apply-phone). Leftover: seeded candidates still show "A accepté le … que sa candidature soit conservée" on their page (h-cand-camille.png, `consentAt` from old seed data), which contradicts the new legal basis. |
| 15 | Stage chips break mid-word | **Fixed** | The overview uses count tiles that wrap cleanly ("Showroom day" on two lines). |
| 16 | "New" badge in the "New" column | **Fixed** | Now "pas encore ouvert". |
| 17 | Double toast | **Fixed** | Flow step "one toast". |
| 21 | Markdown syntax as help | **Partly** | The help sentence is gone, but the new-job editor's placeholder shows raw "## Vos missions" (h-new-job.png). |
| 22 | "Withdrew" was a rejection | **Fixed** | Flow step "closed, not rejected by email". |
| 23 | Phone board | **Partly** | Stage tabs with counts exist, but the columns still scroll sideways under them. The tab row is clipped at 390 px ("Entretien" cut, h-board-phone-dark). |
| Migration | No import or export | **Fixed** | CSV with a column-mapping step plus CVs by e-mail in the file name. ZIP export. Per-candidate "Download their data" (flow). |

## Still blocking (what a Teamtailor customer misses weekly)

1. **On a real Chest today the tool is mute and deaf.**
   - The CV upload needs *public uploads* (SDK §4.3).
   - Every candidate email needs `mail` send and receive (§4.2, §4.13).
   - Interview feeds need `calendar` (§4.11).
   - The CNIL retention purge needs `schedules` (§4.1). README: "the retention does not run by itself".
   - All are built in `sdk/` with fakes. None is shipped.
2. **Scheduling is still manual.** The recruiter picks one time. Teamtailor sends the candidate a self-scheduling link, and interviewers get a real invitation (Accept/Decline) that blocks their real calendar. Hiring's busy view only knows Hiring interviews, not the interviewers' Outlook.
3. **No `careers.company.com`** (custom domains, §4.15). The careers link on the company's website points to a Chest address.
4. **No attachments when writing.** An offer letter must go out from Gmail, which breaks the "one place, one history" promise exactly at the offer.

## New problems this round

- **N1: two places set the careers page's look.**
  - Settings has "Couleur" (6 accents) plus logo.
  - The Chest has its own brand. When a Chest brand exists, Hiring's colour and logo are silently ignored (the README says Settings says so).
  - An office manager will set the logo in the tool and wonder why nothing changes.
  - Forms has the same double control. The store needs one rule (see `_store.md`).
- **N2: an empty careers page speaks for the company.** With `--empty`, the public page reads "We are a small team that cares about its work…" (h-empty-public.png). The company never wrote that sentence (`intro` default in `lib/i18n/en.ts:25`). Fix (S): show only the name and the open positions until an intro is written.
- **N3: icon-only controls remain.** Delete a note is a bare trash icon. Edit and delete a template are a pencil and a trash (h-settings.png, h-cand-camille.png). This goes against store rule §2 "words on icons".
- **N4: French slips.**
  - "Adresse facultatif" (new job, "Où"): it should be "Adresse (facultatif)".
  - On the careers page, job meta lines wrap with a leading "· On site" orphan dot (h-careers-fr-phone).
- **N5: the board card is cramped.** The name wraps beside the "pas encore ouvert" badge ("Aïcha / Benali", h-board-brand). Put the badge under the name.
- **N6 (looks): the identity illustration stays in every look.** The Magazine arch-and-sun appears in brand mode and in the Chest look (h-looks.png).
  - With the brand, it is recoloured in brand green. It reads as decoration, acceptable.
  - With the Chest theme it becomes a black blob with a grey circle, which looks like a placeholder.
  - Readability held in all looks. The Confetti-dark careers page on a phone keeps the headings strong.
- **N7: a theme chosen "for all tools" dresses the public careers page too.** A company that picks Confetti for its team tools gets a confetti careers site. Public parts should follow the brand, or the tool's own look, unless chosen for this tool.

No console errors or 5xx. Public pages 0.6–0.8 s including fonts. No sideways page scroll (the board scrolls inside its own frame).

## Platform-dependent

- `mail` send and receive (SDK §4.2, §4.13), *public uploads* (§4.3), `visitors` (§4.8), `calendar` (§4.11), `schedules` (§4.1): must ship.
- Custom domains for public hosts (§4.15, platform only).
- A free/busy connector for interviewers' real calendars. It is not built. It belongs next to §4.11.
- iTIP REQUEST invitations with Accept/Decline: an extension of `calendar`/`mail`, not designed yet.

## Top 3 fixes now

1. **Candidate self-scheduling (M).**
   - The recruiter proposes 3–5 slots, or a Booking-tool link (events between tools, §4.4).
   - The candidate picks one on a public page.
   - Everyone gets a REQUEST `.ics` with the interview's UID, so moves and cancellations update in place.
2. **One brand source (S).**
   - When the Chest has a brand, Settings hides colour and logo and shows "Your company's brand is used (set in the Chest)".
   - Public pages follow the brand, not an all-tools catalogue theme (N1, N7).
3. **Clean the edges (S):**
   - the "Adresse" label (N4);
   - no default intro text (N2);
   - words on note and template actions (N3);
   - phone board: one column at a time under the tabs, with the tab row scrollable and not clipped;
   - no raw Markdown in the placeholder;
   - drop the legacy consent line from seeded data.
