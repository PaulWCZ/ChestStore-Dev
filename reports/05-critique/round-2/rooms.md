# Rooms — severe critique, round 2 (vs Robin, deskbird, Google Calendar / Outlook room resources)

Critic run: 2026-09-29, port 7400. Setup: `npm run build`, then `dev.mjs --prod --reset` (sample office) and `--prod --reset --empty` (first visit). `flows/rooms.mjs` passes 21 of 21. On top of it I drove the tool with my own Playwright scripts (`critique2/rest/shoot.mjs`, `r2.mjs`, `r3.mjs`). Screenshots are `critique2/rest/shots/r-*.png`.

Who I used it as:
- Hugo (member, EN), Inès (member, FR), Camille (admin, FR) and Nora (no role);
- at 390 px and in dark mode;
- with the keyboard;
- in five looks from the harness Look panel: Chest, the sample brand in dark, High contrast in dark on a phone, Confetti in dark, and Newsprint for this tool only.

## Verdict

**Can a 50-person French company cancel deskbird or Robin tomorrow? Not yet.**
- **For desks and presence alone:** almost. Two conditions:
  - the Chest runs `calendar`, `groups` and `schedules`, which are still studio proposals;
  - the company accepts Chest calendar feeds instead of real room resources.
- **For meeting rooms:** no, in any Google Workspace or Microsoft 365 company. A room booked in Outlook or Google never reaches Rooms. So the company keeps two places to book a room, and the double-booking risk that comes with them.

| Score | Round 1 | Round 2 | Why |
|---|---|---|---|
| Completeness | 5 | **7** | The round-1 gaps are mostly closed: usual week, find a free room, team view, lent desks, booking for someone else, rooms kept for a team, Google CSV import, check-in, occupancy. Still missing: two-way calendar sync, importing future bookings, floor-plan image, visitors, parking. |
| UX | 7 | **8** | The desk flow is still the fastest in the store. Keyboard, dirty-form guard, out-of-window days and the phone hint are all fixed. What costs points: a misleading occupancy chart, an admin dialog that starts with the rare field, and English seed names on French screens. |

Strength, one line: "Office" in one tap on My week, with the desk offered, the team's faces and the usual week filling itself. That is better than deskbird's home screen.

## Round-1 findings

| # | Round 1 | Now | Checked how |
|---|---|---|---|
| B1 | No calendar bridge | **Partly** | `.ics` per booking and "Add my bookings to my calendar" are on My week (seen). The per-member feed is a `calendar` proposal (flow step passes in the harness). No two-way sync with Google or Outlook room resources (README says so). |
| B2 | No recurring presence | **Fixed** | "My usual week" is on My week (seen). Coming days are filled (flow step "my usual week"). |
| B3 | Can't find a room by need | **Fixed** | "Find a free room" (people, at, for, equipment) lists the free rooms (seen, FR and EN). The flow books from it. |
| 4 | No team view | **Fixed, platform-dependent** | Team chips pass in the flow. They need the `groups` proposal, so a real Chest today has none. |
| 5 | Desks beyond the window look bookable | **Fixed** | `/chest/desks?day=2026-10-23` shows "Not open yet" on every tile, plus "it opens on Friday 2 October" (r-desks-far.png). |
| 6 | Equipment icon-only | **Partly** | The booking tiles now say "Screen · Quiet +1". The admin **Places** tiles still show bare 12 px glyphs (r-places.png). |
| 7 | Phone hint mentions a grid | **Fixed** | The phone says "Tap a free time to book it." (screens + flow). |
| 8 | Backdrop and Escape lose the form | **Fixed** | Escape on a changed form opens "Discard your changes? / Keep editing" inside the dialog (r-esc-dirty.png). |
| 9 | Given desks dead when the owner is away | **Fixed (claimed)** | The strings and README are there ("lent to Léa that day"). I did not replay it by hand. |
| 10 | Booking for someone else | **Fixed** | The admin's dialog has a "For" people picker (seen). Admins only: there is no office-manager role. |
| 11 | Rooms or areas for a group | **Fixed, platform-dependent** | Places has a "Reserved for" select per area (seen). It needs `groups`. |
| 12 | Import | **Fixed (rooms and desk holders)** | Google Workspace CSV and "who has which desk" (flow step passes). **Future bookings are not imported** (see "Still blocking"). |
| 13 | Check-in and no-show release | **Built on a proposal** | Off by default. There is a Rules checkbox. It needs `schedules`. |
| 14 | Occupancy is CSV only | **Fixed, but wrong** | There is now a bar per weekday, but it misleads (new bug N1). |
| 15 | Two date controls | **Fixed** | One "Another day…" button next to the strip. |
| 17 | Floor delete was a bare trash icon | **Fixed** | The button now reads "Supprimer cet étage". |
| 19 | Placeholders read like values | **Not fixed** | The empty Places form still shows "Paris — Rue de Paradis" and "12 rue de Paradis, 75010 P…" as grey placeholders (r-empty-places.png). |
| 20 | Rules labels with "…" blanks | **Fixed** | Now "Combien de jours à l'avance on peut réserver [21]". |
| 21 | Avatar stacks crop initials | **Fixed** | Three faces plus "+2". |
| 22 | Tab order and 3 stops per day | **Fixed** | One radio group per day. On today's card the buttons come before the links (keyboard log, `r2.mjs`). |
| 24 | Empty rooms page has no admin button | **Fixed** | "Créer le site" shows for an admin. |
| Bug B1 | New desks sorted first | **Fixed** | D-13 to D-16 now come after D-12 (r-places.png). |
| Bug B4 | Moving the start collapses the length | **Fixed** | From 12:00 gives To 12:30. After 13:00–13:30, moving the start to 14:00 gives 15:30 (`r2.mjs`). |
| Bug B5 | Title cut silently | **Fixed** | A counter shows "120/120". |
| Store §2.11 | Seed data in one language | **Not fixed** | See N3. |

## Still blocking (what a deskbird or Robin customer misses every week)

1. **Rooms booked in Outlook or Google Calendar are invisible, and the other way round.**
   - The Monday stand-up lives in the calendar invite. Rooms only publishes a feed, which Google refreshes every few hours.
   - Rooms reads nothing back, so the same room can be booked in both places.
   - The fix needs the platform: a room-resources connector (OAuth held by the Chest, Google Calendar API and Microsoft Graph). The README states this honestly. It is still the thing that stops "cancel".
2. **Switching day: future bookings are not imported.** Every recurring meeting must be retyped by hand, and until then both systems hold different truths.
3. **On a real Chest today, three advertised features do not run:** team chips and team-only rooms (`groups`), calendar feeds (`calendar`), and reminders and check-in (`schedules`). They are all studio proposals. Only the `.ics` downloads work everywhere.
4. **Visitors and booking by an office manager.** Only admins can book for someone, and never for a person without a Chest account (a candidate, a client). deskbird and Robin have guest invitations.

## New problems this round

- **N1: the occupancy chart lies for months after launch.**
  - Steps: sample office, `/chest/places/export`.
  - It shows "Lundi 0,5 personnes", "Mardi … Vendredi 0 personnes". Yet My week shows 4 to 6 people at the office every day this week.
  - Cause: it averages over 8 weeks, including the 7 weeks before any booking existed.
  - "0,5 personnes" is also a wrong French plural ("0,5 personne").
  - Fix (S): average only over the weeks since the first presence, and say "since 28 Sept" under the chart.
- **N2: the admin's booking dialog starts with its rarest field.**
  - The "For: Type a name" people picker comes first and takes the focus. Booking for someone else is maybe 5 % of an admin's bookings.
  - The Day select lists about 66 days (admins are exempt from the window), a very long `<select>` for picking a date.
  - Opened from "Book a room" on a future day, the slot defaults to 07:00–07:30.
  - Fix (S): put Room and time first and "For someone else" as a link under them. Use the kit's DateField for the day. Default to the next round hour (or 09:00 on a future day).
- **N3: seed names stay English on French screens.** Camille (FR) reads "Ground floor / First floor / Second floor", "Quiet zone" and "Open space" in the grid headers, desk plan and Places (r-rooms-camille.png, r-places.png). The store rule (§2.11) says defaults are keys until renamed. Fix (S): make the seeded floors and areas translation keys, or seed them in the Chest's language.
- **N4: Places desk tiles are icon-only** (Round-1 item 6, admin side). Fix (S): reuse the booking tiles' words.
- **N5: no "Start with an example"** on the empty tool. It takes 8 admin actions to get a usable office. The glossary makes an example the empty state's second action, and Status and Tasks have one. Fix (S): a one-click sample (2 floors, 3 rooms, 12 desks) that says it is an example.
- **N6 (looks): the Blueprint graph-paper grid shows in every look.** It appears under the sample brand, Confetti dark and High contrast (r-rooms-brand-dark.png, r-desks-confetti-dark.png, r-week-hc-dark-phone.png).
  - In the brand look the page is Atelier Martin's green and serif on Rooms' drafting paper. That is not "the company's own look".
  - Nothing was unreadable: tiles, stripes for taken desks and the red "now" line all stayed legible in all five looks.
- **N7: default start time.** The "Find a free room" "At" default follows the clock (17:00 at 17:11). That is fine for today but not for a future day.

No console errors, 4xx/5xx or sideways scroll on any page I opened. Page loads were 0.8–1.8 s with polling (networkidle).

## Platform-dependent (only the Chest or SDK can unblock)

- Two-way room resources with Google and Microsoft: not in the SDK report as a built proposal. It is named as "Would help" in the README and belongs in §4.16 or the platform list.
- `calendar` (SDK report §4.11), `groups` (§4.12), `schedules` (§4.1) and `mail.send` (§4.2) must ship on the real Chest. Without them, team views, feeds, reminders and check-in are studio-only.
- Tool events from Leave (§4.4), for "on leave, so Off, so the desk is lent".
- A higher calendar quota or self-expiring events: 5,000 per tool is about 6 weeks of desk days at 200 people.

## Top 3 fixes now

1. **Import future bookings, and make switching day safe (M).**
   - Accept an `.ics` export of each room calendar (Google and Outlook both export one). Recreate weekly series as weekly bookings.
   - Flag conflicts line by line.
   - Together with the platform room-resources connector, this is what makes "stop booking rooms in Outlook" possible.
2. **Fix the occupancy chart (N1) and localise the seeded floors and areas (N3) (S).** A facilities manager judges the tool on that chart in week one.
3. **Rework the admin booking dialog (N2) and add "Start with an example" (N5) (S).** Room, day (DateField) and time come first. "For someone else" moves second. The default slot is sensible.
