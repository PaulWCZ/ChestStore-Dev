import { call, navigate, toast } from "@argentic/chest-app/client";
import { FilePicker, PeoplePicker, type PickedFile } from "@argentic/chest-ui/components";
import { localSearch, type FileWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useId, useRef, useState } from "react";
import { Alert, Download, Upload } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import type { Field, Mapping, Preview } from "../lib/import.ts";
import { format, plural } from "../shared/format.ts";

// The fields a column may hold, in the order the page asks (the same as
// lib/import.ts `fields`; a view never imports the service).
const fields: Field[] = ["objective", "keyResult", "rowKind", "owner", "krOwner", "level", "team", "parent", "why", "kind", "start", "target", "current", "unit", "confidence"];
const maxBytes = 3 * 1024 * 1024;

type Words = { import: Catalogue["import"]; errors: Catalogue["errors"]; levels: Catalogue["levels"]; objective: Catalogue["objective"]; kinds: Catalogue["kinds"]; files: FileWords; peoplePicker: PeoplePickerWords };

export function ImportView({ cycles, cycleId, people, locale, t }: { cycles: { id: string; name: string }[]; cycleId: string; people: { id: string; name: string; photo: string | null }[]; locale: string; t: Words }) {
  const uid = useId();
  const w = t.import;
  const [cycle, setCycle] = useState(cycleId);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [text, setText] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The latest preview asked: an older answer arriving late is dropped.
  const asked = useRef(0);
  const cycleName = cycles.find(c => c.id === cycle)?.name ?? "";

  // What the file would add, read again at each choice (a column, an
  // owner, the cycle): sent beside the page's other actions.
  function look(next: { text?: string; mapping?: Mapping | null; cycle?: string; owners?: Record<string, string> }) {
    const input = { text: next.text ?? text ?? "", mapping: next.mapping === undefined ? mapping : next.mapping, cycleId: next.cycle ?? cycle, owners: next.owners ?? owners };
    const ticket = ++asked.current;
    setPending(true);
    void call("previewImport", input, { quiet: true, refresh: false }).then(r => {
      if (ticket !== asked.current) return;
      setPending(false);
      if (!r.ok) {
        setPreview(null);
        return setError(r.message);
      }
      setError(null);
      setPreview(r.value);
      setMapping(r.value.mapping);
    });
  }

  // The kit's file picker keeps the file in the page (nothing is sent until
  // "Import"): a new file is read at once; taking it away starts again.
  function pick(update: (current: readonly PickedFile[]) => PickedFile[]) {
    const next = update(files);
    setFiles(next);
    const file = next[0]?.file ?? null;
    if (!file) {
      setText(null);
      setMapping(null);
      setPreview(null);
      setError(null);
      return;
    }
    if (next[0]!.key !== files[0]?.key) void choose(file);
  }

  async function choose(file: File) {
    if (file.size > maxBytes) return setError(t.errors.import_too_big);
    const read = await file.text();
    setText(read);
    setMapping(null);
    setOwners({});
    look({ text: read, mapping: null, owners: {} });
  }

  async function go() {
    if (!text || !mapping || pending) return;
    setPending(true);
    const r = await call("runImport", { text, mapping, cycleId: cycle, owners }, { quiet: true, refresh: false });
    setPending(false);
    if (!r.ok) return setError(r.message);
    const ids = r.value.objectives;
    toast({
      id: "import",
      text: format(w.done, { objectives: plural(w.objectives, ids.length, locale), keyResults: plural(t.objective.keyResultsCount, r.value.keyResults, locale) }),
      undo: async () => {
        const back = await call("undoImport", { ids }, { quiet: true });
        return back.ok ? true : back.message;
      },
    });
    await navigate(`/chest/company?cycle=${cycle}`);
  }

  const plan = preview?.plan;
  const adding = plan ? plan.objectives.filter(o => !o.exists) : [];
  const krCount = adding.reduce((n, o) => n + o.keyResults.length, 0);
  const unmatched = plan ? plan.owners.filter(o => o.match === null || owners[o.key]) : [];
  const setField = (field: Field, value: string) => {
    const next: Mapping = { ...(mapping ?? {}) };
    if (value === "") delete next[field];
    else next[field] = Number(value);
    setMapping(next);
    look({ mapping: next });
  };

  return (
    <div className="stack import">
      <div className="card form-card">
        <div className="grid-2">
          <div>
            <span className="label" aria-hidden="true">{w.file}</span>
            <FilePicker label={w.file} files={files} onChange={pick} maxFiles={1} maxSize={maxBytes} accept={[".csv", "text/csv", "text/plain"]} labels={t.files} />
            <p className="hint">{w.fileHint} <a href="/chest/import/example" download><Download />{w.example}</a></p>
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-cycle`}>{w.into}</label>
            <select id={`${uid}-cycle`} className="select" value={cycle} onChange={e => { setCycle(e.target.value); if (text) look({ cycle: e.target.value }); }}>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        {pending && !preview && <p className="hint" role="status">{w.reading}</p>}
        {error && <p className="error" role="alert"><Alert />{error}</p>}
      </div>

      {preview && plan && (
        <>
          <section className="card form-card" aria-labelledby={`${uid}-columns`}>
            <div className="stack-s">
              <h2 id={`${uid}-columns`} className="h3">{w.columns}</h2>
              <p className="hint">{w.recognised[preview.preset]}</p>
            </div>
            <div className="mapping">
              {fields.filter(f => f !== "rowKind" || preview.preset === "lattice" || mapping?.rowKind !== undefined).map(f => (
                <div key={f}>
                  <label className="label" htmlFor={`${uid}-${f}`}>{w.fields[f]}</label>
                  <select id={`${uid}-${f}`} className="select" value={mapping?.[f] ?? ""} onChange={e => setField(f, e.target.value)}>
                    <option value="">{w.notInFile}</option>
                    {preview.headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}{preview.sample[0]?.[i] ? ` (${preview.sample[0][i]!.slice(0, 24)})` : ""}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="card form-card" aria-labelledby={`${uid}-preview`} aria-busy={pending}>
            <h2 id={`${uid}-preview`} className="h3">{w.preview}</h2>
            <p aria-live="polite"><strong>{format(w.summary, { objectives: plural(w.objectives, adding.length, locale), keyResults: plural(t.objective.keyResultsCount, krCount, locale), cycle: cycleName })}</strong></p>
            {plan.objectives.length > 0 && (
              <ul className="import-list">
                {plan.objectives.slice(0, 60).map(o => (
                  <li key={o.row} className={o.exists ? "exists" : undefined}>
                    <span className="eyebrow">{o.team ?? t.levels[o.level]}{o.parent ? ` · ${w.under} “${o.parent}”` : ""}</span>
                    <strong>{o.title}</strong>
                    <span className="hint">{o.exists ? w.already : o.keyResults.length === 0 ? t.objective.noKeyResults : o.keyResults.map(k => k.title).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
            {plan.newTeams.length > 0 && <p className="notice">{format(w.newTeams, { names: plan.newTeams.join(", ") })}</p>}
            {unmatched.length > 0 && (
              <fieldset className="stack-s plain">
                <legend className="stack-s"><span className="h3">{w.owners}</span><span className="hint">{w.ownersHint}</span></legend>
                {unmatched.map(o => (
                  <div key={o.key} className="owner-pick">
                    <PeoplePicker label={`${o.written} · ${plural(w.ownerRows, o.rows, locale)}`} value={people.filter(p => p.id === owners[o.key])} search={localSearch(people)} labels={t.peoplePicker} lang={locale}
                      onChange={v => { const next = { ...owners }; if (v[0]) next[o.key] = v[0].id; else delete next[o.key]; setOwners(next); look({ owners: next }); }} />
                  </div>
                ))}
              </fieldset>
            )}
            {plan.problems.length > 0 && (
              <details className="left-out">
                <summary>{plural(w.leftOut, plan.problems.filter(p => p.code !== "parent_not_found").length, locale)}</summary>
                <ul>{plan.problems.map((p, i) => <li key={i}>{format(w.problem, { row: format(w.row, { row: p.row }), what: w.problems[p.code] })}</li>)}</ul>
              </details>
            )}
            <div className="form-actions">
              <button type="button" className="button" disabled={pending || adding.length === 0} onClick={() => void go()}><Upload />{pending ? w.importing : plural(w.go, adding.length, locale)}</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
