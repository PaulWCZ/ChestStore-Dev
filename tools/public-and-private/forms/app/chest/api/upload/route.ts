import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import { member } from "@argentic/chest-sdk/member";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { bySlug, openState } from "../../../../lib/forms.ts";
import { fileQuestion, grant } from "../../../../lib/uploads.ts";

// A member answering a team form asks to send a file: only for an open,
// named team form's file question (an anonymous form never asks for files).
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const who = member(request);
  if (!who) return answer({ error: "forbidden" }, 401);
  const body = (await request.json().catch(() => null)) as { slug?: unknown; question?: unknown; type?: unknown; size?: unknown } | null;
  if (!body) return answer({ error: "invalid" }, 400);
  try {
    if (!can(who, "forms.answer")) throw new AppError("not_found");
    const found = await bySlug(db(), body.slug);
    if (!found || found.form.audience !== "team" || found.form.anonymous) throw new AppError("not_found");
    if (!openState(found.form).open) throw new AppError("closed");
    const q = fileQuestion(found.definition, body.question);
    return answer(await grant("team", q, body.type, body.size));
  } catch (error) {
    if (error instanceof AppError) return answer({ error: error.code }, error.code === "not_found" ? 404 : 400);
    if (error instanceof CapabilityNotGranted) return answer({ error: "files_off" }, 501);
    if (error instanceof ChestError) return answer({ error: "unavailable" }, 503);
    throw error;
  }
}
