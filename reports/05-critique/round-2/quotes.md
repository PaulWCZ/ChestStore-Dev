# Critique round 2 — Quotes & invoices (tools/private/quotes) vs Axonaut, Sellsy

Run 2026-09-29, port 7300, `npm run build`, `dev.mjs --prod --reset` and `--prod --reset --empty`. Studio flow `flows/quotes.mjs`: **20/20 passed**. My own pass: Sofia (billing, EN), Hugo (sales, EN), Inès (sales, FR), Camille (admin, FR), Léa (viewer); 1280/390 px; light/dark; own, Chest and sample-brand looks; axe 0 violations and no sideways overflow on 54 shots; 0 console/server errors. I downloaded a finalised invoice (F-2026-0003) and a draft quote and read them with pypdf. Screenshots `shots/q-*.png`, PDFs `q11.pdf`, `q7.pdf`.

Strength in one line: the invoice is now a real Factur-X with the French mentions, the numbering can continue Axonaut's sequence, and the phone editor finally shows the paper first with a sticky "Total · Send" bar.

## Verdict

**Can a 50-person French company cancel Axonaut / Sellsy tomorrow? Not yet — and "no" if cancelling means losing their approved platform (PA).** Since 1 Sept 2026 every company must be able to *receive* e-invoices through a PA; Axonaut and Sellsy are PAs (round-1 sources). Quotes produces a valid Factur-X but transmits and receives nothing, so the honest offer is "cancel the invoicing seats, keep a PA subscription" — which for most SMEs means keeping Axonaut/Sellsy anyway, since their PA is bundled. Beyond the reform: no online "bon pour accord", and unpaid invoices from the old tool cannot be imported.

| | Round 1 | Round 2 |
|---|---|---|
| Completeness | 4 | **6.5** |
| UX | 7.5 | **8** |

## Round-1 findings

Blockers
- B1 No Factur-X, no PA — **partly**. Factur-X EN 16931 **fixed**: the PDF of F-2026-0003 carries `factur-x.xml` (CII, `urn:cen.eu:en16931` guideline) — I checked the attachment, not PDF/A conformance; the README reports Mustang/veraPDF passes (not re-run here). PA transmission/reception: **not fixed** (platform).
- B2 No import — **partly**: clients and catalogue CSV **fixed** (flow: Axonaut file, columns matched, bad rows said); **open invoices "to collect" not done**.
- B3 Numbering cannot continue — **fixed** (Settings → next number, forward only, before first number; no-year format; flow).

Majors
- M1 Online acceptance — **not fixed** (designed in README, needs the public part; the lead decided to move the tool "in a later round").
- M2 Payment link + automatic reminders — **fixed** (static link printed; reminder steps 7/15/30, off by default; flow turns them on).
- M3 Recurring invoices — **fixed** (drafts only, never auto-finalised; flow).
- M4 Accountant's journal — **fixed** (FEC-shaped sales journal, 411/706/707/4191/VAT accounts configurable).
- M5 Accountant not a member — **partly** (period ZIP; no scheduled delivery, no guest).
- M6 Two client books — **partly** (a won deal fills empty fields; edits in Clients never flow back).
- M7 Archive outside the tool — **not fixed** (still "export each period"; uninstall deletes 10 years of legal records).
- M8 Situation invoices / other VAT rates — **not fixed** (stated in README: "not for construction firms").

Minors: unit plural **fixed** ("10 exemplaires" in the PDF); dates on the paper **fixed** (kit date field, "29/10/2026 · Jeudi 29 octobre 2026"); phone navigation **fixed** (5 labelled tabs, export/settings in More); overdue → "Send a reminder" is the primary **fixed** (`q-inv11-sofia-own-dark-phone.png`); phone editor paper-first + sticky Send **fixed**; Autoliquidation off the paper **fixed**; document-language default **not re-tested** for a blank quote; VAT "obligatoire" under franchise **not checked**.

## Still blocking (weekly, for an Axonaut/Sellsy customer)

1. **PA**: send the Factur-X and read its lifecycle status (déposée / rejetée / encaissée), and **receive supplier invoices** — both handled by Axonaut/Sellsy today.
2. **Client says yes online**: the salesperson still clicks "The client accepted". Sellsy/Axonaut customers are used to a link.
3. **Payments**: a static link, no card/SEPA collection, no bank feed to match payments; Axonaut reconciles with the bank.
4. **Open invoices from the old tool**: they must be collected in the old tool, so the old subscription runs until they are paid.
5. **CRM link one-way**: the address fixed in Clients never reaches the invoice card.
6. Reminder email words are not editable per company (a French SME always softens the first one).

## New problems (round 2)

1. **Viewer is told to write quotes.** Empty tool, Léa (viewer): "Votre bureau est vide — Rédigez votre premier devis : choisissez le client, ajoutez des lignes, envoyez-le…" with no button she can use (`q-e-desk-lea-own-light-desk.png`). Same bug family as round-1 CRM bug 1. **S**
2. **Sales told to use admin-only Settings.** Empty desk for Inès (sales): "…continuez votre numérotation de factures dans les Réglages" and "Importer vos clients" — Settings are admin-only (read-only for others). **S**
3. **Three primaries on the first screen.** Empty desk (admin, phone): "Nouveau devis" (filled), "Les remplir" (filled), "Rédiger un devis" (filled), plus "Nouvelle facture" and "Importer vos clients" — five buttons, three of them the same red (`q-e-desk-camille-own-light-phone.png`). brief/05 "one obvious action": while legal details are missing, the only primary should be "Les remplir"; while the desk is empty, drop the header buttons.
4. **"Needs attention" uses the same red dot** for "ready to finalise — prepared by Inès" (normal work) and "Overdue" (money problem) (`q-desk-sofia-brand_sample-light-desk.png`).
5. **"Recently" mixes two dates in one column**: "Due 24 Oct 2026" for unpaid invoices, the issue date for others. A billing clerk scanning the column misreads.
6. **Chest look is light only** (by the kit's design): a member with dark mode gets a white screen in that look only; fine, but say it in the Look picker.
7. `/` (public host) on a phone: a bare "this tool lives in your Chest" page. It is where the online-acceptance page will live; today a client who gets a link to it sees nothing useful — keep it unlinked.

Store coherence (§2): nav, glossary, Undo toast (pauses, Ctrl+Z), in-page confirm for finalising, kit date fields, member chip — all followed. Departure: item 3 (main action).

## Platform-dependent

- **PA connector** — the "partners" primitive written in the README (declared outbound HTTPS with a per-company secret, AFNOR XP Z12-013 flows, status events). Without it the pitch must say "keep your PA".
- **Public part / online acceptance** — needs the tool moved to `public-and-private` + `visitors`; nothing new in the SDK, a lead decision.
- **Guest account for the external accountant**, **scheduled email of the period ZIP** (`mail` + `schedules`), **monthly archive to Chest files** (exists: `files` — this one is tool work).
- **Bank feed** for payment matching — out of scope (regulated), CSV import is tool work.

## Top 3 fixes now

1. **Online acceptance page** (`/q/<secret>`, "Bon pour accord" name + tick + timestamp, decline, bell to the author) — move the tool to `public-and-private` as already decided. **M**
2. **Import open invoices "to collect"** (number, date, client, total, due, paid) so the old subscription can end on switching day; plus the **monthly archive ZIP to Chest files** with a desk warning. **M** + **S**
3. **Role-aware first screen**: viewer and sales empty states without actions they cannot take; one primary at a time (legal details first). **S**
