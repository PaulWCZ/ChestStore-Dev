import { call, refresh, toast } from "@argentic/chest-app/client";
import { FilePicker, type PickedFile, type Upload } from "@argentic/chest-ui/components";
import { putWithProgress } from "@argentic/chest-ui/components/logic";
import { useEffect, useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { limits } from "../shared/model.ts";
import { Download, Paperclip, Trash } from "./icons.tsx";
import type { Words } from "./shared.ts";

export type ShownFile = { id: string; name: string; size: string; by: string; when: string; removable: boolean };

// A record's files — a signed quote, a specification. They go from the
// browser to the Chest itself: the tool authorises one upload, the browser
// sends it (the kit's FilePicker shows its progress; several at once, by
// the button or dropped), the tool checks it arrived and lists it.
export function FilesBox({ on, files, canAdd, t }: { on: { deal: string } | { company: string } | { contact: string }; files: ShownFile[]; canAdd: boolean; t: Words<"common" | "files" | "errors"> }) {
  const [picked, setPicked] = useState<readonly PickedFile[]>([]);
  const [, start] = useTransition();
  // Three steps around the browser's own upload to the Chest: where to
  // send it (uploadFile), the bytes sent there with their progress, then
  // the file recorded once the Chest holds it (attachFile). Nothing is
  // refreshed in between (refresh: false): the page follows once at the end.
  const upload: Upload = async (file, { onProgress, signal }) => {
    try {
      const grant = await call("uploadFile", { ...on, size: file.size }, { quiet: true, refresh: false });
      if (!grant.ok) return { ok: false, error: grant.error === "unavailable" ? t.common.files.unavailable : grant.message };
      const put = await putWithProgress(grant.value.url, file, { headers: { "Content-Type": file.type || "application/octet-stream" }, onProgress, signal });
      if (put.status >= 300) return { ok: false, error: put.status === 413 ? t.errors.file_too_large : t.errors.file_missing };
      const { name } = JSON.parse(put.text) as { name: string };
      const saved = await call("attachFile", { ...on, name, fileName: file.name }, { quiet: true, refresh: false });
      if (!saved.ok) return { ok: false, error: saved.message };
      return { ok: true, ref: name };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      return { ok: false, error: t.common.files.unavailable };
    }
  };
  // A file the Chest now holds leaves the picker for the record's list.
  useEffect(() => {
    if (!picked.some(f => f.status === "ready")) return;
    setPicked(list => list.filter(f => f.status !== "ready"));
    toast(t.common.files.added);
    void refresh();
  }, [picked, t.common.files.added]);
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
                  const r = await call("removeFile", { id: f.id });
                  if (r.ok) toast(t.common.files.removed);
                })}><Trash /><span className="visually-hidden">{format(t.common.files.remove, { name: f.name })}</span></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
