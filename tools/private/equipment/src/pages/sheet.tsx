import type { ReactNode } from "react";
import { Island } from "@argentic/chest-app";
import type { Catalogue } from "../i18n/index.ts";
import { Back } from "../components/icons.tsx";

// A printed A4 form — the handover sheet, the return sheet: the company,
// the person, a table of items, a statement and two signature boxes. On
// screen a bar to print it ("Save as PDF" in the print window keeps it as a
// file); on paper, only the form.
export function SheetPage({ title, back, backLabel, t, children }: { title: string; back: string; backLabel: string; t: Catalogue["sheet"]; children: ReactNode }) {
  return (
    <div className="sheet-page">
      <div className="no-print">
        <a className="back" href={back}><Back />{backLabel}</a>
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <p className="muted">{t.hint}</p>
          </div>
          <div className="actions"><Island name="PrintButton" props={{ label: t.print }} /></div>
        </div>
      </div>
      <article className="paper" aria-label={title}>{children}</article>
    </div>
  );
}

// The person is written by their name only (a sheet is kept as proof: never
// the app's "(former member)"); someone who left has their day on a line of
// its own. Each line is a term and its value, read as such.
export function SheetHead({ title, company, person, leftOn, printed, t }: { title: string; company: string; person: string; leftOn?: string | null; printed: string; t: Catalogue["sheet"] }) {
  return (
    <header className="paper-head">
      <div>
        {company && <p className="paper-company">{company}</p>}
        <h2 className="paper-title">{title}</h2>
      </div>
      <dl className="paper-who">
        <div><dt>{t.employee}</dt><dd>{person}</dd></div>
        {leftOn && <div><dt>{t.leftOn}</dt><dd>{leftOn}</dd></div>}
        <div className="muted"><dt>{t.printedOn}</dt><dd>{printed}</dd></div>
      </dl>
    </header>
  );
}

export function Signatures({ t }: { t: Catalogue["sheet"] }) {
  const box = (who: string) => (
    <div className="sign-box">
      <p className="strong">{who}</p>
      <p>{t.signName}</p>
      <p>{t.signDate}</p>
      <p>{t.signature}</p>
    </div>
  );
  return <div className="signatures">{box(t.signEmployee)}{box(t.signCompany)}</div>;
}
