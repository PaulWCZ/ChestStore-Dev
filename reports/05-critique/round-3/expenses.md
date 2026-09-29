# Expenses (Notes de frais) — severe critique, round 3

Tested 2026-09-29, port 11300: `--prod --reset` and `--prod --reset --empty`. Hugo (employee, EN desktop; FR phone in brand:port), Inès (approver, FR phone dark), Camille (accountant: approve, pay, export). I also ran a new scenario: the accountant and an approver each claiming and sending their own €250 meal with no receipt. Scripts and shots: `critique3/hr/ex*.mjs`, `hr/shots/ex*`.

## Verdict

**Can a 50-person French company cancel N2F / Expensify tomorrow? Not yet, but it is one S-sized fix away for companies reimbursing by transfer and paying cards with a monthly statement.** Round 2's first fix, the card-statement import with matching, shipped. So did the SEPA remittance in the company's language and the non-EEA address. The blocker I found is a control one: **the accountant approves her own expenses and then pays herself**. N2F and Expensify customers rely on "no self-approval", and an auditor asks about it.

Still missing weekly against N2F, Expensify or Spendesk: PDF and HEIC receipts read automatically, live card feeds, advances, **search**, and email reminders.

**Completeness 5 → 7.5 → 8 /10 · UX 7 → 8 → 8 /10.**

Strength: a company-card line with no expense becomes the holder's draft, "Company card: receipt needed · Add the receipt". That is the right workflow, done without a bank connection.

## Round-2 top fixes and blockers

- Card statement CSV import with matching: **fixed.** Hugo's drafts show "MONOPRIX PARIS 11 · Company card: receipt needed · Add the receipt" and "UBER *TRIP". *To pay back* flags "Un paiement par carte de l'entreprise lui correspond : payé avec la carte, donc rien à rembourser ?" on Tom's parking. The builders' flow covers the import. I did not import a statement myself.
- SEPA remittance in the company's language, address for non-EEA IBANs: **fixed.** *To pay back* reads "Leur relevé bancaire affichera « Notes de frais E12 » (Français) · Changer la langue", and Tom's GB account shows "son adresse postale est d'abord nécessaire" before he can be in the file.
- Sticky Save bar, "Guests not named" on the form: **fixed.** The builders' flow asserts both. The FR phone form in brand:port has no overflow.
- N3, receipt icon when there is none: **fixed** (a crossed-receipt icon on Heathrow Express).
- N4, "£GB": **fixed** ("38,50 £").
- N5, IBANs in clear by default: **not fixed** (platform sealing).
- Blocker, PDF, HEIC and poor photos not read: **not fixed** (platform OCR/AI).
- Blocker, advances: **not fixed.**
- Blocker, email to approvers and draft owners: **not fixed.** The `mail` proposal exists in `sdk/`, and Expenses does not declare it.

## Still blocking (what an N2F / Expensify customer misses weekly)

1. **Self-approval by the accountant** (N1 below). It is a control failure, not a missing feature.
2. **Search.** There is no search box anywhere: "Sofia's Uber in March", "every Big Mamma receipt" or "the €187.60 on the card statement". The accountant scrolls month lists. N2F and Expensify search by amount, merchant and person. This was round 2's store-wide item #5, and it is still open here.
3. **PDF receipts** (SNCF, hotels, Uber are PDFs) are typed by hand. HEIC too.
4. **No email.** An approver who never opens the Chest never approves, and the 25th reminder reaches only the bell.
5. **Advances, per diems by country, splitting an expense** (hotel with a personal minibar), and re-invoicing to a client.

## New problems

- **N1 — Control: the accountant approves and pays her own expenses.** Steps: seed → Camille (accountant) adds a €250 Meals expense, no receipt, no guests → *Send* → "sent to the accountants" → *To approve* shows "You · Your own expense: nobody else approves yours" → *Approve* → toast "1 expense approved" → *To pay back* lists "Camille Martin · 250,00 € · Marquer remboursé". Three warnings (no receipt, guests not named, above the €60 limit) and no second pair of eyes. The code does this on purpose (`lib/access.ts`: "An accountant nobody approves approves their own"). In the seed, and in any company that never names an approver for its accountant, the person who pays is also the one who approves. Fix:
  - the first-run checklist must name an approver for each accountant (the owner or an admin);
  - until then, the accountant's own expenses wait for another accountant or an approver;
  - if the company truly has one person, show "self-approved" in the export and in *To pay back*, and never offer a bulk approve for own lines.

  An approver (Inès) sending her own goes to the accountants, which is correct.
- **N2 — Dates written two ways:** list rows show "8 sept" (no period), while the pay-back history and Leave show "20 sept.". It is inconsistent inside one page (*To pay back*: "29 sept" vs "Sofia Rossi · 20 sept."). Use one formatter.
- **N3 — Orphan separators.** On the approver phone: "17 sept / · Train, avion, taxi · Soit 44,86 €" starts a line with "·". On *To pay back*: a bare "· Camille Martin" line under "Saisir ses coordonnées bancaires". These are small, but they are on the two screens people use most.
- **N4 — A former member's expense waits 4 weeks at the top of *To approve*** ("Paul Lefèvre (former member) · Sent 4 weeks ago"). Approving pays someone who left, with no bank-detail check. Show "left on …: pay by the final pay slip?" and keep it out of the SEPA file by default.
- **N5 — Card lines land in "Other" with raw bank labels** ("UBER *TRIP", "MONOPRIX PARIS 11"). A category guess from the label (UBER → Train, avion, taxi; SNCF; TOTAL → Carburant) would save the holder two taps per line, and it is how N2F does it.
- Looks: own (receipt paper), brand:port FR phone, and Inès dark phone are all readable. No overflow at 390 px. The empty tool is good for both the accountant ("Avant que l'équipe commence") and the employee.

## Platform-dependent

- OCR / AI primitive for PDF, HEIC and poor photos.
- `secrets.seal/open` for IBANs (today optional through `BANK_DETAILS_KEY`, off by default).
- A PSD2 bank/card feed for live card lines and payment confirmation.
- `mail`: **already in `sdk/`**, so emailing approvers and draft owners is tool work.

## Top 3 fixes now

1. **No silent self-approval:** name an approver for accountants in the first-run checklist (required), route their own expenses to another accountant or approver, and mark any remaining self-approval in the export and pay-back list. **S.**
2. **Search** (kit search box, "/"): merchant, amount (e.g. "187,60"), person, note, reference E123, on *My expenses*, *To approve*, *To pay back* and a new "All expenses" for accountants. **S.**
3. **Card lines finish themselves:** guess the category from the bank label (a small keyword table, editable by the accountant), and use the `mail` proposal to email the holder "Receipt needed for UBER €23.40" and the approver "5 expenses wait". **M.**
