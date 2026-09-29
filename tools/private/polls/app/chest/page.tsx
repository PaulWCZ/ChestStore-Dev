import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Check, Clock, KindIcon, Mask, People, Pulse, Repeat } from "../../components/icons.tsx";
import { can, settles } from "../../lib/access.ts";
import { everyone, inAudience } from "../../lib/audience.ts";
import { dates, optionText } from "../../lib/dates.ts";
import { db } from "../../lib/db.ts";
import { format, plural } from "../../lib/i18n/index.ts";
import { kinds } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { home, policy, type Card } from "../../lib/polls.ts";
import { viewer } from "../../lib/session.ts";
import { catchUp, refreshOne } from "../../lib/tell.ts";
import { PolicySwitch } from "./policy-switch.tsx";

// The home page: what waits for my answer first, then (organisers) the
// three kinds of poll to start one, my polls, the open ones I answered, and
// those closed lately.
export default async function Home() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const sql = db();
  // The work a schedule would do, on a visit: Polls works without one.
  await catchUp(sql).catch(() => undefined);
  const data = await home(sql, member);
  await refreshOne(sql, member);
  const who = await people([...data.toAnswer, ...data.mine, ...data.answered, ...data.closed].map(c => c.organiser));
  const d = dates(locale, zone);
  // How many each of my open polls asks: the Chest's members, read once.
  const mineOpen = data.mine.filter(c => c.status === "open");
  const team = mineOpen.length > 0 ? (await everyone()).people : [];
  const total = (c: Card) => team.filter(p => inAudience(p, c)).length;
  const rules = await policy(sql);
  const organiser = can(member, "create", rules);
  const nothing = data.toAnswer.length + data.mine.length + data.answered.length + data.closed.length === 0;

  function card(c: Card, variant: "ask" | "mine" | "answered" | "closed") {
    const href = c.status === "draft" ? `/chest/polls/${c.id}/edit` : `/chest/polls/${c.id}`;
    const by = nameOf(who.get(c.organiser), locale);
    const when = c.status === "closed" ? format(t.home.closedOn, { date: d.at(c.closedAt!) }) : c.closesAt ? format(t.home.closes, { date: d.at(c.closesAt) }) : t.home.noClose;
    const action = variant === "ask" ? t.home.answer : c.status === "draft" ? t.home.edit : t.home.see;
    return (
      <article key={c.id} className={"poll-card" + (variant === "ask" ? " ask" : "")}>
        <div className="top">
          <span className={"chip " + c.kind}><KindIcon kind={c.kind} />{t.kinds[c.kind].chip}</span>
          {c.status === "draft" && <span className="chip draft">{t.home.draft}</span>}
          {c.anonymous && <span className="chip quiet"><Mask />{t.home.anonymous}</span>}
          {c.repeat && <span className="chip quiet"><Repeat />{c.round ? format(t.home.round, { round: c.round }) : t.repeat[c.repeat]}</span>}
        </div>
        <h3><a href={href}>{c.title}</a></h3>
        <div className="meta">
          <span>{c.mine ? t.home.byYou : format(t.home.by, { name: by })}</span>
          {c.status !== "draft" && <span><Clock />{when}</span>}
          {c.status === "draft" && <span>{t.home.notSent}</span>}
        </div>
        {c.final && <div className="meta"><span><Check />{format(t.home.final, { date: optionText(c.final, locale, zone, { range: t.dates.range, dayAndTime: t.dates.dayAndTime }) })}</span></div>}
        <div className="foot">
          <span className="meta">
            {c.status === "open" && variant === "mine" ? <span><People />{format(t.home.of, { count: c.answers, total: Math.max(total(c), c.answers) })}</span>
              : c.status !== "draft" ? <span><People />{plural(t.home.answers, c.answers, locale)}</span> : null}
          </span>
          <a className={"button small" + (variant === "ask" ? " primary" : "")} href={href} tabIndex={-1} aria-hidden="true">{action}</a>
        </div>
      </article>
    );
  }

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="hello confetti-band">
        <h1>{t.home.title}</h1>
      </div>

      {nothing && !organiser ? (
        <div className="empty">
          <h2>{t.home.emptyTitle}</h2>
          <p>{t.home.emptyBody}</p>
        </div>
      ) : (
        <section className="section" aria-labelledby="to-answer">
          <div className="section-head">
            <h2 id="to-answer">{t.home.toAnswer}</h2>
            {data.toAnswer.length > 0 && <span className="count-bubble">{data.toAnswer.length}</span>}
          </div>
          {data.toAnswer.length > 0 ? <div className="cards">{data.toAnswer.map(c => card(c, "ask"))}</div> : <p className="caught-up"><Check />{t.home.nothingToAnswer}</p>}
        </section>
      )}

      {organiser && (
        <section className="section" aria-labelledby="new-poll">
          <div className="section-head">
            <h2 id="new-poll">{t.home.newTitle}</h2>
          </div>
          {nothing && <p className="hint lead">{t.home.emptyOrganiser}</p>}
          <div className="kinds">
            {kinds.map(k => (
              <a key={k} className={"kind-tile " + k} href={`/chest/new?kind=${k}`}>
                <span className="kind-icon"><KindIcon kind={k} /></span>
                <strong>{t.kinds[k].name}</strong>
                <span className="line">{t.kinds[k].line}</span>
              </a>
            ))}
            <a className="kind-tile pulse" href="/chest/new?kind=survey&preset=pulse">
              <span className="kind-icon"><Pulse /></span>
              <strong>{t.home.pulse.name}</strong>
              <span className="line">{t.home.pulse.line}</span>
            </a>
          </div>
        </section>
      )}

      {data.mine.length > 0 && (
        <section className="section" aria-labelledby="mine">
          <div className="section-head"><h2 id="mine">{t.home.mine}</h2><span className="count-bubble quiet">{data.mine.length}</span></div>
          <div className="cards">{data.mine.map(c => card(c, "mine"))}</div>
        </section>
      )}

      {data.answered.length > 0 && (
        <section className="section" aria-labelledby="answered">
          <div className="section-head"><h2 id="answered">{t.home.answered}</h2></div>
          <div className="cards">{data.answered.map(c => card(c, "answered"))}</div>
        </section>
      )}

      {data.closed.length > 0 && (
        <section className="section" aria-labelledby="closed">
          <div className="section-head"><h2 id="closed">{t.home.closed}</h2></div>
          <div className="cards">{data.closed.map(c => card(c, "closed"))}</div>
        </section>
      )}

      {settles(member) && (
        <section className="section" aria-labelledby="settings">
          <div className="section-head"><h2 id="settings">{t.settings.title}</h2></div>
          <div className="card narrow-card"><PolicySwitch on={rules.membersCreate} t={{ settings: t.settings, errors: t.errors }} /></div>
        </section>
      )}
    </>
  );
}
