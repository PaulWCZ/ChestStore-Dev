# Quotes & invoices (Devis et factures): severe critique, round 3 (vs Axonaut, Sellsy)

Critic run: 2026-09-29, about 22:40 Paris time. Port 11500.

**Setup.** `npm run build`, then `dev.mjs --prod --reset` and `--prod --reset --empty`. My scripts and screenshots are in `critique3/c3/` (`q*.mjs`, `shots/q-*.png`).

**Who I used it as:** Inès (sales, FR) on a 390 px phone, Sofia (billing, EN), Camille (admin, FR), Léa (viewer), and an outside client on a phone (FR browser, dark).

**Looks:** own, Confetti for all tools, the Café du Port brand in dark, and the Chest look.

**Scenario, end to end:**
1. Inès creates a new client inline from the phone (a wrong SIREN first, then a valid one).
2. She adds a free line with a 10 % discount and sends the quote.
3. The client opens the link on a phone. Inès changes the price while the client reads.
4. The client's first answer is refused, then the client accepts.
5. Inès gets the bell and the quote's margin updates.
6. Sofia runs the month-end export and archives.

No console errors and no 5xx.

## Verdict

**Can a 50-person French company cancel Axonaut or Sellsy tomorrow? Not yet.**
- The reason is still the reform: this tool is not a PA and receives no supplier invoices, and Axonaut and Sellsy bundle their PA.
- On top of that, Axonaut's second weekly job, bank reconciliation, is absent, and there is no revenue reporting at all.
- "Cancel the invoicing seats, keep a PA" is honest. "Cancel Axonaut" is not.

| Score | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 4 | 6.5 | **7** (online "Bon pour accord", open invoices imported, monthly archive) |
| UX | 7.5 | 8 | **8** (role-aware desk; one visible bug on the client's page) |

Strength, one line: the client's page is excellent. It shows the quote as a readable page on a phone, "Bon pour accord" with the proof (PDF hash), and refuses an answer when the quote changed during reading.

## Round-2 top fixes and blockers

| Round-2 item | Now | Checked how |
|---|---|---|
| Top 1: online acceptance page | **Fixed, with a bug** | By hand, end to end: link in the email, page in FR, "changed during reading" refusal, accepted, bell to Inès, "Accepté en ligne par Lucie Bernard" in the history. **Bug N1** on the confirmation page. |
| Top 2a: import open invoices | **Fixed (flow, not replayed by hand)** | "Import invoices to collect" is on Invoices. The flow imports 6 rows with numbers kept and Undo. The source column sets are unverified (README). |
| Top 2b: monthly archive to Chest files | **Fixed** | Export shows "August 2026 / July 2026" ZIPs. Sofia's desk says "L'archive de juillet 2026 est prête… Gardez-en une copie hors du Chest". |
| Top 3: role-aware first screen | **Fixed** | Empty tool: Léa (viewer) sees "Rien pour l'instant" with no action. Inès (sales) is told to ask an admin for the legal details, and nothing mentions Settings numbering. Camille has one filled button while details are missing. |
| R2 new 4: same red dot for "to finalise" and "overdue" | Not re-checked by hand | — |
| R2 new 5: "Recently" mixed dates | **Fixed** | An "Issued" column; "€87.60 left" under the amount. |
| Blocker: PA transmission and reception | **Not fixed** (platform; "partners" is designed in the README only, no fake) | — |
| Blocker: payments collected | **Not fixed** | Static link only. |
| Blocker: CRM one-way | **Not fixed** | README. |
| Blocker: reminder wording per company | **Not fixed** | README. |

## Still blocking (what an Axonaut or Sellsy customer misses weekly)

1. **PA** (send, statuses, **receiving supplier invoices**). This is mandatory for every company since 1 Sept 2026, and it is the thing Axonaut and Sellsy bundle.
2. **Bank reconciliation.** Axonaut's daily screen matches bank lines to invoices. Here every payment is typed by hand. A CSV bank-statement import that suggests matches is tool work (S/M) and needs no regulated connector.
3. **Revenue at a glance.** No "CA du mois" and no turnover by month, client or salesperson (grep: no "chiffre d'affaires" anywhere). The boss's Monday question is answered only by exporting a period and opening a spreadsheet.
4. **Money in.** No card or SEPA collection, so a static link only.
5. **Quote comfort that Sellsy users use weekly:**
   - optional lines or variants ("option : pose +200 €");
   - attaching the CGV (conditions générales de vente) to quotes and invoices (the words appear nowhere in the tool);
   - knowing whether the client opened the quote.
6. **Creating a client** means typing everything. Axonaut and Sellsy fill name, address, SIREN, VAT and RCS from the company name or SIREN (the free public "Recherche d'entreprises" API). Here the country is a free "FR" text field ("Deux lettres : FR, BE, DE…").

## New problems (round 3)

- **N1: the client sees a raw template on the "accepted" page (bug, public, both languages).**
  - Steps: accept any quote on `/q/<secret>`.
  - The page reads "**{company}** est prévenue. Gardez le PDF…" (EN: "{company} has been told."). Seen in the own look, Confetti, and the Café du Port brand in dark.
  - Cause: `app/q/[secret]/page.tsx:78` renders `o.acceptedNext` without `format(…, {company})`.
  - French also: "est prévenue" assumes a feminine company name ("Atelier Martin est prévenue"). Write "Votre réponse a été transmise à {company}."
  - The flow's check reads `.answer-state` only, so it missed this.
- **N2: the email tells the client to reply, and the link is an afterthought.**
  - The sent text reads "Pour l'accepter, il vous suffit de répondre à cet e-mail." Then "Vous pouvez aussi le lire et l'accepter… en ligne : <link>".
  - Replies go to a generic `bonjour@` mailbox the tool never reads, so the salesperson must click "The client accepted" by hand, which is the very thing online acceptance was built to remove.
  - The link line is also invisible in the send dialog: the salesperson cannot see or move it.
  - Fix (S): make the link the first sentence ("Lisez-le et acceptez-le en ligne : …") and show it in the dialog as a fixed line.
- **N3: a sent quote changes silently under the same number.**
  - Steps: send D-2026-0007 (485,68 €), then edit a price on the paper: it is now 518,08 € with no new version and no warning.
  - The emailed PDF and the online page now disagree. The client who read 485,68 € in the email accepts 518,08 € online. The proof holds the right PDF, but the client was not told a new version exists.
  - Sellsy versions it. Fix (M): editing a sent quote asks "Send the new version?" and suffixes the number (D-2026-0007-2), or at least re-sends.
- **N4: after "the quote changed during your reading"**, the page keeps showing the old lines and price, and the ticked box is cleared. The client must reload by themselves to see what changed. Reload the quote in place and say what changed ("Prix de la ligne 1 : 149,90 € → 159,90 €").
- **N5: rare action above the main one on phones.** On Invoices (billing, phone), "Import invoices to collect" is a full-width button above "New invoice". It is a switching-day action. Move it into "More" once anything has been imported or finalised.
- **N6: the Chest look flattens the desk's hierarchy.** The "Bureau" heading is body-size and "Plus" sits in a heavy bordered box in the header (`q-desk-chest-phone.png`). It reads as a plain spreadsheet, not the store's look.
- **N7: the client's page language follows the browser, not the document.** A French quote opened in an English browser shows English chrome around a French quote. That is acceptable, but the email link could carry `?lang=` of the document, as Booking does.

## Platform-dependent

- **PA "partners" primitive** (declared outbound HTTPS with a per-company secret, AFNOR XP Z12-013 flows, status events). It is designed in the README only. Build it in `sdk/` with a fake PA, as the brief asks, so the day it ships the tool is ready. Until then: "keep your PA".
- `mail` (quotes, reminders), `schedules` (followup, archive), `visitors` (answer form): proposals.
- A guest seat for the external accountant.
- Payments (a Stripe or GoCardless "partner"), same primitive as the PA.

## Top 3 fixes now

1. **Fix the client-facing words (S):** the `{company}` template (N1), the email that says "reply to accept" (N2), and the in-place reload after a change (N4). Add a flow assertion on the full accepted page text.
2. **Versioned sent quotes (M):** changing a sent quote asks to send the new version, gives it a suffix, and the online link shows only the latest.
3. **Axonaut's weekly screens, within the Chest's limits (M):**
   - a bank-statement CSV import that proposes matches to unpaid invoices (amount, reference, client name) with one-tap confirm;
   - a "Chiffre d'affaires" card on the desk (this month vs last month and same month last year, by client and by salesperson);
   - SIREN autofill of a new client through a declared `network` host (`recherche-entreprises.api.gouv.fr`);
   - CGV attached to quotes.
