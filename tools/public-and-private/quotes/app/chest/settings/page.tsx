import * as chest from "@argentic/chest-sdk/chest";
import { can } from "../../../lib/access.ts";
import { company, missing } from "../../../lib/company.ts";
import { db } from "../../../lib/db.ts";
import { formatDate } from "../../../lib/i18n/index.ts";
import { documentNumber } from "../../../lib/model.ts";
import { formatRate, vatRates } from "../../../lib/money.ts";
import { numberingChanges, sequences } from "../../../lib/numbering.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { NumberingPanel } from "./numbering.tsx";
import { SettingsView } from "./settings-view.tsx";

// The company's legal details and the documents' defaults: the admin's.
// Everyone else reads them (they print on every document).
export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const c = await company(sql);
  const today = chest.today();
  const year = Number(today.slice(0, 4));
  const list = await sequences(sql, today);
  const changes = await numberingChanges(sql, 20);
  const who = await people(changes.map(ch => ch.changedBy));
  const history = changes.map(ch => {
    const name = ch.changedBy === member.id ? t.people.you : nameOf(who.get(ch.changedBy), locale);
    const text = ch.number ? t.settings.numbering.historyNext.replace("{name}", name).replace("{number}", ch.number)
      : (ch.numberFormat === "continuous" ? t.settings.numbering.historyContinuous : t.settings.numbering.historyYearly).replace("{name}", name);
    return { id: ch.id, text, when: formatDate(ch.changedAt, locale, { timeZone: chest.timeZone(), day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) };
  });
  const canEdit = can(member, "settings");
  const formatSize = (bytes: number) => new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { style: "unit", unit: bytes >= 1048576 ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(bytes >= 1048576 ? bytes / 1048576 : Math.max(1, bytes / 1024));
  return (
    <SettingsView
      t={t}
      locale={locale}
      company={c}
      missing={missing(c)}
      canEdit={canEdit}
      currency={chest.currency()}
      sample={documentNumber("X", year, 1)}
      logo={c.logo ? `/chest/logo?v=${encodeURIComponent(c.logo)}` : null}
      terms={c.terms ? { name: c.terms.name, size: formatSize(c.terms.size) } : null}
      rates={vatRates.filter(r => r > 0).map(r => ({ rate: String(r), text: formatRate(r, locale) }))}
      numbering={
        <NumberingPanel
          t={t}
          canEdit={canEdit}
          format={c.numberFormat}
          examples={{ yearly: documentNumber(c.invoicePrefix, year, 1), continuous: documentNumber(c.invoicePrefix, 0, 1) }}
          sequences={list.map(s => ({ type: s.type, next: s.next, nextSeq: s.nextSeq, started: s.started, prefix: s.next.slice(0, s.next.length - String(s.nextSeq).padStart(4, "0").length) }))}
          history={history}
        />
      }
    />
  );
}
