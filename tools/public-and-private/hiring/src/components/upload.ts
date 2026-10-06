// The browser's side of an upload: ask the tool for a one-time address
// (an action), send the file there — to the Chest, never through the
// tool — and keep what the form sends back with it: a recruiter's file,
// the ticket the tool signed; a visitor's CV, the claim the Chest gave
// (Proposal (studio): public uploads, on the host the page is on).
import { call } from "@argentic/chest-app/client";

// What the person reads when it fails: the tool's words (an action's
// refusal is already in their language; the Chest's answers to the PUT
// are said by code).
export type UploadWords = { invalid: string; tooLarge: string; unavailable: string; limit: string };
export type Uploaded = { ok: true; ref: string } | { ok: false; error: string; code: string };

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
// An image of the careers page (logo, photo): PNG, JPEG or WebP, 2 MB.
export const imageAccept = "image/png,image/jpeg,image/webp";
export const imageMaxSize = 2 << 20;

async function put(url: string, file: File, type: string, words: UploadWords): Promise<{ ok: true; answer: unknown } | { ok: false; error: string; code: string }> {
  try {
    const sent = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": type } });
    if (sent.status === 413) return { ok: false, error: words.tooLarge, code: "too_large" };
    if (sent.status === 415 || sent.status === 400) return { ok: false, error: words.invalid, code: "invalid" };
    if (sent.status === 429) return { ok: false, error: words.limit, code: "limit" };
    if (!sent.ok) return { ok: false, error: words.unavailable, code: "unavailable" };
    return { ok: true, answer: await sent.json().catch(() => null) };
  } catch {
    return { ok: false, error: words.unavailable, code: "unavailable" };
  }
}

// A recruiter's CV or file (a referral's CV, an offer letter).
export async function uploadTeamFile(file: File, words: UploadWords): Promise<Uploaded> {
  const type = typeOf(file);
  if (!Object.values(byExtension).includes(type)) return { ok: false, error: words.invalid, code: "cv_invalid" };
  if (file.size > cvMaxSize) return { ok: false, error: words.tooLarge, code: "cv_too_large" };
  const grant = await call("cvUpload", { type, size: file.size }, { quiet: true, refresh: false });
  if (!grant.ok) return { ok: false, error: grant.message, code: grant.error };
  const sent = await put(grant.value.url, file, type, words);
  return sent.ok ? { ok: true, ref: grant.value.ticket } : sent;
}

// A visitor's CV, for an open job: the claim the Chest answers.
export async function uploadPublicCv(file: File, slug: string, words: UploadWords): Promise<Uploaded> {
  const type = typeOf(file);
  if (!Object.values(byExtension).includes(type)) return { ok: false, error: words.invalid, code: "cv_invalid" };
  if (file.size > cvMaxSize) return { ok: false, error: words.tooLarge, code: "cv_too_large" };
  const grant = await call("publicCvUpload", { slug, type, size: file.size }, { quiet: true, refresh: false });
  if (!grant.ok) return { ok: false, error: grant.message, code: grant.error };
  const sent = await put(grant.value.url, file, type, words);
  if (!sent.ok) return sent;
  const claim = (sent.answer as { claim?: unknown } | null)?.claim;
  return typeof claim === "string" ? { ok: true, ref: claim } : { ok: false, error: words.unavailable, code: "unavailable" };
}

// An image of the careers page.
export async function uploadImage(file: File, words: UploadWords): Promise<Uploaded> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { ok: false, error: words.invalid, code: "invalid" };
  if (file.size > imageMaxSize) return { ok: false, error: words.tooLarge, code: "too_large_image" };
  const grant = await call("imageUpload", { type: file.type, size: file.size }, { quiet: true, refresh: false });
  if (!grant.ok) return { ok: false, error: grant.message, code: grant.error };
  const sent = await put(grant.value.url, file, file.type, words);
  return sent.ok ? { ok: true, ref: grant.value.ticket } : sent;
}
