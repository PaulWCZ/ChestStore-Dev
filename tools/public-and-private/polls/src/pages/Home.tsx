import type { Member } from "@argentic/chest-sdk/member";
import { EmptyState, PageHeader, StatusBadge } from "@argentic/chest-ui/components";
import { Check, Clock, KindIcon, Mask, People, Plus, Pulse, Repeat } from "../components/icons.tsx";
import { Island } from "@argentic/chest-app";
import { fill, type Catalogue, type Format } from "../i18n/index.ts";
import { asked, type Policy } from "../lib/access.ts";
import { dates, optionText } from "../lib/dates.ts";
import { kinds } from "../lib/model.ts";
import type { Card, Home as HomeData } from "../lib/polls.ts";
import { percentClass } from "./bits.tsx";

// The home page, /chest: what waits for my answer first, what I asked (its
// state and who answered), the kinds of poll to start one, the open ones I
// answered, and those closed lately; for admins, the settings. It re-reads
// itself every 30 s while visible (the Chest has no WebSocket).
export type HomeProps = {
  data: HomeData;
  member: Member;
  // Who organised each card's poll, as the reader sees them.
  organisers: Map<string, string>;
  // How many each poll I asked asks.
  totals: Map<string, number>;
  rules: Policy;
  // May start a poll; may start a company survey; may change the settings.
  creates: boolean;
  surveys: boolean;
  settles: boolean;
  zone: string;
  t: Catalogue;
  f: Format;
};

export function Home({ data, member, organisers, totals, rules, creates, surveys, settles, zone, t, f }: HomeProps) {
  const locale = f.locale;
  const d = dates(locale, zone);
  const nothing = data.toAnswer.length + data.mine.length + data.answered.length + data.closed.length === 0;

  function card(c: Card, variant: "ask" | "answered" | "closed") {
    const href = c.status === "draft" ? `/chest/polls/${c.id}/edit` : `/chest/polls/${c.id}`;
    const by = organisers.get(c.organiser) ?? t.people.unknown;
    const when = c.status === "closed" ? fill(t.home.closedOn, { date: d.at(c.closedAt!) }) : c.closesAt ? fill(t.home.closes, { date: d.at(c.closesAt) }) : t.home.noClose;
    const action = variant === "ask" ? t.home.answer : c.status === "draft" ? t.home.edit : t.home.see;
    return (
      <article key={c.id} id={`card-${variant}-${c.id}`} className={"poll-card" + (variant === "ask" ? " ask" : "")}>
        <div className="top">
          <span className={"chip " + c.kind}><KindIcon kind={c.kind} />{t.kinds[c.kind].chip}</span>
          {c.status === "draft" && <StatusBadge tone="neutral" size="s" label={t.home.draft} />}
          {c.anonymous && <StatusBadge tone="neutral" size="s" icon={<Mask />} label={t.home.anonymous} />}
          {c.repeat && <StatusBadge tone="neutral" size="s" icon={<Repeat />} label={c.round ? fill(t.home.round, { round: c.round }) : t.repeat[c.repeat]} />}
        </div>
        <h3><a href={href}>{c.title}</a></h3>
        <div className="meta">
          <span>{c.mine ? t.home.byYou : fill(t.home.by, { name: by })}</span>
          {c.status !== "draft" && <span><Clock />{when}</span>}
          {c.status === "draft" && <span>{t.home.notSent}</span>}
        </div>
        {c.final && <div className="meta"><span><Check />{fill(t.home.final, { date: optionText(c.final, locale, zone, { range: t.dates.range, dayAndTime: t.dates.dayAndTime }) })}</span></div>}
        <div className="foot">
          <span className="meta">
            {c.status !== "draft" ? <span><People />{f.plural(t.home.answers, c.answers)}</span> : null}
          </span>
          <a className={"button small" + (variant === "ask" ? " primary" : "")} href={href} tabIndex={-1} aria-hidden="true">{action}</a>
        </div>
      </article>
    );
  }

  // What I asked, as a list (Doodle's dashboard): its state, how many of
  // those asked answered, and when it closes.
  function row(c: Card) {
    const href = c.status === "draft" ? `/chest/polls/${c.id}/edit` : `/chest/polls/${c.id}`;
    const of = Math.max(totals.get(c.id) ?? 0, c.answers);
    const toAnswer = c.status === "open" && !c.answered && asked(member, c);
    return (
      <li key={c.id} id={`mine-${c.id}`} className={"asked-row " + c.status}>
        <span className={"chip " + c.kind} aria-hidden="true"><KindIcon kind={c.kind} /></span>
        <div className="asked-main">
          <a className="asked-title" href={href}>{c.title}</a>
          <span className="meta">
            {c.status === "open" && <StatusBadge tone="ok" size="s" label={t.home.open} />}
            {c.status === "closed" && <StatusBadge tone="neutral" size="s" label={t.home.closedState} />}
            {c.status === "draft" && <StatusBadge tone="neutral" size="s" label={t.home.draft} />}
            {c.repeat && <span><Repeat />{c.round ? fill(t.home.round, { round: c.round }) : t.repeat[c.repeat]}</span>}
            {c.status !== "draft" && <span><Clock />{c.status === "closed" ? fill(t.home.closedOn, { date: d.at(c.closedAt!) }) : c.closesAt ? fill(t.home.closes, { date: d.at(c.closesAt) }) : t.home.noClose}</span>}
            {c.status === "draft" && <span>{t.home.notSent}</span>}
          </span>
        </div>
        {c.status !== "draft" && (
          <span className="asked-count">
            <span>{fill(t.home.of, { count: c.answers, total: of })}</span>
            <span className="meter" aria-hidden="true"><i className={percentClass(of > 0 ? (100 * c.answers) / of : 0)} /></span>
          </span>
        )}
        <a className="button small" href={href} tabIndex={-1} aria-hidden="true">{toAnswer ? t.home.answer : c.status === "draft" ? t.home.edit : t.home.see}</a>
      </li>
    );
  }

  return (
    <>
      <Island name="AutoRefresh" props={{ seconds: 30 }} />
      <div className="hello confetti-band">
        <PageHeader title={t.home.title} action={creates ? <a className="button primary" href="/chest/new"><Plus />{t.shell.newPoll}</a> : undefined} />
      </div>

      {nothing && !creates ? (
        <EmptyState title={t.home.emptyTitle} body={t.home.emptyBody} />
      ) : (
        <section className="section" aria-labelledby="to-answer">
          <div className="section-head">
            <h2 id="to-answer">{t.home.toAnswer}</h2>
            {data.toAnswer.length > 0 && <span className="count-bubble">{data.toAnswer.length}</span>}
          </div>
          {data.toAnswer.length > 0 ? <div className="cards">{data.toAnswer.map(c => card(c, "ask"))}</div> : <p className="caught-up"><Check />{t.home.nothingToAnswer}</p>}
        </section>
      )}

      {data.mine.length > 0 && (
        <section className="section" aria-labelledby="mine">
          <div className="section-head"><h2 id="mine">{t.home.mine}</h2><span className="count-bubble quiet">{data.mine.length}</span></div>
          <ul className="asked-list">{data.mine.map(row)}</ul>
        </section>
      )}

      {creates && (
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
            {surveys && (
              <a className="kind-tile pulse" href="/chest/new?kind=survey&preset=pulse">
                <span className="kind-icon"><Pulse /></span>
                <strong>{t.home.pulse.name}</strong>
                <span className="line">{t.home.pulse.line}</span>
              </a>
            )}
          </div>
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

      {settles && (
        <section className="section" aria-labelledby="settings">
          <div className="section-head"><h2 id="settings">{t.settings.title}</h2></div>
          <div className="card narrow-card">
            <Island name="PolicySwitch" props={{ on: rules.membersCreate, which: "create", label: t.settings.membersCreate, hint: t.settings.membersCreateHint, saved: t.settings.saved }} />
            <Island name="PolicySwitch" props={{ on: rules.membersSurveys, which: "surveys", label: t.settings.membersSurveys, hint: t.settings.membersSurveysHint, saved: t.settings.saved }} />
          </div>
        </section>
      )}
    </>
  );
}
