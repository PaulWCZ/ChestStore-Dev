# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| IBM Plex Sans (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource-variable/ibm-plex-sans` 5.3.0 (the UI kit's registry) | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-ibm-plex-sans.txt` |
| IBM Plex Mono (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource/ibm-plex-mono` | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-ibm-plex-mono.txt` |
| Pipeline ideas | Odoo CRM (LGPL-3.0: column totals, lost reason, the "next activity" loop), Pipedrive, Krayin (MIT: stage probability), EspoCRM (AGPL: duplicate check on create), Twenty (AGPL: CSV import with a mapping step), Monica (AGPL: reminders) | — | Ideas only, **no code copied** |
| vCard format | RFC 6350 (4.0), RFC 2426 (3.0) | IETF | `lib/vcard.ts`, written for this tool |
| Board drag and drop, CSV reader, fractional positions | Tasks (this studio) | MIT | `app/chest/deals/board.tsx`, `lib/csv.ts`, `lib/position.ts`, adapted |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-ui` (MIT, the studio's UI kit in `vendor/`; the record picker's placement copies its `float.ts` rule, shortened), `@dnd-kit/core`,
`@dnd-kit/sortable`, `@dnd-kit/utilities` (MIT), `@argentic/chest-sdk`
(MIT, the studio's working copy in `vendor/`). PostgreSQL extensions
`unaccent` and `pg_trgm` ship with PostgreSQL. Icons are drawn for this
tool (`components/icons.tsx`).

## Export formats the importer reads

The importer's header lists (`lib/parse-import.ts`) and the test files
(`test/import-more.test.ts`, `test/importers.test.ts`) follow the export
formats of HubSpot and Pipedrive as their help pages and community answers
describe them. The pages were read through web search snippets on
2026-09-28 (the sites themselves were blocked from this environment): a
human should compare with a real export before claiming exact parity.

- Pipedrive — deals, persons, organizations, activities and notes are
  exported separately, as CSV or Excel, with "Entity - Field" headers
  ("Deal - Title", "Activity - Subject", "Activity - Due date", "Activity
  - Done", "Activity - Note", "Person - Email"…):
  https://support.pipedrive.com/en/article/exporting-data-from-pipedrive
  and https://blog.coupler.io/pipedrive-export-notes/
- HubSpot — contacts, companies and deals export from their index pages;
  notes are engagements, not part of those exports; a notes report has
  "Activity date" (DD/MM/YYYY) and "Note body" columns with the associated
  records: https://knowledge.hubspot.com/import-and-export/export-records
  and https://community.hubspot.com/t5/CRM/Export-Notes/m-p/737750
- ZIP (the whole-book export, `lib/zip.ts`, written for this tool):
  PKWARE APPNOTE 6.3, stored entries, UTF-8 names; CRC-32 as in ISO 3309.
