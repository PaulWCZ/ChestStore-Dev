"use client";

import { FilePicker, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { importForm } from "../../actions.ts";

// Bring a form from Google Forms or Typeform: its file (JSON, as their
// APIs give it) chosen — in the kit's file picker, the file stays in the
// browser and is read here — or pasted; the questions arrive as a draft.
export function ImportForm({ t, errors, files: words }: { t: Catalogue["create"]; errors: Catalogue["errors"]; files: Catalogue["files"] }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const read = useRef(new Set<string>());
  const send = (value: string) => start(async () => {
    const r = await importForm(value);
    if (r && !r.ok) toast({ id: "import", text: format(errors[r.error] ?? errors.unknown, r.values ?? {}), tone: "error" });
  });
  // A file chosen: read it and bring it in, once.
  useEffect(() => {
    const file = files.find(f => f.file && !read.current.has(f.key));
    if (!file?.file) return;
    read.current.add(file.key);
    void file.file.text().then(send);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);
  return (
    <details className="import-box">
      <summary>{t.importTitle}</summary>
      <p className="hint">{t.importHint}</p>
      <FilePicker label={pending ? t.importing : t.importFile} files={files} onChange={update => setFiles(update)} maxFiles={1} maxSize={2 << 20} accept={["application/json", ".json"]} disabled={pending} labels={words} />
      <label className="mini block">
        <span className="mini-label">{t.importPaste}</span>
        <textarea className="field embed-code" rows={4} value={text} onChange={e => setText(e.target.value)} />
      </label>
      <div><button type="button" className="button small" disabled={pending || text.trim() === ""} onClick={() => send(text)}>{pending ? t.importing : t.importGo}</button></div>
    </details>
  );
}
