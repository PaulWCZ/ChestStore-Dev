import { call, navigate, toast } from "@argentic/chest-app/client";
import { Checkbox, DateField, FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import { useEffect, useState, type FormEvent } from "react";
import { format, formatDay, formatNumber, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { Field, ImportColumn, ImportPlan, KindMap, LeavePlan, Mapping } from "../lib/import.ts";
import { limits } from "../shared/model.ts";
import { normalize } from "../shared/normalize.ts";

type Words = { import: Catalogue["import"]; team: Catalogue["team"]; date: Catalogue["kit"]["date"]; files: Catalogue["kit"]["files"] };

// The two imports, in three steps: the file; what was recognised — an
// unknown column (or, for leave, an unknown kind) gets a select, and the
// file is checked again with HR's answer; then applied in one go.
export function Importer({ what, example, today, locale, fields, kinds, t }: {
  what: "people" | "leave"; example: string; today: string; locale: string; fields: readonly { value: string; label: string }[]; kinds: readonly { id: string; name: string }[]; t: Words;
}) {
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [kindMap, setKindMap] = useState<KindMap>({});
  const [plan, setPlan] = useState<ImportPlan | LeavePlan | null>(null);
  const [asOf, setAsOf] = useState(today);
  // A day the field refuses as typed (unreadable): said under it; the
  // import waits — the day it held before is never sent in its place.
  const [asOfProblem, setAsOfProblem] = useState<string | null>(null);
  const [counted, setCounted] = useState(true);
  const [reason, setReason] = useState(what === "leave" ? t.import.reasonLeave : t.import.reasonDefault);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [pending, setPending] = useState(false);

  // A file chosen (or dropped) in the kit's file picker is read here, in
  // the browser, and checked like pasted text: nothing is uploaded.
  const picked = files.find(f => f.status === "ready" && f.file)?.file ?? null;
  useEffect(() => {
    if (!picked) return;
    let live = true;
    picked.text().then(value => {
      if (!live) return;
      setText(value);
      setMapping({});
      setKindMap({});
      check(value, {}, {});
    });
    return () => { live = false; };
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const kindName = new Map(kinds.map(k => [k.id, k.name]));
  const fieldName = new Map(fields.map(f => [f.value, f.label]));

  // Checked on the server (nothing written, the page not refreshed): what
  // it recognised, or why it cannot read the file.
  const check = (value: string, m: Mapping = mapping, k: KindMap = kindMap) => {
    setError(null);
    if (!value.trim()) return setPlan(null);
    setPending(true);
    void (what === "leave"
      ? call("checkLeaveImport", { text: value, mapping: m, kindMap: k }, { quiet: true, refresh: false })
      : call("checkImport", { text: value, mapping: m }, { quiet: true, refresh: false })
    ).then(result => {
      setPending(false);
      if (!result.ok) {
        setPlan(null);
        setError(result.message);
      } else setPlan(result.value);
    });
  };
  const map = (column: ImportColumn, field: string) => {
    const next = { ...mapping, [column.index]: field as Field };
    setMapping(next);
    check(text, next);
  };
  const mapKind = (named: string, typeId: string) => {
    const next = { ...kindMap, [normalize(named)]: typeId };
    setKindMap(next);
    check(text, mapping, next);
  };

  const rows = plan?.rows ?? [];
  const ready = rows.filter(r => r.problem === null && r.memberId);
  // The day field leaves with its form: its refusal goes with it.
  const asOfShown = plan !== null && what === "people" && ready.length > 0;
  useEffect(() => { if (!asOfShown) setAsOfProblem(null); }, [asOfShown]);
  const unknown = plan ? plan.columns.filter(c => !c.known || mapping[c.index] !== undefined) : [];
  const unknownKinds = plan && "unknownKinds" in plan ? plan.unknownKinds : [];
  const recognised = plan ? plan.columns.filter(c => c.known && c.field !== "ignore" && mapping[c.index] === undefined).map(c => `${c.header} → ${fieldName.get(c.field) ?? c.field}`) : [];

  // Applied in one go (the file read again on the server), then back to
  // People; lines it skipped are said here.
  async function apply(e: FormEvent) {
    e.preventDefault();
    if (what === "people" && asOfProblem !== null) return void document.getElementById("as-of")?.focus();
    if (pending) return;
    setPending(true);
    try {
      if (what === "leave") {
        const result = await call("applyLeaveImport", { text, mapping, kindMap, counted, reason }, { quiet: true, refresh: false });
        if (!result.ok) return setError(result.message);
        toast({ text: plural(t.import.leaveDone, result.value.done, locale) + (result.value.skipped.length > 0 ? " " + plural(t.import.leaveSkipped, result.value.skipped.length, locale) : "") });
        if (result.value.skipped.length > 0) {
          setError(result.value.skipped.map(s => format(t.import.skippedLine, { line: s.line, why: t.import.skipped[s.problem as keyof typeof t.import.skipped] ?? s.problem })).join(" · "));
          setPlan(null);
          return;
        }
      } else {
        const result = await call("applyImport", { text, mapping, onDate: asOf, reason }, { quiet: true, refresh: false });
        if (!result.ok) return setError(result.message);
        toast({ text: plural(t.import.done, result.value.balances, locale) + (result.value.people > 0 ? " " + plural(t.import.peopleDone, result.value.people, locale) : "") });
      }
      await navigate("/chest/people");
    } finally {
      setPending(false);
    }
  }

  const describe = (r: (typeof rows)[number]): string => {
    if ("values" in r) {
      const parts = r.values.map(v => {
        const name = kindName.get(v.typeId) ?? "";
        const n = (x: number) => formatNumber(x, locale);
        return v.earning !== null ? format(t.import.split, { kind: name, acquired: n(v.days ?? 0), earning: n(v.earning) }) : `${name} ${n(v.days ?? 0)}`;
      });
      if (r.start) parts.push(format(t.import.startOn, { date: formatDay(r.start, locale, { day: "numeric", month: "short", year: "numeric" }) }));
      if (r.number) parts.push(format(t.import.numberIs, { number: r.number }));
      return parts.join(" · ");
    }
    const span = r.start && r.end ? `${formatDay(r.start, locale)}${r.startHalf === "pm" ? " " + t.import.pm : ""} – ${formatDay(r.end, locale)}${r.endHalf === "am" ? " " + t.import.am : ""}` : "";
    return [r.typeId ? kindName.get(r.typeId) : "", span].filter(Boolean).join(" · ");
  };

  return (
    <div className="importer">
      <details className="example">
        <summary>{t.import.example}</summary>
        <pre>{example}</pre>
        <p className="muted small">{what === "leave" ? t.import.exampleLeaveHint : t.import.exampleHint}</p>
      </details>
      <FilePicker label={t.import.file} files={files} onChange={setFiles} maxFiles={1} maxSize={limits.importBytes} accept={[".csv", "text/csv", "text/plain"]} labels={t.files} />
      <label htmlFor="csv" className="field-label">{t.import.paste}</label>
      <textarea id="csv" className="field mono" rows={6} value={text} onChange={e => setText(e.target.value)} />
      <button type="button" className="button quiet" disabled={pending || !text.trim()} onClick={() => check(text)}>{t.import.check}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {plan && (
        <>
          {recognised.length > 0 && <p className="muted small">{format(t.import.recognised, { list: recognised.join(" · ") })}</p>}
          {(unknown.length > 0 || unknownKinds.length > 0) && (
            <div className="mapping">
              {unknown.length > 0 && <p><strong>{t.import.mapTitle}</strong></p>}
              {unknown.map(c => (
                <div key={c.index} className="form-row">
                  <label htmlFor={`map-${c.index}`}>{c.header || format(t.import.column, { n: c.index + 1 })}</label>
                  <select id={`map-${c.index}`} className="field" value={mapping[c.index] ?? "ignore"} disabled={pending} onChange={e => map(c, e.target.value)}>
                    {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              ))}
              {unknownKinds.length > 0 && <p><strong>{t.import.mapKinds}</strong></p>}
              {unknownKinds.map(k => (
                <div key={k} className="form-row">
                  <label htmlFor={`kind-${normalize(k)}`}>{format(t.import.kindIs, { name: k })}</label>
                  <select id={`kind-${normalize(k)}`} className="field" value={kindMap[normalize(k)] ?? ""} disabled={pending} onChange={e => mapKind(k, e.target.value)}>
                    <option value="">{t.import.skipKind}</option>
                    {kinds.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <table className="people">
              <thead><tr><th scope="col">{t.import.line}</th><th scope="col">{t.import.name}</th><th scope="col">{t.import.matched}</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.line} className={r.problem ? "problem" : undefined}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.problem ? <span className="error">{t.import.problems[r.problem]}</span> : describe(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ready.length === 0 ? <p className="error">{t.import.nothing}</p> : (
            <form className="stack" onSubmit={e => void apply(e)}>
              {what === "people" ? (
                <div className="form-row">
                  <div className="field-group day-field">
                    <DateField id="as-of" label={t.import.asOf} value={asOf || null} onChange={v => setAsOf(v ?? "")} onProblem={setAsOfProblem} today={today} required labels={t.date} />
                  </div>
                  <div className="field-group grow">
                    <label className="field-label" htmlFor="import-reason">{t.import.reason}</label>
                    <input id="import-reason" className="field" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
                  </div>
                </div>
              ) : (
                <Checkbox label={t.import.counted} checked={counted} onChange={setCounted} />
              )}
              <button type="submit" className="button" disabled={pending || (what === "people" && asOfProblem !== null)}>{plural(what === "leave" ? t.import.applyLeave : t.import.applyPeople, ready.length, locale)}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
