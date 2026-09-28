import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { grant } from "../../../../lib/cv.ts";
import { currentMember } from "../../../../lib/session.ts";

// A recruiter sends a CV (a referral's, a replaced one): an upload address
// the Chest accepts once, on the team host, with their session.
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const actor = await currentMember();
  if (!actor) return answer({ error: "forbidden" }, 401);
  if (!can(actor, "candidates.manage")) return answer({ error: "forbidden" }, 403);
  const body = (await request.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  if (!body) return answer({ error: "invalid" }, 400);
  try {
    return answer(await grant("team", body.type, body.size));
  } catch (error) {
    if (error instanceof AppError) return answer({ error: error.code }, 400);
    if (error instanceof CapabilityNotGranted) return answer({ error: "unavailable" }, 503);
    if (error instanceof ChestError) return answer({ error: "unavailable" }, 503);
    throw error;
  }
}
