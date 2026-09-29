# Rooms (Salles): severe critique, round 3 (vs Robin, deskbird, Google/Outlook room resources)

Critic run: 2026-09-29, from 22:30 to 23:00 Paris time. The late hour matters for "today" defaults. Port 11500.

**Setup.** `npm run build`, then `dev.mjs --prod --reset` and `--prod --reset --empty`. My own Playwright scripts and screenshots are in `critique3/c3/` (`r*.mjs`, `shots/r-*.png`).

**Who I used it as:**
- Hugo (member, EN), Inès (member, FR), Sofia (member with a desk given to her), Camille (admin, FR) and Nora (no role);
- at 390 px and in dark mode;
- in the Chest look, the Café du Port brand in dark on a phone, and the Atelier Martin brand in dark;
- with the keyboard.

**Real-life scenarios:**
- switching day: importing an Outlook `.ics` export of the Atlas room;
- a desk holder working remotely, whose desk is lent, who then comes back;
- a manager booking a room on a phone;
- a new company's first visit.

No console errors, no 5xx and no page-level sideways scroll.

## Verdict

**Can a 50-person French company cancel deskbird or Robin tomorrow?**

| Part | Answer | Why |
|---|---|---|
| Desks and presence | **Yes on the studio's proposals.** On today's Chest: nearly | Team chips and team-only areas need `groups`. The calendar feed and check-in need `calendar` and `schedules`. |
| Meeting rooms (Google Workspace or Microsoft 365 company) | **Still no** | Bookings made in Outlook or Google after switching day never arrive, so there are two places to book one room. |

| Score | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 5 | 7 | **7.5** (switching-day import, example office, keys for names) |
| UX | 7 | 8 | **8** (the new points below cancel the gains) |

Strength, one line: the switching-day import is honest. It previews line by line, uses the database's own conflicts, keeps weekly series weekly, and is one Undo away.

## Round-2 top fixes and blockers

| Round-2 item | Now | Checked how |
|---|---|---|
| Top 1: import future bookings (`.ics`) | **Fixed, with one real gap** | I built an Outlook-style `.ics` (Windows zone "Romance Standard Time", weekly series with UNTIL, an EXDATE, a moved occurrence by RECURRENCE-ID, a two-weekly COUNT series, an all-day event, an outside organiser, a clash). The preview was right: the weekly series stays one series; the moved occurrence lands on 13 Oct 14:00; the clashes and the all-day event are listed as "non importé"; 16 bookings came in with guests matched and Undo offered. **The gap:** the organiser `CN="Martin, Camille"`, Outlook's usual "Last, First" form in Exchange companies, was not matched to Camille Martin, although the `mailto:` was there. It fell back to "à votre nom". See N1. |
| Top 2a: occupancy chart | **Fixed** | "Moyenne depuis le 28 septembre". A weekday with no data says "Pas encore de données", not 0. The French plural is correct ("4 personnes"). |
| Top 2b: seeded floors and areas as keys | **Fixed** | French screens read "Rez-de-chaussée", "Espace ouvert", "Zone calme". The flow checks it on the example. |
| Top 3a: admin booking dialog | **Mostly fixed** | Room first, then the kit's DateField ("Today / Tomorrow" and the date written out). "For" is behind "Book it for someone else" (code and the member's dialog). **Left:** tapping a free range such as "07:00–14:30" on a phone opens 07:00–08:00. See N2. |
| Top 3b: "Start with an example" | **Fixed** | Empty tool as Camille: "Créer le site" and "Commencer avec un exemple". The empty flow also checks Undo and "Delete the example". |
| Blocker: two-way Google/Outlook room resources | **Not fixed** (platform) | The README says so. |
| Blocker: visitors, office-manager role | **Not fixed** | Only admins book for others, and only for people who have Rooms. |
| Store §2: icon-only Places tiles (N4) | **Fixed** | Places tiles read "Screen · Quiet +1". |
| Store: tool pattern in brand mode (N6) | **Fixed** | With the Café du Port brand (dark, phone) the drafting grid steps aside and the page is the brand's. The Chest look is clean. |

## Still blocking (what a deskbird or Robin customer misses every week)

1. **Rooms booked in Outlook or Google after switching day.** The import is a one-shot. Every new client meeting created in Outlook with "Add room" still goes to the Exchange room resource, so the two systems drift from day 2. This needs a platform room-resources connector (OAuth held by the Chest). It is not in the SDK working copy, not even as a design.
2. **Visitors and reception.** A client visit cannot be booked for a person without a Chest account. There is no visitor list for the front desk, no host alert "your visitor is here", and no badge. Robin and deskbird sell this weekly.
3. **No office-manager role.** Only admins can book for others. In a 50-person company the office manager is rarely a Chest admin.
4. **On today's Chest,** team chips, team-only areas, calendar feeds, reminders and check-in are all proposals (`groups`, `calendar`, `schedules`). Only the `.ics` downloads work.
5. **No floor-plan image** (deskbird's map is how people pick "near the window by Léa"), no parking, no door tablet.

## New problems (round 3)

- **N1: Outlook organisers are not matched (bug).**
  - Steps: Places → Réservations déjà faites → Atlas → an `.ics` with `ORGANIZER;CN="Martin, Camille":mailto:camille@example.test`.
  - The preview says "à votre nom : Martin, Camille n'utilise pas Salles".
  - Exchange writes CN as "Last, First" by default in many French companies, so every imported meeting becomes the importing admin's. The admin then gets the reminders, check-in duty and cancellations for 100 meetings.
  - Fix: try "Last, First" as well as "First Last", and match `mailto:` to the member's email when the Chest gives it. Reading emails needs `members.email`, and switching day is a good reason to ask for it.
- **N2: a phone tap on a free range starts at the range's first minute.**
  - Steps: Hugo, 390 px, `/chest/rooms?day=2026-10-01`, tap Bora "07:00–14:30". The dialog opens at 07:00–08:00. One more tap on "Book" and he holds a 7 a.m. room.
  - "Find a free room" on the same screen defaults to 09:00, so the two entry points disagree.
  - Fix: when the free range contains the "Find" time, or the next round hour after 08:00, start there.
- **N3: presence and meetings contradict each other, silently.**
  - Hugo is "Remote" today but is a guest of the 10:00 "Client workshop" in Atlas. He is "Off" on Friday 2 Oct but invited to "Friday drinks" in Atlas. Sofia says "Remote" on Thu 8 Oct while invited to "Budget 2027" in Atlas.
  - My week shows both side by side with no hint. The headcount "4 people at the office" excludes the guests, so the office manager under-plans catering and desks.
  - deskbird flags this. Fix: a one-line hint on the day card ("You have a meeting in Atlas at 10:00: at the office?") with a one-tap "Office".
- **N4: keyboard. The desk plan is still 27 Tab stops away** (round 1 said 25+).
  - Skip link, nav, 11 day buttons, "Another day…", the part-of-day group, Plan/List and 5 filters come before the first desk.
  - The day strip should be one radio group (arrows), as the Office/Remote/Off buttons now are.
- **N5: phone "Find a free room".** The equipment chips row is cut at the right edge ("Whiteboard" half visible, "Phone" hidden at 461 px) with no scroll hint. So is the day strip ("TUE 6" cut). This is store rule §2 "filter rows wrap or show a scroll affordance". Wrap the chips.
- **N6: when a desk holder comes back, the borrower is not told** (coherence).
  - Steps: Sofia (desk D-12 given) says Remote on Thu 8 Oct, Léa books D-12, Sofia switches back to Office.
  - Sofia is told "Your desk D-12 is lent to Léa Dubois that day: choose another one". That is right.
  - But Léa hears nothing, and Sofia cannot ask for it back. A one-tap "Ask Léa to swap" (bell) would close it.
- **N7: an empty office blocks presence.** Before an admin creates a site, members get "Pas encore de site" and cannot even say Remote or Office. A company that only wants "who's in on Thursday" (a common first use of deskbird) must first model floors. Allow presence with no office.
- **N8: wording.**
  - The calendar event says "Au bureau · poste D-01" while every screen says "Bureau D-01". The glossary should pick one ("bureau" is ambiguous in French between office and desk; "poste" is clearer, so pick it everywhere).
  - Title and primary button are both "Réserver une salle" on the rooms page.
  - After 20:00 the rooms page jumps to tomorrow. That is sensible, but the header still highlights "AUJOURD'HUI 29" in the strip and nothing says why today is skipped.

## Platform-dependent

- Room-resources connector for Google Workspace and Microsoft 365 (free/busy and resource booking, OAuth held by the Chest). This is the only thing that turns "meeting rooms: no" into "yes". It is not designed in `sdk/`. Write it into the SDK report as a proposal with its fake.
- `groups` (§4.12), `calendar` (§4.11), `schedules` (§4.1), `mail.send` (§4.2), and events between tools from Leave (§4.4) must ship.
- `members.email` for matching imports by address (exists as a permission; Rooms does not ask).
- A higher calendar quota or self-expiring events (README: 5,000 per tool is about 6 weeks at 200 people).
- Guests without accounts (a visitor record, a host alert) need nothing new from the platform except `mail` to the visitor. It is tool work.

## Top 3 fixes now

1. **Switching day that works for Outlook companies (S).** Match organisers and guests on "Last, First" and on `mailto:` (ask `members.email`). Show in the preview how many bookings fall back to the admin, before import.
2. **Presence that agrees with meetings (S/M).**
   - A day card hint when I am Remote or Off but invited in a room, with one-tap "Office".
   - Count guests of room bookings in "people at the office".
   - Let members say Remote or Office before any office exists.
3. **Visitors and a delegate role (M).**
   - An "office manager" role that books for others.
   - "Book for a visitor" (name, company, host).
   - Today's visitors list for reception, with the host told in the bell on arrival.
   - Plus the phone polish: free-range default start (N2), wrapping chips (N5), the day strip as one Tab stop (N4).
