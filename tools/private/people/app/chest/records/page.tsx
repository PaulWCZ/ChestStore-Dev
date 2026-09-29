import { Avatar, EmptyState, PageHeader, StatusBadge } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Bars, Folder, Shield } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { directory } from "../../../lib/directory.ts";
import { format, formatDay, plural } from "../../../lib/i18n/index.ts";
import { listRecords, upcoming, type Summary } from "../../../lib/records.ts";
import { waitingChanges } from "../../../lib/changes.ts";
import { viewer } from "../../../lib/session.ts";
import { today } from "../../../lib/zone.ts";
import { AddRecord, CreateAll } from "./record-buttons.tsx";

// HR's records: who works here, who starts soon, who left (kept five years
// for the staff register); what is coming up (trial periods, contracts
// ending); and whoever in the directory has no record yet.
export default async function RecordsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "records.manage")) notFound();
  const sql = db();
  const now = today();
  const [records, { entries }, soon, asked] = await Promise.all([listRecords(sql, member), directory(sql, member), upcoming(sql, now), waitingChanges(sql, member)]);
  const byMember = new Map(entries.map(e => [e.id, e]));
  const without = entries.filter(e => !records.some(r => r.memberId === e.id));
  const day = (d: string) => formatDay(d, locale, { day: "numeric", month: "short", year: "numeric" });
  const current = records.filter(r => !r.endDate && (!r.startDate || r.startDate <= now));
  const future = records.filter(r => !r.endDate && r.startDate && r.startDate > now);
  const past = records.filter(r => r.endDate);
  const row = (r: Summary) => {
    const m = r.memberId ? byMember.get(r.memberId) : undefined;
    const when = r.endDate ? format(t.records.leftOn, { date: day(r.endDate) }) : r.startDate && r.startDate > now ? format(t.records.startsOn, { date: day(r.startDate) }) : r.startDate ? format(t.records.since, { date: day(r.startDate) }) : "";
    return (
      <li key={r.id}>
        <Link className="journey-card record-card" href={`/chest/records/${r.id}`}>
          <Avatar name={m?.name ?? r.legalName} photo={m?.photo ?? null} size="l" />
          <span className="journey-main">
            <strong>{m?.name ?? r.legalName}</strong>
            <span className="muted">{[r.job, t.record.contracts[r.contract], r.workingTime === "part" ? t.record.workingTimes.part : ""].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="record-side">
            {when && <span className="small">{when}</span>}
            {!r.memberId && <span className="source">{r.erased ? t.records.erased : t.records.notMember}</span>}
            {r.missing.length > 0 && <StatusBadge size="s" tone="wait" label={plural(t.records.missing, r.missing.length, locale)} />}
          </span>
        </Link>
      </li>
    );
  };
  const nameOfRecord = (id: string, fallback: string) => byMember.get(records.find(r => r.id === id)?.memberId ?? "")?.name ?? fallback;
  const addWords = { records: t.records, errors: t.errors };
  const addProps = { people: without.map(e => ({ id: e.id, name: e.name, photo: e.photo })), lang: locale, t: { ...addWords, peoplePicker: t.peoplePicker } };
  return (
    <div className="page narrow">
      <AutoRefresh seconds={60} />
      <PageHeader
        title={t.records.title}
        intro={<span className="lead"><Shield /> {t.records.lead}</span>}
        secondary={(
          <>
            <Link className="button quiet small" href="/chest/records/register"><Folder />{t.records.register}</Link>
            <Link className="button quiet small" href="/chest/numbers"><Bars />{t.records.numbers}</Link>
          </>
        )}
      />

      {records.length === 0 && without.length > 0 ? (
        <EmptyState
          icon={<Folder />}
          title={t.records.empty.title}
          body={t.records.empty.body}
          action={<><CreateAll count={without.length} locale={locale} t={addWords} /><AddRecord {...addProps} /></>}
        />
      ) : (
        <>
          {asked.length > 0 && (
            <section className="section" aria-labelledby="asked-title">
              <h2 id="asked-title" className="eyebrow">{t.records.asked}</h2>
              <ul className="moment-list">
                {asked.map(a => (
                  <li key={a.id}>
                    <Link href={`/chest/records/${a.recordId}`}>
                      <span className="moment-text"><strong>{nameOfRecord(a.recordId, a.legalName)}</strong></span>
                      <span className="moment-date">{format(t.records.asks, { fields: Object.keys(a.changes).map(f => t.record.fields[f as keyof typeof t.record.fields]).join(", ") })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {soon.length > 0 && (
            <section className="section" aria-labelledby="soon-title">
              <h2 id="soon-title" className="eyebrow">{t.records.comingUp}</h2>
              <ul className="moment-list">
                {soon.map(s => (
                  <li key={s.id + s.what}>
                    <Link href={`/chest/records/${s.id}`}>
                      <span className="moment-text"><strong>{nameOfRecord(s.id, s.legalName)}</strong></span>
                      <span className="moment-date">{format(s.what === "trial" ? t.records.trialEnds : s.what === "contract" ? t.records.contractEnds : s.day < now ? t.records.permitEnded : t.records.permitEnds, { date: day(s.day) })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {without.length > 0 && (
            <div className="nudge">
              <div>
                <h2>{t.records.none}</h2>
                <p className="muted">{plural(t.records.noneBody, without.length, locale)}</p>
              </div>
              <CreateAll count={without.length} locale={locale} t={addWords} />
            </div>
          )}
          {[[t.records.current, current], [t.records.future, future], [t.records.past, past]].map(([title, list]) => (list as Summary[]).length > 0 && (
            <section key={title as string} className="section">
              <h2 className="eyebrow">{title as string} · {(list as Summary[]).length}</h2>
              <ul className="journey-cards">{(list as Summary[]).map(row)}</ul>
            </section>
          ))}
          <div className="section-actions"><AddRecord {...addProps} /></div>
        </>
      )}
    </div>
  );
}
