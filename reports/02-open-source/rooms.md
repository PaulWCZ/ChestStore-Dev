# Rooms — open-source research
_Read on 2026-09-28. Replaces: Robin, deskbird, Joan, Skedda, Google Workspace / Outlook room resources._

## The job
Employees open the tool to answer two questions: "where do I sit on Thursday?" and "is the small
meeting room free at 2 pm?". They book a desk or a room for a day or a time slot, cancel it, and
see which colleagues are in the office which day so they can come in together. An office manager
sets up the floors, rooms and desks once and changes a few rules (how far ahead, how many at once).

## Projects

### Seatsurfing
| Field | Content |
|---|---|
| Project | Seatsurfing — https://github.com/seatsurfing/seatsurfing — ~316 stars (GitHub search API, 2026-09-28); v1.131.1, 2026-09-27 (releases page); very active (several releases a week) |
| Licence | GPL-3.0 (LICENSE file: https://github.com/seatsurfing/seatsurfing/blob/main/LICENSE; README says "GPL 3.0", "or later" not verified) |
| Reuse | **Ideas only** |
| Stack | Go REST API, TypeScript/React PWAs (booking UI + admin UI), PostgreSQL. Data model transposes directly to Node + Postgres |
| What it does best | Desks and rooms in one model ("spaces" on a location with a floor-plan image); booking rules per location: max concurrent bookings per user, max days in advance, max booking duration, "no cancel less than N hours before", auto-delete of past bookings after N days; admins may be exempt from limits; PWA installable on phones; Teams integration (per README) |
| What to avoid | Rules and limits have subtle bugs: booking allowed beyond "max days in advance" with multi-day durations (https://github.com/seatsurfing/seatsurfing/issues/2658), timezone handling on "booking in the past" (https://github.com/seatsurfing/seatsurfing/issues/2557), DST issue (https://github.com/seatsurfing/seatsurfing/issues/647), race condition on per-user limits fixed in PR https://github.com/seatsurfing/seatsurfing/pull/2632. Group-restricted spaces requested and unanswered (https://github.com/seatsurfing/seatsurfing/issues/557). Lesson: enforce limits in one Postgres transaction, store times with zone, test DST |

### WARP (Workspace Autonomous Reservation Program)
| Field | Content |
|---|---|
| Project | WARP — https://github.com/sebo-b/warp — ~173 stars (GitHub search API); no GitHub releases read; last commit 2026-07-10 (commits feed); maintained by one person |
| Licence | MIT (https://github.com/sebo-b/warp/blob/main/LICENSE, "Copyright 2022 Sebastian Baberowski") |
| Reuse | **Code** (with attribution) |
| Stack | Python 3 / Flask, PostgreSQL, JS front end compiled with Node. Schema and rules transpose to Node + Postgres |
| What it does best | Hybrid-office specific: floor-map images with seats placed on them, zones that group seats and control who may book them, assigned (permanent) seats for a named person, disabled seats, a user may hold one seat per zone per time, "book for someone else", iCal feed, Excel export, EN/DE/FR/ES/PL, light/dark theme (README) |
| What to avoid | Zones + groups + roles model is powerful but admin-heavy; no rooms-by-time-slot concept (desk-day oriented) |

### LibreBooking (fork of Booked Scheduler)
| Field | Content |
|---|---|
| Project | LibreBooking — https://github.com/LibreBooking/librebooking — ~817 stars (GitHub search API); v5.3.0, 2026-08-03 (releases page); active |
| Licence | GPL-3.0 (https://github.com/LibreBooking/librebooking/blob/develop/LICENSE.md) |
| Reuse | **Ideas only** |
| Stack | PHP 8.2, MySQL/MariaDB, Bootstrap 5 — no direct transposition, only the model |
| What it does best | General resource scheduling: resources with schedules (bookable slots), approval workflow, quotas and credits, waitlist when full, recurring reservations, reminders, ICS feeds, reports on usage (README) |
| What to avoid | Built for labs, universities and equipment pools: quotas/credits/schedules layouts are far more than an office needs. Booked Scheduler itself went SaaS-only in 2020 (docs: https://librebooking.readthedocs.io/) |

### MRBS (Meeting Room Booking System)
| Field | Content |
|---|---|
| Project | MRBS — https://github.com/meeting-room-booking-system/mrbs-code — ~207 stars (GitHub search API); MRBS 1.12.2, 2026-05-26 (releases feed); 1,780 open issues (search API count includes the SourceForge-era backlog) |
| Licence | GPL-2.0 (LICENSE: https://github.com/meeting-room-booking-system/mrbs-code/blob/main/LICENSE, "supplied under the GNU GENERAL PUBLIC LICENSE, Version 2") |
| Reuse | **Ideas only** |
| Stack | PHP 7.2+, MySQL or PostgreSQL |
| What it does best | The classic room grid: areas → rooms, a day view with rooms as columns and time slots as rows, click an empty cell to book; repeat bookings; very quick to read |
| What to avoid | Dated look, table-based UI, no hot-desk / presence concept |

### Nextcloud Calendar resources
| Field | Content |
|---|---|
| Project | calendar_resource_management — https://github.com/nextcloud/calendar_resource_management — ~77 stars; with Nextcloud Calendar https://github.com/nextcloud/calendar (~1,189 stars) (GitHub search API) |
| Licence | AGPL-3.0 (COPYING: https://github.com/nextcloud/calendar_resource_management/blob/main/COPYING) |
| Reuse | **Ideas only** |
| Stack | PHP (Nextcloud app), CalDAV |
| What it does best | Rooms and resources as CalDAV "principals" with building, floor, capacity and features, so a room is invited to a meeting like a person and its free/busy is visible |
| What to avoid | Resources are created from the command line (no admin UI); rooms-as-attendees only makes sense with a full calendar/email stack we do not have |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Home screen "This week": 5 day columns, my booking per day, who from my team is in | MVP | deskbird/Robin, WARP | The daily answer in one glance; presence = desk booking or "I'll be in" without a desk |
| "I'll be in / remote / off" per day without booking a desk | MVP | deskbird | Many companies have no fixed desks rule, just want to know who comes |
| Book a desk for a day (whole day or morning/afternoon) | MVP | Seatsurfing, WARP | One tap on a free desk; half-days optional |
| Book a room for a time slot, room × hour grid for one day | MVP | MRBS | Rooms as columns, 15/30-min slots, click empty cell; show capacity |
| Conflict-proof booking (no double booking) | MVP | Seatsurfing PR #2632 | Postgres exclusion constraint on `tstzrange` per resource |
| My bookings: list, cancel | MVP | all | |
| Admin: offices → floors → rooms/desks (name, capacity, equipment tags) | MVP | Google resources (building/floor/capacity) | Plain list editing first |
| Rules: max days ahead, max bookings at once per person | MVP | Seatsurfing | Enforce server-side in the same transaction |
| Assigned (permanent) desks | MVP | WARP | Shown as "Anna's desk", released when Anna is off? → later |
| Floor-plan image with desks placed on it | later | WARP, Seatsurfing | Needs the Chest file API for the image; drag-and-drop placement (dnd-kit) |
| Restrict a room/desk zone to a group | later | WARP zones, Seatsurfing #557 | Groups come from the platform |
| Recurring bookings (every Monday) | later | LibreBooking, MRBS | RRULE via `rrule` lib; show generated occurrences |
| Check-in and auto-release of no-shows | later | Robin, Joan | **Needs SDK scheduled jobs** (release at 10:00 if not checked in) |
| Reminder / "your room starts in 10 min" | later | Robin | **Needs scheduled jobs + notifications** |
| iCal feed of my bookings | later | WARP, LibreBooking | Needs a per-member secret URL: design with SDK (signed link), not a cookie of our own |
| Invite a room to an Outlook/Google meeting | never | Google/Outlook resources | Requires calendar server integration + outbound network |
| Door tablets (Joan-style) | never | Joan | Hardware; a public read-only "room screen" page could come later |
| Import rooms from Google Workspace resource CSV | MVP | Google Admin bulk upload format | Columns: Calendar Resource Name, Type, Category, Capacity, Building ID, Floor, Floor Section, descriptions (https://xfanatical.com/blog/bulk-add-calendar-resources-in-google-workspace/, per search result, Google page blocked) |
| Import desk assignments from Robin / deskbird | later | Robin "Bulk assign seats via CSV", deskbird Excel export | deskbird exports Excel per office/booking/group/user, max 3 months, no meeting-room export (https://help.deskbird.com/hc/en-us/articles/10536191126673-Exports, per search result). Robin exports CSV by email (https://support.robinpowered.com/hc/en-us/articles/13462982338957-Exporting-workplace-data, per search result). Past bookings are rarely worth importing |
| Occupancy report (how many people per day per office) | later | Robin, deskbird | Aggregated counts only (see legal) |
| Visitor / guest booking | never | Robin | Different tool (reception) |

## Reusable pieces
- `rrule` 2.8.1 — BSD-3-Clause — https://github.com/jakubroztocil/rrule (npm registry, LICENCE file read) — recurring bookings.
- `date-fns` 4.4.0 — MIT (npm registry) — https://github.com/date-fns/date-fns — week/day arithmetic; use with `Intl` for FR/EN day names. Prefer storing `timestamptz` and computing in the office's IANA zone.
- `@dnd-kit/core` 6.3.1 — MIT (npm; LICENSE https://github.com/clauderic/dnd-kit) — placing desks on a floor plan (later).
- WARP (MIT) — its zone/seat schema and "one seat per zone per time" rule can be copied with attribution; we will more likely re-implement.
- PostgreSQL `btree_gist` + `EXCLUDE USING gist (resource_id WITH =, during WITH &&)` — built-in, no library: the correct anti-double-booking primitive.

## Legal and security notes
- **GDPR / presence data.** Who is in the office which day is personal data about work patterns. Keep it to the purpose (organising the office), show colleagues' presence only to members of the same company, no per-person attendance reports for managers in MVP; purge past bookings after a configurable period (Seatsurfing has the same "delete bookings older than N days" setting). Employees have a right of access to their data (CNIL: https://www.cnil.fr/fr/le-droit-dacces-des-salaries-leurs-donnees-et-aux-courriels-professionnels). Occupancy reports should be aggregated counts.
- **French labour law — CSE.** Moving to flex office is a change of working conditions: in companies of 50+ employees the CSE must be informed and consulted beforehand (Code du travail art. L2312-8; https://www.juritravail.com/Actualite/cse-votre-role-en-cas-de-demenagement-ou-de-reorganisation-des-locaux-de-travail/Id/263484, per search result). The tool does not create that obligation but the in-app help for admins should mention it.
- **Security.** Identity from `member(request)` only; "book for someone else" must be a role-checked action; limits and conflicts enforced server-side in one transaction; store member ids only.
- **Time zones / DST.** Real bugs in Seatsurfing (issues #647, #2557) — store `timestamptz`, keep the office's IANA zone, test the last Sunday of March/October.

## Sources
- https://github.com/seatsurfing/seatsurfing (README, LICENSE, releases, issues #557, #647, #2557, #2658, PR #2632)
- https://raw.githubusercontent.com/seatsurfing/seatsurfing/main/LICENSE
- https://github.com/sebo-b/warp (README), https://raw.githubusercontent.com/sebo-b/warp/main/LICENSE, https://github.com/sebo-b/warp/commits/main.atom
- https://github.com/LibreBooking/librebooking (README, releases), https://raw.githubusercontent.com/LibreBooking/librebooking/develop/LICENSE.md, https://librebooking.readthedocs.io/
- https://github.com/meeting-room-booking-system/mrbs-code (README), https://raw.githubusercontent.com/meeting-room-booking-system/mrbs-code/main/LICENSE, https://github.com/meeting-room-booking-system/mrbs-code/releases.atom
- https://github.com/nextcloud/calendar_resource_management, https://raw.githubusercontent.com/nextcloud/calendar_resource_management/main/COPYING, https://github.com/nextcloud/calendar
- https://xfanatical.com/blog/bulk-add-calendar-resources-in-google-workspace/ and https://support.google.com/a/answer/1033925 (via search result; direct fetch blocked)
- https://help.deskbird.com/hc/en-us/articles/10536191126673-Exports (via search result)
- https://support.robinpowered.com/hc/en-us/articles/13462982338957-Exporting-workplace-data, https://support.robinpowered.com/hc/en-us/articles/360007608872-Bulk-assign-seats-via-CSV (via search result)
- https://www.cnil.fr/fr/le-droit-dacces-des-salaries-leurs-donnees-et-aux-courriels-professionnels
- https://www.juritravail.com/Actualite/cse-votre-role-en-cas-de-demenagement-ou-de-reorganisation-des-locaux-de-travail/Id/263484 (via search result)
- https://registry.npmjs.org/rrule, https://registry.npmjs.org/date-fns, https://registry.npmjs.org/@dnd-kit/core, https://raw.githubusercontent.com/jakubroztocil/rrule/master/LICENCE, https://raw.githubusercontent.com/clauderic/dnd-kit/master/LICENSE
