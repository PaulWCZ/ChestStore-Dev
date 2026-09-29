import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { attach, uploadFolder, type On } from "../../../../lib/attachments.ts";
import { db } from "../../../../lib/db.ts";
import { AppError, type ErrorCode } from "../../../../lib/errors.ts";
import { limits } from "../../../../lib/model.ts";
import { currentMember } from "../../../../lib/session.ts";

// A file for a deal, a company or a contact, in two steps around the
// browser's own upload to the Chest: POST authorises one upload into the
// record's folder (for whoever may log on it), PUT records it once the
// Chest confirms it holds it. The bytes never pass through the tool.
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const refuse = (error: ErrorCode, status: number) => answer({ error }, status);

function failure(error: unknown): Response {
  if (error instanceof AppError) return refuse(error.code, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "file_too_large" ? 413 : 400);
  if (error instanceof TooLarge) return refuse("file_too_large", 413);
  if (error instanceof ChestError) return refuse("unavailable", 503);
  throw error;
}

function on(body: { deal?: unknown; company?: unknown; contact?: unknown }): On {
  return { deal: body.deal, company: body.company, contact: body.contact };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { size?: unknown; deal?: unknown; company?: unknown; contact?: unknown };
    const folder = await uploadFolder(db(), await currentMember(), on(body), body.size);
    const up = await files.uploadUrl(folder, { maxSize: limits.attachmentSize, expiresIn: 600 });
    return answer(up);
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; fileName?: unknown; deal?: unknown; company?: unknown; contact?: unknown };
    if (typeof body.name !== "string") return refuse("invalid", 400);
    const actor = await currentMember();
    // Checked against the record's folder before asking the Chest anything.
    await uploadFolder(db(), actor, on(body), 0);
    const held = await files.stat(body.name).catch(error => { if (error instanceof ChestError && error.code === "invalid_name") return null; throw error; });
    if (!held) return refuse("file_missing", 404);
    const saved = await attach(db(), actor, on(body), { object: held.name, fileName: body.fileName, type: held.type, size: held.size });
    return answer(saved, 201);
  } catch (error) {
    return failure(error);
  }
}
