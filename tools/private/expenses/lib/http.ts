import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import { member, type Member } from "@argentic/chest-sdk/member";
import { AppError, type ErrorCode } from "./app-error.ts";
import { isLocale, type Locale } from "./i18n/index.ts";

// For the routes of /chest (uploads, receipts, exports): who asks, as the
// Chest asserts it on this very request, and answers as codes.
export function asker(request: Request): { actor: Member; locale: Locale } | null {
  const actor = member(request);
  if (!actor) return null;
  return { actor, locale: isLocale(actor.locale) ? actor.locale : "en" };
}

const noStore = { "Cache-Control": "no-store" };

export function refuse(error: ErrorCode, status: number, values?: Record<string, number | string>): Response {
  return Response.json({ error, ...(values ? { values } : {}) }, { status, headers: noStore });
}

export function failure(error: unknown): Response {
  if (error instanceof AppError) return refuse(error.code, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "file_too_large" ? 413 : 400, error.values);
  if (error instanceof TooLarge) return refuse("file_too_large", 413);
  if (error instanceof ChestError) return refuse("unavailable", 503);
  throw error;
}

// A download's name, ASCII only (the words are in the file).
export function attachment(fileName: string): string {
  return `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/gu, "_")}"`;
}
