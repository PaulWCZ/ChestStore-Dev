# Critique — Clients (tools/private/crm)

Claims to replace: HubSpot CRM (free/Starter), Pipedrive, folk, Axonaut/Sellsy CRM.
Used on 2026-09-28/29 in the harness (port 7300, `--prod --reset`), as Hugo (sales, EN), Inès (sales, FR), Léa (viewer, FR), Camille (manager, FR), Nora (no role); desktop 1280 and phone 390; seeded and emptied (tables truncated with psql: the harness has no `--empty` flag, `--reset` always loads the seed). Screenshots: `critique/sales/crm-*.png`.

## Verdict

**Can a 50-person company cancel HubSpot / Pipedrive tomorrow? Not yet.** For a 3–8 person sales team that lives in a spreadsheet today it is ready, and nicer than HubSpot. But a team that already pays for Pipedrive or HubSpot uses four things every week that are not here: email logged by itself, its own fields, several dated to-dos per deal, and a report for the manager. On top of that, a migration drops every column the tool does not know.
**Completeness 5/10**: the core loop (company → contact → deal → log → next step) is complete and well done. Custom fields, email, reports, attachments, merge, bulk actions and pagination are missing.
**UX 7.5/10**: *My day* is excellent, logging takes one tap, and Undo is everywhere. Points lost for: pickers that are plain `<select>` lists of the whole database, two different "Call" buttons on one page, a viewer who is told to do things they cannot do, and a stage path cut off on the phone.

## Blockers

1. **No custom fields.** Where: the data model (`migrations/0001_crm.sql`): companies have name/website/phone/address/industry/notes/tags, and contacts have one email and one phone. Every HubSpot or Pipedrive account has its own properties (lead source, SIRET, number of employees, contract end date, "segment"). Why it matters: a sales manager cannot run the business without *their* fields, and tags cannot hold values or dates. Fix: 4 field types (text, number, date, one choice) per object, set by managers in Settings, shown in the record's side panel, filterable, exported, and mapped at import. **L**
2. **Import silently drops everything it does not know.** Where: `/chest/import`. My HubSpot-shaped CSV had *Lifecycle Stage* and *Create Date*: both went to "Leave aside" with no warning in the result. The *Contact owner* "Paul Witczak" (not a member) was silently replaced by the importer (`owner = mbr_hugo…` in the DB). Proof: `crm-import-mapping.png`, `crm-import-result.png`. Why it matters: the buyer believes the migration succeeded and finds the gaps weeks later. Fix: (a) once custom fields exist, an unmapped column offers "Create a field"; until then, put unmapped columns into the record's notes as `Column: value`; (b) in the result, list "Owners not found: Paul Witczak (12 rows) → given to you", with a choice before importing; (c) keep *Create Date* as `created_at` / first history line. **M**
3. **Emails are not logged by themselves.** HubSpot free (Gmail/Outlook add-in, BCC logging), Pipedrive (email sync) and folk (Gmail extension) all record the email thread on the contact without anyone typing. Here, *Email* is a button that logs "an email happened". Why it matters: a salesperson sends 30 emails a day and will not log them twice, so the history becomes a lie within a week. This depends on the SDK *mail* proposal (inbound mailbox). Fix: a per-Chest BCC address (`crm+<id>@…`) that files the email on the contact whose address matches, plus "send from the contact page". Until the Chest ships mail, the README and the tile must say plainly "emails are not captured". **L (SDK) + M (tool)**

## Major

1. **One open next step per deal and per contact, date only, no time.** Where: `steps_one_open_deal` and `steps_one_open_contact` unique indexes, and `due_on date`. Pipedrive users schedule "call Tue 14:30" *and* "send samples Thu" on the same deal. There is also no to-do that is not attached to a deal or contact ("prepare the trade show"). Fix: allow several open steps (keep the "What's next?" flow), add an optional time, and add "a step for me" from *My day*. **M**
2. **No report for the manager.** *My day* shows only *my* pipeline and "won this month". Pipedrive and HubSpot managers look weekly at won/lost by person, by month, conversion by stage and forecast by expected close. Fix: a *Team* page for managers: won and lost per person per month (table plus bars), pipeline by expected-close month, lost reasons ranked. **M**
3. **Pickers do not scale.** Where: the *New deal* dialog (`app/chest/ui/deal-form.tsx`). *Company* and *Contact* are native `<select>`s of **every** company (capped at 1,000, `lib/companies.ts:165`) and every contact (capped at 2,000, `lib/contacts.ts:167`). The contact list is not filtered by the chosen company, and a new company cannot be created from the dialog. With 3,000 imported contacts, company #1,001 cannot be chosen at all. Proof: `crm-newdeal-empty-submit.png`. Fix: a type-ahead combobox (server search, the same search as `/`), contacts filtered by the chosen company, and "+ New company 'xyz'" as the last option. **M**
4. **Lists stop at 300 rows and cannot page.** Where: `listCompanies`/`listContacts` with `limit = 300`; the page only says "Showing 300 of N. Search to narrow the list." There is no sort either (by last contact, by name, by value). A company with 2,500 contacts cannot browse or clean them. Fix: pagination or infinite scroll, plus sort by name / last contact / created. **S–M**
5. **No bulk actions.** You cannot select 40 contacts and reassign, tag or delete them. This is weekly work after an import, or when a salesperson's territory changes. Fix: checkboxes on the lists with Assign to / Add tag / Delete (Undo). **M**
6. **No merge of duplicates.** The tool warns while you type but cannot merge. Duplicates always appear after an import plus manual entry. Fix: "Merge into…" on a contact or company page (keep one, move activities, deals and steps). **M**
7. **No files on a deal** (signed quote, specification PDF). The platform has `files`; it is not used. Fix: an attachment box on deal, company and contact pages using the Chest files capability. **M**
8. **Thin company record for the suite promise.** No SIREN, VAT number, postcode, city or country. The README admits `crm.deal.won` sends them as `null`, so the Quotes draft born from a won deal always asks for the address again. Fix: structured address and SIREN/VAT on companies (optional fields), sent in the event. **S**
9. **Phone search ignores formatting.** Search "0478421690" → nothing; "04 78 42" → found (stored "04 78 42 16 90"). The typical case is a caller ID pasted from a phone. Fix: add a digits-only generated column to the search (and `+33` ↔ `0` normalisation). **S**
10. **No import of history.** Pipedrive exports activities and notes as separate files, and HubSpot exports notes and engagements. Here only contacts, companies and deals come in, so years of call notes stay behind in the old tool, which the company must then keep paying for or lose. Fix: an "Activities / notes" import type (date, type, text, linked by email, company or deal name). **M**

## Minor

1. Contacts have one email and one phone: no mobile + landline, no personal address, no LinkedIn URL. Fix: allow a second phone and a URL field. **S**
2. Board cards carry coloured dots (red, amber, blue, empty) with no legend on screen (`board-desktop.png`). Only screen readers get "Next step late". Fix: a tiny legend under the filter, or icons + words on hover/focus. **S**
3. *My open deals* prints the same figure twice: "€79,600" big, then "€79,600 in 3 deals" (`my-day-desktop.png`). Fix: the second line should read "3 deals · weighted €35,150". **S**
4. The empty board shows six "Drop a deal here" boxes when there is nothing to drop (`crm-empty-chest_deals.png`). Fix: one empty state, "No deals yet — New deal". **S**
5. Grammar: "1 rows could not come:" (`en.ts:392` `skipped` is not pluralised). "…were added along the way" is odd English. Fix: plural forms; "1 row was not imported:". **S**
6. The import result says "1 already here" but does not say that the existing contact was **not updated** (the new job title "Buyer" was dropped). Fix: "1 already here — kept as it was" plus an option "update empty fields". **S**
7. Late dates read "Sun 27 Sept" instead of "2 days late". Fix: relative wording for late items. **S**
8. The time-zone-dependent greeting "Good morning" showed at 01:40. Harmless. Fix: "Hello" after 18:00 and before 05:00. **S**

## Bugs (with steps)

1. **Viewer is told to do what they cannot.** As Léa (viewer), *My day* says "Rien à faire aujourd'hui. Préparez vos prochains appels." and "Ouvrez une affaire et prévoyez la suite." On an empty tool she sees "Ajoutez les entreprises…" (`crm-empty-lea-chest.png`). Steps: `/_dev` → Léa → `/chest`. Fix: a viewer-specific home (team pipeline, recent wins) and a viewer empty state ("Nothing here yet — your sales team adds clients"). **S**
2. **Two "Call" buttons with two meanings on one contact page.** The blue "Call 06 12 34 56 78" at the top dials the number. The blue "Call" in the log box records a call that already happened (`contact-desktop.png`). A salesperson taps the wrong one and logs a call they never made, or dials instead of logging. Fix: rename the log buttons "Log: Call / Meeting / Email / Note" (FR « Noter : Appel… »), or after a `tel:` tap offer "Log this call?" on return. **S**
3. **The deal page on the phone cuts off the stage path.** At 390 px, "Negotiation" is clipped at the right edge and nothing shows it scrolls (`crm-deal-new-phone.png`). Fix: wrap into a vertical step list or a `<select>` "Stage: Lead ▾" on narrow screens. **S**
4. On the phone, the green *Won* button is the most prominent control on a brand-new 10 % *Lead* (`crm-deal-new-phone.png`). The main action at that stage is "Plan the next step". Fix: make Won/Lost secondary (outline) until the deal is in the last open stage. **S**
5. On the company page on the phone, **Delete** is a large red button right under the title, above the log box (`company-fr-phone.png`). Fix: move Delete into the "…" menu, as on deals. **S**

## Migration in / out

- **In:** CSV (contacts, companies, deals) with a mapping step and preview, and vCard. Good, but see Blocker 2 (silent loss of columns and owners) and Major 10 (no history). There is no **undo of a whole import**: a wrong mapping of 2,000 rows has to be deleted by hand, and there is no bulk delete. Fix: record an `import_id` on created rows and offer "Undo this import" for 24 h. **S–M**
- **Out:** CSV per list (localised headers, formula-safe), vCard, and JSON per person. The CSV has no activity history and no next steps. Fix: an "Export everything" ZIP (all objects + activities + steps, stable column names in English for machines). **S**

## UX notes

- *My day* → tick → "What's next?" is the best screen of the four tools. Keep it.
- Keyboard: the Tab order on *My day* is logical (skip link, nav, search, New deal, then each step checkbox followed by its deal link). Focus is visible. `/` focuses search. The board has keyboard moves.
- French is natural ("C'est noté. Et ensuite ?", "Supprimer définitivement"). The monospace for dates and amounts is used in running text ("avant-hier" in monospace on the company history), which looks like code. Use it for figures only.
- Speed: pages took 0.6–1.5 s to network-idle on this machine (`/chest` 1.47 s with seed). That is acceptable, but *My day* should not be the slowest page.
- Trust for the buyer: good on undo, author signatures, what happens when someone leaves (unassigned plus a bell item for managers), and GDPR (export a person, delete a person, 3-year warning). Missing: an audit of *who deleted a company* (the company and its notes disappear with no trace) and undo of an import.

## Fix plan (ordered)

1. Viewer home and empty state; rename the log buttons; phone stage path; Delete into the menu (Bugs 1–5). **S**
2. Import: unmapped columns into notes, report unknown owners, keep Create Date, "Undo this import". **M**
3. Type-ahead pickers with inline "New company"; pagination and sort on lists; phone-digit search. **M**
4. Custom fields (4 types) end to end: settings, forms, filters, import, export. **L**
5. Several next steps with an optional time; personal to-dos. **M**
6. Manager report page. **M**
7. Bulk select (assign, tag, delete) and merge duplicates. **M**
8. Attachments via Chest files; structured address + SIREN/VAT on companies, sent in `crm.deal.won`. **M**
9. Activities/notes import; "export everything" ZIP. **M**
10. Email capture (BCC) as soon as the SDK mail proposal ships. **L**
