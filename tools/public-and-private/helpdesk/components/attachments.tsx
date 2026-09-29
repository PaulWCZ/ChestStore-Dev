"use client";

import { FilePicker, type PickedFile, type Upload } from "@argentic/chest-ui/components";
import { putWithProgress, type FileWords } from "@argentic/chest-ui/components/logic";
import type { ErrorCode } from "../lib/app-error.ts";
import { format } from "../lib/i18n/format.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { fileTypes, isFileType, limits } from "../lib/model.ts";

// Files added to a message, in the kit's FilePicker (several at once or by
// dropping them, the limits said first, progress, remove, retry). Each goes
// from the browser to the Chest as soon as it is chosen (the tool only
// authorises it); what comes back — a claim for a visitor, the object's
// name for a member — is what the message sends. A file removed here is
// never sent: the Chest (a visitor's) or the nightly cleanup (a member's)
// deletes it. The Chest sniffs the bytes of images, PDFs and archives.
export type { PickedFile };
export type Grant = { ok: true; url: string } | { ok: false; error: ErrorCode; max?: number };

// What the picker accepts: the types, and their extensions (some systems
// know a file only by its extension).
const accept = [...Object.keys(fileTypes), ...Object.values(fileTypes).map(e => "." + e)];
const byExtension = Object.fromEntries([...Object.entries(fileTypes).map(([type, ext]) => [ext, type]), ["jpeg", "image/jpeg"]]) as Record<string, string>;
const typeOf = (file: File): string => (isFileType(file.type) ? file.type : byExtension[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? file.type);

// The Chest's answer to an upload, as a code of ours.
const refusal = (status: number): ErrorCode => (status === 413 ? "file_too_large" : status === 415 || status === 400 ? "file_type" : status === 429 ? "too_many" : "files_unavailable");

// What a message sends: the files that arrived, with their names.
export const readyFiles = (items: readonly PickedFile[]) => JSON.stringify(items.filter(i => i.status === "ready" && i.ref).map(i => ({ ref: i.ref, name: i.name })));
// A file still on its way (or failed and not removed): the message waits.
export const filesPending = (items: readonly PickedFile[]) => items.some(i => i.status !== "ready");

export function Attachments({ files, setFiles, grant, kind, label, t }: {
  files: readonly PickedFile[];
  setFiles: (update: (current: readonly PickedFile[]) => PickedFile[]) => void;
  grant: (type: string, size: number) => Promise<Grant>;
  kind: "public" | "team";
  label: string;
  t: { files: FileWords; errors: Catalogue["errors"] };
}) {
  const say = (code: ErrorCode, max?: number) => format(t.errors[code], { max: max ?? limits.fileSize >> 20 });
  const upload: Upload = async (file, { onProgress, signal }) => {
    const type = typeOf(file);
    const answer = await grant(type, file.size);
    if (!answer.ok) return { ok: false, error: say(answer.error, answer.max) };
    const sent = await putWithProgress(answer.url, file, { headers: { "Content-Type": type }, onProgress, signal });
    if (sent.status >= 300) return { ok: false, error: say(refusal(sent.status)) };
    try {
      const body = JSON.parse(sent.text) as { claim?: unknown; name?: unknown };
      const ref = kind === "public" ? body.claim : body.name;
      return typeof ref === "string" ? { ok: true, ref } : { ok: false, error: say("files_unavailable") };
    } catch {
      return { ok: false, error: say("files_unavailable") };
    }
  };
  return <FilePicker label={label} files={files} onChange={setFiles} upload={upload} accept={accept} maxSize={limits.fileSize} maxFiles={limits.filesPerMessage} labels={t.files} />;
}
