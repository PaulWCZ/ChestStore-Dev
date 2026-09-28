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
| `lib/jobs.ts`, `app/chest-jobs/[name]/route.ts` | The "updates" pass (schedule, or an editor's visit) |
| `lib/lifecycle.ts`, `app/chest-events/route.ts` | Members erased |
| `app/page.tsx`, `app/incidents/…`, `app/history/…`, `app/subscribe/…`, `app/s/[token]/…`, `app/public-actions.ts`, `components/history-bar.tsx`, `components/incident-card.tsx` | The public part (anonymous, no JS needed) |
| `app/chest/…`, `app/chest/actions.ts` | The team's part |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **The history is evidence.** Never delete an update or rewrite its text
  without a row in `update_log`; removals are soft (`removed_at`) and
  hidden from the public only. An incident's status and times follow its
  visible updates (`refresh()`).
- **An update's states are the whole picture** at that moment: a service
  left out is operational again. Uptime and the 90 days are computed in
  `lib/timeline.ts` only; keep it pure and tested.
- **Maintenance is read from the clock** (`maintenancePhase`); the
  automatic posts are dated at the window's edges and idempotent
  (`start_posted`, `end_posted`).
- **Public pages** never show member names, hidden services, removed
  incidents or updates; they render without JavaScript; times go through
  `<When>` (server in the Chest's zone, the browser rewrites).
- **Subscribers** are personal data: store only address, language,
  choices; unsubscribing deletes the row; answers never reveal whether an
  address was known; the token only opens that subscription.
- **Email is optional**: every path must work when `mail.send` throws.
- Identity from `member()` only; rights in `lib/access.ts`; words in every
  catalogue (`lib/i18n/en.ts` first, `fr.ts` complete); client components
  never import the SDK or `lib/db.ts`; never hard-code a time zone.
