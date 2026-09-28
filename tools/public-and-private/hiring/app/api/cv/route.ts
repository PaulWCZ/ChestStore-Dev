import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import { headers } from "next/headers";
import { AppError } from "../../../lib/app-error.ts";
import { openJob } from "../../../lib/candidates.ts";
import { grant } from "../../../lib/cv.ts";
import { db } from "../../../lib/db.ts";
import { admit, checkForm } from "../../../lib/guard.ts";

// A visitor of the careers page asks to send their CV. Anyone on the
// Internet may call this: it answers only for a form the tool showed (its
// signed token), for an open job, within the form's counters, and gives an
// address the Chest accepts once, for one file of a CV's type and size
// (Proposal (studio): public uploads).
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { slug?: unknown; started?: unknown; type?: unknown; size?: unknown } | null;
  if (!body) return answer({ error: "invalid" }, 400);
  try {
    checkForm(body.started);
    const sql = db();
    await openJob(sql, body.slug);
    await admit(sql, await headers(), "upload");
    return answer(await grant("public", body.type, body.size));
  } catch (error) {
    if (error instanceof AppError) return answer({ error: error.code }, error.code === "too_many" ? 429 : error.code === "not_found" ? 404 : 400);
    // No public uploads on this Chest (yet): the form asks for a link.
    if (error instanceof CapabilityNotGranted) return answer({ error: "cv_off" }, 501);
    if (error instanceof ChestError) return answer({ error: "unavailable" }, 503);
    throw error;
  }
}
