import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import { member } from "@argentic/chest-sdk/member";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { open } from "../../../../lib/forms.ts";
import { grantImage } from "../../../../lib/images.ts";

// An editor of a form asks to send a picture (its cover, or a picture
// choice's): a one-time address on the team host for one image of 2 MB at
// most. The picture is checked and published when the form takes it
// (actions setCover, acceptPicture).
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const who = member(request);
  if (!who) return answer({ error: "forbidden" }, 401);
  const body = (await request.json().catch(() => null)) as { form?: unknown; type?: unknown; size?: unknown } | null;
  if (!body) return answer({ error: "invalid" }, 400);
  try {
    await open(db(), who, body.form, "editor");
    return answer(await grantImage(body.type, body.size));
  } catch (error) {
    if (error instanceof AppError) return answer({ error: error.code }, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400);
    if (error instanceof CapabilityNotGranted) return answer({ error: "files_off" }, 501);
    if (error instanceof ChestError) return answer({ error: "unavailable" }, 503);
    throw error;
  }
}
