import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { AppError, type ErrorCode } from "../../../../lib/errors.ts";
import { coverTypes, fileName, limits, videoTypes } from "../../../../lib/model.ts";
import { recordUpload, type UploadRole } from "../../../../lib/posts.ts";
import { currentMember } from "../../../../lib/session.ts";

// A picture (cover, gallery, in the text), a video (gallery) or a file for a post, in two steps around the browser's own
// upload to the Chest: POST authorises one upload into the uploads folder
// (publishers; anyone, for the picture of a proposal), PUT records it once the Chest confirms it holds it. The
// file is its uploader's until they save the post (lib/posts.ts).
const refuse = (error: ErrorCode, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const folder = "uploads/";

function failure(error: unknown): Response {
  if (error instanceof AppError) return refuse(error.code, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400);
  if (error instanceof TooLarge) return refuse("file_too_large", 413);
  if (error instanceof ChestError) return refuse("unavailable", 503);
  throw error;
}

const roles = ["cover", "attachment", "image", "inline"] as const;
const roleOf = (value: unknown): UploadRole => {
  if (!(roles as readonly unknown[]).includes(value)) throw new AppError("invalid");
  return value as UploadRole;
};

const allowed = (actor: Awaited<ReturnType<typeof currentMember>>, role: UploadRole) => can(actor, "publish") || (role === "cover" && can(actor, "read"));

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { role?: unknown; size?: unknown };
    const role = roleOf(body.role);
    // Everyone may add a picture to a proposal; the rest is the publishers'.
    if (!allowed(await currentMember(), role)) throw new AppError("forbidden");
    // Pictures as the Chest makes thumbnails of them; a gallery also takes
    // videos (played as they are), up to the attachments' size.
    const max = role === "cover" || role === "inline" ? limits.coverSize : limits.attachmentSize;
    const types = role === "cover" || role === "inline" ? [...coverTypes] : role === "image" ? [...coverTypes, ...videoTypes] : null;
    if (typeof body.size === "number" && body.size > max) return refuse("file_too_large", 413);
    const up = await files.uploadUrl(folder, { maxSize: max, expiresIn: 600, ...(types ? { types } : {}) });
    return Response.json(up, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const actor = await currentMember();
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; fileName?: unknown; role?: unknown };
    const role = roleOf(body.role);
    if (!allowed(actor, role)) throw new AppError("forbidden");
    // Only an object of the uploads folder, as the Chest named it.
    if (typeof body.name !== "string" || !/^uploads\/[0-9a-f]{20}\.[a-z0-9]{1,8}$/u.test(body.name)) return refuse("invalid", 400);
    const held = await files.stat(body.name);
    if (!held) return refuse("file_missing", 404);
    const saved = await recordUpload(db(), actor, { object: held.name, fileName: fileName(body.fileName), type: held.type, size: held.size, role });
    return Response.json(saved, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
