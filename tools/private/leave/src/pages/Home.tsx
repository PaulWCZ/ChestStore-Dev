import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import { Arrow, Calendar, Check, Plus } from "../components/icons.tsx";
import { format, formatDay, formatDays, plural, spanText } from "../i18n/index.ts";
import type { RequestRow } from "../islands/MyRequests.tsx";
import { can } from "../lib/access.ts";
import { balanceNotes } from "../lib/balance-words.ts";
import { balancesOf } from "../lib/balances.ts";
import { addDays, weekday } from "../shared/calendar.ts";
import { db } from "../lib/db.ts";
import { feedPage, state as calendarState } from "../lib/leave-calendar.ts";
import { emailOn, mailNotice, mailPreference } from "../lib/mail.ts";
import { nameOf, people } from "../lib/people.ts";
import { between, mine, waiting } from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { setupSteps } from "../lib/setup.ts";
import { today } from "../lib/today.ts";
import { colorOf, typeName } from "../shared/type-name.ts";

// A type's name inside a sentence: "paid leave", but "RTT" stays.
const inSentence = (name: string): string => (name === name.toUpperCase() ? name : name.charAt(0).toLowerCase() + name.slice(1));

// A calm sea under a low sun, behind the greeting (decorative).
function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 320 200" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      <circle className="hero-sun" cx="220" cy="118" r="54" />
      <path className="hero-sea" d="M0 150c27 0 40-12 66-12s40 12 66 12 40-12 66-12 40 12 66 12 40-12 56-12v62H0z" />
      <path className="hero-wave" d="M40 176c16 0 24-7 40-7s24 7 40 7 24-7 40-7 24 7 40 7 24-7 40-7 24 7 40 7" />
    </svg>
  );
}

// Home (/chest): my balances, the one obvious action ("Ask for time off"),
// who is away this week, and my requests. ?done=sent|declared: what the
// request form just did.
export async function homePage({ member, locale, t, query }: PageContext<MemberContext>): Promise<View> {
  const sql = db();
  const now = today();
  const thisYear = now.slice(0, 4);
  const monday = addDays(now, -((weekday(now) + 6) % 7));
  const [all, myBalances, myRequests, week, open, steps, notice, chosen, feed, emails] = await Promise.all([
    types(sql, { archived: true }),
    balancesOf(sql, [member.id]).then(m => m.get(member.id) ?? []),
    mine(sql, member),
    between(sql, member, monday, addDays(monday, 6)),
    can(member, "approve") ? waiting(sql, member) : Promise.resolve([]),
    can(member, "settings") ? setupSteps(sql) : Promise.resolve(null),
    mailNotice(),
    mailPreference(member.id),
    calendarState(sql),
    emailOn(sql, member),
  ]);
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const others = week.filter(e => e.memberId !== member.id && e.status === "approved" && e.away);
  const who = await people(others.map(e => e.memberId));
  const done = query("done");

  // Coming up: the soonest first; earlier: the latest first (the island
  // sorts them).
  const rows: RequestRow[] = myRequests.map(r => {
    const ty = typeOf.get(r.typeId);
    return {
      id: r.id,
      type: typeName(ty, t.types),
      color: ty?.color ?? "sky",
      when: spanText(r, locale, t.span, { thisYear }),
      days: plural(t.units.days, r.days, locale),
      status: r.cancelAsked ? "cancelAsked" : r.status === "approved" && r.decidedBy === "chest" ? "declared" : r.status,
      upcoming: r.end >= now && (r.status === "pending" || r.status === "approved"),
      canCancel: r.status === "pending",
      canAskCancel: r.status === "approved" && !r.cancelAsked && r.start > now,
      reason: r.reason,
      start: r.start,
    };
  });

  const counted = myBalances.filter(b => !typeOf.get(b.typeId)?.archived);
  const main = counted[0];
  return {
    title: t.shell.home,
    body: (
      <div className="page">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        {done === "sent" && <p className="notice ok" role="status">{t.home.sent}</p>}
        {done === "declared" && <p className="notice ok" role="status">{t.home.declared}</p>}
        <div className="hero">
          <HeroArt />
          <div className="hero-text">
            <h1>{format(t.home.hello, { name: member.firstName || member.name })}</h1>
            {main && main.setUp && <p className="hero-line">{format(t.home.summary, { days: plural(t.units.days, main.left, locale), type: inSentence(typeName(typeOf.get(main.typeId), t.types)) })}{main.pending > 0 ? " " + plural(t.home.summaryWaiting, main.pending, locale) : ""}</p>}
            <a className="button big" href="/chest/new"><Plus />{t.home.ask}</a>
          </div>
        </div>

        {steps && !steps.done && (
          <section className="setup" aria-labelledby="setup">
            <h2 id="setup" className="section-title">{t.setup.title}</h2>
            <p className="muted">{t.setup.body}</p>
            <ol className="setup-steps">
              {steps.list.map(step => (
                <li key={step.key} className={step.done ? "done" : undefined}>
                  <span className="setup-tick" aria-hidden="true">{step.done ? <Check /> : null}</span>
                  <a href={step.href}>{t.setup[step.key]}</a>
                  <span className="visually-hidden">{step.done ? t.setup.doneWord : t.setup.todoWord}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {open.length > 0 && (
          <a className="banner" href="/chest/approvals">
            <span>{plural(t.home.toAnswer, open.length, locale)}</span>
            <span className="banner-go">{t.home.answer}<Arrow /></span>
          </a>
        )}

        <section aria-labelledby="balances">
          <h2 id="balances" className="section-title">{t.home.balances}</h2>
          {counted.length === 0 ? <p className="muted">{t.home.noBalances}</p> : (
            <ul className="balances">
              {counted.map(b => {
                const ty = typeOf.get(b.typeId);
                return (
                  <li key={b.typeId} id={`balance-${b.typeId}`} className={`balance k-${colorOf(ty)}`}>
                    <span className="balance-name">{typeName(ty, t.types)}</span>
                    {b.setUp ? (
                      <>
                        <span className="balance-figure"><strong>{formatDays(b.left, locale)}</strong> <span>{t.units.left}</span></span>
                        {balanceNotes(b, ty?.period ?? "running", locale, t, { thisYear }).map(n => <span key={n} className="balance-note">{n}</span>)}
                      </>
                    ) : (
                      <>
                        <span className="balance-figure"><strong className="dim">–</strong></span>
                        {can(member, "people.all") ? (
                          <span className="balance-note">{t.home.notSetUp}. <a href={`/chest/people/${member.id}`}>{t.home.setYours}</a></span>
                        ) : <span className="balance-note">{t.home.notSetUp}. {t.home.notSetUpBody}</span>}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="away">
          <h2 id="away" className="section-title">{t.home.awayWeek}</h2>
          {others.length === 0 ? <p className="muted">{t.home.nobodyAway}</p> : (
            <ul className="away">
              {others.map(e => {
                const p = who.get(e.memberId);
                return (
                  <li key={e.id} id={`away-${e.id}`}>
                    <Avatar name={p?.name ?? ""} photo={p?.photo ?? null} size="s" />
                    <span><strong>{nameOf(p, locale)}</strong> <span className="muted">{e.start === e.end || e.start > now ? spanText(e, locale, t.span, { thisYear }) : format(t.home.until, { day: formatDay(e.end, locale, undefined, thisYear) })}</span></span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="mine">
          <h2 id="mine" className="section-title">{t.home.mine}</h2>
          {rows.length === 0 ? (
            <EmptyState title={t.home.empty} body={t.home.emptyBody} headingLevel={3} />
          ) : (
            <Island name="MyRequests" props={{ rows, t: { home: t.home, status: t.status } }} />
          )}
        </section>

        <div className="home-footer">
          {feed === "on" && <p className="feed-link"><a href={feedPage}><Calendar />{t.home.feed}</a></p>}
          {notice !== "none" && <Island name="EmailSwitch" props={{ on: emails, label: t.home.email }} />}
          {notice === "off" && <p className="small muted email-choice">{t.home.emailOff}</p>}
          {notice === "quota" && <p className="small muted email-choice">{t.home.emailQuota}</p>}
          {notice === null && chosen === "none" && <p className="small muted email-choice">{t.home.emailNone}</p>}
          {notice === null && chosen === "digest" && <p className="small muted email-choice">{t.home.emailDigest}</p>}
        </div>
      </div>
    ),
  };
}
