import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { fileFor } from "../../../../lib/posts.ts";
import { currentMember } from "../../../../lib/session.ts";

// Opens a post's file for whoever sees the post: a fresh 15-minute link
// signed by the Chest (never kept in a page). ?size=256|1024 asks the Chest
// for a thumbnail of a picture; ?download to save it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const f = await fileFor(db(), await currentMember(), id);
    const search = new URL(request.url).searchParams;
    const size = search.get("size");
    const thumbnail = size === "256" ? 256 : size === "1024" ? 1024 : undefined;
    const download = search.has("download");
    let link: { url: string };
    try {
      link = await files.url(f.object, { ...(thumbnail && f.type.startsWith("image/") ? { thumbnail } : {}), download });
    } catch (error) {
      // A picture the Chest cannot reduce is sent as it is.
      if (!(error instanceof ChestError) || error.code !== "no_thumbnail") throw error;
      link = await files.url(f.object, { download });
    }
    return new Response(null, { status: 303, headers: { Location: link.url, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
