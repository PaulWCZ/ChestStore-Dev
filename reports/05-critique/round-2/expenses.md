# Expenses (Notes de frais) — severe critique, round 2

Tested 2026-09-29 on `--prod --reset` and `--prod --reset --empty`, port 7200.
- **People:** Hugo (employee, phone, French and English), Inès (approver), Camille (accountant), Tom (empty tool).
- **Flows:**
  - refuse, then try to re-send;
  - add a receipt photo on a 390 px phone, with the photo read automatically (a synthetic receipt made in the browser);
  - a meal with guests;
  - the SEPA file generated and read;
  - the FEC-layout journal and the CSV fetched.
- **Looks:** own, Chest, sample brand, High contrast dark, Confetti; light and dark.
- **Keyboard** on the approval list.

Scripts and screenshots are in `critique2/hr/` (`ex*.mjs`, `shots/ex-*`).

## Verdict

**Can a 50-person French company cancel N2F / Expensify tomorrow? Not yet for companies with company cards; yes for a team that mostly pays with its own money and is reimbursed by transfer.**

Round 1's three blockers are gone:
- a refused expense can no longer come back unchanged;
- the phone reads the receipt photo;
- the accountant gets one SEPA transfer file.

A lot else arrived too: guests on meals, URSSAF flat rates, hotel nights, exchange rates, an FEC-layout journal, an import of past expenses, the vehicle registration certificate, and the accountant's first run. What N2F, Expensify and Spendesk customers still pay for is **card feeds and matching card lines to receipts**, plus reading PDF, HEIC or crumpled receipts. Both are platform-bound.

**Completeness 5 → 7.5 /10 · UX 7 → 8 /10.**

Strength (one line): snap → the amount, date, VAT and shop are filled in about a second on the phone, with no network, and the approver's "Approve the 3 without warnings" is exactly the right bulk action.

## Round-1 findings

| # | Round 1 | Now |
|---|---|---|
| B1 | A refused expense re-sent unchanged and bulk-approved | **Fixed.** Inès refuses "Le Petit Zinc" with a reason. Hugo's draft shows "Refused: Missing the guests' names · Change it before sending it again · *Fix it*", is not ticked, and *Send 2 expenses* leaves it out. The bulk action is "Approve the 1 without warnings · 1 has a warning: look at it first". |
| B2 | No OCR | **Fixed for clean photos.** A phone PNG gave amount 42,50, date 24/09/2026, VAT 3,86 and "LE BISTROT DU COIN", with "Lu sur la photo : montant, TVA, date, lieu. Vérifiez.". Not for PDF or HEIC (stated). |
| B3 | No SEPA file | **Fixed.** `pain.001.001.03`, 2 transfers, €274.80 in the CtrlSum, a stable MsgId, *Undo*, and people without bank details named. IBANs are checked and masked. Not uploaded to a real bank (stated). |
| M4 | Phone overflow after adding a receipt | **Fixed.** No horizontal scroll at 390 px after a receipt. |
| M5 | No guests on meals | **Fixed.** "Who was there", with colleagues, outsiders with their company, or "Just me". An unnamed meal gets a "Guests not named" warning. |
| M6 | No per diems or hotel nights | **Fixed.** URSSAF 2026 rates (21.40 / 76.60 / 56.80), "3 nights × €56.80". |
| M7 | No vehicle proof | **Fixed.** Registration certificate upload, checked by the accountant. |
| M8 | No FX conversion | **Fixed.** "38,50 £GB · Soit 44,86 €". |
| M9 | CSV and ZIP only | **Fixed.** Balanced entries in FEC columns, 421 per person (`421BERNARD`), 467 for the company card, deductible VAT 445660. |
| M10 | Card feed, card matching, advances | **Not fixed** (platform, stated). |
| M11 | No import, mileage lost | **Fixed.** Kilometres before the tool, usual trips, a CSV import with a mapping step (the import page was not run). |
| M12 | No accountant first run | **Fixed.** "Avant que l'équipe commence" with four links and *C'est fait*. |
| Minors | Settings split, labelled Refuse, receipt thumbnail, tolls category, month by payment | **Fixed:** "Me / Company", labelled Refuse, a thumbnail, "Tolls and parking", "Month of the expense / the payment". The phone's sticky Save bar still sits over the field under it in long forms (seen over "Où"). |

## Still blocking (what an N2F / Expensify customer misses weekly)

1. **Company cards:** no card feed, no "this card line has no receipt yet", no automatic matching. Companies with Qonto or Swan cards live on this. Platform: a bank-connection primitive (PSD2) or at least a card-statement CSV import with matching. The CSV part is tool-side and doable now.
2. **Receipts the phone cannot read:** PDF invoices (train tickets and hotels are mostly PDF), iPhone HEIC photos, crumpled tickets. These are typed by hand. Platform: the AI gateway or `ocr.read`.
3. **Advances (avances sur frais)**, deducted from later claims.
4. **No email reminder to approvers or to people with drafts.** The 25th reminder only reaches the bell (and needs the schedules proposal).
5. **Per diems abroad** (URSSAF / Cour des comptes rates by country) are one flat amount each.

## New problems found this round

- **N1 — The bank statement text is English in a French company.** The SEPA remittance reads `<Ustrd>Expenses E6</Ustrd>`, whatever the company's language. The employee sees "Expenses E6" on their French bank statement. Use the company's language ("Notes de frais E6", which fits in 140 characters), or a setting.
- **N2 — To check: transfers to non-EEA SEPA countries.** Tom's account is British (`GB…`, BIC NWBKGB2…). Since the EPC 2023 rulebook, payments involving non-EEA SEPA countries (UK, Switzerland) require the payee's postal address. The file carries only `<Cdtr><Nm>`. **Not verified** by me: have the bank or an EPC expert confirm, and either ask for an address for non-EEA IBANs or pay them by hand.
- **N3 — Approver list with no receipt shows a document icon** for seeded expenses ("Receipt of Big Mamma"). That is fine, but the Heathrow Express line has "No receipt" and still shows a receipt-style icon in the brand look. The icon should say "none" when there is none.
- **N4 — The currency shows as "£GB"** in French ("38,50 £GB"). Intl's `GBP` symbol reads "£GB" under the fr locale, which is odd but correct. "38,50 £" would be friendlier.
- **N5 — Bank-detail encryption is optional and off by default**: "Kept in this tool's own database. Ask your Chest's administrator to set BANK_DETAILS_KEY". Honest, but IBANs of every employee in clear text is a weak default for a store tool. It should be sealed by the platform.
- **Looks:** own, Chest, brand (light, dark, phone), High contrast dark and Confetti are all readable. No overflow, and no contrast failures from my check.
- **Keyboard:** each Approve / Refuse button has a precise name ("Approve: Big Mamma, €124.00").

## Platform-dependent

- Sealed values (`secrets.seal/open`), so IBANs are never in clear text without an admin step.
- An AI or OCR primitive for PDF, HEIC and poor photos.
- A bank / card feed (PSD2) for cards, and to know a transfer was executed.
- `mail` / push, to reach approvers and people with drafts.
- The Chest's time zone and currency used by the tool (it still assumes Europe/Paris).

## Top 3 fixes now

1. **Card statement CSV import with matching.** The accountant uploads the month's Qonto or bank card export. Each card line becomes a "company card" expense waiting for its receipt, in the owner's *To send* ("Receipt needed"). This removes most of the card gap without a bank connection. **M.**
2. **SEPA remittance in the company's language, and an address for non-EEA IBANs** (or leave them out of the file, with the reason). **S.**
3. **Sticky Save bar**: pad the form so the focused field scrolls above the bar (`scroll-padding-bottom`). Show a "Guests not named" hint on the form itself before saving, not only to the approver. **S.**
