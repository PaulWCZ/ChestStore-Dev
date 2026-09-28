import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import { db } from "../../../../../../lib/db.ts";
import { AppError, type ErrorCode } from "../../../../../../lib/errors.ts";
import { authorisePhoto, recordPhoto } from "../../../../../../lib/photos.ts";
import { currentMember } from "../../../../../../lib/session.ts";

// A room's photo: POST authorises one upload (admins), PUT records it once
// the browser sent it to the Chest (lib/photos.ts).
const refuse = (error: ErrorCode, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function failure(error: unknown): Response {
  if (error instanceof AppError) return refuse(error.code, error.code === "not_found" || error.code === "file_missing" ? 404 : error.code === "forbidden" ? 403 : error.code === "file_too_large" ? 413 : 400);
  if (error instanceof TooLarge) return refuse("file_too_large", 413);
  if (error instanceof ChestError) return refuse("unavailable", 503);
  throw error;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { size?: unknown };
    const up = await authorisePhoto(db(), await currentMember(), (await params).id, body.size);
    return Response.json(up, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    await recordPhoto(db(), await currentMember(), (await params).id, body.name);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
