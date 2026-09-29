"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Paperclip, Plus, Trash } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { limits } from "../../../lib/model.ts";
import { removeFile } from "../actions.ts";

export type ShownFile = { id: string; name: string; size: string; by: string; when: string; removable: boolean };

// A record's files — a signed quote, a specification. They go from the
// browser to the Chest itself: the tool authorises one upload, the browser
// sends it, the tool checks it arrived and lists it.
export function FilesBox({ on, files, canAdd, t }: { on: { deal: string } | { company: string } | { contact: string }; files: ShownFile[]; canAdd: boolean; t: Catalogue }) {
  const [sending, setSending] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fail = (code: keyof Catalogue["errors"] | undefined) => toast(code === "unavailable" ? t.common.files.unavailable : format(t.errors[code ?? "unknown"] ?? t.errors.unknown));
  async function send(file: File) {
    if (file.size > limits.attachmentSize) return fail("file_too_large");
    setSending(file.name);
    try {
      const grant = await fetch("/chest/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...on, size: file.size }) });
      const up = await grant.json() as { url?: string; error?: keyof Catalogue["errors"] };
      if (!grant.ok || !up.url) return fail(up.error);
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!put.ok) return fail(put.status === 413 ? "file_too_large" : "file_missing");
      const { name } = await put.json() as { name: string };
      const confirm = await fetch("/chest/api/files", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...on, name, fileName: file.name }) });
      if (!confirm.ok) return fail(((await confirm.json()) as { error?: keyof Catalogue["errors"] }).error ?? "file_missing");
      toast(t.common.files.added);
      router.refresh();
    } catch {
      fail("unavailable");
    } finally {
      setSending(null);
    }
  }
  return (
    <section className="panel files-panel" aria-labelledby="files-title">
      <div className="panel-head">
        <h2 id="files-title" className="label-mono">{t.common.files.title} {files.length > 0 && <span className="count num">{files.length}</span>}</h2>
        {canAdd && (
          <label className="link-button file-input">
            <Plus />{t.common.files.add}
            <input type="file" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
          </label>
        )}
      </div>
      {sending && <p className="hint" role="status">{format(t.common.files.sending, { name: sending })}</p>}
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
                  toast(r.ok ? t.common.files.removed : format(t.errors[r.error], r.values));
                })}><Trash /><span className="visually-hidden">{format(t.common.files.remove, { name: f.name })}</span></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
