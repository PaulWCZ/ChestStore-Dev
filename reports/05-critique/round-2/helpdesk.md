# Critique round 2 — Support (tools/public-and-private/helpdesk) vs Zendesk, Freshdesk

Run 2026-09-29, port 7300, `npm run build`, `dev.mjs --prod --reset` and `--prod --reset --empty` (the harness's fake Chest **has** the `mail` proposal; a real Chest does not). Studio flow `flows/helpdesk.mjs`: **30/30 passed**. My pass: a stranger on a 390 px phone (EN, FR; own, Chest, brand; light/dark), Inès (agent, FR), Hugo (agent, EN), Tom (viewer), Camille (admin, FR), Nora (no role); axe 0 violations; overflow probe found **one page broken** (below). Scripts `hd-visit*.mjs`; screenshots `shots/hd-*.png`.

Strength in one line: the agent side is now a real small-team helpdesk — rules on arrival, working hours, bulk, merge, reports, shortcuts, full export — and the visitor form is calm and clear on a phone.

## Verdict

**Can a 50-person French company cancel Zendesk / Freshdesk tomorrow? Not yet.** Everything round 1 asked of the *tool* is largely done, but on a real Chest there is still **no email in or out**: customers cannot write to support@, agents' replies reach them only if they return to a secret link. The README says so. The day `mail` ships, a 2–8 agent team with email + form support can switch; teams using a help centre, live chat, several brands/mailboxes or SLA escalations cannot.

| | Round 1 | Round 2 |
|---|---|---|
| Completeness | 4.5 (6 with mail) | **6** (**8** with mail) |
| UX | 8 | **8** |

## Round-1 findings

Blockers
- B1 No email on a real Chest — **not fixed** (platform). Tool side is complete in the harness: threading by tag/References, bounces, auto-replies, spam scores (flow).
- B2 No chat / no embedding — chat **not fixed** (README now says "not a live-chat tool", good); embedding **partly**: the tool emits `frame-ancestors` for admin-listed sites and gives a plain `<iframe>`, but a real Chest's front adds `frame-ancestors 'none'` (Booking and Forms READMEs say so), so it cannot work until the platform changes.

Majors
- M1 Automations — **fixed** (30 arrival rules: words/sender/domain → tag, priority, assignee; flow). No later-event rules.
- M2 Business hours — **fixed** (week grid, French holidays in one click, threshold). No SLA escalation.
- M3 Bulk — **fixed** (assign/priority/tag/close/spam + Undo; flow).
- M4 Merge — **fixed** (same customer only; Undo splits; flow).
- M5 Reports — **fixed**, but broken on phones (new problem 1).
- M6 Help centre — **partly** (a link to an external page; the Wiki has no public mode).
- M7 Export without messages — **fixed** (ZIP: tickets.csv, messages.csv, tickets.json, Chest-clock dates).
- M8 Zendesk/Freshdesk import — **not fixed** (README: formats not verifiable from the studio).
- M9 Several mailboxes/brands — **not fixed** (needs install-time mailboxes in the SDK).
- M10 Form sentence in one language — **fixed** (FR sentence on the French form, `hd-visit-err.png`).

Minors: "Personne" pill → **fixed** in the list ("Non attribuée", grey) but the assign field's placeholder on the ticket still reads **"Personne"** (`hd-ticket1001-own-dark-phone.png`); salmon customer bubble **fixed**; phone navigation **partly** (header now says "Support"; folder chips still scroll off-screen, "Ouvertes" cut to "O…" with no cue); default sort urgent-first **fixed**; composer formatting **partly** (links, kept line breaks, image thumbnails; no bold/lists); agent shortcuts **fixed**; satisfaction **fixed**; follow-up in the ticket's language **fixed**; "too fast" **fixed** (1.5–3 s waits silently; the first render's time is kept).

## Still blocking (weekly, for a Zendesk/Freshdesk customer)

1. **Email in and out** on a real Chest (the channel of most tickets).
2. **Help centre / FAQ** that deflects tickets (Zendesk Guide, Freshdesk Solutions).
3. **History import** — old tickets stay in Zendesk, so a read-only seat is kept.
4. **SLA escalation** ("waiting 2 days → tell the lead") and rules on later events.
5. **Several addresses/brands** (support@ + sav@, or two shops).
6. Website widget (form in a frame or a chat bubble) — blocked by the platform frame policy.

## New problems (round 2)

1. **Reports page scrolls sideways on a phone: 921 px wide at 390 px.** The four period tabs ("Les 4/8/12/26 dernières semaines") do not wrap, and the whole page (cards, tables) is laid out at 921 px while the header stays 390 (`hd-reports-own-light-phone.png`, also on the empty tool). Steps: Camille → `/chest/reports` at 390 px. The studio's "phone width" flow step does not visit Reports. **S**
2. **Phone inbox: ~450 px of controls before the first ticket** — folder chips, "New request", search, three rows of filter chips (priority, tag, sort) each scrolling sideways and cut at the edge, "Select all" (`hd-inbox-ines-own-light-phone.png`). The first ticket starts at y≈560 on an 844 px screen. On a phone an agent wants the list; filters belong behind one "Filter" button.
3. **Visitor form: the email error is at the bottom, not at the field.** "marc.lenoir@gmail" → "Vérifiez l'adresse e-mail." appears above *Envoyer*, the email field is not marked (`z4.png`). On a phone the field is off-screen when the message appears. Put it under the field with `aria-invalid`.
4. **Visitor's avatar on the follow-up page is a lone "·"** (no initials for the customer's own message; `hd-visit-follow.png`).
5. **The same request sent three times makes three tickets** (1008–1010, identical subject and text within a minute). Merge exists, but a double-tap or a back/resend should be recognised (same email + same text within 10 min → one ticket).
6. **Seeded tags and subjects are English in the French UI** ("Damaged", "Delivery" as filter chips and in Reports) — store §2.11.
7. On an empty real Chest the inbox says "Vos clients écrivent … ou à support@atelier-martin.test": true only once mail ships. The harness has mail, so I could not see the no-mail wording; check that the empty state drops the address when `mail` is absent.
8. Kit FilePicker shows "ou déposez-les ici" (drop here) on phones, and the accepted list "WEBP, TXT, DOCX, XLSX" is jargon for a stranger ("Photos, PDF, Word or Excel").

Store coherence (§2): nav (inbox/settings, reports for admins), glossary, undo, member chip now top-right — followed. Departures: items 1, 2, 8.

## Platform-dependent

- **`mail` send + receive** (studio proposal, studio.12) — the whole verdict hangs on it.
- **Framing by the company's website** — needs an `embeddable` manifest permission so the front stops adding `frame-ancestors 'none'` on the public host (SDK report item already written by Booking/Forms).
- **Mailboxes named at install time** (several addresses/brands).
- **Public Wiki mode** for a help centre (suite item).
- **Custom domain** (`support.<company>.fr`) for the public form (round-1 store item 4).

## Top 3 fixes now

1. **Reports on phones**: tabs → a select ("8 dernières semaines ▾"), stat cards 2 columns, tables in the kit's scrolling wrapper; add Reports to the phone flow. **S**
2. **Phone inbox**: one "Filtrer (n)" button opening a sheet with priority/tag/sort; folder as a select-style title; the first ticket above the fold. **S**
3. **Zendesk/Freshdesk history import** from a real export file (ask a customer for one; import as closed, read-only tickets per customer email) — the step that lets the old subscription end. **M**
