import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { fileOf } from "../../../../../../lib/messages.ts";
import { currentMember } from "../../../../../../lib/session.ts";

// A file a candidate's email brought (an attachment by its place, or
// "original": the message as received), for a recruiter: always saved,
// never shown inside the tool (an email's file is the sender's, whatever
// it is).
export async function GET(_: Request, { params }: { params: Promise<{ id: string; file: string }> }): Promise<Response> {
  try {
    const { id, file } = await params;
    const found = await fileOf(db(), await currentMember(), id, file);
    const body = await files.get(found.object);
    if (!body) return new Response(null, { status: 404 });
    const ascii = found.name.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/gu, "_");
    return new Response(new Uint8Array(body.data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(found.name)}`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: 503 });
    throw error;
  }
}
