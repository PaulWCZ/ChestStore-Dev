"use client";

import { useRouter } from "next/navigation";
import { Download, Table, Zip } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";

type Option = { value: string; label: string };

export function ExportView({ months, month, people, person, summary, csv, zip, t }: { months: Option[]; month: string | null; people: Option[]; person: string; summary: string | null; csv: string | null; zip: string | null; t: Catalogue["export"] }) {
  const router = useRouter();
  const go = (m: string | null, p: string) => router.push(`/chest/export${m ? `?month=${m}${p ? `&person=${p}` : ""}` : ""}`);
  if (months.length === 0) return <div className="paper empty"><span className="glyph"><Table /></span><p>{t.none}</p></div>;
  return (
    <>
      <div className="pickers">
        <div className="field-row">
          <label htmlFor="month">{t.month}</label>
          <select id="month" className="field" value={month ?? ""} onChange={e => go(e.target.value, "")}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="person">{t.person}</label>
          <select id="person" className="field" value={person} onChange={e => go(month, e.target.value)}>
            <option value="">{t.everyone}</option>
            {people.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <section className="paper">
        <p className="label" role="status">{summary ?? t.none}</p>
        <hr className="rule" />
        {csv && zip ? (
          <div className="downloads">
            <a className="download" href={csv} download>
              <strong><Table />{t.csv}</strong>
              <span>{t.csvHint}</span>
              <span className="button small" style={{ width: "fit-content" }}><Download />{t.download}</span>
            </a>
            <a className="download" href={zip} download>
              <strong><Zip />{t.zip}</strong>
              <span>{t.zipHint}</span>
              <span className="button small" style={{ width: "fit-content" }}><Download />{t.download}</span>
            </a>
          </div>
        ) : null}
        <p className="hint" style={{ marginTop: 12 }}>{t.bound}</p>
      </section>
      <p className="legal">{t.legal}</p>
    </>
  );
}
