import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { format, formatDate, formatDay, plural } from "../../../../lib/i18n/index.ts";
import { ofRegister } from "../../../../lib/journal.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { mentions, register, type Line } from "../../../../lib/register.ts";
import { viewer } from "../../../../lib/session.ts";
import { PrintButton } from "./print-button.tsx";

// The staff register (registre unique du personnel), written from the HR
// records: employees in the order they were hired, interns in their own
// part. HR reads it here, prints it or saves it as a PDF, or downloads it
// as a spreadsheet; each read is written in the journal.
export default async function RegisterPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "records.manage")) notFound();
  const sql = db();
  const r = await register(sql, member, "register_viewed");
  const reads = await ofRegister(sql, 5);
  const names = await people([...r.interns.map(l => l.tutorId ?? ""), ...reads.map(x => x.actor)]);
  const c = t.register.columns;
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const gaps = [...r.employees, ...r.interns].filter(l => l.missing.length > 0).length;
  const cellOf = (l: Line) => (l.missing.length > 0 ? "gap" : undefined);
  return (
    <main className="page wide register-page">
      <Link className="back no-print" href="/chest/records"><Back />{t.record.back}</Link>
      <div className="page-head">
        <div>
          <h1>{t.register.title}</h1>
          <p className="muted lead">{t.register.lead}</p>
        </div>
        <div className="row no-print">
          <a className="button quiet small" href="/chest/records/register/csv" download><Download />{t.register.csv}</a>
          <PrintButton label={t.register.print} />
        </div>
      </div>
      {gaps > 0 && <p className="banner warn no-print">{plural(t.register.missing, gaps, locale)}</p>}
      {r.employees.length === 0 && r.interns.length === 0 ? <div className="empty"><p>{t.register.empty}</p></div> : (
        <>
          <section className="section" aria-labelledby="emp-title">
            <h2 id="emp-title" className="eyebrow">{t.register.employees}</h2>
            <div className="table-frame">
              <table className="plan register">
                <thead>
                  <tr>{[c.number, c.name, c.nationality, c.birthDate, c.sex, c.job, c.qualification, c.entry, c.exit, c.permit, c.mentions].map(h => <th key={h} scope="col">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {r.employees.map(l => (
                    <tr key={l.recordId} className={cellOf(l)}>
                      <td className="num">{l.number}</td>
                      <th scope="row"><Link href={`/chest/records/${l.recordId}`}>{l.name}</Link></th>
                      <td>{l.nationality}</td>
                      <td>{day(l.birthDate)}</td>
                      <td>{l.sex ? t.record.sexes[l.sex] : ""}</td>
                      <td>{l.job}</td>
                      <td>{l.qualification}</td>
                      <td>{day(l.startDate)}</td>
                      <td>{day(l.endDate)}</td>
                      <td>{l.workPermit}</td>
                      <td>{mentions(l, t.register.mention)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {r.interns.length > 0 && (
            <section className="section" aria-labelledby="int-title">
              <h2 id="int-title" className="eyebrow">{t.register.interns}</h2>
              <div className="table-frame">
                <table className="plan register">
                  <thead>
                    <tr>{[c.number, c.name, c.start, c.end, c.tutor, c.workplace].map(h => <th key={h} scope="col">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {r.interns.map(l => (
                      <tr key={l.recordId} className={cellOf(l)}>
                        <td className="num">{l.number}</td>
                        <th scope="row"><Link href={`/chest/records/${l.recordId}`}>{l.name}</Link></th>
                        <td>{day(l.startDate)}</td>
                        <td>{day(l.endDate ?? l.contractEnd)}</td>
                        <td>{l.tutorId ? nameOf(names.get(l.tutorId), locale) : ""}</td>
                        <td>{l.workplace}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      {reads.length > 0 && (
        <section className="section no-print" aria-labelledby="reads-title">
          <h2 id="reads-title" className="eyebrow">{t.register.lastReads}</h2>
          <ul className="journal">
            {reads.map(x => (
              <li key={x.id}>
                <span>{format(t.record.actions[x.action], { fields: "" })}</span>
                <span className="muted small">{nameOf(names.get(x.actor), locale)} · {formatDate(x.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
