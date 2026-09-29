import { EmptyState, PageHeader, Tabs } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Upload } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
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
import { GiveEveryone } from "./people-controls.tsx";
import { PeopleTable, type PersonRow } from "./people-table.tsx";

// People: HR sees everyone — their approver, their balances — and does the
// chores (import, payroll files, days for everyone); a manager sees the
// people they answer for. A person's approver, dates and balances are
// changed on their page. "Former" lists those who left: their last day and
// their final balance, what payroll pays.
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
  const rows = ids.map(id => ({ id, person: who.get(id), staff: staff.get(id) }));
  rows.sort((a, b) => nameOf(a.person, locale).localeCompare(nameOf(b.person, locale), locale));
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "short", year: "numeric" });
  const table: PersonRow[] = rows.map(({ id, person, staff: st }) => {
    const b = bal.get(id) ?? [];
    const waitingDays = b.reduce((a, x) => a + x.pending, 0);
    return {
      id,
      name: nameOf(person, locale),
      avatarName: person?.name ?? "",
      photo: person?.photo ?? null,
      number: st?.employeeNumber ?? null,
      second: former ? (st?.endDate ? long(st.endDate) : "") : st?.approverId ? nameOf(who.get(st.approverId), locale) : t.team.approverHr,
      balances: counted.map(ty => {
        const x = b.find(y => y.typeId === ty.id);
        return x && x.setUp ? { text: formatDays(x.left, locale), value: x.left } : { text: null, value: null };
      }),
      waiting: waitingDays > 0 ? plural(t.units.daysShort, waitingDays, locale) : "",
      waitingDays,
    };
  });
  return (
    <div className="page wide">
      <PageHeader
        title={t.team.title}
        intro={hr ? undefined : t.team.teamOnly}
        secondary={hr ? (
          <>
            <Link className="button quiet" href="/chest/people/import"><Upload />{t.team.import}</Link>
            <Link className="button quiet" href="/chest/people/payroll"><Download />{t.team.payroll}</Link>
          </>
        ) : undefined}
        action={hr ? <GiveEveryone types={counted.map(ty => ({ id: ty.id, name: typeName(ty, t.types) }))} count={dir.people.length} t={{ team: t.team, errors: t.errors, home: t.home, dialog: t.dialog }} /> : undefined}
      />
      {hr && (
        <Tabs
          label={t.team.show}
          current={former ? "former" : "current"}
          items={[{ id: "current", label: t.team.current, href: "/chest/people" }, { id: "former", label: plural(t.team.former, gone.length, locale), href: "/chest/people?show=former" }]}
        />
      )}
      {!dir.reached && <p className="notice">{t.team.unreachable}</p>}
      {rows.length === 0 ? (
        <EmptyState title={former ? t.team.noFormer : hr ? t.team.empty : t.team.noTeam} />
      ) : (
        <PeopleTable rows={table} kinds={counted.map(ty => typeName(ty, t.types))} former={former} t={{ team: t.team, table: t.table }} />
      )}
      {former && rows.length > 0 && <p className="muted small">{t.team.formerHint}</p>}
    </div>
  );
}
