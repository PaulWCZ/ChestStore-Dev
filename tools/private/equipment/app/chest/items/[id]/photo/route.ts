import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { can } from "../../../../../lib/access.ts";
import { db } from "../../../../../lib/db.ts";
import { AppError, type ErrorCode } from "../../../../../lib/errors.ts";
import { itemDetail, photoOf, setPhoto } from "../../../../../lib/items.ts";
import { limits } from "../../../../../lib/model.ts";
import { currentMember } from "../../../../../lib/session.ts";

// An item's photo, in the Chest's files (photos/<item>/…).
// GET: for whoever may see the item, a fresh signed link (a thumbnail).
// POST: a manager is given one upload; PUT records it once the Chest holds
// it (the old photo is deleted); DELETE removes it.
const refuse = (error: ErrorCode, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function failure(error: unknown): Response {
  if (error instanceof AppError) return refuse(error.code, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400);
  if (error instanceof TooLarge) return refuse("file_too_large", 413);
  if (error instanceof ChestError) return refuse("unavailable", 503);
  throw error;
}

async function managed(id: string) {
  const actor = await currentMember();
  if (!can(actor, "items.manage")) throw new AppError("forbidden");
  const detail = await itemDetail(db(), actor, id);
  return { actor, item: detail.item };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const object = await photoOf(db(), await currentMember(), id);
    const size = new URL(request.url).searchParams.get("size") === "1024" ? 1024 : 256;
    const { url } = await files.url(object, { thumbnail: size });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" || error.code === "no_thumbnail" ? 404 : 503 });
    throw error;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { item } = await managed((await params).id);
    const body = (await request.json().catch(() => ({}))) as { size?: unknown };
    if (typeof body.size === "number" && body.size > limits.photoSize) return refuse("file_too_large", 413);
    const up = await files.uploadUrl(`photos/${item.id}/`, { maxSize: limits.photoSize, types: ["image/jpeg", "image/png", "image/webp", "image/gif"], expiresIn: 600 });
    return Response.json(up, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { actor, item } = await managed((await params).id);
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = body.name;
    // Only an object of this item's folder, as the Chest named it.
    if (typeof name !== "string" || !new RegExp(`^photos/${item.id}/[0-9a-f]{20}\\.[a-z0-9]{1,8}$`, "u").test(name)) return refuse("invalid", 400);
    const held = await files.stat(name);
    if (!held) return refuse("file_missing", 404);
    const { previous } = await setPhoto(db(), actor, item.id, held.name);
    if (previous && previous !== held.name) await files.delete(previous).catch(() => false);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { actor, item } = await managed((await params).id);
    const { previous } = await setPhoto(db(), actor, item.id, null);
    if (previous) await files.delete(previous).catch(() => false);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
