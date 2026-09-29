import { after } from "next/server";
import { notFound } from "next/navigation";
import { Avatar } from "../../../components/avatar.tsx";
import { Back, Clock, kindIcon } from "../../../components/icons.tsx";
import { Picker } from "../../../components/picker.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { firstFree, publicType, settings, teamOf } from "../../../lib/booking.ts";
import { calendarLimits, refreshDue } from "../../../lib/calendars.ts";
import { db } from "../../../lib/db.ts";
import { formToken } from "../../../lib/guard.ts";
import { format, intl, plural } from "../../../lib/i18n/index.ts";
import { people } from "../../../lib/people.ts";
import { publicWords } from "../../../lib/session.ts";
import { zoneGroups } from "../../../lib/zones.ts";

// Booking one kind of meeting: what it is on the left, when on the right.
export default async function TypePage({ params }: { params: Promise<{ host: string; type: string }> }) {
  const { host: hostSlug, type: typeSlug } = await params;
  const { t, locale } = await publicWords();
  const sql = db();
  const found = await publicType(sql, hostSlug, typeSlug);
  const person = found ? (await people([found.host.memberId])).get(found.host.memberId) : undefined;
  if (!found || person?.status !== "member") notFound();
  const { host, type } = found;
  const team = await teamOf(sql, host, type);
  // The hosts' other calendars, read again after this page is sent when
  // the last read is older than a few minutes: the next visitor sees them.
  after(async () => {
    for (const m of team) await refreshDue(db(), { olderThanMinutes: calendarLimits.lazyMinutes, memberId: m, deadline: Date.now() + 20000 }).catch(() => 0);
  });
  const [s, first] = await Promise.all([settings(sql), firstFree(sql, host, type)]);
  const names = team.length > 1 ? [...(await people(team)).values()].filter(x => x.status === "member").map(x => x.firstName || x.name) : [];
  const Kind = kindIcon[type.locationKind];
  return (
    <PublicShell company={s.companyName} locale={locale} label={t.public.language} back={`/${host.slug}/${type.slug}`}>
      <a className="back" href={`/${host.slug}`}><Back />{t.public.back}</a>
      <div className="sheet" style={{ "--type": `var(--c-${type.color})` } as React.CSSProperties}>
        <aside className="sheet-about">
          <span className="by"><Avatar name={person.name} photo={null} size={36} />{names.length > 1 ? format(t.public.withTeam, { names: new Intl.ListFormat(intl(locale), { type: "disjunction" }).format(names) }) : person.name}</span>
          <h1>{type.title}</h1>
          <div className="meta">
            <span><Clock />{plural(t.minutes, type.duration, locale)}</span>
            <span><Kind />{t.kinds[type.locationKind]}</span>
          </div>
          {type.description && <p className="desc">{type.description}</p>}
          {names.length > 1 && <p className="hint">{t.public.teamHint}</p>}
        </aside>
        <section className="sheet-when" aria-labelledby="when">
          <h2 id="when">{t.public.pickTime}</h2>
          <Picker hostSlug={host.slug} typeSlug={type.slug} hostName={person.firstName || person.name} hostZone={host.zone} first={first} locale={locale} zones={zoneGroups(t.zones, Date.now(), [host.zone])} phone={type.locationKind === "phone"} company={s.companyName} started={formToken()} questions={type.questions} t={{ public: t.public, days: t.days, errors: t.errors, answers: t.answers }} />
        </section>
      </div>
    </PublicShell>
  );
}
