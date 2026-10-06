import { createHash } from "node:crypto";
import { formLimits, guard } from "./booking.ts";
import type { Query } from "./db.ts";

// The public writes are bounded by the package (@argentic/chest-app's
// publicAction({ bound }), src/actions.ts): a single-use form token, the
// honeypot, a budget per visitor and for everyone a day, spent by
// charge() only once a request is valid. What Booking adds: a cap per
// guest's link — a link replayed (its own booking moved and moved back,
// taken times tried) is held after formLimits.perSubjectHour changes an
// hour, whoever sends it, so one link cannot spend everyone's budget.
export async function perLink(sql: Query, secret: string): Promise<void> {
  await guard(sql, "change", createHash("sha256").update(secret).digest("hex").slice(0, 32));
}
export { formLimits };
