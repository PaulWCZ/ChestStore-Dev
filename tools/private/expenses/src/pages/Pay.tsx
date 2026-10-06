import { Island, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { NoAccess } from "@argentic/chest-ui/components";
import { PayNav } from "../components/pay-nav.tsx";
import { dot, format, formatDate, languageNames, localeOf, plural, relative, shortDate } from "../i18n/index.ts";
import type { PayGroup } from "../islands/PayView.tsx";
import { can } from "../lib/access.ts";
import { bankViews, type BankView } from "../lib/bank.ts";
import { db } from "../lib/db.ts";
import { paidRecently, toPay, totals, warnings, type Expense } from "../lib/expenses.ts";
import { addressCountries } from "../shared/iban.ts";
import { formatMoney } from "../shared/money.ts";
import { readiness, remittance, runs } from "../lib/payments.ts";
import { leftNote, nameOf, people } from "../lib/people.ts";
import { rowView } from "../lib/rows.ts";
import { allowances, categories, settings } from "../lib/settings.ts";
import { today } from "../lib/today.ts";
import { countryOptions } from "../shared/words.ts";

const recentChange = 30 * 86400000;

// To pay back: what was approved and paid with people's own money, by
// person, with the total to transfer. Everyone with bank details at once,
// by one transfer file for the bank; or one person at a time, "Mark paid"
// once the bank did it.
export async function payPage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  if (!can(member, "pay")) return { title: t.pay.title, body: <div className="page"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.errors.forbidden }} /></div> };
  const sql = db();
  const [list, recent, cats, company, ready, files] = await Promise.all([toPay(sql, member), paidRecently(sql, member), categories(sql, { archived: true }), settings(sql), readiness(sql, member), runs(sql, member)]);
  const [who, banks, warned, companyBank] = await Promise.all([people([...list, ...recent].map(e => e.owner), { leftAt: true }), bankViews(sql, member, [...new Set(list.map(e => e.owner))]), warnings(sql, list, { anyone: true }), bankViews(sql, member, ["company"]).then(m => m.get("company") ?? null)]);
  const flat = new Map((await allowances(sql, { archived: true })).map(a => [a.id, a]));
  const ctx = { t, locale, allowances: flat, categories: new Map(cats.map(c => [c.id, c])), currency: company.currency, warnings: new Map([...warned].map(([id, w]) => [id, w.filter(x => x.code === "no_rate" || x.code === "card_own_money" || x.code === "self_approved")])) };
  const money = (l: Expense[]) => totals(l).map(x => formatMoney(x.amount, x.currency, locale)).join(" + ");
  const byOwner = new Map<string, Expense[]>();
  for (const e of list) byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e]);
  const now = Date.now();
  // In the file: people with an account of the SEPA zone, their expenses
  // with an amount in euros.
  const inFile = (l: Expense[]) => l.filter(e => e.base !== null && e.baseCurrency === "EUR");
  // An account outside the EEA goes in the file with its postal address
  // and the company's; without them, it waits (and says why).
  const addressProblem = (b: BankView | undefined): string | null =>
    !b || !b.sepa || !b.needsAddress ? null : !b.address ? t.pay.addressMissing : !companyBank?.address ? t.pay.companyAddressMissing : null;
  // Someone who left is paid on their final pay slip, never by the file:
  // the page says since when.
  const left = (owner: string) => leftNote(who.get(owner), locale, t.pay, chest.timeZone) !== null;
  // Who entered bank details their owner has not confirmed yet.
  const changers = await people([...banks.values()].filter(b => b.held).map(b => b.updatedBy));
  // The person who pays sees what they approved themselves: a second pair
  // of eyes before the money leaves (the tool does not forbid it: a small
  // company's accountant often does both).
  const mine = (e: Expense, row: ReturnType<typeof rowView>) => (e.decidedBy === member.id ? { ...row, warnings: [...row.warnings, t.pay.approvedByYou] } : row);
  const groups: PayGroup[] = [...byOwner].map(([owner, l]) => {
    const bank = banks.get(owner);
    return {
      owner,
      left: leftNote(who.get(owner), locale, t.pay, chest.timeZone),
      name: nameOf(who.get(owner), locale),
      photo: who.get(owner)?.photo ?? null,
      total: money(l),
      summary: plural(t.approve.summary, l.length, locale, { total: money(l) }),
      rows: l.map(e => mine(e, rowView(e, ctx))),
      bank: bank ? { masked: bank.masked, bic: bank.bic, holder: bank.holder, since: relative(bank.updatedAt, locale), sepa: bank.sepa, problem: addressProblem(bank), country: bank.country, address: bank.address, needsAddress: bank.needsAddress, changed: bank.held ? format(t.pay.held, { name: nameOf(changers.get(bank.updatedBy), locale), when: relative(bank.updatedAt, locale), person: nameOf(who.get(owner), locale) }) : now - Date.parse(bank.updatedAt) < recentChange ? format(t.pay.changed, { when: relative(bank.updatedAt, locale) }) : null } : null,
    };
  });
  const payable = ready === "ready" ? [...byOwner].filter(([owner]) => !left(owner) && banks.get(owner)?.sepa && !banks.get(owner)?.held && addressProblem(banks.get(owner)) === null).map(([, l]) => inFile(l)).filter(l => l.length > 0) : [];
  // Nobody in the file: the one reason when there is one.
  const owners = [...byOwner.keys()];
  const nobody = owners.every(left) ? t.pay.noneLeft : owners.every(o => !banks.get(o)) ? t.errors.no_bank_details : owners.every(o => banks.get(o)?.held) ? t.pay.noneHeld : t.pay.noneInFile;
  const fileTotal = payable.reduce((sum, l) => sum + l.reduce((s, e) => s + (e.base ?? 0), 0), 0);
  const grand = money(list);
  return {
    title: t.pay.title,
    body: (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t.pay.title}</h1>
            {grand && <p className="mono">{format(t.pay.total, { total: grand })}</p>}
          </div>
          <PayNav current="pay" t={t.cards} />
        </div>
        <Island
          name="PayView"
          props={{
            groups,
            ready,
            nobody,
            preview: payable.length > 0 ? { count: payable.length, label: plural(t.pay.make, payable.length, locale, { total: formatMoney(fileTotal, "EUR", locale) }), statement: format(t.pay.statementText, { text: remittance(company.bankLocale, "E12"), language: languageNames[company.bankLocale] ?? company.bankLocale }) } : null,
            countries: countryOptions(addressCountries, locale),
            files: files.map(f => ({ id: f.id, cancelled: f.cancelled, title: format(t.pay.fileFor, { date: formatDate(f.executionDate + "T12:00:00Z", locale, { day: "numeric", month: "long" }) }), sub: `${plural(t.pay.fileCount, f.count, locale)} · ${formatMoney(f.total, f.currency, locale)}`, confirm: { title: format(t.pay.cancelTitle, { date: formatDate(f.executionDate + "T12:00:00Z", locale, { day: "numeric", month: "long" }) }), body: format(t.pay.cancelBody, { transfers: plural(t.pay.fileCount, f.count, locale), total: formatMoney(f.total, f.currency, locale) }) }, due: f.executionDate <= today() && Date.parse(f.createdAt) < Date.now() - 15 * 60_000 })),
            recent: recent.map(e => ({ ...rowView(e, { ...ctx, who: nameOf(who.get(e.owner), locale) }), sub: [nameOf(who.get(e.owner), locale), e.paidOn ? shortDate(e.paidOn, locale) : ""].filter(Boolean).join(dot) })),
            today: today(),
            locale,
            t: { pay: t.pay, errors: t.errors, bank: t.settings.bank, cancel: t.form.cancel, dialog: t.dialog, date: t.date },
          }}
        />
        <p className="legal">{t.pay.companyCard}</p>
      </div>
    ),
  };
}
