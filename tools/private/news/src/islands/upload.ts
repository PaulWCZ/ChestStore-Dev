import { call, toast } from "../core/client.tsx";
import type { Catalogue } from "../i18n/index.ts";

// A file sent from the browser to the Chest itself, in three steps: News
// authorises one upload (requestUpload), the browser PUTs the file to the
// Chest's address, News checks the Chest holds it and records it
// (recordUpload). A refusal is said in a toast; null then.
export type FileInfo = { id: string; fileName: string; type: string; size: number };
export type UploadRole = "cover" | "attachment" | "image" | "inline";

export async function upload(file: File, role: UploadRole, errors: Catalogue["errors"]): Promise<FileInfo | null> {
  const failed = (text: string) => { toast({ text, tone: "error" }); return null; };
  const type = file.type || "application/octet-stream";
  const grant = await call("requestUpload", { role, size: file.size }, { refresh: false });
  if (!grant.ok) return null;
  let put: Response;
  try {
    put = await fetch(grant.value.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
  } catch {
    return failed(errors.unavailable);
  }
  if (!put.ok) return failed(put.status === 413 ? errors.file_too_large : put.status === 415 ? errors.not_image : errors.file_missing);
  const { name } = await put.json() as { name: string };
  const saved = await call("recordUpload", { role, name, fileName: file.name }, { refresh: false });
  return saved.ok ? saved.value : null;
}
