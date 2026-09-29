# Critique round 2 — Forms (tools/public-and-private/forms) vs Typeform, Tally (and the owner's beta, reference/forms)

Run 2026-09-29, port 7300, `npm run build`, `dev.mjs --prod --reset` and `--prod --reset --empty`. Studio flow `flows/forms.mjs`: **20/20 passed** (it now covers every round-1 bug). My pass: a stranger on a 390 px phone (steps and classic layouts; own, Chest, brand; light/dark; FR), Camille (manager, FR), Inès (creator, FR), Hugo (member), Tom, Nora; builder, share, settings, answers, summary, anonymous answers, team forms, trash; axe 0 violations, no page overflow, 0 errors on 60 shots. Scripts `fm-*.mjs`; screenshots `shots/fm-*.png`.

Strength in one line: every round-1 bug is gone (legend, lost edits, Enter in options, phone builder), and the tool gained what Tally users would ask for next — per-form second language, matrix/ranking/picture choice, Google Forms/Typeform import, follow-up states, a ZIP with files; it now outclasses the beta by a distance.

## Verdict

**Can a 50-person French company cancel Typeform / Tally tomorrow? Not yet** — for internal forms (IT requests, sign-ups, anonymous check-ins) **yes**. For the website contact/quote form — the #1 paid use — three things still fail on a real Chest: **no email alert** to the owner (mail is a proposal; only the bell), **no embed** on the company website (frame policy), and **no integrations** (no webhooks; no store tool consumes `forms.answered`). A lead that sits in a bell and never reaches the CRM is why they pay Typeform.

| | Round 1 | Round 2 |
|---|---|---|
| Completeness | 6 | **7.5** |
| UX | 7 | **8** |

## Round-1 findings

Blockers
- B1 No email to the owner — **fixed in the tool, not in effect** (per-person "also by email", reply-to the respondent; needs `mail`).
- B2 No embed — **partly** (allow-list, auto-height frame code, button code; the frame cannot work on a real Chest; the button does).
- B3 No integrations — **partly** (`forms.answered` published through the events proposal; no receiver exists in Clients/Support/Tasks; webhooks need a Chest capability).

Majors
- M1 Legend on the card border — **fixed** (`fm-pub-classic-own-light-phone.png`; flow).
- M2 Phone builder 698 px — **fixed** (flow; my 390 px shots, logic rows stacked).
- M3 Edits lost on tab switch — **fixed** (tab waits for the save, keepalive on close; flow).
- M4 Settings not autosaved — **fixed** (one saving model; flow).
- M5 Enter in options — **fixed** (flow).
- M6 No logo/cover — **fixed** (company logo in brand mode, cover picture per form).
- M7 One language — **fixed** (second language per form; the tool's words follow the form; flow).
- M8 Question types — **mostly fixed** (matrix, ranking, picture choice, 10 files); signature, payment, checkbox grid **not**.
- M9 Requester never sees their request — **fixed** ("What you sent" with New/In progress/Done + note, bell on change).
- M10 No trash — **fixed** (30 days, restore; confirm states the number of answers).
- M11 Anonymous per-row exposure — **fixed** (no table, no row, shuffled texts, aggregates, nothing under 5).
- M12 Phone tabs overflow — **fixed** (four tabs; Answers/Summary merged).

Minors (sample): "press Enter" on touch **fixed** per README (not re-checked on every step); "drop it here" on phones **not fixed** (new 3); Yes/No auto-advance **fixed**; percentage progress **fixed**; resume **fixed**; option placeholders **fixed**; errors only on Publish **fixed**; search on the list **fixed**; untouched drafts cleaned after a day **fixed**; close next to the status **fixed**; conflict "Keep my version" **fixed**; prefill names **fixed**; share with groups/"everyone" **not fixed**; two anonymous check-in tools (Forms vs Polls) **not decided**. Migration: Google/Typeform definitions **fixed**, Tally **not**, past answers CSV import **not**, ZIP export with files **fixed**.

## Still blocking (weekly, for a Typeform/Tally customer)

1. **Email on each answer** (and to the respondent) — real Chest has no mail.
2. **Embed** on the website (inline, popup) — frame policy.
3. **Answers flowing elsewhere**: Google Sheets, Slack, the CRM, a Zapier webhook. Inside the store, a contact form still does not create a Clients contact or a Support ticket.
4. **Payments** in a form (paid registrations), **signature**, **calculated fields / quizzes**, **recall** ("Thanks, {name}").
5. **Past answers import** — 3 years of NPS history stay in Typeform.

## New problems (round 2)

1. **Answers on a phone are a 2-column table**, not cards: only "Quand / Qui" show; the actual answers sit off-screen in an 866 px table inside a 364 px scroller (`fm-answers1-own-light-phone.png`, `fm-ph.mjs`). The README says "a list of cards on a phone" — the claim is wrong. And ~550 px of controls (CSV, ZIP, search, state chips, "Afficher", two date fields, "Colonnes affichées") come before the first row.
2. **"Colonnes affichées" looks like a dead label.** It is a `<details>` whose disclosure marker is hidden: no chevron, no button look, nothing says it opens (`fm-answers1-own-dark-desk.png`).
3. **File question on phones says "or drop it here"** and repeats the accepted types twice ("One file, 10 MB at most. Accepted: PNG, JPG, GIF, WEBP." then "Images: PNG, JPEG, GIF, WebP") (`fm-team3-hugo-own-light-phone.png`). README claims the drop hint is shown only with a keyboard; not true for the kit's FilePicker at 390 px touch.
4. **Builder preview chrome in the form's language, not the member's**: Camille (FR) sees "PREVIEW: NOTHING IS SENT", "press Enter ↵", "0% done" on the right of a French builder (`fm-builder1-own-light-desk.png`). The respondent's words should follow the form; the preview's own label should follow the member.
5. **Empty home still has two buttons for one action** ("Nouveau formulaire" top-right and "Créer mon premier formulaire"), noted in round 1.
6. **French template copy**: "Avis et NPS — Comment nous en sommes-nous sortis ? Avec logique" is a literal translation plus jargon ("logique"); say « Comment s'est passée votre expérience ? Avec des questions qui s'adaptent ».
7. **Member home on a phone**: in "For you to answer" the "Answered" pill drops onto its own line under "How was your week?" while the "Anonymous" pill stays on the right (`fm-home-hugo-own-light-phone.png`) — ragged.
8. Seeded forms are English in a French company's demo (store §2.11) — the tool now supports FR/EN per form; seed them bilingual.

Store coherence (§2): the best follower of the store rules among my five tools (glossary, Undo that waits, kit date field, people picker, search, no `window.confirm`). Departures: item 1 (phone lists), item 3 (kit FilePicker), share with groups.

## Platform-dependent

- **`mail`** (owner alerts, respondent copy) — proposal.
- **`embeddable` frame permission** on the public host — SDK report.
- **`webhooks` capability** (admin-configured https target, Chest-signed, retried, journaled) — written in the README; not in the working copy yet.
- **Events between tools** — the publisher exists; the store needs its first receivers (Clients: create/update a contact; Support: open a ticket).
- **Payments** — a Stripe "partner" primitive (same shape as Quotes' PA and Booking's payments).
- **Chest groups** for sharing ("Sales") — the `groups` capability (round-1 platform item 5).

## Top 3 fixes now

1. **First receivers of `forms.answered`**: Clients creates/updates a contact (with the answer in its history), Support opens a ticket — this is the store's one argument Typeform cannot match, and it needs no new platform piece beyond the events proposal already used by Clients → Quotes. **M** (across two tools)
2. **Answers as cards on phones** (each answer: time, who, the first 3 answers, state) with filters behind one "Filtrer" button; give "Colonnes affichées" a visible disclosure. Fix the README claim. **S**
3. **Kit FilePicker on touch**: no "drop here", one accepted-types sentence in plain words ("Photos: PNG, JPG…"); preview chrome in the member's language. **S**
