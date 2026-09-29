// Safe in the browser: no SDK here.
// The browser's side of a CV upload: ask the tool for a one-time address
// (grant), send the file there — to the Chest, never through the tool —
// and keep the ticket the tool gave, to send with the form.
import type { ErrorCode } from "./app-error.ts";

export type UploadResult = { ok: true; ticket: string } | { ok: false; error: ErrorCode | "cv_off" };

const byExtension: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heic",
};

// typeOf: the file's type as the browser says it, or from its extension
// (some systems say nothing for Word files).
export function typeOf(file: { name: string; type: string }): string {
  // A phone's photo may say image/heif: the same family, one name here.
  if (file.type === "image/heif") return "image/heic";
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return byExtension[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export const cvAccept = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/heic,image/heif";
// The same, as the kit's file picker takes it (by extension: some systems
// give Word files no type): a photo of the CV is fine.
export const cvKinds = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".heic", ".heif"];
export const cvMaxSize = 10 << 20;

export async function uploadCv(file: File, grantUrl: string, extra: Record<string, string> = {}): Promise<UploadResult> {
  const type = typeOf(file);
  if (!Object.values(byExtension).includes(type)) return { ok: false, error: "cv_invalid" };
  if (file.size > cvMaxSize) return { ok: false, error: "cv_too_large" };
  try {
    const answer = await fetch(grantUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, size: file.size, ...extra }) });
    const grant = (await answer.json().catch(() => ({}))) as { url?: string; ticket?: string; error?: ErrorCode | "cv_off" };
    if (!answer.ok || !grant.url || !grant.ticket) return { ok: false, error: grant.error ?? "unavailable" };
    const put = await fetch(grant.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
    if (put.status === 413) return { ok: false, error: "cv_too_large" };
    if (put.status === 415 || put.status === 400) return { ok: false, error: "cv_invalid" };
    if (put.status === 429) return { ok: false, error: "too_many" };
    if (!put.ok) return { ok: false, error: "unavailable" };
    return { ok: true, ticket: grant.ticket };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

// An image of the careers page (logo, photo): PNG, JPEG or WebP, 2 MB.
export const imageAccept = "image/png,image/jpeg,image/webp";
export async function uploadImage(file: File, grantUrl = "/chest/api/image"): Promise<UploadResult> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { ok: false, error: "invalid" };
  if (file.size > 2 << 20) return { ok: false, error: "too_large_image" };
  try {
    const answer = await fetch(grantUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: file.type, size: file.size }) });
    const grant = (await answer.json().catch(() => ({}))) as { url?: string; ticket?: string; error?: ErrorCode };
    if (!answer.ok || !grant.url || !grant.ticket) return { ok: false, error: grant.error ?? "unavailable" };
    const put = await fetch(grant.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (put.status === 413) return { ok: false, error: "too_large_image" };
    if (!put.ok) return { ok: false, error: put.status === 429 ? "too_many" : "unavailable" };
    return { ok: true, ticket: grant.ticket };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
