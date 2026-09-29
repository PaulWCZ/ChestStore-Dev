"use client";

import { EmptyState, Filters, Segmented } from "@argentic/chest-ui/components";
import Link from "next/link";
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
  const switchBy = (
    <div className="by-switch">
      <Segmented label={t.by} hideLabel={false} value={by} link={Link} options={[{ value: "spent", label: t.bySpent, href: "/chest/export" }, { value: "paid", label: t.byPaid, href: "/chest/export?by=paid" }]} />
    </div>
  );
  if (months.length === 0) return <>{switchBy}<div className="paper"><EmptyState icon={<Table />} title={t.none} /></div></>;
  return (
    <>
      {switchBy}
      {/* The kit's filters as two lists, kept in the address (a link to
          share; without script, a "Show" button). */}
      <Filters
        className="pickers"
        path="/chest/export"
        params={{ month: month ?? undefined, person: person || undefined, by: by === "paid" ? "paid" : undefined }}
        onNavigate={href => router.push(href)}
        labels={{ label: t.filters, clear: t.clear, all: t.everyone, apply: t.show }}
        groups={[
          { key: "month", label: t.month, as: "select", required: true, ...(month ? { value: month } : {}), options: months },
          { key: "person", label: t.person, as: "select", options: people },
        ]}
      />
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
