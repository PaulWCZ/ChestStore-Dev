# Critique round 2 — Clients (tools/private/crm) vs HubSpot CRM, Pipedrive

Run 2026-09-29, port 7300, `npm run build` then `dev.mjs --prod --reset` (seed) and `--prod --reset --empty`. Studio flow `flows/crm.mjs`: **32/32 passed** on my instance. Then my own Playwright pass (`shoot.mjs`, `kbd.mjs`, `crm-dirty.mjs` in this folder): Hugo (sales, EN), Inès (sales, FR), Camille (manager, FR), Léa (viewer, FR), Nora (no role); 1280 px and 390 px (touch); light and dark; looks **own**, **Chest** and **sample brand**; axe-core WCAG A/AA on every shot (0 violations, 54 shots), sideways-overflow probe (0), 0 console/server errors. Screenshots: `shots/crm-*.png`.

Strength in one line: *My day* → Done → "What's next?" is still the best screen in the store, and the round-1 list of majors was actually worked through, not papered over.

## Verdict

**Can a 50-person French company cancel HubSpot / Pipedrive tomorrow? Not yet** — but it is now a *yes* for a 3–10 person team that does not rely on email sync. For a team that lives in Gmail/Outlook with HubSpot's or Pipedrive's email logging, the history becomes a lie within a week: emails are still not captured on a real Chest.

| | Round 1 | Round 2 |
|---|---|---|
| Completeness | 5 | **7** |
| UX | 7.5 | **8** |

## Round-1 findings

Blockers
- B1 No custom fields — **fixed** (flow step "the manager adds a field, fills it, filters by it, exports it"; seen on deal page: "Competitor", "Delivery wanted by"; 4 kinds only).
- B2 Import silently drops columns/owners — **fixed** (flow: unknown columns to notes, unknown owners named before import, Undo this import).
- B3 Emails not logged by themselves — **not fixed** (platform: needs inbound `mail`; README says so honestly).

Majors
- M1 One next step, no time — **fixed** (two open steps, one at 14:30, seen on deal page and flow).
- M2 No manager report — **fixed** (Team page; no conversion funnel, no report builder).
- M3 Pickers do not scale — **fixed** (type-ahead combobox with "+ New company" inline; flow).
- M4 300-row lists, no sort — **fixed** (100/page, sort name/last contact/newest).
- M5 No bulk actions — **fixed** (tick, tag, assign, delete; flow "select contacts, tag them at once"). Deals: assign only.
- M6 No merge — **fixed** (flow "merge a duplicate company").
- M7 No files — **fixed** (Chest files, 25 MB).
- M8 Thin company record — **fixed** (address, SIREN/SIRET, VAT, sent in `crm.deal.won`).
- M9 Phone search ignores formatting — **fixed** (0478421690 and +33 found; flow).
- M10 No history import — **fixed** (activities/notes CSV).

Bugs 1–5 (viewer told to act, two "Call" buttons, stage path clipped on phone, Won too loud, red Delete on company phone) — **all fixed** (viewer home = team pipeline, empty viewer text "Rien pour l'instant — votre équipe commerciale ajoute…"; buttons read "Log a call"; stage is a select on phone; Won/Lost outlined; Delete in "…").

Migration out ("export everything" ZIP) — **fixed**.

## Still blocking (what a HubSpot/Pipedrive customer misses weekly)

1. **Email capture** (BCC / Gmail / Outlook sync) and sending from the contact page. On a real Chest there is no mail at all. This is the #1 reason sales teams pay Pipedrive.
2. **Calendar**: a next step "Call Tue 14:30" never reaches the salesperson's Google/Outlook calendar (no iCal feed from Clients). Pipedrive syncs activities both ways.
3. **Mobile use between meetings**: no call logging after a `tel:` tap ("Log this call?" on return was proposed in round 1, not done), no business-card scan, no offline.
4. **One pipeline, EUR only, no products** — fine for most SMEs, but a company with two businesses (sales + partnerships) cannot split.
5. Reports are fixed views: no stage-conversion funnel, no "activities per salesperson per week" (the number a Pipedrive manager checks every Monday).

## New problems (round 2)

1. **Brand look breaks tab words on phones.** With the sample brand, the five labelled tabs wrap mid-word: "Companie / s" (EN) and "Entrepris / es" (FR), "Ma / journée" on two lines (`crm-company1-brand_sample-light-phone.png`, `crm-board-brand_sample-dark-phone.png`). The kit's tab bar does not account for wider brand fonts. Steps: `/_dev` → Look → sample brand, all tools → `/chest/companies` at 390 px. **Kit bug, affects every 5-tab tool.**
2. **Chest look, board at 1280 px: collisions.** "11 200 €30 derniers jours" glued in the Lost column header, and the avatar of "Offices for the new cooperative shop" pokes out of the card's right edge (`crm-board-catalogue_chest-light-desk.png`, zooms `z1.png`, `z2.png`). The own look does not show it: the Chest theme's wider sans exposes fixed widths.
3. **Chest look: next-step dots are black / grey / red** ("Prévue" black, "Aujourd'hui" grey): black vs grey 8 px dots are indistinguishable and colour-only. The legend helps sighted users only.
4. **Deal page on phone: the owner picker renders as a 3-line box** (name, then a lone "×" on its own line) next to a label "RESPONSABLE" (`crm-deal1-own-light-phone.png`). Looks broken; one tap on × unassigns the deal.
5. **Filter chrome before content on phone.** Companies list at 390 px: search, owner, tags, "Filter by a field", sort, "select this page", export = ~300 px before the first company (`crm-companies-own-light-phone.png`). On an **empty** contacts list the same 8 controls + "Export CSV / Export vCards" show above "No contact yet" (`crm-e-contacts-own-light-phone.png`).
6. **Empty board: two "New deal" buttons** plus an owner filter listing every member (`crm-e-board-own-light-desk.png`).
7. **Dirty dialog + Escape does nothing, silently.** New deal → type a title → Esc: the dialog stays, no "Discard your changes?" (`crm-dirty.mjs`). Safe, but the user thinks the key is broken. Ask, or at least shake/say "Unsaved — Cancel to discard".
8. **Files box says "or drop them here" on phones** (kit FilePicker; deal and company pages at 390 px).
9. **Monospace in running text** is still there ("2 contacts · 2 affaires en cours · 67 100 €" in the companies list, "decision maker" tag). Round-1 UX note, not addressed.
10. **Language of data**: seeded own-field names ("Competitor", "Delivery wanted by", "Lead source"), industries ("Food retail") and steps are English in a French UI. It is seed content, but a French buyer's demo shows a half-English screen. Store §2.11.
11. Minor: the 0-value "Proposal" bar on *My open deals* still draws a sliver (`crm-day-hugo-own-light-desk.png`).

Store coherence (_store.md §2): nav rule followed (5 labelled tabs + More), main action top-right, glossary words right, `/` search, member chip right, no `window.confirm`, date field in the member's language (dd/mm/yyyy under en-GB, jj/mm/aaaa FR). Departures: items 1, 5, 8 above.

## Platform-dependent

- **Email capture and send** — SDK `mail` proposal with inbound mailboxes + telling members' own addresses from clients' (SDK report). Until then the pitch must say "emails are not captured".
- **Calendar** — the Chest calendar proposal (`calendar`, per-member feed): Clients should publish next steps with a time into it (tool work S once the proposal is accepted).
- **Links with Forms / Helpdesk** — `events` between tools: nobody consumes `forms.answered` yet; "a website form answer creates a contact" is the suite's selling point and is not built on either side.

## Top 3 fixes now

1. **Kit: phone tab bar that never breaks a word** (shrink font / ellipsis / 4 tabs + More when the look's font is wide), and fix fixed-width collisions in the board header and card footer under Chest and brand looks; add these looks to the phone screen shots. **S** (kit) — benefits every tool.
2. **Publish timed next steps to the Chest calendar** (`calendar` proposal already used by Booking) + "Log this call?" prompt when returning from a `tel:` tap. **M**
3. **Phone list chrome**: collapse filters/sort/export behind one "Filters (2)" button, hide filters/exports on empty lists, one "New deal" on the empty board; fix the owner picker layout on the deal page. **S**
