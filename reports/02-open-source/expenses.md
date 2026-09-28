# Expenses — open-source research
_Read on 2026-09-28. Replaces: N2F, Expensify, Spendesk (expense-claim part), Lucca Cleemy (ex-Cleemy Notes de frais)._

## The job
An employee who paid for something for work (train ticket, lunch with a client, hotel, kilometres with
their own car) snaps the receipt, types the amount and a category, and gets reimbursed. Daily, 80 % of
use is: "add an expense with its photo", "send my month", the manager "approve / refuse", and the
accountant or office manager "export what to pay and what to book", then mark it paid.

## Projects

### Odoo Expenses (`hr_expense`)
| Field | Content |
|---|---|
| Project | Odoo, https://github.com/odoo/odoo — ~54.7k stars (whole ERP); latest branch 20.0; module read on branch 19.0 (`addons/hr_expense`, manifest version 2.1). Very active. |
| Licence | `LGPL-3.0` (Community edition) — https://raw.githubusercontent.com/odoo/odoo/19.0/LICENSE |
| Reuse | **Ideas only** |
| Stack | Python, Odoo ORM, PostgreSQL, OWL front-end. Business rules transpose; code does not. |
| What it does best | The reference workflow: `draft → submitted → approved → posted → in_payment → paid`, `refused` (https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_expense/models/hr_expense.py). **Paid by**: "Employee (to reimburse)" vs "Company" (company card) — one flag, two accounting treatments. **Duplicate warnings**: same amount/date/employee (`duplicate_expense_ids`) and **same receipt file** by attachment checksum (`same_receipt_expense_ids`). Split an expense; multi-currency with the rate shown; manager computed from the employee's department; re-invoice to a customer project. |
| What to avoid | Needs the full accounting app (`depends: account, hr`); "products" as expense categories confuse non-accountants; receipt OCR ("digitisation") is a paid Odoo IAP service, not in the open code. |

### Frappe HR (Expense Claim)
| Field | Content |
|---|---|
| Project | Frappe HR / HRMS, https://github.com/frappe/hrms — ~8.8k stars (as read); v16.20.0, 2026-09-23 (https://github.com/frappe/hrms/releases.atom). Very active. |
| Licence | `GPL-3.0` — https://raw.githubusercontent.com/frappe/hrms/develop/license.txt |
| Reuse | **Ideas only** |
| Stack | Python, Frappe framework, MariaDB, tied to ERPNext accounting. |
| What it does best | Expense claim with several lines, each with a type mapped to an account; **employee advances** deducted from the claim; multi-level approval workflows; **vehicle log → mileage claim**; mobile PWA for claims; "unpaid expense claims" report. |
| What to avoid | ERP-grade forms; the mileage and advances features have produced accounting bugs (https://github.com/frappe/hrms/issues?q=is%3Aissue+expense+claim — #5318 payroll failure on employee advances, #4551 wrong vehicle-log total, #5103/#5144 unpaid-claim report errors). |

### Actual Budget
| Field | Content |
|---|---|
| Project | Actual, https://github.com/actualbudget/actual — ~29.2k stars; release not verified. Active (179 open issues, 88 PRs as read). |
| Licence | `MIT` — https://raw.githubusercontent.com/actualbudget/actual/master/LICENSE.txt |
| Reuse | **Code** (MIT, with attribution) — personal finance, not expense claims, but its TypeScript amount parsing/formatting and CSV/OFX import helpers are reusable. |
| Stack | TypeScript, Node, React, SQLite (local-first sync). Language matches ours; storage model does not. |
| What it does best | Very fast keyboard entry of transactions; forgiving amount input ("12,5" / "12.50"); CSV import with a column-mapping preview; rules that auto-categorise by payee. |
| What to avoid | Envelope-budgeting concepts are irrelevant to claims; no approval, no receipts. |

### Firefly III
| Field | Content |
|---|---|
| Project | Firefly III, https://github.com/firefly-iii/firefly-iii — ~24.8k stars; v6.7.6, 2026-09-28 (https://github.com/firefly-iii/firefly-iii/releases.atom). Very active. |
| Licence | `AGPL-3.0` — https://raw.githubusercontent.com/firefly-iii/firefly-iii/main/LICENSE |
| Reuse | **Ideas only** |
| Stack | PHP, Laravel, MySQL/Postgres. |
| What it does best | Attachments on every transaction; rule engine ("if description contains SNCF → category Train"); tags; multi-currency; strong REST API. |
| What to avoid | Double-entry bookkeeping vocabulary; built for one person's money. |

### I Hate Money
| Field | Content |
|---|---|
| Project | I Hate Money, https://github.com/spiral-project/ihatemoney — ~1.4k stars; 7.2.1, 2026-08-07 (https://github.com/spiral-project/ihatemoney/releases.atom). Maintainers aim for "maintenance mode". |
| Licence | BSD-3-Clause-style with a "beer" wish (custom text, no exact SPDX match) — https://raw.githubusercontent.com/spiral-project/ihatemoney/master/LICENSE |
| Reuse | **Code** (permissive BSD-like, with attribution) — but Python; ideas matter more. |
| Stack | Python, Flask, SQLAlchemy (Postgres supported). |
| What it does best | Minimal "who paid what for whom" form, usable by anyone in seconds; settle-up computation; CSV/JSON export. Shows the bar for simplicity. |
| What to avoid | Shared-budget model (groups of friends), not employee → company reimbursement. |

### ExpenseOwl
| Field | Content |
|---|---|
| Project | ExpenseOwl, https://github.com/Tanq16/ExpenseOwl — ~1.5k stars; release not verified. |
| Licence | `MIT` — https://raw.githubusercontent.com/Tanq16/ExpenseOwl/main/LICENSE |
| Reuse | **Code** (MIT) — little to take (Go). |
| Stack | Go + vanilla JS; JSON file or PostgreSQL. |
| What it does best | Built because Actual and Firefly were "too complex": one form, one monthly pie chart, CSV import/export. |
| What to avoid | No authentication at all ("deploy carefully") — the opposite of what a company needs. |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Add an expense: photo/PDF of receipt, amount TTC, date, category, short note; VAT amount optional | MVP | Expensify, N2F, Odoo | Receipt via the **Chest file API**; phone camera through `<input type="file" capture>`. |
| Categories with a default VAT rule: meals, train/plane, taxi, hotel, fuel, tolls & parking, supplies, other | MVP | Odoo "products", N2F | Each category carries its accounting account (6251 travel, 6256 missions, etc.) set by the accountant, and whether VAT is recoverable (hotel = no, fuel = 80 %). |
| Mileage expense: from → to (typed), km, vehicle CV and type (car / motorbike / moped, electric), amount computed with the barème | MVP | Frappe HR vehicle log, N2F | The barème is a yearly data table in the tool; annual km per member tracked to apply the right band. No map/route API (no outbound network). |
| "My expenses": list by month with status (draft, sent, approved, refused, paid) | MVP | Odoo states | |
| Send for approval (one or several expenses at once) | MVP | Odoo 19 (no more "sheets") | |
| Manager approves / refuses with reason; can approve only their team's | MVP | all | Needs **manager relationship from the SDK**. |
| Paid by: me (to reimburse) / company card | MVP | Odoo `payment_mode` | Company-card lines are "justify only", never reimbursed. |
| Duplicate warning: same amount + date + member, or same receipt file (hash) | MVP | Odoo | Warning, not a block. |
| Accountant view: approved to pay, export, mark paid (with date) | MVP | Spendesk, N2F | Payment itself stays in the bank (SEPA file is later). |
| Export: CSV (one line per expense: member, date, category, account, HT, VAT, TTC, receipt link/filename) + a ZIP of receipts named `<date>_<member>_<amount>.pdf` | MVP | N2F, Expensify "Basic export" | Expensify's basic template = date, amount, merchant, category, receipt URL (per search result, https://help.expensify.com/articles/expensify-classic/spending-insights/Default-Export-Templates). ZIP generation must fit request limits (see SDK). |
| Journal export in FEC column layout (JournalCode … Idevise) for the accountant to import | later | French accounting practice | An extract is not a legal FEC (only the company's accounting software produces that), but most French accounting tools import this layout. |
| Import past expenses from CSV (Expensify / N2F / generic) | later | Actual (column-mapping preview) | Expensify exports are template-based and customisable, so a mapping screen beats a fixed parser. |
| Multi-currency with rate typed or from the receipt | later | Odoo, Firefly | No live FX API (outbound network); rate entered by the employee. |
| Advances (avance sur frais) deducted from claims | later | Frappe HR | |
| Policy limits (e.g. meal ≤ 25 € → warning) | later | Spendesk, Lucca | Warnings only. |
| Monthly reminder "send your expenses" | later | N2F | Needs **scheduled jobs** (SDK proposal). |
| Email to approver / employee | later | all | **No outbound email yet** (SDK proposal); MVP uses the Chest shared inbox. |
| Receipt OCR (amount, date, VAT read from the photo) | later | Odoo IAP, Expensify SmartScan | Only on-server (e.g. `tesseract.js`, Apache-2.0); no cloud OCR without declared outbound network. Must stay a suggestion the user confirms. |
| SEPA transfer file (pain.001) for reimbursements | later | Spendesk | |
| Re-invoice expense to a customer project | never | Odoo | Belongs to an invoicing tool. |
| Company cards / bank feeds, per diems abroad, budgets | never | Spendesk, Firefly | Long tail. |

## Reusable pieces
- `dinero.js` 2.0.2 — `MIT` (npm, 2026-03-13), or `decimal.js` 10.6.0 — `MIT` / `big.js` 7.0.1 — `MIT`: exact money arithmetic. Storing integer cents in Postgres is enough; VAT splits need round-half-even rules that we should test ourselves.
- `papaparse` 5.7.0 — `MIT` / `csv-parse` 7.0.3 — `MIT`: CSV import; writing CSV is trivial (but escape `=`, `+`, `-`, `@` prefixes against CSV/formula injection).
- `sharp` 0.35.5 — `Apache-2.0` (2026-09-27): shrink phone photos, strip EXIF GPS before storing. Native binary — check it installs in the Chest runtime. Fallback: `exifr` 7.1.3 — `MIT` (last published 2021).
- `heic2any` 0.0.4 — `MIT` (2023): iPhone HEIC → JPEG in the browser (old, check).
- `file-type` 22.1.1 — `MIT` (2026-09-17): verify the real type of an uploaded receipt (image or PDF only).
- `pdf-lib` 1.17.1 — `MIT` (last published 2021-11-06): one printable PDF of a claim with its receipts (later).
- `tesseract.js` 7.0.0 — `Apache-2.0` (2025-12-15): on-server OCR (later).
- Actual Budget's amount parser and CSV-mapping UI (MIT) — https://github.com/actualbudget/actual.

## Legal and security notes
- **Mileage allowance (barème kilométrique)**: the scale used for income tax 2025 (published 2026) is **unchanged** from 2024 and 2025 (per search results: https://www.legifiscal.fr/actualites-fiscales/4477-ir-revalorisation-2026-bareme-indemnites-kilometriques.html, https://www.economie.gouv.fr/particuliers/impots-et-fiscalite/gerer-mon-impot-sur-le-revenu/impot-sur-le-revenu-tout-savoir-sur-le-bareme-des-frais-kilometriques). `d` = professional km in the year.

  | Cars | ≤ 5 000 km | 5 001 – 20 000 km | > 20 000 km |
  |---|---|---|---|
  | 3 CV and less | d × 0.529 | d × 0.316 + 1 065 | d × 0.370 |
  | 4 CV | d × 0.606 | d × 0.340 + 1 330 | d × 0.407 |
  | 5 CV | d × 0.636 | d × 0.357 + 1 395 | d × 0.427 |
  | 6 CV | d × 0.665 | d × 0.374 + 1 457 | d × 0.447 |
  | 7 CV and more | d × 0.697 | d × 0.394 + 1 515 | d × 0.470 |

  | Two-wheelers | ≤ 3 000 km | 3 001 – 6 000 km | > 6 000 km |
  |---|---|---|---|
  | Motorbike 1–2 CV | d × 0.395 | d × 0.099 + 891 | d × 0.248 |
  | Motorbike 3–5 CV | d × 0.468 | d × 0.082 + 1 158 | d × 0.275 |
  | Motorbike > 5 CV | d × 0.606 | d × 0.079 + 1 583 | d × 0.343 |
  | Moped ≤ 50 cm³ | d × 0.315 | d × 0.079 + 711 | d × 0.198 |

  Car rows 3, 4, 5, 6, 7 CV (all bands) and the 1–2 CV motorbike and moped rows were confirmed by search results (https://www.legalstart.fr/fiches-pratiques/fiscalite-entreprises/bareme-kilometrique/, https://mon-calcul-impot.fr/articles/bareme-kilometrique-2026, https://www.gerantdesarl.com/actualite/Bareme-kilometrique-2026-motos-scooters-cyclomoteurs). The motorbike 3–5 CV and > 5 CV rows are from the 2024 scale as we know it and were **not verified** today — verify on impots.gouv.fr before shipping. **100 % electric vehicles: +20 %.** The same scale caps the social-contribution exemption of allowances an employer pays (URSSAF); above it, the excess is subject to contributions (per search results, https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/indemnites-kilometriques.html, https://www.spendesk.com/fr/blog/notes-de-frais-kilometriques-bareme/). One search result says an "arrêté du 4 septembre 2025" replaced the arrêté of 20 Dec 2002 on professional expenses — **not verified**. The tool must store the scale per year as data and never hard-code it in logic; the year's scale is chosen by the expense date.
- **Receipts and dematerialisation**: paper receipts can be scanned and the paper destroyed if the copy is faithful (arrêté of 22 March 2017, art. A102 B-2 LPF; strengthened by arrêté of 23 May 2019, from 1 July 2019) — per search results (https://www.n2f.com/blog/notes-de-frais-dematerialisees/, https://www.francenum.gouv.fr/guides-et-conseils/pilotage-de-lentreprise/dematerialisation-des-documents/dematerialisation-des). Consequences for us: keep the original file untouched (store the upload as received; any resized preview is a separate file), record a SHA-256 hash, upload date and uploader, and never let a receipt be replaced after approval. Retention: 6 years for tax (LPF), 10 years for accounting documents (Code de commerce L123-22) — commonly quoted, not re-read today.
- **VAT recovery**: restaurant meals for business: recoverable; hotel nights for staff: **not** recoverable (breakfast/meals itemised on the invoice are); fuel for passenger cars: 80 %; a receipt made out to the employee personally does not allow recovery; above 150 € HT an invoice in the company's name is required — per search results (https://www.keobiz.fr/le-mag/tva-sur-les-repas/, https://ardoise.bzh/blog/tva-recuperable-note-de-frais/, https://qonto.com/fr/blog/gestion-entreprise/comptabilite/tva-hotel). The tool records the VAT amount the employee reads on the receipt; the recoverability rule belongs to the category, set by the accountant.
- **2026 e-invoicing reform**: since 1 Sept 2026 every French company must be able to **receive** e-invoices via an approved platform (PA); issuing becomes mandatory for SMEs on 1 Sept 2027. Till receipts and purchases under 150 € HT remain ordinary proofs for expense claims; above 150 € HT the supplier's invoice to the company flows through the e-invoicing circuit — per search results (https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises, https://conforme2026.fr/guides/notes-de-frais-facturation-electronique, https://www.n2f.com/blog/reforme-facturation-electronique-notes-de-frais/). Impact: add "invoice received on the company's platform" as a proof type (reference number instead of a photo) — later.
- **FEC**: 18 tab-separated columns (JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum, CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib, Debit, Credit, EcritureLet, DateLet, ValidDate, Montantdevise, Idevise), UTF-8 or ISO-8859-15, art. A47 A-1 LPF — per search result (https://cabinet-osmose.fr/format-et-structure-du-fec-guide-technique-complet/). We export a journal extract in this layout, not "the FEC" of the company.
- **GDPR**: receipts can reveal private data (guests' names, health purchases); access = the employee, their approver, accountants/admins only. Strip GPS EXIF from photos. IBAN for reimbursement is not stored in MVP (payroll already has it).
- **Security**: identity from `member(request)` only; approver checked server-side; amounts in integer cents; uploads type-checked and size-limited; CSV export protected against formula injection.

## Sources
- https://github.com/odoo/odoo · https://raw.githubusercontent.com/odoo/odoo/19.0/LICENSE · https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_expense/__manifest__.py · https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_expense/models/hr_expense.py
- https://github.com/frappe/hrms · https://github.com/frappe/hrms/releases.atom · https://raw.githubusercontent.com/frappe/hrms/develop/license.txt · https://github.com/frappe/hrms/issues?q=is%3Aissue+expense+claim
- https://github.com/actualbudget/actual · https://raw.githubusercontent.com/actualbudget/actual/master/LICENSE.txt
- https://github.com/firefly-iii/firefly-iii · https://github.com/firefly-iii/firefly-iii/releases.atom · https://raw.githubusercontent.com/firefly-iii/firefly-iii/main/LICENSE
- https://github.com/spiral-project/ihatemoney · https://github.com/spiral-project/ihatemoney/releases.atom · https://raw.githubusercontent.com/spiral-project/ihatemoney/master/LICENSE
- https://github.com/Tanq16/ExpenseOwl · https://raw.githubusercontent.com/Tanq16/ExpenseOwl/main/LICENSE
- npm registry pages: https://registry.npmjs.org/dinero.js · /decimal.js · /big.js · /papaparse · /csv-parse · /sharp · /exifr · /heic2any · /file-type · /pdf-lib · /tesseract.js
- https://help.expensify.com/articles/expensify-classic/spending-insights/Default-Export-Templates (search result)
- https://www.legifiscal.fr/actualites-fiscales/4477-ir-revalorisation-2026-bareme-indemnites-kilometriques.html · https://www.economie.gouv.fr/particuliers/impots-et-fiscalite/gerer-mon-impot-sur-le-revenu/impot-sur-le-revenu-tout-savoir-sur-le-bareme-des-frais-kilometriques · https://www.legalstart.fr/fiches-pratiques/fiscalite-entreprises/bareme-kilometrique/ · https://mon-calcul-impot.fr/articles/bareme-kilometrique-2026 · https://www.gerantdesarl.com/actualite/Bareme-kilometrique-2026-motos-scooters-cyclomoteurs · https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/indemnites-kilometriques.html · https://www.spendesk.com/fr/blog/notes-de-frais-kilometriques-bareme/ (all via search results)
- https://www.n2f.com/blog/notes-de-frais-dematerialisees/ · https://www.francenum.gouv.fr/guides-et-conseils/pilotage-de-lentreprise/dematerialisation-des-documents/dematerialisation-des (search results)
- https://www.keobiz.fr/le-mag/tva-sur-les-repas/ · https://ardoise.bzh/blog/tva-recuperable-note-de-frais/ · https://qonto.com/fr/blog/gestion-entreprise/comptabilite/tva-hotel (search results)
- https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises · https://conforme2026.fr/guides/notes-de-frais-facturation-electronique · https://www.n2f.com/blog/reforme-facturation-electronique-notes-de-frais/ (search results)
- https://cabinet-osmose.fr/format-et-structure-du-fec-guide-technique-complet/ (search result)

Note: urssaf.fr, impots.gouv.fr, legifrance.gouv.fr and most French sites are blocked by this environment's egress policy; every legal figure above comes from search-result summaries and must be re-checked on the official site before the tool ships.
