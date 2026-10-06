import { Island, type PageContext, type View } from "@argentic/chest-app";
import { Avatar } from "@argentic/chest-ui/components";
import { File, Lock, Printer, Shield } from "../components/icons.tsx";
import { format, formatDate, formatDay, type Catalogue } from "../i18n/index.ts";
import { waitingChange } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { directory } from "../lib/directory.ts";
import { ofRecord } from "../lib/journal.ts";
import { listLetters, shown } from "../lib/letters.ts";
import { placement } from "../lib/offline.ts";
import { nameOf, people, plainName } from "../lib/people.ts";
import { fieldNames, missing, record, type Field, type HrRecord } from "../lib/records.ts";
import { today } from "../lib/zone.ts";
import { collator, numberFormat } from "../shared/format.ts";
import { BackLink } from "./parts.tsx";

// One employee record. HR edits it (every visit and change is noted); the
// person it is about reads it; anyone else is told it does not exist
// (lib/records.ts refuses not_found: a 404 page).
export async function recordPage({ member, locale, t, param }: PageContext): Promise<View> {
  const sql = db();
  const { record: r, access } = await record(sql, member, param("id"));
  const edit = access === "edit";
  // A change the person asked (address, emergency contact), waiting for HR.
  const asked = await waitingChange(sql, member, r.id);
  const waiting = asked ? { id: asked.id, changes: asked.changes, note: asked.note, asked: formatDate(asked.createdAt, locale, member.timeZone, { day: "numeric", month: "long" }) } : null;
  const askableNow = { address: r.address, emergencyName: r.emergencyName, emergencyRelation: r.emergencyRelation, emergencyPhone: r.emergencyPhone };
  const letterList = edit ? (await listLetters(sql, member)).map(l => ({ id: l.id, name: shown(l, t).name })) : [];
  const changeWords = { change: t.change, fields: t.record.fields, emergency: t.record.emergency, dialog: t.dialog };
  const history = edit ? await ofRecord(sql, r.id, 30) : [];
  const names = await people([r.memberId ?? "", r.tutorId ?? "", ...r.documents.map(d => d.addedBy), ...history.map(h => h.actor)]);
  // A record prints: the person's name as it is, never the app's "(former member)".
  const personName = (r.memberId ? plainName(names.get(r.memberId), locale) : "") || r.legalName;
  const photo = r.memberId ? names.get(r.memberId)?.photo ?? null : null;
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" }) : "");
  const gaps = missing(r);
  const fieldWord = (f: string) => (f in t.record.fields ? t.record.fields[f as Field] : f in t.record.kinds ? t.record.kinds[f as keyof typeof t.record.kinds] : f in t.placement.fields ? t.placement.fields[f as keyof typeof t.placement.fields] : f);
  // HR's pickers: the members of the directory. Someone without the Chest
  // is placed in the directory from here (lib/offline.ts).
  const everyoneListed = edit ? (await directory(sql, member)).entries : [];
  const pickable = everyoneListed.map(e => ({ id: e.id, name: e.name, photo: e.photo }));
  const placed = edit && !r.memberId && !r.erased ? await placement(sql, member, r.id) : null;
  const teams = [...new Set(everyoneListed.map(e => e.team).filter(Boolean))].sort(collator(locale).compare);
  const docs = r.documents.map(d => ({ id: d.id, name: d.name, kind: d.kind, size: d.size, added: formatDate(d.addedAt, locale, member.timeZone, { day: "numeric", month: "short", year: "numeric" }), by: nameOf(names.get(d.addedBy), locale) }));
  // A version of the record: a form saved comes back fresh (its island
  // has another id) with what is stored.
  const version = `${r.id}-${Date.parse(r.updatedAt) || 0}`;
  return {
    title: edit ? personName : t.record.mine,
    body: (
      <div className="page narrow">
        {edit ? <BackLink href="/chest/records">{t.record.back}</BackLink> : <BackLink href={`/chest/people/${member.id}`}>{t.record.profile}</BackLink>}
        <div className="journey-head record-head">
          <Avatar name={personName} photo={photo} size="xl" />
          <div>
            <h1>{edit ? personName : t.record.mine}</h1>
            <p className="muted">{[r.job, t.record.contracts[r.contract]].filter(Boolean).join(" · ")}</p>
            {edit && r.memberId && <a className="link-button" href={`/chest/people/${r.memberId}`}>{t.record.profile}</a>}
          </div>
        </div>
        <p className="banner private"><Lock />{edit ? (r.memberId ? format(t.record.hrOnly, { name: personName }) : t.record.hrOnlyOther) : t.record.readOnly}</p>
        {r.erased && <p className="banner warn"><Shield />{t.records.erased}</p>}
        {edit && gaps.length > 0 && <p className="banner warn" role="status">{format(t.record.missing, { list: gaps.map(fieldWord).join(", ") })}</p>}

        {edit && waiting && <Island id={`answer-${waiting.id}`} name="AnswerChange" props={{ name: personName, waiting, current: askableNow, t: changeWords }} />}

        {edit ? (
          <Island
            id={`record-form-${version}`}
            name="RecordForm"
            props={{
              id: r.id,
              initial: toForm(r),
              linked: r.memberId,
              erased: r.erased,
              members: pickable,
              today: today(),
              lang: locale,
              t: { record: t.record, date: t.date, peoplePicker: t.peoplePicker, leaveEmpty: t.people.leaveEmpty },
            }}
          />
        ) : (
          <>
            <ReadOnly r={r} day={day} tutor={r.tutorId ? plainName(names.get(r.tutorId), locale) : ""} locale={locale} t={t.record} />
            {!r.erased && <div className="section"><Island id={`ask-${r.id}`} name="AskChange" props={{ recordId: r.id, current: askableNow, waiting, t: changeWords }} /></div>}
          </>
        )}

        {placed && (
          <Island
            id={`placement-${version}`}
            name="PlacementForm"
            props={{
              id: r.id,
              initial: { listed: placed.listed, team: placed.team, managerId: placed.managerId },
              members: pickable,
              teams,
              lang: locale,
              t: { placement: t.placement, peoplePicker: t.peoplePicker, leaveEmpty: t.people.leaveEmpty },
            }}
          />
        )}

        {edit && (
          <section className="card-block section no-print" aria-labelledby="letters-title">
            <h2 id="letters-title" className="legend"><Printer /> {t.letters.printFor}</h2>
            {letterList.length === 0 ? <p className="muted">{t.letters.none} <a href="/chest/records/letters">{t.letters.write}</a></p> : (
              <div className="letter-links">
                {letterList.map(l => <a key={l.id} className="button quiet small" href={`/chest/records/${r.id}/letters/${l.id}`}>{l.name}</a>)}
              </div>
            )}
          </section>
        )}

        <section className="card-block section" aria-labelledby="docs-title">
          <h2 id="docs-title" className="legend"><File /> {t.record.documents}</h2>
          <Island
            id={`documents-${r.id}`}
            name="Documents"
            props={{ recordId: r.id, documents: docs, edit, t: { record: t.record, errors: { file_too_large: t.errors.file_too_large, type_refused: t.errors.type_refused, unavailable: t.errors.unavailable }, files: t.files } }}
          />
        </section>

        {edit && (
          <section className="card-block section" aria-labelledby="history-title">
            <h2 id="history-title" className="legend">{t.record.history}</h2>
            {history.length === 0 ? <p className="muted">{t.record.noHistory}</p> : (
              <ul className="journal">
                {history.map(h => (
                  <li key={h.id} id={`journal-${h.id}`}>
                    <span>{format(t.record.actions[h.action], { fields: h.fields.map(fieldWord).join(", ") })}</span>
                    <span className="muted small">{nameOf(names.get(h.actor), locale)} · {formatDate(h.at, locale, member.timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    ),
  };
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
          {item(t.fields.workingTime, t.workingTimes[r.workingTime] + (r.hours ? ` · ${format(t.hoursValue, { hours: numberFormat(locale, { maximumFractionDigits: 2 }).format(r.hours) })}` : ""))}
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
