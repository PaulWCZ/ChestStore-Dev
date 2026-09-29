"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { File, Trash, Upload } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { documentKinds, documentTypes, limits, type DocumentKind } from "../../../../lib/model.ts";
import { documentAdded, documentUpload, removeDocument } from "../../actions.ts";

type Doc = { id: string; name: string; kind: DocumentKind; size: number; added: string; by: string };
type Words = {
  record: {
    kinds: Record<DocumentKind, string>; upload: string; uploading: string; kind: string; uploaded: string; open: string; remove: string; removed: string; undo: string; noDocuments: string;
  };
  errors: Record<ErrorCode, string>;
};

// The record's documents: the file goes from the browser straight to the
// Chest (a one-time upload address), then People records it. Each opens
// through a fresh signed link. Removing one waits a few seconds for "Undo".
export function Documents({ recordId, documents, edit, t }: { recordId: string; documents: Doc[]; edit: boolean; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>("contract");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const shown = documents.filter(d => !hidden.has(d.id));

  const send = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      if (!(documentTypes as readonly string[]).includes(file.type)) { toast(t.errors.type_refused); return; }
      if (file.size > limits.documentBytes) { toast(format(t.errors.too_large, { max: limits.documentBytes / (1 << 20) })); return; }
      const up = await documentUpload(recordId, { type: file.type, size: file.size });
      if (!up.ok) { toast(format(t.errors[up.error], up.values ?? {})); return; }
      const put = await fetch(up.value.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } }).catch(() => null);
      if (!put || put.status !== 201) { toast(put?.status === 413 ? format(t.errors.too_large, { max: limits.documentBytes / (1 << 20) }) : put?.status === 415 ? t.errors.type_refused : t.errors.unavailable); return; }
      const sent = await put.json() as { name: string };
      const done = await documentAdded(recordId, { object: sent.name, name: file.name.slice(0, limits.documentName), kind });
      if (!done.ok) { toast(format(t.errors[done.error], done.values ?? {})); return; }
      toast(t.record.uploaded);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  };
  const remove = (doc: Doc) => {
    setHidden(h => new Set(h).add(doc.id));
    let undone = false;
    toast(t.record.removed, { label: t.record.undo, run: () => {
      undone = true;
      setHidden(h => { const n = new Set(h); n.delete(doc.id); return n; });
    } });
    setTimeout(() => {
      if (undone) return;
      void removeDocument(recordId, doc.id).then(r => {
        if (!r.ok) { setHidden(h => { const n = new Set(h); n.delete(doc.id); return n; }); toast(format(t.errors[r.error], r.values ?? {})); }
        else router.refresh();
      });
    }, 8000);
  };
  return (
    <div className="documents">
      {shown.length === 0 ? <p className="muted">{t.record.noDocuments}</p> : (
        <ul className="doc-list">
          {shown.map(d => (
            <li key={d.id}>
              <a className="doc" href={`/chest/records/${recordId}/documents/${d.id}`} target="_blank" rel="noopener" aria-label={format(t.record.open, { name: d.name })}>
                <File />
                <span className="doc-text"><strong>{d.name}</strong><span className="muted small">{t.record.kinds[d.kind]} · {d.added} · {d.by}</span></span>
              </a>
              {edit && <button type="button" className="icon-button" aria-label={format(t.record.remove, { name: d.name })} onClick={() => remove(d)}><Trash /></button>}
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <div className="row doc-upload">
          <div className="field-group">
            <label htmlFor={uid + "kind"} className="label small">{t.record.kind}</label>
            <select id={uid + "kind"} className="select" value={kind} onChange={e => setKind(e.target.value as DocumentKind)}>
              {documentKinds.map(k => <option key={k} value={k}>{t.record.kinds[k]}</option>)}
            </select>
          </div>
          <label className="button quiet upload-button">
            <Upload />{pending ? t.record.uploading : t.record.upload}
            <input ref={input} type="file" className="visually-hidden" accept={documentTypes.join(",")} disabled={pending} onChange={e => send(e.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  );
}
