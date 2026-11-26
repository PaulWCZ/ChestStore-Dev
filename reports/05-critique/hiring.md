# Hiring — severe critique (vs Welcome to the Jungle ATS, Teamtailor, Recruitee)

Critic run: 2026-09-29, harness port 7400, `--prod --reset`; then all job/candidate tables truncated for the empty state. Screenshots in `critique/rest/` (prefixes `h-`, `h2-`, `h3-`). Played: a candidate (public, EN/FR, phone), Camille (recruiter), Hugo (interviewer), Tom (member of no job), Nora (no role); keyboard drag on the board.

## Verdict

**Can a 50-person company cancel Welcome to the Jungle / Teamtailor tomorrow? No.** It can cancel *the jobs@ mailbox and the spreadsheet*, and the pipeline itself is pleasant (board, structured blind feedback, GDPR retention). But what companies actually pay WTTJ/Teamtailor for is (a) **reach** — the job appears where candidates look — and (b) **talking to candidates** from one place (templates, interview invitations, replies, scheduling). Hiring has neither: no distribution (not even Google for Jobs markup), and the only emails a recruiter can send are the automatic confirmation and one rejection. A recruiter will run Hiring *next to* Gmail, a calendar and the old job board — so the old job board is not cancelled.

- **Completeness: 4/10** — pipeline and feedback solid; reach, communication, scheduling, search, talent pool, screening questions, bulk actions, branding and reporting missing.
- **UX: 7/10** — the board, candidate page and apply form are clear and beautiful; stage chips break mid-word, languages mix on one screen, a pre-selected rejection reason, and an "Undo" that cannot undo the email already sent.

Strength, one line: blind structured feedback (you see others' ratings only after giving yours) and CNIL retention are better than most paid ATSs at this price.

## Blockers

1. **No reach: the careers page is invisible to job seekers.** WTTJ's value is its audience; Teamtailor/Recruitee multipost to Indeed, LinkedIn, Google for Jobs. Hiring publishes only on `https://hiring.<chest>…/`. Not even the free, no-network step is done: no `JobPosting` JSON-LD on job pages (`grep ld+json` in `app/` → nothing), so Google for Jobs cannot list them; no XML feed for Indeed's free organic listing. Fix: (S) `JobPosting` structured data on `/<job>` (title, datePosted, validThrough, employmentType, hiringOrganization, jobLocation, baseSalary, directApply); (S) `/jobs.xml` Indeed-format feed and an RSS feed; (M) "Share" buttons with pre-filled LinkedIn/X posts; (L) paid multiposting requires the `network` permission + partner APIs — say plainly in the store page that WTTJ's audience is not replaced.
2. **The recruiter cannot write to a candidate.** Where: candidate page actions (`h3-candidate.png`): Move / Ask for feedback / Reject / More. Only `mailer.reject` and the confirmation exist (`lib/mailer.ts`). Inviting to an interview, asking for availability, sending an offer — all happen in personal Gmail, outside the record, so the history, GDPR erasure and team visibility are broken. Fix (M): "Write to <name>" with templates (invite, ask availability, offer, rejection) in the job's language via `mail.send`, logged in History; without mail, open `mailto:` with the text and log "written outside". Replies (L) need inbound mail — design the `mail` "received" half in `sdk/`.
3. **No interview scheduling.** README: "No interview scheduling (Booking could offer it)". Teamtailor/Recruitee send a self-schedule link; interviewers get calendar invites. Fix (M): "Invite to interview" → pick interviewers + duration → link to the Booking tool's page for that host (events between tools) or at least propose 3 slots and generate an `.ics` for everyone; the interview appears on the candidate page and pings interviewers the day before (schedules).

## Major

4. **No search for a candidate.** No search box anywhere in `/chest` (`grep search` in `app/` only hits unrelated files). "Where is the CV of that Lucie who applied in May?" requires opening every job board. Fix (S): top-bar search across names, emails and cover letters of every job the user may see (Postgres `tsvector` + `unaccent`).
5. **No talent pool / cross-job view.** A good candidate rejected for job A cannot be proposed for job B except by re-adding by hand (duplicate detection by email exists). Fix (M): "Consider for another job" (copies the application, keeps consent dates) and a "People who agreed to be kept" list.
6. **No screening questions per job** (right to work, availability, salary expectations, portfolio required). Teamtailor/Recruitee core. Fix (M): 0–5 questions per job (short text, yes/no, one choice), shown on the card; reuse the Booking tool's question editor pattern (`booking/app/chest/types/...`).
7. **No bulk actions.** 80 applicants to a showroom job → reject 60 one by one, each with a dialog. Fix (M): select on the board/list + "Reject with email" / "Move to" for many (with one Undo that delays sending, see 9).
8. **Careers page has no brand.** Settings (`h-settings.png`) hold a name, one paragraph and an open/closed switch: no logo, no photos, no colour, no link back to the company website, no "life at" section, no video. Teamtailor sells exactly this. And the paragraph exists in one language only: the French careers page shows the English intro (`h-careers-fr-phone.png`). Fix (M): logo + 3 photos (public files) + accent colour (or `chest.theme()` brand mode from the SDK report 4.10) + intro per language.
9. **"Undo" on Reject cannot undo the email.** `app/chest/actions.ts rejectCandidate` sends `mailer.reject` in the same request; the toast still says "Undo". The candidate already has the rejection. Fix (S): queue the email for 10 s (send on the next request after the undo window, or via `schedules`), or say "Rejected. Email sent — this cannot be undone" with no Undo when an email left.
10. **Default stage names are data in the creator's language, so screens mix languages.** `h-jobs-fr.png`: French UI shows "New / Screening / Offer / Hired" for two jobs and "Nouveaux / Présélection / Entretien" for the third; the English UI shows French stages likewise (`docs/screens/jobs-desktop.png`). Fix (S): default stages stored as keys (`new`, `screening`…) rendered in the reader's language until someone renames them.
11. **A rejection reason is pre-selected** ("Skills do not match", `candidate-view.tsx:140 useState<RejectReason>("skills")`). Recruiters click Reject fast; the recorded reasons become false data — and reasons are what a discrimination claim looks at. Fix (S): nothing selected; Reject disabled until a reason is chosen.
12. **No reporting.** No time-to-hire, no source-of-candidates, no per-stage conversion. WTTJ/Teamtailor show these on day one. Fix (M): one "Report" tab per job and overall (counts only).
13. **No job templates / duplicate a job.** Re-opening "Sales associate" every spring means retyping. Fix (S): "Duplicate" in the job's ··· menu.
14. **Consent checkbox is mandatory to apply.** `h-apply-phone.png`: "I agree that Atelier Martin keeps my application…" must be ticked. Under GDPR, processing an application rests on pre-contractual steps / legitimate interest, not consent (consent must be freely given; making it a condition of applying undermines it); CNIL's recruitment guidance frames retention as information to give, not consent to collect. The research file itself notes CNIL pages were not read first-hand. Fix (S): turn the checkbox into an information sentence; keep a separate *optional* checkbox "Keep me in mind for other jobs (2 years)" which feeds the talent pool (5). Have a lawyer confirm.

## Minor

15. Stage chips on the Jobs overview break words mid-syllable: "Présélecti|on", "Propositi|on", "Embauch|é", "Nouveau|x", "Screenin|g", "Showroo|m day" (`h-jobs-fr.png`, `h-interviewer.png`). Fix: `overflow-wrap: normal; hyphens: auto` with `lang` set, or show the count with the name below in a wrapping grid, or abbreviate after 5 stages.
16. The card on the "New" column carries a "New" badge ("unseen") — reads as a duplicate of the column name. Use a dot + "not opened".
17. Duplicate toast: a keyboard move shows "Zoé Lambert moved to Screening. Undo" twice (h3 run, `status2` log). The board calls `toast()` twice on drop.
18. "cv.pdf · 193 byte" — singular unit from `Intl` short style; use "193 bytes" / "0.2 KB".
19. English rejection email: "Thank you for your interest in Accountant" — ungrammatical with a job title; French is right ("au poste « … »"). Fix: "in the {job} position" / "in joining us as {job}".
20. Inline PDF viewer shows the file's opaque base64 name in Chrome's toolbar (`h3-reject.png` background) — set a `Content-Disposition: inline; filename="<Candidate> CV.pdf"`.
21. Job description editor exposes Markdown syntax as help ("`**words**` are bold, `##` starts a heading"); the toolbar has H/B/list — drop the syntax sentence.
22. "Withdrew" and "No answer" are listed as *rejection* reasons; a candidate withdrawing is not rejected by the company. Split "Close: they withdrew" from "Reject".
23. Phone: the board is a horizontal scroll with no hint of the number of stages (`docs/screens/board-phone.png`); on a phone show a stage switcher (tabs with counts) and one column at a time. The phone header drops "See the careers page".

## Bugs (steps to reproduce)

- **B1** Overview stage labels break mid-word (Minor 15) — all widths ≥ 1280 px, both languages.
- **B2** Double "moved to" toast after keyboard drop: board → focus a card → Space → → → Space.
- **B3** Rejection email leaves although the recruiter then presses Undo (Major 9): candidate page → Reject → keep "Send them an email" → Reject → Undo → the rejection has already been handed to `mail.send` (read in `app/chest/actions.ts`; not replayed end to end in the browser).
- **B4** Pre-selected rejection reason (Major 11).
- **B5** French careers page shows the English company intro (Major 8).

## Migration in / out

- **In:** no import (README admits; column sets "not read first-hand"). A company switching mid-hiring has 20–200 live candidates with CVs in Teamtailor/WTTJ; without an import the old tool stays open until every open job closes — months. Fix (M): CSV import with a mapping step + a ZIP of CVs named by email (Workable/Teamtailor full exports provide per-candidate files); candidates land in a chosen stage with "imported" in history and their original application date (retention clock).
- **Out:** CSV per job only (`/chest/jobs/<id>/export`), no CVs, no feedback/notes. No per-candidate GDPR access export (WTTJ has "Download in CSV" per candidate). Fix (S): "Export everything" ZIP (CSV per table + CVs) and a per-candidate "Download their data" next to "Erase".

## UX notes

- First minute: empty state "Post your first job / Write a job" is exemplary; draft → Publish = 2 clicks, with Undo; the job appears at once on the careers page. Applying on a phone takes one screen, and a wrong file keeps everything typed.
- Keyboard drag works (Space, arrows, Space) with live announcements — better than most kanbans in the store.
- Interviewer view is correctly narrowed (only their jobs, no Settings); a no-role member sees a clear page.
- Candidate page has 5 top buttons (Move to Offer, Move to…, Ask for feedback, Reject, ···) — "Move to Offer" and "Move to…" duplicate each other; keep the primary and put "Move to…" in the menu.
- French is natural ("Faut-il l'embaucher ?", "Plutôt oui"); "Voir la page carrières" good.

## Fix plan (ordered)

1. `JobPosting` JSON-LD + Indeed XML feed + share buttons (S) — the only free "reach".
2. "Write to candidate" with templates, logged; mailto fallback (M).
3. Interview invitation with Booking link / `.ics` (M).
4. Search across candidates (S); duplicate job (S).
5. Undo-safe rejection email (S); no pre-selected reason (S); stage keys localised (S); chip wrapping (S); double toast (S).
6. Bulk reject/move (M); screening questions (M); talent pool + optional consent (M).
7. Careers page brand: logo, photos, colour, intro per language (M).
8. Import CSV + CVs (M); full export + per-candidate export (S).
9. Reports: time to hire, sources, conversion (M).


## October 2026: after the move to the new stack

_Added 6 October 2026 from Hiring's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **135.1 → 66.6 MiB**;
  image 463 → 33 MiB; first members' page 857 →
  528 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: applications bounded **per job**, so a flood closes one job's form for the day and says so with the company's website (before, one cookieless robot closed every job's); guessed interview secrets spend their own budget; CVs accepted on the Chest's word (`files.stat`'s type) instead of a full read (+149 → +23 MiB for 20 at once); the confirmation greets with a first name only; erasure and retention withdraw every bell item naming the candidate; files the Chest could not delete retried nightly; a booked candidate can choose another time or call the interview off; forbidden interview questions said (`0f274f4`). Flow 39 steps, axe clean on 45 screens (`abe143d`).
- **Pending**: Platform: the per-job budget is the best a tool can do without the visitor's address (`reports/03-sdk-report.md` §4.17).

**Verdict, updated.** Custom domains now exist on the Chest (brief/08): the careers site can live at `careers.<company>.com`, and the links it writes follow `chest.tool.publicUrl` (`src/lib/public-origin.ts`). What remains is reach (job boards) and writing to candidates (email). **Cancel tomorrow: unchanged** — Teamtailor for a few hires a year: yes on the proposals; Welcome to the Jungle: no.
