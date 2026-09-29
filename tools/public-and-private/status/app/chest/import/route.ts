import { member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db.ts";
import { attempt } from "../../../lib/errors.ts";
import { importStatuspage } from "../../../lib/importer.ts";

// Import from Statuspage (lib/importer.ts): the file an editor chose, sent
// as a form (a file can be larger than a server action takes). The member
// is read from the Chest's assertion, as everywhere; the answer is a
// Result, like the server actions'.
export async function POST(request: Request): Promise<Response> {
  const who = member(request);
  if (!who) return new Response(null, { status: 401 });
  // Only from the tool's own pages (a server action checks the same).
  const from = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (from && (() => { try { return new URL(from).host !== host; } catch { return true; } })())) return new Response(null, { status: 403 });
  const result = await attempt(async () => {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("text");
    const text = file instanceof File && file.size > 0 ? await file.text() : typeof pasted === "string" ? pasted : "";
    return importStatuspage(db(), who, text);
  });
  if (result.ok) revalidatePath("/", "layout");
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
