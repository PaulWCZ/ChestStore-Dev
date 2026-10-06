# Equipment (Matériel) — severe critique

Tested 2026-09-29 on `--prod --reset`, port 7200 (built by me, `.next` removed after): Camille (manager), Hugo (member, FR, phone), Tom (member, dark, empty), Sofia (manager, FR, phone); add → give flow; member.removed of a holder; empty data (tables truncated by hand). The Snipe-IT import was **not** exercised (only its page was seen). Screenshots are in `critique/hr/shots/eq-*`.

## Verdict

**Can a 50-person company cancel Snipe-IT tomorrow? Yes, if it used Snipe-IT only as "who has what", which most SMEs do. An IT team with asset audits, consumables, custom fields and signed acceptance of equipment: not yet.** It is the most complete tool of this batch for its scope. The overview answers "what needs me" at a glance, giving an item takes 3 clicks, departures are handled well, and it prints QR labels. Missing: the employee's signed acceptance (the handover record, attestation de remise, that French IT charters require), custom fields (IMEI, RAM, OS, MDM ID), consumables and stock quantities, audits, and requests from employees.
**Completeness 6/10 · UX 8/10.**

## Blockers

1. **No acknowledgement of receipt or printable handover record.** French companies have the employee sign a "fiche de remise de matériel" or accept the IT charter when they get a laptop or phone, and they rely on it when equipment is not returned (withholding from final pay is not allowed, so proof matters). Snipe-IT sends an acceptance with the EULA. The README lists it as "not yet". Fix: on *Give*, the item appears in the person's *My equipment* as "To confirm"; *I received it* records who, when and in what condition in the append-only history; a printable handover sheet (PDF from the browser) with both names, the items, serials and conditions; an optional charter text set by the manager. Effort M.

## Major

2. **No custom fields.** An IMEI for phones, RAM, CPU and OS for laptops, a licence plate and next inspection (contrôle technique) date for vehicles, an MDM or Intune ID. IT asks for these weekly, and Snipe-IT's custom fieldsets are its core. Fix: fields defined per category (text, number, date), shown on the item, searchable, and included in import and export. Effort M.
3. **No consumables or quantities.** Toner, cables, mice and badges in bulk cannot be tracked. Everything is one serial-level item. Fix: an "Item with a quantity" kind (stock count, given ×N, a minimum stock warning on the overview). Effort M.
4. **No audit or inventory mode.** Snipe-IT's "audit" (scan each label, mark it seen today, list the missing ones) is how companies do their yearly inventory. The QR labels exist, but scanning only opens the page. Fix: an *Inventory* mode where each scanned or typed tag gets "seen on <date> by <who>"; a list of "not seen since the start"; the last audit date on the item. Effort M.
5. **Employees cannot request equipment.** "I need a charger" or "my screen is dead, I need a new one" is only a *Report a problem* on something they already hold. Snipe-IT has requestable assets. Fix: *Ask for something* on My equipment (free text or from the catalogue in stock), in the managers' bell, answered with *Give*. Effort S.
6. **Adding many items is one at a time.** Onboarding 10 identical laptops means 10 forms, and the form has no "give it now" or photo. Fix: "How many? 10" on the add form, with one serial field per row; *Add and give to…*; a photo on the add form. Effort S.
7. **Warranty and renewal alerts go only to managers**, and there is no maintenance log (repair cost, supplier ticket). A repair is a status with no cost or dates. Fix: a "Repair" entry in the history with its cost and the return date expected. Effort S.
8. **No depreciation or purchase-order (invoice) link.** Accountants ask for asset value; this is out of scope by design, but at least attach the purchase invoice (a file) to an item. Effort S.

## Minor

9. French: "Depuis le 1 février 2023" should be "1er février" (`eq-hugo-mine-fr-phone.png`); "Poste depuis le …" for a licence seat reads oddly ("Licence attribuée le …"); the tab "Le mien" is not natural ("Mon matériel").
10. The add form uses grey placeholders that look like real values ("MacBook Pro 14″ M3", "1 299.00", "C02XK1ZZJGH5"), and a hurried manager may think they are filled in (`eq-cam-_chest_items_new.png`). Use "e.g. …" or lighter placeholders.
11. The list is a single long page of 41 rows (`eq-cam-_chest_items.png`), with no pagination or grouping; at 500 items it becomes heavy. Group by category, or paginate at 100.
12. Seeded departure "last day Sun 11 Oct" (weekend). A last day on a Sunday should at least be flagged (People side).

## Bugs

- B1 **Initials of a former member are wrong**: "Hugo Bernard (former member)" shows **"HM"** (`eq-after-hugo-_chest_people_mbr_hugo….png`). `lib/initials.ts` takes the last word of the suffixed name. The same code exists in Leave. Fix: compute initials from the name before the "(former member)" suffix is added.

## Migration in / out

- **In:** Snipe-IT CSV and any spreadsheet with a preview, day-first or US dates, and prices as people write them (claimed and tested in the repo; **I did not run a Snipe-IT file**). No custom fields to receive Snipe-IT's custom columns (they would be dropped, see Major 2).
- **Out:** CSV in the reader's language that imports back. No photos in the export (a ZIP would help).

## Trust

Good: the append-only history (the database refuses edits), Undo on take-back, delete and "take everything back", and departures that never auto-return equipment ("the laptop is still in their bag"). Members see no prices, suppliers or notes. Missing: the signed receipt (Blocker 1), which is exactly the proof an office manager needs when a laptop is not returned.

## UX notes

Strong: the overview "Needs your attention" (to take back, problems, ending soon, in repair) is exactly the manager's week. Giving is 3 clicks with a searchable person list and a condition note. The member's *My equipment* is clean, with one action per item. Empty states are great ("Tous les ordinateurs, téléphones et clés, au même endroit"; "You hold nothing yet"). Dark mode and phone navigation are fine. Pages load in 0.6–0.9 s.
Weak: the long list (Minor 11), and adding items one by one.

## Fix plan (ordered)

1. Acknowledgement of receipt plus a printable handover sheet — M
2. Fix initials of former members (shared with Leave) — S
3. Request equipment; multi-add and "add and give" — S
4. Custom fields per category (in import and export) — M
5. Inventory / audit mode with scanning — M
6. Consumables with quantity and minimum stock — M
7. Repair log with cost; invoice attachment — S
8. French wording fixes; placeholders; list grouping — S


## October 2026: after the move to the new stack

_Added 6 October 2026 from Equipment's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **126.2 → 69.4 MiB**;
  image 459 → 30 MiB; first members' page 942 →
  434 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: inventory and person pages bounded (the first 200 of each list, a link to the rest); Give dialogs read the stock when they open; an import previewed with its limits said (5 MB, 5,000 rows); give and take back refused "moved" when someone moved the item meanwhile; CSV in ";" for French; Intune's matched member kept through the import (`6fb9d60`). A scale test at 20,000 items and a 5 MB import peaks at 159–177 MiB (`c713478`, `eb7c777`); flow 35/35 and axe 0 on 38 screens (`20a8b15`).
- **Pending**: Nothing listed as pending in its commits.
