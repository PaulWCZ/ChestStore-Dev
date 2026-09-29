import { NoAccess } from "@argentic/chest-ui/components";
import { can } from "../../../lib/access.ts";
import { cardOverview, type CardLineView } from "../../../lib/cards.ts";
import { db } from "../../../lib/db.ts";
import { plural, relative, shortDate } from "../../../lib/i18n/index.ts";
import { formatMoney } from "../../../lib/money.ts";
import { holders, nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { settings } from "../../../lib/settings.ts";
import { PayNav } from "../pay/pay-nav.tsx";
import { CardsView, type CardGroup, type CardLine } from "./cards-view.tsx";

// Company cards, for the accountants: import the month's card statement;
// see which payments still wait for their receipt (and ask their holders
// again), and the few to check by hand.
export default async function Cards() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "pay")) return <div className="page"><NoAccess title={t.noAccess.title} body={t.errors.forbidden} /></div>;
  const sql = db();
  const [overview, team, company] = await Promise.all([cardOverview(sql, member), holders(), settings(sql)]);
  const who = await people([...overview.waiting, ...overview.ownMoney, ...overview.deleted].map(l => l.member).concat(overview.statements.map(s => s.createdBy)));
  const day = (iso: string) => shortDate(iso, locale);
  const line = (l: CardLineView): CardLine => ({ id: l.id, day: day(l.date), label: l.label || "—", amount: formatMoney(l.amount, l.currency, locale), href: l.expense ? `/chest/expenses/${l.expense}` : null, name: nameOf(who.get(l.member), locale) });
  const byMember = new Map<string, CardLineView[]>();
  for (const l of overview.waiting) byMember.set(l.member, [...(byMember.get(l.member) ?? []), l]);
  const waiting: CardGroup[] = [...byMember].map(([owner, list]) => {
    const sums = new Map<string, number>();
    for (const l of list) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.amount);
    const total = [...sums].map(([c, a]) => formatMoney(a, c, locale)).join(" + ");
    return { owner, name: nameOf(who.get(owner), locale), photo: who.get(owner)?.photo ?? null, summary: plural(t.cards.waitingSummary, list.length, locale, { total }), lines: list.map(line) };
  }).sort((a, b) => a.name.localeCompare(b.name, locale));
  const check = [
    ...overview.ownMoney.map(l => ({ ...line(l), reason: t.cards.checkOwnMoney })),
    ...overview.deleted.map(l => ({ ...line(l), reason: t.cards.checkDeleted })),
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.cards.title}</h1>
          <p className="hint">{t.cards.intro}</p>
        </div>
        <PayNav current="cards" t={t.cards} />
      </div>
      <CardsView
        locale={locale}
        currency={company.currency}
        team={team.filter(h => h.role !== null).map(h => ({ id: h.id, name: h.name })).sort((a, b) => a.name.localeCompare(b.name, locale))}
        waiting={waiting}
        check={check}
        statements={overview.statements.map(s => ({
          id: s.id,
          title: [relative(s.createdAt, locale), s.fileName].filter(Boolean).join(" · "),
          sub: [plural(t.cards.statementPayments, s.payments, locale), plural(t.cards.statementMatched, s.matched, locale), plural(t.cards.statementCreated, s.created, locale), nameOf(who.get(s.createdBy), locale)].join(" · "),
        }))}
        t={{ cards: t.cards, errors: t.errors, files: t.files, table: t.table, importWords: t.settings.import }}
      />
    </div>
  );
}
