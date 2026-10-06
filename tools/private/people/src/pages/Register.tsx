import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Download } from "../components/icons.tsx";
import { format, formatDate, formatDay, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { ofRegister } from "../lib/journal.ts";
import { everyone, nameOf, people, plainName } from "../lib/people.ts";
import { mentions, register, registerGaps, type Line } from "../lib/register.ts";
import { today } from "../lib/zone.ts";
import type { RegisterRow } from "../islands/RegisterTable.tsx";
import { BackLink } from "./parts.tsx";

// The staff register (registre unique du personnel), written from the HR
// records: employees in the order they were hired, interns in their own
// part. HR reads it here, prints it or saves it as a PDF, or downloads it
// as a spreadsheet; each read is written in the journal.
export async function registerPage({ member, locale, t }: PageContext): Promise<View> {
  if (!can(member, "records.manage")) return notFound();
  const sql = db();
  const r = await register(sql, member, "register_viewed");
  const [reads, listed] = await Promise.all([ofRegister(sql, 5), everyone()]);
  const g = await registerGaps(sql, member, r, listed.people, today());
  const left = g.withoutRecord.length + g.noStart.length + g.noExit.length;
  const names = await people([...r.interns.map(l => l.tutorId ?? ""), ...reads.map(x => x.actor)]);
  const c = t.register.columns;
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const gaps = [...r.employees, ...r.interns].filter(l => l.missing.length > 0).length;
  const row = (l: Line, cells: string[]): RegisterRow => ({ recordId: l.recordId, number: l.number, name: l.name, cells, gap: l.missing.length > 0 });
  return {
    title: t.register.title,
    body: (
      <div className="page wide register-page">
        <BackLink href="/chest/records" className="no-print">{t.record.back}</BackLink>
        <PageHeader
          title={t.register.title}
          intro={t.register.lead}
          secondary={<span className="row no-print"><a className="button quiet small" href="/chest/records/register/csv" download><Download />{t.register.csv}</a></span>}
          action={<span className="no-print"><Island name="PrintButton" props={{ label: t.register.print }} /></span>}
        />
        {left > 0 && <p className="banner warn no-print" role="status"><a href="#gaps-title">{plural(t.register.gaps.banner, left, locale)}</a></p>}
        {!listed.ok && <p className="banner warn">{t.register.gaps.unreachable}</p>}
        {gaps > 0 && <p className="banner warn no-print">{plural(t.register.missing, gaps, locale)}</p>}
        {g.tutorLeft.map(x => <p key={x.recordId} className="banner warn no-print"><a href={`/chest/records/${x.recordId}`}>{format(t.register.gaps.tutorLeft, { name: x.name })}</a></p>)}
        {r.employees.length === 0 && r.interns.length === 0 ? <EmptyState title={t.register.empty} /> : (
          <>
            <section className="section" aria-labelledby="emp-title">
              <h2 id="emp-title" className="eyebrow">{t.register.employees}</h2>
              <Island name="RegisterTable" props={{
                caption: c.employees, gap: t.register.gap, labels: t.tables,
                heads: { number: c.number, name: c.name, rest: [c.nationality, c.birthDate, c.sex, c.job, c.qualification, c.entry, c.exit, c.permit, c.mentions] },
                rows: r.employees.map(l => row(l, [l.nationality, day(l.birthDate), l.sex ? t.record.sexes[l.sex] : "", l.job, l.qualification, day(l.startDate), day(l.endDate), l.workPermit, mentions(l, t.register.mention)])),
              }} />
            </section>
            {r.interns.length > 0 && (
              <section className="section" aria-labelledby="int-title">
                <h2 id="int-title" className="eyebrow">{t.register.interns}</h2>
                <Island name="RegisterTable" props={{
                  caption: c.interns, gap: t.register.gap, labels: t.tables,
                  heads: { number: c.number, name: c.name, rest: [c.start, c.end, c.tutor, c.workplace] },
                  rows: r.interns.map(l => row(l, [day(l.startDate), day(l.endDate ?? l.contractEnd), l.tutorId ? plainName(names.get(l.tutorId), locale) : "", l.workplace])),
                }} />
              </section>
            )}
          </>
        )}
        {left > 0 && (
          <section className="section register-gaps" aria-labelledby="gaps-title">
            <h2 id="gaps-title" className="eyebrow">{t.register.gaps.title}</h2>
            <p className="muted small">{t.register.gaps.lead}</p>
            <ul className="gap-list">
              {g.withoutRecord.map(x => (
                <li key={x.id} id={`gap-${x.id}`}>
                  <span><strong>{x.name}</strong> · {t.register.gaps.withoutRecord}</span>
                  <span className="no-print"><Island name="CreateRecord" props={{ memberId: x.id, label: t.register.gaps.create }} /></span>
                </li>
              ))}
              {[...g.noStart.map(x => ({ ...x, why: t.register.gaps.noStart })), ...g.noExit.map(x => ({ ...x, why: t.register.gaps.noExit }))].map(x => (
                <li key={x.recordId + x.why}>
                  <span><strong>{x.name}</strong> · {x.why}</span>
                  <a className="button quiet small no-print" href={`/chest/records/${x.recordId}`}>{t.register.gaps.complete}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {reads.length > 0 && (
          <section className="section no-print" aria-labelledby="reads-title">
            <h2 id="reads-title" className="eyebrow">{t.register.lastReads}</h2>
            <ul className="journal">
              {reads.map(x => (
                <li key={x.id}>
                  <span>{format(t.record.actions[x.action], { fields: "" })}</span>
                  <span className="muted small">{nameOf(names.get(x.actor), locale)} · {formatDate(x.at, locale, member.timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    ),
  };
}
