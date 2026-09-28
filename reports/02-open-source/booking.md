# Booking — open-source research
_Read on 2026-09-28. Replaces: Calendly, Cal.com cloud, Doodle (meeting booking), Google Calendar appointment schedules._

## The job
A salesperson, recruiter or consultant shares one link; an outside person opens it, sees free slots in
**their own time zone**, picks one, types name and email, and gets a confirmation with an "add to
calendar" file. The daily 20 %: "my weekly hours", two or three meeting types (15/30/60 min), a
list of upcoming bookings with cancel / reschedule, and no double booking.

## Projects

### Cal.diy (formerly the Cal.com repository)
| Field | Content |
|---|---|
| Project | Cal.diy — https://github.com/calcom/cal.diy (the old `calcom/cal.com` URL now serves it) — ~48,700 stars (GitHub search, 2026-09-28); `v6.2.0` on 2026-03-01 (releases feed); pushed daily |
| Licence | `MIT` — https://github.com/calcom/cal.diy/blob/main/LICENSE (read raw: "MIT License, Copyright (c) 2020-present Cal.com, Inc."). The README says Cal.diy is "a fork of Cal.com with all enterprise/commercial code removed" and "100% MIT-licensed". Before the change the project was AGPL-3.0 with an `ee/` commercial part; the relicensing to MIT and the rename happened in April 2026 (per search result: https://www.implicator.ai/cal-com-goes-private-as-self-hosted-calendly-choices-narrow-in-2026/, https://cal.com/blog/cal-diy-open-source-to-closed-source — not read first-hand, cal.com is blocked here). |
| Reuse | **Code** (MIT) — but **only from the current MIT tree**, with attribution; never from pre-2026 AGPL commits or forks of them. |
| Stack | Next.js, tRPC, Prisma, PostgreSQL, Tailwind, dayjs — the same family as ours. Slot logic is plain TypeScript: `packages/features/schedules/lib/slots.ts` (264 lines, read raw) and `date-ranges.ts`. |
| What it does best | The reference UX: event types (title, duration, location), weekly availability + **date overrides**, buffers before/after, **minimum notice**, booking window ("up to N days ahead"), slot interval, public page with month calendar on the left and slots on the right, invitee time-zone switcher, reschedule / cancel links, booking questions. Slot generation handles DST by working on date ranges in the owner's zone. |
| What to avoid | README warns: "strictly recommended for personal, non-production use"; teams, round-robin, workflows and insights were removed (README "What's different"). Heavy build (README suggests `NODE_OPTIONS=--max-old-space-size=16384`). 100+ app integrations we will never need. |

### Easy!Appointments
| Field | Content |
|---|---|
| Project | Easy!Appointments — https://github.com/alextselegidis/easyappointments — ~4,400 stars (GitHub search, 2026-09-28); stable `1.6.0` on 2026-05-27, `1.6.1-beta.1` on 2026-09-07 (releases feed) |
| Licence | `GPL-3.0` — https://github.com/alextselegidis/easyappointments/blob/main/LICENSE (read raw) |
| Reuse | **Ideas only** |
| Stack | PHP / CodeIgniter, MySQL, jQuery. Not transposable. |
| What it does best | Service-business model: **services × providers**, "any provider" option, working plan with breaks, a step-by-step booking wizard (service → date/time → details → confirm), customer records, Google Calendar sync (README features). Good for a front desk booking customers for staff. |
| What to avoid | Time-zone bugs recur: "Cannot modify appointment if provider changes time zone" (#1789), "mobile timezone fallback to UTC" (#1890), "Booking Screen Calendar Day Mismatch" (#1560), "Google Calendar sync ignores transparency" (#1945) — https://github.com/alextselegidis/easyappointments/issues?q=is%3Aissue+timezone. Dated admin UI; premium features upsold. |

### Rallly
| Field | Content |
|---|---|
| Project | Rallly — https://github.com/lukevella/rallly — ~5,280 stars (GitHub search, 2026-09-28); `v4.15.2` on 2026-09-21 (releases feed); active |
| Licence | `AGPL-3.0` (or later) — https://github.com/lukevella/rallly/blob/main/LICENSE (read raw) |
| Reuse | **Ideas only** |
| Stack | Next.js, Prisma, tRPC, Tailwind, PostgreSQL — same as ours. |
| What it does best | The Doodle job: propose several dates, share a link, **participants vote without an account**, availability grid (yes / if-need-be / no), comments, "finalize" the winning option (README features). Clean, friendly UI. |
| What to avoid | A different job from 1:1 booking; merging both into one screen would confuse. We take it as a later "group poll" mode. |

### LibreBooking
| Field | Content |
|---|---|
| Project | LibreBooking — https://github.com/LibreBooking/librebooking — ~820 stars (GitHub search, 2026-09-28); `v5.3.0` on 2026-08-03 (releases feed) |
| Licence | `GPL-3.0` — https://github.com/LibreBooking/librebooking/blob/develop/LICENSE.md (read raw: "GNU General Public License Version 3") |
| Reuse | **Ideas only** |
| Stack | PHP, MySQL. Not transposable. |
| What it does best | **Resource** booking (rooms, cars, equipment) with approval, quotas and a grid of resources × hours — a different job (internal room booking), useful to know where the boundary is. |
| What to avoid | Enterprise-style settings; out of scope for external meeting booking (candidate for a separate "Rooms" tool). |

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Personal public booking page `/<member>` listing booking types | MVP | Calendly, Cal.diy | Public part; slug chosen by the member; identity from `member(request)` only in the private part |
| Booking types: name, duration, location text (address / phone / video link typed by owner), description | MVP | Calendly event types | No video provider integration |
| Weekly availability (per weekday, several ranges) in the owner's time zone | MVP | Cal.diy schedules, Google appointment schedules | Stored as local times + IANA zone, not UTC offsets |
| Date overrides / days off | MVP | Cal.diy date overrides | |
| Buffer before/after, minimum notice, max days ahead, slot interval | MVP | Calendly, Cal.diy | Defaults chosen so the owner can ignore them |
| Visitor picks a slot in **their** time zone (auto-detected, changeable) | MVP | Calendly, Cal.diy | Browser `Intl` zone; server computes in UTC |
| No double booking: slot re-checked in a transaction, unique constraint on overlapping booking | MVP | all | Postgres exclusion constraint on `tstzrange` |
| Booking form: name, email, optional note | MVP | Calendly | |
| Confirmation page with **.ics download** and cancel/reschedule secret link | MVP | Calendly, Cal.diy | ICS generated by us (RFC 5545); email delivery **depends on missing outbound email** |
| Private list: upcoming / past bookings, cancel with a reason | MVP | Calendly "Scheduled events" | |
| Notification to the owner's Chest inbox on new / cancelled booking | MVP | Calendly notifications | Platform notification primitive |
| Team page: one link showing several members' booking types | MVP | Calendly team pages | Members/groups from the platform |
| Busy times from the owner's real calendar (Google / Microsoft / CalDAV) | later — **needs outbound network + calendar-sync primitive** | Calendly, Cal.diy, Easy!Appointments | Biggest gap: without it the owner must block time manually |
| Email confirmation + reminder 24 h before | later — **needs outbound email + scheduled tasks** | Calendly workflows | Reminders need cron |
| Subscribe URL (ICS feed) of my bookings for my calendar app | later | Cal.diy, Google | Read-only feed with secret token; no outbound needed |
| Round-robin / collective team booking | later | Calendly, Cal.com (now closed) | |
| Group date poll ("find a date") | later | Rallly, Doodle | Separate mode |
| Custom booking questions | later | Calendly, Cal.diy | |
| Daily limit of bookings per type | later | Calendly | |
| Embed widget on the company website | later | Calendly embed | iframe of the public page |
| **Import from Calendly**: Scheduled Events CSV export | later | Calendly | CSV with all columns, not customisable — https://assets-help-site.calendly.com/help/article/how-to-export-scheduled-event-details/ (per search result). Event-type settings have no export. |
| Payments (Stripe) for paid consultations | never (for now) | Calendly, Cal.diy | Outbound + PCI scope |
| Video conferencing integrations (Zoom, Meet) | never | Cal.diy apps | Owner pastes a link instead |
| Routing forms / workflows / SMS | never | Calendly, Cal.com | |

## Reusable pieces
- **Cal.diy slot logic** (MIT, current tree only, with attribution): `packages/features/schedules/lib/slots.ts`, `date-ranges.ts` — https://github.com/calcom/cal.diy. Depends on `@calcom/dayjs`; port the algorithm, not the file.
- **ical-generator** (MIT) — builds `.ics` with `METHOD:REQUEST` for Outlook invitations and pluggable VTIMEZONE — https://github.com/sebbo2002/ical-generator (LICENSE + README read raw).
- **ics** (ISC) — smaller alternative — https://github.com/adamgibbons/ics.
- **timezones-ical-library** (Apache-2.0) — VTIMEZONE blocks for each IANA zone — https://github.com/add2cal/timezones-ical-library (package.json read raw).
- **rrule** (BSD-3-Clause, v2.8.0 in package.json) — recurrence rules if ever needed — https://github.com/jkbrzt/rrule.
- **Luxon** (MIT, v3.7.2 in package.json) — time-zone-correct date maths with IANA zones — https://github.com/moment/luxon. Alternatives: **Day.js** (MIT) https://github.com/iamkun/dayjs, **date-fns-tz** (MIT) https://github.com/marnusw/date-fns-tz, **Temporal polyfill** (ISC, `@js-temporal/polyfill` 0.5.1) https://github.com/js-temporal/temporal-polyfill.
- **@vvo/tzdb** (MIT) — human-friendly time-zone list for the picker ("Paris" rather than `Europe/Paris`) — https://github.com/vvo/tzdb.
- **FullCalendar** (MIT core) — only if we want a week view of bookings — https://github.com/fullcalendar/fullcalendar.
- Standard: iCalendar RFC 5545 (VEVENT needs `UID`, `DTSTAMP`; zones via `TZID` + `VTIMEZONE`) and iTIP RFC 5546 (`METHOD`) — https://www.rfc-editor.org/rfc/rfc5545, https://www.rfc-editor.org/rfc/rfc5546 (not read here: domain blocked; facts from the ical-generator README which quotes the METHOD rule).

## Legal and security notes
- **GDPR.** The public page collects names and emails of outside people: short privacy notice on the form, purpose = organise the meeting, retention default e.g. 12 months after the meeting then delete (purge needs **scheduled tasks**; admin button until then). CNIL's 3-year rule applies only if the booking becomes a customer/prospect record (https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees — per search result).
- **Enumeration / privacy of the owner.** The public page shows only free slots, never event titles or who booked. Busy/free leakage is limited to the booking window.
- **Cancel/reschedule links** are bearer tokens: random, hashed at rest, single booking scope.
- **Abuse.** Rate limit bookings per IP and per email; cap open bookings per visitor; honeypot/ALTCHA on the form.
- **Time zones.** Store instants in UTC (`timestamptz`) and rules in local time + IANA zone; test DST transitions for Europe/Paris (last Sunday of March / October) — a classic source of bugs in Easy!Appointments (issues above).
- **Accessibility.** Slot pickers must be keyboard-operable; European Accessibility Act applies since 2025-06-28 to many B2C services (https://www.degaullefleurance.com/en/actualites/digital-accessibility-new-obligations-for-the-private-sector/ — per search result).

## Sources
- https://github.com/calcom/cal.diy — https://raw.githubusercontent.com/calcom/cal.com/main/LICENSE — https://raw.githubusercontent.com/calcom/cal.com/main/README.md — https://github.com/calcom/cal.diy/releases.atom
- https://raw.githubusercontent.com/calcom/cal.diy/main/packages/features/schedules/lib/slots.ts
- https://www.implicator.ai/cal-com-goes-private-as-self-hosted-calendly-choices-narrow-in-2026/
- https://cal.com/blog/cal-diy-open-source-to-closed-source
- https://cal.com/blog/cal-com-goes-closed-source-why
- https://github.com/alextselegidis/easyappointments — https://raw.githubusercontent.com/alextselegidis/easyappointments/main/LICENSE — README — https://github.com/alextselegidis/easyappointments/releases.atom
- https://github.com/alextselegidis/easyappointments/issues?q=is%3Aissue+timezone
- https://github.com/lukevella/rallly — https://raw.githubusercontent.com/lukevella/rallly/main/LICENSE — README — https://github.com/lukevella/rallly/releases.atom
- https://github.com/LibreBooking/librebooking — https://raw.githubusercontent.com/LibreBooking/librebooking/develop/LICENSE.md — https://github.com/LibreBooking/librebooking/releases.atom
- https://assets-help-site.calendly.com/help/article/how-to-export-scheduled-event-details/
- https://github.com/sebbo2002/ical-generator
- https://github.com/adamgibbons/ics
- https://github.com/add2cal/timezones-ical-library
- https://github.com/jkbrzt/rrule
- https://github.com/moment/luxon
- https://github.com/iamkun/dayjs
- https://github.com/marnusw/date-fns-tz
- https://github.com/js-temporal/temporal-polyfill
- https://github.com/vvo/tzdb
- https://github.com/fullcalendar/fullcalendar
- https://www.rfc-editor.org/rfc/rfc5545 — https://www.rfc-editor.org/rfc/rfc5546 (not read)
- https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- https://www.degaullefleurance.com/en/actualites/digital-accessibility-new-obligations-for-the-private-sector/
