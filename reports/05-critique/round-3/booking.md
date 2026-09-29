# Booking (Rendez-vous): severe critique, round 3 (vs Calendly, Cal.com)

Critic run: 2026-09-29, about 22:45 Paris time. Port 11500.

**Setup.** `npm run build`, then `dev.mjs --prod --reset` and `--prod --reset --empty`. My scripts and screenshots are in `critique3/c3/` (`b*.mjs`, `shots/b-*.png`).

**Who I used it as:**
- a visitor on a 390 px phone: a French browser in Paris, and a French browser in Montréal;
- Inès (host, FR), Hugo (host, EN, first visit) and Camille (admin).

**Looks:** own, the Café du Port brand in dark on the public page, the Chest look on the team's Types page, and High contrast in dark on the agenda.

**What I did:**
- booked "Appel projet" end to end, and read the host's agenda afterwards;
- pasted four wrong calendar addresses as a new host;
- counted Tab stops on the public picker.

No console errors and no 5xx.

## Verdict

**Can a 50-person French company cancel Calendly tomorrow?**

| Where | Answer | Why |
|---|---|---|
| On the studio's proposals | **Yes for individual sales or consultant pages** | — |
| On today's Chest | **Not yet** | No confirmation or reminder email reaches the guest (`mail`, `schedules`). The website embed cannot be framed. |
| Teams using Calendly's CRM integration, collective meetings or paid bookings | **No** | — |

| Score | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 3.5 | 6.5 | **7** (unpublished until ready, host texts in two languages, block from the agenda) |
| UX | 8 | 8 | **8.5** (the first minute is now right, and the agenda's free stretches are a real idea) |

Strength, one line: the visitor's flow on a phone (month, time in the visitor's zone, three fields, confirmation page with `.ics`, move and cancel) is at Calendly's level, and the host's first screen now gates publishing on the calendar.

## Round-2 top fixes and blockers

| Round-2 item | Now | Checked how |
|---|---|---|
| Top 1: not public until ready | **Fixed** | Empty tool, Hugo opens `/chest`: "Your page is not public yet", with "Connect" first and "My hours are right: make my page public" second. `/` says "Nobody takes bookings here yet". `/hugo-bernard` is 404 "Nothing here". |
| Top 2: host texts in two languages | **Fixed on the public side** | Visitor in FR on `/ines-moreau/project-call`: "Appel projet", "Parlez-moi de votre projet…", questions and choices in French ("Un logement / Une boutique ou un bureau", "Votre budget, à peu près (facultatif)"). **But see N1**, on the host's side. |
| Top 3a: verify Jitsi | **Fixed (documented)** | The README cites Jitsi's 2023 announcement and an issue, with dates. The guest's page says "La salle s'ouvre à l'arrivée de Inès : si elle indique attendre un modérateur, patientez." Not tried live (blocked from the studio). |
| Top 3b: "Block a time" on the agenda | **Fixed** | Free stretches between meetings with "+ Bloquer", "Débloquer" on a block, and "Bloquer un créneau" beside "Nouveau rendez-vous". |
| R2 #4: Hours page length | **Partly** | 2,306 px at 390 px (was 4,764). Still two 96-option selects per range. |
| R2 #6: CSV button above the list | **Fixed** | "Télécharger (CSV)" is at the foot. |
| Blocker: emails and reminders | **Not fixed** (platform) | — |
| Blocker: embed | **Not fixed** (platform frame policy) | — |
| Blocker: collective meetings | **Not fixed** | — |
| Blocker: payments | **Not fixed** | — |
| Blocker: instant calendar truth | **Not fixed** (≤15 min lag, iCal only) | — |

## Still blocking (what a Calendly customer misses weekly)

1. **Guest emails** (confirmation, reminder the day before, moved, cancelled) on a real Chest. No-shows rise the first week.
2. **CRM link.** Calendly's most-used integration pushes each booking into HubSpot or Salesforce. Booking has **no "With the other tools" section at all**: a booked prospect never reaches Clients (CRM), and no booking appears on the contact's timeline. Both tools are in the store; the event (`booking.booked` → Clients) is one more event between tools.
3. **Hiring does not use Booking.** Hiring's candidate self-scheduling computes free times from "interviews in Hiring" only. Booking already reads each host's real Google or Outlook busy times. Two store tools solve the same problem, and the weaker one is used for interviews.
4. **Collective meetings** (salesperson plus engineer) and **routing forms** (Calendly's "which team should you meet?").
5. **Embed on the company's website:** only the button works until the Chest allows framing.
6. **Payments taken:** a link and a "paid" mark only.

## New problems (round 3)

- **N1: the host's agenda shows one type under two names.**
  - Inès (FR) reads, one under the other: "Sarah Klein · Project call" and "Lucie Garnier · Appel projet"; "Marie Leroy · Showroom visit" and "Lucas Garnier · Visite du showroom".
  - Cause: each booking keeps the type's name as the guest read it (README), and the agenda shows that copy. For the guest's emails that is right; for the host's list it makes one type look like two. The same happens in the CSV and the bell.
  - Fix (S): the team's screens show the type in the reader's language, and the guest's language as a small tag ("FR", "EN").
- **N2: the agenda's "free" stretches do not show why other hours are missing.** On Wed 30 Sept, 16:00–17:00 is simply absent from the agenda (busy in the external calendar, not offered). The host sees a hole with no label and cannot tell a Google meeting from a bug. Show "Occupé (agenda Google)" as a grey row, times only, as it is already stored.
- **N3: a wrong calendar address gets a misleading message.**
  - I pasted the Google Calendar page address (`…/calendar/u/0/r`), the embed address (`…/embed?src=…`), a `webcal://` iCloud address, and Outlook's **HTML** publishing link (`…/calendar.html`; Outlook gives an HTML and an ICS link side by side).
  - Each gave "This calendar refused us: its address may have been replaced. Copy it again." That is wrong for all four, and it blocks the one step that makes a host public.
  - Fix (S): recognise the shapes. "This is the page's address, not its secret iCal address: in Google, Settings → your calendar → Secret address in iCal format." "Use the ICS link, not the HTML one." Accept `webcal://` by rewriting it to `https://`.
- **N4: English city names on the French page.** The time-zone list reads "Brussels, Rome, Sao Paulo, Noumea, Reunion, Martinique" on a French page. A visitor from Montréal is shown "Toronto (UTC−4)", which is correct but surprising. Use the browser's `Intl.DisplayNames` or a French list: "Bruxelles, Nouméa, La Réunion"; and add Montréal, a French-speaking market.
- **N5: French elision.** "à l'arrivée de Inès" should be "d'Inès". The template "de {name}" needs an elided form before a vowel.
- **N6: keyboard on the public picker.** Every open day is its own Tab stop (19 before the zone select). The standard grid pattern is one Tab stop with arrows. Same finding as Rooms' day strip.
- **N7: the agenda on a phone is now half "Libre" rows.** On a busy week the meetings, the main thing, are diluted by free rows of the same size. A toggle "Show free times", or free rows at half height, would keep the list scannable.

## Platform-dependent

- `mail` and `schedules` (guest emails, reminders, `.ics` to the host).
- Frame permission for the public host (embed).
- OAuth free/busy connector held by the Chest (instant truth; Rooms needs the same).
- Custom domain (`rdv.entreprise.fr`) and member photos on the public host.
- Payments "partner" primitive (the same shape as Quotes' PA).
- **Not platform, suite:** events between tools already exist as a proposal. `booking.booked` → Clients and Hiring → Booking are designable now.

## Top 3 fixes now

1. **Suite links (M).**
   - Emit `booking.booked` / `booking.cancelled`, so Clients creates or updates the contact and logs the meeting.
   - Let Hiring's "the candidate chooses" use Booking's free times for the chosen interviewers: real Google and Outlook busy times, not only Hiring's interviews.
2. **The host's truth on the agenda (S):**
   - type names in the reader's language (N1);
   - external busy times shown as grey rows (N2);
   - smarter calendar-address errors, plus `webcal://` (N3).
3. **Localise the visitor's details (S):**
   - French city names and Montréal (N4);
   - elision (N5);
   - the day grid as one Tab stop (N6);
   - a "Show free times" toggle on the phone agenda (N7).
