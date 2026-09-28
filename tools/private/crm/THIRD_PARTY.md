# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| IBM Plex Sans (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource/ibm-plex-sans` | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-ibm-plex-sans.txt` |
| IBM Plex Mono (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource/ibm-plex-mono` | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-ibm-plex-mono.txt` |
| Pipeline ideas | Odoo CRM (LGPL-3.0: column totals, lost reason, the "next activity" loop), Pipedrive, Krayin (MIT: stage probability), EspoCRM (AGPL: duplicate check on create), Twenty (AGPL: CSV import with a mapping step), Monica (AGPL: reminders) | — | Ideas only, **no code copied** |
| vCard format | RFC 6350 (4.0), RFC 2426 (3.0) | IETF | `lib/vcard.ts`, written for this tool |
| Board drag and drop, CSV reader, fractional positions | Tasks (this studio) | MIT | `app/chest/deals/board.tsx`, `lib/csv.ts`, `lib/position.ts`, adapted |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@dnd-kit/core`,
`@dnd-kit/sortable`, `@dnd-kit/utilities` (MIT), `@argentic/chest-sdk`
(MIT, the studio's working copy in `vendor/`). PostgreSQL extensions
`unaccent` and `pg_trgm` ship with PostgreSQL. Icons are drawn for this
tool (`components/icons.tsx`).
