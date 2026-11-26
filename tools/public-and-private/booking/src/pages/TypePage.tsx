import { Avatar } from "@argentic/chest-ui/components";
import { Back, Clock, kindIcon } from "../components/icons.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { after, notFound, type VisitorContext } from "@argentic/chest-app";
import { format, listFormat, plural, localeOf } from "../i18n/index.ts";
import { firstFree, publicType, settings, teamOf } from "../lib/booking.ts";
import { calendarLimits, refreshDue } from "../lib/calendars.ts";
import { db } from "../lib/db.ts";
import { mailState } from "../lib/mailer.ts";
import { people } from "../lib/people.ts";
import { hostWords } from "../lib/session.ts";
import { shareBusy } from "../lib/share.ts";
import { localizeType } from "../lib/texts.ts";
import { zoneGroups } from "../lib/zones.ts";
import { sheetOf } from "../theme.ts";
import { PublicShell } from "./PublicShell.tsx";
import { typeClass } from "../shared/kinds.ts";

// Booking one kind of meeting (/<host>/<type>): what it is on the left,
// when on the right (the BookTime island).
export async function typePage({ locale: wanted, param }: PageContext<VisitorContext>): Promise<View> {
  const sql = db();
  const found = await publicType(sql, param("host"), param("type"));
  const person = found ? (await people([found.host.memberId])).get(found.host.memberId) : undefined;
  if (!found || person?.status !== "member") return notFound();
  // The page in one language: the host's texts and the tool's words.
  const { t, locale, languages } = hostWords(found.host, localeOf(wanted));
  const host = found.host;
  const type = localizeType(found.type, host, locale);
  const team = await teamOf(sql, host, found.type);
  // The hosts' other calendars, read again after this page is sent when
  // the last read is older than a few minutes: the next visitor sees them.
  after("calendars read on a visit", async () => {
    let read = 0;
    for (const m of team) read += await refreshDue(db(), { olderThanMinutes: calendarLimits.lazyMinutes, memberId: m, deadline: Date.now() + 20000 }).catch(() => 0);
    if (read > 0) await shareBusy(db(), team).catch(() => 0);
  });
  const [s, first, sheet, mailing] = await Promise.all([settings(sql), firstFree(sql, host, found.type), sheetOf("public"), mailState()]);
  const names = team.length > 1 ? [...(await people(team)).values()].filter(x => x.status === "member").map(x => x.firstName || x.name) : [];
  const Kind = kindIcon[type.locationKind];
  return {
    title: type.title,
    body: (
      <PublicShell look={sheet.look} company={s.companyName} locale={locale} languages={languages} label={t.public.language} back={`/${host.slug}/${type.slug}`}>
        <a className="back" href={`/${host.slug}`}><Back />{t.public.back}</a>
        <div className={`sheet ${typeClass[type.color]}`}>
          <aside className="sheet-about">
            <span className="by"><Avatar name={person.name} photo={null} size="m" />{names.length > 1 ? format(t.public.withTeam, { names: listFormat(locale, "disjunction").format(names) }) : person.name}</span>
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
            <Island name="BookTime" props={{ hostSlug: host.slug, typeSlug: type.slug, hostName: person.firstName || person.name, hostZone: host.zone, first, locale, zones: zoneGroups(t.zones, Date.now(), [host.zone]), phone: type.locationKind === "phone", company: s.companyName, questions: type.questions, mailing: mailing === "ready", t: { public: t.public, days: t.days, errors: t.errors, answers: t.answers } }} />
          </section>
        </div>
      </PublicShell>
    ),
  };
}
