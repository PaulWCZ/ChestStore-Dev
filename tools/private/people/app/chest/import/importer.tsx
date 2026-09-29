"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Upload } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Choices, Field, Plan, Target } from "../../../lib/importer.ts";
import { applyImport, previewImport } from "../actions.ts";

type Words = {
  import: {
    choose: string; reading: string; fields: Record<Field, string>; line: string; person: string; changes: string; ready: string;
    skip: Record<"not_found" | "ambiguous" | "duplicate", string>; problems: Record<string, string>;
    dmy: string; mdy: string; summary: { zero?: string; one: string; other: string }; leftOut: { one: string; other: string };
    apply: { one: string; other: string }; applying: string; done: { zero?: string; one: string; other: string }; loops: string; another: string;
    mapping: string; mappingHint: string; sample: string; targets: Record<"skip" | "name" | "first" | "last" | "email", string>;
    missingName: string; missingField: string; dateQuestion: string; columnsFound: string; extra: string;
  };
  errors: Record<ErrorCode, string>;
};

const fieldOrder: Field[] = ["title", "team", "manager", "phone", "office", "startDate"];

// The file is read on the server each time: to show what each column holds
// and what will change, then to import it — never trusting what the page
// shows. HR corrects what a column holds and, when the dates could be read
// both ways, says how they are written.
export function Importer({ locale, extras, t }: { locale: string; extras: { id: string; label: string }[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const preview = (content: string, next: Choices) => start(async () => {
    const r = await previewImport(content, next);
    if (!r.ok) setError(format(t.errors[r.error], r.values ?? {}));
    else {
      setError(null);
      setPlan(r.value);
    }
  });
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPlan(null);
    setChoices({});
    if (file.size > 2 << 20) {
      setError(t.errors.import_invalid);
      return;
    }
    const content = await file.text();
    setText(content);
    preview(content, {});
  };
  const change = (next: Choices) => {
    setChoices(next);
    if (text !== null) preview(text, next);
  };
  const apply = () => {
    if (text === null) return;
    start(async () => {
      const r = await applyImport(text, choices);
      if (!r.ok) {
        setError(format(t.errors[r.error], r.values ?? {}));
        return;
      }
      toast(plural(t.import.done, r.value.updated, locale));
      if (r.value.loops.length > 0) toast(format(t.import.loops, { names: r.value.loops.join(", ") }));
      router.push("/chest");
    });
  };
  const targetWord = (target: Target): string => {
    if (target.startsWith("x:")) return format(t.import.extra, { label: extras.find(x => "x:" + x.id === target)?.label ?? "" });
    if (target in t.import.targets) return t.import.targets[target as keyof Words["import"]["targets"]];
    return t.import.fields[target as Field];
  };
  const options: Target[] = ["skip", "name", "first", "last", "email", ...fieldOrder, ...extras.map(x => `x:${x.id}` as const)];
  const ready = plan?.rows.filter(r => r.memberId && !r.skip) ?? [];
  const left = (plan?.rows.length ?? 0) - ready.length;
  const found = plan ? plan.targets.filter(x => x !== "skip").map(targetWord).join(", ") : "";

  return (
    <div className="importer">
      <label className={plan ? "drop small" : "drop"}>
        <Upload />
        <span>{pending && !plan ? t.import.reading : plan ? t.import.another : t.import.choose}</span>
        <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="visually-hidden" onChange={e => void choose(e.target.files?.[0])} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {plan && (
        <>
          <details className="mapping" open={plan.missing !== null || undefined}>
            <summary>{format(t.import.columnsFound, { list: found || "—" })}</summary>
            <p className="muted small">{t.import.mappingHint}</p>
            <h2 className="visually-hidden">{t.import.mapping}</h2>
            <ul className="mapping-list">
              {plan.headers.map((header, i) => (
                <li key={i}>
                  <label htmlFor={`${uid}-col-${i}`}>
                    <strong>{header || "—"}</strong>
                    {plan.samples[i]!.length > 0 && <span className="muted small">{format(t.import.sample, { values: plan.samples[i]!.join(", ") })}</span>}
                  </label>
                  <select id={`${uid}-col-${i}`} className="select" value={plan.targets[i]} disabled={pending} onChange={e => {
                    const next = [...plan.targets];
                    const chosen = e.target.value as Target;
                    // A column holds one thing: whichever else held it is left out.
                    if (chosen !== "skip") next.forEach((x, k) => { if (x === chosen) next[k] = "skip"; });
                    next[i] = chosen;
                    change({ ...choices, targets: next });
                  }}>
                    {options.map(o => <option key={o} value={o}>{targetWord(o)}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </details>
          {plan.missing && <p className="banner warn" role="alert">{plan.missing === "name" ? t.import.missingName : t.import.missingField}</p>}
          {plan.askDateOrder && (
            <fieldset className="segmented date-order">
              <legend className="label">{t.import.dateQuestion}</legend>
              {(["dmy", "mdy"] as const).map(o => (
                <label key={o}>
                  <input type="radio" name={uid + "order"} value={o} checked={plan.dateOrder === o} disabled={pending} onChange={() => change({ ...choices, targets: plan.targets, dateOrder: o })} />
                  <span>{o === "dmy" ? t.import.dmy : t.import.mdy}</span>
                </label>
              ))}
            </fieldset>
          )}
          {!plan.missing && (
            <>
              <div className="plan-summary">
                <p><strong>{plural(t.import.summary, ready.length, locale)}</strong>{left > 0 && <span className="muted"> · {plural(t.import.leftOut, left, locale)}</span>}</p>
                {!plan.askDateOrder && plan.columns.includes("startDate") && <p className="muted small">{plan.dateOrder === "dmy" ? t.import.dmy : t.import.mdy}</p>}
              </div>
              <div className="table-frame">
                <table className="plan">
                  <thead>
                    <tr><th scope="col">{t.import.line}</th><th scope="col">{t.import.person}</th><th scope="col">{t.import.changes}</th></tr>
                  </thead>
                  <tbody>
                    {plan.rows.map(r => (
                      <tr key={r.line} className={r.skip ? "skipped" : undefined}>
                        <td className="num">{r.line}</td>
                        <td>{r.name}</td>
                        <td>
                          {r.skip ? <span className="warn-text">{t.import.skip[r.skip]}</span> : (
                            <>
                              <span className="changes">
                                {(Object.entries(r.changes) as [Field, string][]).map(([f, v]) => <span key={f} className="change"><span className="muted">{t.import.fields[f]}</span> {v}</span>)}
                                {Object.entries(r.extras).map(([x, v]) => <span key={x} className="change"><span className="muted">{extras.find(e => e.id === x)?.label}</span> {v}</span>)}
                              </span>
                              {r.problems.map(p => <span key={p} className="warn-text">{t.import.problems[p]}</span>)}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row form-actions">
                <button type="button" className="button" disabled={pending || ready.length === 0} onClick={apply}>{pending ? t.import.applying : plural(t.import.apply, ready.length, locale)}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
