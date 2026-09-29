# Clients (crm) — severe critique, round 3 (vs HubSpot CRM, Pipedrive)

Run 2026-09-29, port 11700. `npm run build`, `dev.mjs --prod --reset` (twice) and `--prod --reset --empty`. The studio flow `flows/crm.mjs` passes **37/37**.

My own pass, scripts `sfch/c1–c4.mjs, ce.mjs`, screenshots `sfch/shots/c-*.png`:
- **Deliveries:** the **real `forms.contact` events published by Forms** (`sfch/published1.json`: a French visitor, Nina Roux, `nina.roux@gmail.com`, `06 12 34 56 78`, no company), delivered through `/_dev/deliver`. Then a second answer from the same visitor with another email and a company.
- **Database:** checked with psql.
- **Who and how:**
  - Inès (sales, FR) and Camille (manager, FR);
  - phone 390 px with brand:sample light, brand:port dark and own dark;
  - desktop with the Chest look;
  - the empty tool on a phone, and the dirty-dialog Escape.

No console errors, no 5xx, no sideways scroll.

Strength, one line: the round-2 phone and look fixes hold everywhere I looked. The dots now differ by shape (diamond, filled, ring, dashed) under the Chest look, the owner picker is one clean line, Escape on a dirty dialog now asks "Abandonner vos modifications ?", and the empty board has one *Nouvelle affaire*.

## Verdict

**Can a 50-person French company cancel HubSpot / Pipedrive tomorrow? Not yet.**
- For a 3–10 person team without email sync: yes, as in round 2.
- But the new website-form link, which is the suite argument, **can put one visitor's message into another client's file**. The inbound leads also have **no place in anyone's day**.

| | R1 | R2 | R3 |
|---|---|---|---|
| Completeness | 5 | 7 | **7.5** (+ calendar feed of timed steps, "Log this call?", Forms intake) |
| UX | 7.5 | 8 | **8** (the phone and look bugs are fixed; the lead intake is clumsy and can mis-file) |

## Round-2 top fixes and blockers

- **Top 1 — kit phone tab bar that never breaks a word, and board collisions under the Chest/brand looks: fixed.**
  - brand:sample at 390 px: "Ma journée" now wraps on its word boundary (two lines, first tab 67 px tall vs 56 for the others). Nothing is cut mid-word.
  - The Chest board at 1280 px has no collision (`c-dk-catalogue_chest-light-deals.png`).
  - Cosmetic leftover: "Ma / journée" is still on two lines in brand fonts.
- **Top 2 — timed next steps into the Chest calendar, and "Log this call?": fixed on the proposal.**
  - README, `lib/step-calendar.ts`, flow step "phone: back from a call, the page asks to log it".
  - It is one way only: moving the event in Google does not move the step.
- **Top 3 — phone list chrome, filters behind one button, one New deal on an empty board, owner picker: fixed.**
  - `c-ph-*` screenshots, `ce.mjs` (one *Nouvelle affaire* button), flow.
- **B3, email capture: not fixed (platform).** Unchanged. It is still the first reason sales teams pay Pipedrive.
- **Round-2 new 8, "ou déposez-les ici" on phones: not fixed.** It is on the contact page at 390 px, next to a stray " : Fichiers" label.
- **Round-2 new 9, monospace in running text: partly fixed.** It is gone from company rows. Dates and "1 jour de retard" stay mono by design of the identity.

## Still blocking (what a HubSpot/Pipedrive customer misses weekly)

1. **Email capture and sending** (BCC, Gmail/Outlook sync): platform `mail` inbound.
2. **A leads inbox.** Pipedrive's *Leads* and HubSpot's "new contacts from forms" are where web enquiries wait to be qualified. Here a form lead is an **unassigned contact** that:
   - appears on **no one's My day** (Camille, manager, reads "Rien à faire aujourd'hui" right after the lead arrived);
   - gets **no next step**, and is **not a deal**;
   - can only be found via Contacts → Responsable → "Sans responsable", or one bell item to the managers.

   In a week, web leads rot.
3. **Two-way calendar**: the feed is read-only.
4. **Reports**: no stage-conversion funnel, and no "activities per salesperson per week", which is the number a Pipedrive manager reads every Monday.
5. One pipeline, EUR only, no products.

## New problems (round 3)

- **B1 (blocker). A form answer is filed on the wrong person when its phone matches, whatever the name and email.**
  - Steps:
    1. `--reset` sample book.
    2. Deliver Forms' real event for Nina Roux, `nina.roux@gmail.com`, phone "06 12 34 56 78".
    3. Deliver a second answer from her with `n.roux@roux-menuiserie.fr` and company "Roux Menuiserie".
  - Result (psql, and `c-claire-merged-phone.png`):
    - **No Nina Roux exists.** Both messages ("Bonjour, je voudrais un devis pour six chaises…", "Finalement 8 chaises…") are lines in **Claire Durand's** history (contact 1, whose mobile happens to be 06 12 34 56 78).
    - Claire's owner Inès is belled "**Claire Durand** a rempli le formulaire « Contactez-nous »".
    - Nina's name and both of her addresses are **stored nowhere**. The history line does not show who filled the form, so nobody can notice.
  - Cause: `lib/from-forms.ts` `match()` falls back to the phone even when the event carries an email that differs from the matched contact's, and never compares names.
  - Real life: a company's switchboard number, a shared shop phone, or a mistyped digit. Two people become one.
  - It is also a **GDPR** problem:
    - Nina's right of access cannot find her data.
    - "Effacer cette personne" on Claire deletes Nina's messages.
  - Fix (S):
    - Use the phone only when the event has no email, or when the matched contact has no email and the names agree.
    - Otherwise create the contact and flag "possible duplicate of Claire Durand" (the tool already has look-alike detection and Merge).
    - Always print on the history line what the form gave (name, email, phone).
- **N2. The history line hides the submitted identity.** Even when the match is right, the line reads only "A rempli le formulaire « Contactez-nous »" + message. Any email or phone that differs from the record (a new work address, for example) is dropped silently, because only empty fields are filled. Show "Nina Roux · n.roux@… · 06…" on the line, and offer "Utiliser cette adresse". **S.**
- **N3. Form leads are invisible in daily use** (see blocking 2). At least:
  - put "Nouveaux contacts des formulaires (n)" on the managers' and sales' My day, with *Je le prends* and *Prévoir la suite*;
  - optionally let the form's mapping create a deal in *Piste*. **M.**
- **N4. The phone number in the form's line is plain text** (on the Support side too). It is fine on the contact card, but the line from the form gives no `tel:`. Minor.
- **N5. Seed words: fixed** for fields, tags and industries (round 2 #10). Deal titles and steps are still English in a French demo, as the README admits. For the owner's French demo, re-seed a French book (S).

Looks: own, Chest, brand:sample and brand:port, light and dark, phone and desktop. Nothing broken or cut beyond the "Ma journée" wrap. The yellow brand:port primary on dark is readable.

## Platform-dependent

- **`mail` inbound** (BCC address, telling the team's addresses from clients'): named in the SDK report, not built. This is the first blocker.
- **Two-way calendar**: not proposed. The feed is one way by nature.
- **`events` + `toolLink`**: built (studio.14), and the link back to the Forms answer works in the harness.

## Top 3 fixes now

1. **Fix the form-contact matching (B1) and show the submitted identity on the line (N2) (S).** Email is authoritative; phone only as a fallback with a name check; otherwise a new contact marked "possible duplicate", plus a test with a shared switchboard number.
2. **A leads inbox (M).**
   - "Nouveaux contacts des formulaires" at the top of My day for sales/managers, with *Je le prends* / *Prévoir la suite* / *Pas un client*.
   - An optional "create a deal in Piste" in the event contract (`forms.contact` v1 can take a `deal` hint in a later version).
3. **Monday numbers for the manager (S–M).** On *Équipe*, add activities logged per person per week (calls, meetings, emails) and a stage-to-stage conversion row. Both come from existing tables.
