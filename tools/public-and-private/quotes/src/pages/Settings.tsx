import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { Info } from "../components/icons.tsx";
import { format, formatDate, formatSize, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { company, missing } from "../lib/company.ts";
import { db } from "../lib/db.ts";
import { mailState } from "../lib/mailing.ts";
import { documentNumber } from "../shared/model.ts";
import { formatRate, vatRates } from "../shared/money.ts";
import { numberingChanges, sequences } from "../lib/numbering.ts";
import { nameOf, people } from "../lib/people.ts";

// The company's legal details and the documents' defaults: the admin's.
// Everyone else reads them (they print on every document). Two islands
// (the form with the logo and the terms; the numbering) and what the law
// asks of the company, written here.
export async function settingsPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const locale = localeOf(ctx.locale);
  const sql = db();
  const c = await company(sql);
  const today = chest.today();
  const year = Number(today.slice(0, 4));
  const list = await sequences(sql, today);
  const changes = await numberingChanges(sql, 20);
  const who = await people(changes.map(ch => ch.changedBy));
  const history = changes.map(ch => {
    const name = ch.changedBy === member.id ? t.people.you : nameOf(who.get(ch.changedBy), locale);
    const text = ch.number ? format(t.settings.numbering.historyNext, { name, number: ch.number })
      : format(ch.numberFormat === "continuous" ? t.settings.numbering.historyContinuous : t.settings.numbering.historyYearly, { name });
    return { id: ch.id, text, when: formatDate(ch.changedAt, locale, { timeZone: member.timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) };
  });
  const canEdit = can(member, "settings");
  const s = t.settings;
  return {
    title: s.title,
    body: (
      <div className="page narrow">
        <Island name="SettingsView" props={{
          t: { settings: s, errors: t.errors, kit: t.kit },
          locale,
          company: c,
          missing: missing(c),
          canEdit,
          currency: chest.currency,
          sample: documentNumber("X", year, 1),
          logo: c.logo ? `/chest/logo?v=${encodeURIComponent(c.logo)}` : null,
          terms: c.terms ? { name: c.terms.name, size: formatSize(c.terms.size, locale) } : null,
          rates: vatRates.filter(r => r > 0).map(r => ({ rate: String(r), text: formatRate(r, locale) })),
          mailReason: (await mailState(sql)).reason,
        }} />
        <Island name="NumberingPanel" props={{
          t: { settings: { numbering: s.numbering, sections: s.sections }, kit: t.kit, common: t.common },
          canEdit,
          format: c.numberFormat,
          examples: { yearly: documentNumber(c.invoicePrefix, year, 1), continuous: documentNumber(c.invoicePrefix, 0, 1) },
          sequences: list.map(q => ({ type: q.type, next: q.next, nextSeq: q.nextSeq, started: q.started, prefix: q.next.slice(0, q.next.length - String(q.nextSeq).padStart(4, "0").length) })),
          history,
        }} />
        <section className="panel" aria-labelledby="s-law">
          <h2 id="s-law">{s.law.title}</h2>
          <div className="notice">
            <p><Info /> {s.law.reform}</p>
            <p>{s.law.notPa}</p>
            <p>{s.law.keep}</p>
          </div>
        </section>
      </div>
    ),
  };
}
