import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Arrow, Check, Plus } from "../../components/icons.tsx";
import { can } from "../../lib/access.ts";
import { balancesOf } from "../../lib/balances.ts";
import { balanceNotes } from "../../lib/balance-words.ts";
import { setupSteps } from "../../lib/setup.ts";
import { addDays, weekday } from "../../lib/calendar.ts";
import { db } from "../../lib/db.ts";
import { format, formatDay, formatDays, plural, spanText } from "../../lib/i18n/index.ts";
import { today } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { between, mine, waiting } from "../../lib/requests.ts";
import { types } from "../../lib/rules.ts";
import { viewer } from "../../lib/session.ts";
import { typeName } from "../../lib/type-name.ts";
import { MyRequests, type RequestRow } from "./my-requests.tsx";

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

// Home: my balances, the one obvious action ("Ask for time off"), who is
// away this week, and my requests.
export default async function Home({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const now = today();
  const monday = addDays(now, -((weekday(now) + 6) % 7));
  const [all, myBalances, myRequests, week, open, steps] = await Promise.all([
    types(sql, { archived: true }),
    balancesOf(sql, [member.id]).then(m => m.get(member.id) ?? []),
    mine(sql, member),
    between(sql, member, monday, addDays(monday, 6)),
    can(member, "approve") ? waiting(sql, member) : Promise.resolve([]),
    can(member, "settings") ? setupSteps(sql) : Promise.resolve(null),
  ]);
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const others = week.filter(e => e.memberId !== member.id && e.status === "approved" && e.away);
  const who = await people(others.map(e => e.memberId));
  const done = (await searchParams).done;

  // Coming up: the soonest first; earlier: the latest first.
  const rows: RequestRow[] = myRequests.map(r => {
    const ty = typeOf.get(r.typeId);
    return {
      id: r.id,
      type: typeName(ty, t.types),
      color: ty?.color ?? "sky",
      when: spanText(r, locale, t.span),
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
  return (
    <div className="page">
      <AutoRefresh seconds={60} />
      {done === "sent" && <p className="notice ok" role="status">{t.home.sent}</p>}
      {done === "declared" && <p className="notice ok" role="status">{t.home.declared}</p>}
      <div className="hero">
        <HeroArt />
        <div className="hero-text">
          <h1>{format(t.home.hello, { name: member.firstName || member.name })}</h1>
          {main && main.setUp && <p className="hero-line">{format(t.home.summary, { days: plural(t.units.days, main.left, locale), type: inSentence(typeName(typeOf.get(main.typeId), t.types)) })}{main.pending > 0 ? " " + plural(t.home.summaryWaiting, main.pending, locale) : ""}</p>}
          <Link className="button big" href="/chest/new"><Plus />{t.home.ask}</Link>
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
                <Link href={step.href}>{t.setup[step.key]}</Link>
                <span className="visually-hidden">{step.done ? t.setup.doneWord : t.setup.todoWord}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {open.length > 0 && (
        <Link className="banner" href="/chest/approvals">
          <span>{plural(t.home.toAnswer, open.length, locale)}</span>
          <span className="banner-go">{t.home.answer}<Arrow /></span>
        </Link>
      )}

      <section aria-labelledby="balances">
        <h2 id="balances" className="section-title">{t.home.balances}</h2>
        {counted.length === 0 ? <p className="muted">{t.home.noBalances}</p> : (
          <ul className="balances">
            {counted.map(b => {
              const ty = typeOf.get(b.typeId);
              return (
                <li key={b.typeId} className={`balance k-${ty?.color ?? "sky"}`}>
                  <span className="balance-name">{typeName(ty, t.types)}</span>
                  {b.setUp ? (
                    <>
                      <span className="balance-figure"><strong>{formatDays(b.left, locale)}</strong> <span>{t.units.left}</span></span>
                      {balanceNotes(b, ty?.period ?? "running", locale, t).map(n => <span key={n} className="balance-note">{n}</span>)}
                    </>
                  ) : (
                    <>
                      <span className="balance-figure"><strong className="dim">–</strong></span>
                      <span className="balance-note">{t.home.notSetUp}. {t.home.notSetUpBody}</span>
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
                <li key={e.id}>
                  <Avatar name={p?.name ?? ""} photo={p?.photo ?? null} size="s" />
                  <span><strong>{nameOf(p, locale)}</strong> <span className="muted">{e.start === e.end || e.start > now ? spanText(e, locale, t.span) : format(t.home.until, { day: formatDay(e.end, locale) })}</span></span>
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
          <MyRequests rows={rows} t={{ home: t.home, status: t.status, errors: t.errors }} />
        )}
      </section>
    </div>
  );
}
