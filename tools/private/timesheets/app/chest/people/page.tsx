import { PageHeader } from "@argentic/chest-ui/components";
import { forbidden } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { currency, today } from "../../../lib/clock.ts";
import { db } from "../../../lib/db.ts";
import { everyoneOrNone } from "../../../lib/directory.ts";
import { formatDuration } from "../../../lib/duration.ts";
import { format, formatDay, money, plural } from "../../../lib/i18n/index.ts";
import { formerPeople } from "../../../lib/import.ts";
import { nameFor, people } from "../../../lib/people.ts";
import { origin, peopleRates, rateLock, rateOn, rateUse, type RateStep } from "../../../lib/rates.ts";
import { viewer } from "../../../lib/session.ts";
import { settings } from "../../../lib/settings.ts";
import { withRole } from "../../../lib/weeks.ts";
import { FormerList, PersonRow, type PersonView } from "./people-view.tsx";

// Each person's rates and usual week, for managers: what an hour of them is
// billed (unless a project says otherwise), what it costs the company, and
// how many hours make their full week. A new rate applies from a day on:
// the time before keeps its amounts. Below, the people who left before the
// Chest, whose time came with an import.
export default async function PeoplePage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "rates")) forbidden();
  const sql = db();
  const [dir, rates, s, formers, own] = await Promise.all([
    everyoneOrNone(), peopleRates(sql, member), settings(sql), formerPeople(sql, member),
    sql<{ member_id: string; week_minutes: number }[]>`select member_id, week_minutes from people`,
  ]);
  const team = withRole(dir.people);
  const ids = [...new Set([...team.map(p => p.id), ...rates.map(r => r.memberId)])];
  const [who, used] = await Promise.all([people(ids), rateUse(sql, member, ids)]);
  // Where each person's usual rate applies: a project's own rate wins.
  const useText = (id: string): string | null => {
    const list = used.get(id) ?? [];
    if (list.length === 0) return null;
    const own = list.filter(p => p.source === "own");
    const names = (l: typeof list) => l.map(p => p.name).join(", ");
    if (own.length === list.length) return plural(t.people.useAll, list.length, locale, { names: names(list) });
    if (own.length === 0) return plural(t.people.useNone, list.length, locale, { names: names(list) });
    return format(t.people.useSome, { used: own.length, count: list.length, names: names(own) });
  };
  const code = currency();
  const now = today();
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  const describe = (steps: RateStep[]) => steps.map(x => format(x.from === origin ? t.people.since0 : t.people.since, { rate: x.cents === null ? t.people.none : money(x.cents, code, locale), date: long(x.from) }));
  const rows: PersonView[] = ids.map(id => {
    const r = rates.find(x => x.memberId === id);
    const bill = r?.bill ?? [];
    const cost = r?.cost ?? [];
    const mine = own.find(o => o.member_id === id)?.week_minutes ?? null;
    return {
      id,
      name: nameFor(id, who, locale),
      photo: who.get(id)?.photo ?? null,
      bill: rateOn(bill, now),
      cost: rateOn(cost, now),
      week: mine,
      billText: bill.length ? describe(bill).join(" · ") : null,
      useText: useText(id),
      costText: cost.length ? describe(cost).join(" · ") : null,
      weekText: formatDuration(mine ?? s.reminder.minutes) + (mine === null ? ` · ${t.people.companyWeek}` : ""),
      steps: [...bill.map(x => ({ kind: "bill" as const, from: x.from, label: describe([x])[0]! })), ...cost.map(x => ({ kind: "cost" as const, from: x.from, label: describe([x])[0]! }))].filter(x => s.lockedUntil === null || x.from > s.lockedUntil),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, locale));
  return (
    <div className="page">
      <PageHeader title={t.people.title} intro={format(t.people.intro, { currency: code })} />
      {!dir.reached && <p className="notice small">{t.errors.unavailable}</p>}
      <ul className="person-list">
        {rows.map(p => <PersonRow key={p.id} person={p} today={now} lock={rateLock(s.lockedUntil, locale, t)} companyWeek={s.reminder.minutes} currency={code} comma={locale === "fr"} t={{ people: t.people, errors: t.errors, date: t.date }} />)}
      </ul>
      {formers.length > 0 && (
        <section className="panel formers" aria-labelledby="formers-title">
          <h2 id="formers-title">{t.people.formerTitle}</h2>
          <p className="hint">{t.people.formerBody}</p>
          <FormerList people={formers.map(f => ({ id: f.id, name: f.name, hours: formatDuration(f.minutes) }))} t={{ people: t.people, errors: t.errors, date: t.date }} />
        </section>
      )}
    </div>
  );
}
