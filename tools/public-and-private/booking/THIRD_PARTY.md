# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Figtree (font) | [The Figtree Project Authors](https://github.com/erikdkennedy/figtree), via `@fontsource-variable/figtree` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-figtree.txt` |
| Young Serif (font) | [The Young Serif Project Authors](https://github.com/noirblancrouge/YoungSerif), via `@fontsource/young-serif` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-young-serif.txt` |

| Windows time zone names → IANA | Unicode CLDR [`windowsZones.xml`](https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml), read 2026-09-29 — a subset of its mappings (facts, not code) | Unicode License v3 | `lib/windows-zones.ts` |

Calendar reading (`lib/ical.ts`) is our own code, written from RFC 5545
(sections 3.3.10 RECUR, 3.8.5 recurrence properties, 3.6.5 VTIMEZONE);
no parser was copied (ical.js is MPL-2.0, node-ical Apache-2.0 with
heavier dependencies — neither used). The Calendly import reads the
column names of Calendly's "Scheduled events" CSV export as its help pages
name them ("Invitee Name", "Invitee Email", "Event Type Name", "Start Date
& Time"; web search results read 2026-09-29 —
https://calendly.com/help/how-to-import-missing-data-from-calendly-into-salesforce,
https://assets-help-site.calendly.com/help/article/how-to-export-scheduled-event-details/
— the pages themselves were blocked from this environment); the test file
`test/fixtures/calendly-scheduled-events.csv` is made in that shape, not
taken from a real account. Where each provider shows the secret iCal
address is written from the providers' settings as they name them.

Ideas, no code: a public page per person and per kind of meeting, the
month-and-times picker, buffers, minimum notice and booking window, the
host's own questions on the form and a daily limit per type
(Calendly; Cal.com, AGPL — ideas only; Easy!Appointments, GPL — ideas
only). The calendar file writer (`lib/ics.ts`) follows RFC 5545 and is
our own. Dependencies from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). Icons drawn for this tool.
