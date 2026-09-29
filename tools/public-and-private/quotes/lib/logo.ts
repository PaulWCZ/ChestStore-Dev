import { randomBytes } from "node:crypto";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { limits } from "./model.ts";
import { ImageError, readImage } from "./pdf/image.ts";

// The company's logo goes from the admin's browser to the Chest's files
// directly: the tool names the object and authorises that one upload,
// then checks what arrived is an image its PDFs can print (a PNG or a
// JPEG). An earlier logo is kept: documents issued with it still print it.

const types: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
export const logoPattern = /^logo\/[0-9a-f]{24}\.(png|jpg)$/u;

export async function grantLogo(actor: Member | null, input: { type?: unknown; size?: unknown }): Promise<{ url: string; method: string; object: string }> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (typeof input.type !== "string" || !(input.type in types)) throw new AppError("logo_type");
  if (typeof input.size !== "number" || !Number.isInteger(input.size) || input.size < 1) throw new AppError("invalid");
  if (input.size > limits.logoSize) throw new AppError("logo_too_large");
  const object = `logo/${randomBytes(12).toString("hex")}.${types[input.type]}`;
  const up = await files.uploadUrl(object, { maxSize: limits.logoSize, types: [input.type], expiresIn: 300 });
  return { url: up.url, method: up.method, object };
}

export async function checkLogo(actor: Member | null, object: unknown): Promise<{ object: string; type: string }> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (typeof object !== "string" || !logoPattern.test(object)) throw new AppError("file_missing");
  const file = await files.get(object);
  if (!file) throw new AppError("file_missing");
  if (file.data.byteLength > limits.logoSize) throw new AppError("logo_too_large");
  try {
    readImage(file.data);
  } catch (error) {
    if (error instanceof ImageError) {
      await files.delete(object).catch(() => false);
      throw new AppError("logo_type");
    }
    throw error;
  }
  return { object, type: file.type };
}
