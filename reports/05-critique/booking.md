# Critique — Booking / Rendez-vous (tools/public-and-private/booking)

Claims to replace: Calendly, Cal.com, Google Calendar booking pages.
Used on 2026-09-29 in the harness (port 7300, `--prod --reset`, the fake Chest has mail + schedules), as a stranger on a 390 px phone (EN), Inès (host, FR) on phone and desktop, and Tom (no role). I did not test an empty tool separately: the first visit of a host creates their page with default hours and a 30-minute type, which is the design. Screenshots: `critique/sales/bk-*.png`.

## Verdict

**Can a 50-person company cancel Calendly tomorrow? No.** Calendly's whole value is "people only see times when I am really free". This tool cannot see the host's Google or Outlook calendar. The host must mirror every meeting, lunch and dentist appointment by hand, and cannot even block a single hour without redefining the whole day. The first week brings double bookings against internal meetings, and people go back to Calendly. The visitor side, though, is the most polished public page of my four tools.
**Completeness 3.5/10**: types, hours, questions, limits, no-overlap guarantee, move/cancel and an ICS feed are right. Calendar reading, unique video links, team scheduling (round robin), website embed and reminders on a real Chest are missing.
**UX 8/10**: the visitor flow is excellent (month → times in their zone → three fields → booked, with calendar file, move and cancel). The host side is clear. Points lost for the time-zone list, the day-level-only blocking, and a few French typography slips.

## Blockers

1. **Blind to the host's real calendar.** README: "Booking does not read the host's other calendar… a host blocks time with days off and hours." Calendly, Cal.com and Google appointment pages all subtract busy times from Google/Microsoft/CalDAV. Why it matters: in a 50-person company a salesperson's calendar changes several times a day, and nobody will re-enter it here. Fix: an SDK primitive "calendar free/busy" (OAuth to Google/Microsoft, or CalDAV/ICS URL fetch through declared outbound network, cached every 5–10 min). The cheapest first step: let a host paste their calendar's **secret ICS address** (Google and Outlook both offer one) and have the tool fetch it through a declared outbound host every 10 minutes. That needs only *declared outbound network* + *schedules*. **L (SDK) + M (tool)**
2. **Blocking one hour is not possible.** Where: `/chest/hours` (`bk-ines_chest_hours.png`). The only tools are "Jours de congé" (whole days) and "D'autres horaires pour un jour" (replace the whole day's hours). To block Tuesday 10–11 the host must rewrite Tuesday as 09:00–10:00 + 11:00–12:30 + 14:00–18:00. Combined with Blocker 1, the host has no practical way to protect a meeting. Fix: "Block a time" (date + from/to + note), shown on the agenda as a grey block, and a one-tap "Block" from any free slot on a week view. **S–M**

## Major

1. **One fixed video link for every meeting.** The confirmation shows `https://meet.example.com/atelier-ines` (type-level text) to every guest (`bk-confirmed-phone.png` flow output). Consecutive guests can walk into each other's call, and the host cannot use personal Zoom/Meet/Teams rooms per meeting. Calendly creates a unique Zoom/Meet/Teams link per booking. Fix: (a) warn in the type editor "everyone gets this same link" and suggest a waiting-room setting; (b) later, per-booking links via an SDK outbound + OAuth primitive, or Jitsi-style unique room URLs (`https://meet.jit.si/<company>-<random>`), which need no API. **S (b-lite) / L**
2. **No team scheduling.** No round robin ("book any sales rep") and no collective meeting (two hosts both free). A company page listing people is not the same thing: a visitor does not know whom to pick. Calendly Teams and Cal.com round robin are why companies pay per seat. Fix: a "Team type" owned by an admin: members, mode (round robin by least-booked / collective), the slot is free if one (or all) are free, the booking goes to the chosen host. **L**
3. **Cannot be embedded in the company website.** `proxy.ts` sends `frame-ancestors 'none'`. The Calendly inline widget on the "Contact" page is the most common use. Fix: an admin setting "Websites allowed to show your booking page" → `frame-ancestors` list, and a copy-paste `<iframe>` snippet on the type's page. **S**
4. **Reminders and emails exist only with two unshipped proposals** (*mail*, *schedules*). On a real Chest today a guest gets no confirmation email and no reminder; they must keep the page link. No-shows go up at once. Fix: the SDK must ship these; meanwhile the success page should push "Add to my calendar" as the primary button (it already offers it) and say "No email will be sent — add it to your calendar now". **S (tool) / L (SDK)**
5. **Private calendar feed = hours of delay.** The host's bookings reach Google or Outlook only through a subscribed ICS feed. Google refreshes subscribed calendars on its own schedule, typically hours later, so a meeting booked at 9:05 for 11:00 may not be in the host's phone calendar in time. Fix: email the host an `.ics` invite for each booking (with *mail*), which calendar apps add immediately. Say the delay plainly next to the feed address. **S**
6. **The host cannot book on behalf of a customer** (a customer calls and says "book me Thursday") or reschedule a booking themselves (README: "they cancel with a word"). Fix: "New booking" on the agenda (pick type, slot, guest name/email) and "Move" for the host with an email to the guest. **M**
7. **No payments.** Paid consultations (lawyers, coaches, training bodies) use Calendly + Stripe. Fix, cheaply: a "Payment link" field per type shown on the confirmation, with the booking "pending" until the host marks it paid. Full Stripe needs outbound. **S / L**
8. **No import from Calendly.** Future meetings already booked there must be re-entered by hand or honoured twice. The research names Calendly's scheduled-events CSV. Fix: import upcoming events from that CSV as bookings (with no-overlap checks, and a report of conflicts). **M**

## Minor

1. **The time-zone picker is a raw IANA list** ("Africa/Abidjan… Africa/Asmera…", obsolete ids included) on the public page and in settings. Fix: the detected zone first, then common zones with city names and current offset ("Paris (UTC+2)"), then a searchable rest; drop legacy aliases like `Asmera`. **S**
2. **French typography:** the days off read "Jeudi 8 Octobre 2026" and "Vendredi 9 Octobre 2026" with capitals (`bk-ines_chest_hours.png`). In French: « jeudi 8 octobre 2026 ». Fix: do not title-case formatted dates in `fr`. **S**
3. **Mixed languages in the host's bell:** "Julie Garnier a réservé mercredi 30 septembre à 14:00 Project call — What is it for?: A home — Do you have plans…?: Oui". The questions and choices are single-language (typed by the host), while the yes/no is translated. Fix: show yes/no in the language the questions are written in, or let a host give questions in two languages. **S**
4. **Month view at the end of a month:** on 29 September the calendar shows a full month of greyed past days, with two available days at the bottom (`bk-type-ines_moreau_project_call.png`). Fix: a rolling view starting on the current week (Calendly shows the next available days). **S**
5. **"Too fast" refusal:** the anti-bot check refuses a booking confirmed within 3 s of picking the time (`bk-fail2.png`: "That was very fast. Wait a few seconds and send again."). A returning visitor with autofill hits it. Fix: wait silently server-side for the remaining seconds instead of refusing. **S**
6. The hours editor has no "copy Monday to all weekdays", and each range uses two 96-option selects. Fix: a copy button; typed time inputs with 15-minute steps. **S**
7. There are no limits per week or month and no limit across all of a host's types. Calendly users cap "max 4 demos a day across types". **S–M**

## Bugs (with steps)

1. See Minor 2 (capitalised French month names on `/chest/hours` days-off list). This is a formatting bug, not a style choice.
2. Stranger, phone: open `/ines-moreau/project-call`, tap 30, tap 10:00, fill the name and email, choose "A home", confirm within 3 s → refused "That was very fast". The same flow with a 3.5 s pause → booked, `/b/<secret>?new=1&mailed=1` (Minor 5).
3. Otherwise the loop worked: the booking was created, the bell told Inès in French with her time (14:00 Paris for 12:00 UTC), and it appears on her agenda.

## Migration in / out

- **In:** nothing (Major 8). Event types and hours are re-created by hand (quick: about 3 minutes per host).
- **Out:** a bookings CSV with the answers, and an ICS feed. Enough.

## UX notes

- Visitor side on a phone: the best public page of the four tools. Big touch targets, the time zone explicit, questions as chips, a plain privacy line, a clear confirmation with *Add to my calendar / Copy this page's link / Change the time / Cancel the booking*.
- Host side: "Votre page de rendez-vous" as a ticket with *Copier le lien* is the right first action (`bk-agenda-phone-ines.png`). The agenda groups by day with "Aujourd'hui / Demain" and a "Déplacé" badge.
- A no-role member sees "You can't use Booking yet… Ask an administrator" in plain words.
- Speed: 0.7–0.75 s per page.
- Trust: the no-overlap guarantee is in the database (exclusion constraint), and retention and guest erasure exist. A host leaving is handled (the page closes, bookings stay for an admin).

## Fix plan (ordered)

1. "Block a time" (hour-level) and a week view with blocks. **S–M**
2. Embeddable page (`frame-ancestors` setting + snippet); friendly time-zone picker; French date casing; rolling date view; silent "too fast". **S**
3. Per-booking video link (unique Jitsi-style URL option; warning on shared links). **S**
4. The host books on behalf of a customer, and the host reschedules. **M**
5. SDK: declared outbound + schedules → fetch the host's secret ICS every 10 min for busy times (first step of calendar sync). **M–L**
6. Team types: round robin + collective. **L**
7. Calendly CSV import of upcoming events. **M**
8. Payment-link field; limits per week and across types. **S–M**
9. Full OAuth free/busy (Google/Microsoft) in the SDK. **L**


## October 2026: after the move to the new stack

_Added 6 October 2026 from Booking's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **140 → 78.7 MiB**;
  image 461 → 31 MiB; first members' page 679 →
  369 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: public writes counted only once valid, bookings and changes apart, per token and per link; a single-use two-hour form; unique calendar UIDs; today/tomorrow reminders; blocks serialised with bookings; a short cache on the slots (`92bb7dc`); the per-link cap moved to the package's per-subject budget (20 changes a day, `7ebaeea`). 113 tests on PGlite and PostgreSQL (`17861d4`).
- **Pending**: Nothing listed as pending in its commits.

**Verdict, updated.** Custom domains now exist on the Chest (brief/08): the booking pages can live at `book.<company>.com`, and the links it writes follow `chest.tool.publicUrl` (`src/lib/public-origin.ts`). That was one of the platform gaps the summary named for Booking; what remains is email (confirmations and reminders), the host's own calendar, and the website embed (the frame code is built, and every Chest refuses it: `frame-ancestors 'none'`). **Cancel tomorrow: unchanged** — individual pages yes on the proposals, not yet on today's Chest.
