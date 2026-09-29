# Critique — Support (tools/public-and-private/helpdesk)

Claims to replace: Zendesk, Freshdesk, Help Scout (and by extension Crisp).
Used on 2026-09-29 in the harness (port 7300, `--prod --reset`, whose fake Chest *has* the mail proposal). I was a stranger on a 390 px phone (EN and FR), Inès (agent, FR) on phone and desktop, and Tom (viewer). I also emptied the tables with psql for the first run (the harness has no `--empty` flag). Screenshots: `critique/sales/hd-*.png`.

## Verdict

**Can a 50-person company cancel Zendesk / Freshdesk / Help Scout tomorrow? Not yet.** On a real Chest today there is **no email in or out**: *mail* is a studio proposal. A helpdesk whose customers cannot simply email support@ is a contact form with a shared inbox. Once mail ships, a 2–5 agent team with simple needs could switch. A team of 10+ agents will miss automations, SLAs with business hours, bulk actions, merging, reports and a help centre within the first week. It does not replace Crisp at all: there is no live chat.
**Completeness 4.5/10** (6/10 once mail ships): the inbox, reply/note, assignment, priority, tags, saved replies, collision notice, files and the secret follow-up page are right. The rest of a weekly Zendesk routine is missing.
**UX 8/10**: the clearest tool of my four. Plain words, a clean phone ticket page, a good empty state, notes that cannot be mistaken for replies.

## Blockers

1. **No email channel on a real Chest.** Where: `chest.proposals.json` `mail` (send + mailbox `support`). Without it, replies show only on the follow-up page ("On the follow-up page only"), and emails sent to support@ never arrive. Why it matters: 80 %+ of support volume at a 50-person B2B/B2C company arrives by email. Customers will not bookmark a secret link. Fix: this is an SDK ship item, not a tool item. Make *mail* (inbound mailbox + outbound with threading headers) the first SDK proposal to land, and until then keep Support out of the "cancel your SaaS" pitch. **L (SDK)**
2. **Not a Crisp replacement: no live chat widget** (blocker only for Crisp customers; the README itself claims Zendesk, Freshdesk and Help Scout, not Crisp). Crisp's core is a website chat bubble. Also, the form cannot be embedded in the company's website: `frame-ancestors 'none'` in `proxy.ts`. Fix: never pitch Support to Crisp users, and allow framing of `/` from origins an admin lists. Or plan a chat widget. That needs a push/long-poll primitive; WebSocket is forbidden, so it would be polling every few seconds on the public host. **L**

## Major

1. **No automations.** Nothing tags, prioritises or assigns on arrival ("subject contains *facture* → tag Invoice, assign Sofia"; "from @bigclient.com → Urgent"). Zendesk triggers and Freshdesk dispatch rules are used by every team above 3 agents. Fix: 5–10 simple rules, "When a new request … contains/comes from … → set tag / priority / assignee", evaluated on creation. **M**
2. **Waiting time counts nights and weekends; no business hours, no SLA.** "Attend depuis 26 h" on Monday morning for a Friday-evening email makes every Monday red. Fix: business hours per company (days + hours + holidays) used by the "waiting too long" highlight, plus a first-response target. **M**
3. **No bulk actions.** You cannot select 20 spam or "thanks!" tickets and close them. Fix: checkboxes on inbox rows, with Assign / Close / Spam / Tag and Undo. **M**
4. **No merge.** Customers write twice (form + email, or two emails). Fix: "Merge into #…" on a ticket (messages combined in time order, other ticket closed with a link). **M**
5. **No reports.** A support lead is asked weekly "how many tickets, how fast did we answer, who answered what". Fix: a *Reports* page for admins: created/closed per week, median first-response time, per agent, per tag. **M**
6. **No help centre.** Zendesk Guide / Freshdesk Solutions / Help Scout Docs are the public FAQ that deflects tickets. The README says "that is the Wiki", but the Wiki is private. Fix: either a public "Answers" section here (saved replies promoted to public articles), or a public mode for the Wiki. Write it in the SDK/suite report. **M–L**
7. **The export has no conversations.** `/chest/export` CSV columns: number, subject, state, priority, tags, email, name, assignee, channel, dates, *message count*. The words of the messages are not exported, and dates are raw UTC ISO (`2026-09-28T20:45:25.278Z`). Leaving the tool means losing every conversation. Fix: a JSON (or one CSV row per message) export including bodies, authors, notes and attachment names; local dates in the CSV. **S**
8. **No import from Zendesk/Freshdesk.** Old tickets stay behind, so the company keeps a Zendesk seat for history or loses it. Fix: import the Zendesk/Freshdesk JSON/CSV export as closed tickets (read-only history per customer email). **M**
9. **Several addresses / brands.** Many companies have support@ and sales@ or two brands. One mailbox, one company name, one form sentence. Fix: after mail ships, several mailboxes, each mapped to a default tag/assignee. **M**
10. **The form sentence is in one language.** On the French form the visitor reads "Questions about an order, a delivery or an invoice? Write to us: we answer within one working day." under "Contacter Atelier Martin" (`hd-form-fr-empty-submit.png`, `hd-fail-visitor_fixes_and_sends.png`). Fix: one sentence per language in Settings (EN required, FR optional, falls back to EN). **S**

## Minor

1. **"Personne" as the unassigned pill.** On the phone every unassigned ticket carries a pink "Personne" pill (`hd-inbox-phone-ines.png`). In French it reads as "nobody" or "person", and pink reads as an alarm. Fix: « Non attribuée » in a neutral grey pill. **S**
2. The customer's message bubble is salmon pink (`hd-ticket-phone-ines.png`), close to an error colour. Fix: a neutral tint for the customer, the brand teal for the team. **S**
3. On the phone the header shows only the icon (no "Support"), and the folder tabs scroll sideways. *Ouvertes / En attente / Terminées / Nouvelle demande / Réglages* are off-screen with no cue (`hd-inbox-phone-ines.png`). Fix: the current folder as a select-style title ("À attribuer ▾"), and New ticket as a floating button. **S**
4. The default sort, "longest wait", puts an **Urgent** "delivery today" ticket third, under a normal invoice question (`hd-inbox-phone-ines.png`). Fix: default "Most urgent first", with wait time as the tiebreak. **S**
5. The composer is plain text with no links, bold or lists, and no image preview in the thread (files open in a new tab). Help Scout and Zendesk agents paste links and screenshots daily. Fix: minimal formatting (auto-linked URLs, line breaks kept) and inline thumbnails for images. **S–M**
6. No keyboard shortcuts for agents (next ticket, reply, close). Help Scout and Zendesk power users rely on them. Fix: `j/k`, `r`, `n`, `e` with a `?` sheet. **S**
7. No satisfaction rating. Fix: a one-click 👍/👎 on the follow-up page after closing. **S**
8. The follow-up page ignores the request's own language. The ticket stores `language`, but `/t/<secret>` uses the visitor's cookie or browser. The customer who wrote in French and opens the link on an English-set office PC sees English (`hd-followup-after-answer.png`). Fix: default to the ticket's language, and keep the switch. **S**
9. The anti-bot "too fast" check (3 s from render) fires on a real person who fixes a field quickly after an error: the token is renewed on every render. The error "C'était très rapide. Attendez quelques secondes et renvoyez." blames the customer. Fix: count from the *first* render (keep the original `started`), and on "too fast" wait silently server-side for the remaining seconds instead of refusing. **S**

## Bugs (with steps)

1. Stranger, phone, `/` → Français → fill every field with a bad email ("marc.lenoir@gmail") → *Envoyer* within 3 s of the page loading → "C'était très rapide…". Correct the email and resend within 3 s → the same refusal again. With pauses it works, and the email check then says "Vérifiez l'adresse e-mail." (see Minor 9). **S**
2. No other functional bug: form → ticket #1007 → reply from the phone → the customer sees "Answered — waiting for you" with the reply. The whole loop worked, and the reply was recorded "sent by email" in the harness outbox.

## Migration in / out

- **In:** nothing (Major 8).
- **Out:** a CSV of ticket headers only, with no message text (Major 7). An office manager asking "can I get our data out?" gets the wrong answer today.

## UX notes

- The first minute works: the empty inbox says "Your shared inbox is ready. Customers write through your public form or to support@… Open the public form" (`hd-empty-chest.png`). Two clicks to answer.
- The public form on a phone is clean, short, in plain words. It states the privacy sentence and 10 MB/5 files up front, and keeps what was typed after an error.
- The follow-up page ("Merci — nous avons bien reçu votre demande. Votre numéro de demande est le 1007. Gardez l'adresse de cette page…", with *Copier le lien*) is well written.
- Keyboard: the inbox Tab order is logical (skip link, folders, search, filters, tickets). Focus stays inside the page, with no traps.
- French is natural ("Je la prends", "Envoyer et terminer", "Note interne"). The exceptions are "Personne" (Minor 1) and the admin-typed English sentence (Major 10).
- Speed: 0.6–0.9 s per page.
- Trust: erasing a customer, retention of closed tickets, and a member leaving (tickets go back to Unassigned) are handled and explained. There is no audit of who deleted or erased what.

## Fix plan (ordered)

1. Ship the SDK *mail* proposal; until then, remove Support from the "cancel" list or label it "form + shared inbox". **L (SDK)**
2. Full export (messages, notes, local dates). **S**
3. Bilingual form sentence; "Non attribuée"; phone navigation; default sort by urgency; ticket-language follow-up; gentler "too fast". **S**
4. Bulk actions and merge. **M**
5. Business hours + first-response target in the "waiting" logic. **M**
6. Simple automations on arrival. **M**
7. Reports page. **M**
8. Zendesk/Freshdesk history import. **M**
9. Public answers / help centre (with the Wiki). **M–L**
10. Stop claiming Crisp until a chat widget exists. **S** (wording) / **L** (widget)
