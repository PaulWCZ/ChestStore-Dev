import { randomBytes } from "node:crypto";
import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { imagePattern, limits, type Definition, type Image } from "./model.ts";
import { sign, verify } from "./signature.ts";

// A form's pictures: its cover, and the pictures of a picture choice. An
// editor's browser sends each to the Chest (a one-time address on the team
// host, like a file answer), the tool checks it — PNG, JPEG or WebP by its
// first bytes, 2 MB at most — and moves it under public/covers/ or
// public/pictures/, which the Chest serves on the public host (Proposal
// (studio): files.publicFiles), so a visitor's page shows it with no
// signed link. The names are random: nobody finds a picture of a form
// they were not given.
export const imageTypes = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
type ImageType = keyof typeof imageTypes;
const isImageType = (v: unknown): v is ImageType => typeof v === "string" && Object.hasOwn(imageTypes, v);
export type Folder = "covers" | "pictures";

export function sniffImage(head: Uint8Array): ImageType | null {
  const at = (bytes: number[], from = 0) => bytes.every((b, i) => head[from + i] === b);
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

// grantImage: a one-time address for one picture, and the ticket that
// names it (signed by the tool, two hours).
export async function grantImage(type: unknown, size: unknown, now = Date.now()): Promise<{ url: string; ticket: string }> {
  if (!isImageType(type)) throw new AppError("image_invalid");
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) throw new AppError("image_invalid");
  if (size > limits.image) throw new AppError("image_too_large");
  const hex = randomBytes(10).toString("hex");
  const extension = imageTypes[type];
  try {
    const up = await files.uploadUrl(`uploads/team/${hex}.${extension}`, { types: [type], maxSize: limits.image, expiresIn: 900 });
    const value = `img.${hex}.${extension}.${now}`;
    return { url: up.url, ticket: `${value}.${sign("image", value)}` };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("image_too_large");
    throw error;
  }
}

// acceptImage checks the picture a ticket names and publishes it.
export async function acceptImage(ticket: unknown, folder: Folder, now = Date.now()): Promise<Image> {
  if (typeof ticket !== "string" || ticket.length > 200) throw new AppError("image_invalid");
  const parts = ticket.split(".");
  if (parts.length !== 5) throw new AppError("image_invalid");
  const [k, hex, extension, time, signature] = parts as [string, string, string, string, string];
  if (k !== "img" || !/^[0-9a-f]{20}$/u.test(hex) || !Object.values(imageTypes).includes(extension as never) || !/^\d{13}$/u.test(time)) throw new AppError("image_invalid");
  if (!verify("image", `${k}.${hex}.${extension}.${time}`, signature) || now - Number(time) > 2 * 3600_000) throw new AppError("image_invalid");
  const name = `uploads/team/${hex}.${extension}`;
  try {
    const held = await files.stat(name);
    if (!held) throw new AppError("image_invalid");
    const body = await files.get(name);
    const type = body ? sniffImage(body.data.subarray(0, 16)) : null;
    if (!body || held.size > limits.image || !type || imageTypes[type] !== extension) {
      await files.delete(name).catch(() => false);
      throw new AppError(held.size > limits.image ? "image_too_large" : "image_invalid");
    }
    const kept = `public/${folder}/${hex}.${extension}`;
    const moved = await files.move(name, kept);
    return { object: kept, version: moved.updated.replace(/[^0-9]/gu, "").slice(0, 17) || String(now) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// The address of a picture: on the public host, the Chest serves public
// files by themselves; on the team host (the builder, a team form), a
// signed link of 15 minutes. Null when the Chest cannot say (the page
// shows the choice's words alone).
export async function imageUrl(image: Image | null | undefined, host: "public" | "team"): Promise<string | null> {
  if (!image || !imagePattern.test(image.object)) return null;
  try {
    if (host === "public") return files.publicUrl(image.object, { version: image.version });
    return (await files.url(image.object)).url;
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}

// The addresses of every picture of a form, by object: what the
// respondent's page needs.
export async function pictureUrls(def: Definition, host: "public" | "team"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const q of def.pages.flatMap(p => p.questions)) {
    for (const o of q.options ?? []) {
      if (!o.image || out[o.image.object]) continue;
      const url = await imageUrl(o.image, host);
      if (url) out[o.image.object] = url;
    }
  }
  return out;
}

// sweepImages deletes the pictures no form uses any more (a cover
// replaced, a picture choice changed): every draft and version is read, so
// an older version's pictures stay for its answers.
// A picture sent within the last day is kept: an editor may be about to
// use it.
export async function sweepImages(sql: Sql, now = new Date()): Promise<number> {
  const used = new Set<string>();
  const covers = await sql<{ object: string }[]>`select cover->>'object' as object from forms where cover is not null`;
  for (const c of covers) used.add(c.object);
  const texts = await sql<{ text: string }[]>`select draft::text as text from forms union all select definition::text from versions`;
  for (const t of texts) for (const m of t.text.matchAll(/public\/pictures\/[0-9a-f]{20}\.(png|jpg|webp)/gu)) used.add(m[0]);
  let gone = 0;
  for (const prefix of ["public/covers/", "public/pictures/"]) {
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const { files: list, next } = await files.list({ prefix, ...(after ? { after } : {}) });
      for (const f of list) if (!used.has(f.name) && now.getTime() - new Date(f.updated).getTime() > 86400000 && (await files.delete(f.name).catch(() => false))) gone++;
      if (!next) break;
      after = next;
    }
  }
  return gone;
}
