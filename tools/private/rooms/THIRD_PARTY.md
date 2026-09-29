# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Albert Sans (font) | [usted/Albert-Sans](https://github.com/usted/Albert-Sans), via `@fontsource-variable/albert-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-albert-sans.txt` |
| DM Mono (font) | [googlefonts/dm-mono](https://github.com/googlefonts/dm-mono), via `@fontsource/dm-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-dm-mono.txt` |
| Hybrid-office ideas | [sebo-b/warp](https://github.com/sebo-b/warp) (assigned seats, zones), [seatsurfing/seatsurfing](https://github.com/seatsurfing/seatsurfing) (booking rules, "enforce limits in one transaction"), [MRBS](https://github.com/meeting-room-booking-system/mrbs-code) (the rooms × time grid) | MIT; GPL-3.0; GPL-2.0 | Ideas only — **no code copied** (see `reports/02-open-source/rooms.md` in the studio) |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` and `@argentic/chest-ui`
(MIT, © Argentic: the studio's working copies, packed in `vendor/`). The
fonts are named in the identity (`lib/theme.ts`); the UI kit writes their
`@font-face` for the files in `public/fonts/`. Icons are drawn for this tool
(`components/icons.tsx`). `lib/csv.ts` comes from the studio's
own Tasks tool (same licence and owner).

## Formats read (no code reused)

| Format | Source, and when it was read | What Rooms does with it |
|---|---|---|
| Google Workspace calendar resources, CSV from the Admin console (Buildings and resources › Resource management › Download) | Google's help pages "Create buildings, features & Calendar resources" (https://support.google.com/a/answer/1033925) and "Use Google Calendar structured resources" (https://support.google.com/a/answer/7540850), as a web search summarised them on 2026-09-29 — the pages themselves were blocked from the studio: columns *Calendar Resource Name, Internal Description, Type, Category, User Visible Description, Capacity, Building ID, Floor Name, Floor Section*, features as `#Feature` columns. Field names of the Directory API resource (`resourceName`, `capacity`, `floorName`, `buildingId`, `resourceCategory`, `featureInstances`): https://developers.google.com/workspace/admin/directory/reference/rest/v1/resources.calendars, same date | `lib/import.ts` finds columns by header (English, French, API names), whatever their order; `test/fixtures/google-resources.csv` is a file written after that description. **Not checked against a real download**: the exact header spelling of today's Admin console export is an assumption; unknown columns are ignored |
| Desk assignments (deskbird, Robin, a spreadsheet) | No documented export was reachable; the importer takes any sheet with a desk and a person column | `test/fixtures/desks.csv` |
| iCalendar (RFC 5545) files | Written by the SDK working copy's `calendar.ics` | `.ics` downloads and email attachments |
