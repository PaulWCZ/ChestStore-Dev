import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../components/avatar.tsx";
import { Download, Upload } from "../../../components/icons.tsx";
import { can, canBeApprover } from "../../../lib/access.ts";
import { balancesOf } from "../../../lib/balances.ts";
import { db } from "../../../lib/db.ts";
import { everyoneOrNone } from "../../../lib/directory.ts";
import { formatDay, formatDays, plural } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { types } from "../../../lib/rules.ts";
import { viewer } from "../../../lib/session.ts";
import { allStaff, approvees, formerIds } from "../../../lib/staff.ts";
import { typeName } from "../../../lib/type-name.ts";
import { ApproverSelect, GiveEveryone } from "./people-controls.tsx";

// People: HR sees everyone — their approver, their balances — and does the
// chores (import, payroll files, days for everyone); a manager sees the
// people they answer for. "Former" lists those who left: their last day
// and their final balance, what payroll pays.
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "people.team")) notFound();
  const sql = db();
  const hr = can(member, "people.all");
  const former = hr && (await searchParams).show === "former";
  const [dir, staff, all, mine] = await Promise.all([everyoneOrNone(), allStaff(sql), types(sql), hr ? Promise.resolve([] as string[]) : approvees(sql, member.id)]);
  // Gone: no longer in the Chest, or past their last day.
  const now = today();
  const left = (id: string) => (staff.get(id)?.endDate ?? "9999-12-31") < now;
  const here = new Set(dir.people.map(p => p.id));
  const gone = hr ? (await formerIds(sql)).filter(id => (dir.reached && !here.has(id)) || left(id)) : [];
  const ids = former ? gone : hr ? dir.people.map(p => p.id).filter(id => !left(id)) : mine;
  const who = await people([...ids, ...[...staff.values()].flatMap(st => (st.approverId ? [st.approverId] : []))]);
  const counted = all.filter(ty => ty.balance);
  const bal = await balancesOf(sql, ids);
  const approvers = dir.people.filter(p => canBeApprover(p.role)).map(p => ({ id: p.id, name: p.name }));
  const rows = ids.map(id => ({ id, person: who.get(id), staff: staff.get(id) }));
  rows.sort((a, b) => nameOf(a.person, locale).localeCompare(nameOf(b.person, locale), locale));
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "short", year: "numeric" });
  return (
    <main className="page wide">
      <div className="page-head">
        <h1>{t.team.title}</h1>
        {hr && (
          <div className="toolbar">
            <Link className="button quiet" href="/chest/people/import"><Upload />{t.team.import}</Link>
            <Link className="button quiet" href="/chest/people/payroll"><Download />{t.team.payroll}</Link>
            <GiveEveryone types={counted.map(ty => ({ id: ty.id, name: typeName(ty, t.types) }))} count={dir.people.length} t={{ team: t.team, errors: t.errors, home: t.home }} />
          </div>
        )}
      </div>
      {hr && (
        <nav className="pills" aria-label={t.team.show}>
          <Link href="/chest/people" aria-current={!former ? "true" : undefined}>{t.team.current}</Link>
          <Link href="/chest/people?show=former" aria-current={former ? "true" : undefined}>{plural(t.team.former, gone.length, locale)}</Link>
        </nav>
      )}
      {!hr && <p className="muted">{t.team.teamOnly}</p>}
      {!dir.reached && <p className="notice">{t.team.unreachable}</p>}
      {rows.length === 0 ? (
        <div className="empty"><p>{former ? t.team.noFormer : hr ? t.team.empty : t.team.noTeam}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="people">
            <thead>
              <tr>
                <th scope="col">{t.team.person}</th>
                <th scope="col">{former ? t.team.lastDay : t.team.approver}</th>
                {counted.map(ty => <th key={ty.id} scope="col" className="num">{typeName(ty, t.types)}</th>)}
                {!former && <th scope="col" className="num">{t.team.pending}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, person, staff: st }) => {
                const b = bal.get(id) ?? [];
                const waitingDays = b.reduce((a, x) => a + x.pending, 0);
                return (
                  <tr key={id}>
                    <th scope="row">
                      <Link className="person-link" href={`/chest/people/${id}`}><Avatar name={person?.name ?? ""} photo={person?.photo ?? null} size={28} />{nameOf(person, locale)}</Link>
                      {st?.employeeNumber && <span className="muted small number">{st.employeeNumber}</span>}
                    </th>
                    <td>
                      {former ? (st?.endDate ? long(st.endDate) : "") : hr ? (
                        <ApproverSelect memberId={id} value={st?.approverId ?? ""} options={approvers.filter(a => a.id !== id)} label={`${t.team.approver} · ${nameOf(person, locale)}`} t={{ team: t.team, errors: t.errors }} />
                      ) : (st?.approverId ? nameOf(who.get(st.approverId), locale) : t.team.approverHr)}
                    </td>
                    {counted.map(ty => {
                      const x = b.find(y => y.typeId === ty.id);
                      return <td key={ty.id} className="num">{x && x.setUp ? formatDays(x.left, locale) : <span className="muted">{t.team.notSet}</span>}</td>;
                    })}
                    {!former && <td className="num">{waitingDays > 0 ? plural(t.units.daysShort, waitingDays, locale) : ""}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {former && rows.length > 0 && <p className="muted small">{t.team.formerHint}</p>}
    </main>
  );
}
