# Adapting Booking — a guide for AI agents

`README.md` says what Booking does; this page says where things are and
what must not break.

## Map

| Path | What it is |
|---|---|
| `chest.json`, `chest.proposals.json` | Manifest (roles `admin`, `host`; public part) and the proposals it uses (`mail`, `schedules`) |
| `lib/access.ts` | Who may do what |
| `lib/model.ts` | Bounds, slugs, email and phone checks, colours, kinds — pure |
| `lib/zone.ts` | Wall-clock time in a time zone and back (DST gaps and overlaps) — pure, tested |
| `lib/slots.ts` | Free times from hours, overrides, bookings and rules — pure, tested |
| `lib/booking.ts` | The service: hosts, hours, types, free times, booking, moving, cancelling, feed, guard, cleanup, erasure |
| `lib/ics.ts` | Calendar files (RFC 5545) |
| `lib/mailer.ts`, `lib/guests.ts` | Emails to guests through the Chest's mail, falling back to the page |
| `lib/tell.ts` | The host's bell |
| `lib/lifecycle.ts` | Members leaving or erased |
| `lib/form-token.ts`, `lib/public-origin.ts` | The form's signed "shown at" time; the public host's address; the visitor's key |
| `app/page.tsx`, `app/[host]/…`, `app/b/[secret]/…`, `app/api/slots`, `app/feed/[token]`, `app/public-actions.ts`, `components/picker.tsx` | The public part (anonymous) |
| `app/chest/…`, `app/chest/actions.ts` | The team's part |
| `app/chest-jobs/[name]/route.ts`, `app/chest-events/route.ts` | Deliveries from the Chest (signed) |

## Commands

```sh
npm ci && npm test && npm run build   # all three must pass
```

## Rules

- **No double booking**: the exclusion constraint `no_double_booking` is
  the guarantee; the slot check before it is for a kind answer. Any new
  way to make or move a booking must write `blocked` (buffers included)
  and turn the database's refusal (`23P01`) into `taken`.
- **Times are instants** (`timestamptz`, ISO strings); hours are minutes
  of the host's wall clock in `hosts.zone`. Convert only with
  `lib/zone.ts`; never with the server's local time.
- **The guest's secret** opens one booking: it is looked up by its
  SHA-256, kept for their later emails, never shown on the team's pages,
  never logged.
- **Guests are data subjects**: anything new stored about them must be
  deleted by `eraseGuest` and `cleanup`.
- **Email is optional**: every path must work when `mail.send` throws.
- **Dates in client components**: format them on the server (Node's and
  the browser's Intl can differ and break hydration).
- Identity from `member()` only; rights in `lib/access.ts`; words in every
  catalogue; client components never import the SDK or `lib/db.ts`.
