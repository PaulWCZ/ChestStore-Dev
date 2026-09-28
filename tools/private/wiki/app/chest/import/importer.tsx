"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";

type Words = { importer: Catalogue["importer"]; errors: Catalogue["errors"] };
type Done = { spaceId: string; firstPageId: string | null; pages: number; files: number; skipped: { files: string[]; images: number } };

export function Importer({ spaces, initialSpace, locale, t }: { spaces: { id: string; name: string }[]; initialSpace: string | null; locale: string; t: Words }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [into, setInto] = useState<"new" | "existing">(initialSpace ? "existing" : "new");
  const [spaceId, setSpaceId] = useState(initialSpace ?? spaces[0]?.id ?? "");
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function choose(list: FileList | null) {
    const chosen = [...(list ?? [])];
    setFiles(chosen);
    setError(null);
    // A zip names the new space, unless one was typed.
    const zip = chosen.find(f => /\.zip$/iu.test(f.name));
    if (zip && name === "") setName(zip.name.replace(/\.zip$/iu, "").replace(/^Export-[0-9a-f-]+$/iu, "").replace(/[_-]+/gu, " ").trim());
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
      const answer = (await r.json().catch(() => ({ error: "unknown" }))) as Done | { error: keyof Catalogue["errors"]; values?: Record<string, string | number> };
      if ("error" in answer) setError(format(t.errors[answer.error] ?? t.errors.unknown, answer.values ?? {}));
      else {
        setDone(answer);
        router.refresh();
      }
    } catch {
      setError(t.errors.unavailable);
    } finally {
      setWorking(false);
    }
  }
  if (done) {
    return (
      <div className="import-done" role="status">
        <p className="big">{plural(t.importer.done, done.pages, locale)} {done.files > 0 ? plural(t.importer.doneFiles, done.files, locale) : ""}</p>
        {done.skipped.files.length > 0 && <p className="muted">{format(t.importer.skipped, { list: done.skipped.files.slice(0, 12).join(", ") + (done.skipped.files.length > 12 ? "…" : "") })}</p>}
        {done.skipped.images > 0 && <p className="muted">{plural(t.importer.skippedImages, done.skipped.images, locale)}</p>}
        <div className="row-actions">
          <Link className="button" href={done.firstPageId ? `/chest/pages/${done.firstPageId}` : `/chest/spaces/${done.spaceId}`}>{t.importer.open}</Link>
          <button type="button" className="button quiet" onClick={() => { setDone(null); setFiles([]); }}>{t.importer.another}</button>
        </div>
      </div>
    );
  }
  return (
    <form className="stack importer" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <p className="hint">{t.importer.how}</p>
      <div>
        <span className="label">{t.importer.files}</span>
        <label className="dropzone">
          <Upload />
          <span>{files.length > 0 ? plural(t.importer.chosen, files.length, locale) : t.importer.choose}</span>
          {files.length > 0 && <span className="muted small">{files.map(f => f.name).slice(0, 3).join(", ")}{files.length > 3 ? "…" : ""}</span>}
          <input type="file" multiple accept=".zip,.md,.markdown,.txt" onChange={e => choose(e.target.files)} />
        </label>
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
