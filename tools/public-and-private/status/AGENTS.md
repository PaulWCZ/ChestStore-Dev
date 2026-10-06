# Adapting Status — a guide for AI agents

`README.md` says what Status does; this page says where things are and
what must not break. How a tool on this stack is built — pages, islands,
actions, words, the database, tests, recipes, rules — is
`node_modules/@argentic/chest-app/AGENTS.md`: read it first.

## Stack

Hono + React rendered on the server + islands + Vite, on the vendored
`@argentic/chest-app` (0.1.0-studio.3), the SDK `@argentic/chest-sdk`
0.4.1-studio.3 and the UI kit `@argentic/chest-ui` 0.2.6-studio.1
(`vendor/`, never edited: `node scripts/add-app.mjs`, `add-sdk.mjs`,
`add-ui.mjs` from the studio). `chest.json` is contract 0.4 (official keys
only, the `updates` schedule in it); the studio's proposals are in
`chest.proposals.json`. No `"csp": "tool"`: no inline script, no `<style>`,
no `style={}` — the look is a stylesheet the tool serves.

## Map

| Path | What it is |
|---|---|
| `src/app.tsx` | **Every route**: the team's pages (`team()`: a member without a role gets the team's status page), the public pages, feeds, the API (`/api/v2/…`), `/badge.svg` (and `/chest/badge.svg` for Settings), `/embed` + `/embed.css`, `/heartbeat/:token`, downloads, caching headers, `/chest-events`, `/chest-schedules`, `/chest-checks`, `/chest-webhooks` |
| `src/actions.ts` | **Every mutation**: the team's (from islands, `call(name, input)`) and the public forms' (`/actions/subscribe`…, posted without JavaScript). `subscribe` and `subscribeChat` are bounded by the package (`bound`: `<Honeypot />` in the form, single-use token, budgets `formBudgets`/`chatBudgets` spent by `charge()` once the request is good; a refusal comes back to the form with what was typed); the others act on a secret link (`bound: false`) |
| `src/layout.tsx` | The team's frame (kit `AppShell`, five sections, the public page link, `data-look`), the public error frame, the toasts |
| `src/pages/` | Pages, rendered on the server (one function each, returning `{ title, body }`); `src/pages/parts/` server-only parts (`PublicShell`, `IncidentCard`, `HistoryBar`, `When`, `meta.tsx`) |
| `src/islands/` | What runs in the browser: forms and views of the team's part (`IncidentForm`, `IncidentView`, `MaintenanceView`, `ComponentsView`, `ChecksForm`, `HeartbeatsView`, `SettingsView`, `SubscriberList`/`HookList`, `SetupEmpty`), `AutoRefresh`, `LocalTimes` (times in the visitor's zone — the only island of the public pages besides the toasts) |
| `src/components/` | Shared by pages and islands, browser-safe: icons, the mark, state labels, the impact picker, second-language fields, date problems, `use-run.ts` (`call()` with pending and Undo), `classes.ts` (classes named by data: `tone()`, `stepClass()`), `wall-time.ts` (days and wall times, pure) |
| `src/lib/` | Rules and SQL, one file per subject (as before the move: `incidents.ts`, `components.ts`, `timeline.ts`, `status-view.ts`, `subscribers.ts`, `mailer.ts`, `hooks.ts`, `checks.ts`, `heartbeats.ts`, `importer.ts`, `export.ts`, `api.ts`, `badge.ts`, `embed.ts`, `feeds.ts`, `tell.ts`, `tell-tools.ts`, `lifecycle.ts`, `jobs.ts`…) |
| `src/lib/theme.ts`, `src/lib/states.ts`, `src/tokens.css`, `src/styles.css` | The look: the "Control room" identity, the company's choice (`chest.theme()`), served as `/chest/look.css` and `/look.css` (with the five fixed state colours), cached by its hash |
| `src/lib/public-origin.ts` | The public address: `chest.tool.publicUrl` (the company's own domain once connected); the visitor's address only from `visitors.address()` |
| `src/lib/public-page.ts` | What every public page reads: language, settings, look, whether mail and chats are offered (kept 30 s) |
| `src/i18n/` | Every word: `en.ts` (source), `fr.ts`, `index.ts`, `format.ts` (dates, numbers; Intl objects made once) |
| `migrations/` | `0001_status.sql` … `0005_bounds.sql` (the package's `chest_seen`, `chest_bounds`; three confirmation emails a day per address) (published shape: never edit one that ran; add a file) |
| `test/` | `app.test.mjs` (the built server: pages, actions, forms, API, files, deliveries), `stack.test.ts`, and the rules' tests (`*.test.ts`, as before) |

## Commands

```sh
npm ci && npm run build && npm test   # TEST_DATABASE_URL=postgres://… for PostgreSQL, else PGlite
npm run dev                            # rebuilds on change
```

## Kept on purpose

`src/components/state.tsx` + `icons.tsx` (five states with five shapes and fixed colours; the kit's `StatusBadge` has three tones that follow the theme); the step chooser (radio cards with a line of help each); the impact picker; the team's status page instead of `NoAccess`; the public history bar, cards and table. The kit's words are the catalogues' `toast`, `dialog`, `date`, `files` sections (and `kit`).

## Rules

- **`status.incident` is a contract** (README, "With the other tools"):
  add fields, never rename one; never a member, never an update's text,
  never an incident only about services for the team, never a backfill.
- **A chat subscription is like an email one**: queued in `announce()`
  only, never about services for the team; the address stays with the
  Chest (the tool keeps the target id and the shown address); a generic
  receiver's secret is shown once (`takeSecret`) and forgotten.
- **No history before a service existed**: `history()` draws those days
  "none"; the view says `since` and the bar says "… since <date>".

- **The history is evidence.** Never delete an update or rewrite its text
  without a row in `update_log`; removals are soft (`removed_at`) and
  hidden from the public only. An incident's status and times follow its
  visible updates (`refresh()`).
- **An update's states are the whole picture** at that moment: a service
  left out is operational again. Uptime and the 90 days are computed in
  `lib/timeline.ts` only; keep it pure and tested.
- **A resolved incident is reopened only on purpose**: `addUpdate` refuses
  any step on it unless `reopen: true` (the Reopen dialog). A post-mortem
  is an update of step `postmortem`, one visible per incident; it never
  carries states, never changes status (`refresh()` ignores it), never
  emails.
- **Team-only services stay inside**: every public read goes through
  `isPublic` (lib/incidents.ts) and `shownComponents` without `team`;
  `queueMail` never mails about them. Keep new public queries on them.
- **The public API keeps Statuspage's shape** (field names, statuses,
  indicator rule): integrations depend on it; add fields, never rename.
- **Maintenance is read from the clock** (`maintenancePhase`); the
  automatic posts are dated at the window's edges and idempotent
  (`start_posted`, `end_posted`).
- **Public pages** never show member names, hidden services, removed
  incidents or updates; they render without JavaScript; times go through
  `<When>` (server in the Chest's zone, the browser rewrites).
- **Subscribers** are personal data: store only address, language,
  choices; unsubscribing deletes the row; answers never reveal whether an
  address was known; the token only opens that subscription.
- **Checks never post publicly**: a failed check only tells the editors
  and proposes an incident; a person decides. Results are idempotent by id
  and may arrive out of order (read state by time). Checks are optional:
  every path works when `checks.configure` throws.
- **Email is optional**: every path must work when `mail.send` throws.
- Identity from `member()` only; rights in `lib/access.ts`; words in every
  catalogue (`src/i18n/en.ts` first, `fr.ts` complete); islands and `src/components/`
  never import the SDK or `lib/db.ts`; never hard-code a time zone.
- **Looks**: CSS names contract tokens only (`test/theme.test.ts` refuses a colour, `in srgb` or `in oklch`); a new colour is a tool token defined from them in `src/tokens.css`. State colours come from `src/lib/states.ts` only, never from the theme (`--ok`, `--danger`…): they must mean the same in every look. The identity's own touches go under `[data-look="own"]`.
- **Words**: `node scripts/lint-words.mjs` stays at 0 (narrow no-break space before `: ; ? !` in French; Remove/Delete/Erase = Retirer/Supprimer/Effacer; Undo = « Annuler l’action », the kit's). `lib/notify.ts`'s `cut` keeps those spaces.
