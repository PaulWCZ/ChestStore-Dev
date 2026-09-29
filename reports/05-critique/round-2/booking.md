# Critique round 2 — Booking / Rendez-vous (tools/public-and-private/booking) vs Calendly

Run 2026-09-29, port 7300, `npm run build`, `dev.mjs --prod --reset` and `--prod --reset --empty` (the harness fakes `mail`, `schedules`, `calendar`, and seeds the hosts' external busy times). Studio flow `flows/booking.mjs`: **21/21 passed**. My pass: a stranger on a 390 px phone (EN and FR; own, Chest, brand; light/dark) booking Inès's "Project call" (`bk-visit.mjs`), Inès (host, FR), Hugo (host), Camille (admin, FR), Tom (no role); axe 0 violations, no overflow, 0 errors on 44 shots. Screenshots `shots/bk-*.png`.

Strength in one line: it now subtracts the host's real Google/Outlook/Apple busy times, blocks an hour, gives each meeting its own video room, does round robin and host-side booking — and the visitor page is still the best public page in the store.

## Verdict

**Can a 50-person French company cancel Calendly tomorrow? Not yet — close for individual sales/consultant pages.** The round-1 killer (blind to the real calendar) is answered with the secret iCal address, read every 15 minutes. What remains for a paying Calendly customer: on a real Chest **no confirmation or reminder email** reaches the guest (mail/schedules are proposals), the **website embed cannot work** on a real Chest (frame policy), a meeting added in Google can still be offered for up to ~15 min, no collective (two-host) meetings, no OAuth. I could **not verify the calendar reading against a live Google feed** (the harness seeds busy times; parsing is covered by the tool's tests).

| | Round 1 | Round 2 |
|---|---|---|
| Completeness | 3.5 | **6.5** |
| UX | 8 | **8** |

## Round-1 findings

Blockers
- B1 Blind to the host's calendar — **fixed in the tool, partly in effect**: up to three secret iCal addresses, busy-only, RRULE/VTIMEZONE aware, stale-read warning on the agenda (flow; `bk-hours-own-light-phone.png` "calendar.google.com · Lu il y a 5 minutes · 38 événements"). Limits: 15-minute lag, no OAuth, declined invitations count as busy; not verified live.
- B2 Cannot block one hour — **fixed** ("Bloquer un créneau", quarter-hour, shown as grey blocks on the agenda).

Majors
- M1 One fixed video link — **fixed** (a new Jitsi room per booking, `https://meet.jit.si/atelier-martin-bg4jkojhgwog`, or the host's own pattern; warning when a fixed link is kept). See new problem 3.
- M2 No team scheduling — **partly** (round robin "Also taken by", least-booked; no collective meeting).
- M3 No website embed — **partly** (admin allow-list + frame code + a button code; the frame cannot work on a real Chest until the front stops adding `frame-ancestors 'none'`; the button works).
- M4 Emails/reminders need unshipped proposals — **not fixed** (platform); the tool says "no email" in Settings when absent.
- M5 Feed delay — **partly** (the host gets an `.ics` per booking by email — with mail; bookings go to the Chest calendar proposal).
- M6 Host books for a customer / moves — **fixed** (flow).
- M7 Payments — **partly** (a payment link per type + "paid" mark; nothing checked).
- M8 Calendly import — **fixed** (scheduled-events CSV, conflicts listed; column names from Calendly's help pages, not a real file).

Minors: time-zone list **fixed** (cities + offset, grouped); French date casing **fixed**; mixed languages **partly** (see new 2); rolling date view **fixed** (five weeks from the first free week); "too fast" **fixed** (waits silently); copy Monday **fixed**; daily cap across types **fixed**; weekly/monthly caps **not done**.

## Still blocking (weekly, for a Calendly customer)

1. **Emails**: confirmation, reminder the day before, reschedule/cancel notices — none on a real Chest. No-shows rise at once.
2. **Embed on the website** (Calendly's inline widget on the Contact page).
3. **Instant calendar truth**: Calendly reads free/busy live via OAuth; here ≤15 min + Google's own publishing delay.
4. **Collective meetings** (sales + engineer both free) and team pages across owners.
5. **Payments** (Stripe-collected paid consultations), **SMS reminders**, **routing forms** (Calendly's lead qualification).

## New problems (round 2)

1. **Opening the tool once publishes you to strangers.** Empty tool: Hugo opens `/chest` once → the public company page `/` immediately lists "Hugo Bernard · 1 kind of meeting", bookable on default weekday hours, **with no calendar connected** (`bk-e-public2-own-light-phone.png`, `bk-e-hugo-page-own-light-phone.png`). An employee who only looked at the tool can be booked into their real meetings. Default should be "not shown" and "not bookable" until the host has either connected a calendar or confirmed their hours. **S**
2. **French visitor page with English host content.** On `/ines-moreau/project-call?lang=fr`: "Tell me about your project…", "What is it for?", "A home / A shop or an office…", "Your budget, roughly (facultatif)" — English questions with French "(facultatif)" and "Oui/Non" (`bk-visit.mjs` output). Host texts have one language; the tool's words switch. Same class as Forms before it gained per-form languages — reuse that. **M**
3. **"Jitsi, free, no account" needs checking.** To my knowledge (not re-read today — verify), meet.jit.si has required the first participant to sign in (Google/GitHub/Facebook) to open a room since 2023. If so, a host without such an account is stuck in the lobby of their own meeting. Offer "your own Jitsi server" and "your own Zoom/Meet personal room" first, or test and document it. **S** to verify.
4. **Hours page on a phone is 4,764 px long** and mixes four jobs: week hours (two 96-option selects per range), other calendars, block a time, days off / other hours (`bk-hours-own-light-phone.png`). "Block a time" — the everyday action — is the third section down. Split into tabs or put "Bloquer un créneau" on the agenda. **S**
5. **Empty agenda does not ask for the one thing that prevents double bookings**: the first screen offers "Copier le lien" and "Ouvrir", never "Connect your calendar first" (`bk-e-agenda-hugo-own-light-phone.png`). The README's "First minute" puts it second; it should gate sharing. **S**
6. **Agenda on phone**: a full-width "Télécharger (CSV)" button sits above "Nouveau rendez-vous" and the list — export is a rare action. The tab "Types de rendez-vous" wraps on two lines in the tab bar.
7. Chest look is light only (kit design); a dark-mode visitor gets white in that look.

Store coherence (§2): no more `window.confirm` (in-page confirm, flow), kit time selects, member chip, glossary — followed. Departures: item 6 (export as a main-size button), search still absent on bookings.

## Platform-dependent

- **`mail` + `schedules`** — confirmations, reminders, `.ics` to the host (studio proposals).
- **Frame permission** (`embeddable`) for the public host — the inline embed.
- **OAuth free/busy connector** held by the Chest (instant truth, no secret addresses) — SDK report.
- **Chest calendar** (`calendar` proposal) — each booking in the host's Chest feed.
- **Custom domain** (`rdv.<company>.fr`) and **photos on the public host**.
- **Payments** — needs an outbound partner primitive (Stripe), same shape as Quotes' PA "partners".

## Top 3 fixes now

1. **Not public until ready**: new hosts hidden and unbookable until they connect a calendar or confirm hours; the first agenda screen says "Connect your calendar" before "Copy the link". **S**
2. **Host questions and welcome text in two languages** (reuse Forms' second-language model), and pin the page's words to the language of the host's text when only one exists. **M**
3. **Verify the Jitsi default** on meet.jit.si; if sign-in is required, make "my own room address" the default and say so in the type editor; move "Block a time" onto the agenda (tap a free slot → Block). **S**
