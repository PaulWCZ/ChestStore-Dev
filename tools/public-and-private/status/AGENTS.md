# Adapting Status — a guide for AI agents

`README.md` says what Status does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (role `editor`; public part) and the proposals it uses (`mail`, the `updates` schedule, French tile words) |
| `migrations/0001_status.sql` | Components, incidents (and maintenance), updates, update states, the update log, subscribers, the mail queue, form counters |
| `lib/access.ts` | Who may do what (one role) |
| `lib/model.ts` | States, steps, bounds, text cleaning, times typed in the Chest's zone — pure |
| `lib/timeline.ts` | From incidents to spans, states now, 90 days and uptime — pure, tested |
| `lib/zone.ts` | Wall-clock time in a time zone and back — pure |
| `lib/components.ts` | Components and groups |
| `lib/incidents.ts` | Incidents, updates, log, maintenance, automatic posts, history |
| `lib/status-view.ts` | What the public page (and *Now*) shows |
| `lib/subscribers.ts`, `lib/guard.ts` | Subscriptions (double opt-in), the form's guard |
| `lib/mailer.ts`, `lib/settings.ts` | Emails and their queue; what the tool remembers of mail and its public address |
| `lib/tell.ts`, `lib/notify.ts`, `lib/people.ts` | The team's bell (broadcast, fallback), badges, names |
| `lib/feed.ts`, `lib/feeds.ts`, `lib/ics.ts` | Atom/RSS and the maintenance calendar |
| `migrations/0002_checks.sql`, `lib/checks.ts`, `lib/check-results.ts`, `lib/check-words.ts`, `app/chest-checks/route.ts`, `app/chest/checks/…` | Checks run by the Chest: watches, results (kept once, 90 days), down/up after three failures, measured uptime |
| `lib/jobs.ts`, `app/chest-jobs/[name]/route.ts` | The "updates" pass (schedule, or an editor's visit): automatic posts, mail, purge, silent heartbeats |
| `migrations/0003_after_critique.sql` | Second-language texts, post-mortem step, `source_id` of imports, templates, `team_only`, heartbeats |
| `lib/texts.ts`, `lib/languages.ts`, `components/second-field.tsx` | Texts in two languages: which version a reader gets (pure), the Chest's language and the other one, the form fields |
| `lib/api.ts`, `app/api/v2/**` | The public API in Statuspage's shape (indicator rule, CORS) |
| `lib/badge.ts`, `app/badge.svg/`, `app/embed/route.ts`, `lib/public-summary.ts` | The badge (plain SVG) and the framed banner (its own CSP, `frame-ancestors` from the settings) |
| `lib/theme.ts`, `app/layout.tsx`, `app/tokens.css` | The look: the "Control room" identity (`defineTheme`, equal to the catalogue's), `currentLook()` (the Chest's choice, else the identity), one `<ThemeStyle>` with the page's nonce for every page, team and public; tool tokens defined from contract tokens only |
| `lib/states.ts` | The five state colours, fixed in every look (`stateCss`, a second nonce'd `<style>`), measured by `test/states.test.ts` against every theme and derived brands |
| `components/shell.tsx`, `app/chest/layout.tsx` | The kit's AppShell (five sections, BrandMark, member chip, the public page link), Toasts |
| `lib/page-settings.ts`, `app/chest/settings/` | Website/support/embedding sites, the Settings page (and the way to the subscribers) |
| `lib/templates.ts` | Incident templates |
| `lib/importer.ts`, `app/chest/import/route.ts`, `test/fixtures/statuspage-*.json` | Import from Statuspage's JSON |
| `lib/export.ts`, `app/chest/export/**` | Download everything (JSON) and subscribers (CSV) |
| `lib/heartbeats.ts`, `app/heartbeat/[token]/route.ts`, `app/chest/checks/heartbeats-view.tsx` | Heartbeats |
| `app/chest/team-status.tsx` | The team's read-only status page (members without a role) |
| `lib/lifecycle.ts`, `app/chest-events/route.ts` | Members erased |
| `app/page.tsx`, `app/incidents/…`, `app/history/…`, `app/subscribe/…`, `app/s/[token]/…`, `app/public-actions.ts`, `components/history-bar.tsx`, `components/incident-card.tsx` | The public part (anonymous, no JS needed) |
| `app/chest/…`, `app/chest/actions.ts` | The team's part |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## UI kit (`@argentic/chest-ui` 0.2.1-studio.1, `vendor/`)

Used: `ThemeStyle`/`resolveTheme` (look), `AppShell` + `Nav` (sections), `BrandMark`, `Toasts`/`useToast` (every success, error and Undo — through `components/use-run.ts`, whose `undo()` makes a truthful Undo), `Dialog` (resolve, reopen, finish or cancel a maintenance: `dirty` asks before losing typed text), `Confirm` (delete a heartbeat, erase a subscriber — never `window.confirm`), `DateField` and `TimeSelect` (never the browser's date or time field), `Menu` (a service's rarer actions), `EmptyState`, `PageHeader`, `FilePicker` (Statuspage import), `LanguageSwitch`, `useAutoRefresh`. The kit's words are the catalogues' `toast`, `dialog`, `date`, `files` sections.

Kept on purpose: `components/state.tsx` + `icons.tsx` (five states with five shapes and fixed colours; the kit's `StatusBadge` has three tones that follow the theme — none in the Chest theme — and states here must not change with the look); the step chooser (radio cards with a line of help each, which `Segmented` cannot show); the impact picker (a service and its impact per row); `TeamStatus` instead of `NoAccess` (every member may see what works); the public history bar, cards and table.

## Rules

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
  catalogue (`lib/i18n/en.ts` first, `fr.ts` complete); client components
  never import the SDK or `lib/db.ts`; never hard-code a time zone.
- **Looks**: CSS names contract tokens only (`test/theme.test.ts` refuses a colour, `in srgb` or `in oklch`); a new colour is a tool token defined from them in `app/tokens.css`. State colours come from `lib/states.ts` only, never from the theme (`--ok`, `--danger`…): they must mean the same in every look. The identity's own touches go under `[data-look="own"]`.
- **Words**: `node scripts/lint-words.mjs` stays at 0 (narrow no-break space before `: ; ? !` in French; Remove/Delete/Erase = Retirer/Supprimer/Effacer; Undo = « Annuler l’action », the kit's). `lib/notify.ts`'s `cut` keeps those spaces.
