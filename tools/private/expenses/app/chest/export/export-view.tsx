"use client";

import { EmptyState, Segmented } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { Download, FileIcon, Table, Zip } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";

type Option = { value: string; label: string };

export function ExportView({ by, months, month, people, person, summary, leftOut, csv, zip, journal, t }: {
  by: "spent" | "paid";
  months: Option[];
  month: string | null;
  people: Option[];
  person: string;
  summary: string | null;
  leftOut: string | null;
  csv: string | null;
  zip: string | null;
  journal: string | null;
  t: Catalogue["export"];
}) {
  const router = useRouter();
  const go = (m: string | null, p: string, b = by) => router.push(`/chest/export?${[m ? `month=${m}` : "", p ? `person=${p}` : "", b === "paid" ? "by=paid" : ""].filter(Boolean).join("&")}`);
  const switchBy = (
    <div className="by-switch">
      <Segmented name="by" label={t.by} hideLabel={false} value={by} onChange={b => go(null, "", b)} options={[{ value: "spent", label: t.bySpent }, { value: "paid", label: t.byPaid }]} />
    </div>
  );
  if (months.length === 0) return <>{switchBy}<div className="paper"><EmptyState icon={<Table />} title={t.none} /></div></>;
  return (
    <>
      {switchBy}
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
        {csv && zip && journal ? (
          <div className="downloads">
            <a className="download" href={csv} download>
              <strong><Table />{t.csv}</strong>
              <span>{t.csvHint}</span>
              <span className="button small"><Download />{t.download}</span>
            </a>
            <a className="download" href={zip} download>
              <strong><Zip />{t.zip}</strong>
              <span>{t.zipHint}</span>
              <span className="button small"><Download />{t.download}</span>
            </a>
            <a className="download" href={journal} download>
              <strong><FileIcon />{t.journal}</strong>
              <span>{t.journalHint}</span>
              <span className="button small"><Download />{t.download}</span>
            </a>
          </div>
        ) : null}
        <div className="export-notes">
          {leftOut && <p className="notice">{leftOut}</p>}
          <p className="hint">{t.bound}</p>
        </div>
      </section>
      <p className="legal">{t.legal}</p>
    </>
  );
}
