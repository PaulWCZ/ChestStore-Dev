# Adapting Clients — a guide for AI agents

Clients is a Chest store tool on the studio's stack — Hono + React pages
rendered on the server + islands + Vite, the package `@argentic/chest-app`
(read its `AGENTS.md`, in `node_modules/@argentic/chest-app`) — one folder,
no import outside it. Read `README.md` first.

## Map

| Where | What |
|---|---|
| `migrations/0001_crm.sql` | The schema: stages, companies, contacts, deals, activities, steps, `chest_events`; `crm_fold()`, the `crm` text search configuration (unaccent) and trigram indexes |
| `migrations/0002_deepen.sql` | The team's `fields`, `imports`, `attachments`; `custom` jsonb and `import_id` on records; structured address, SIREN, VAT, email on companies; second phone and URL on contacts; `crm_phone()` digits columns; several open steps with `due_time`, steps of one's own. Never edit a shipped migration: add `0003_…` |
| `migrations/0003_calendar.sql`, `0004_forms.sql`, `0005_form_leads.sql` | Timed steps in the calendar; form lines; `contacts.maybe_same` and `contacts.lead_since` |
| `src/lib/access.ts` | Roles (`manager`, `sales`, `viewer`) and every right; `canEditDeal`, `canDeleteRecord`, `canChangeActivity` |
| `src/shared/model.ts` | Pure rules: limits, `clean`, ids, emails, websites, phones, tags, days; stages' names |
| `src/shared/amount.ts` | Money as people write it → whole cents (no floats) |
| `src/lib/companies.ts`, `contacts.ts`, `deals.ts`, `activities.ts`, `steps.ts`, `stages.ts` | Services: `(sql, actor, …input)`, rights first, codes not sentences |
| `src/lib/search.ts` | Search (phone digits too) and look-alikes (duplicates) |
| `src/shared/custom.ts` (browser-safe), `src/lib/fields.ts` | The team's own fields: kinds, values checked, the list filter (`cf`, `cv`, `cmin`, `cmax`) |
| `src/lib/bulk.ts`, `src/lib/merge.ts` | Many records at once (each checked as alone); merging duplicates |
| `src/lib/attachments.ts` | Files on records (the Chest's `files`); the actions `uploadFile` and `attachFile` authorise and record uploads, `/chest/files/:id` signs a link |
| `src/lib/reports.ts` | The Team page's numbers (`weekActivities`, `stageConversion`: the Monday numbers); a viewer's home |
| `src/lib/from-forms.ts`, `src/lib/leads.ts` | Forms' `forms.contact`: the matching rule (email; phone only with the same name — `sameName`; else a new contact with `maybe_same`), the submitted identity on the line (`data.who`); leads (`lead_since`: take, give, not a lead), "maybe the same person" (`keepApart`), the manager's check of form lines (`formLinesToCheck`, `markChecked`, `moveLine`). `src/components/leads-box.tsx` (My day), `src/pages/Settings.tsx` (the check) |
| `src/lib/from-booking.ts` | Booking's `booking.confirmed` / `booking.cancelled`: the guest found by `match()` (the forms' rule), one `booking` line per booking with its state in `booked_meetings` (moves only forward, cancelled final, a deleted contact never brought back), `upcoming()` for My day, `bookingLink()` (`chest.tools.link("booking", path)`), `forgetHost()` on erasure |
| `src/lib/countries.ts`, `src/lib/zip.ts` | Country codes and names (Intl); a stored ZIP for the whole-book export |
| `src/shared/parse-import.ts` (browser-safe), `src/lib/importers.ts` | CSV mapping (HubSpot, Pipedrive, French headers; unknown columns → notes, `custom:<id>`, `new`) and import of records and history; owners not in the team; fill empty; `undoImport`; vCard import |
| `src/shared/vcard.ts` | vCard parser (2.1/3.0/4.0) and 4.0 writer |
| `src/lib/export.ts`, `src/shared/csv.ts` | CSV / vCard / one person's JSON |
| `src/lib/tell.ts`, `src/lib/notify.ts`, `src/lib/morning.ts` | The bell, the tile's number, the weekday morning |
| `src/lib/lifecycle.ts` | Leave, removal, erasure |
| `src/lib/share.ts` | Events to other tools (proposal): `crm.deal.won`, `crm.deal.reopened` — the contract Quotes reads; change it only with Quotes |
| `src/lib/team.ts`, `src/lib/people.ts` | Who may own things; names from ids |
| `src/i18n/en.ts`, `fr.ts` | Every word. English is the source; the UI kit's sections (`toast`, `dialog`, `peoplePicker`, `date`, `files`, `table`, `searchBox`) are given to its components as `labels` |
| `src/theme.ts` | The identity "Sales desk" (`defineTheme`, equal to the catalogue's `sales-desk`) and `currentLook()` (the Chest's choice, else the identity) |
| `src/tokens.css`, `src/styles.css` | Tool tokens defined from contract tokens; the tool's components (contract tokens only, a few `ck-` classes restyled) |
| `src/layout.tsx` | The kit's AppShell: sections; `HeaderTools` (island) the SearchBox ("/") and the "More" Menu |
| `src/actions.ts` | Every change: the package's `action(fields, run)`; the services check rights; notifications, badges, calendars in `after()` |
| `src/app.tsx`, `src/pages/` | Routes and pages (server); `pages/words.ts` picks each island's words (`pick()`: never the whole catalogue in an island's props) |
| `src/islands/`, `src/components/` | What runs in the browser: `combobox.tsx` + `pickers.tsx` search records as one types (the kit's keys, list classes and `useFloat`), `owner-select.tsx` the kit's PeoplePicker, `bulk.tsx`, `step-box.tsx`, `files-box.tsx`, `custom-fields.tsx`, `merge-dialog.tsx`; `board.tsx` the dnd-kit board (its `DndContext` takes a `useId()` id; Tasks' multi-container guard against React #185; the moving state recipe of the package's AGENTS.md) |
| `src/lib/deliveries.ts` | `/chest-events` and `/chest-schedules` (signed routes of the Chest) |
| `src/lib/version.ts`, `migrations/0007_book_version.sql` | The pages' version: a 304 to a refresh with nothing new |
| `test/` | `node:test` with `fakeChest`; PGlite or `TEST_DATABASE_URL` |

- `src/lib/step-calendar.ts` — timed next steps in their owner's Chest
  calendar (studio proposal `calendar`): call `publishStep` after any change
  of one step, `reconcile` after anything that changes steps in bulk
  (deletions, merges, imports, a member leaving) — never write to
  `calendar` elsewhere. `step_events` is what was put.
- `src/lib/seed-words.ts` and `fields.label_key/option_keys` — seeded names
  (tags, industries, own fields) kept as keys, shown with `shownName` /
  `localized`; a form's round trip keeps keys (`keptKeys`, `updateField`).
  Never show a stored tag or industry without `shownName`.
- `src/components/call-prompt.tsx` — "Log this call?" after a `tel:` tap
  (sessionStorage only).

## Commands

```sh
npm test && npm run build
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test
```

## Rules

- **The UI kit first** (`@argentic/chest-ui/components`, vendored in
  `vendor/`, `node ../../../scripts/add-ui.mjs` to refresh): toasts
  (`useToast`: an Undo that returns `true` or the reason it failed; `tone:
  "error"`), `Dialog` (with `dirty` and a `footer` whose submit names the
  form), `Confirm` for what cannot be undone (never `window.confirm`),
  `PeoplePicker` (owners), `DateField` / `TimeSelect` (never `type="date"`),
  `DataTable` (in an island: its columns are functions),
  `SearchBox`, `Segmented` and `Tabs` (the link variant, rendered on the
  server: the package follows the links in place), `Menu`, `FilePicker`, `StatusBadge`,
  `Avatar`, `EmptyState`, `AppShell`, `NoAccess`; the package's
  `useAutoRefresh` (never a timer of one's own: the tool must be able to
  sleep). The
  record pickers (`combobox.tsx`) stay the tool's: they create records.
- Kit 0.2.2 (re-vendored 2026-09-29): nothing of the tool works around the
  kit any more. Kept on purpose: the square-cut badges (`.ck-badge {
  border-radius: var(--radius-s) }`, Sales desk's trading-screen look —
  the catalogue's `sales-desk` leaves `--radius-chip` a pill), the deals'
  and lists' compact filter row of selects (it writes the address; the
  kit's `Filters` chips would split it and hold no custom-field range).
- **CSS names only contract tokens** (`ui/tokens/CONTRACT.md`) or tool
  tokens of `src/tokens.css` defined from them — never a colour
  (`test/theme.test.ts` checks it). Text on a soft ground is its `-ink`;
  a filled state button has `--surface` text; field edges `--line-strong`;
  a filled control's edge `--accent-line`; categories and chart series
  `--cat-N`.
- Words follow `lab/GLOSSARY.md` (`node ../../../scripts/lint-words.mjs .`
  must say 0): Undo « Annuler l’action », Delete/Supprimer (gone),
  Erase/Effacer (a person's data, GDPR), Remove/Retirer (out of a list);
  a narrow no-break space before `: ; ? !` and inside « ».

- Identity only from the Chest (`member` in `page()`/`action()`); store `mbr_…`
  ids, never names or emails of the team.
- Every right in `src/lib/access.ts`; a service checks it before anything else.
- A new word goes in `en.ts` **and** `fr.ts` (the tests compare keys and
  placeholders, and look for words in `.tsx` files).
- Islands and `src/components/` never import the SDK nor `src/lib/` (types
  only; `checkSources` checks it): shared rules live in `src/shared/`.
  Dates with month names are written on the server (a browser's calendar
  data differs from Node's); no `style={}` (the policy refuses it).
- Money stays integer cents, read at the boundary by `field.money` (send
  what the person typed), in the deal's currency (new deals:
  `chest.currency`); format with `money(cents, locale, { currency })`.
- Never `new Intl.…` outside `src/i18n/format.ts` (kept objects; a test
  refuses it).
- Lists and exports never load a whole table: pages of 100, cursors for
  exports (`companyStream`, `contactStream`, `dealStream`, `textStream`,
  `zipStream`); positions of a stage read and written with its row locked
  (`lockStage`).
- The company's day is `today()` of `src/lib/zone.ts` (`chest.timeZone`), never
  a zone written in the code nor `new Date().toISOString().slice(0, 10)`;
  SQL that cuts instants into days says `at time zone ${chestZone()}`.
  A date shown to a member is formatted in `member.timeZone`.
- **A form answer is filed on a contact only when surely theirs** (same
  email, or same phone and same name): never loosen `match()` in
  `src/lib/from-forms.ts` — one person's words in another's file is a GDPR
  breach. Keep `data.who` on every form line.
- **A booking's state lives in `booked_meetings`** (`src/lib/from-booking.ts`):
  never decide a move or a cancellation from the line's `data` alone; a
  row without a line means "nothing comes back" (a cancellation first, a
  contact deleted).
- Calendar events in bulk go through `reconcile()` (`calendar.putMany`,
  100 a call), never a loop of `calendar.put`. It answers each event
  (SDK studio.16): record only the results with `ok`, never the batch.
- Contacts are personal data: anything new that stores text about a person
  must be deleted by `forget()` (src/lib/contacts.ts: delete, bulk delete,
  undoing an import) and included in `exportContact`.
- Never return a `sql\`…\`` fragment from an `async` function: awaiting it
  runs it as a query. Build `where` fragments synchronously (see
  `companyWhere`).
- Pickers never list a whole table: they search (`companyChoices`,
  `contactChoices`, 8 at a time). Lists page by 100.
- An import never drops a column silently: unknown columns default to
  `keep` (the notes); every record it creates carries its `import_id`.
- Parameterised SQL only; transactions with `sql.begin`.
