"use client";

import { DataTable, FilePicker, Segmented, useToast, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords, TableWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Choices, Field, Plan, Target } from "../../../lib/importer.ts";
import { applyImport, previewImport } from "../actions.ts";

type Words = {
  import: {
    choose: string; reading: string; fields: Record<Field, string>; line: string; person: string; changes: string; ready: string;
    skip: Record<"not_found" | "ambiguous" | "duplicate", string>; problems: Record<string, string>;
    dmy: string; mdy: string; summary: { zero?: string; one: string; other: string }; leftOut: { one: string; other: string };
    apply: { one: string; other: string }; applying: string; done: { zero?: string; one: string; other: string }; loops: string;
    mapping: string; mappingHint: string; sample: string; targets: Record<"skip" | "name" | "first" | "last" | "email", string>;
    missingName: string; missingField: string; dateQuestion: string; columnsFound: string; extra: string;
  };
  errors: Record<ErrorCode, string>;
  files: FileWords;
  tables: TableWords;
};

const fieldOrder: Field[] = ["title", "team", "manager", "phone", "office", "startDate"];

// The file is read on the server each time: to show what each column holds
// and what will change, then to import it — never trusting what the page
// shows. HR corrects what a column holds and, when the dates could be read
// both ways, says how they are written. The file is chosen (or dropped)
// with the kit's FilePicker: it stays in the browser, its text goes to the
// server action; the plan is the kit's DataTable.
export function Importer({ locale, extras, t }: { locale: string; extras: { id: string; label: string }[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
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
  const choose = async (file: File | null | undefined) => {
    setError(null);
    setPlan(null);
    setChoices({});
    setText(null);
    if (!file) return;
    const content = await file.text();
    setText(content);
    preview(content, {});
  };
  // One file at a time: choosing one reads it; removing it starts again.
  const pick = (update: (current: readonly PickedFile[]) => PickedFile[]) => {
    const next = update(files);
    setFiles(next);
    if (next[0]?.key !== files[0]?.key) void choose(next[0]?.file);
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
      toast({ id: "import", text: plural(t.import.done, r.value.updated, locale) });
      if (r.value.loops.length > 0) toast({ id: "import-loops", text: format(t.import.loops, { names: r.value.loops.join(", ") }) });
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
      <FilePicker label={t.import.choose} files={files} onChange={pick} accept={[".csv", "text/csv"]} maxFiles={1} maxSize={2 << 20} labels={t.files} />
      <p className="muted small" role="status">{pending && !plan ? t.import.reading : ""}</p>
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
            <div className="date-order">
              <Segmented label={t.import.dateQuestion} hideLabel={false} value={choices.dateOrder === "dmy" || choices.dateOrder === "mdy" ? choices.dateOrder : plan.dateOrder} onChange={o => change({ ...choices, targets: plan.targets, dateOrder: o })}
                options={[{ value: "dmy", label: t.import.dmy }, { value: "mdy", label: t.import.mdy }]} />
            </div>
          )}
          {!plan.missing && (
            <>
              <div className="plan-summary">
                <p><strong>{plural(t.import.summary, ready.length, locale)}</strong>{left > 0 && <span className="muted"> · {plural(t.import.leftOut, left, locale)}</span>}</p>
                {!plan.askDateOrder && plan.columns.includes("startDate") && <p className="muted small">{plan.dateOrder === "dmy" ? t.import.dmy : t.import.mdy}</p>}
              </div>
              <div className="plan">
                <DataTable
                  caption={t.import.changes}
                  rows={plan.rows}
                  rowKey={r => String(r.line)}
                  labels={t.tables}
                  columns={[
                    { key: "line", label: t.import.line, value: r => r.line, width: "narrow" },
                    { key: "person", label: t.import.person, value: r => r.name, rowHeader: true },
                    {
                      key: "changes", label: t.import.changes, render: r => r.skip ? <span className="warn-text">{t.import.skip[r.skip]}</span> : (
                        <>
                          <span className="changes">
                            {(Object.entries(r.changes) as [Field, string][]).map(([f, v]) => <span key={f} className="change"><span className="muted">{t.import.fields[f]}</span> {v}</span>)}
                            {Object.entries(r.extras).map(([x, v]) => <span key={x} className="change"><span className="muted">{extras.find(e => e.id === x)?.label}</span> {v}</span>)}
                          </span>
                          {r.problems.map(p => <span key={p} className="warn-text">{t.import.problems[p]}</span>)}
                        </>
                      ),
                    },
                  ]}
                />
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
