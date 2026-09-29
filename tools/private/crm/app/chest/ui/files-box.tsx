"use client";

import { FilePicker, useToast, type PickedFile, type Upload } from "@argentic/chest-ui/components";
import { putWithProgress } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Download, Paperclip, Trash } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { limits } from "../../../lib/model.ts";
import { removeFile } from "../actions.ts";

export type ShownFile = { id: string; name: string; size: string; by: string; when: string; removable: boolean };
type Code = keyof Catalogue["errors"];

// A record's files — a signed quote, a specification. They go from the
// browser to the Chest itself: the tool authorises one upload, the browser
// sends it (the kit's FilePicker shows its progress; several at once, by
// the button or dropped), the tool checks it arrived and lists it.
export function FilesBox({ on, files, canAdd, t }: { on: { deal: string } | { company: string } | { contact: string }; files: ShownFile[]; canAdd: boolean; t: Catalogue }) {
  const [picked, setPicked] = useState<readonly PickedFile[]>([]);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const words = (code: Code | undefined) => (code === "unavailable" ? t.common.files.unavailable : format(t.errors[code ?? "unknown"] ?? t.errors.unknown));
  const upload: Upload = async (file, { onProgress, signal }) => {
    try {
      const grant = await fetch("/chest/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...on, size: file.size }), signal });
      const up = await grant.json() as { url?: string; error?: Code };
      if (!grant.ok || !up.url) return { ok: false, error: words(up.error) };
      const put = await putWithProgress(up.url, file, { headers: { "Content-Type": file.type || "application/octet-stream" }, onProgress, signal });
      if (put.status >= 300) return { ok: false, error: words(put.status === 413 ? "file_too_large" : "file_missing") };
      const { name } = JSON.parse(put.text) as { name: string };
      const confirm = await fetch("/chest/api/files", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...on, name, fileName: file.name }), signal });
      if (!confirm.ok) return { ok: false, error: words(((await confirm.json()) as { error?: Code }).error ?? "file_missing") };
      return { ok: true, ref: name };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      return { ok: false, error: words("unavailable") };
    }
  };
  // A file the Chest now holds leaves the picker for the record's list.
  useEffect(() => {
    if (!picked.some(f => f.status === "ready")) return;
    setPicked(list => list.filter(f => f.status !== "ready"));
    toast(t.common.files.added);
    router.refresh();
  }, [picked, router, toast, t.common.files.added]);
  return (
    <section className="panel files-panel" aria-labelledby="files-title">
      <div className="panel-head">
        <h2 id="files-title" className="label-mono">{t.common.files.title} {files.length > 0 && <span className="count num">{files.length}</span>}</h2>
      </div>
      {canAdd && <FilePicker label={t.common.files.title} files={picked} onChange={setPicked} upload={upload} maxSize={limits.attachmentSize} maxFiles={10} labels={t.files} />}
      {files.length === 0 ? <p className="muted">{t.common.files.none}</p> : (
        <ul className="file-list">
          {files.map(f => (
            <li key={f.id}>
              <Paperclip />
              <span className="file-main">
                <a href={`/chest/files/${f.id}`} target="_blank" rel="noopener">{f.name}</a>
                <span className="muted small-text">{f.size} · {f.by} · {f.when}</span>
              </span>
              <a className="icon-button small" href={`/chest/files/${f.id}?download=1`} title={format(t.common.files.download, { name: f.name })}><Download /><span className="visually-hidden">{format(t.common.files.download, { name: f.name })}</span></a>
              {f.removable && (
                <button type="button" className="icon-button small" title={format(t.common.files.remove, { name: f.name })} onClick={() => start(async () => {
                  const r = await removeFile(f.id);
                  toast(r.ok ? t.common.files.removed : { text: format(t.errors[r.error], r.values), tone: "error" });
                })}><Trash /><span className="visually-hidden">{format(t.common.files.remove, { name: f.name })}</span></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
