"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Upload } from "../../../../../components/icons.tsx";
import { useToast } from "../../../../../components/toast.tsx";
import { parseCsv } from "../../../../../lib/csv.ts";
import { format, languageNames, plural } from "../../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { emailInName, guess, importFields, rowsOf, type ImportField, type Mapping } from "../../../../../lib/import-map.ts";
import { fold, languages } from "../../../../../lib/model.ts";
import { unzip } from "../../../../../lib/unzip.ts";
import { uploadCv } from "../../../../../lib/upload.ts";
import { importCandidates, setCv, undoImport } from "../../../actions.ts";

type Words = { importer: Catalogue["importer"]; errors: Catalogue["errors"]; common: Catalogue["common"]; languages: Catalogue["addForm"] };
const cvName = /\.(pdf|docx?)$/iu;
const typeOfName = (name: string) => (/\.pdf$/iu.test(name) ? "application/pdf" : /\.doc$/iu.test(name) ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

// Three steps on one page: the file, the columns and stages (guessed,
// corrected by the recruiter), then the CVs. Nothing is imported before
// "Import"; the import has an Undo.
export function ImportView({ jobId, language, stages, locale, t }: { jobId: string; language: string; stages: { id: string; name: string; hired: boolean }[]; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [table, setTable] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [stageFor, setStageFor] = useState<Record<string, string>>({});
  const [origin, setOrigin] = useState("");
  const [lang, setLang] = useState(language);
  const [done, setDone] = useState<{ added: { id: string; email: string }[]; skipped: { line: number; reason: string }[] } | null>(null);
  const [cvs, setCvs] = useState<{ sent: number; missing: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const w = t.importer;
  const headers = table?.[0] ?? [];
  const rows = useMemo(() => (table ? rowsOf(table, mapping) : []), [table, mapping]);
  const stageValues = useMemo(() => [...new Set(rows.map(r => r.stage).filter(Boolean))].slice(0, 40), [rows]);

  async function read(file: File) {
    setError(null);
    setDone(null);
    try {
      const parsed = parseCsv(await file.text(), 2001);
      if (parsed.length < 2) return setError(w.emptyFile);
      setTable(parsed);
      setFileName(file.name);
      const m = guess(parsed[0]!);
      setMapping(m);
      // A stage whose name is one of the job's is matched to it.
      const values = [...new Set(rowsOf(parsed, m).map(r => r.stage).filter(Boolean))];
      setStageFor(Object.fromEntries(values.map(v => [v, stages.find(s => fold(s.name) === fold(v))?.id ?? stages[0]?.id ?? ""])));
      if (!origin) setOrigin(/teamtailor/iu.test(file.name) ? "Teamtailor" : /workable/iu.test(file.name) ? "Workable" : /welcome|wttj/iu.test(file.name) ? "Welcome to the Jungle" : "");
    } catch {
      setError(w.unreadable);
    }
  }

  function run() {
    start(async () => {
      const r = await importCandidates(jobId, { rows, stages: stageFor, origin, language: lang });
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      setDone(r.value);
      const ids = r.value.added.map(a => a.id);
      toast(plural(w.imported, ids.length, locale), { label: t.common.undo, run: () => start(async () => { await undoImport(ids); setDone(null); router.refresh(); }) });
    });
  }

  // The CVs: files named with the candidate's email (or a ZIP of them),
  // each sent to the Chest like a CV added by hand.
  async function attach(files: FileList) {
    if (!done) return;
    const byEmail = new Map(done.added.map(a => [a.email, a.id]));
    const found: { email: string; file: File }[] = [];
    for (const f of Array.from(files)) {
      if (/\.zip$/iu.test(f.name)) {
        try {
          for (const u of await unzip(new Uint8Array(await f.arrayBuffer()), n => cvName.test(n))) {
            const email = emailInName(u.name.split("/").pop() ?? "");
            if (email) found.push({ email, file: new File([u.data.slice().buffer], u.name.split("/").pop() ?? "cv.pdf", { type: typeOfName(u.name) }) });
          }
        } catch {
          setError(w.unreadable);
        }
      } else if (cvName.test(f.name)) {
        const email = emailInName(f.name);
        if (email) found.push({ email, file: f });
      }
    }
    let sent = 0;
    setCvs({ sent: 0, missing: 0 });
    for (const { email, file } of found) {
      const id = byEmail.get(email);
      if (!id) continue;
      const up = await uploadCv(file, "/chest/api/cv");
      if (!up.ok) continue;
      const r = await setCv(id, up.ticket, file.name);
      if (r.ok) setCvs({ sent: ++sent, missing: 0 });
    }
    setCvs({ sent, missing: done.added.length - sent });
  }

  const labels: Record<ImportField, string> = w.fields;
  return (
    <div className="stack import">
      <section className="panel" aria-labelledby="step-file">
        <h2 id="step-file">{w.step1}</h2>
        <p className="hint tight-top">{w.fileHint}</p>
        <label className="dropzone">
          <input type="file" accept=".csv,text/csv,.tsv,.txt" className="visually-hidden" onChange={e => { const f = e.currentTarget.files?.[0]; if (f) void read(f); }} />
          <span className="dz-icon"><Upload /></span>
          <span className="dz-text"><strong>{fileName || w.choose}</strong>{table && <span className="muted small"> · {plural(w.rows, table.length - 1, locale)}</span>}</span>
        </label>
      </section>

      {table && !done && (
        <section className="panel" aria-labelledby="step-map">
          <h2 id="step-map">{w.step2}</h2>
          <div className="map-grid">
            {importFields.map(f => (
              <div key={f} className="field-block">
                <label className="small-label" htmlFor={`map-${f}`}>{labels[f]}</label>
                <select id={`map-${f}`} className="field" value={mapping[f] ?? ""} onChange={e => setMapping(m => { const n = { ...m }; if (e.target.value === "") delete n[f]; else n[f] = Number(e.target.value); return n; })}>
                  <option value="">{w.none}</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          {stageValues.length > 0 && (
            <>
              <h3>{w.stages}</h3>
              <div className="map-grid">
                {stageValues.map(v => (
                  <div key={v} className="field-block">
                    <label className="small-label" htmlFor={`stage-${v}`}>{v}</label>
                    <select id={`stage-${v}`} className="field" value={stageFor[v] ?? ""} onChange={e => setStageFor(s => ({ ...s, [v]: e.target.value }))}>
                      {stages.filter(s => !s.hired).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="two">
            <div className="field-block">
              <label className="small-label" htmlFor="origin">{w.origin}</label>
              <input id="origin" className="field" maxLength={80} value={origin} onChange={e => setOrigin(e.target.value)} placeholder={w.originPlaceholder} />
            </div>
            <div className="field-block">
              <label className="small-label" htmlFor="import-lang">{t.languages.language}</label>
              <select id="import-lang" className="field" value={lang} onChange={e => setLang(e.target.value)}>
                {languages.map(l => <option key={l} value={l}>{languageNames[l]}</option>)}
              </select>
            </div>
          </div>
          <h3>{w.preview}</h3>
          <div className="table-wrap">
            <table className="preview-table">
              <thead><tr><th scope="col">{labels.name}</th><th scope="col">{labels.email}</th><th scope="col">{labels.stage}</th><th scope="col">{labels.appliedAt}</th></tr></thead>
              <tbody>{rows.slice(0, 5).map(r => <tr key={r.line}><td>{r.name}</td><td>{r.email}</td><td>{r.stage ? stages.find(s => s.id === stageFor[r.stage])?.name ?? r.stage : stages[0]?.name}</td><td>{r.appliedAt}</td></tr>)}</tbody>
            </table>
          </div>
          {(mapping.email === undefined || (mapping.name === undefined && mapping.firstName === undefined && mapping.lastName === undefined)) && <p className="error" role="alert">{w.needs}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="button" disabled={pending || rows.length === 0 || mapping.email === undefined || (mapping.name === undefined && mapping.firstName === undefined && mapping.lastName === undefined)} onClick={run}>{plural(w.go, rows.length, locale)}</button>
          </div>
        </section>
      )}
      {!table && error && <p className="error" role="alert">{error}</p>}

      {done && (
        <section className="panel" aria-labelledby="step-cvs" role="status">
          <h2 id="step-cvs">{w.step3}</h2>
          <p>{plural(w.imported, done.added.length, locale)}{done.skipped.length > 0 && <> {plural(w.skipped, done.skipped.length, locale)}</>}</p>
          {done.skipped.length > 0 && (
            <ul className="plain-list small">
              {done.skipped.slice(0, 20).map(s => <li key={s.line}>{format(w.skippedLine, { line: s.line, reason: w.reasons[s.reason as keyof Words["importer"]["reasons"]] ?? s.reason })}</li>)}
            </ul>
          )}
          {done.added.length > 0 && (
            <>
              <p className="hint">{w.cvHint}</p>
              <label className="dropzone">
                <input type="file" multiple accept=".zip,.pdf,.doc,.docx,application/zip,application/pdf" className="visually-hidden" onChange={e => { const f = e.currentTarget.files; if (f) void attach(f); }} />
                <span className="dz-icon"><Upload /></span>
                <span className="dz-text"><strong>{w.chooseCvs}</strong></span>
              </label>
              {cvs && <p>{plural(w.cvsSent, cvs.sent, locale)}{cvs.missing > 0 && <> {plural(w.cvsMissing, cvs.missing, locale)}</>}</p>}
            </>
          )}
          <div className="form-actions"><a className="button quiet" href={`/chest/jobs/${jobId}`}>{w.back}</a></div>
        </section>
      )}
    </div>
  );
}
