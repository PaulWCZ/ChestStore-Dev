# Support (helpdesk) — severe critique, round 3 (vs Zendesk, Freshdesk)

Run 2026-09-29, port 11700. `npm run build`, `dev.mjs --prod --reset` and `--prod --reset --empty`. The harness fakes `mail`; a real Chest has none. The studio flow `flows/helpdesk.mjs` passes **35/35**.

My own pass, scripts `sfch/d1–d3.mjs, de.mjs`, screenshots `sfch/shots/d-*.png`:
- **Deliveries:**
  - Forms' **real `forms.request` event** from the store's Contact template (`sfch/published1.json`);
  - a team IT request from **Nora**, a member **without a Support role**, as most employees are.
- **Agent side:** Inès (agent, FR, phone) replies to both.
- **Visitors:** a French visitor on a 390 px touch phone in own dark, brand:port, catalogue:chest and brand:sample dark; keyboard-only order on the public form; the empty tool as admin.

No console errors, no 5xx, no sideways scroll, including on Reports.

Strength, one line: every round-2 phone complaint is fixed. The inbox's first ticket is near the top, filters sit behind one *Filtrer*, Reports fit at 390 px, the email error sits under its field, and a double send makes one ticket.

## Verdict

**Can a 50-person French company cancel Zendesk / Freshdesk tomorrow? Not yet.**
- It is still **email on a real Chest** that decides.
- The **new Forms link** is useful for the website form, with defects on titles (below).
- For the **internal IT desk** it opens (Forms "Demande informatique" → Support), **the employee who asked can never read the answer**.

| | R1 | R2 | R3 |
|---|---|---|---|
| Completeness | 4.5 | 6 (8 with mail) | **6.5** (8 with mail): + tickets from Forms, double-send guard |
| UX | 8 | 8 | **8.5**: the phone inbox and reports are fixed; the colleague dead end costs |

## Round-2 top fixes and blockers

- **Top 1 — Reports on phones: fixed.** Checked on the empty tool at 390 px (0 px overflow; the period is one choice) and in the flow step "reports fit".
- **Top 2 — phone inbox, one *Filtrer (n)*, folder as a choice: fixed.** In `d-inbox-ines-phone.png` the first ticket is under the search.
- **Top 3 — Zendesk/Freshdesk history import: not fixed.**
  - The README explains why: the vendors' docs are blocked from the studio.
  - It is honest, but the old subscription still cannot end without a read-only seat.
- **B1, email in and out on a real Chest: not fixed (platform).**
- **B2, embed: not fixed (platform).**
- **Round-2 new 3, email error at the field: fixed.**
- **Round-2 new 5, triple send: fixed.**
- **Round-2 new 6, English seed tags: fixed** ("Livraison", "Abîmé", "Facture" in FR). Subjects are still English (customer data).
- **Round-2 new 8: partly fixed.**
  - On the **public** form the accepted types are now plain ("photos, PDF, Word, Excel et fichiers texte").
  - "**ou déposez-les ici**" still shows on a touch phone in all four looks (`sheet-dpub.png`).
  - The agent composer still lists "JPG, PNG, WEBP, GIF, PDF, TXT, DOCX, XLSX".
- **Round-2 new 7, empty inbox naming support@ on a Chest without mail: not verifiable.** The harness has mail. The empty inbox says "…ou à support@atelier-martin.test". Still unchecked.

## Still blocking (weekly, for a Zendesk/Freshdesk customer)

1. **Email in and out**: the channel of most tickets.
2. **The requester's own view of their requests.**
   - For internal requests (IT, facilities), the Freshservice/Zendesk requester portal is used every day.
   - Nothing here does it (N1).
3. **A help centre / FAQ** that deflects tickets: the Wiki has no public mode.
4. **SLA escalation and rules on later events** ("waiting 2 days → tell the lead").
5. **History import.**
6. **Several addresses/brands** (support@ + sav@).
7. **Website widget.** Frames are blocked by the platform.

## New problems (round 3)

- **N1. A colleague's request is a dead end.**
  - Steps:
    1. Deliver `forms.request` from a team form, requester `mbr_nora…`. Nora has Support without a role, like any employee who is not an agent.
    2. Inès replies "Nora, le technicien passe demain matin".
  - What happens:
    - Nora's bell gets "**Inès Moreau a répondu à votre demande 1017**" with a link to `/chest/tickets/1017`.
    - The link opens "**Vous ne pouvez pas encore utiliser Support** — Votre rôle ne donne aucun accès" (`d-nora-opens-bell` run).
    - The reply text is nowhere she can read. Support keeps no address of colleagues, and Forms' "Ce que vous avez envoyé" still says *Nouvelle* because the two states are not linked.
  - The only way out is to give every employee the Support *viewer* role, which shows them **every customer's ticket**.
  - `lib/tell.ts` assumes "the Chest tells only those who have Support". If the platform does filter, she gets nothing at all; if it does not, she gets a bell she cannot open. Neither works.
  - Fix, either one:
    - **(a)** a "Mes demandes" page in Support, open to any member for their own tickets only, readable and answerable, with the bell pointing there (**M**);
    - **(b)** Support publishes `support.request.updated {answer, state, reply}` back to Forms, which shows it under "Ce que vous avez envoyé" (**M**, both tools).
- **N2. Tickets from the store's own Contact form are all titled "Contactez-nous".**
  - With Forms' default mapping (see forms.md N1), Subject is the form title and Details is empty.
  - Every website ticket in the inbox reads "Contactez-nous". The customer receives "Re: Contactez-nous [#1016]".
  - The message shows as "Votre message :" among "Votre numéro de téléphone : …" and "C'est à quel sujet ? : Un devis" (`d-ticket-nina-phone`).
  - Support-side fix (S): when the subject equals the form title and a field looks like a subject (a choice) or a message, use it, e.g. "Un devis — Bonjour, je voudrais…".
- **N3. The customer gets two emails for one message.** Support's confirmation ("Nous avons bien reçu votre demande…") arrives alongside Forms' "copy of your answers", from two different senders. Support cannot know about Forms' copy, so the fix is on Forms' side, but the customer experience belongs to the suite. **S.**
- **N4. Settings save with *Enregistrer* buttons** (several on one page). Forms and the kit's direction autosave. Leaving the page loses edits silently unless it warns (not checked). This is a store-coherence departure. **S.**
- **N5. The phone number in a Forms ticket is plain text**, and so is the customer's email in some rows. There is no `tel:` for the agent who wants to call back from a phone. **S.**
- **N6. The honeypot label "Laissez ce champ vide"** is in the page text. It is presumably hidden visually, but check that it is `aria-hidden` / `tabindex=-1`. It was not in the keyboard order I recorded, which is good.
- **N7. The empty inbox does not suggest the Forms link.** A new company that already has a website contact form in Forms is not told "Relier un formulaire de Formulaires". Minor.

Looks: own dark, brand:port light, catalogue:chest (the public page correctly keeps Support's own look) and brand:sample dark. All are readable at 390 px, and no catalogue theme leaks onto the customer page.

## Platform-dependent

- **`mail` send + receive**: the verdict hangs on it.
- **`embeddable`** manifest permission for the website frame.
- **Mailboxes named at install time** (several addresses).
- **Public Wiki mode** for a help centre.
- **Webhooks** (built in the SDK working copy, §4.17): "new ticket → Slack/Teams channel" is the first integration Zendesk teams set up. The SDK report itself notes Support never wrote it. This is tool work now.

## Top 3 fixes now

1. **Close the colleague loop (N1) (M).** "Mes demandes" for any member, limited to their own tickets, where they read and answer. The bell points there. Optionally feed the state back to Forms' "Ce que vous avez envoyé".
2. **Better tickets from Forms (N2, N5) (S).** A real subject when the event's subject is just the form title; the message first, the other answers under it; `tel:` and `mailto:` on the fields.
3. **"Nouvelle demande → Slack/Teams" through `webhooks` (M).** It is now in the SDK with its fake. Admin Settings: an address, the kind (Slack/Teams/generic), which events (new, customer replied, waiting too long). This also gives the SLA reminder a channel without mail.
