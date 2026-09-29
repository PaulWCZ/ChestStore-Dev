# Expenses (Notes de frais) — severe critique

Tested 2026-09-29 on `--prod --reset`, port 7200: Hugo (employee, phone 390 px, EN), Inès (approver, FR desktop), Camille (accountant; settings, pay, export), Tom (employee with no vehicle, empty data), dark FR. Tables were truncated by hand for the empty state. Screenshots are in `critique/hr/shots/ex-*`.

## Verdict

**Can a 50-person company cancel N2F / Expensify tomorrow? Not yet. Spendesk: no.** The flow is quick: snap, amount, category, send, approve, mark paid. The mileage scale (barème) is correct: I checked a 5 CV car at 36 km, €22.90 = 36 × 0.636. What N2F and Expensify customers pay for is missing: receipt OCR (reading the receipt photo), the SEPA transfer file, guests on meals, per-diem flat rates, and card feeds. Refused items are also sent back again unchanged and bulk-approved. Spendesk's core (company cards, spend requests, budgets) is out of scope entirely, so "replaces the expense part of Spendesk" must stay the exact claim.
**Completeness 5/10 · UX 7/10.**

## Blockers

1. **A refused expense is sent again as-is, then approved in bulk.** Steps: Hugo's taxi is refused "Il manque le reçu du taxi". It sits in *To send* **already ticked** (`my-expenses-desktop.png`). Hugo adds another expense and taps *Send 4 expenses*, and the taxi goes back with no receipt. Inès taps *Tout valider (6)*, and the taxi is approved and lands in *To pay back* (`ex-ines-after-all-fr.png`, `ex-cam-pay.png`). The refusal meant nothing and the approver never saw the warning in the bulk action. Fix: (a) a refused draft is unticked until it is edited; (b) *Approve all* skips items with a warning, or asks "3 have a warning: approve them too?"; (c) the approver list shows "sent again after refusal" on the line. Effort S.
2. **No receipt OCR.** Typing amount, date and merchant by hand is exactly what N2F and Expensify SmartScan removed, and it is why their users pay. "Nobody will miss features" is false on the first receipt. Fix: an on-server OCR suggestion (tesseract.js, Apache-2.0, as in the research) for amount, date, VAT and merchant, always confirmed by the user; or the AI gateway proposal in the SDK report. Effort L.
3. **Paying back is manual per person, with no SEPA file.** The accountant must retype every IBAN and amount in the bank; N2F and Spendesk generate a pain.001 file. With 30 people a month that is 30 transfers typed by hand, which is enough to keep the old tool. Fix: store each person's IBAN in Settings → My bank details (encrypted, shown masked); *Pay all* generates one pain.001 XML for the batch and marks the lines paid on download (with Undo). Effort M.

## Major

4. **Phone layout breaks after adding a receipt.** Steps: phone 390 px → *Take a photo* → pick a file. The receipt card shows a raw unstyled "Choose File / No file chosen" input, and *Remove* is pushed off-screen; the page becomes 495 px wide and scrolls sideways (measured `scrollWidth` 495; `ex-add-filled-phone.png`, `ex-receipt-overflow-viewport.png`). This is the main flow, on the main device. Fix: hide the replace `<input type=file>` behind the "Replace" label, and let the card's action row wrap. Effort S.
5. **No guests or attendees on meals.** French tax and URSSAF practice for business meals needs the names and companies of the guests. N2F has a "Invités" field. Today it has to go in the free "note", which is optional and hidden under "VAT and note". Fix: an "With whom" field on Meals (people from the Chest, plus free text for outsiders), required above a threshold the accountant sets. Effort S.
6. **No per-diem flat rates (forfaits) and no hotel nights.** Missing: grand déplacement flat rates, URSSAF meal allowances, and the "nights × rate" check on hotels. Field staff use these weekly. Fix: a "Flat rate" kind with a company table (amount per day, per country later). Effort M.
7. **No proof of vehicle for mileage.** URSSAF expects the car to be in the employee's name, with its fiscal horsepower (CV) proven (the vehicle registration, carte grise). The tool trusts a dropdown. Fix: an optional registration upload on *My vehicle*, visible to the accountant, and a "not checked" badge until it is. Effort S.
8. **Multi-currency without conversion.** A €-company trip to London produces GBP totals kept apart, and the accountant converts by hand. Fix: a rate field (typed, or read from the card statement) that gives the EUR equivalent. Effort S.
9. **Export is CSV plus ZIP only.** No journal layout in the French standard accounting-export format (FEC) and no per-employee third-party account (421-XXX). The accountant re-keys the entries. Fix: an "Écritures comptables" CSV in FEC columns (the research already lists them), using the employee's account code. Effort M.
10. **No card feed, no card receipt matching, no advances (avances sur frais).** The first two are Spendesk and Expensify core features; advances are weekly for field staff. Stated in "not yet"; the buyer must be told. Effort L.
11. **No import of past expenses.** Moving mid-year loses the year's mileage total, which then puts later trips in the wrong band of the scale. Fix at least: a "Kilometres already driven this year" figure on *My vehicle*, and an Expensify/N2F CSV import with a column-mapping preview. Effort S / M.
12. **The accountant gets no first-run guidance.** In an empty tool Camille sees the employee empty state (`ex-empty-cam-_chest.png`). The account codes, VAT rules and approvers, which the README itself says must be checked, are buried at the bottom of Settings under "My vehicle". Fix: an accountant banner "Before your team starts: check categories and account codes · name approvers · check the 2026 scale". Effort S.

## Minor

13. Settings mixes *My vehicle* (personal) with company settings on one page (`ex-cam-settings.png`). Split them into "My vehicle" and "Company".
14. Refuse is an icon-only "×" on the approval list (`approve-fr-desktop.png`). Label it "Refuser" (wide enough on desktop).
15. The approval list shows no receipt thumbnail (a generic icon), so the approver opens each expense. Show the thumbnail and open it in a lightbox.
16. The "Tolls and parking" category planned in the research is missing: an Indigo parking ticket is filed under "Train, plane, taxi" at 0 % recoverable VAT, although VAT on parking and tolls is generally recoverable (check with the accountant).
17. Export is by *approval* month only; accountants often want it by expense date or by payment date. Add a toggle.
18. Car-trip distance is typed by hand, with no "favourite trips" (Office → Client X); N2F has saved trips. Add "recent trips" chips.

## Bugs

- B1 (Blocker 1) Refused, then re-sent unchanged, then bulk-approved.
- B2 (Major 4) Horizontal overflow on phone after adding a receipt: `scrollWidth` 495 on a 390 viewport.
- B3 Several VAT-rate buttons have no accessible name in the DOM dump (four `BUTTON` with empty text inside "VAT and note") — check that they announce "20 %" and so on.

## Migration in / out

- **In:** none (no Expensify or N2F import; the year's mileage total is lost).
- **Out:** a monthly CSV (FR/EN, formula-safe) plus a ZIP of receipts with good file names. This is good for archiving; there is no FEC layout and no SEPA file.

## UX notes

Strong: a phone-first add with the camera and a big amount field; the empty state "Rien à déclarer pour l'instant" is charming and clear; the mileage amount shows live, with the band explained ("scale 2025, after 530 km this year"); receipt integrity (SHA-256, never replaced); natural French.
Weak: on the phone form, *Save* is a sticky bar that covers the Date field while scrolling; "VAT and note" is hidden, although meals legally need guests; the settings page is one 3,300 px scroll (`ex-cam-settings.png`).

## Fix plan (ordered)

1. Refused drafts unticked; bulk approve skips warnings — S
2. Phone receipt-card overflow — S
3. Guests on meals; tolls and parking category — S
4. Accountant setup banner; split Settings — S
5. SEPA pain.001 plus IBAN per person — M
6. Kilometres already driven this year; expense import with mapping — S/M
7. Flat rates and hotel nights; FX rate — M
8. FEC-layout journal export — M
9. OCR suggestion (on-server or AI gateway) — L
10. Card feeds and advances (SDK/bank; state as out of scope meanwhile) — L
