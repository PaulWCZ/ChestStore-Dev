# Forms — severe critique, round 3 (vs Typeform, Tally; the owner's beta)

Run 2026-09-29, port 11700. `npm run build`, `dev.mjs --prod --reset` and `--prod --reset --empty`. The studio flow `flows/forms.mjs` passes **25/25**.

My own pass, scripts `sfch/f1–f6.mjs, fe.mjs`, screenshots `sfch/shots/f-*.png`:
- **Camille** (manager, FR) makes the store's own **Contact** template into a website form, turns on "Also create a contact in Clients" and "Also open a ticket in Support", and publishes it.
- **A French visitor on a 390 px touch phone** answers it. I tried five looks (own dark, brand:port light/dark, catalogue:chest, brand:sample dark), a wrong email, then a correct one.
- I copied the **exact `forms.contact` / `forms.request` events Forms published** (`sfch/published1.json`) and delivered them to Clients and Support in their own harness runs (see crm.md and helpdesk.md). That is the end-to-end suite test that round 2 asked for.
- I also used the IT request as Hugo (member, phone), the answers as cards on a phone, and the empty tool as Camille, Hugo and Nora.

No console errors, no 5xx, no sideways scroll on any page I opened.

Strength, one line: Forms is still the best-built tool of my four. The public page is calm and correct in every look, and every round-2 UI item I re-checked is fixed.

## Verdict

**Can a 50-person French company cancel Typeform / Tally tomorrow? Not yet.**
- **Internal forms:** yes.
- **The website contact/quote form**, which is what they pay for, is still blocked on a real Chest:
  - no email alert (`mail`);
  - no embed (frame policy);
  - no webhook / Sheets / Slack.
- **The new suite links** (Clients, Support) are the right argument, but the Support link produces bad tickets with the default settings (N1 below).

| | R1 | R2 | R3 |
|---|---|---|---|
| Completeness | 6 | 7.5 | **7.5** (the suite links add value; webhooks are in the SDK but not wired, so this is flat) |
| UX | 7 | 8 | **8** (the phone answers are fixed; the routing defaults and the double messages cost as much as the fixes gained) |

## Round-2 top fixes and blockers

- **Top 1 — first receivers of Forms' events (Clients contact, Support ticket): fixed, with defects.**
  - Checked by running the real payloads through both tools.
  - Problems: see N1 and N2 here, B1 in crm.md, and N1 in helpdesk.md.
- **Top 2 — answers as cards on phones; "Colonnes affichées" disclosure; README claim: fixed.**
  - Checked in `f-answers-contact-phone.png`: 1 answer, cards, and a single *Filtrer* button. Also flow step 24.
- **Top 3 — FilePicker on touch, and preview chrome in the member's language: partly fixed.**
  - Preview: fixed ("APERÇU : RIEN N'EST ENVOYÉ" for Camille).
  - "ou déposez-les ici" still shows on 390 px touch in the kit FilePicker (kit 0.2.5). I saw it in Support's public form, Clients and Status. I did not re-open a Forms file question on a phone, but Forms uses the same component, so assume it is not fixed.
- **B1, email to the owner: not fixed (platform).** On a contact form, "Leur envoyer aussi chaque lot par e-mail" is **off by default**, even where mail exists.
- **B2, embed: not fixed (platform).** Only the button code works.
- **B3, integrations: partly fixed.**
  - Clients and Support now receive events.
  - `webhooks` **is now built in the SDK working copy** (SDK report §4.17, `sdk/client/src/webhooks.ts`, fake in `fakeChest`, `/_dev` panel), but Forms still says "n'est pas encore possible" (`settings-view.tsx:321`). The platform piece exists; the tool work has not been done.
- **Round-2 new 5, two buttons on the empty home: fixed.** There is now one "Créer mon premier formulaire" plus template chips.
- **Round-2 new 6, French NPS copy: fixed.** It now reads "Comment s'est passée leur expérience ? Des questions qui s'adaptent".
- **Round-2 new 8, English seeded forms in a French demo: not fixed.** Camille's home lists "How was your week?", "IT request", "Open day — Saturday 14 November" and "How did we do?" (`f-home-camille.png`).

## Still blocking (what a Typeform/Tally customer misses weekly)

1. **An email on each website answer**, to the owner and a copy to the respondent. On a real Chest there is no mail, and the owner's alert is off by default anyway.
2. **The form on the company's website** (inline embed or popup).
3. **Answers to Google Sheets / Slack / Zapier.** The SDK now has `webhooks`, so this is only tool work.
4. **Payments, signature, calculated fields, recall ("Merci {nom}")**: unchanged.
5. **Past answers import** (a Typeform NPS history). Tally import is also missing.

## New problems (round 3)

- **N1. The Support route's default mapping makes every ticket titled after the form, with no details.**
  - Steps:
    1. Make a form from the *Contact* template.
    2. Settings → switch on "Ouvrir aussi un ticket dans Support".
  - What happens:
    - The guess fills Email and Name, but **Sujet = "Le titre du formulaire"** and **Détails = "Aucune question"** (`z-routes.png`).
    - The event Forms then publishes has `"subject":"Contactez-nous","details":null`. The message only survives as one of the "other answers".
    - In Support every website ticket reads **"Contactez-nous"**, and the customer receives "Re: Contactez-nous [#1016]".
  - Cause: `guess()` in `settings-view.tsx` only fills a slot with exactly one candidate. The name question (short text) competes for Details and for Subject.
  - The same happens on the IT request form: Details = "Aucune question" although "Describe it in a few words" is the only long text.
  - The contact route guessed "Votre message" for the message, so the same form behaves differently for its two routes.
  - Round 2's flow maps these fields by hand, which hides the problem.
  - Fix: prefer a long-text question for Details and a choice or short "subject" question for Subject. Better: the template ships its routes pre-mapped. **S.**
- **N2. One website message produces two emails and two to-do lists.**
  - With both routes on, the visitor gets **Forms' copy** ("Une copie arrive dans votre boîte mail") **and Support's confirmation** ("Nous avons bien reçu votre demande…"). That is two senders for one message.
  - The team gets **Forms' bell and Support's bell**.
  - The answer keeps its own *Nouvelle / En cours / Traitée* state in Forms, which never follows the Support ticket. The answer page shows no "→ ticket #1016" or "→ contact" link (`f-answer-one-phone.png`).
  - Fix:
    - When a ticket route is on, turn the respondent copy off by default, or say "Support confirms it".
    - Show on the answer "Sent to Support (ticket) · Clients (contact)".
    - Hide the follow-up states for a routed answer. **S–M.**
- **N3. The routes promise delivery the author cannot check.**
  - The switches say "Chaque réponse … devient un contact dans Clients", followed by a small grey line that an admin must link the tools.
  - The author never learns whether Clients or Support is installed or linked. Answers are published into nothing, silently.
  - Fix: `chest.toolUrl("crm")` is already in SDK studio.14 (Clients uses it to link back). Grey the switch with "Clients n'est pas installé dans votre Chest" when it is absent. **S.**
- **N4. The Contact template has no "Entreprise" question.** Every `forms.contact` event arrives with `company: null`, so a B2B lead lands in Clients without its company. Add the question to the template (optional). **S.**
- **N5. The README contradicts itself.** "What it does not do yet" still says "**no store tool receives `forms.answered`, `forms.contact` or `forms.request` yet** (Clients and Support will…)", while "With the other tools" documents both receivers. **S.**
- **N6. A member cannot make a form.**
  - The default role for colleagues is *Membre*; Hugo reads "demandez le rôle Créateur à un responsable".
  - In Google Forms and Tally anyone makes a form. In a 50-person company, the office manager must give Creator one by one.
  - Fix: a manager setting "Everyone may create forms", or `creator` as the default member role. **S.**
- **N7. Sharing is still person by person** (no Chest group, no "everyone"). This is round-2 minor, not fixed.

Looks (five looks on a phone): the brand wins on the public page, no catalogue theme leaks, and there is no overflow. The phone error for the wrong email sits under the field ("Vérifiez l'adresse e-mail (comme nom@exemple.fr)") and a summary line sits above *Envoyer*. That is good.

## Platform-dependent

- **`mail`** (owner alerts, copies): proposal.
- **`embeddable`** manifest permission: SDK report, not built.
- **`webhooks`**: **built in the SDK working copy (§4.17)**. Nothing blocks Forms from wiring it except tool work (below).
- **Events between tools** + `toolUrl`: built. What is missing is the tool-side checks above.
- **Payments**: a partner primitive, not designed.

## Top 3 fixes now

1. **Make the suite link right by default (S).**
   - Template routes pre-mapped (Subject = "C'est à quel sujet ?", Details = "Votre message"); a smarter `guess()`; a "Entreprise" question in Contact.
   - Grey out the routes when Clients or Support is not installed (`chest.toolUrl`).
   - Show on each answer where it went.
   - No respondent copy when Support confirms.
2. **Wire `webhooks` (M).**
   - Settings → "Envoyer aussi à une adresse web": generic, Slack or Teams, using `webhooks.add/send/journal`, with the failure shown to the owner.
   - This is the Zapier/Sheets/Slack answer that Typeform customers use every week, and the SDK already has it with its fake.
3. **Owner alerts on by default for public forms, plus French seed forms (S).**
   - Default "chaque lot par e-mail" on for the form's owner when `mail` exists.
   - Seed the demo forms in FR and EN (the tool supports both per form).
