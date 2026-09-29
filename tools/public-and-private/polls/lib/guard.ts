import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { limits } from "./model.ts";
import { visitorKey } from "./public-origin.ts";

// The guest form's guard, as Forms and Booking guard theirs (Proposal
// (studio): the visitors module): the form's signed "shown at" time, and
// the Chest's counting of what a visitor does — per visitor, for everyone,
// and across the Chest's tools. On a Chest without it, Polls counts in its
// own table (guest_counts). A field only robots fill is checked by the
// action (app/p/[link]/actions.ts).

export const formToken = (now?: number) => visitors.formToken(now);

// checkForm refuses a form the tool did not show; one sent faster than a
// person types waits the few seconds left (a person sees a slower
// "Sending…", a robot gains nothing), as Booking does.
export async function checkForm(token: unknown, now = Date.now, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<void> {
  const minimumSeconds = limits.guestSeconds;
  let verdict = visitors.checkForm(token, { minimumSeconds, now: now() });
  if (verdict === "too_fast") {
    const shown = Number(String(token).split(".")[0]);
    await sleep(Math.max(0, Math.min(minimumSeconds * 1000, shown + minimumSeconds * 1000 - now())) + 20);
    verdict = visitors.checkForm(token, { minimumSeconds, now: now() });
  }
  if (verdict === "too_fast") throw new AppError("too_fast");
  if (verdict === "invalid") throw new AppError("invalid");
}

export async function admit(sql: Query, headers: Headers, now = new Date()): Promise<void> {
  try {
    const { allowed } = await visitors.count(headers, "guest", { perVisitor: limits.guestsPerVisitorHour, perHour: limits.guestsPerHour });
    if (!allowed) throw new AppError("too_many");
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    await count(sql, visitorKey(headers), now);
  }
}

// count: the tool's own counters, per visitor (a hash of the address) and
// for everyone, per hour; hours gone are deleted as new ones come.
export async function count(sql: Query, visitor: string, now = new Date()): Promise<void> {
  const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const mine = `guest:${createHash("sha256").update(visitor).digest("hex").slice(0, 32)}`;
  const all = "guest:all";
  await sql`delete from guest_counts where hour < ${hour}`;
  const counts = await sql<{ key: string; count: number }[]>`
    insert into guest_counts (key, hour, count) values (${mine}, ${hour}, 1), (${all}, ${hour}, 1)
    on conflict (key, hour) do update set count = guest_counts.count + 1
    returning key, count`;
  if ((counts.find(c => c.key === mine)?.count ?? 0) > limits.guestsPerVisitorHour || (counts.find(c => c.key === all)?.count ?? 0) > limits.guestsPerHour) throw new AppError("too_many");
}
