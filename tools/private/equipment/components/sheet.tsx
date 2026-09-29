import type { ReactNode } from "react";
import type { Catalogue } from "../lib/i18n/index.ts";
import { Back } from "./icons.tsx";
import { PrintButton } from "./print-button.tsx";

// A printed A4 form — the handover sheet, the return sheet: the company,
// the person, a table of items, a statement and two signature boxes. On
// screen a bar to print it ("Save as PDF" in the print window keeps it as a
// file); on paper, only the form.
export function SheetPage({ title, back, backLabel, t, children }: { title: string; back: string; backLabel: string; t: Catalogue["sheet"]; children: ReactNode }) {
  return (
    <main className="sheet-page">
      <div className="labels-bar no-print">
        <a className="back" href={back}><Back />{backLabel}</a>
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <p className="muted">{t.hint}</p>
          </div>
          <div className="actions"><PrintButton label={t.print} /></div>
        </div>
      </div>
      <article className="paper" aria-label={title}>{children}</article>
    </main>
  );
}

export function SheetHead({ title, company, person, printed, t }: { title: string; company: string; person: string; printed: string; t: Catalogue["sheet"] }) {
  return (
    <header className="paper-head">
      <div>
        {company && <p className="paper-company">{company}</p>}
        <h2 className="paper-title">{title}</h2>
      </div>
      <dl className="paper-who">
        <div><dt>{t.employee}</dt><dd>{person}</dd></div>
        <div><dt className="visually-hidden">{t.printed}</dt><dd className="muted">{printed}</dd></div>
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
