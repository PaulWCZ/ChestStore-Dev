import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import { headers } from "next/headers";
import { AppError } from "../../../lib/app-error.ts";
import { db } from "../../../lib/db.ts";
import { bySlug, openState } from "../../../lib/forms.ts";
import { admit, checkForm } from "../../../lib/guard.ts";
import { fileQuestion, grant } from "../../../lib/uploads.ts";

// A visitor of a public form asks to send a file for one of its file
// questions. Anyone on the Internet may call this: it answers only for a
// form the tool showed (its signed token), open, for a file question of
// its current version, within the counters, with an address the Chest
// accepts once, for one file of an accepted type and size (Proposal
// (studio): public uploads).
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { slug?: unknown; question?: unknown; token?: unknown; type?: unknown; size?: unknown } | null;
  if (!body) return answer({ error: "invalid" }, 400);
  try {
    checkForm(body.token, 0);
    const sql = db();
    const found = await bySlug(sql, body.slug);
    if (!found || found.form.audience !== "public") throw new AppError("not_found");
    if (!openState(found.form).open) throw new AppError("closed");
    const q = fileQuestion(found.definition, body.question);
    await admit(sql, await headers(), "upload");
    return answer(await grant("public", q, body.type, body.size));
  } catch (error) {
    if (error instanceof AppError) return answer({ error: error.code }, error.code === "too_many" ? 429 : error.code === "not_found" ? 404 : 400);
    // No public uploads on this Chest (yet).
    if (error instanceof CapabilityNotGranted) return answer({ error: "files_off" }, 501);
    if (error instanceof ChestError) return answer({ error: "unavailable" }, 503);
    throw error;
  }
}
