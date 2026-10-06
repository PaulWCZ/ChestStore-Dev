import { call, refresh, toast } from "@argentic/chest-app/client";
import { FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { useMemo, useState } from "react";
import { uploadTeamFile, type UploadWords } from "../components/upload.ts";
import type { Catalogue } from "../i18n/index.ts";
import { parseCsv } from "../shared/csv.ts";
import { format, languageNames, plural } from "../shared/format.ts";
import { emailInName, guess, importFields, rowsOf, type ImportField, type Mapping } from "../shared/import-map.ts";
import { fold, languages, type Language } from "../shared/model.ts";
import { unzip } from "../shared/unzip.ts";

type Words = { importer: Catalogue["importer"]; common: Catalogue["common"]; languages: Catalogue["addForm"]; upload: UploadWords; files: FileWords };
const cvName = /\.(pdf|docx?)$/iu;
const typeOfName = (name: string) => (/\.pdf$/iu.test(name) ? "application/pdf" : /\.doc$/iu.test(name) ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

// Three steps on one page: the file, the columns and stages (guessed,
// corrected by the recruiter), then the CVs. Nothing is imported before
// "Import"; the import has an Undo.
export function ImportView({ jobId, language, stages, locale, t }: { jobId: string; language: string; stages: { id: string; name: string; hired: boolean }[]; locale: string; t: Words }) {
  const [pending, setPending] = useState(false);
  const [table, setTable] = useState<string[][] | null>(null);
  // The table and the CVs stay in the browser until "Import" (the kit's
  // file picker without an upload): the table is read here.
  const [sheet, setSheet] = useState<readonly PickedFile[]>([]);
  const [cvFiles, setCvFiles] = useState<readonly PickedFile[]>([]);
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

  async function run() {
    setPending(true);
    const r = await call("importCandidates", { jobId, rows, stages: stageFor, origin, language: lang as Language }, { quiet: true });
    setPending(false);
    if (!r.ok) return setError(r.message);
    setDone(r.value);
    const ids = r.value.added.map(a => a.id);
    toast({
      id: `import-${jobId}`,
      text: plural(w.imported, ids.length, locale),
      undo: async () => {
        const back = await call("undoImport", { ids }, { quiet: true });
        if (!back.ok) return back.message;
        setDone(null);
        return true;
      },
    });
  }

  // The CVs: files named with the candidate's email (or a ZIP of them),
  // each sent to the Chest like a CV added by hand.
  async function attach(files: readonly File[]) {
    if (!done) return;
    const byEmail = new Map(done.added.map(a => [a.email, a.id]));
    const found: { email: string; file: File }[] = [];
    for (const f of files) {
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
      const up = await uploadTeamFile(file, t.upload);
      if (!up.ok) continue;
      // One refresh at the end, not one per CV.
      const r = await call("setCv", { id, ticket: up.ref, fileName: file.name }, { refresh: false });
      if (r.ok) setCvs({ sent: ++sent, missing: 0 });
    }
    setCvs({ sent, missing: done.added.length - sent });
    await refresh();
  }

  const labels: Record<ImportField, string> = w.fields;
  return (
    <div className="stack import">
      <section className="panel" aria-labelledby="step-file">
        <h2 id="step-file">{w.step1}</h2>
        <p className="hint tight-top">{w.fileHint}</p>
        <FilePicker
          label={w.choose}
          files={sheet}
          maxFiles={1}
          accept={[".csv", ".tsv", ".txt"]}
          labels={t.files}
          onChange={update => {
            // No upload here: the picker changes the list only when a file
            // is added or taken off, from this render's list.
            const next = update(sheet);
            setSheet(next);
            const added = next.find(f => f.file && !sheet.some(x => x.key === f.key));
            if (added?.file) void read(added.file);
            if (next.length === 0) { setTable(null); setDone(null); }
          }}
        />
        {table && <p className="muted small">{plural(w.rows, table.length - 1, locale)}</p>}
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
            <button type="button" className="button" disabled={pending || rows.length === 0 || mapping.email === undefined || (mapping.name === undefined && mapping.firstName === undefined && mapping.lastName === undefined)} onClick={() => void run()}>{plural(w.go, rows.length, locale)}</button>
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
              <FilePicker
                label={w.chooseCvs}
                files={cvFiles}
                accept={[".zip", ".pdf", ".doc", ".docx"]}
                labels={t.files}
                onChange={update => {
                  const next = update(cvFiles);
                  setCvFiles(next);
                  const added = next.filter(f => f.file && !cvFiles.some(x => x.key === f.key)).map(f => f.file!);
                  if (added.length > 0) void attach(added);
                }}
              />
              {cvs && <p>{plural(w.cvsSent, cvs.sent, locale)}{cvs.missing > 0 && <> {plural(w.cvsMissing, cvs.missing, locale)}</>}</p>}
            </>
          )}
          <div className="form-actions"><a className="button quiet" href={`/chest/jobs/${jobId}`}>{w.back}</a></div>
        </section>
      )}
    </div>
  );
}
