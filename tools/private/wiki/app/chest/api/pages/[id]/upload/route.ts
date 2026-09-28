import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { db } from "../../../../../../lib/db.ts";
import { AppError, type ErrorCode } from "../../../../../../lib/errors.ts";
import { attach, folderOf, objectPattern } from "../../../../../../lib/files.ts";
import { limits } from "../../../../../../lib/model.ts";
import { page } from "../../../../../../lib/pages.ts";
import { currentMember } from "../../../../../../lib/session.ts";

// An image or a file for a page, in two steps around the browser's own
// upload to the Chest: POST authorises one upload into the page's folder
// (for an editor of its space), PUT records it once the Chest confirms it
// holds it.
const refuse = (error: ErrorCode, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function failure(error: unknown): Response {
  if (error instanceof AppError) return refuse(error.code, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400);
  if (error instanceof TooLarge) return refuse("file_too_large", 413);
  if (error instanceof ChestError) return refuse("unavailable", 503);
  throw error;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const p = await page(db(), await currentMember(), id, "write");
    const body = (await request.json().catch(() => ({}))) as { size?: unknown };
    if (typeof body.size === "number" && body.size > limits.fileSize) return refuse("file_too_large", 413);
    const up = await files.uploadUrl(folderOf(p.id), { maxSize: limits.fileSize, expiresIn: 600 });
    return Response.json(up, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const actor = await currentMember();
    const p = await page(db(), actor, id, "write");
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; fileName?: unknown };
    // Only an object of this page's folder, as the Chest named it.
    if (typeof body.name !== "string" || !objectPattern.test(body.name) || !body.name.startsWith(folderOf(p.id))) return refuse("invalid", 400);
    const held = await files.stat(body.name);
    if (!held) return refuse("file_missing", 404);
    const saved = await attach(db(), actor, p.id, { object: held.name, fileName: body.fileName, type: held.type, size: held.size });
    return Response.json({ id: saved.id, image: saved.image, fileName: saved.fileName }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
