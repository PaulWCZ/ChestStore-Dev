import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { attach, cardDetail } from "../../../../../../lib/cards.ts";
import { db } from "../../../../../../lib/db.ts";
import { AppError, type ErrorCode } from "../../../../../../lib/errors.ts";
import { limits } from "../../../../../../lib/model.ts";
import { currentMember } from "../../../../../../lib/session.ts";

// A file for a card, in two steps around the browser's own upload to the
// Chest: POST authorises one upload into the card's folder (for someone who
// works on the board), PUT records it once the Chest confirms it holds it.
const refuse = (error: ErrorCode, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

async function writable(id: string) {
  const actor = await currentMember();
  const card = await cardDetail(db(), actor, id);
  if (card.access !== "write" && card.access !== "own") throw new AppError("forbidden");
  if (card.archived) throw new AppError("forbidden");
  return { actor, card };
}

function failure(error: unknown): Response {
  if (error instanceof AppError) return refuse(error.code, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400);
  if (error instanceof TooLarge) return refuse("file_too_large", 413);
  if (error instanceof ChestError) return refuse("unavailable", 503);
  throw error;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const { card } = await writable(id);
    const body = (await request.json().catch(() => ({}))) as { size?: unknown };
    if (typeof body.size === "number" && body.size > limits.attachmentSize) return refuse("file_too_large", 413);
    const up = await files.uploadUrl(`cards/${card.id}/`, { maxSize: limits.attachmentSize, expiresIn: 600 });
    return Response.json(up, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const { actor, card } = await writable(id);
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; fileName?: unknown };
    const name = body.name;
    // Only an object of this card's folder, as the Chest named it.
    if (typeof name !== "string" || !name.startsWith(`cards/${card.id}/`) || !/^cards\/[0-9]+\/[0-9a-f]{20}\.[a-z0-9]{1,8}$/u.test(name)) return refuse("invalid", 400);
    const held = await files.stat(name);
    if (!held) return refuse("file_missing", 404);
    const saved = await attach(db(), actor, card.id, { object: held.name, fileName: body.fileName, type: held.type, size: held.size });
    return Response.json(saved, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
