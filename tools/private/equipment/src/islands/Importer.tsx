import { call, navigate, toast } from "@argentic/chest-app/client";
import { DataTable, FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { AssetTag } from "../components/bits.tsx";
import type { PlanRow, Preview } from "../lib/importer.ts";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "../i18n/format.ts";
import { categoryName } from "../shared/words.ts";

type Words = { importer: Catalogue["importer"]; status: Catalogue["status"]; categories: Catalogue["categories"]; files: Catalogue["files"]; table: Catalogue["table"] };
type Source = "snipe" | "csv" | "intune";
type FileSource = "snipe" | "csv";
// Microsoft Intune, as the page found it: connected (its administrator set
// its three settings), and the last read in words.
export type IntuneInfo = { connected: boolean; last: string | null; lastFailed: string | null };

// Pick the source and the file (the kit's file picker: by the button or by
// dropping it, the limits said first; the file stays in the browser), see
// what will come (the server reads the file and matches people), import.
// Nothing is added before the button.
export function Importer({ t, locale, intune }: { t: Words; locale: string; intune: IntuneInfo }) {
  const w = t.importer;
  const [picked, setPicked] = useState<{ source: Source; text: string; plan: Preview; keep: string[] | undefined } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [files, setFiles] = useState<Record<FileSource, readonly PickedFile[]>>({ snipe: [], csv: [] });
  // What the last "Read Intune" found when nothing was missing.
  const [intuneNews, setIntuneNews] = useState<string | null>(null);
  // A file picked for one source: read it (the other source's goes).
  const pick = (source: FileSource) => (update: (current: readonly PickedFile[]) => PickedFile[]) => {
    const next = update(files[source]);
    setFiles({ snipe: [], csv: [], [source]: next });
    const added = next.find(f => !files[source].some(o => o.key === f.key));
    if (added?.file) void read(source, added.file);
    if (next.length === 0) setPicked(null);
  };

  // Intune: read it now (the item pages and the overview get its news too),
  // and show what it knows that is not here yet, as a file would be shown.
  function readIntune() {
    setError(null);
    setDone(null);
    setIntuneNews(null);
    setFiles({ snipe: [], csv: [] });
    start(async () => {
      const r = await call("checkIntune", {}, { quiet: true });
      if (!r.ok) {
        setPicked(null);
        return setError(r.message);
      }
      if (!r.value.plan || !r.value.text) {
        setPicked(null);
        return setIntuneNews(plural(w.intuneAllHere, r.value.devices, locale));
      }
      setPicked({ source: "intune", text: r.value.text, plan: r.value.plan, keep: undefined });
    });
  }

  async function read(source: FileSource, file: File) {
    setError(null);
    setDone(null);
    const text = await file.text();
    start(async () => {
      const r = await call("checkImport", { source, text }, { quiet: true, refresh: false });
      if (!r.ok) {
        setPicked(null);
        return setError(r.message);
      }
      setPicked({ source, text, plan: r.value, keep: undefined });
    });
  }
  // Keep a column as a field, or not: the plan is read again.
  function toggle(column: string) {
    if (!picked) return;
    const current = picked.keep ?? picked.plan.offered;
    const keep = current.includes(column) ? current.filter(c => c !== column) : [...current, column];
    setPicked({ ...picked, keep });
    start(async () => {
      const r = await call("checkImport", { source: picked.source, text: picked.text, keep }, { quiet: true, refresh: false });
      if (!r.ok) return setError(r.message);
      setPicked(old => (old ? { ...old, plan: r.value, keep } : old));
    });
  }
  function submit() {
    if (!picked) return;
    start(async () => {
      const r = await call("runImport", { source: picked.source, text: picked.text, ...(picked.keep ? { keep: picked.keep } : {}) }, { quiet: true });
      if (!r.ok) return setError(r.message);
      setDone(r.value.imported);
      setPicked(null);
      setFiles({ snipe: [], csv: [] });
    });
  }

  if (done !== null) {
    return (
      <div className="summary-box" role="status">
        <p className="strong">{plural(w.done, done, locale)}</p>
        <div className="row">
          <a className="button" href="/chest/items">{w.open}</a>
          <button type="button" className="button quiet" onClick={() => setDone(null)}>{w.again}</button>
        </div>
      </div>
    );
  }
  const sources: { source: FileSource; title: string; how: string }[] = [
    { source: "snipe", title: w.snipe, how: w.snipeHow },
    { source: "csv", title: w.csv, how: w.csvHow },
  ];
  const rows = picked?.plan.rows ?? [];
  const usable = picked?.plan.usable ?? 0;
  const skipped = (picked?.plan.total ?? 0) - usable;
  return (
    <div className="stack">
      <div className="sources">
        {sources.map(s => (
          <section key={s.source} className="source">
            <h2>{s.title}</h2>
            <p className="small muted">{s.how}</p>
            <FilePicker label={s.title} files={files[s.source]} onChange={pick(s.source)} maxFiles={1} maxSize={5 << 20} accept={[".csv", "text/csv", "text/plain"]} labels={t.files} />
          </section>
        ))}
        <section className="source" id="intune" aria-labelledby="intune-title">
          <h2 id="intune-title">{w.intune}</h2>
          {intune.connected ? (
            <>
              <p className="small muted">{w.intuneHow}</p>
              <div><button type="button" className="button quiet" disabled={pending} onClick={readIntune}>{pending && picked === null ? w.intuneReading : w.intuneRead}</button></div>
              {intune.last && <p className="small muted">{intune.last}</p>}
              {intune.lastFailed && <p className="small warn-text">{intune.lastFailed}</p>}
            </>
          ) : (
            <p className="small muted">{w.intuneOff}</p>
          )}
          {intuneNews && <p className="small strong" role="status">{intuneNews}</p>}
        </section>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {picked && (
        <section className="summary-box" aria-labelledby="check">
          <h2 id="check">{w.check}</h2>
          <p className="strong">{format(w.summary, { items: usable, given: picked.plan.given, placed: picked.plan.placed })}</p>
          {picked.plan.newCategories.length > 0 && <p>{format(w.newCategories, { names: picked.plan.newCategories.join(", ") })}</p>}
          {picked.plan.offered.length > 0 && (
            <fieldset className="keep">
              <legend className="strong">{w.keep}</legend>
              <p className="hint">{w.keepHint}</p>
              <div className="row">
                {picked.plan.offered.map(c => (
                  <label key={c} className="check"><input type="checkbox" checked={(picked.keep ?? picked.plan.offered).includes(c)} onChange={() => toggle(c)} /><span>{c}</span></label>
                ))}
              </div>
            </fieldset>
          )}
          {picked.plan.newFields.length > 0 && <p>{format(w.newFields, { names: picked.plan.newFields.join(", ") })}</p>}
          {picked.plan.ignored.length > 0 && <p className="small muted">{format(w.ignored, { names: picked.plan.ignored.join(", ") })}</p>}
          {skipped > 0 && <p className="small">{plural(w.skipped, skipped, locale)}</p>}
          <div className="preview-table">
            <DataTable<PlanRow>
              caption={format(w.rowsShown, { count: rows.length })}
              showCaption
              rows={rows.slice(0, 50)}
              rowKey={r => String(r.line)}
              rowName={r => r.name}
              rowProps={r => ({ className: r.skip ? "skipped" : undefined })}
              labels={t.table}
              columns={[
                { key: "line", label: w.line, render: r => <span className="mono">{r.line}</span>, width: "narrow" },
                { key: "item", label: w.item, rowHeader: true, render: r => <><span className="strong">{r.name}</span> {r.tag && <AssetTag tag={r.tag} />}<span className="small muted block">{r.category.newName ?? (r.category.ref ? categoryName(r.category.ref, t) : "")} · {t.status[r.status]}</span></> },
                { key: "holder", label: w.holder, render: r => (r.holder ? r.holderText : r.place ?? "") },
                { key: "remarks", label: w.remarks, render: r => <span className="small">
                  {r.skip && <span className="error block">{w.problems[r.skip]}</span>}
                  {r.problems.map(p => <span key={p.code} className="block warn-text">{format(w.problems[p.code], { name: p.name ?? "" })}</span>)}
                </span> },
              ]}
            />
          </div>
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => { setPicked(null); setFiles({ snipe: [], csv: [] }); }}>{w.cancel}</button>
            <button type="button" className="button" disabled={pending || usable === 0} onClick={submit}>{pending ? w.importing : plural(w.submit, usable, locale)}</button>
          </div>
        </section>
      )}
    </div>
  );
}
