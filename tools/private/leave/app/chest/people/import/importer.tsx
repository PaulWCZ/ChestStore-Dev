"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, formatDay, plural } from "../../../../lib/i18n/format.ts";
import type { Field, ImportColumn, ImportPlan, KindMap, LeavePlan, Mapping } from "../../../../lib/import.ts";
import { normalize } from "../../../../lib/normalize.ts";
import { applyImport, applyLeaveImport, checkImport, checkLeaveImport } from "../../actions.ts";

type Words = { import: Catalogue["import"]; errors: Catalogue["errors"]; team: Catalogue["team"] };

// The two imports, in three steps: the file; what was recognised — an
// unknown column (or, for leave, an unknown kind) gets a select, and the
// file is checked again with HR's answer; then applied in one go.
export function Importer({ what, example, today, fields, kinds, t }: {
  what: "people" | "leave"; example: string; today: string; fields: { value: string; label: string }[]; kinds: { id: string; name: string }[]; t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [kindMap, setKindMap] = useState<KindMap>({});
  const [plan, setPlan] = useState<ImportPlan | LeavePlan | null>(null);
  const [asOf, setAsOf] = useState(today);
  const [counted, setCounted] = useState(true);
  const [reason, setReason] = useState(what === "leave" ? t.import.reasonLeave : t.import.reasonDefault);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
  const kindName = new Map(kinds.map(k => [k.id, k.name]));
  const fieldName = new Map(fields.map(f => [f.value, f.label]));

  const check = (value: string, m: Mapping = mapping, k: KindMap = kindMap) => {
    setError(null);
    if (!value.trim()) return setPlan(null);
    start(async () => {
      const result = what === "leave" ? await checkLeaveImport(value, m, k) : await checkImport(value, m);
      if (!result.ok) {
        setPlan(null);
        setError(format(t.errors[result.error as ErrorCode], result.values));
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
  const unknown = plan ? plan.columns.filter(c => !c.known || mapping[c.index] !== undefined) : [];
  const unknownKinds = plan && "unknownKinds" in plan ? plan.unknownKinds : [];
  const recognised = plan ? plan.columns.filter(c => c.known && c.field !== "ignore" && mapping[c.index] === undefined).map(c => `${c.header} → ${fieldName.get(c.field) ?? c.field}`) : [];

  function apply(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      if (what === "leave") {
        const result = await applyLeaveImport(text, mapping, kindMap, counted, reason);
        if (!result.ok) return setError(format(t.errors[result.error as ErrorCode], result.values));
        toast(plural(t.import.leaveDone, result.value.done, locale) + (result.value.skipped.length > 0 ? " " + plural(t.import.leaveSkipped, result.value.skipped.length, locale) : ""));
        if (result.value.skipped.length > 0) {
          setError(result.value.skipped.map(s => format(t.import.skippedLine, { line: s.line, why: t.import.skipped[s.problem as keyof typeof t.import.skipped] ?? s.problem })).join(" · "));
          setPlan(null);
          return;
        }
      } else {
        const result = await applyImport(text, mapping, asOf, reason);
        if (!result.ok) return setError(format(t.errors[result.error as ErrorCode], result.values));
        toast(plural(t.import.done, result.value.balances, locale) + (result.value.people > 0 ? " " + plural(t.import.peopleDone, result.value.people, locale) : ""));
      }
      router.push("/chest/people");
    });
  }

  const describe = (r: (typeof rows)[number]): string => {
    if ("values" in r) {
      const parts = r.values.map(v => {
        const name = kindName.get(v.typeId) ?? "";
        const n = (x: number) => new Intl.NumberFormat(locale).format(x);
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
      <label className="button quiet file-button">
        {t.import.file}
        <input type="file" accept=".csv,text/csv,text/plain" className="visually-hidden" onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const value = await file.text();
          setText(value);
          setMapping({});
          setKindMap({});
          check(value, {}, {});
        }} />
      </label>
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
            <form className="stack" onSubmit={apply}>
              {what === "people" ? (
                <div className="form-row">
                  <div className="field-group">
                    <label className="field-label" htmlFor="as-of">{t.import.asOf}</label>
                    <input id="as-of" className="field" type="date" required value={asOf} onChange={e => setAsOf(e.target.value)} />
                  </div>
                  <div className="field-group grow">
                    <label className="field-label" htmlFor="import-reason">{t.import.reason}</label>
                    <input id="import-reason" className="field" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
                  </div>
                </div>
              ) : (
                <label className="check">
                  <input type="checkbox" checked={counted} onChange={e => setCounted(e.target.checked)} />
                  <span>{t.import.counted}</span>
                </label>
              )}
              <button type="submit" className="button" disabled={pending}>{plural(what === "leave" ? t.import.applyLeave : t.import.applyPeople, ready.length, locale)}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
