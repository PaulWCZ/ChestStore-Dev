import { Avatar } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, File, Lock, Printer, Shield } from "../../../../components/icons.tsx";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { directory } from "../../../../lib/directory.ts";
import { format, formatDate, formatDay, intl, type Catalogue } from "../../../../lib/i18n/index.ts";
import { ofRecord } from "../../../../lib/journal.ts";
import { id as rowId } from "../../../../lib/model.ts";
import { nameOf, people, plainName } from "../../../../lib/people.ts";
import { fieldNames, missing, record, type Field, type HrRecord } from "../../../../lib/records.ts";
import { viewer } from "../../../../lib/session.ts";
import { today } from "../../../../lib/zone.ts";
import { Documents } from "./documents.tsx";
import { RecordForm } from "./record-form.tsx";
import { AnswerChange, AskChange } from "./change-request.tsx";
import { waitingChange } from "../../../../lib/changes.ts";
import { listLetters, shown } from "../../../../lib/letters.ts";

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
  // A change the person asked (address, emergency contact), waiting for HR.
  const asked = await waitingChange(sql, member, r.id);
  const waiting = asked ? { id: asked.id, changes: asked.changes, note: asked.note, asked: formatDate(asked.createdAt, locale, { day: "numeric", month: "long" }) } : null;
  const askableNow = { address: r.address, emergencyName: r.emergencyName, emergencyRelation: r.emergencyRelation, emergencyPhone: r.emergencyPhone };
  const letterList = edit ? (await listLetters(sql, member)).map(l => ({ id: l.id, name: shown(l, t).name })) : [];
  const changeWords = { change: t.change, fields: t.record.fields, emergency: t.record.emergency, errors: t.errors, dialog: t.dialog };
  const history = edit ? await ofRecord(sql, r.id, 30) : [];
  const names = await people([r.memberId ?? "", r.tutorId ?? "", ...r.documents.map(d => d.addedBy), ...history.map(h => h.actor)]);
  // A record prints: the person's name as it is, never the app's "(former member)".
  const personName = (r.memberId ? plainName(names.get(r.memberId), locale) : "") || r.legalName;
  const photo = r.memberId ? names.get(r.memberId)?.photo ?? null : null;
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" }) : "");
  const gaps = missing(r);
  const fieldWord = (f: string) => (f in t.record.fields ? t.record.fields[f as Field] : f in t.record.kinds ? t.record.kinds[f as keyof typeof t.record.kinds] : f);
  const docs = r.documents.map(d => ({ id: d.id, name: d.name, kind: d.kind, size: d.size, added: formatDate(d.addedAt, locale, { day: "numeric", month: "short", year: "numeric" }), by: nameOf(names.get(d.addedBy), locale) }));
  const docWords = { record: t.record, errors: t.errors, files: t.files };
  return (
    <div className="page narrow">
      {edit ? <Link className="back" href="/chest/records"><Back />{t.record.back}</Link>
        : <Link className="back" href={`/chest/people/${member.id}`}><Back />{t.record.profile}</Link>}
      <div className="journey-head record-head">
        <Avatar name={personName} photo={photo} size="xl" />
        <div>
          <h1>{edit ? personName : t.record.mine}</h1>
          <p className="muted">{[r.job, t.record.contracts[r.contract]].filter(Boolean).join(" · ")}</p>
          {edit && r.memberId && <Link className="link-button" href={`/chest/people/${r.memberId}`}>{t.record.profile}</Link>}
        </div>
      </div>
      <p className="banner private"><Lock />{edit ? (r.memberId ? format(t.record.hrOnly, { name: personName }) : t.record.hrOnlyOther) : t.record.readOnly}</p>
      {r.erased && <p className="banner warn"><Shield />{t.records.erased}</p>}
      {edit && gaps.length > 0 && <p className="banner warn" role="status">{format(t.record.missing, { list: gaps.map(fieldWord).join(", ") })}</p>}

      {edit && waiting && <AnswerChange name={personName} waiting={waiting} current={askableNow} t={changeWords} />}

      {edit ? (
        <RecordForm
          key={r.updatedAt}
          id={r.id}
          initial={toForm(r)}
          linked={r.memberId}
          erased={r.erased}
          members={(await directory(sql, member)).entries.map(e => ({ id: e.id, name: e.name, photo: e.photo }))}
          today={today()}
          lang={locale}
          t={{ record: t.record, errors: t.errors, date: t.date, peoplePicker: t.peoplePicker, leaveEmpty: t.people.leaveEmpty }}
        />
      ) : (
        <>
          <ReadOnly r={r} day={day} tutor={r.tutorId ? plainName(names.get(r.tutorId), locale) : ""} locale={locale} t={t.record} />
          {!r.erased && <div className="section"><AskChange recordId={r.id} current={askableNow} waiting={waiting} t={changeWords} /></div>}
        </>
      )}

      {edit && (
        <section className="card-block section no-print" aria-labelledby="letters-title">
          <h2 id="letters-title" className="legend"><Printer /> {t.letters.printFor}</h2>
          {letterList.length === 0 ? <p className="muted">{t.letters.none} <Link href="/chest/records/letters">{t.letters.write}</Link></p> : (
            <div className="letter-links">
              {letterList.map(l => <Link key={l.id} className="button quiet small" href={`/chest/records/${r.id}/letters/${l.id}`}>{l.name}</Link>)}
            </div>
          )}
        </section>
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
    </div>
  );
}

// What the form edits: every field as text.
function toForm(r: HrRecord): Record<Field, string> {
  return Object.fromEntries(fieldNames.map(f => [f, r[f] === null ? "" : Array.isArray(r[f]) ? r[f].join(",") : String(r[f])])) as Record<Field, string>;
}

type RecordWords = Catalogue["record"];

// The person's own record, read-only: what HR keeps about them.
function ReadOnly({ r, day, tutor, locale, t }: { r: HrRecord; day: (d: string | null) => string; tutor: string; locale: string; t: RecordWords }) {
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
          {r.permitEnd && item(t.fields.permitEnd, day(r.permitEnd))}
          {item(t.fields.address, r.address)}
        </dl>
      </section>
      <section className="card-block readonly section">
        <h2 className="legend">{t.contract}</h2>
        <dl className="grid-2">
          {r.employeeNumber && item(t.fields.employeeNumber, r.employeeNumber)}
          {item(t.fields.contract, t.contracts[r.contract])}
          {item(t.fields.job, r.job)}
          {item(t.fields.qualification, r.qualification)}
          {item(t.fields.workingTime, t.workingTimes[r.workingTime] + (r.hours ? ` · ${format(t.hoursValue, { hours: new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 2 }).format(r.hours) })}` : ""))}
          {r.workDays && item(t.fields.workDays, r.workDays.map(n => t.weekDays[n - 1]).join(", "))}
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
