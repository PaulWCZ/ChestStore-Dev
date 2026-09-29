# Status — severe critique, round 3 (vs Atlassian Statuspage, Instatus)

Run 2026-09-29, port 11700. `npm run build`, `dev.mjs --prod --reset` and `--prod --reset --empty`. The studio flow `flows/status.mjs` passes **22/22**.

My own pass, scripts `sfch/s1, s2, se.mjs`, screenshots `sfch/shots/s-*.png`:
- **Visitor:** a French visitor on a 390 px touch phone, in own light/dark, brand:port dark and brand:sample light.
- **Camille** (editor, FR) on a phone: *En ce moment*, *Signaler un incident*, Services, Settings.
- **An empty company:** "Commencer avec un exemple", then the public page as an English visitor.

No console errors, no 5xx, no sideways scroll.

Strength, one line: round 2's two false public claims are fixed. The early measured uptime now reads "Contrôles automatiques depuis le 29 septembre : la disponibilité mesurée s'affiche après une journée complète", and the incident's language follows its writer.

## Verdict

**Can a 50-person French company cancel Statuspage / Instatus tomorrow? Not yet.** Unchanged, for the same three reasons:
- no `status.company.com`;
- subscribers reachable only by email, and only once the Chest runs `mail`;
- the page shares the Chest's fate.

The one tool-side unblocker named in round 2, Slack/Teams/webhook subscriptions, is now possible: the SDK working copy has `webhooks` with its fake. Status has not wired it.

| | R1 | R2 | R3 |
|---|---|---|---|
| Completeness | 5 | 7 | **7** (nothing new for customers since round 2) |
| UX | 8 | 8.5 | **8.5** (N1–N3 fixed; new false-history and language issues) |

## Round-2 top fixes and blockers

- **Top 1 — the incident's language (N1) and the early measured uptime (N2): fixed.**
  - "Écrit en: français" is preselected for Camille, and "Rédiger aussi en anglais" is offered (`s-new-phone.png`, flow step).
  - Measured uptime waits for a full day (public page text above).
- **Top 2 — `webhooks` in `sdk/`, then Slack/Teams/webhook subscriptions: half done.**
  - SDK: **built** (SDK report §4.17, `sdk/client/src/webhooks.ts`, `fakeChest({webhooks})`, `/_dev` panel, 6 tests).
  - Tool: **not wired**. The README still says "Not built in the tool", and `announce()` still has only the email seam.
- **Top 3 — phone primary first (N3) and public pages never wearing a team catalogue theme (N5): fixed.**
  - *Signaler un incident* is the black full-width button above *Prévoir une maintenance* (`s-now-camille-phone.png`).
  - `surface: "public"` works in the flow and in my brand/own runs.
- **N4, empty "Add your services first" said twice: fixed** ("Commencez par vos services" with a different body).
- **N6, no one-click state: explained.** Services says "publiez-en un pour le montrer perturbé ou en panne". Acceptable.
- **B1 custom domain, B3 independence: not fixed (platform).** Settings says it plainly ("Une adresse à vous … il ne le permet pas encore").
- **B2 subscribers: partly.** Email on the proposal only.

## Still blocking (what a Statuspage customer misses weekly)

1. **Its own address** (`status.company.com`): every support macro and SLA links there.
2. **Slack/Teams/webhook subscriptions**: B2B customers subscribe a channel, not an inbox. The SDK is now ready, the tool is not.
3. **Independence**: a status page that goes down with the Chest fails in the one incident it exists for.
4. **Audience or password-protected pages**: not built.
5. **Instatus / Better Stack import**: Statuspage only.

## New problems (round 3)

- **N1. A service added today claims 90 days of perfect history.**
  - Steps: `--empty` → *Commencer avec un exemple* → open `/`.
  - Each service reads "**last 90 days: 100.00% uptime. No day with an incident**", with a full 30/90-day bar of green ticks, one minute after it was created (`se-public.png`).
  - Statuspage starts a component's history at its creation (the README even says an incident entered afterwards "counts from its own start, even before the service was added", which is the opposite problem).
  - A company moving from Statuspage that forgets to import sees fake 100 % history published to customers.
  - Fix (S): ticks before a service's creation are drawn empty ("no data"), and the figure reads "since 29 September".
- **N2. Service names and descriptions have only one language.**
  - Incidents are bilingual; `components.name` / `description` are single text (`migrations/0001_status.sql`).
  - Result, on the empty company: the French editor's example makes "Site web", "Boutique en ligne", "Paiement", "Service client", and **an English visitor reads "Site web — Operational", "Paiement, last 90 days…"**.
  - On the seed, a French visitor reads "Delivery tracking — Performances dégradées", "Browsing and searching products".
  - Every public page of a bilingual company mixes two languages, which is exactly what the store forbids.
  - Fix (S–M): a second name and description per service, like incidents; the example services made in both languages.
- **N3. Status tells no other tool.**
  - Status publishes no event: no `status.incident.opened`.
  - During a payment outage, Support agents answer 40 "payment failed" tickets one by one, with no banner "Incident en cours : Paiement indisponible" and no saved reply that links the incident.
  - Statuspage + Zendesk do this via integration. This is the suite's argument and costs little: emit the event; Support shows a banner and a `{incident}` saved reply. **M across two tools.**
- **N4. The team side shows the incident's first language only.** Camille (FR) sees "Delivery dates shown late" on *En ce moment* although the incident has a French version (the French visitor reads "Dates de livraison affichées en retard"). The member's language should pick the version, as on the public page. **S.**
- **N5. Settings save with separate *Enregistrer* buttons** (company links, allowed sites), unlike Forms' autosave. Store coherence. **S.**
- **N6. The Statuspage import box says "ou déposez-les ici" on a phone** (kit FilePicker). Minor; the kit fix covers it.
- **N7. The "En ce moment" tab label wraps to two lines at 390 px** (FR); the other four tabs stay on one. Cosmetic.

Looks: the state colours stayed fixed and legible in own light/dark, brand:port dark and brand:sample light. The brand logo shows on the public page. No overflow.

## Platform-dependent

- **Custom domains** (SDK report §4.15): the first blocker.
- **`mail`** for subscribers.
- **`webhooks`**: **built in the SDK working copy (§4.17)**. What remains is tool work (top 1).
- **`checks`, `schedules`**: proposals, used.
- **A static mirror on a second origin**: platform, L, not in the report as built.

## Top 3 fixes now

1. **Wire `webhooks` subscriptions (M).**
   - "Get updates" offers Slack, Teams or a web address beside email. `webhooks.add` gets a check URL and a ping.
   - `announce()` queues `webhooks.send` beside the emails. The subscriber's page shows failures, and `webhook.disabled` is handled.
   - The SDK and its fake are ready. This is the one blocker a builder can remove today.
2. **Truthful history and bilingual services (N1, N2) (S–M).** No ticks and no "100 %" before a service existed; a second name and description per service; example services in both languages; the team view in the member's language (N4).
3. **Tell Support about incidents (N3) (M).** Emit `status.incident.opened/updated/resolved`. Support shows "Incident en cours" above the inbox and offers a saved reply with the incident's public link.
