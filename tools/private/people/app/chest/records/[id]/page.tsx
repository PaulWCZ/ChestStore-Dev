import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, File, Lock, Shield } from "../../../../components/icons.tsx";
import { Portrait } from "../../../../components/portrait.tsx";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { directory } from "../../../../lib/directory.ts";
import { format, formatDate, formatDay, type Catalogue } from "../../../../lib/i18n/index.ts";
import { ofRecord } from "../../../../lib/journal.ts";
import { id as rowId } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { fieldNames, missing, record, type Field, type HrRecord } from "../../../../lib/records.ts";
import { viewer } from "../../../../lib/session.ts";
import { Documents } from "./documents.tsx";
import { RecordForm } from "./record-form.tsx";

// One employee record. HR edits it (every visit and change is noted); the
// person it is about reads it; anyone else is told it does not exist.
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  let found: Awaited<ReturnType<typeof record>>;
  try {
    found = await record(sql, member, rowId(id));
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const { record: r, access } = found;
  const edit = access === "edit";
  const history = edit ? await ofRecord(sql, r.id, 30) : [];
  const names = await people([r.memberId ?? "", r.tutorId ?? "", ...r.documents.map(d => d.addedBy), ...history.map(h => h.actor)]);
  const personName = r.memberId ? nameOf(names.get(r.memberId), locale) : r.legalName;
  const photo = r.memberId ? names.get(r.memberId)?.photo ?? null : null;
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" }) : "");
  const gaps = missing(r);
  const fieldWord = (f: string) => (f in t.record.fields ? t.record.fields[f as Field] : f in t.record.kinds ? t.record.kinds[f as keyof typeof t.record.kinds] : f);
  const docs = r.documents.map(d => ({ id: d.id, name: d.name, kind: d.kind, size: d.size, added: formatDate(d.addedAt, locale, { day: "numeric", month: "short", year: "numeric" }), by: nameOf(names.get(d.addedBy), locale) }));
  const docWords = { record: t.record, errors: t.errors };
  return (
    <main className="page narrow">
      {edit ? <Link className="back" href="/chest/records"><Back />{t.record.back}</Link>
        : <Link className="back" href={`/chest/people/${member.id}`}><Back />{t.record.profile}</Link>}
      <div className="journey-head record-head">
        <Portrait name={personName} photo={photo} size={72} arch />
        <div>
          <h1>{edit ? personName : t.record.mine}</h1>
          <p className="muted">{[r.job, t.record.contracts[r.contract]].filter(Boolean).join(" · ")}</p>
          {edit && r.memberId && <Link className="link-button" href={`/chest/people/${r.memberId}`}>{t.record.profile}</Link>}
        </div>
      </div>
      <p className="banner private"><Lock />{edit ? (r.memberId ? format(t.record.hrOnly, { name: personName }) : t.record.hrOnlyOther) : t.record.readOnly}</p>
      {r.erased && <p className="banner warn"><Shield />{t.records.erased}</p>}
      {edit && gaps.length > 0 && <p className="banner warn" role="status">{format(t.record.missing, { list: gaps.map(fieldWord).join(", ") })}</p>}

      {edit ? (
        <RecordForm
          id={r.id}
          initial={toForm(r)}
          linked={r.memberId}
          erased={r.erased}
          members={(await directory(sql, member)).entries.map(e => ({ id: e.id, name: e.name }))}
          t={{ record: t.record, errors: t.errors }}
        />
      ) : (
        <ReadOnly r={r} day={day} tutor={r.tutorId ? nameOf(names.get(r.tutorId), locale) : ""} t={t.record} />
      )}

      <section className="card-block section" aria-labelledby="docs-title">
        <h2 id="docs-title" className="legend"><File /> {t.record.documents}</h2>
        <Documents recordId={r.id} documents={docs} edit={edit} t={docWords} />
      </section>

      {edit && (
        <section className="card-block section" aria-labelledby="history-title">
          <h2 id="history-title" className="legend">{t.record.history}</h2>
          {history.length === 0 ? <p className="muted">{t.record.noHistory}</p> : (
            <ul className="journal">
              {history.map(h => (
                <li key={h.id}>
                  <span>{format(t.record.actions[h.action], { fields: h.fields.map(fieldWord).join(", ") })}</span>
                  <span className="muted small">{nameOf(names.get(h.actor), locale)} · {formatDate(h.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

// What the form edits: every field as text.
function toForm(r: HrRecord): Record<Field, string> {
  return Object.fromEntries(fieldNames.map(f => [f, r[f] === null ? "" : String(r[f])])) as Record<Field, string>;
}

type RecordWords = Catalogue["record"];

// The person's own record, read-only: what HR keeps about them.
function ReadOnly({ r, day, tutor, t }: { r: HrRecord; day: (d: string | null) => string; tutor: string; t: RecordWords }) {
  const item = (label: string, value: string) => <div><dt>{label}</dt><dd>{value || <span className="muted">{t.empty}</span>}</dd></div>;
  return (
    <>
      <section className="card-block readonly">
        <h2 className="legend">{t.identity}</h2>
        <dl className="grid-2">
          {item(t.fields.legalName, r.legalName)}
          {item(t.fields.sex, r.sex ? t.sexes[r.sex] : "")}
          {item(t.fields.birthDate, day(r.birthDate))}
          {item(t.fields.nationality, r.nationality)}
          {r.workPermit && item(t.fields.workPermit, r.workPermit)}
          {item(t.fields.address, r.address)}
        </dl>
      </section>
      <section className="card-block readonly section">
        <h2 className="legend">{t.contract}</h2>
        <dl className="grid-2">
          {item(t.fields.contract, t.contracts[r.contract])}
          {item(t.fields.job, r.job)}
          {item(t.fields.qualification, r.qualification)}
          {item(t.fields.workingTime, t.workingTimes[r.workingTime] + (r.hours ? ` · ${r.hours}` : ""))}
          {item(t.fields.startDate, day(r.startDate))}
          {r.trialEnd && item(t.fields.trialEnd, day(r.trialEnd))}
          {r.contract !== "permanent" && item(t.fields.contractEnd, day(r.contractEnd))}
          {r.endDate && item(t.fields.endDate, day(r.endDate))}
          {(r.contract === "temporary" || r.contract === "seconded") && item(t.fields.agency, r.agency)}
          {r.contract === "internship" && item(t.fields.tutorId, tutor)}
          {r.contract === "internship" && item(t.fields.workplace, r.workplace)}
        </dl>
      </section>
      <section className="card-block readonly section">
        <h2 className="legend">{t.emergency}</h2>
        <dl className="grid-2">
          {item(t.fields.emergencyName, r.emergencyName)}
          {item(t.fields.emergencyRelation, r.emergencyRelation)}
          {item(t.fields.emergencyPhone, r.emergencyPhone)}
        </dl>
      </section>
    </>
  );
}
