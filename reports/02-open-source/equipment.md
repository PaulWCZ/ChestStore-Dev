# Equipment — open-source research
_Read on 2026-09-28. Replaces: Snipe-IT cloud, Asset Panda, spreadsheets ("inventaire matériel.xlsx")._

## The job
Somebody (office manager, IT person, founder) must always know **who has what**: which laptop,
phone, badge, key or software licence belongs to the company, who holds it now, and when its
warranty ends. Daily use is tiny: look an item up (often by scanning its QR label), hand it to
someone ("check out"), take it back ("check in"), and see an employee's list the day they leave.

## Projects

### Snipe-IT
| Field | Content |
|---|---|
| Project | Snipe-IT — https://github.com/grokability/snipe-it — ~14,983 stars (GitHub search API, 2026-09-28); v8.7.2, 2026-08-19 (releases feed); very active, 925 open issues |
| Licence | AGPL-3.0 (LICENSE: https://github.com/grokability/snipe-it/blob/master/LICENSE) |
| Reuse | **Ideas only** |
| Stack | PHP / Laravel, MySQL/MariaDB. Data model (assets, models, categories, status labels, checkouts log) transposes easily to Node + Postgres |
| What it does best | The reference data model: asset → model → category/manufacturer; status labels (deployable, pending, archived); check-out to a person or a location, check-in; full history per asset; licences with seats; accessories/consumables with quantities; EOL and warranty dates; **acceptance**: on checkout the user receives the category EULA and accepts or declines, optionally signing on screen (https://snipe-it.readme.io/docs/requiring-acceptance, via search result); CSV importer with a sample file |
| What to avoid | Reviews: setup complexity, "code-heavy", dated UX compared with modern SaaS (https://www.capterra.com/p/150016/Snipe-IT/reviews/, https://www.goworkwize.com/blog/snipe-it-review, via search results). Too many object types (assets, licences, accessories, consumables, components, kits, predefined kits) for a 30-person company |

### Shelf.nu
| Field | Content |
|---|---|
| Project | Shelf — https://github.com/Shelf-nu/shelf.nu — ~3,021 stars (GitHub search API); shelf@2.2.1, 2026-09-23 (releases feed); very active |
| Licence | AGPL-3.0 for the core; `apps/companion/` under its own licence (LICENSE: https://github.com/Shelf-nu/shelf.nu/blob/main/LICENSE) |
| Reuse | **Ideas only** |
| Stack | TypeScript, React Router 7 / React 19, Prisma, PostgreSQL (Supabase), Tailwind, Radix, pg-boss job queue (README). Closest stack to ours |
| What it does best | Modern UX for non-IT people: **QR asset tags** printed from the app, scanned with any phone camera to view / check out / report; "custody" (who holds it); **bookings** of shared equipment with dates and no double-booking; **kits** (laptop + charger + dock as one unit); hierarchical locations; custom fields; reminders for warranty/maintenance; bulk actions from the scanner; CSV import/export (README) |
| What to avoid | Release notes of 2.1.4 and 2.2.1 each fix two cross-organisation authorisation flaws, including missing authorisation on check-in (https://github.com/Shelf-nu/shelf.nu/releases) — every action must check ownership and role server-side. Multi-workspace and Stripe billing are noise for us |

### GLPI
| Field | Content |
|---|---|
| Project | GLPI — https://github.com/glpi-project/glpi — ~6,397 stars (GitHub search API); 11.0.9 and 12.0.0-rc2, 2026-09-16 (releases feed); French (Teclib'), very active |
| Licence | GPL-3.0 (LICENSE: https://github.com/glpi-project/glpi/blob/11.0/bugfixes/LICENSE; "or later" not verified) |
| Reuse | **Ideas only** |
| Stack | PHP, MySQL/MariaDB |
| What it does best | Complete ITAM + ITSM: computers, monitors, phones, software licences, contracts, suppliers, financial info (purchase date, warranty, amortisation), automatic inventory via agent; widely known in French companies |
| What to avoid | Complexity is the #1 complaint for ordinary users since 2010 ("interface simplifiée trop complexe pour utilisateurs lambda", https://forum.glpi-project.org/viewtopic.php?id=22237; "trop lourde/pas ergonomique", https://forum.glpi-project.org/viewtopic.php?id=27054). Everything we must not become |

### Ralph
| Field | Content |
|---|---|
| Project | Ralph (Allegro) — https://github.com/allegro/ralph — ~2,520 stars (GitHub search API); release 20260902.1, 2026-09-02 (releases feed); active |
| Licence | Apache-2.0 (LICENSE: https://github.com/allegro/ralph/blob/ng/LICENSE) |
| Reuse | **Code** (with attribution and NOTICE) |
| Stack | Python / Django |
| What it does best | "Back office" assets alongside data-centre assets: assets assigned to users with a **transition** model (release, return, loan) that generates a handover document; licences; supports; domains |
| What to avoid | Built for data centres (DCIM/CMDB); the back-office part is a small subset. Code not useful for a Node app; ideas (handover document) are |

### InvenTree
| Field | Content |
|---|---|
| Project | InvenTree — https://github.com/inventree/InvenTree — ~7,650 stars (GitHub search API); 1.5.6, 2026-09-26 (releases feed); very active |
| Licence | MIT (LICENSE: https://github.com/inventree/InvenTree/blob/master/LICENSE) |
| Reuse | **Code** (with attribution) |
| Stack | Python / Django, React front end |
| What it does best | Stock of parts with quantities, locations tree, barcode/QR label templates and scanning, stock history |
| What to avoid | Manufacturing inventory (BOMs, purchase orders, builds) — not "who holds the laptop". Only the label/scan ideas matter |

### Grocy (ideas only for UX)
| Field | Content |
|---|---|
| Project | Grocy — https://github.com/grocy/grocy — ~9,541 stars (GitHub search API); latest release not verified |
| Licence | MIT (LICENSE.md: https://github.com/grocy/grocy/blob/master/LICENSE.md) |
| Reuse | **Code** allowed, but nothing relevant to copy |
| Stack | PHP, SQLite |
| What it does best | Household "ERP": barcode-first flows (scan → action), "due soon" lists — the same pattern as "warranty ends soon" |
| What to avoid | Domain (food) |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Item list with search: name, kind (laptop, phone, key, badge, licence, other), holder, status | MVP | Snipe-IT, Shelf | One list; filters by kind and holder |
| Item page: serial number, purchase date, price, supplier, warranty end, notes, photo | MVP | Snipe-IT | Photo via Chest file API |
| Give to someone (check out) / take back (check in), with date and note | MVP | Snipe-IT, Shelf custody | Holder = member id from the platform; also "in storage" / a location |
| History of each item (who held it, when) | MVP | Snipe-IT, Shelf audit trail | Append-only table |
| "My equipment": what I hold | MVP | Shelf self-service | Every employee sees their own list |
| Person view: everything a member holds (onboarding/offboarding checklist) | MVP | Snipe-IT user page | The day someone leaves |
| Status: available, in use, in repair, lost, retired | MVP | Snipe-IT status labels | Fixed list, not configurable in MVP |
| QR label: print a sheet of labels, scanning opens the item page | MVP | Shelf, InvenTree | QR encodes the item URL on the Chest; generation server-side with `qrcode` |
| Warranty / renewal "ends soon" list on the home screen | MVP | Snipe-IT EOL, Grocy "due soon" | Computed on read, no cron |
| Warranty reminder notification | later | Shelf reminders | **Needs SDK scheduled jobs** + notifications to the inbox |
| Software licences with seats (Figma: 10 seats, 7 used) | MVP | Snipe-IT licences | Simple count of assignments; renewal date |
| Acceptance: employee confirms receipt in the app | later | Snipe-IT acceptance/EULA | Click "I received it" logged with timestamp; no drawn signature in MVP |
| Handover document (PDF "remise de matériel") | later | Ralph transitions | Needs PDF generation; printable HTML first |
| Scan with phone camera inside the app | later | Shelf scanner | `qr-scanner` (MIT); the phone's native camera already opens the URL, so MVP needs nothing |
| Bookable shared equipment (projector, camera) | later | Shelf bookings | Overlaps with Rooms; reuse the same range constraint |
| Kits (laptop + charger) | later | Shelf kits | |
| Custom fields | later | Snipe-IT, Shelf | |
| Consumables with quantities (toner, cables) | later | Snipe-IT, InvenTree | |
| Depreciation / fixed-asset register | never | GLPI, Snipe-IT | Accountant's job (see legal) |
| Network auto-discovery / MDM agent | never | GLPI | Needs agents and outbound network |
| Import from Snipe-IT CSV | MVP | Snipe-IT sample CSV | Header of the official sample: `Company, Name, Asset Tag, Category, Supplier, Manufacturer, Location, Order Number, Model, Model Notes, Model Number, Asset Notes, Purchase Date, Purchase Cost, Checkout Type, Checked Out To: Username, Checked Out To: First Name, Checked Out To: Last Name, Checked Out To: Email, Checkout Location, Asset EOL Date` (https://github.com/grokability/snipe-it/blob/master/sample_csvs/assets-sample.csv, read first-hand; note UTF-8 BOM and US dates `1/23/23`). Holder matched by email → member id |
| Import from Shelf CSV / generic spreadsheet | MVP | Shelf CSV guide | Columns `title, description, category, kit, tags, location, custodian, bookable, imageUrl, valuation, qrId`, custom fields `cf:Name,type:Type` (https://www.shelf.nu/knowledge-base/importing-assets-to-shelf-csv-guide, via search result). Offer a column-mapping step so any spreadsheet works |
| Export CSV | MVP | all | |

## Reusable pieces
- `qrcode` (node-qrcode) 1.5.4 — MIT — https://github.com/soldair/node-qrcode (~8,179 stars; last tag v1.5.4 2024-08-05) — server-side SVG/PNG QR generation.
- `uqr` 0.1.3 — MIT — https://github.com/unjs/uqr — tiny zero-dependency QR → SVG (based on Project Nayuki's MIT generator).
- Project Nayuki QR-Code-generator — MIT — https://github.com/nayuki/QR-Code-generator — small enough to vendor one TypeScript file with attribution.
- `qrcode-generator` — MIT — https://github.com/kazuhikoarase/qrcode-generator.
- `qr-scanner` 1.4.2 — MIT — https://github.com/nimiq/qr-scanner — in-browser camera scanning (later).
- `bwip-js` — MIT — https://github.com/metafloor/bwip-js — if 1D barcodes on labels are ever needed.
- `papaparse` 5.7.0 — MIT — https://github.com/papaparse/papaparse — CSV import (handles BOM, quoted fields).
- `date-fns` 4.4.0 — MIT — date parsing for US `M/D/YY` in Snipe-IT exports.
- Label sheet: print CSS (A4, `@page`, grid of 3×8 labels) — no library needed.

## Legal and security notes
- **GDPR.** Assignments are personal data (who holds which device). Legitimate interest / contract performance; keep history after an employee leaves only as long as needed (e.g. until the item is returned and reassigned, then a retention period); employees can see their own list (right of access). Store member ids, never names.
- **Accounting.** The tool is an operational inventory, not the fixed-asset register. French tax tolerance: office equipment and furniture with a unit price ≤ 500 € HT may be expensed immediately (BOI-BIC-CHG-20-30-10, https://bofip.impots.gouv.fr/bofip/2109-PGP.html/identifiant=BOI-BIC-CHG-20-30-10-20170301, via search result). Above that the accountant depreciates it — we store purchase date and price so the list can be handed over, nothing more. No e-invoicing impact.
- **Security.** Shelf fixed cross-organisation authorisation bugs twice in 2026 (releases 2.1.4, 2.2.1): every check-in/out must verify role server-side; the QR URL must not grant anything — scanning opens the item page, which still requires Chest sign-in. Photos and receipts go through the Chest file API.
- **Licence keys.** Store licence keys only if needed and show them masked; they are secrets.

## Sources
- https://github.com/grokability/snipe-it, https://raw.githubusercontent.com/grokability/snipe-it/master/LICENSE, https://github.com/grokability/snipe-it/releases.atom, https://raw.githubusercontent.com/grokability/snipe-it/master/sample_csvs/assets-sample.csv
- https://snipe-it.readme.io/docs/importing-assets, https://snipe-it.readme.io/docs/requiring-acceptance (via search result)
- https://www.capterra.com/p/150016/Snipe-IT/reviews/, https://www.goworkwize.com/blog/snipe-it-review (via search result)
- https://github.com/Shelf-nu/shelf.nu (README), https://raw.githubusercontent.com/Shelf-nu/shelf.nu/main/LICENSE, https://github.com/Shelf-nu/shelf.nu/releases, https://github.com/Shelf-nu/shelf.nu/releases.atom
- https://www.shelf.nu/knowledge-base/importing-assets-to-shelf-csv-guide (via search result)
- https://github.com/glpi-project/glpi, https://raw.githubusercontent.com/glpi-project/glpi/11.0/bugfixes/LICENSE, https://github.com/glpi-project/glpi/releases.atom
- https://forum.glpi-project.org/viewtopic.php?id=22237, https://forum.glpi-project.org/viewtopic.php?id=27054 (via search result)
- https://github.com/allegro/ralph, https://raw.githubusercontent.com/allegro/ralph/ng/LICENSE, https://github.com/allegro/ralph/releases.atom
- https://github.com/inventree/InvenTree, https://raw.githubusercontent.com/inventree/InvenTree/master/LICENSE, https://github.com/inventree/InvenTree/releases.atom
- https://github.com/grocy/grocy, https://raw.githubusercontent.com/grocy/grocy/master/LICENSE.md
- https://github.com/soldair/node-qrcode, https://github.com/soldair/node-qrcode/tags.atom, https://github.com/unjs/uqr, https://github.com/nayuki/QR-Code-generator, https://github.com/kazuhikoarase/qrcode-generator, https://github.com/nimiq/qr-scanner, https://github.com/metafloor/bwip-js, https://github.com/papaparse/papaparse (LICENSE files read), https://registry.npmjs.org/ (versions/licences of qrcode, uqr, qr-scanner, papaparse, date-fns)
- https://bofip.impots.gouv.fr/bofip/2109-PGP.html/identifiant=BOI-BIC-CHG-20-30-10-20170301 (via search result)
