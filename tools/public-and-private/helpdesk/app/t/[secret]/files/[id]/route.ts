import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { db } from "../../../../../lib/db.ts";
import { linkFile } from "../../../../../lib/tickets.ts";

// A file of a customer's request, for whoever holds its follow-up link:
// theirs or the team's answers' (never a note's, never another request's).
// The bytes come through the tool — the Chest's signed links are for
// members' browsers — always as a download, never run by the browser.
export async function GET(_: Request, { params }: { params: Promise<{ secret: string; id: string }> }): Promise<Response> {
  const { secret, id } = await params;
  const found = await linkFile(db(), secret, id);
  if (!found) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const object = await files.get(found.object);
    if (!object) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(object.data), {
      headers: {
        "Content-Type": found.type,
        "Content-Length": String(object.data.byteLength),
        "Content-Disposition": `attachment; filename="${found.fileName.replace(/[^\x20-\x7e]|["\\]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ChestError) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
