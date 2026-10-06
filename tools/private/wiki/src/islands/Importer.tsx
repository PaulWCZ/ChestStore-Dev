import { fill as format, plural, refresh } from "@argentic/chest-app/client";
import { FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { limits } from "../shared/model.ts";

type Words = { importer: Catalogue["importer"]; files: FileWords; unavailable: string; unknown: string; tooLarge: string };
// What the importer reads (lib/importer.ts).
const accept = [".zip", ".docx", ".md", ".markdown", ".txt", ".html", ".htm"];
type Done = { spaceId: string; firstPageId: string | null; pages: number; files: number; skipped: { files: string[]; images: number } };

export function Importer({ spaces, initialSpace, locale, t }: { spaces: { id: string; name: string }[]; initialSpace: string | null; locale: string; t: Words }) {
  // The kit's picker: by the button or dropped, several at once, each
  // removable; the files stay in the browser until "Import" sends them.
  const [picked, setPicked] = useState<readonly PickedFile[]>([]);
  const files = picked.flatMap(f => (f.file ? [f.file] : []));
  const [into, setInto] = useState<"new" | "existing">(initialSpace ? "existing" : "new");
  const [spaceId, setSpaceId] = useState(initialSpace ?? spaces[0]?.id ?? "");
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function choose(update: (current: readonly PickedFile[]) => PickedFile[]) {
    setPicked(current => {
      const next = update(current);
      // A zip names the new space, unless one was typed.
      const zip = next.find(f => /\.zip$/iu.test(f.name));
      if (zip && name === "") setName(zip.name.replace(/\.zip$/iu, "").replace(/^Export-[0-9a-f-]+$/iu, "").replace(/[_-]+/gu, " ").trim());
      return next;
    });
    setError(null);
  }
  async function submit() {
    setError(null);
    setWorking(true);
    const body = new FormData();
    for (const f of files) body.append("files", f, f.name);
    if (into === "existing") body.append("space", spaceId);
    else body.append("name", name.trim() || t.importer.defaultName);
    try {
      const r = await fetch("/chest/api/import", { method: "POST", body });
      // A refusal comes in the reader's words; a page loaded again (the
      // Chest signed them out) answers no JSON.
      const answer = (await r.json().catch(() => ({ error: "unknown", message: r.status === 413 ? t.tooLarge : t.unknown }))) as Done | { error: string; message: string };
      if ("error" in answer) setError(answer.message);
      else {
        setDone(answer);
        await refresh();
      }
    } catch {
      setError(t.unavailable);
    } finally {
      setWorking(false);
    }
  }
  if (done) {
    return (
      <div className="import-done" role="status">
        <p className="big">{plural(locale, t.importer.done, done.pages)} {done.files > 0 ? plural(locale, t.importer.doneFiles, done.files) : ""}</p>
        {done.skipped.files.length > 0 && <p className="muted">{format(t.importer.skipped, { list: done.skipped.files.slice(0, 12).join(", ") + (done.skipped.files.length > 12 ? "…" : "") })}</p>}
        {done.skipped.images > 0 && <p className="muted">{plural(locale, t.importer.skippedImages, done.skipped.images)}</p>}
        <div className="row-actions">
          <a className="button" href={done.firstPageId ? `/chest/pages/${done.firstPageId}` : `/chest/spaces/${done.spaceId}`}>{t.importer.open}</a>
          <button type="button" className="button quiet" onClick={() => { setDone(null); setPicked([]); }}>{t.importer.another}</button>
        </div>
      </div>
    );
  }
  return (
    <form className="stack importer" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="hint">
        <p>{t.importer.how}</p>
        <ul>
          <li>{t.importer.howConfluence}</li>
          <li>{t.importer.howNotion}</li>
          <li>{t.importer.howGoogle}</li>
          <li>{t.importer.howWord}</li>
        </ul>
      </div>
      <div>
        <span className="label" aria-hidden="true">{t.importer.files}</span>
        <FilePicker label={t.importer.files} files={picked} onChange={choose} accept={accept} maxSize={limits.importBytes} labels={t.files} />
        <p className="muted small">{t.importer.limits}</p>
      </div>
      <fieldset className="plain">
        <legend className="label">{t.importer.into}</legend>
        <div className="choices">
          <label className="choice"><input type="radio" name="into" checked={into === "new"} onChange={() => setInto("new")} />{t.importer.intoNew}</label>
          {spaces.length > 0 && <label className="choice"><input type="radio" name="into" checked={into === "existing"} onChange={() => setInto("existing")} />{t.importer.intoExisting}</label>}
        </div>
      </fieldset>
      {into === "new" ? (
        <div>
          <label className="label" htmlFor="import-name">{t.importer.spaceName}</label>
          <input id="import-name" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder={t.importer.defaultName} />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="import-space">{t.importer.space}</label>
          <select id="import-space" className="field" value={spaceId} onChange={e => setSpaceId(e.target.value)}>
            {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div>
        <button type="submit" className="button" disabled={files.length === 0 || working}>{working ? t.importer.working : t.importer.submit}</button>
      </div>
    </form>
  );
}
