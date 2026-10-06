// Safe in the browser: sends one file (a receipt, a registration
// certificate) from the member's browser straight to the Chest: the tool
// authorises the upload (the action grantUpload), the browser PUTs the file,
// the save then checks it arrived (lib/receipts.ts). The bytes go with
// the UI kit's putWithProgress, which says how far they got.
import { call } from "@argentic/chest-app/client";
import { putWithProgress, type Progress } from "@argentic/chest-ui/components/logic";
import { errorCodes, type ErrorCode } from "../shared/app-error.ts";
import { limits, receiptTypes } from "../shared/model.ts";

const errorWords = new Set<string>(errorCodes);

// A phone's HEIC photo sometimes comes without a type: its name tells.
export function typeOf(file: File): string {
  if (file.type) return file.type === "image/jpg" ? "image/jpeg" : file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ({ heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[ext] ?? "";
}

export type Uploaded = { ok: true; object: string } | { ok: false; error: ErrorCode; values?: Record<string, number> };

export async function upload(file: File, { onProgress, signal }: { onProgress?: Progress; signal?: AbortSignal } = {}): Promise<Uploaded> {
  const type = typeOf(file);
  const max = { max: limits.receiptSize >> 20 };
  if (!(receiptTypes as readonly string[]).includes(type)) return { ok: false, error: "file_type" };
  if (file.size > limits.receiptSize) return { ok: false, error: "file_too_large", values: max };
  try {
    // The grant changes nothing on the page: no refresh, and a refusal is
    // said by the caller.
    const grant = await call("grantUpload", { type, size: file.size }, { quiet: true, refresh: false });
    if (!grant.ok) return { ok: false, error: (errorWords.has(grant.error) ? grant.error : "unavailable") as ErrorCode, ...(grant.error === "file_too_large" ? { values: max } : grant.error === "too_many" ? { values: { max: 60 } } : {}) };
    const up = grant.value;
    const put = await putWithProgress(up.url, file, { headers: { "Content-Type": type }, ...(onProgress ? { onProgress } : {}), ...(signal ? { signal } : {}) });
    if (put.status >= 300) return { ok: false, error: put.status === 413 ? "file_too_large" : put.status === 415 || put.status === 400 ? "file_type" : "file_missing", values: max };
    return { ok: true, object: up.object };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
