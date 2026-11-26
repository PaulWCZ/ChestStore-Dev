# Critique — Quotes & invoices (tools/private/quotes)

Claims to replace: the invoicing part of Axonaut, Sellsy, Henrri, Tiime and Pennylane.
Used on 2026-09-29 in the harness (port 7300, `--prod --reset`), as Sofia (billing, EN), Inès (sales, FR), Hugo (sales), Camille (admin, FR); desktop and phone. I also emptied the tables with psql to see the first run (the harness has no `--empty` flag). I extracted the finalised PDFs' text with pypdf. The studio flow `lab/chest-dev/flows/quotes.mjs` passed 14/14 against my instance. Screenshots: `critique/sales/q-*.png`, PDFs `critique/sales/q-doc*.pdf`.

## Verdict

**Can a 50-person French company cancel Axonaut / Sellsy / Pennylane invoicing tomorrow? No.** The reform decides it, not the UI. Since **1 Sept 2026** every VAT-registered company must be able to *receive* e-invoices through an approved platform (PA). Large and mid-size companies must *issue* through one now; SMEs must from **1 Sept 2027**. Axonaut, Sellsy and Pennylane are themselves PAs (secondary sources below). A company that cancels them today loses its PA for receiving now, and in 11 months cannot legally issue its B2B invoices from this tool. On top of that, nothing can be migrated in (no import of clients, items or past invoices), and the numbering cannot continue an existing sequence.
**Completeness 4/10**: the legal core of a French paper invoice is excellent (mentions, gap-free numbering, frozen invoices, credit notes, deposits, VAT per rate). Factur-X, PA, online acceptance, payment links, automatic reminders, recurring invoices, imports and an accountant-ready journal are missing.
**UX 7.5/10**: "writing on the paper" is beautiful and understandable, and the desk and empty state are good. Points lost for the mixed-language editing surface, top navigation hiding items on the phone, and a few buried actions.

Sources for the reform and PA facts (read 2026-09-28, through search snippets; impots.gouv.fr was not opened here, so a human should confirm):
- Calendar: https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/guide_pratique_facturation_electronique.pdf ; https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises ; https://go.sellsy.com/blog/calendrier-de-la-facturation-electronique
- Sellsy, Axonaut and Pennylane listed as registered PAs: https://www.comparatif-facture-electronique.fr/plateformes-agreees/ ; https://www.pennylane.com/fr/fiches-pratiques/facture-electronique/liste-des-pdp

## Blockers

1. **No structured e-invoice and no path to a PA.** The PDF is plain PDF (not PDF/A-3) with no embedded CII/UBL XML, and nothing is sent to a PA (README "What it does not do"). Why it matters to the buyer: the owner's pitch "cancel Axonaut" makes the customer lose its e-invoicing platform. From Sept 2027 (now, for mid-size companies) every domestic B2B invoice from this tool is non-compliant unless someone re-keys it into a PA. Fix: (a) produce **Factur-X EN 16931** (PDF/A-3 with CII XML) from the same data. The totals are already EN 16931-shaped, so this is the tool's own work: **L**. (b) An SDK primitive, "declared outbound HTTPS with per-company secret", so the tool can push invoices to the company's PA API (AFNOR XP Z12-013) and read back their lifecycle statuses (déposée, rejetée, encaissée…): **L (SDK) + M (tool)**. (c) Until then, the tile, the README and the sales pitch must say "keep your PA; this tool drafts and numbers, your PA transmits". The settings page already says it; the pitch does not.
2. **No way in.** No import of clients, catalogue items or past invoices (`app/chest` has no import route; README: "import from Axonaut/Sellsy CSV" not done). A company with 300 clients and 150 items retypes everything. Its *unpaid* invoices stay in the old tool, so it must keep paying that tool until they are collected. Fix: CSV import of clients (mapping like Clients' importer, SIREN/VAT checked) and items: **M**. Import of open invoices as "external, to collect" records (number, date, client, total, due, paid) so collection continues here, without pretending they were issued here: **M**.
3. **Numbering cannot continue an existing sequence.** Where: `counters` starts at 0 each year; settings say "Les numéros repartent de 0001 chaque année". A company switching on 1 October after F-2026-0347 in Axonaut must either reuse numbers (illegal duplicates) or start a new prefix series mid-year. That is tolerated only if justified, and it confuses the accountant. Fix: in Settings, "Next invoice number" (admin only, only while the year's counter is 0 for that prefix, and written into the document history). Also allow a format without the year (many companies use `F0001` continuous). **S**

## Major

1. **The client cannot accept online.** Sellsy and Axonaut send a link where the client signs "bon pour accord" and the quote flips to accepted. Here a salesperson clicks "The client accepted" by hand. Fix: a public page `/q/<secret>` (the tool can have a public part, as Support and Booking do) showing the quote PDF with "Accept" (name + tick box + timestamp/IP recorded) and "Decline"; the bell tells the author. Not a qualified e-signature; say so. **M**
2. **No payment link and no automatic reminders.** The seed itself has an overdue invoice, and reminders are a button someone must remember. Axonaut and Sellsy run a relance schedule (J+1, J+15, J+30) and include a card/SEPA link. Fix: reminder rules per company (off by default: 3 steps, editable text) on the *schedules* proposal; a payment-link field ("Pay online: <url>") printed on the PDF and email (a static Stripe/GoCardless link needs no integration). **M**
3. **No recurring invoices.** The sample company bills "Maintenance du site — trimestre 3" by hand. Maintenance contracts and subscriptions are the weekly bread of small agencies. Fix: "Repeat this invoice every month/quarter/year" creating a *draft* handed to billing on the date (schedules proposal). Never auto-finalised. **M**
4. **The accountant's export is not a journal.** The CSV has date, number, client, excl. VAT and VAT per rate, and totals, but no account numbers (706/7xx per item type, 44571 per rate, 411 + client sub-account), no journal code, and no FEC-like layout. Pennylane users expect entries the accountant imports without re-keying. Fix: an "Accounting entries" CSV (one line per debit/credit, configurable account per VAT rate and per goods/services, client sub-account `411<code>`) alongside the current summary. **M**
5. **The accountant is not a member.** The "viewer" role is "the accountant's seat", but an external accounting firm is not in the Chest. Pennylane's core is that the accountant logs in. Fix: until the Chest has guest accounts, a scheduled monthly export emailed to the accountant (mail + schedules proposals), or a signed, expiring download link for one period's ZIP. Write the guest-account need in the SDK report. **M**
6. **Two client books.** Quotes keeps its own `clients` table next to Clients' `companies`. Only a won deal creates a client here, and edits never flow back. Sales update an address in Clients and the invoice prints the old one. Fix (suite): Quotes should look up and link to a Clients company when a client is created, and offer "Update from Clients" on the card; propose `crm.company.updated` in the events SDK proposal. **M**
7. **Past documents are not kept elsewhere.** 10-year retention, yet uninstalling the tool deletes everything; the only safeguard is "export each period". Fix: an automatic monthly archive ZIP written to the Chest's files (the capability exists) and a desk warning when the last archive is more than 45 days old. **S**
8. **No situation invoices and no other VAT rates.** Building trades (a big French SME segment) need *factures de situation* and retention money (*retenue de garantie*). Corsica and overseas rates are missing. Acceptable to defer, but the store page must say "not for construction firms billing by progress". **M (later)**

## Minor

1. **Unit not pluralised on the PDF:** "10 exemplaire 24,00" (doc F-2026-0003, `q-doc11.pdf`). Fix: store singular/plural units in the catalogue, or pluralise the French unit when qty > 1. **S**
2. **Mixed languages on one screen.** A French salesperson's new quote with no client yet shows "Quote / Valid until / Delivered on / FROM / QUOTE FOR / Total excl. VAT / This quote is valid until…" next to the French UI ("Numéroté à l'envoi", "Objet :", "Langue") (`q-new-quote-fr.png`). The paper follows the Chest locale (`en` in the harness) until a client is picked. Fix: default the document language to the author's language when no client is chosen, and label the paper area "Document in: English ▾" so the mix is explained. **S**
3. The date fields on the paper are raw `<input type=date>` in the browser's format (mm/dd/yyyy on my run), in the middle of a French document (`quote-editor-desktop.png`). Fix: show the formatted date and open a picker on click. **S**
4. On the phone, the top tabs scroll sideways and hide *Catalogue*, with no cue (`quote-editor-phone.png`, `invoice-fr-phone.png`). The download and settings icons have no label. Fix: a bottom bar (Desk, Quotes, Invoices, More) as in Clients. **S**
5. On an **overdue** invoice the big button is "Record a payment" and "Send a reminder" is a small underlined link (`invoice-fr-phone.png`). For an overdue invoice the job is the reminder. Fix: primary action depends on state (overdue → Send a reminder). **S**
6. The phone editor puts the whole "Send the quote" card above the paper, so you send before you see what you wrote (`quote-editor-phone.png`). Fix: a sticky bottom bar with total + Send, and the paper first. **S**
7. The "Autoliquidation" checkbox sits on every new quote's paper, where any salesperson can tick it. It is a tax decision. Fix: keep it on the client card only; on the paper, show it read-only when set. **S**
8. Settings labels the VAT number "obligatoire" even under *franchise en base*, where many micro-companies have none. Fix: make it conditional. **S**

## Bugs (with steps)

- The PDF plural "exemplaire" above (Minor 1) is the only output bug found. The legal mentions I checked on F-2026-0003 and A-2026-0001 are all present: seller identity with SIRET/RCS/VAT/capital, buyer SIREN, delivery address, kind of operation, VAT per rate, due date, penalties, €40 indemnity, no-discount sentence, and the corrected invoice on the credit note.
- Not a tool bug, a harness caveat: deleting the single `company` row makes every page 500 (React #441). The migration inserts it. A Chest would never do this, but the tool could recreate the row on read. **S**

## Migration in / out

- **In: nothing** (Blocker 2 and 3). There is no client CSV, no catalogue CSV, no open invoices and no numbering continuity.
- **Out:** a good period CSV (French separators) plus a ZIP of the PDFs of record with SHA-256. There is no export of clients or catalogue, and no accounting entries (Major 4). Fix: clients.csv and items.csv in the ZIP. **S**

## UX notes

- The desk (three figures, "Needs attention", recent) and the empty desk ("Les mentions légales de votre entreprise manquent … Rédigez votre premier devis") are exactly right for a first minute.
- The finalise step (irreversible, says so, shows the number) is a model of honest UI.
- French wording is natural and correct legal French ("Pénalités de retard : taux de refinancement de la BCE majoré de 10 points", "Pas d'escompte pour paiement anticipé").
- Inline new client: the SIREN key check gives a clear, plain error ("Un SIREN compte 9 chiffres, et ceux-ci n'en forment pas un valide.") and keeps the form (`q-new-client-submit.png`). The dialog is taller than a 860 px screen, and its buttons sit under the fold of the dialog.
- Speed: 0.7–1.2 s to network-idle per page. Fine.
- Trust: finalised invoices are frozen by a database trigger, removals have Undo, and history is on each document. Clear.

## Fix plan (ordered)

1. Next-number setting and a no-year number format. **S**
2. CSV import of clients and items; export them too. **M**
3. Honest pitch now (tile, README, store text): "keep your PA". Factur-X EN 16931 output. **L**
4. SDK: outbound HTTPS with per-company secrets for PA APIs; the tool pushes invoices and reads statuses. **L**
5. Open invoices import ("to collect"). **M**
6. Online accept page and payment link on documents. **M**
7. Reminder rules and recurring drafts (schedules proposal). **M**
8. Accounting-entries export; monthly archive to Chest files; accountant delivery. **M**
9. Link clients to Clients companies. **M**
10. The phone navigation, primary action by state, the unit plural, and the document language default. **S**


## October 2026: after the move to the new stack

_Added 6 October 2026 from Quotes's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **138.1 → 67.8 MiB**;
  image 464 → 34 MiB; first members' page 771 →
  500 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: a credit note taking back a deposit keeps its accounting mark, and takes back VAT only at the invoice's rates; outside the euro the exchange rate is asked, stated on the PDF and carried in Factur-X; a prefix another kind of document already uses is refused; amounts with letters refused, groups of three checked (`a462903`); "1,234" typed in a form refused as ambiguous, files read with their own decimal mark (`56553e6`). Axe 0 on 34 screens (`f07a8df`).
- **Pending**: Nothing listed as pending in its commits.

**Verdict, updated.** Custom domains now exist on the Chest (brief/08): the page where a client reads and accepts a quote can live on the company's own domain, which a client trusts more than a Chest address. The blockers that stay are not the address: transmission to an approved e-invoicing platform (PA), supplier invoices, bank matching. **Cancel tomorrow: unchanged — not yet.**
