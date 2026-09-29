"use client";

import { FilePicker, useToast, type PickedFile, type Upload } from "@argentic/chest-ui/components";
import { putWithProgress, type FileWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { File, Trash } from "../../../../components/icons.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { documentKinds, limits, type DocumentKind } from "../../../../lib/model.ts";
import { documentAdded, documentUpload, removeDocument } from "../../actions.ts";

type Doc = { id: string; name: string; kind: DocumentKind; size: number; added: string; by: string };
type Words = {
  record: {
    kinds: Record<DocumentKind, string>; upload: string; kind: string; uploaded: string; open: string; remove: string; removed: string; tooLate: string; noDocuments: string;
  };
  errors: Record<ErrorCode, string>;
  files: FileWords;
};

// What the file picker offers (the server checks the real type again).
const accept = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".docx", ".odt"];
// A deleted document stays until its toast's Undo has had its time (the
// kit's toast gives an Undo 10 seconds, longer while hovered or focused):
// only then is the file dropped for good. An Undo that comes too late says
// so rather than pretending.
const grace = 12_000;

// The record's documents: the file goes from the browser straight to the
// Chest (a one-time upload address, with progress: the kit's FilePicker),
// then People records it. Each opens through a fresh signed link.
export function Documents({ recordId, documents, edit, t }: { recordId: string; documents: Doc[]; edit: boolean; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [kind, setKind] = useState<DocumentKind>("contract");
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const shown = documents.filter(d => !hidden.has(d.id));
  const said = (r: { ok: false; error: ErrorCode; values?: Record<string, string | number> }) => format(t.errors[r.error], r.values ?? {});
  const show = (id: string) => setHidden(h => { const n = new Set(h); n.delete(id); return n; });

  // Sent and recorded: the list shows it once the page is read again.
  useEffect(() => {
    if (!files.some(f => f.status === "ready")) return;
    setFiles(list => list.filter(f => f.status !== "ready"));
    router.refresh();
  }, [files, router]);

  const upload: Upload = async (file, { onProgress, signal }) => {
    const grant = await documentUpload(recordId, { type: file.type, size: file.size });
    if (!grant.ok) return { ok: false, error: said(grant) };
    const put = await putWithProgress(grant.value.url, file, { headers: { "Content-Type": file.type }, onProgress, signal });
    if (put.status !== 201) return { ok: false, error: put.status === 413 ? format(t.errors.too_large, { max: limits.documentBytes / (1 << 20) }) : put.status === 415 ? t.errors.type_refused : t.errors.unavailable };
    const sent = JSON.parse(put.text) as { name: string };
    const done = await documentAdded(recordId, { object: sent.name, name: file.name.slice(0, limits.documentName), kind });
    if (!done.ok) return { ok: false, error: said(done) };
    toast({ id: `doc-${done.value.id}`, text: t.record.uploaded });
    return { ok: true, ref: done.value.id };
  };

  const remove = (doc: Doc) => {
    setHidden(h => new Set(h).add(doc.id));
    timers.current.set(doc.id, setTimeout(() => {
      timers.current.delete(doc.id);
      void removeDocument(recordId, doc.id).then(r => {
        if (!r.ok) { show(doc.id); toast({ text: said(r), tone: "error" }); }
        else router.refresh();
      });
    }, grace));
    toast({
      id: `doc-${doc.id}`,
      text: t.record.removed,
      undo: () => {
        const timer = timers.current.get(doc.id);
        if (!timer) return t.record.tooLate;
        clearTimeout(timer);
        timers.current.delete(doc.id);
        show(doc.id);
        return true;
      },
    });
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
        <div className="doc-upload no-print">
          <div className="field-group">
            <label htmlFor={uid + "kind"} className="label small">{t.record.kind}</label>
            <select id={uid + "kind"} className="select" value={kind} onChange={e => setKind(e.target.value as DocumentKind)}>
              {documentKinds.map(k => <option key={k} value={k}>{t.record.kinds[k]}</option>)}
            </select>
          </div>
          <FilePicker label={t.record.upload} files={files} onChange={update => setFiles(update)} upload={upload} accept={accept} maxSize={limits.documentBytes} labels={t.files} />
        </div>
      )}
    </div>
  );
}
