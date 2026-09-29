import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { AppError, type ErrorCode } from "../../../../lib/errors.ts";
import { currentMember } from "../../../../lib/session.ts";
import { importLimits, importSlack, readSlack } from "../../../../lib/transfer.ts";

// A Slack export, sent by the browser as it is (application/zip), read in
// memory (the Chest gives no disk). Without ?channel=: the channels it
// holds; with: that channel imported.
const refuse = (error: ErrorCode, status: number, values?: Record<string, number | string>) => Response.json({ error, ...(values ? { values } : {}) }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await currentMember();
    if (!can(actor, "publish")) throw new AppError("forbidden");
    if (Number(request.headers.get("content-length") ?? "0") > importLimits.size) return refuse("file_too_large", 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > importLimits.size) return refuse("file_too_large", 413);
    const channel = new URL(request.url).searchParams.get("channel");
    if (!channel) return Response.json({ channels: readSlack(bytes).channels }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(await importSlack(db(), actor, bytes, channel), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return refuse(error.code, error.code === "forbidden" ? 403 : 400, error.values);
    throw error;
  }
}
