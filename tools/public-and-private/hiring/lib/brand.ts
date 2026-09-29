import { randomBytes } from "node:crypto";
import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "./app-error.ts";
import { sign, verify } from "./signature.ts";

// The careers page's images (a logo, up to three photos): a recruiter's
// browser sends each to the Chest (a one-time address on the team host,
// like a CV), the tool checks it — PNG, JPEG or WebP by its first bytes,
// 2 MB at most — and moves it under public/brand/, which the Chest serves
// on the public host (Proposal (studio): files.publicFiles).
export const imageTypes = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
type ImageType = keyof typeof imageTypes;
export const imageMaxSize = 2 << 20;
const isImageType = (v: unknown): v is ImageType => typeof v === "string" && Object.hasOwn(imageTypes, v);

export function sniffImage(head: Uint8Array): ImageType | null {
  const at = (bytes: number[], from = 0) => bytes.every((b, i) => head[from + i] === b);
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export async function grantImage(type: unknown, size: unknown, now = Date.now()): Promise<{ url: string; ticket: string }> {
  if (!isImageType(type)) throw new AppError("invalid");
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) throw new AppError("invalid");
  if (size > imageMaxSize) throw new AppError("too_large_image");
  const hex = randomBytes(10).toString("hex");
  const extension = imageTypes[type];
  try {
    const up = await files.uploadUrl(`uploads/team/${hex}.${extension}`, { types: [type], maxSize: imageMaxSize, expiresIn: 900 });
    const value = `img.${hex}.${extension}.${now}`;
    return { url: up.url, ticket: `${value}.${sign("image", value)}` };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("too_large_image");
    throw error;
  }
}

// acceptImage checks the file a ticket names and publishes it. Says its
// public object and version.
export async function acceptImage(ticket: unknown, now = Date.now()): Promise<{ object: string; version: string }> {
  if (typeof ticket !== "string" || ticket.length > 200) throw new AppError("invalid");
  const parts = ticket.split(".");
  if (parts.length !== 5) throw new AppError("invalid");
  const [k, hex, extension, time, signature] = parts as [string, string, string, string, string];
  if (k !== "img" || !/^[0-9a-f]{20}$/u.test(hex) || !Object.values(imageTypes).includes(extension as never) || !/^\d{13}$/u.test(time)) throw new AppError("invalid");
  if (!verify("image", `${k}.${hex}.${extension}.${time}`, signature) || now - Number(time) > 2 * 3600_000) throw new AppError("invalid");
  const name = `uploads/team/${hex}.${extension}`;
  try {
    const held = await files.stat(name);
    if (!held) throw new AppError("invalid");
    const body = await files.get(name);
    const type = body ? sniffImage(body.data.subarray(0, 16)) : null;
    if (!body || held.size > imageMaxSize || !type || imageTypes[type] !== extension) {
      await files.delete(name).catch(() => false);
      throw new AppError("invalid");
    }
    const kept = `public/brand/${hex}.${extension}`;
    const moved = await files.move(name, kept);
    return { object: kept, version: moved.updated.replace(/[^0-9]/gu, "").slice(0, 17) || String(now) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}
