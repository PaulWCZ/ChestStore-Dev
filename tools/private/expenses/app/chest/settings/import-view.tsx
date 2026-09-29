"use client";

import { DataTable, FilePicker, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { guessDateOrder, guessMapping, importFields, parseCsv, personKey, readDate, type DateOrder, type ImportField, type Mapping } from "../../../lib/csv-read.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { importExpenses } from "../actions.ts";

type Words = Catalogue["settings"]["import"];
const maxBytes = 2 << 20;

// Import past expenses: read the previous tool's CSV here, in the browser;
// guess its columns, let the accountant correct them and see the first
// lines as they will be read; then send the mapped lines. The file is
// picked with the kit's FilePicker and stays in the browser (no upload).
export function ImportSection({ team, locale, t, kit, errors }: { team: { id: string; name: string }[]; locale: string; t: Words; kit: Pick<Catalogue, "files" | "table">; errors: Catalogue["errors"] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [order, setOrder] = useState<DateOrder>("dmy");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  // A file picked (the picker already refused one too big or of another
  // kind): read it here. Taken off, the preview goes too.
  const picked = files[0]?.file ?? null;
  useEffect(() => {
    if (picked) void pick(picked);
    else setRows(null);
  }, [picked]);
  const names = useMemo(() => new Set(team.map(m => personKey(m.name))), [team]);

  async function pick(file: File | undefined) {
    setResult(null);
    setProblem(null);
    if (!file) return;
    if (file.size > maxBytes) return setProblem(t.tooBig);
    const parsed = parseCsv(await file.text(), 2002);
    if (parsed.length < 2) return setProblem(t.empty);
    if (parsed.length > 2001) return setProblem(t.tooBig);
    const guessed = guessMapping(parsed[0]!);
    setRows(parsed);
    setMapping(guessed);
    setOrder(guessed.date !== undefined ? guessDateOrder(parsed.slice(1, 200).map(r => r[guessed.date!] ?? "")) : "dmy");
  }

  const headers = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];
  const value = (row: string[], field: ImportField) => (mapping[field] === undefined ? "" : row[mapping[field]!] ?? "").trim();
  const unmatched = body.filter(r => !names.has(personKey(value(r, "person"))));
  const ready = body.length - unmatched.length;

  function run() {
    const lines = body.map(r => Object.fromEntries(importFields.map(f => [f, value(r, f)])));
    start(async () => {
      const answer = await importExpenses(lines, order);
      if (!answer.ok) return void toast({ text: format(errors[answer.error], answer.values ?? {}), tone: "error" });
      const { imported, skipped } = answer.value;
      const why = skipped.slice(0, 8).map(s => `${format(t.line, { line: s.line + 1 })} (${s.reason in t.reasons ? t.reasons[s.reason as keyof Words["reasons"]] : errors[s.reason as keyof Catalogue["errors"]] ?? s.reason})`).join(", ");
      setResult([plural(t.done, imported, locale), skipped.length > 0 ? `${plural(t.skipped, skipped.length, locale)}: ${why}${skipped.length > 8 ? "…" : ""}` : ""].filter(Boolean).join(" "));
      toast({ id: "import", text: plural(t.done, imported, locale) });
      setFiles([]);
      setRows(null);
      router.refresh();
    });
  }

  return (
    <section id="import" className="paper" aria-labelledby="import-title">
      <h2 id="import-title">{t.title}</h2>
      <p className="hint">{t.intro}</p>
      <hr className="rule" />
      <div className="form-grid">
        <div className="field-row">
          <span className="field-label" aria-hidden="true">{t.file}</span>
          <FilePicker label={t.file} files={files} onChange={setFiles} maxFiles={1} maxSize={maxBytes} accept={[".csv", "text/csv", "text/plain"]} labels={kit.files} />
        </div>
        {problem && <p className="error" role="alert">{problem}</p>}
        {result && <p className="notice info" role="status">{result}</p>}
        {rows && (
          <>
            <fieldset className="import-map">
              <legend className="field-label">{t.columns}</legend>
              {importFields.map(f => (
                <div key={f} className="field-row">
                  <label htmlFor={`map-${f}`}>{t.fields[f]}</label>
                  <select id={`map-${f}`} className="field" value={mapping[f] ?? ""} onChange={e => setMapping(m => ({ ...m, [f]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">{t.none}</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
              <div className="field-row">
                <label htmlFor="date-order">{t.dateOrder}</label>
                <select id="date-order" className="field" value={order} onChange={e => setOrder(e.target.value as DateOrder)}>
                  <option value="dmy">{t.dmy}</option>
                  <option value="mdy">{t.mdy}</option>
                  <option value="ymd">{t.ymd}</option>
                </select>
              </div>
            </fieldset>
            <div className="import-preview">
              <DataTable
                caption={t.preview}
                showCaption
                rows={body.slice(0, 5).map((r, i) => ({ i, r }))}
                rowKey={x => String(x.i)}
                labels={kit.table}
                columns={[
                  { key: "date", label: t.fields.date, render: x => <span className="mono">{readDate(value(x.r, "date"), order) ?? value(x.r, "date")}</span> },
                  { key: "person", label: t.fields.person, rowHeader: true, render: x => <span className={names.has(personKey(value(x.r, "person"))) ? undefined : "unmatched"}>{value(x.r, "person")}</span> },
                  { key: "amount", label: t.fields.amount, align: "end", render: x => <span className="mono">{value(x.r, "amount")}</span> },
                  { key: "currency", label: t.fields.currency, render: x => value(x.r, "currency") },
                  { key: "category", label: t.fields.category, render: x => value(x.r, "category") },
                  { key: "merchant", label: t.fields.merchant, render: x => value(x.r, "merchant") },
                ]}
              />
            </div>
            <p className="hint" role="status">
              {plural(t.matched, ready, locale)}{" "}
              {unmatched.length > 0 && plural(t.unmatched, unmatched.length, locale, { names: [...new Set(unmatched.map(r => value(r, "person") || "—"))].slice(0, 4).join(", ") })}
            </p>
            <div><button type="button" className="button" disabled={pending || ready === 0} onClick={run}>{plural(t.run, ready, locale)}</button></div>
          </>
        )}
      </div>
    </section>
  );
}
