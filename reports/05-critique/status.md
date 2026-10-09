# Status — severe critique (vs Atlassian Statuspage, Instatus, Better Stack status pages)

Critic run: 2026-09-29, harness port 7400, `--prod --reset`; then all service/incident/subscriber/check tables truncated for the empty state. Screenshots in `critique/rest/` (prefixes `s-`, `s2-`, `s3-`). Played: a customer (public, EN/FR, phone, dark), Camille (editor), Nora (no role); incident posted and resolved with the keyboard path measured.

## Verdict

**Can a 50-person SaaS/e-commerce company cancel Statuspage/Instatus tomorrow? Not yet** — and **Better Stack, no** (it is monitoring + on-call first). The editor's side is the best-executed workflow of my three tools: one screen to post, one dialog to resolve, edits logged as evidence, maintenance switching by the clock, honest declared vs measured uptime, accessible colour-blind-safe states. But a status page is bought for three things this one lacks or only has as studio proposals: **its own address** (`status.company.com`), **reaching customers** (email today is a proposal the Chest does not run; no SMS/Slack/Teams/webhook subscriptions; no embeddable widget/JSON), and **independence from the thing that is down** (it runs on the company's Chest server).

- **Completeness: 5/10** — incidents, maintenance, history, uptime bars, feeds are complete; custom domain, working notifications, API/widget, branding, templates, post-mortems, audience-specific pages, third-party dependencies missing.
- **UX: 8/10** — clear, fast (public pages 30–200 ms), works without JS; a few jargon labels, icon-only rows, and a public page that says "All systems operational" before anything is set up.

Strength, one line: posting and resolving an incident is 5 fields and 2 clicks, and every correction is logged — exactly what an SLA dispute needs.

## Blockers

1. **No custom domain.** The public page lives at `https://status.<chest>.argentic.work/`. Every paying Statuspage/Instatus customer uses `status.<theirdomain>` (Instatus includes it even on low tiers — to verify on their pricing page). Customers, support macros and app footers link to that address; changing it is a migration of every link. The research marks it "never — platform concern". It is a platform concern, but then the store must not claim Status replaces Statuspage. Fix (platform, M): a Chest-level "custom domain for a tool's public host" (CNAME + ACME certificate) — write it in the SDK report as a blocker for Status, Hiring (careers.company.com), Booking and Support.
2. **Customers cannot be notified on a Chest today.** Email updates depend on the `mail` proposal; README: "Without mail on the Chest the form disappears and `/subscribe` gives the RSS address instead". RSS is not what a customer's ops person or a shop's buyer uses. Statuspage offers email, SMS, Slack, Teams, webhooks. Fix: (platform) ship `mail`; (M) webhook subscriptions (a customer gives a URL; needs `network` egress through the Chest proxy — a new "outbound to user-given URLs" permission, design in `sdk/`); (M) Slack/Teams via incoming-webhook URL, same primitive.
3. **The status page shares fate with the company's Chest.** If the Chest server, its network or its proxy is down, the status page is down — while hosted status pages run on separate infrastructure (Better Stack/Statuspage). For a company whose product is *on the same Chest* (unlikely) it is fatal; for others, a Chest outage also silences the status page during maintenance of the Chest itself. Fix (L, platform): publish the public page as static files to a second origin (the Chest's central CDN) on every change; at minimum say it in the README and the store description.

## Major

4. **No public JSON / embed widget / status badge.** Customers' dashboards, the company's own app banner ("We're having issues — see status") and Slack apps read `/api/v2/status.json` (Statuspage's public API) or embed a widget. README: "no public JSON API yet". Fix (S): `/api/status.json` and `/api/incidents.json` in Statuspage's shape (so existing integrations work), plus a small `/embed.js` banner and an SVG badge.
5. **No branding.** The header is a letter tile "A" + company name (`s-public-phone-dark.png`); no logo upload, no brand colour, no link back to the company website or support. For a customer-facing page this looks unfinished next to Instatus. Fix (M): logo + accent + "Back to <site>" + support link, or `chest.theme()` brand mode (SDK report 4.10).
6. **No incident templates.** Statuspage/Instatus let teams prepare "Payments degraded" wording in calm times. Here only the check-failure prefill exists. Fix (S): "Save as template" on an incident; "Start from a template" on Post an incident.
7. **Only automatic checks of status + speed, as a proposal; no heartbeat.** Better Stack customers use keyword checks, heartbeats for cron jobs, SSL-expiry and on-call escalation. README lists heartbeat as a wish. Fix (M): heartbeat URL (needs `schedules` to detect silence — already a proposal) and SSL-expiry warnings from the Chest's checker; on-call stays out of scope — say so.
8. **Incident text in one language only.** The company writes "Delivery dates shown late"; the French customer reads English prose inside a French page (`s-public-fr.png`). For a French SME with French customers the reverse happens. Fix (M): optional second-language text per update (both shown to the right visitor), or at least a `lang` attribute on user text.
9. **Uptime "100.00%" next to yellow ticks confuses customers.** `s-public-phone-dark.png`: Catalogue shows yellow (degraded) days and "100.00% uptime" because degraded counts as up. Correct by the stated rule, but a customer reads it as a lie. Fix (S): show "100% available · 3 days slower than usual" or colour-free wording under the bar.
10. **No post-mortem section** (README admits: "post it as a last update"). Statuspage customers publish post-mortems as a distinct, linkable section; SLA credits refer to them. Fix (S): an optional "What happened and what we changed" block after Resolved, shown under the timeline.
11. **No audience-specific / private pages** (e.g. a page for one big client, or an internal page for the team's own tools). Statuspage sells this. The Chest's private host could serve an internal page for free — an actual Chest advantage not used. Fix (M): a second "internal" page listing internal services, visible under `/chest` to all members (not only editors).
12. **No import from Statuspage/Instatus.** Historical incidents and uptime are the page's credibility; starting at "0 incidents" resets 90 days of history. README: "only in its API". Fix (S): accept the JSON of `https://<old>.statuspage.io/api/v2/incidents.json` pasted or uploaded as a file (no network needed), mapping components by name.

## Minor

13. **Empty public page claims "All systems operational"** while also saying "Nothing to show yet / This status page is being set up" (`s-empty-public.png`). Fix: show only "This status page is being set up" until at least one service exists; or keep the public host closed until then.
14. Services list: 6 icon-only buttons per row (up, down, edit, hide, delete + status dot) (`s-components.png`); hide/delete look alike. Use a "···" menu for rare actions and drag or "Move" for order.
15. Checks form jargon: "Expected answer: 200", "Too slow after (ms): 3000" (`s-checks.png`). Use "Expected answer: OK (200)" with a select, and "Too slow after: 3 seconds".
16. After Resolve, the incident page still shows the full "Post an update / Where are you now?" form; posting any step reopens the incident. One misclick reopens a resolved incident and emails subscribers. Collapse the form behind "Reopen or add a note" once resolved.
17. Phone public page shows 30 ticks but the disclosure says "Show the last 90 days as a table".
18. The subscribe form's honeypot label "Leave this field empty" is in the text flow (read by screen readers). Hide it with `aria-hidden` on the wrapper + `tabindex=-1`.
19. French: "Nous sommes au courant et cherchons" (investigating hint) — incomplete; "Nous analysons le problème". "Publier un point / Ajouter un point" is acceptable French ops wording ("faire le point"), keep it consistent.
20. Plan maintenance uses the native date field (browser format) with custom 24-hour hour/minute selects — mixed; see store-wide date field.
21. Native "Please fill out this field." bubble when posting without a text (`s2-after-post.png`) — in the browser's language, not the tool's; use the tool's inline error like the other forms.
22. Nav "Checks" and "Subscribers" show to every editor even when the Chest runs neither (no mail, no checks); hide or grey them with a one-line reason.

## Bugs (steps to reproduce)

- **B1** Empty setup: truncate services → public `/` shows "All systems operational" + "being set up" (Minor 13).
- **B2** Reopen by accident: resolve an incident → on the same page choose "Investigating" and post → incident reopens and subscribers are emailed (by design per README, but no confirmation; Minor 16).
- **B3** Phone: "Show the last 90 days as a table" under a 30-day bar (Minor 17).
No crashes, console errors or 5xx met on any page.

## Migration in / out

- **In:** none (see Major 12). Subscribers could be imported: Statuspage exports subscribers as CSV from its UI — but re-subscribing people without their double opt-in is a GDPR risk; import them as "to confirm" and send one confirmation mail.
- **Out:** Atom/RSS/ICS feeds and the history pages; no JSON export of incidents/updates/log, no subscriber CSV for editors. Fix (S): "Download everything" (JSON + subscribers CSV).

## UX notes

- First minute (empty): "Add your services first" + "Start with an example" creates 4 services in one click — then Now shows "All systems operational / Nothing is open" and the customer preview. Excellent.
- Main job measured: from Now, 10 Tab stops to "Post an incident", focus lands in "What is wrong?"; type title, tick a service (impact defaults to Partial outage), type text, Post → incident page. Resolve: button + dialog listing which services go back to Operational. 2 clicks after typing.
- Public page: server-rendered, works without JS, times converted to the visitor's zone; states have icon + word + Okabe–Ito colour. Best accessibility of the store's public pages.
- Trust: edits and removals logged with previous text; removed incidents stay visible to editors. Missing: a per-page "who changed the services' order/hidden state" log.

## Fix plan (ordered)

1. Custom domain for public hosts (platform, M) — shared with Hiring, Booking, Support.
2. Public JSON (Statuspage-compatible) + embed banner + badge (S).
3. Ship `mail`; then webhook/Slack/Teams subscriptions via a "user-given outbound URL" primitive (M).
4. Branding (logo, colour, links) (M); templates (S); post-mortem block (S).
5. Empty-page wording (S); resolved-incident form collapse (S); uptime wording for degraded days (S); jargon in Checks (S); icon rows → menu (S).
6. Statuspage JSON import + JSON export (S).
7. Heartbeat + SSL expiry checks once `schedules`/`checks` ship (M); internal status page for the team (M).
8. Static mirror on a second origin for independence (L, platform).


## October 2026: after the move to the new stack

_Added 6 October 2026 from Status's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **143.9 → 67.2 MiB**;
  image 463 → 32 MiB; first members' page 930 →
  649 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: the public forms on the package's bounds (single-use token, budgets spent once a request is good, three confirmation emails a day per address, a known address asked about ten times a day at most); a refused form comes back filled in; public pages with an ETag and a minute's cache; the 90 days drawn once per page; an import capped at 10 MiB (`5e03b42`, `1f0dd24`); Settings says the public address (the company's own domain once connected) and that the Chest frames no public page yet (`b6bc67e`).
- **Pending**: Nothing listed as pending in its commits.

**Verdict, updated.** Blocker 1 ("No custom domain") is **gone**: the Chest connects `status.<company>.com` to a tool's public part and serves its certificate (brief/08; the SDK's `chest.tool.publicUrl` says it), and the links Status writes follow that address (`src/lib/public-origin.ts`), which Settings shows. What still keeps a company on Statuspage: reaching subscribers (email needs the Chest's `mail`), the `/embed` banner (no public page can be framed on a Chest, `frame-ancestors 'none'`), and a page that shares the Chest's fate. **Cancel tomorrow: not yet** — for those three reasons, no longer for the address.
