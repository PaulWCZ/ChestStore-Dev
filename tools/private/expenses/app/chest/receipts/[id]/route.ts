import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { receiptObject } from "../../../../lib/expenses.ts";
import { asker } from "../../../../lib/http.ts";
import { thumbnailTypes } from "../../../../lib/model.ts";

// Opens an expense's receipt for whoever may see the expense: a fresh
// 15-minute link signed by the Chest (never kept in a page). ?size=256 or
// 1024 asks for the Chest's thumbnail of a photo; ?download to save it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return new Response(null, { status: 401 });
  try {
    const { id } = await params;
    const receipt = await receiptObject(db(), who.actor, id);
    const query = new URL(request.url).searchParams;
    const size = query.get("size");
    const thumbnail = (size === "256" || size === "1024") && thumbnailTypes.includes(receipt.type) ? (Number(size) as 256 | 1024) : undefined;
    if (size && thumbnail === undefined) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const { url } = await files.url(receipt.object, { ...(thumbnail ? { thumbnail } : {}), ...(query.has("download") ? { download: true } : {}) });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" || error.code === "no_thumbnail" ? 404 : 503 });
    throw error;
  }
}
