import { call } from "@argentic/chest-app/client";

// A file sent by the browser to the Chest itself, around two actions: one
// upload granted into the item's folder (uploadPhoto, uploadInvoice), the
// file PUT there, then recorded once the Chest holds it (savePhoto,
// saveInvoice; the old one is deleted). The page is refreshed after.
// Answers null when it worked, else what to say.
export type UploadWords = { file_too_large: string; file_missing: string; unavailable: string };

export async function upload(kind: "photo" | "invoice", id: string, file: File, maxSize: number, words: UploadWords): Promise<string | null> {
  if (file.size > maxSize) return words.file_too_large;
  try {
    const grant = await call(kind === "photo" ? "uploadPhoto" : "uploadInvoice", { id, size: file.size }, { quiet: true, refresh: false });
    if (!grant.ok) return grant.message;
    const put = await fetch(grant.value.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!put.ok) return put.status === 413 ? words.file_too_large : words.file_missing;
    const { name } = await put.json() as { name: string };
    const saved = await call(kind === "photo" ? "savePhoto" : "saveInvoice", { id, name }, { quiet: true });
    return saved.ok ? null : saved.message;
  } catch {
    return words.unavailable;
  }
}
