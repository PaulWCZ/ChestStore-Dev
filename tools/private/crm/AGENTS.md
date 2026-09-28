# Adapting Clients — a guide for AI agents

Clients is a Chest store tool (Next.js App Router + `postgres`), one folder,
no import outside it. Read `README.md` first.

## Map

| Where | What |
|---|---|
| `migrations/0001_crm.sql` | The schema: stages, companies, contacts, deals, activities, steps, `chest_events`; `crm_fold()`, the `crm` text search configuration (unaccent) and trigram indexes. Never edit a shipped migration: add `0002_…` |
| `lib/access.ts` | Roles (`manager`, `sales`, `viewer`) and every right; `canEditDeal`, `canDeleteRecord`, `canChangeActivity` |
| `lib/model.ts` | Pure rules: limits, `clean`, ids, emails, websites, phones, tags, days; stages' names |
| `lib/amount.ts` | Money as people write it → whole cents (no floats) |
| `lib/companies.ts`, `contacts.ts`, `deals.ts`, `activities.ts`, `steps.ts`, `stages.ts` | Services: `(sql, actor, …input)`, rights first, codes not sentences |
| `lib/search.ts` | Search and look-alikes (duplicates) |
| `lib/parse-import.ts` (browser-safe), `lib/importers.ts` | CSV mapping (HubSpot, Pipedrive, French headers) and import; vCard import |
| `lib/vcard.ts` | vCard parser (2.1/3.0/4.0) and 4.0 writer |
| `lib/export.ts`, `lib/csv.ts` | CSV / vCard / one person's JSON |
| `lib/tell.ts`, `lib/notify.ts`, `lib/morning.ts` | The bell, the tile's number, the weekday morning |
| `lib/lifecycle.ts` | Leave, removal, erasure |
| `lib/team.ts`, `lib/people.ts` | Who may own things; names from ids |
| `lib/i18n/en.ts`, `fr.ts` | Every word. English is the source |
| `app/chest/actions.ts` | Server actions: thin, re-read the member |
| `app/chest/**/page.tsx` | Server pages; `app/chest/ui/*` shared client views; `app/chest/deals/board.tsx` the dnd-kit board |
| `app/chest-events`, `app/chest-jobs/[name]` | Signed routes of the Chest |
| `test/` | `node:test` with `fakeChest`; PGlite or `TEST_DATABASE_URL` |

## Commands

```sh
npm test && npm run build
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test
```

## Rules

- Identity only from `member(request)` (`lib/session.ts`); store `mbr_…`
  ids, never names or emails of the team.
- Every right in `lib/access.ts`; a service checks it before anything else.
- A new word goes in `en.ts` **and** `fr.ts` (the tests compare keys and
  placeholders, and look for words in `.tsx` files).
- Client components (`"use client"`) never import the SDK, `lib/db.ts`,
  `lib/session.ts` or `lib/people.ts`; dates with month names are formatted
  on the server (a browser's calendar data differs from Node's).
- Money stays integer cents; format with `money()`.
- Contacts are personal data: anything new that stores text about a person
  must be deleted by `deleteContact` and included in `exportContact`.
- Parameterised SQL only; transactions with `sql.begin`.
