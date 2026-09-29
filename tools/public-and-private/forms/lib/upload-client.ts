// Safe in the browser: no SDK here.
// The browser's side of a file answer: ask the tool for a one-time address
// (grant), send the file there — to the Chest, never through the tool —
// and keep what proves it was this browser that sent it: the Chest's claim
// (public form) or the tool's ticket (team form).
import { putWithProgress, type Progress } from "@argentic/chest-ui/components/logic";
import type { ErrorCode } from "./app-error.ts";
import { fileTypes, limits } from "./model.ts";

export type UploadResult = { ok: true; ref: string } | { ok: false; error: ErrorCode };

const byExtension: Record<string, string> = Object.fromEntries(Object.entries(fileTypes).map(([type, t]) => [t.ext, type]));
byExtension["jpeg"] = "image/jpeg";

// typeOf: the file's type as the browser says it, or from its extension
// (some systems say nothing for Office files).
export function typeOf(file: { name: string; type: string }): string {
  if (file.type && file.type !== "application/octet-stream") return file.type === "image/jpg" ? "image/jpeg" : file.type;
  return byExtension[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

// The bytes go with the kit's putWithProgress (progress for the file
// picker, and a way to stop: a file taken off while it is sent).
export async function uploadFile(file: File, grantUrl: string, extra: Record<string, string>, accepted: string[], options: { onProgress?: Progress; signal?: AbortSignal } = {}): Promise<UploadResult> {
  const type = typeOf(file);
  if (!accepted.includes(type)) return { ok: false, error: "file_invalid" };
  if (file.size > limits.fileSize) return { ok: false, error: "file_too_large" };
  try {
    const answer = await fetch(grantUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, size: file.size, ...extra }), ...(options.signal ? { signal: options.signal } : {}) });
    const grant = (await answer.json().catch(() => ({}))) as { url?: string; ticket?: string; error?: ErrorCode };
    if (!answer.ok || !grant.url) return { ok: false, error: grant.error ?? "unavailable" };
    const put = await putWithProgress(grant.url, file, { headers: { "Content-Type": type }, ...(options.onProgress ? { onProgress: options.onProgress } : {}), ...(options.signal ? { signal: options.signal } : {}) });
    if (put.status === 413) return { ok: false, error: "file_too_large" };
    if (put.status === 415 || put.status === 400) return { ok: false, error: "file_invalid" };
    if (put.status === 429) return { ok: false, error: "too_many" };
    if (put.status < 200 || put.status >= 300) return { ok: false, error: "unavailable" };
    if (grant.ticket) return { ok: true, ref: grant.ticket };
    const sent = (() => { try { return JSON.parse(put.text) as { claim?: string }; } catch { return {}; } })();
    return sent.claim ? { ok: true, ref: sent.claim } : { ok: false, error: "unavailable" };
  } catch (error) {
    // Taken off while it was sent: the picker forgets it, nothing to say.
    if ((error as { name?: string })?.name === "AbortError") throw error;
    return { ok: false, error: "unavailable" };
  }
}

// uploadImage: a picture for a form (its cover, a picture choice) — the
// same three steps, on the team host; answers the ticket the form's action
// takes.
export async function uploadImage(file: File, formId: string): Promise<UploadResult> {
  const type = typeOf(file);
  if (!["image/png", "image/jpeg", "image/webp"].includes(type)) return { ok: false, error: "image_invalid" };
  if (file.size > limits.image) return { ok: false, error: "image_too_large" };
  try {
    const answer = await fetch("/chest/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form: formId, type, size: file.size }) });
    const grant = (await answer.json().catch(() => ({}))) as { url?: string; ticket?: string; error?: ErrorCode };
    if (!answer.ok || !grant.url || !grant.ticket) return { ok: false, error: grant.error ?? "unavailable" };
    const put = await fetch(grant.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
    if (put.status === 413) return { ok: false, error: "image_too_large" };
    if (put.status === 415 || put.status === 400) return { ok: false, error: "image_invalid" };
    if (!put.ok) return { ok: false, error: "unavailable" };
    return { ok: true, ref: grant.ticket };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
