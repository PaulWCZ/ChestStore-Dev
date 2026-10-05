# Scheduled tasks

**Specified and built 30 September 2026** (batch SDK+ P1 in
[status.md](../03_roadmap/status.md)). How the code does it is in
`03_code/01_chest-by-argentic/docs/architecture.md` (Server tools,
“Scheduled tasks”); the SDK's side in its README (`schedules`).

A tool does work by itself at set times — a morning digest, reminders to
approvers, a nightly purge, a badge kept true overnight, a mail retried
every quarter of an hour — without anyone opening it. All 18 tools of the
opening store need it. Since tools sleep when nobody uses them, nothing can
run inside a tool between requests: **the Chest calls the tool** at each
time, waking it if it sleeps.

## What the builder writes

```jsonc
// chest.json (with the rest of the manifest)
{ "chest": "0.4", "schedules": [{ "name": "morning", "cron": "30 7 * * 1-5" }] }
```

```ts
// app/chest-schedules/route.ts
import * as schedules from "@argentic/chest-sdk/schedules";
export async function POST(request: Request) {
  return new Response(null, { status: await schedules.handle(request, {
    morning: async () => { await remindDueToday(); },
  }) });
}
```

- A **cron line** (five fields, the most known way to say "weekdays at
  7:30", which every agent writes right). Numbers, `*`, ranges, lists and
  steps; no names nor `@daily`: one spelling, since the line is approved.
- **Bounds**: 8 schedules, each running 15 minutes apart at least; a run
  answers within 5 minutes (longer work is done in batches, its place kept
  in the database).
- **One route**, `/chest-schedules`, the schedule's name in the signed body:
  one handler file, one route the Chest keeps for itself.

## The Chest's clock, not the member's

A line is read on the wall clock of **the Chest's time zone** (Settings →
General), the company's day like `chest.today()`. A schedule is the
company's work, done once. A schedule per member's zone is not offered: it
would multiply runs by the number of zones, and a tool that needs "8:00 for
each member" runs hourly and picks the members whose local hour it is
(`member.timeZone`) — one line of its own code, no platform concept. When
the owner changes the zone, the next times follow at once.

## What the owner approves

Each schedule is shown at installation and approval, in words:

> **Schedule** — Runs by itself: morning, weekdays at 7:30 AM
> *On the Chest's clock, without anyone opening it; each run shows on its overview.*

What is approved is that the tool runs by itself: a later version that
changes the times, adds or removes schedules asks nothing more (as with AI:
the Chest bounds them all the same). A tool that never ran by itself and
starts to asks again.

## Guarantees

- **At least once, same identifier**: a run the tool does not answer with a
  success is delivered again after 1, 5 and 15 minutes — four attempts —,
  unless the tool has no handler for it (404: given up at once) or the next
  time of its schedule comes first. Handlers are idempotent; the SDK drops a
  run it already handled.
- **Never overlapping**: one run of a schedule at a time; a time that comes
  while the previous run still runs is skipped, and shown.
- **Downtime**: a server that was stopped runs a missed time **once** when
  it starts again — the latest, never a backlog —, marked late.
- **A small server**: four runs at most at a time on the node; the others
  wait a moment rather than fail. Waking a tool for a run uses the same path
  as a visit, with the same memory rules.
- **Signed**: the run comes through the tool's launcher only, signed for the
  tool with the mechanism of the members' events under a key of its own;
  never reachable from a browser.

## What whoever runs the tool sees

On the tool's **Overview**, a section **Runs by itself** (only for a tool
that has schedules, only for its owner, admins and builder):

- each schedule in words — "weekdays at 7:30 AM" —, its name, its next run,
  and **Run now** (Running… while a run is under way);
- the zone the times are read in, and that a missed time runs once;
- **Last runs** (10 per schedule): when, which schedule, "Done in 1.2 s",
  "Trying again at 7:31 (attempt 2 of 4)", "Failed", "Skipped: the previous
  run was still running", and why in plain words — "the tool answered 500",
  "the tool has no handler for this schedule (404)", "no answer within 5
  minutes", "not enough memory on the server to wake it" — and how it was
  started ("Late: missed while the server was stopped", "Run on demand").
  Never what the tool did: that is its own log.

For **agents**: `GET /api/v1/tools/<tool>/schedules` (any token of whoever
runs the tool) and `POST /api/v1/tools/<tool>/schedules/run {name}` (a token
that writes); the MCP server's `schedules` and `run_schedule`.

## The store studio's draft, and what changed

The studio's working copy (ChestStore-Dev, `sdk/client/src/schedules.ts`,
report §4.1) was right on the shape — the platform calls the tool (the
Vercel Cron and Cloudflare Cron Triggers model, not SQL in the database),
cron in the manifest, the bounds, one in flight, retries, a missed run once,
a journal, Run now, an agents API — and is kept on all of these. Reshaped:

| Studio | Built | Why |
|---|---|---|
| `POST /chest-jobs/<name>`, the name in the path and the body | `POST /chest-schedules`, the name in the signed body | One route to keep from browsers and to route in a tool; no path to check against the body |
| Its own copy of the event verification (`Chest-Job v1`) | One signed-delivery module shared with events (`signed.ts` in the SDK, `deliver.go` in the Chest); label `Chest-Schedule v1` | One mechanism to review; a separate key so a run is never read as an event |
| `timeZone` in each run | Not sent | `chest.timeZone` already says it (DRY) |
| Cron parsing, `nextRun`, `describeCron`, `checkSchedules` in the SDK | None in the SDK | The Chest validates the manifest (its single validator) and computes the times; the page says the line in words. Tools only handle runs: a smaller SDK |
| Each schedule approved on its own | "Runs by itself" approved once; times change without approval | A builder tuning an hour should not wait for the owner; the Chest bounds every schedule |
| Retries at 1, 5, 15 min, whatever the answer | A 404 (no handler) is given up at once; a new time supersedes a waiting retry | Retrying what cannot succeed wastes wakes on a small server |
| No bound on the node | Four runs at a time on the node | 18 tools at 07:30 would wake together on a small server |
