# Hiring (Recrutement): severe critique, round 3 (vs Welcome to the Jungle, Teamtailor)

Critic run: 2026-09-29, about 22:55 Paris time. Port 11500.

**Setup.** `npm run build`, then `dev.mjs --prod --reset` and `--prod --reset --empty`. My scripts and screenshots are in `critique3/c3/` (`h*.mjs`, `shots/h-*.png`).

**Who I used it as:**
- a candidate on a 390 px phone (FR), applying to "Office manager" with a JPG CV, then with none, then with a PDF;
- the same candidate choosing her interview time from the emailed link;
- Camille (recruiter, FR) on a phone: the board, the candidate's page, "Entretien" with "the candidate chooses";
- Inès (interviewer).

**Looks:** the Café du Port brand on the careers page and in Settings, and the Chest look on the candidate's page. I also checked a new company's first visit.

No console errors and no 5xx.

## Verdict

**Can a 50-person French company cancel Welcome to the Jungle or Teamtailor tomorrow?**

| Product | Answer | Why |
|---|---|---|
| **Welcome to the Jungle** | **No, by nature** | Its audience is the product. |
| **Teamtailor, as an ATS** | **Yes on the studio's proposals, for a company hiring 5–15 people a year** | — |
| **Teamtailor, on today's Chest** | **Not yet** | No CV upload (public uploads), no candidate email in or out (`mail`), no interview feeds (`calendar`), no retention purge (`schedules`). |

| Score | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 4 | 6.5 | **7.5** (candidate self-scheduling, one brand source, cleaner edges) |
| UX | 7 | 8 | **8** (phone board fixed; small French and priority slips remain) |

Strength, one line: from a phone the recruiter sends "choose your time" in two taps, the candidate picks among real free slots, and the history, bell and calendars follow. That is Teamtailor's best feature, done well.

## Round-2 top fixes and blockers

| Round-2 item | Now | Checked how |
|---|---|---|
| Top 1: candidate self-scheduling | **Fixed, with limits** | By hand: Camille, phone, Aurélie → Entretien → "Aurélie choisit" is the default. I ticked Inès, "Envoyer le lien", toast "Lien envoyé…". The email in the outbox has the link. The candidate's page lists free times for 6 weekdays. **Limits:** free times come from Hiring's interviews only (N1); the `.ics` is still PUBLISH, not an invitation with Accept/Decline (README); the candidate cannot move her own time. |
| Top 2: one brand source | **Fixed (README and flow; Settings not fully re-read by hand)** | With the Café du Port brand the careers page wears its logo and colours. With Confetti for all tools, the public page is not dressed in confetti (flow). |
| Top 3a: no default intro | **Fixed** | Empty company: "Join Atelier Martin · No open positions right now", with no invented sentence. |
| Top 3b: phone board | **Fixed** | Stage chips wrap on two lines, one stage shown, nothing cut (`h-job3-phone.png`). |
| Top 3c: Markdown placeholder | **Fixed** | A real editor (README). |
| Top 3d: "Adresse (facultatif)", note/template icon words, legacy consent line | Not re-checked by hand | — |
| Blocker: no reach | **Unchanged** | Free Google for Jobs, Indeed XML and RSS; no paid multiposting. |
| Blocker: no attachments when writing | **Not fixed** | README. |
| Blocker: mute and deaf on a real Chest | **Not fixed** (platform) | — |

## Still blocking (what a Teamtailor customer misses weekly)

1. **On today's Chest, the tool cannot take an application with a CV or answer a candidate.** Every public-facing step rests on proposals.
2. **The offer letter.** There are no attachments on written emails, and there is no e-signature. The last step of every hire leaves the tool for Gmail.
3. **Real calendars of interviewers.** Self-scheduling offers Inès at 11:00 on Wed 30 Sept, while Booking (same store) holds her 10:00–11:00 showroom visit and her Google calendar may hold anything else. A double booking is likely in the first week.
4. **Scorecards per stage and hiring approvals** (Teamtailor "requisitions"): a 50-person company with a CFO approving headcount uses both.
5. **Reach.** No multiposting to WTTJ, Indeed sponsored, LinkedIn Jobs or France Travail. Google for Jobs indexing is unverified.

## New problems (round 3)

- **N1: two store tools, two truths about free time.** Hiring's self-scheduling uses "their interviews in Hiring". It ignores the Booking tool's busy times (which read each person's real Google or Outlook calendar) and Rooms' meetings. The suite has the data. Hiring should ask Booking (event or read API between tools) or read the same secret calendar address.
- **N2: the candidate's link ignores the candidate's language.** Aurélie applied in French (her record says "Langue : Français", and the email to her is in French). Opened in a browser set to English, the link `/interview/<secret>` shows "Aurélie, choose a time for your interview". The link should carry her language, as the emails do.
- **N3: the slot list is long and includes lunch.** 60-minute interview, 6 days: about 80 buttons on a phone, 12:00–13:30 included. The recruiter can bound the hours but not exclude lunch. Show 3–4 days, then "More days", and skip 12:00–14:00 unless asked.
- **N4: one action, two history lines.** After "Envoyer le lien" the history shows "Le lien de Camille Martin pour choisir un moment a été envoyé par e-mail" and "Camille Martin a envoyé un lien pour choisir l'heure de l'entretien avec Camille Martin et Inès Moreau". Keep one.
- **N5: the recruiter is always an interviewer.** I ticked Inès only. The meeting became "avec Camille Martin et Inès Moreau": the sender is pre-ticked and easy to miss on a phone. Pre-tick nobody except the job's interviewers, or show the choice in the button ("Envoyer le lien (Camille, Inès)").
- **N6: French slips.**
  - "Vous serez prévenu" is said to Camille (member locale FR, female); use "Nous vous préviendrons".
  - "ou déposez-les ici" for a single CV should be "déposez-le".
  - "Le candidat a été prévenu" regardless of the candidate.
  - "Intervieweur" as a role label: accepted, but "Recruteur / Membre du jury" reads better to a French SME.
- **N7: priorities on the phone.**
  - On a job's page the filled primary is "Ajouter un candidat" (adding by hand is rare). The main job there is reviewing the new ones.
  - On Offres, "Voir la page carrières" is a full-width button above "Nouvelle offre".
  - Empty tool: "Nouvelle offre" (header) and "Rédiger une offre" (empty state) are two filled buttons for one action, and there is no job template ("Office manager", "Commercial") to start from. Teamtailor offers templates.
- **N8: phone candidates without a PDF.** A JPG CV (a photo, common from a phone) is refused ("ce type de fichier n'est pas accepté"). The fallback is a link. Accept images (JPEG/PNG/HEIC) as CVs, or say "a photo of your CV also works" if the platform's upload sniffing allows it.

## Platform-dependent

- Public uploads (§4.3), `mail` send and receive (§4.2, §4.13), `visitors` (§4.8), `calendar` (§4.11), `schedules` (§4.1): must ship.
- Custom domains (`carrieres.entreprise.fr`, §4.15).
- iTIP REQUEST invitations (Accept/Decline), an extension of `calendar`/`mail`; still not designed.
- Attachments on outgoing mail exist in the `mail` proposal (Rooms uses them). The tool just does not offer them to recruiters: that is tool work.
- A free/busy source shared across tools: Booking already reads secret iCal addresses. The platform could hold them once per member for every tool.

## Top 3 fixes now

1. **Use the real calendars for interviews (M).** Hiring's free times include Booking's busy times for the chosen interviewers (events or a read between tools), or read each interviewer's secret iCal address as Booking does. Exclude lunch by default, and show fewer days first (N1, N3).
2. **Attachments and the offer letter (S/M).** Attach files (offer letter PDF) to "Écrire" and to templates, through `mail` attachments already in the proposal. Keep the file on the candidate's page.
3. **Candidate-side polish (S):**
   - the interview link in the candidate's language (N2);
   - one history line per action (N4);
   - no silent pre-ticked recruiter (N5);
   - French agreement fixes (N6);
   - image CVs accepted (N8);
   - one primary on the empty screen, plus two or three job templates (N7).
