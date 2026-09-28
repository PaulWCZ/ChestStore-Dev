"use client";

import { useId, useState } from "react";
import type { ErrorCode } from "../lib/app-error.ts";
import { fileSize, format } from "../lib/i18n/format.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { checkFile, fileAccept, fileTypes, isFileType, limits } from "../lib/model.ts";
import { Clip, Cross } from "./icons.tsx";

// Files added to a message. Each goes from the browser to the Chest as
// soon as it is chosen (the tool only authorises it); what comes back — a
// claim for a visitor, the object's name for a member — is what the
// message sends. A file removed here is never sent: the Chest (a visitor's)
// or the nightly cleanup (a member's) deletes it.
export type PickedFile = { key: string; name: string; size: number; ref: string | null };
export type Grant = { ok: true; url: string } | { ok: false; error: ErrorCode; max?: number };
type Words = { files: Catalogue["files"]; errors: Catalogue["errors"] };

const byExtension = Object.fromEntries([...Object.entries(fileTypes).map(([type, ext]) => [ext, type]), ["jpeg", "image/jpeg"]]) as Record<string, string>;
const typeOf = (file: File): string => (isFileType(file.type) ? file.type : byExtension[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? file.type);

// The browser's answer to an upload, as a code of ours.
const refusal = (status: number): ErrorCode => (status === 413 ? "file_too_large" : status === 415 || status === 400 ? "file_type" : status === 429 ? "too_many" : "files_unavailable");

export const readyFiles = (items: PickedFile[]) => JSON.stringify(items.filter(i => i.ref).map(i => ({ ref: i.ref, name: i.name })));
export const filesPending = (items: PickedFile[]) => items.some(i => !i.ref);

export function FilePicker({ items, setItems, upload, kind, locale, t }: { items: PickedFile[]; setItems: (update: (current: PickedFile[]) => PickedFile[]) => void; upload: (type: string, size: number) => Promise<Grant>; kind: "public" | "team"; locale: string; t: Words }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const max = limits.filesPerMessage;
  const say = (code: ErrorCode, values: Record<string, number> = {}) => setError(format(t.errors[code], { max: limits.fileSize >> 20, ...values }));

  async function add(chosen: FileList | null) {
    setError(null);
    let room = max - items.length;
    for (const file of [...(chosen ?? [])]) {
      if (room <= 0) {
        say("too_many_files", { max });
        break;
      }
      const type = typeOf(file);
      const refused = checkFile(type, file.size);
      if (refused) {
        say(refused);
        continue;
      }
      room--;
      const key = Math.random().toString(36).slice(2);
      setItems(current => [...current, { key, name: file.name, size: file.size, ref: null }]);
      const drop = () => setItems(current => current.filter(i => i.key !== key));
      try {
        const grant = await upload(type, file.size);
        if (!grant.ok) {
          drop();
          say(grant.error, grant.max ? { max: grant.max } : {});
          continue;
        }
        const sent = await fetch(grant.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
        if (!sent.ok) {
          drop();
          say(refusal(sent.status));
          continue;
        }
        const answer = (await sent.json()) as { claim?: unknown; name?: unknown };
        const ref = kind === "public" ? answer.claim : answer.name;
        if (typeof ref !== "string") throw new Error("no reference");
        setItems(current => current.map(i => (i.key === key ? { ...i, ref } : i)));
      } catch {
        drop();
        say("files_unavailable");
      }
    }
  }

  return (
    <div className="picker">
      <div className="row">
        <input id={id} type="file" className="visually-hidden file-input" multiple accept={fileAccept} disabled={items.length >= max} aria-describedby={`${id}-hint`}
          onChange={e => { const input = e.currentTarget; void add(input.files).finally(() => { input.value = ""; }); }} />
        <label htmlFor={id} className={`button quiet small${items.length >= max ? " is-disabled" : ""}`}><Clip />{t.files.add}</label>
        <span id={`${id}-hint`} className="hint">{format(t.files.hint, { max: limits.fileSize >> 20, count: max })}</span>
      </div>
      {items.length > 0 && (
        <ul className="picked" aria-label={t.files.list} aria-live="polite">
          {items.map(i => (
            <li key={i.key}>
              <Clip />
              <span className="name">{i.name}</span>
              <span className="small muted">{i.ref ? fileSize(i.size, locale) : t.files.adding}</span>
              <button type="button" className="icon-button" aria-label={format(t.files.remove, { name: i.name })} onClick={() => setItems(current => current.filter(x => x.key !== i.key))}><Cross /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
