import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Sql } from "./db.ts";
import { id as readId, limits } from "../shared/model.ts";
import { roomPhoto, setRoomPhoto } from "./places.ts";

// Room photos, around the browser's own upload to the Chest: an admin is
// given one upload into the room's folder (images only, 10 MB), the photo
// is recorded once the Chest confirms it holds it (the old one dropped),
// and members open it through a fresh signed thumbnail link.
export async function authorisePhoto(sql: Sql, actor: Member | null, roomId: unknown, size: unknown): Promise<{ url: string; method: string; expiresIn: number }> {
  if (!can(actor, "places.manage")) throw new AppError("forbidden");
  const room = readId(roomId);
  const [found] = await sql`select 1 from rooms where id = ${room} and archived_at is null`;
  if (!found) throw new AppError("not_found");
  if (typeof size === "number" && size > limits.photoSize) throw new AppError("file_too_large");
  return files.uploadUrl(`rooms/${room}/`, { maxSize: limits.photoSize, types: ["image/jpeg", "image/png", "image/webp"], expiresIn: 600 });
}

export async function recordPhoto(sql: Sql, actor: Member | null, roomId: unknown, name: unknown): Promise<void> {
  if (!can(actor, "places.manage")) throw new AppError("forbidden");
  const room = readId(roomId);
  // Only an object of this room's folder, as the Chest named it.
  if (typeof name !== "string" || !new RegExp(`^rooms/${room}/[0-9a-f]{20}\\.(jpg|jpeg|png|webp)$`, "u").test(name)) throw new AppError("invalid");
  const held = await files.stat(name);
  if (!held || !held.type.startsWith("image/")) throw new AppError("file_missing");
  const { previous } = await setRoomPhoto(sql, actor, room, held.name);
  if (previous && previous !== held.name) await files.delete(previous).catch(() => false);
}

export async function photoLink(sql: Sql, actor: Member | null, roomId: unknown, small: boolean): Promise<string> {
  const object = await roomPhoto(sql, actor, roomId);
  return (await files.url(object, { thumbnail: small ? 256 : 1024 })).url;
}
