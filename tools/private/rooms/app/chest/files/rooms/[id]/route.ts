import { ChestError } from "@argentic/chest-sdk/errors";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { photoLink } from "../../../../../lib/photos.ts";
import { currentMember } from "../../../../../lib/session.ts";

// A room's photo: for whoever may see the room, a fresh link signed by the
// Chest (a 256 or 1,024 pixel thumbnail), never kept in a page.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const url = await photoLink(db(), await currentMember(), (await params).id, new URL(request.url).searchParams.get("size") === "256");
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
