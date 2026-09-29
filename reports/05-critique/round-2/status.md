# Status — severe critique, round 2 (vs Atlassian Statuspage, Instatus, Better Stack status pages)

Critic run: 2026-09-29, port 7400. Setup: `npm run build`, then `dev.mjs --prod --reset` and `--prod --reset --empty`. `flows/status.mjs` passes 20 of 20. On top of it I used my own Playwright scripts and curl. Screenshots are `critique2/rest/shots/s-*.png`.

Who I used it as:
- a customer: EN, phone, dark;
- Tom (editor, EN), Camille (editor, FR) and Hugo (member without a role);
- in five looks from the Look panel: Chest, the sample brand in dark, Confetti for this tool only, High contrast dark on a phone, and Seaside dark on the team side.

## Verdict

**Can a 50-person French company cancel Statuspage or Instatus tomorrow? Not yet.** Better Stack: no, because it is monitoring and on-call first.

The editor side and the public page now match Statuspage's core, and even its API. Three things still stop a paying customer, none of which the tool can fix:
- no `status.company.com`;
- customers reached only by email, and only once the Chest runs `mail`;
- the page goes down with the company's Chest.

| Score | Round 1 | Round 2 | Why |
|---|---|---|---|
| Completeness | 5 | **7** | Added since round 1: Statuspage-compatible JSON API, badge, banner, brand, templates, post-mortems, second language, team-only services, heartbeats, Statuspage import and a full export. Missing: domain, webhook/Slack/SMS subscriptions, audience pages, SSL/keyword checks. |
| UX | 8 | **8.5** | Posting is still 5 fields and 2 clicks. The services list is fixed and the empty page is honest. Points lost to the language model (N1) and an early "measured" figure shown to customers (N2). |

Strength, one line: an existing Statuspage integration (dashboard, Slack app, widget) reads `/api/v2/summary.json` unchanged. I checked it with curl: page, components and status in Statuspage's shape, CORS `*`, `public, max-age=30`.

## Round-1 findings

| # | Round 1 | Now | Checked how |
|---|---|---|---|
| B1 | No custom domain | **Not fixed (platform)** | README "No address of its own", SDK report §4.15. |
| B2 | Customers can't be notified | **Partly** | Email with double opt-in passes in the flow, on the `mail` proposal. No webhook, Slack, Teams or SMS (these need a `webhooks` primitive, not built). |
| B3 | Shares fate with the Chest | **Not fixed (platform)** | Said plainly in the README. |
| 4 | No JSON, widget or badge | **Fixed** | `/api/v2/*`, `/badge.svg` and `/embed` with `frame-ancestors` (flow, curl). |
| 5 | No branding | **Fixed** | The brand look with logo, "Back to atelier-martin.fr" and "Contact support" (s-public, s-looks). |
| 6 | No templates | **Fixed** | "Partir d'un modèle" and "Enregistrer comme modèle" (s-new-camille-fr). |
| 7 | No heartbeat | **Fixed** (flow). | SSL-expiry and keyword checks: not yet. |
| 8 | Incident text in one language | **Fixed, but wrong model** | See N1. |
| 9 | "100%" next to yellow ticks | **Fixed** | "99.98% uptime · 3 days slower than usual" (s-public.png). |
| 10 | No post-mortem | **Fixed** | "Read what happened and what we changed" (s-public.png, flow). |
| 11 | No internal page | **Fixed** | Hugo (no role) sees "Status of our services", team-only services included (flow, s-empty-hugo). |
| 12 | No import | **Fixed (Statuspage only)** | Flow. Instatus and Better Stack are not covered. |
| 13 | Empty page said "All operational" | **Fixed** | "This status page is being set up". The API returns the same `description` (curl on `--empty`). |
| 14 | Six icons per service row | **Fixed** | "Edit" plus a "···" menu with words (s-components.png). |
| 15 | Checks jargon | **Fixed** | "OK (200)", "3 seconds". |
| 16 | A misclick reopens a resolved incident | **Fixed** | The form is gone once resolved. Reopen asks in a dialog (flow). |
| 17 | "90 days" under a 30-day phone bar | **Fixed** | The phone says "30 days ago". |
| 19 | French "au courant et cherchons" | **Fixed** | Now "Nous sommes au courant et analysons le problème". |
| 20 | Native date field | **Fixed** | Flow: past incident "days typed in the editor's words", 24-hour list. |
| 21 | Native "Please fill out this field" | **Fixed** | Flow. |
| 22 | Checks and Subscribers in the nav without mail or checks | **Partly** | Checks is still in the nav. The page says what the Chest can't do (README). |

## Still blocking (what a Statuspage customer misses weekly)

1. **Its own address.** Every support macro, app footer and SLA contract links `status.company.com`. Moving means changing all of them, and the Chest cannot yet serve that domain.
2. **Reaching the customer's tools.** B2B customers subscribe their Slack channel or a webhook, not an inbox. With email only, and email not yet running on a real Chest, a customer on day one sees an RSS link.
3. **Independence.** A status page that goes down with the company's server fails in exactly the incident it exists for. A static mirror on a second origin is platform work (L).
4. **Audience-specific or password-protected pages** for a big client: not built (README).

## New problems this round

- **N1: an incident's "language" is the Chest's, not the author's.**
  - Steps: harness Chest in English. Camille, whose member language is French, opens `/chest/incidents/new`.
  - The whole form is in French, and she types French. The checkbox under the text reads **"Rédiger aussi en français"** (s-new-camille-fr.png).
  - Cause: `lib/languages.ts` `mainLanguage()` = `chest.locale()`. Her French text is stored and served as the *English* version, marked `lang="en"` for screen readers. The tool also asks her for a French second version she already wrote.
  - The reverse hits an English-speaking editor in a French Chest (Tom in a Lyon SME).
  - Fix (S): a "Written in [English/Français]" choice defaulting to the editor's language, as News and Hiring jobs do, with the second-language box offering the other one.
- **N2: the "measured" uptime is published from the first check.**
  - The public page shows under Checkout: "99.97% declared uptime" **and** "Measured by automatic checks: 25.00% since 29 September", next to a green "Operational" (s-public.png; the figure comes from the flow's 4 checks).
  - The same happens on any real first day: one failed check out of four becomes a public 25 %.
  - Fix (S): publish the measured figure only after a minimum sample (for example 24 h and 100 checks). Before that, say "Measured from <date>" without a number.
- **N3: the phone's primary action comes second.**
  - On `/chest` at 390 px, "Prévoir une maintenance" sits above "Signaler un incident" (s-looks.png, phone). Desktop has them right (primary on the right).
  - The French header pushes "Page publique" onto a row of its own.
  - Fix (S): put the primary first on the phone.
- **N4: "Post an incident" on an empty tool says the same thing twice.** Title "Add your services first", then body "Add your services first: an incident says what it affects." (s-empty.png). Fix: drop the repeat.
- **N5: a theme for all tools dresses the customer page.**
  - With Confetti for this tool, customers see the Confetti look. The README admits a catalogue theme chosen for all tools does the same.
  - A company choosing "Seaside" for its team tools does not mean "Seaside for our customers".
  - Store-level fix: public pages follow the brand, else the tool's own look.
- **N6: a service's state can't be set without an incident.** Statuspage lets an editor flip a component to "Degraded" in one click. Here that takes an incident. That is arguably better practice, but a Statuspage user will look for it. Say so in Services ("To change a state, post an incident").

Looks: the five state colours stayed fixed and readable in every look I tried, which is right: they carry meaning. The brand look is convincing for a customer page: logo, green, serif. High contrast dark on a phone was fully legible. The Chest look on the public page is plain but clear.

No console errors or 5xx. Public page served in 0.16–0.20 s (curl), `Cache-Control: private, max-age=30`.

## Platform-dependent

- Custom domains for public hosts (SDK report §4.15): the first blocker.
- `mail` (§4.2) for subscribers. A `webhooks` or "outbound to a user-given URL" primitive for Slack, Teams and webhooks is named in the README and not built.
- `checks` (§4.9) and `schedules` (§4.1) for automatic checks, heartbeats and the maintenance posts.
- A static mirror of the public page on a second origin (not in the report, L).

## Top 3 fixes now

1. **Fix the language model (N1) and the early measured-uptime figure (N2) (S).** Both make the customer-facing page say something false.
2. **Design `webhooks` in `sdk/` with its fake, then Slack, Teams and webhook subscriptions (M).** This is what B2B customers actually subscribe with, and it needs no mail.
3. **Put the phone primary first (N3) and make public pages follow the brand or own look, never an all-tools catalogue theme (N5) (S).**
