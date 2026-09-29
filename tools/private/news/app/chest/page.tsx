import { EmptyState } from "@argentic/chest-ui/components";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Alarm, Clock, Pen } from "../../components/icons.tsx";
import { can } from "../../lib/access.ts";
import { dates } from "../../lib/dates.ts";
import { db } from "../../lib/db.ts";
import { audienceLabel, groupNames } from "../../lib/groups.ts";
import { format, plural } from "../../lib/i18n/index.ts";
import { kinds } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { digestEmail } from "../../lib/preferences.ts";
import { front, visit } from "../../lib/posts.ts";
import { viewer } from "../../lib/session.ts";
import { catchUp, refreshBadges } from "../../lib/tell.ts";
import { DigestSwitch } from "./digest-switch.tsx";
import { Story, type Byline } from "./story.tsx";

// The front page: the lead story, then the others, newest first (pinned on
// top); what is coming up; for publishers, what is scheduled. What asks the
// reader something (Important posts not yet confirmed) comes first.
export default async function FrontPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const query = await searchParams;
  const kind = typeof query["kind"] === "string" && (kinds as readonly string[]).includes(query["kind"]) ? query["kind"] : null;
  const pageText = typeof query["page"] === "string" ? query["page"] : "1";
  const sql = db();
  const now = new Date();
  // Nothing runs in the background on a Chest without schedules: what is due
  // is told now; the tile's number is set right for whoever comes.
  await catchUp(sql, now, member.id);
  const marker = await visit(sql, member, now);
  const f = await front(sql, member, { kind, page: pageText, zone, now });
  await refreshBadges(sql, [member]);
  const all = [...f.posts, ...f.upcoming, ...f.scheduled];
  const who = await people(all.flatMap(p => [p.author, ...(p.welcome ? [p.welcome] : [])]));
  const names = all.some(p => p.groups.length > 0) ? await groupNames() : new Map<string, string>();
  const audience = (p: (typeof all)[number]) => audienceLabel(p, names, locale);
  const digestOn = await digestEmail(sql, member);
  const byline = (id: string): Byline => (id === member.id ? { name: t.people.you, photo: member.photo } : { name: nameOf(who.get(id), locale), photo: who.get(id)?.photo ?? null });
  const d = dates(locale, zone, now);
  const isNew = (p: (typeof all)[number]) => marker !== null && p.author !== member.id && p.publishAt > marker;
  const words = { kinds: t.kinds, front: t.front, event: t.event };
  const page = Number(/^[1-9][0-9]{0,4}$/u.test(pageText) ? pageText : "1");
  const link = (params: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries({ kind, ...params }).filter((e): e is [string, string] => e[1] !== null));
    return "/chest" + (q.size ? "?" + q : "");
  };
  const [lead, ...rest] = f.posts;
  const publisher = can(member, "publish");
  // An empty section offers every post; an empty front page, to a
  // publisher, the first post.
  const seeAll = <a className="button quiet" href="/chest">{t.front.seeAll}</a>;
  const writeFirst = <a className="button" href="/chest/new"><Pen />{t.front.empty.action}</a>;
  const emptyAction = kind ? seeAll : publisher ? writeFirst : null;
  return (
    <div className="front">
      <AutoRefresh seconds={60} />
      <header className="nameplate">
        <p className="dateline"><span>{d.today()}</span></p>
        <h1>{t.meta.name}</h1>
      </header>
      <nav className="sections" aria-label={t.shell.sections}>
        <a href="/chest" aria-current={kind === null ? "page" : undefined}>{t.sections.all}</a>
        {kinds.map(k => <a key={k} href={`/chest?kind=${k}`} aria-current={kind === k ? "page" : undefined}>{t.sections[k]}</a>)}
      </nav>

      {f.toConfirm.length > 0 && (
        <p className="asks-you" role="status">
          <Alarm />
          <span>{plural(t.front.toConfirm, f.toConfirm.length, locale)}</span>
          <a className="button small" href={`/chest/posts/${f.toConfirm[0]!.id}`}>{t.front.toConfirmAction}</a>
        </p>
      )}

      {!lead ? (
        <EmptyState
          title={kind ? t.front.emptySection[kind as keyof typeof t.front.emptySection] : t.front.empty.title}
          body={kind ? null : publisher ? t.front.empty.body : t.front.empty.reader}
          action={emptyAction}
        />
      ) : (
        <div className="front-grid">
          <div className="lead-slot">
            <Story post={lead} lead author={byline(lead.author)} welcome={lead.welcome ? byline(lead.welcome) : null} isNew={isNew(lead)} audience={audience(lead)} d={d} locale={locale} t={words} />
          </div>
          <aside className="side" aria-label={t.front.comingUp}>
            <section>
              <h2 className="side-title">{t.front.comingUp}</h2>
              {f.upcoming.length === 0 ? <p className="quiet-text">{t.front.noEvents}</p> : (
                <ul className="agenda">
                  {f.upcoming.map(e => (
                    <li key={e.id}>
                      <span className="date-block" aria-hidden="true"><span>{d.weekday(e.event!.day)}</span><strong>{d.dayNumber(e.event!.day)}</strong><span>{d.month(e.event!.day)}</span></span>
                      <span className="agenda-text">
                        <a href={`/chest/posts/${e.id}`} className="stretched"><span className="visually-hidden">{d.days(e.event!, t.event)} — </span>{e.title}</a>
                        <span className="quiet-text">{e.event!.lastDay ? d.days(e.event!, t.event) + " · " : ""}{d.hours(e.event!, t.event)}{e.event!.place ? " · " + e.event!.place : ""}</span>
                        {e.rsvp && <span className={"answer " + e.rsvp}>{e.rsvp === "yes" ? t.event.youCome : e.rsvp === "wait" ? t.event.youWait : t.event.youDont}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {publisher && f.scheduled.length > 0 && (
              <section>
                <h2 className="side-title">{t.front.scheduled}</h2>
                <ul className="scheduled">
                  {f.scheduled.map(s => (
                    <li key={s.id}>
                      <a href={`/chest/posts/${s.id}`}>{s.title}</a>
                      <span className="quiet-text"><Clock />{format(t.front.appears, { date: d.short(s.publishAt) })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
          {rest.length > 0 && (
            <div className="stories">
              {rest.map(p => <Story key={p.id} post={p} author={byline(p.author)} welcome={p.welcome ? byline(p.welcome) : null} isNew={isNew(p)} audience={audience(p)} d={d} locale={locale} t={words} />)}
            </div>
          )}
        </div>
      )}

      {(page > 1 || f.more) && (
        <nav className="pager" aria-label={t.front.pages}>
          {page > 1 && <a className="button quiet" href={link({ page: page === 2 ? null : String(page - 1) })}>{t.front.newer}</a>}
          {f.more && <a className="button quiet" href={link({ page: String(page + 1) })}>{t.front.older}</a>}
        </nav>
      )}
      <DigestSwitch on={digestOn} t={t.front} errors={t.errors} />
      {publisher && <p className="foot-link"><a href="/chest/transfer">{t.transfer.link}</a></p>}
    </div>
  );
}
