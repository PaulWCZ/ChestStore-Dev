import { Island, type PageContext, type View } from "@argentic/chest-app";
import { NoAccess } from "@argentic/chest-ui/components";
import { PayNav } from "../components/pay-nav.tsx";
import { localeOf, plural, relative, shortDate } from "../i18n/index.ts";
import type { CardGroup, CardLine } from "../islands/CardsView.tsx";
import { can } from "../lib/access.ts";
import { cardOverview, type CardLineView } from "../lib/cards.ts";
import { db } from "../lib/db.ts";
import { formatMoney } from "../shared/money.ts";
import { holders, nameOf, people } from "../lib/people.ts";
import { settings } from "../lib/settings.ts";

// Company cards, for the accountants: import the month's card statement;
// see which payments still wait for their receipt (and ask their holders
// again), and the few to check by hand.
export async function cardsPage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  if (!can(member, "pay")) return { title: t.cards.title, body: <div className="page"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.errors.forbidden }} /></div> };
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
  return {
    title: t.cards.title,
    body: (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t.cards.title}</h1>
            <p className="hint">{t.cards.intro}</p>
          </div>
          <PayNav current="cards" t={t.cards} />
        </div>
        <Island
          name="CardsView"
          props={{
            locale,
            currency: company.currency,
            team: team.filter(h => h.role !== null).map(h => ({ id: h.id, name: h.name })).sort((a, b) => a.name.localeCompare(b.name, locale)),
            waiting,
            check,
            statements: overview.statements.map(s => ({
              id: s.id,
              title: [relative(s.createdAt, locale), s.fileName].filter(Boolean).join(" · "),
              sub: [plural(t.cards.statementPayments, s.payments, locale), plural(t.cards.statementMatched, s.matched, locale), plural(t.cards.statementCreated, s.created, locale), nameOf(who.get(s.createdBy), locale)].join(" · "),
            })),
            t: { cards: t.cards, files: t.files, table: t.table, importWords: t.settings.import },
          }}
        />
      </div>
    ),
  };
}
