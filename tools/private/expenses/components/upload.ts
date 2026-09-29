// Safe in the browser: sends one file (a receipt, a registration
// certificate) from the member's browser straight to the Chest: the tool
// authorises the upload (/chest/api/receipts), the browser PUTs the file,
// the save then checks it arrived (lib/receipts.ts).
import type { ErrorCode } from "../lib/app-error.ts";
import { limits, receiptTypes } from "../lib/model.ts";

// A phone's HEIC photo sometimes comes without a type: its name tells.
export function typeOf(file: File): string {
  if (file.type) return file.type === "image/jpg" ? "image/jpeg" : file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ({ heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[ext] ?? "";
}

export type Uploaded = { ok: true; object: string } | { ok: false; error: ErrorCode; values?: Record<string, number> };

export async function upload(file: File): Promise<Uploaded> {
  const type = typeOf(file);
  const max = { max: limits.receiptSize >> 20 };
  if (!(receiptTypes as readonly string[]).includes(type)) return { ok: false, error: "file_type" };
  if (file.size > limits.receiptSize) return { ok: false, error: "file_too_large", values: max };
  try {
    const grant = await fetch("/chest/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, size: file.size }) });
    const up = (await grant.json()) as { url?: string; object?: string; error?: ErrorCode; values?: Record<string, number> };
    if (!grant.ok || !up.url || !up.object) return { ok: false, error: up.error ?? "unavailable", ...(up.values ? { values: up.values } : {}) };
    const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
    if (!put.ok) return { ok: false, error: put.status === 413 ? "file_too_large" : put.status === 415 || put.status === 400 ? "file_type" : "file_missing", values: max };
    return { ok: true, object: up.object };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
