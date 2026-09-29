# Forms (`tools/public-and-private/forms`) — severe critique

Critic run 2026-09-29, port 7500. Hands-on in the harness (`--prod --reset --empty`, then `--prod --reset` with the seed). I drove it with Playwright as Camille (manager), Inès (creator), Hugo (member, and viewer/editor on shared forms), Nora (no role), and as an anonymous visitor. I tested at 1360 px and at 390 px (touch), in English and French, light and dark, and with the keyboard only on the build flow. I read the README, the OSS report, `reference/forms` (the beta), the docs screenshots, and the code where a finding needed it. Screenshots are in `critique/forms-shots/`.

Correction to `_store.md`: Forms **now has** 33 `docs/screens/*.png` and a `chest/preview.png`. But the published screenshots stop just above the two layout bugs below (B1, B2), so they flatter the tool.

## Verdict

**Can a 50-person company cancel Typeform/Tally tomorrow? Not yet.** It beats the beta easily: the beta has 3 field types, no logic, no summary and cannot delete an answer. The respondent's page is really Typeform-grade in step mode. But three things are missing that a paying Tally/Typeform customer uses every week: an **email alert to the owner** when an answer comes in (only the Chest bell exists), **embedding the form in the company website** (the public host sends `frame-ancestors 'none'`), and **integrations** (Sheets, Slack, CRM). On top of that, the classic layout has a visible rendering bug on every choice question, and the builder loses edits and breaks on phones.
**Completeness 6/10** (the core types, logic, versions, anonymity, retention and CSV are better than Google Forms; there is no embed, no owner email, no integrations, no matrix/signature/payment, and no multilingual form). **UX 7/10** (the respondent's step mode is excellent and the builder is clear; minus the classic-layout bug, the phone builder overflow, lost edits, and misleading "press Enter" hints on phones).

## Blockers

1. **No email to the form's owner on a new answer** — only the Chest bell (Settings → "Tell about new answers: In the Chest's bell, at most once every 10 minutes").
   - *Why:* the #1 use of Tally/Typeform/Jotform in an SME is the website contact or quote form. Tally, Typeform and Google Forms all send "new response" emails. A lead that waits in a bell nobody opens is a lost customer, and the buyer will notice in week one.
   - *Fix:* when `mail.send` exists, add "Email me each answer / a daily digest" per person in "Tell about new answers", with the answer rendered in the email and a reply-to set to the respondent's email question. Until then, the Settings screen must say plainly that there is no email alert.
2. **Cannot embed a form in the company website** (Share page: only "Copy link / Open"). The Chest's public host sends `frame-ancestors 'none'` (reference README, `csp`).
   - *Why:* contact, quote and registration forms live *on the website*. Typeform/Tally/Jotform/Google all give an embed snippet, and so does the beta's competitor set. Without it, the website form stays on Typeform.
   - *Fix:* this needs an SDK/platform proposal: a per-tool `embeddable: ["/<slug>"]` manifest entry that relaxes `frame-ancestors` to declared origins, plus an auto-resizing iframe snippet and a popup/button embed on Share. Add it to the SDK report; it is not a tool-only fix. Effort: M (platform) + S (tool).
3. **No integrations or webhooks** (README "does not do yet": no webhooks, no spreadsheet sync; "other tools cannot yet link to a form's answers").
   - *Why:* Typeform/Tally customers pipe answers into Google Sheets, Slack, HubSpot/Pipedrive and Zapier. In the store itself, a contact form cannot create a CRM contact, and an IT request cannot create a Helpdesk ticket or a Task.
   - *Fix:* (a) an in-Chest "events between tools" proposal, with actions "create a CRM contact / Helpdesk ticket / Tasks card from each answer" (this is the store's unique selling point: no Zapier needed); (b) a declared outbound webhook per form (`network` capability) that sends a signed POST. Effort: L.

## Major

1. **Classic ("All questions on one page") layout: the question title of every fieldset question (choices, yes/no, stars, scale) sits on the card's top border.** Screenshots: `r5-legend-light.png`, `r4-classic-fr-dark.png`, `t1-it-request-phone.png`. Where: the runner's `fieldset.question` + `legend` (a legend is rendered on the fieldset border by the browser). It appears on every public classic form and every team form, on desktop and on phones, and the docs screenshots crop just above it. It is the first thing a respondent sees.
   - *Fix:* render the legend as `display: contents` / float-reset, or wrap the card in a `div` and keep the `legend` visually inside it (`legend { float: left; width: 100%; } legend + * { clear: both }`). Add a visual regression shot of a full classic form. Effort: S.
2. **The builder scrolls sideways on a phone as soon as a form has logic.** On the NPS template (`/chest/forms/1`) at 390 px the page is **698 px wide**: the title card, the "Add a question" button and the question rows are cut off (`m-builder-fr-phone.png`). The cause is `.jump` (If [question select] is [op] [value] go to [page]) and `.jumps-title`, which do not wrap, and the question `<select>` is as wide as its longest option. A form without logic (IT request) is fine.
   - *Fix:* stack the jump row vertically under 600 px, add `min-width: 0; max-width: 100%` on the selects, and truncate option text. Effort: S.
3. **Edits are silently lost when you switch tab within 0.7 s.** In the builder, typing an option and clicking *Share* / *Answers* / *Forms* at once unmounts the page, and the effect cleanup clears the 700 ms save timer. Nothing is sent and nothing warns: `beforeunload` covers only full page unloads, not Next's client navigation. Reproduced: the option "Meat (beef)" became "" after a quick click on *Share*, and the introduction was lost after a quick click on *Forms*. File: `app/chest/(work)/forms/[id]/builder.tsx:100-121`.
   - *Fix:* flush on unmount/`pagehide` (`navigator.sendBeacon` or `keepalive` fetch), and block Link navigation while `save === "saving"`. Effort: S.
4. **Settings do not autosave and do not warn.** Changing the thank-you title and then opening *Answers* throws the change away without a word (tested). The builder autosaves, so within the same tool one tab saves by itself and the next needs a *Save* button. That *Save* button also floats over the border between the "Look" and "Taking answers" cards (`a-settings.png`).
   - *Fix:* autosave settings like the builder, with the same "Saved" status. Or, at the least, a sticky save bar plus a dirty-leave guard. Effort: S/M.
5. **"Enter adds the next one" is broken in the options editor.** After Enter in *Option 1*, a new empty option is inserted, but focus stays in Option 1, so the next words are appended to it ("FishVeggieMeat", `one-choice-filled.png`). The console shows `Cannot read properties of null (reading 'closest')`. Cause: `builder.tsx:557` reads `e.currentTarget` inside a `setTimeout`, where React has already set it to null. The new option is also inserted *after the current one*, so the default "Option 2" drifts to the end.
   - *Fix:* capture the list element before the timeout, and append at the end when Enter is pressed on the last option. Add a test. Effort: S.
6. **No logo, cover image or company branding on public forms.** The header shows the company name as plain text ("Atelier Martin") and there are six accent colours. Typeform/Tally customers put their logo and a cover image on every form, and a customer-facing form without a logo looks like phishing.
   - *Fix:* use `chest.theme()` brand mode (SDK report 4.10; store fix #14): the company logo in the header, plus an optional cover image per form through `files`. Effort: M.
7. **Forms have one language.** A French visitor gets French buttons ("Envoyer", "Oui/Non", "Autre", "Entre 1 et 10") around English questions (`r4-classic-fr-dark.png`), and vice versa. For a French SME with foreign customers, or an English form sent to French staff, the mix looks broken. Typeform (on some plans), Formbricks and SurveyJS have per-form translations.
   - *Fix:* an optional second language per form: each text field gets an FR/EN pair, and the respondent's language picks it. At the least, when the form's language differs from the visitor's, do not switch the tool's words to French. Pin the tool words to the form's declared language. Effort: M.
8. **Missing question types that paying customers use weekly:**
   - **matrix/grid** ("rate each of: price, quality, delay"): every satisfaction survey uses it; Google Forms and Microsoft Forms have it.
   - **signature**: Jotform, for consent and registration.
   - **ranking**: Microsoft Forms.
   - **picture choice**: Typeform.
   - **payment**: Tally/Jotform, for paid event registrations.
   - **several files per question**: Google Forms allows 10.

   Matrix is the one a Google Forms user will miss first. *Fix:* matrix (S/M) and signature (M) next; payments need a platform proposal.
9. **A requester never sees what they sent.** On team request forms (the IT request template), Hugo gets "Answer again" but cannot see his earlier requests, their answers, or whether IT has handled them (`t1-hugo-home-fr-phone.png`). The owner cannot mark an answer "done" or add a note either. Google Forms offers "View/Edit your response"; Jotform has approval flows.
   - *Fix:* a "Your answers" list on team forms (read-only, or editable until a deadline), plus an owner-side status (New / In progress / Done) and a note per answer, which also feeds the respondent's view. Or send such forms to Helpdesk (Blocker 3). Effort: M.
10. **Deleted forms cannot be recovered after the 8-second toast.** "Delete this form" on a form with answers is one click, then an Undo toast (`d-delete-form.png`). The rows are soft-deleted (`deleted_at`), but there is no Trash screen, and a keyboard or screen-reader user will not reach Undo in 8 s (store §2.9).
   - *Fix:* a "Deleted forms" list for 30 days with Restore (the data is already kept), and a confirm dialog that states the number of answers when a form has any. Effort: S.
11. **Anonymous forms show each person's row.** From 5 answers, the answers table and the CSV list each respondent's full row, and a choice filter narrows the table to one row. With 5–8 colleagues, a row that combines "workload 5 + my colleagues + free text" identifies someone. That is exactly the re-identification CNIL warns about, and the README concedes free text as a risk but not cross-tabulation.
   - *Fix:* for anonymous forms, show only the summary and a shuffled list of free texts. Remove per-row view, row filters and the per-row CSV, or raise the row floor to about 10 and export only aggregates. Effort: S.
12. **Phone navigation of a form hides its last tab.** The five tabs (Questions, Share, Settings, Answers, Summary; French: Partager, Réglages, Réponses, Synthèse) overflow at 390 px (scrollWidth 462 vs 358). There is no scroll hint, and on the Summary page the *active* tab is off screen (`a-summary-phone.png`). This matches store §2.1.
   - *Fix:* scroll the active tab into view and add an edge fade. Better: on phones, merge Answers and Summary into one "Answers" tab with a Table/Summary switch, which leaves four labelled tabs. Effort: S.

## Minor

1. **"press Enter ↵" on touch phones** (every step, even the start page: `r2-q1-required.png`). On a *long answer*, Enter adds a line and Ctrl+Enter goes on, yet the hint still says "press Enter" (`runner.tsx:326,362`). Fix: hide on `(hover: none)`; on textareas show "Shift+Enter for a new line" the Typeform way, or keep Enter = new line and say "Ctrl+Enter ↵".
2. **Yes/No does not move on by itself** in step mode, while stars, scale and one choice do. The README says "a pick with the finger moves on by itself". Make them consistent.
3. **The step counter changes its total** ("1 of 5" → "3 of 4" → "4 of 5") as logic prunes pages. On the last visible question the button says **Send**, then turns into OK once "Yes" reveals a follow-up. Show a percentage bar only, and label the button "OK" while any conditional question could still appear.
4. **The draft is kept but the place is not.** After a reload the respondent is back on the Start screen ("What you type is kept on this device… Start over") and must step through again. Resume at the last question.
5. **The file picker says "ou déposez-le ici" (drop it here) on phones**, and its text wraps into a broken column (`t1-it-request-phone.png`). Hide "drop" on touch devices.
6. **The builder's h1 stays "Untitled form"** while you type the title in the card below it. It updates only after a reload.
7. **New options are real values "Option 1", "Option 2"**, not placeholders, so a hurried creator publishes a form with "Option 2" in it. Use placeholders, and flag "Option N" left unchanged.
8. **An error shows before the user has done anything.** A new question shows "A question has no text." in red while its field is still focused and empty. Show problems only on Publish or on blur.
9. **Two controls are both named "Question"**: the question's text field and the type `<select>` (the accessibility tree has two "Question"). Name the select "Type of question".
10. **A viewer lands on the read-only Questions tab**, not on Answers/Summary, which is what they came for. Settings is shown to a viewer too.
11. **Share lists Camille (a manager) as "Can view answers"**, while managers can edit every form. The role shown is false.
12. **Share with a person is a native `<select>` "Choose a person"**, with no Chest groups ("Sales") and no "everyone" (store §2.7).
13. **Answers table**: no column sort, no hiding of columns, no date-range filter. The filter needs an extra *Show* tap (auto-apply it). Long columns are cut off with no scroll hint. There is no previous/next on a single answer and no mailto link on the respondent's email.
14. **No search or filter on the forms list** (store §2.8). A company will have 50+ forms in a year.
15. **Clicking a template or "Blank form" creates the form at once**, so abandoned "Untitled form" drafts pile up in "Everyone else's forms". Create on the first edit, or clean up untouched drafts after a day.
16. **"Stop taking answers" is buried** at the bottom of Settings. Closing a form is a main action: put it next to the status chip ("Open ▾ → Close now").
17. **Two anonymous check-in tools**: Forms' "Anonymous team check-in" template and the Polls tool's anonymous pulse. The seeded "How was your week?" is `once`, so it cannot be answered weekly; a check-in needs recurrence. Decide which tool owns pulse surveys and link to it from the other.
18. **Conflict**: the second editor sees "Someone else changed this form. Reload", and Reload throws their text away. Offer "Copy my changes" before reloading, and show who else is editing.
19. **Prefill links use internal ids** (`?q2xxxxxx=9`). Let the creator name the field ("nps").

## Bugs (steps to reproduce)

| # | Severity | Steps | Seen |
|---|---|---|---|
| 1 | Major | Classic layout, any choice/yes-no question → title sits on the card border | `r5-legend-light.png` |
| 2 | Major | Phone 390 px, open the builder of a form with a page jump → page is 698 px wide, content cut | `m-builder-fr-phone.png` |
| 3 | Major | Builder: type in an option, click *Share* within 0.7 s → edit lost | script `build5.mjs` |
| 4 | Major | Settings: change a field, click *Answers* → change lost, no warning | `set1.mjs` |
| 5 | Major | Option field, press Enter, type → text goes into the same option; console `reading 'closest'` (`builder.tsx:557`) | `one-choice-filled.png` |
| 6 | Minor | French builder: "Après cette page:" — the colon is hard-coded in JSX (`builder.tsx:645`), with no space before it as French typography needs | `m-builder-fr-phone.png` |
| 7 | Minor | Summary bar for 0 % still draws a sliver | `a-summary-phone.png` |
| 8 | Minor | Builder h1 does not follow the title field | `blank-builder.png` → after typing |

No server errors or console errors besides bug 5. Pages answer in 10–50 ms on the server.

## Migration in / out

- **In: none.** There is no import of form definitions from Typeform, Tally or Google Forms (README), and **no import of past answers** (CSV) either. A company switching keeps its 3 years of NPS history in the old tool.
  - *Fix:* a CSV import of answers into a form with a column mapping (S/M). For definitions, the Google Forms API returns JSON (`forms.get`) and Typeform's `GET /forms/{id}` is documented and stable. So "no stable format found" does not hold for those two; this is my assumption and I did not verify it here. Paste-a-JSON import is M.
- **Out: CSV of answers only.** It is well built (BOM, formula-injection guard, version column). But **file answers export only the file name** (`lib/logic.ts answerText`: `v.name`), so the CVs of a job form cannot be taken out except one by one. There is no export of the form definition, and no "export everything" ZIP.
  - *Fix:* a ZIP export (CSV + files in folders per answer + the form as JSON). Effort: M.
- **Leaving/erasure:** handled well (forms stay, manager access, erased marks). The "Erase a person's answers" page works by email or name and asks for a typed word (ERASE / EFFACER).

## UX notes

- **Empty state (new company):** good. The manager and the creator see "Ask anything, get clear answers", *Make your first form*, and three template chips (`empty-camille-en.png`). *New form* also sits top-right, so the screen has two buttons for one action. A plain member sees two lines of text and nothing else (`empty-hugo-en.png`): acceptable. The no-role page is consistent with the store.
- **Respondent on a phone (step mode):** on a par with Typeform. It uses big targets (52 px stars, 60 px scale keys), advances on tap, has clear errors ("Check the email address (like name@example.com)"), and a good thank-you screen (`r3-thanks.png`). Classic mode is dragged down by bug 1. The start page's "press Enter" hint and the mixed language (Major 7) are the other blemishes.
- **Keyboard:** the build flow can be done by keyboard. The focus order is logical (tabs → Publish → title → questions), and a new question focuses its text field.
- **French:** natural overall ("Merci de répondre à cette question.", "Des réponses sont déjà arrivées : l'anonymat ne peut plus changer."). The slips:
  - **Undo = "Annuler"** (`lib/i18n/fr.ts:157,370`), which collides with "Annuler les modifications" (discard) in the same screen. This is store §2.3; use "Annuler l'action".
  - The hard-coded colon (bug 6).
  - The footer "Les réponses restent dans le Chest de votre entreprise" speaks platform jargon to a respondent.
- **Store coherence (§2):**
  - Follows the conventions on: main action top-right; Delete (with Undo) / Remove (options, people) / Erase (GDPR) used exactly as the proposed glossary; no `window.confirm`; the member chip; the no-access page; a 24-hour hour select for closing.
  - Departs from them on:
    - Undo in French (§2.3).
    - Phone tabs overflow (§2.1).
    - The native `<select>` people picker (§2.7).
    - No search on the list (§2.8).
    - The Undo toast lasts 8 s with no pause (§2.9).
    - The native `type="date"` for "Stop on", which shows `mm/dd/yyyy` in an English browser (§2.6).
    - Mixed saving models inside one tool (autosave vs *Save*), which is new to this tool.
- **Trust:**
  - Good: versions per answer, anonymity guarantees, retention, erasure, and conflict detection.
  - Weak: no Trash for forms, no activity history ("who changed/published/deleted"), and no per-row protection on anonymous forms (Major 11).

## Fix plan (ordered)

1. Classic-layout legend fix + full-form visual shot in docs (S).
2. Builder: flush on navigation / unmount; Settings autosave or dirty guard (S).
3. Options Enter-to-add focus bug + test (S).
4. Phone: wrap the jump rows; four tabs, or scroll the active tab into view (S).
5. Anonymous forms: aggregates and shuffled texts only; no per-row table, filter or CSV (S).
6. Deleted-forms Trash with Restore; French "Annuler l'action"; a toast that pauses on focus (S).
7. Minor respondent polish: hide "press Enter"/"drop here" on touch, auto-advance Yes/No, resume at the last question, percentage progress (S).
8. Owner email alerts + daily digest (M, needs the `mail` proposal).
9. Company logo + cover image on public forms via brand mode (M).
10. The embed proposal in the SDK report (`frame-ancestors` per declared origin) + embed snippet on Share (M platform + S tool).
11. A requester's "Your answers" view + a per-answer status and note for request forms (M).
12. Matrix question, then signature; several files per question (M).
13. Per-form second language (M).
14. ZIP export with files + form JSON; CSV import of past answers; Google/Typeform definition import (M/L).
15. In-Chest actions to CRM/Helpdesk/Tasks + an outbound signed webhook (L, needs events between tools).
