# Support — open-source research
_Read on 2026-09-28. Replaces: Zendesk, Freshdesk, Crisp (ticketing part), Help Scout._

## The job
Customers (or colleagues) write in; the team sees every request in **one shared inbox**, picks one up
("assigned to me"), answers it, and closes it. The daily 20 %: a list of open tickets sorted by age,
one ticket thread with a reply box, "assign to", status (open / waiting / closed), canned replies,
and an internal note the customer never sees. The customer's side is just a form and a page to follow
the answer.

## Projects

### Zammad
| Field | Content |
|---|---|
| Project | Zammad — https://github.com/zammad/zammad — ~5,960 stars (GitHub search API, read 2026-09-28); latest stable tag `7.2.0` (tags feed, 2026-09-23), `7.3.0-alpha` same day; pushed daily |
| Licence | `AGPL-3.0` — https://github.com/zammad/zammad/blob/develop/LICENSE (read raw: "GNU Affero General Public License Version 3") |
| Reuse | **Ideas only** |
| Stack | Ruby on Rails + Vue/CoffeeScript, PostgreSQL, Elasticsearch, Redis. Data model (ticket / article / state / priority / group / owner) transposes directly to Node + Postgres; the Rails code does not. |
| What it does best | Clear ticket model: a ticket holds **articles** (email, note, phone), each with `internal: true/false` — our "internal note" is just an article flag. Fixed state set (new, open, pending reminder, pending close, closed, merged). Groups = queues with per-group access. Split-screen ticket view with customer info in a sidebar. Macros (one click = set status + reply + close). Merge tickets. |
| What to avoid | Heavy to run: 4 GB RAM + 4 GB more for Elasticsearch (https://docs.zammad.org/en/latest/prerequisites/hardware.html, per search result); users report Elasticsearch eating 10–40 GB (https://github.com/zammad/zammad-docker-compose/issues/256, https://community.zammad.org/t/very-high-memory-usage/13380). Admin screens are dense (triggers, schedulers, SLAs, overviews); too many knobs for a 20-person SME. We use Postgres full-text search instead. |

### FreeScout
| Field | Content |
|---|---|
| Project | FreeScout — https://github.com/freescout-help-desk/freescout — ~4,570 stars (GitHub search, 2026-09-28); release `1.8.243` on 2026-09-28 (releases feed); very frequent small releases |
| Licence | `AGPL-3.0` — https://github.com/freescout-help-desk/freescout/blob/dist/LICENSE (read raw) |
| Reuse | **Ideas only** |
| Stack | PHP / Laravel, MySQL or PostgreSQL. Concepts transpose; code does not. |
| What it does best | The closest to Help Scout's simplicity: mailboxes → folders (Unassigned, Mine, Assigned, Closed, Spam), one conversation view, **collision detection** ("another agent is viewing/replying"), internal notes, starred and "following" conversations, merge / move / forward, auto-reply, list refreshes without reload, paste screenshots into reply (README features list). |
| What to avoid | Many "should be core" features are paid modules (knowledge base, workflows, SLA, satisfaction ratings): https://freescout.net/modules/ and criticism in https://lowendspirit.com/discussion/3191/freescout-helpdesk-software (per search result). Everything hangs on IMAP/SMTP configuration, which is the #1 support topic. |

### Chatwoot
| Field | Content |
|---|---|
| Project | Chatwoot — https://github.com/chatwoot/chatwoot — ~37,300 stars (GitHub search, 2026-09-28); `v4.18.0` on 2026-09-18 (releases feed); very active |
| Licence | `MIT` outside `enterprise/`, which has its own licence — https://github.com/chatwoot/chatwoot/blob/develop/LICENSE (read raw: "Content outside of the above mentioned directories … is available under the 'MIT Expat' license"). GitHub reports `NOASSERTION` because of the split. |
| Reuse | **Code** (MIT, only files outside `enterprise/`, with attribution) — in practice ideas, because the stack differs |
| Stack | Ruby on Rails + Vue 3, PostgreSQL, Redis, Sidekiq, ActionCable (WebSocket). Real-time parts need polling on Chest. |
| What it does best | Modern agent UI: three-pane inbox (filters / list / conversation), private notes with @mentions, labels, **canned responses triggered by typing `/`**, keyboard shortcuts and command bar, auto-assignment, business hours + auto-responder, custom views (README "Other features"). v4.17 added contact and ticket import from Freshdesk (release notes). |
| What to avoid | Built for chat/omnichannel, not tickets; 4–8 GB RAM, Sidekiq/Redis trouble on self-host (https://github.com/chatwoot/chatwoot/issues/15597, https://github.com/chatwoot/chatwoot/issues/12562). Too many channels for our scope. |

### osTicket
| Field | Content |
|---|---|
| Project | osTicket — https://github.com/osTicket/osTicket — ~3,920 stars (GitHub search, 2026-09-28); `v1.18.4` on 2026-06-17 (releases feed); maintenance pace |
| Licence | `GPL-2.0` — https://github.com/osTicket/osTicket/blob/develop/LICENSE.txt (read raw) |
| Reuse | **Ideas only** |
| Stack | PHP, MySQL only. Not transposable. |
| What it does best | The public side: a client portal where a visitor opens a ticket **without an account** and checks it with **email + ticket number**; help topics that route to departments; custom form fields per topic. |
| What to avoid | UI "from the 2000s", not mobile-friendly, many clicks (reviews: https://www.capterra.com/p/125118/osTicket/reviews/, https://www.softwareadvice.com/itsm/osticket-profile/reviews/ — per search result). Email + ticket number is guessable; we use an unguessable secret link instead. |

### Peppermint
| Field | Content |
|---|---|
| Project | Peppermint — https://github.com/Peppermint-Lab/peppermint — ~3,160 stars; last tag `0.5.5`; **archived** (GitHub search shows `archived: true`; archived July 2026 per https://www.getmacha.com/blog/best-open-source-ticketing-systems, per search result) |
| Licence | Custom file `license`: AGPLv3 with a "Commercial License" carve-out — https://github.com/Peppermint-Lab/peppermint/blob/main/license (read raw). No single SPDX id (`NOASSERTION`). |
| Reuse | **Ideas only** |
| Stack | Next.js + Node + Prisma + PostgreSQL — the same stack as ours. |
| What it does best | Proof that a light Next.js/Postgres helpdesk is enough for small teams: ticket list, kanban-style status, notes, simple client portal. |
| What to avoid | Dead project: do not depend on it. Its fate (single maintainer, open-core licence confusion) is a reminder to keep our tool small and maintainable. |

### UVdesk (briefly)
| Field | Content |
|---|---|
| Project | UVdesk community — https://github.com/uvdesk/community-skeleton — ~19,600 stars (GitHub search, 2026-09-28); tag `v1.1.8`; last push 2025-10-01 (slow) |
| Licence | `OSL-3.0` — https://github.com/uvdesk/community-skeleton/blob/master/LICENSE.txt (read raw) |
| Reuse | **Ideas only** (OSL-3.0 is copyleft, "network use is distribution") |
| Stack | PHP / Symfony, MySQL. |
| What it does best | Ticket "types" and a simple customer-facing knowledge base; saved replies. |
| What to avoid | Slow development, e-commerce focus, dated admin. |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Public contact form (name, email, subject, message, optional attachment) | MVP | osTicket, Zendesk web form | Anonymous visitors; honeypot + rate limit; attachments via Chest file API |
| Ticket follow-up page by **secret link** (read thread, add a reply) | MVP | osTicket "check ticket status" | Unguessable token (≥128 bits), never email + number; the visitor must copy the link since we cannot email it yet |
| Shared inbox: Unassigned / Mine / All open / Closed | MVP | FreeScout folders, Help Scout | Polling refresh (no WebSocket) |
| Ticket thread with reply box | MVP | all | Reply is stored and shown on the follow-up page; **not emailed** until the platform has outbound email |
| Internal note (never shown publicly) | MVP | Zammad `internal` article flag, FreeScout | Distinct colour; enforced server-side on the public page |
| Assign to a member | MVP | all | Member ids `mbr_…` from the platform |
| Statuses: Open → Waiting on customer → Closed (+ reopen when customer replies) | MVP | Help Scout, Zammad states | Keep 3 states, not 6 |
| Canned replies (team-shared, insert with `/`) | MVP | Chatwoot `/` shortcut, Help Scout saved replies | Simple variables: `{{customer_name}}`, `{{agent_name}}` |
| Search by subject, text, customer email | MVP | all | Postgres full-text search, no Elasticsearch |
| Notification to the team's shared inbox on new ticket / customer reply | MVP | FreeScout notifications | Uses the platform notification primitive |
| Collision warning ("Marie is viewing this ticket") | MVP | FreeScout collision detection | Presence via polling with short TTL |
| Tags / categories | later | Zendesk tags, Chatwoot labels | |
| Priority | later | Zammad | Most SMEs ignore it |
| Email in (support@ address creates tickets) and email out (replies sent to customer) | later — **depends on missing primitive** | every helpdesk | Needs inbound + outbound email in the SDK (proposal) |
| SLA timers / business hours / "first response due" | later — needs scheduled tasks for reminders | Zendesk, Zammad | Can be computed on read; alerts need cron |
| Auto-close after N days waiting | later — **needs scheduled tasks** | Help Scout, Zammad | |
| Merge tickets | later | Zammad, FreeScout | |
| Satisfaction rating (good / bad) on the follow-up page | later | Zendesk CSAT, FreeScout module | |
| Reports: open count, median first response time | later | Zendesk Explore | |
| Knowledge base / help center | later (separate tool) | Zendesk Guide, Zammad | Belongs to the wiki tool |
| **Import from Zendesk** (JSON/NDJSON full export: tickets + comments + users) | later | Zendesk | Full data export is NDJSON, CSV or XML; CSV has no comments — https://support.zendesk.com/hc/en-us/articles/4408886165402 (per search result) |
| **Import from Freshdesk** (CSV ticket list; XML account export for conversations) | later | Freshdesk | CSV/Excel ticket export has no conversation; full account export is XML — https://support.freshdesk.com/support/solutions/articles/225158 (per search result) |
| Import from Help Scout | later | Help Scout | UI export is reporting CSV/XLSX without threads; threads need the API — https://docs.helpscout.com/article/466-data-export-options (per search result) |
| Live chat widget, WhatsApp, social channels | never | Chatwoot, Crisp | Long tail; needs WebSocket/outbound |
| AI reply suggestions | never (for now) | FreeScout AI module, Chatwoot Captain | Needs outbound network |
| Complex triggers / automations engine | never | Zammad, Zendesk | Too many knobs for the target |

## Reusable pieces
- **markdown-it** (MIT) — Markdown for replies and notes — https://github.com/markdown-it/markdown-it (LICENSE read raw).
- **sanitize-html** (MIT) — server-side HTML sanitising of anything a visitor sends — https://github.com/apostrophecms/sanitize-html (LICENSE read raw).
- **DOMPurify** (`MPL-2.0 OR Apache-2.0`, take Apache-2.0) — client-side sanitising — https://github.com/cure53/DOMPurify (package.json read raw).
- **ALTCHA** (MIT) — self-hosted proof-of-work anti-spam for the public form, no third-party call — https://github.com/altcha-org/altcha (package.json read raw). Alternative: **Cap** (Apache-2.0) — https://github.com/tiagozip/cap (LICENSE read raw).
- For the future email primitive (SDK side, not in the tool): **nodemailer** (MIT-0 per package.json) https://github.com/nodemailer/nodemailer, **mailparser** (MIT) https://github.com/nodemailer/mailparser, **postal-mime** (MIT) https://github.com/postalsys/postal-mime.

## Legal and security notes
- **GDPR / retention.** Tickets contain personal data of external people. CNIL's commercial-management reference allows keeping customer data for the relationship then 3 years; prospects 3 years from last contact (https://www.cnil.fr/fr/questions-reponses-sur-les-referentiels-relatifs-la-gestion-des-activites-commerciales-et-des, https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees — per search result). Tool needs: a configurable retention period (default 3 years after close) and a "delete this customer's data" action — the purge itself needs a **scheduled task** (missing primitive; until then an admin button).
- **Transparency.** The public form must show a short privacy notice (who processes, why, how long) with a link to the company's policy — GDPR art. 13.
- **Secret links** are bearer credentials: long random tokens, stored hashed, revocable, `noindex`, no referrer leak (`Referrer-Policy: no-referrer`) to third parties.
- **Abuse.** Public form = spam and upload vector: size/type limits, rate limit per IP, sanitising, no HTML rendering of visitor input.
- **Accessibility.** The European Accessibility Act applies since 2025-06-28 to many B2C services; France uses RGAA (WCAG 2.1) (https://www.degaullefleurance.com/en/actualites/digital-accessibility-new-obligations-for-the-private-sector/ — per search result). The public form must be fully accessible (labels, errors, keyboard).
- **Internal notes must never leak**: filter server-side on the public endpoint, with a test.

## Sources
- https://github.com/zammad/zammad — https://raw.githubusercontent.com/zammad/zammad/develop/LICENSE — https://raw.githubusercontent.com/zammad/zammad/develop/README.md — https://github.com/zammad/zammad/tags.atom
- https://docs.zammad.org/en/latest/prerequisites/hardware.html
- https://github.com/zammad/zammad-docker-compose/issues/256
- https://community.zammad.org/t/very-high-memory-usage/13380
- https://github.com/freescout-help-desk/freescout — https://raw.githubusercontent.com/freescout-help-desk/freescout/dist/LICENSE — README (dist branch) — https://github.com/freescout-help-desk/freescout/releases.atom
- https://freescout.net/modules/
- https://lowendspirit.com/discussion/3191/freescout-helpdesk-software
- https://github.com/chatwoot/chatwoot — https://raw.githubusercontent.com/chatwoot/chatwoot/develop/LICENSE — README — https://github.com/chatwoot/chatwoot/releases.atom
- https://github.com/chatwoot/chatwoot/issues/15597
- https://github.com/chatwoot/chatwoot/issues/12562
- https://github.com/osTicket/osTicket — https://raw.githubusercontent.com/osTicket/osTicket/develop/LICENSE.txt — https://github.com/osTicket/osTicket/releases.atom
- https://www.capterra.com/p/125118/osTicket/reviews/
- https://www.softwareadvice.com/itsm/osticket-profile/reviews/
- https://github.com/Peppermint-Lab/peppermint — https://raw.githubusercontent.com/Peppermint-Lab/peppermint/main/license
- https://www.getmacha.com/blog/best-open-source-ticketing-systems
- https://github.com/uvdesk/community-skeleton — https://raw.githubusercontent.com/uvdesk/community-skeleton/master/LICENSE.txt
- https://support.zendesk.com/hc/en-us/articles/4408886165402-Exporting-ticket-user-or-organization-data-from-your-account
- https://support.freshdesk.com/support/solutions/articles/225158-how-do-i-export-my-tickets-from-freshdesk-
- https://docs.helpscout.com/article/466-data-export-options
- https://github.com/markdown-it/markdown-it
- https://github.com/apostrophecms/sanitize-html
- https://github.com/cure53/DOMPurify
- https://github.com/altcha-org/altcha
- https://github.com/tiagozip/cap
- https://github.com/nodemailer/nodemailer — https://github.com/nodemailer/mailparser — https://github.com/postalsys/postal-mime
- https://www.cnil.fr/fr/questions-reponses-sur-les-referentiels-relatifs-la-gestion-des-activites-commerciales-et-des
- https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- https://www.degaullefleurance.com/en/actualites/digital-accessibility-new-obligations-for-the-private-sector/
