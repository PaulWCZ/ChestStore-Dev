import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { openDocument } from "../../../../../../lib/records.ts";
import { currentMember } from "../../../../../../lib/session.ts";

// Opening a record's document: for HR or the record's person only, through
// a fresh 15-minute link the Chest signs (written in the journal when
// someone else than the person opens it). Never cached.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; doc: string }> }): Promise<Response> {
  const actor = await currentMember();
  if (!actor) return new Response(null, { status: 401 });
  const { id, doc } = await params;
  try {
    const url = await openDocument(db(), actor, id, doc);
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    return new Response(null, { status: 503 });
  }
}
