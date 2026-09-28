# Quotes — open-source research
_Read on 2026-09-28. Replaces: Axonaut, Sellsy, Pennylane (invoicing module), Freebe, Henrri, Invoice Ninja._

## The job
A founder, office manager or salesperson writes a **quote** from a short catalogue of products/services,
sends the PDF, and when the client says yes turns it into an **invoice** with the next legal number, then
marks it **paid** when the money arrives. The 80 % core: client + lines + VAT → clean PDF in under a minute,
quote → invoice in one click, "what is unpaid / overdue?" at a glance, and an export for the accountant.

## Projects
Stars and release dates come from the GitHub repository/releases pages as summarised by WebFetch (the GitHub
API is blocked here); GitHub shows current-year dates without a year, so "2026" is inferred where marked.
Licences were read from the raw LICENSE files.

### Invoice Ninja
| Field | Content |
|---|---|
| Project | Invoice Ninja — https://github.com/invoiceninja/invoiceninja — ~10.1k stars (as read). Latest release v5.11.53 (date not read). ~27k commits, very active. |
| Licence | **Elastic-2.0** (ELv2) — https://raw.githubusercontent.com/invoiceninja/invoiceninja/v5-stable/LICENSE ("Elastic License 2.0 (ELv2)"). Source-available, not open source. |
| Reuse | **Ideas only**. |
| Stack | PHP/Laravel, React front-end, Flutter apps. Does not transpose as code. |
| What it does best | The most complete feature set: quotes, invoices, credits, recurring invoices, client portal where the client approves a quote online, payment gateways, reminders, PDF designer, tasks/time → invoice. |
| What to avoid | Heaviness and slowness reported by self-hosters (https://forum.invoiceninja.com/t/self-hosted-extremely-slow/9680, https://forum.invoiceninja.com/t/performance-issues-after-update-slow-page-load-times/16748, https://forum.invoiceninja.com/t/invoice-ninja-slow-to-print-pdf/16978). Settings sprawl; white-label paywall. |

### Crater
| Field | Content |
|---|---|
| Project | Crater — https://github.com/crater-invoice-inc/crater — ~8.3k stars (as read). Latest release 6.0.6, 6 Mar 2025 — little activity since. |
| Licence | **AGPL-3.0** — https://raw.githubusercontent.com/crater-invoice-inc/crater/master/LICENSE |
| Reuse | **Ideas only**. |
| Stack | PHP/Laravel + Vue; React Native mobile app. |
| What it does best | Very clean, calm UI: estimate → invoice conversion, items catalogue, per-item or per-document tax, expenses, payments, simple reports (sales, profit/loss, taxes). Good reference for our visual simplicity. |
| What to avoid | Maintenance slowed (hence the InvoiceShelf fork); tax-per-item bugs noted in its own release notes. |

### InvoiceShelf (Crater fork)
| Field | Content |
|---|---|
| Project | InvoiceShelf — https://github.com/InvoiceShelf/InvoiceShelf — ~1.8k stars (as read). Stable 2.4.6 and 3.0.0-alpha.10, shown as "Sep 25/26" (year inferred 2026). Active. |
| Licence | **AGPL-3.0** — https://raw.githubusercontent.com/InvoiceShelf/InvoiceShelf/master/LICENSE |
| Reuse | **Ideas only**. |
| Stack | PHP 8.4/Laravel, TypeScript + Vue + Vite; MySQL/MariaDB/PostgreSQL/SQLite. |
| What it does best | Crater's UX kept alive; recurring invoices; customer portal; multi-company. Its 2.4.6 note "amounts converted to the company currency are now rounded to whole cents before they are stored" — a reminder to store money as integer cents. |
| What to avoid | Multi-currency rounding bugs on PostgreSQL (fixed in 2.4.6) — we keep one currency (EUR) in MVP. |

### Dolibarr
| Field | Content |
|---|---|
| Project | Dolibarr ERP & CRM — https://github.com/Dolibarr/dolibarr — ~7.7k stars (as read). Latest 24.0.1, shown as "Sep 7" (year inferred 2026). Very active, French community. |
| Licence | **GPL-3.0-or-later** — https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/COPYING |
| Reuse | **Ideas only**. |
| Stack | PHP, MariaDB/MySQL/PostgreSQL. |
| What it does best | The French legal reference: draft invoices get a provisional ref `(PROVxx)` and receive the definitive sequential number only on validation; validated invoices cannot be deleted, only corrected by a credit note (avoir); deposit (acompte) and situation invoices; configurable numbering masks; FEC accounting export; Factur-X module. |
| What to avoid | ERP-grade UI with hundreds of options; screens that need training. |

### Akaunting
| Field | Content |
|---|---|
| Project | Akaunting — https://github.com/akaunting/akaunting — ~10.2k stars (as read). Release not read. |
| Licence | **BUSL-1.1** — https://raw.githubusercontent.com/akaunting/akaunting/master/LICENSE.txt ; Additional Use Grant limited to 2 users / 1 company / 1,000 invoices; change to GPLv3 four years after publication (as summarised). |
| Reuse | **Ideas only**. |
| Stack | PHP/Laravel, Vue, Tailwind. |
| What it does best | Friendly small-business accounting: invoices + bills + bank accounts + reconciliation; nice dashboard (receivables, cash flow). |
| What to avoid | Paid "app store" modules for basics; licence restrictions. |

### SolidInvoice
| Field | Content |
|---|---|
| Project | SolidInvoice — https://github.com/SolidInvoice/SolidInvoice — ~973 stars (as read). Latest 3.0.1, 23 Jun 2026. Active. |
| Licence | **MIT** — https://raw.githubusercontent.com/SolidInvoice/SolidInvoice/master/LICENSE (Copyright (c) 2014 Pierre du Plessis) |
| Reuse | **Code** (MIT, with attribution) — but PHP/Symfony, so mostly the state machine, tax model and templates as reference. |
| Stack | PHP 8.4, Symfony 7.1, Doctrine, API Platform. |
| What it does best | Explicit invoice state machine (draft → pending → paid, overdue detection); quote → invoice; tax **rate snapshots** on each line (a later VAT change does not alter old invoices); 8 PDF templates. |
| What to avoid | Payment gateways (Payum), Meilisearch, Kubernetes — infrastructure we do not have. |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Company settings: legal name, form, capital, address, SIREN/SIRET, RCS city, VAT number, IBAN, logo, payment terms, late-penalty rate | MVP | Dolibarr, all | Needed for mandatory mentions. |
| Clients (company or individual) with billing and delivery address, SIREN, VAT number | MVP | All | Later shared with **Clients** (CRM) via a cross-tool API (SDK proposal). |
| Catalogue of products/services (name, unit price HT, unit, VAT rate, goods/service) | MVP | Crater, Axonaut | |
| Quote: lines, quantity, unit price, discount, VAT per line, totals HT/TVA/TTC, validity date | MVP | All | Money as integer cents; VAT rate snapshot per line (SolidInvoice). |
| Quote status: draft → sent → accepted / refused / expired | MVP | Invoice Ninja, Sellsy | |
| Quote → invoice in one click; deposit invoice (acompte) as % of quote | MVP (conversion) / later (acompte) | Dolibarr, Axonaut | |
| Legal numbering: draft has no number; "Finalise" assigns the next number of a continuous chronological sequence per year (e.g. `F-2026-0042`), atomically in a Postgres transaction | MVP | Dolibarr | Finalised invoices are **immutable**; no delete. |
| Credit note (avoir) to cancel/correct a finalised invoice | MVP | Dolibarr, law | Own sequence, references the invoice. |
| PDF of quote and invoice with all French mandatory mentions, EN or FR per client | MVP | All | pdfkit or pdf-lib; embedded font. |
| Mark as paid (date, method, amount; partial payments) ; list of unpaid / overdue | MVP | Crater, Invoice Ninja | Keep it a B2B receivable tracker — see caisse risk below. |
| Export for the accountant: CSV of invoices and credit notes (number, date, client, HT, TVA by rate, TTC, status) + ZIP of PDFs | MVP | Pennylane, Axonaut | ZIP/file download through the Chest file API. |
| Factur-X PDF (PDF/A-3 + CII XML, profile EN 16931) | later (before Sep 2027) | FNFE-MPE, Dolibarr, akretion | Needed for the PA hand-off. |
| Send to the company's Plateforme Agréée (upload Factur-X, read statuses) | later | Reform | Needs declared outbound network + per-PA credentials; AFNOR XP Z12-013 API. |
| Receive supplier invoices from the PA | never here | Reform | Belongs to an accounting/purchases tool or the PA itself. |
| Email the PDF to the client from the tool | later | All | Needs outbound email (SDK proposal); MVP = download the PDF and attach it in the user's own mail client. |
| Client approves the quote online (public page, e-signature light) | later | Invoice Ninja portal | Needs the public part of the tool (public-and-private folder) and signed public links. |
| Automatic payment reminders | later | Invoice Ninja | Needs cron + outbound email. |
| Recurring invoices | later | InvoiceShelf, SolidInvoice | Needs cron (or "generate due recurring invoices" on open). |
| Import clients/products from Axonaut, Sellsy, Invoice Ninja CSV | later | — | Export formats not verified in this pass. |
| Online card payment (Stripe…) | never | Invoice Ninja | Payment processing is out of scope. |
| Multi-currency, multi-company | never (MVP EUR, one company per Chest) | InvoiceShelf | |
| Bookkeeping, bank reconciliation, FEC generation | never | Akaunting, Dolibarr | Accountant's software. |
| Cash-register mode (receipts to individuals) | never | — | Would require NF525/LNE certification. |

## Reusable pieces
Versions and licences read from registry.npmjs.org on 2026-09-28; licence files where stated.
- **pdfkit** 0.20.2 (2026-08-30), MIT — PDF generation with text layout, tables by hand, font embedding; supports PDF/A (per its docs, not verified) and file attachments. https://github.com/foliojs/pdfkit
- **pdf-lib** 1.17.1, MIT — create/modify PDFs, attach files; **last release 2021-11-06, unmaintained**. Maintained MIT fork **@cantoo/pdf-lib** 2.11.1 (2026-09-15). https://github.com/Hopding/pdf-lib , https://github.com/cantoo-scribe/pdf-lib
- **@e-invoice-eu/core** 3.3.1 (2026-09-28), **WTFPL** (LICENSE read: https://raw.githubusercontent.com/gflohr/e-invoice-eu/main/LICENSE) — TypeScript generator of Factur-X (all profiles), ZUGFeRD, XRechnung, UBL, CII; its README warns PDF/A generation "is not battle-tested and may fail". WTFPL is permissive but not on our list: decide before depending on it. https://github.com/gflohr/e-invoice-eu
- **akretion/factur-x** 6.8 (2026-08-18 per README), **BSD-3-Clause** (https://raw.githubusercontent.com/akretion/factur-x/master/LICENSE.txt) — Python reference for embedding CII XML into PDF/A-3 and XMP metadata; the algorithm and XMP template can be ported to Node with attribution.
- **node-zugferd** 0.1.1-beta.1, MIT — beta, not production-ready. **@stackforge-eu/factur-x** 1.4.2 is **EUPL-1.2** (copyleft) → ideas only.
- **xmlbuilder2** 4.0.3, MIT; **fast-xml-parser** 5.11.1, MIT — build/parse CII XML.
- **big.js** 7.0.1 / **decimal.js** 10.6.0, MIT — decimal arithmetic if we do not use plain integer cents; **dinero.js** 2.0.2, MIT.
- **ibantools** 4.5.4, MIT or MPL-2.0 — IBAN/BIC validation.
- **papaparse** 5.7.0, MIT — CSV import/export.

## Legal and security notes
**What a Chest tool may do, and what must go through a certified platform**
- A Chest tool **may**: keep clients and catalogue, draft and send quotes (quotes are not regulated invoices), convert to invoices with legal numbering and mentions, produce PDFs, track payments of B2B invoices, export to the accountant.
- **Until the company's issuance date** (1 Sep 2027 for SMEs/micro, 1 Sep 2026 for large and mid-size companies — ETI/GE), a PDF invoice sent by the tool remains a valid invoice for domestic B2B.
- **Reception**: from **1 Sep 2026 every company subject to VAT must be able to receive** e-invoices, through a Plateforme Agréée (PA, formerly PDP) it chooses. This is the company's PA account, not our tool.
- **After the issuance date**, domestic B2B invoices must be issued as structured e-invoices (Factur-X, UBL or CII — the three "socle" formats every PA must accept) **and transmitted through the company's PA**; B2C and international sales go through **e-reporting**, also via the PA. The public portal (PPF) no longer issues or receives invoices; it keeps the directory (annuaire) and the data concentrator. → Our tool must either produce a Factur-X file the user uploads to their PA, or connect to the PA via the AFNOR **XP Z12-013** standard API (experimental standard published 2025). It must **never** present itself as a PA.
- About 149–166 PA are listed depending on the date (figures from third-party summaries, not the official list, which was blocked here).
- Factur-X: hybrid PDF/A-3 + UN/CEFACT CII XML; profiles MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED; current version 1.07 (ZUGFeRD 2.3), published 18 Sep 2024 by FNFE-MPE/FeRD. MINIMUM and BASIC WL carry no lines and are not EN 16931 compliant; target **EN 16931** profile. French CIUS rules add requirements beyond EN 16931 (per search results, not read in the DGFiP external specifications).

**Mandatory mentions (France, B2B)** — seller identity, SIREN/SIRET, legal form and capital, RCS; VAT number of seller (and buyer if any); invoice date; **unique number from a continuous chronological sequence**; client name and address; date of sale/service; description, quantity, unit price HT, discounts; VAT rate and amount per rate; totals HT and TTC; payment due date, **late-payment penalty rate** and the **€40 fixed recovery indemnity**; early-payment discount terms; exemption wording when relevant (e.g. "TVA non applicable, art. 293 B du CGI"). The reform adds four: **client SIREN**, **delivery address if different**, **category of operation** (goods / services / both), **option for VAT on debits** if chosen. Missing mentions: €15 fine per omission, capped at 25 % of the invoice amount (per search results). Sources: economie.gouv.fr "factures mentions obligatoires", Légifrance D3133-2 section, and the reform summaries below.

**Anti-fraud VAT certification (art. 286 I 3° bis CGI)** — since the 2018 finance law it applies only to **cash-register software and systems** recording payments from **non-VAT-registered customers (individuals)**; accounting and invoicing software were taken out of scope. But the BOFiP states that **invoicing software with a cash function used to track payments from individuals is a cash system** and falls in scope. Since the 2025 finance law (loi 2025-127, art. 43) the publisher's self-attestation is abolished: only a certificate from an accredited body (LNE, InfoCert) counts; deadline for publishers extended to 31 Aug 2026; user fine €7,500 per non-compliant software. → **Our tool must not record B2C cash receipts** (MVP: "mark as paid" for invoices to companies; for individuals, say plainly in the UI that payment tracking is informational and the tool is not a cash register). This is an interpretation, to be confirmed by a tax adviser.

**Retention** — invoices must be kept 10 years (Code de commerce L123-22 for accounting documents); LPF L102 B (tax) was 6 years and was reportedly extended to 10 years by a June 2026 law (third-party source, not verified on Légifrance). → finalised invoices and credit notes are never deleted by the tool; deleting a client that has invoices is blocked (the invoice data must stay intact for the retention period; GDPR erasure yields to this legal obligation, art. 17(3)(b) GDPR).

**Security** — only members with a platform role (e.g. "billing") may finalise invoices; `created_by`/`finalised_by` store `mbr_…`; numbering via a single Postgres row lock or sequence per (type, year) inside the finalisation transaction; PDFs are regenerated from immutable stored data, or stored once via the Chest file API.

## Sources
- https://github.com/invoiceninja/invoiceninja ; https://raw.githubusercontent.com/invoiceninja/invoiceninja/v5-stable/LICENSE
- https://forum.invoiceninja.com/t/self-hosted-extremely-slow/9680 ; https://forum.invoiceninja.com/t/performance-issues-after-update-slow-page-load-times/16748 ; https://forum.invoiceninja.com/t/invoice-ninja-slow-to-print-pdf/16978
- https://github.com/crater-invoice-inc/crater ; https://github.com/crater-invoice-inc/crater/releases ; https://raw.githubusercontent.com/crater-invoice-inc/crater/master/LICENSE
- https://github.com/InvoiceShelf/InvoiceShelf ; https://github.com/InvoiceShelf/InvoiceShelf/releases ; https://raw.githubusercontent.com/InvoiceShelf/InvoiceShelf/master/LICENSE
- https://github.com/Dolibarr/dolibarr ; https://github.com/Dolibarr/dolibarr/releases ; https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/COPYING
- https://github.com/akaunting/akaunting ; https://raw.githubusercontent.com/akaunting/akaunting/master/LICENSE.txt
- https://github.com/SolidInvoice/SolidInvoice ; https://github.com/SolidInvoice/SolidInvoice/releases ; https://raw.githubusercontent.com/SolidInvoice/SolidInvoice/master/LICENSE
- https://github.com/akretion/factur-x ; https://raw.githubusercontent.com/akretion/factur-x/master/LICENSE.txt
- https://github.com/gflohr/e-invoice-eu ; https://raw.githubusercontent.com/gflohr/e-invoice-eu/main/LICENSE
- https://registry.npmjs.org/ (pdfkit, pdf-lib, @cantoo/pdf-lib, @e-invoice-eu/core, node-zugferd, @stackforge-eu/factur-x, xmlbuilder2, fast-xml-parser, big.js, decimal.js, dinero.js, ibantools, papaparse)
- https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation (search snippet; direct fetch blocked)
- https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/guide_pratique_facturation_electronique.pdf (search snippet)
- https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises (search snippet)
- https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees ; https://www.data.gouv.fr/datasets/plateformes-agreees-pa-ex-pdp-pour-la-facturation-electronique-liste-dgfip-enrichie-2026 ; https://conformicheck.fr/ressources/liste-120-pa-dgfip ; https://www.why.eu/liste-plateformes-agreees/ (search snippets)
- https://vofact.fr/blog/ppf-portail-public-facturation-2026.html ; https://www.agiris.fr/facture-electronique/ppf (PPF role, search snippets)
- https://blog.tiime.fr/nouvelles-mentions-obligatoires-facturation-electronique ; https://www.kwixeo.fr/blog/mentions-obligatoires-facture-electronique-2026/ (new mentions, fine)
- https://www.economie.gouv.fr/entreprises/factures-mentions-obligatoires ; https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000037701019/LEGISCTA000038794646/ (search snippets)
- https://fnfe-mpe.org/factur-x/factur-x_en/ ; https://blog.seeburger.com/france-and-germany-publish-their-new-version-of-the-joint-standard-for-electronic-invoicing-zugferd-2-3-and-factur-x-1-0-07-from-ferd-and-fnfe-mpe/ ; https://tenorsolutions.com/profils-de-donnees/ ; https://www.why.eu/facture-x/ (search snippets)
- https://norminfo.afnor.org/norme/xp-z12-013/api-pour-interfacer-les-systemes-dinformations-des-entreprises-avec-les-plateformes-de-dematerialisation-partenaires/313343 ; https://ma-facture-electronique.org/formats-normes/afnor-z12-013/ (search snippets)
- https://bofip.impots.gouv.fr/bofip/11435-PGP.html/identifiant=ACTU-2018-00102 ; https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20251001 ; https://bofip.impots.gouv.fr/bofip/14667-PGP.html/ACTU-2025-00075 ; https://bofip.impots.gouv.fr/bofip/14826-PGP.html/ACTU-2025-00160 ; https://www.senat.fr/questions/base/2025/qSEQ251006482.html (search snippets)
- https://www.lido.app/fr/conservation-factures ; https://kohenavocats.com/conservation-documents-comptables-fiscaux-article-l102b-lpf-delai-dix-ans-controle-2026/ (retention, search snippets)
