import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { id } from "../../../../lib/model.ts";
import { currentMember } from "../../../../lib/session.ts";

// Opens an attachment of a ticket, for whoever reads tickets: a fresh
// 15-minute link signed by the Chest — always a download; ?thumbnail=1, a
// small image the Chest made of a photo, for the thread.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const thumbnail = new URL(request.url).searchParams.get("thumbnail") === "1";
  const actor = await currentMember();
  if (!can(actor, "tickets.read")) return new Response(null, { status: 403 });
  let key: string;
  try {
    key = id((await params).id);
  } catch {
    return new Response(null, { status: 404 });
  }
  const [row] = await db()<{ object: string; type: string }[]>`select object, type from attachments where id = ${key}`;
  if (!row) return new Response(null, { status: 404 });
  try {
    const { url } = await files.url(row.object, thumbnail && /^image\/(jpeg|png|gif|webp)$/u.test(row.type) ? { thumbnail: 256 } : { download: true });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
