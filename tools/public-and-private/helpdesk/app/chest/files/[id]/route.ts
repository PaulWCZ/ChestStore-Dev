import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { id } from "../../../../lib/model.ts";
import { currentMember } from "../../../../lib/session.ts";

// Opens an attachment of a ticket, for whoever reads tickets: a fresh
// 15-minute link signed by the Chest.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await currentMember();
  if (!can(actor, "tickets.read")) return new Response(null, { status: 403 });
  let key: string;
  try {
    key = id((await params).id);
  } catch {
    return new Response(null, { status: 404 });
  }
  const [row] = await db()<{ object: string }[]>`select object from attachments where id = ${key}`;
  if (!row) return new Response(null, { status: 404 });
  try {
    const { url } = await files.url(row.object, { download: true });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
