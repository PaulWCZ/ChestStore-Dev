import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { attachment } from "../../../../lib/cards.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { currentMember } from "../../../../lib/session.ts";

// Opens a card's file: for whoever sees the card, a fresh 15-minute link
// signed by the Chest (never kept in a page).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const f = await attachment(db(), await currentMember(), id);
    const download = new URL(request.url).searchParams.has("download");
    const { url } = await files.url(f.object, { download });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
