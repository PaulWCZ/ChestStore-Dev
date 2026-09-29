import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { can } from "../../../lib/access.ts";
import { company } from "../../../lib/company.ts";
import { db } from "../../../lib/db.ts";
import { asker } from "../../../lib/http.ts";

// The company's logo, for the pages that show the letterhead: a fresh
// 15-minute link signed by the Chest.
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who || !can(who.actor, "read")) return new Response(null, { status: 401 });
  try {
    const { logo } = await company(db());
    if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const { url } = await files.url(logo);
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
