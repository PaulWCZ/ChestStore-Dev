# Equipment (Matériel) — severe critique, round 3

Tested 2026-09-29, port 11300: `--prod --reset` and `--prod --reset --empty`. Camille (manager: overview, item page in the Chest look, return sheet FR), Sofia (manager, FR phone, brand:sample dark), Hugo (member: FR phone home, the equipment list, his handover sheet, every manager route by curl). Tom was removed via /_dev and his return sheet read. Scripts and shots: `critique3/hr/`, `hr/shots/eq*`.

## Verdict

**Can a 50-person company cancel Snipe-IT tomorrow? Yes, for what an SME uses it for.** Every round-2 fix landed. It is still the only one of the HR/IT five that declares the `mail` proposal (*Remind them* also emails). Not yet for an IT team on MDM sync (Intune, Jamf), depreciation, or Snipe-IT's API. Two things a careful buyer will still ask about: **every employee sees every serial number and who holds which key or badge**, and the item history is out of order.

**Completeness 6 → 8.5 → 8.5 /10 · UX 8 → 8.5 → 8.5 /10.**

Strength: the manager's overview is a week of IT admin on one screen. It now also leads with *Ajouter du matériel* on the phone.

## Round-2 top fixes and blockers

- Sheets: the "{date}" placeholder, the name without "(former member)", French seeded fields and rules: **fixed.** The return sheet reads "Salarié · Tom Walker · Date de sortie · 29 septembre 2026 · Imprimé le …". The fields read "Mémoire vive (Go)" and "Système d'exploitation", and the rules are in French.
- One refusal behaviour for members: **fixed.** `/chest/items/new`, `/import`, `/settings`, `/inventory`, `/export`, `/people` and `/labels` all return 403 with the kit's "This page is for managers".
- Member screen polish: **fixed.** A labelled "Ma fiche de remise" button, no repeated "confirmed on 3 Jan 2025" under each item, and *Le lui rappeler* on unconfirmed receipts.
- Blocker, email to the holder: **fixed within the studio** (`mail` proposal declared; the bell alone on a Chest without mail).
- Blocker, MDM or directory sync: **not fixed** (out of scope; it needs outbound network to the MDM API, declarable).
- Blocker, the receipt is not a signature: **not fixed** (stated honestly).
- Blocker, depreciation: **not fixed** (by design).

## Still blocking (for the IT-team buyer)

1. **No MDM or Google/Intune device sync.** Laptops are typed or imported once, and drift after that. A declared `network` host (Microsoft Graph, Jamf API) plus an admin-entered token would make a nightly refresh possible with `schedules`. This is doable, not platform-blocked.
2. **No per-item check-out/check-in acceptance email with a signed PDF** kept on file. Paper is still needed for proof.
3. **No depreciation or asset register** for the accountant.

## New problems

- **N1 — Members see the whole inventory with serial numbers and key/badge holders.** Steps: Hugo (member) → *Matériel* tab → 45 items with serials ("FVFHJ3KLQ6L4"), holders ("Inès Moreau, since 9 Oct 2023"), "Problems" flags, and every access badge and key with its holder. The README defends it ("who has the projector?"). But for keys, badges and vehicles, "who holds the safe or alarm key" is security information, and serials help social-engineer vendor support. Snipe-IT shows users only their own assets by default. Add a per-category switch "Members can see who holds these", off by default for *Keys and badges*, and hide serials from members.
- **N2 — Item history is not in time order.** EQ-0002: "confirmed receiving it · 3 Jan 2025", then "reported a problem · 27 Sept 2026", then "gave it to Inès Moreau · 9 Oct 2023", then "added it · 5 Oct 2023". Newest-first puts 2026 second. The receipt event is probably sorted apart. A history is proof: sort strictly by date.
- **N3 — A reported problem and a warranty ending do not meet.** EQ-0002 has "battery lasts one hour" open and its warranty ends in 24 days, but nothing links them. The manager has to notice. Add "Under warranty until 23 Oct: claim it" on the problem.
- **N4 — Phone overview is ~9 screens long** at 390 px (3,650 px): 9 warranty lines, stock tiles, and sections that don't fold. A manager on the train sees the first two sections. Fold "Warranties and renewals" to 3 lines + "See 6 more". The search placeholder is cut ("Étiquette, n° de série, modèle, per").
- **N5 — Redundant heading on "Mon matériel"**: "LICENCES ET ABONNEMENTS" appears as a section title and again as each card's category tag.
- Looks: brand:sample dark phone, the Chest look item page, and printed sheets (paper) are readable. No overflow at 390 px. Empty tool, manager and member: clear first actions.

## Platform-dependent

- A qualified e-signature connector (for a signed handover PDF).
- Sealed secrets, if licence keys are ever stored (out of scope now).
- MDM sync: tool-side with a declared `network` host, `schedules` and an admin secret (`env`). Not platform-blocked.

## Top 3 fixes now

1. **Visibility per category for members:** "who holds these" off by default for Keys and badges (and Vehicles). Serial numbers, IMEIs and badge numbers are hidden from members, except on their own items. **S.**
2. **Sort the item history strictly by date**, and on an open problem show "Under warranty until …" with a *Claim warranty → In repair* shortcut. **S.**
3. **Phone overview that fits a train ride:** fold long sections to 3 items with "See all", and shorten the search placeholder ("Chercher : étiquette, série…"). **S.**
