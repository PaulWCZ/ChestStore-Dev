# Rooms — severe critique (vs Robin, deskbird, Google Calendar room resources)

Critic run: 2026-09-29, harness port 7400, `--prod --reset`, then with every place/booking table truncated for the empty state. Screenshots in `critique/rest/` (prefix `r-`). Members used: Hugo (member), Camille (admin), Inès (member, French), Nora (no role), phone 390 px, dark, keyboard.

## Verdict

**Can a 50-person company cancel deskbird/Robin tomorrow? Not yet. Can it stop booking rooms in Google Calendar/Outlook? No.** The desk + presence half is genuinely good (one tap "Office", desk offered, Postgres-proof no double booking, undo everywhere). The room half is an island: a room booked here never reaches anyone's calendar, and a room booked in the company calendar never reaches here. In a company on Google Workspace or Microsoft 365 (nearly all of them), room booking *is* part of creating the meeting invite, and it is free. That makes Rooms a second place to book rooms — the worst outcome.

- **Completeness: 5/10** — desk-day core is complete; calendar integration, recurring presence, team views, floor map, check-in and parking/resources are missing.
- **UX: 7/10** — fastest desk flow in the store; clean empty states; but icon-only equipment, beyond-limit desks that look bookable, 25+ Tab stops before the first desk, and a room grid with no keyboard slot selection.

Strength, one line: "My week" answers "who's in Thursday and where do I sit" in one screen, and the `tstzrange` exclusion constraints make double-booking impossible.

## Blockers (a company cannot cancel the competitor without these)

1. **No calendar bridge at all (Google/Outlook/iCal).** Where: whole tool; README "What it does not do (yet)": "iCal feed, Outlook/Google room resources". Why: every meeting is created in a calendar; people will not book the room in a second tool and then create the invite in the first. Guests only get a Chest bell item, nothing in their calendar, so they forget. Google Workspace room resources cost nothing, so the pitch "cancel" has no money attached unless Rooms is *better* than the calendar. Fix: (S) an `.ics` download on each booking and on "Book" confirmation; (M) a per-member signed iCal feed of my desk days + my room bookings (needs the SDK "signed per-member URL" primitive the README already names — build it in `sdk/` with a fake); (L, later) a CalDAV/Graph read of room resources through a declared `network` host.
2. **No recurring presence ("I'm in every Tuesday and Thursday").** Where: My week (`app/chest/week-view.tsx`); no "usual week" in `lib/i18n/en.ts`. deskbird and Robin both let people set a default office schedule; hybrid policies are weekly patterns. Today a person taps 2 × 52 times a year and the "who's in" counts are empty unless everyone does. Fix (M): "My usual week" (per weekday: Office/Remote/Off + optional usual desk), applied lazily when a day enters the booking window (no cron needed: fill on read, like the purge), overridable per day.
3. **Room bookings cannot be found by need ("a room for 6, free now/at 14:00").** Where: `/chest/rooms` is a single-day grid only; filters exist for desks but not rooms. Robin/Google: "find a room" by capacity/equipment/time. Fix (M): above the grid, "Free now" and a "When / how many people" search that highlights matching free rooms; show rooms too small in grey.

## Major (people complain within a week)

4. **No team view in "Who's where".** Where: `/chest/people`: a flat list grouped by status, search by name only (`r-people-lea.png`). "Is my team in on Thursday?" is the #1 question deskbird answers (favourites/teams). At 50–200 people the flat list is useless. Fix (S): chips by Chest group (Sales, Tech…) + "my favourites"; on My week, show my team's faces first.
5. **Desks beyond the booking window look bookable.** Repro: as Hugo open `/chest/desks?day=2026-10-21` (22 days ahead, limit 14): every desk says "Free / Book it"; clicking gives the toast "You can book up to 14 days ahead." (`r-desks-beyond.png`). Fix (S): render the day as read-only with one line "Opens for booking on <date>", desks not clickable; same on the day strip (grey the days out of range).
6. **Equipment is icon-only.** Where: desk tiles and room headers (`r-desks-phone.png`, `r-desks-dark.png`): screen / dock / window / quiet / standing are 12 px glyphs without words; the 58-year-old accountant cannot decode "speaker with a cross" = quiet. Fix (S): words in the list view and in a tooltip + `aria-label`; on tiles show at most two words ("Screen · Window").
7. **Mobile room booking copy is wrong and the phone grid has no drag.** Where: `/chest/rooms` at 390 px (`docs/screens/rooms-phone.png`): the hint "Click or drag on the grid to book a slot." is shown although the phone shows a list, not a grid. Fix (S): phone hint "Tap a free time to book it."
8. **Backdrop click closes the booking dialog and loses what was typed** (title, guests). Where: `components/dialog.tsx` (`onClick` on the backdrop → `onClose`). A stray tap on a phone throws away the form — contradicts "nothing is lost by a misclick". Fix (S): no backdrop close when the form is dirty; or keep the draft in state and reopen with it.
9. **Given desks are dead when their owner is away.** README admits it. Sofia's D-12 stays unbookable on days she is Off/Remote; with Leave linked, the tool even knows she is away. deskbird releases assigned desks automatically. Fix (M): a given desk is offered to others on days its owner said Remote/Off (owner can opt out).
10. **No booking for someone else** (assistant books for the boss, office manager books for a visitor/new hire). Robin/deskbird have it; the README lists it as missing. Fix (M): admins (and a new "office manager" role) pick a person in the booking dialog; the person is told in the bell.
11. **No rooms/areas reserved to a group** (e.g. "Sales pod", "Board room: managers only"). Fix (M): optional Chest group per room/area, enforced in the same transaction.
12. **Import promised in research, not built.** `reports/02-open-source/rooms.md` rates "Import rooms from Google Workspace resource CSV" **MVP**; README says not done ("setting up an office takes minutes"). For 3 rooms true; for 2 floors × 60 desks with assignments it is not. Fix (S/M): CSV import of rooms (Google Admin columns) and desk assignments (desk, person email → member).
13. **No check-in / no-show release and no reminder.** Robin's core room-hygiene feature (ghost meetings). Needs `schedules` (already a studio proposal): release a room 15 min after start if nobody tapped "I'm here". Fix (M) once schedules ship; until then say it in README (done) and in the admin Rules page (not said there).
14. **Occupancy analytics are CSV only.** Admins asked "how full is the office on Fridays" get a CSV (`/chest/places/export`). deskbird shows a chart. Fix (S): an aggregated per-weekday bar on the Export tab (counts only, GDPR-safe).

## Minor

15. Day strip shows 11 weekdays plus a native date input plus an "Another day" button — two controls for one job, and the native field shows the browser's format, not the app's (`r-rooms-fr.png`: French UI, `09/29/2026` field in this harness). Fix: keep the strip; replace input+button with one "Other date…" button opening a small calendar.
16. Admin sees a 21-day strip, members 14 (admins exempt) — fine, but nothing tells the admin their view differs from the team's.
17. Floor "Remove" is a trash icon with no text (`Remove · Ground floor` only in the accessible name); the room and office use text buttons. Pick one.
18. "4 desks added." toast has no Undo while every other change has one.
19. Adding a floor: the placeholder "Ground floor" reads like an existing value (`r-setup-floor.png`); clicking "Add a floor" empty only shows the browser's bubble.
20. Rules page labels "Book up to … days ahead", "A weekly booking lasts at most … weeks" — ellipsis-as-blank is not plain language. Use "How many days ahead people can book: [14]".
21. Avatar stacks crop the initials of all but the last face (`docs/screens/week-fr-phone.png`: "CI", "HE", "SF"). Show 3 faces + "+2".
22. On My week, Tab order visits "4 people at the office" and each meeting link **before** the day's Office/Remote/Off buttons, the main action (keyboard log in critique notes). Put the three buttons first; make them one radio group (arrow keys, one Tab stop) instead of three Tab stops × 10 days.
23. English "Sept" abbreviation next to "Oct" (British style, fine) but French "sept." / "oct." in the strip is fine; English "TODAY 29 Sept" and French "AUJOURD'HUI" overflow the tile at 390 px in French (`week-fr-phone.png` — OK now but tight).
24. Empty rooms page for an **admin** says "An admin adds meeting rooms in Places." with no button; give admins the "Set up the office" button there too (it exists only on My week).

## Bugs (steps to reproduce)

- **B1 – New desks sort before existing desks in an area.** `lib/places.ts` `addDesks` sets `position = count(desks in area) + i`, but positions are ordered globally per office (seed: Quiet zone desks are 8–11). Repro: seeded office, Places → Quiet zone → Add desks (4): the plan shows D-13, D-14, D-15, D-16, D-09, D-10… (visible in `docs/screens/desks-desktop.png`). Fix: `coalesce(max(position), -1) + 1 + i` for the area.
- **B2 – Beyond-limit day renders bookable desks** (see Major 5).
- **B3 – Phone hint mentions a grid that is not there** (Major 7).
- **B4 – Changing "From" collapses the duration.** Booking dialog: default 07:00–07:30; set From = 12:00 → To becomes 12:15 (not 12:30). Keep the chosen duration when moving the start.
- **B5 – A 300-character title is silently cut to 120** (`maxLength={120}` in `rooms-view.tsx`) — acceptable, but the field gives no counter.

## Migration in / out

- **In:** nothing. No CSV of rooms (Google Workspace resources export), no desk assignments from deskbird/Robin, no future bookings. The research marked the Google CSV import MVP. Past bookings do not matter; **future recurring room bookings do** (the Monday stand-up for the next 12 weeks) — without them, switching day creates double bookings between the old and new system.
- **Out:** admins export bookings and occupancy CSV. A member cannot export their own data (GDPR access right) — they can see it on screen only. Fix: "Download my bookings" on My week.

## UX notes

- First minute (member): excellent — one tap Office, one tap Book D-02. First minute (admin, empty): 8 actions to a usable office (office → floor → room → area → Add desks), measured; clear, no dead end. The CSE note for 50+ employees is a good touch.
- The room grid is keyboard-reachable only through "Book a room"; empty slots are not focusable — acceptable because the button path works, but the grid block buttons (existing bookings) come after the entire date strip (≈20 Tab stops).
- Page loads measured at 0.8–1.5 s on the harness with polling; no spinners.
- French is natural ("Libérer ce bureau", "Qui est où", "Télétravail").
- Trust: every destructive action has Undo; admin deletions say how many bookings were cancelled; the leaving member's bookings are cancelled and guests told. Good.

## Fix plan (ordered)

1. `.ics` on every room booking + "Add to calendar" in the toast (S). Per-member iCal feed via an SDK signed-URL proposal (M).
2. "My usual week" with lazy fill (M).
3. Find a free room by size/time + "Free now" (M).
4. Team/group chips and favourites in Who's where and My week (S).
5. Out-of-window days read-only (S); icon words (S); phone hint (S); dirty-dialog backdrop guard (S); desk position bug B1 (S).
6. Release given desks when the owner is away (M); book for someone else (M); group-reserved rooms/areas (M).
7. Rooms/desk-assignment CSV import (S/M); "Download my bookings" (S).
8. Check-in + no-show release + "starts in 10 min" bell, once `schedules` ships (M).
9. Occupancy per weekday chart (S).


## October 2026: after the move to the new stack

_Added 6 October 2026 from Rooms's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-hono`; PSS of the
  server's process tree at rest, median of 5): **119.2 → 65.2 MiB**;
  image 461 → 31 MiB; first members' page 785 →
  472 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: My week writes nothing and answers 304; the change stamp moves only when a row changes (row triggers); "I'm here" by the reader's clock; a check-in on a room just freed says it was released; reminders marked once the bell took them; changing a weekly booking changes this one and the next; the usual week booked under the desk's group check and the desk-day lock; visitors kept 30 days by a rule (`11bb094`). The occupancy bar drawn as an SVG (no `style` attribute on a policy that forbids it, `0a4006e`).
- **Pending**: Nothing listed as pending in its commits.
