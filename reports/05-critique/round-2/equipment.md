# Equipment (Matériel) — severe critique, round 2

Tested 2026-09-29 on `--prod --reset` and `--prod --reset --empty`, port 7200.

Roles and flows tried:
- Camille (manager): overview, list, inventory, settings and fields, a person's page, handover and return sheets, the add form on a phone in French.
- Hugo (member): French, phone, confirmed a receipt with the rules; also opened manager routes.
- A member.removed of Tom, who holds 5 items.

Looks: own, Chest, sample brand, High contrast dark and Confetti, in light and dark.

The Snipe-IT import was **not** run again. Scripts and screenshots are in `critique2/hr/` (`eq*.mjs`, `shots/eq-*`).

## Verdict

**Can a 50-person company cancel Snipe-IT tomorrow? Yes, for what an SME uses it for.** Every round-1 blocker and major has an answer:
- the employee confirms receipt, with the company's rules;
- a French *fiche de remise* and a return sheet, both printable;
- fields per category (IMEI, RAM, OS, plate, inspection date);
- supplies counted in bulk, with a minimum;
- inventory by scanning;
- requests from employees;
- adding several items at once, or adding and giving in one step;
- repairs with their cost, and the purchase invoice on the item.

**Not yet** for an IT team that lives on MDM sync (Intune or Jamf), depreciation, check-in and check-out email to users, or Snipe-IT's API integrations.

**Completeness 6 → 8.5 /10 · UX 8 → 8.5 /10.**

Strength (one line): the manager's overview ("Needs your attention": requests, people leaving with what they hold, low stock, warranties, repairs, unconfirmed receipts) is a week of IT admin on one screen.

## Round-1 findings

| # | Round 1 | Now |
|---|---|---|
| B1 | No acknowledgement or handover sheet | **Fixed.** Hugo's "À confirmer" leads to a dialog: who gave it and when, the condition noted, the company rules, an optional remark, and "Je l'ai reçu et j'accepte les règles" (toast: "Merci. C'est confirmé."). The handover sheet shows the tag, serial, IMEI or RAM/OS, given on and by, condition, "Confirmed in Equipment on …", the rules, a statement and two signature boxes. It prints black on white in every look. |
| M2 | No custom fields | **Fixed** (text, number and date per category; on the item, the sheet and the export). |
| M3 | No consumables | **Fixed.** "Supplies · 57 in stock · 1 running low", *Hand out* ×N. |
| M4 | No audit | **Fixed.** "Inventory under way · 6 of 36 seen", a box for a scanner, "Seen" on the label page. |
| M5 | Employees cannot request | **Fixed.** *Demander du matériel*, then *Give…* / *Approve* / *Refuse* on the overview. The member sees "ACCEPTÉE · Réponse : …". |
| M6 | One-at-a-time add | **Fixed.** "Combien ?", one tag each, *Ajouter et remettre à quelqu'un*. |
| M7 | No repair log | **Fixed.** Expected back date and cost; "expected back 4 Oct" on the overview. |
| M8 | No invoice | **Fixed** (a file on the item, for managers only). Depreciation is still out of scope, by design. |
| B1 (bug) | Former member initials "HM" | **Fixed** ("TW" for "Tom Walker (ancien membre)"). |
| Minors | "1er février", "Licence attribuée le", "Mon matériel", placeholders, 41-row list | **Fixed:** French typography is right here, "Mon matériel", and the list has 100 per page with filters. |

## Still blocking (for the IT-team buyer, not the SME)

1. **No email to the holder** when something is given, at check-in or at warranty end. Snipe-IT emails the acceptance. Here it waits in the bell until the person opens the Chest; receipts pile up under "Receipt not confirmed". Platform: `mail`/push.
2. **No MDM or directory sync.** Intune, Jamf and Google device lists are typed or imported by CSV, and never refreshed.
3. **The receipt is not a signature.** The sheet is signed on paper; the in-tool confirmation has no eIDAS value (this is stated honestly). A French company that wants a signed PDF on file still prints, signs and scans it.
4. **No depreciation or fixed-asset view** for the accountant (out of scope by design; the invoice is attached).

## New problems found this round

- **N1 — A raw placeholder is read to screen readers on the printed sheets.** The handover and return sheets have a visually hidden `<dt>` holding the unformatted string **"Printed on {date}" / "Imprimé le {date}"** (`components/sheet.tsx:37` renders `t.printed`, not the formatted value). A screen-reader user hears "Printed on brace date brace, Printed on 29 September 2026". Fix: the `<dt>` should be "Printed" / "Imprimé", or drop it.
- **N2 — Inconsistent refusals for members.** `/chest/items/new` returns **200** with "Your role does not allow this.". `/chest/import`, `/chest/settings` and `/chest/inventory` return **404**, and `/chest/export` returns **403**. This is the exact pattern round 1 flagged in Timesheets (fixed there). Pick one: 404 for pages a member cannot see, with the store's "This page is for managers" copy.
- **N3 — Legal sheets carry the app's suffix.** The return sheet reads "Salarié : Tom Walker (ancien membre)". A document kept as proof should show the name, with "left on 29 Sept 2026" as a separate line.
- **N4 — Seeded field names are English in the French UI** ("RAM (GB)", "Operating system" on the add form and on the sheets). The same applies to the example rules text. This breaks the store rule §2.11: defaults should be keys, rendered in the reader's language until renamed.
- **N5 — Icon-only control on the phone.** On "Mon matériel", the handover-sheet button next to *Demander du matériel* is a bare printer icon. This breaks store rule §2 / top-15 #15 (words on every icon-only control).
- **N6 — The phone repeats the same sentence** "Vous avez confirmé l'avoir reçu le 3 janvier 2025" under every item imported before the tool (all dated 3 Jan 2025, the import). This is noise on the main member screen. Show it only for the last 30 days, or as a small mark.
- **Looks:** the orange hazard-stripe header and tags hold up in Chest, brand, High contrast dark and Confetti. Printed sheets stay paper-coloured. No overflow at 390 px, and no contrast failures in my check.

## Platform-dependent

- `mail` / push: acceptance requests and warranty notices to holders outside the Chest.
- Events between tools: Equipment → People "everything taken back" ticks the leaving checklist's step (People already emits `people.leaving`, received here).
- `members` job title and department, for the handover sheet (the README notes it).
- A qualified e-signature connector (Yousign), if a signed PDF is wanted.

## Top 3 fixes now

1. **Fix the sheets:** the "{date}" placeholder for screen readers, the name without "(former member)" plus a "Left on" line, and seeded field names and rules as translated defaults. **S.**
2. **One refusal behaviour for members** (404 plus the store's managers-only copy) on every manager route, with a test per route. **S.**
3. **Member screen polish:** a labelled "Ma fiche" button instead of the bare printer icon, and "confirmed on …" shown only when recent. On the overview, add "Remind them" on unconfirmed receipts, a bell nudge now and an email later. **S.**
