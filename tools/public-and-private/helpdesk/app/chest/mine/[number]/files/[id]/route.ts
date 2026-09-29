import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { db } from "../../../../../../lib/db.ts";
import { currentMember } from "../../../../../../lib/session.ts";
import { myFile } from "../../../../../../lib/tickets.ts";

// A file of the member's own request (theirs, or one the team sent with an
// answer — never a note's): a fresh 15-minute link signed by the Chest,
// always a download. Anything else is 404.
export async function GET(_: Request, { params }: { params: Promise<{ number: string; id: string }> }): Promise<Response> {
  const { number, id } = await params;
  const found = await myFile(db(), await currentMember(), number, id);
  if (!found) return new Response(null, { status: 404 });
  try {
    const { url } = await files.url(found.object, { download: true });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
