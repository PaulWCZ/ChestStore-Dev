import { FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { call } from "@argentic/chest-app/client";
import { useEffect, useRef, useState } from "react";

type Words = { importTitle: string; importHint: string; importFile: string; importPaste: string; importGo: string; importing: string };

// Bring a form from Google Forms or Typeform: its file (JSON, as their
// APIs give it) chosen — in the kit's file picker, the file stays in the
// browser and is read here — or pasted; the questions arrive as a draft
// (the action opens it in the builder).
export function ImportForm({ t, files: words }: { t: Words; files: FileWords }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [pending, setPending] = useState(false);
  const read = useRef(new Set<string>());
  const send = (value: string) => {
    setPending(true);
    void call("importForm", { text: value }).then(() => setPending(false));
  };
  // A file chosen: read it and bring it in, once.
  useEffect(() => {
    const file = files.find(f => f.file && !read.current.has(f.key));
    if (!file?.file) return;
    read.current.add(file.key);
    void file.file.text().then(send);
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
