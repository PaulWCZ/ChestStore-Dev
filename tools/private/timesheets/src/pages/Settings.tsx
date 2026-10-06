import { forbidden, Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { People, Upload } from "../components/icons.tsx";
import { format, formatDate, formatDay, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { currency, today } from "../lib/clock.ts";
import { db } from "../lib/db.ts";
import { nameFor, people } from "../lib/people.ts";
import { endOfLastMonth, settings } from "../lib/settings.ts";

// The tool's settings (/chest/settings), for managers: the locked period,
// weekly approval, the usual week and its Friday reminder, how reports
// write hours; where rates and imports are.
export async function settingsPage({ member, locale: lang, t }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "settings")) forbidden();
  const s = await settings(db());
  const who = s.lockedBy ? await people([s.lockedBy]) : new Map();
  const day = today();
  const lastMonth = endOfLastMonth(day);
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  return {
    title: t.settings.title,
    body: (
      <div className="page">
        <PageHeader title={t.settings.title} />
        <Island
          name="SettingsView"
          props={{
            today: day,
            lockedUntil: s.lockedUntil,
            lockText: s.lockedUntil ? format(t.settings.lock.current, { date: long(s.lockedUntil), name: s.lockedBy ? nameFor(s.lockedBy, who, locale) : t.people.unknown, when: s.lockedAt ? formatDate(s.lockedAt, member.timeZone, locale, { day: "numeric", month: "long", ...(s.lockedAt.slice(0, 4) === day.slice(0, 4) ? {} : { year: "numeric" }) }) : "" }) : null,
            lastMonth: { day: lastMonth, label: format(t.settings.lock.lastMonth, { date: long(lastMonth) }), done: s.lockedUntil !== null && s.lockedUntil >= lastMonth },
            reminder: s.reminder,
            approvals: s.approvals,
            hoursStyle: s.hoursStyle,
            comma: locale === "fr",
            t: { settings: t.settings, errors: t.errors, date: t.kit.date },
            locale,
          }}
        />
        <section className="panel">
          <h2>{t.settings.money.title}</h2>
          <p>{format(t.settings.money.body, { currency: currency() })}</p>
          <p><a className="button quiet" href="/chest/people"><People />{t.settings.peopleLink}</a></p>
        </section>
        <section className="panel">
          <h2>{t.settings.import.title}</h2>
          <p>{t.settings.import.body}</p>
          <p><a className="button quiet" href="/chest/import"><Upload />{t.settings.import.link}</a></p>
        </section>
      </div>
    ),
  };
}
