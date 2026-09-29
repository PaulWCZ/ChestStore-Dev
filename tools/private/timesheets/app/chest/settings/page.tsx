import { PageHeader } from "@argentic/chest-ui/components";
import { forbidden } from "next/navigation";
import Link from "next/link";
import { People, Upload } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { currency, today, zone } from "../../../lib/clock.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDate, formatDay } from "../../../lib/i18n/index.ts";
import { nameFor, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { endOfLastMonth, settings } from "../../../lib/settings.ts";
import { SettingsView } from "./settings-view.tsx";

export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "settings")) forbidden();
  const s = await settings(db());
  const who = s.lockedBy ? await people([s.lockedBy]) : new Map();
  const day = today();
  const lastMonth = endOfLastMonth(day);
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="page">
      <PageHeader title={t.settings.title} />
      <SettingsView
        today={day}
        lockedUntil={s.lockedUntil}
        lockText={s.lockedUntil ? format(t.settings.lock.current, { date: long(s.lockedUntil), name: s.lockedBy ? nameFor(s.lockedBy, who, locale) : t.people.unknown, when: s.lockedAt ? formatDate(s.lockedAt, zone(), locale, { day: "numeric", month: "long" }) : "" }) : null}
        lastMonth={{ day: lastMonth, label: format(t.settings.lock.lastMonth, { date: long(lastMonth) }), done: s.lockedUntil !== null && s.lockedUntil >= lastMonth }}
        reminder={s.reminder}
        approvals={s.approvals}
        hoursStyle={s.hoursStyle}
        comma={locale === "fr"}
        t={{ settings: t.settings, errors: t.errors, date: t.date }}
        locale={locale}
      />
      <section className="panel">
        <h2>{t.settings.money.title}</h2>
        <p>{format(t.settings.money.body, { currency: currency() })}</p>
        <p><Link className="button quiet" href="/chest/people"><People />{t.settings.peopleLink}</Link></p>
      </section>
      <section className="panel">
        <h2>{t.settings.import.title}</h2>
        <p>{t.settings.import.body}</p>
        <p><Link className="button quiet" href="/chest/import"><Upload />{t.settings.import.link}</Link></p>
      </section>
    </div>
  );
}
