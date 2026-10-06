import { Island } from "@argentic/chest-app";
import type { ReactNode } from "react";
import { Globe, Inbox, Mask, Plus, Shield, Trash, Users } from "../components/icons.tsx";
import { FollowBadge, StateBadge } from "../components/state-badge.tsx";
import { format, plural, relative, when, type Catalogue } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { sent } from "../lib/answers.ts";
import { everyoneCreates, mayCreate } from "../lib/creators.ts";
import { list, teamForms, trash, type Listed } from "../lib/forms.ts";
import { templateKeys } from "../lib/templates.ts";
import type { Ctx } from "./context.ts";

// Home: what the team asks me to answer and what I sent (with where each
// request stands), then my forms, those shared with me, and — for a
// manager — everyone else's, searched by title. One obvious action: New form.
export async function homePage({ sql, member, t, lang, zone, query }: Ctx) {
  const search = (query("q") ?? "").slice(0, 100);
  const [all, toAnswer, mySent, deletedForms, creator, everyone] = await Promise.all([list(sql, member, search), teamForms(sql, member), sent(sql, member, 20), trash(sql, member), mayCreate(sql, member), everyoneCreates(sql)]);
  const mine = all.filter(f => f.owner === member.id);
  const shared = all.filter(f => f.owner !== member.id && f.level !== "owner");
  const others = all.filter(f => f.owner !== member.id && f.level === "owner");
  const now = new Date();
  const card = (f: Listed) => {
    const status = f.status === "draft" ? "draft" : f.open.open ? "open" : (f.open.reason ?? "closed");
    const audience = f.audience === "public" ? t.home.public : f.anonymous ? t.home.anonymous : t.home.team;
    return (
      <li key={f.id} id={`form-${f.id}`}>
        <a className="form-card" href={`/chest/forms/${f.id}${f.level === "viewer" ? "/answers" : ""}`}>
          <span className="form-card-top">
            <StateBadge state={status} label={t.status[status as keyof Catalogue["status"]]} />
            <span className="audience" title={audience}>
              {f.audience === "public" ? <Globe /> : f.anonymous ? <Mask /> : <Users />}
              <span className="visually-hidden">{audience}</span>
            </span>
          </span>
          <span className="form-card-title">{f.title || t.builder.untitled}</span>
          <span className="form-card-meta">
            <span className="answers-count">{plural(t.home.answers, f.answers, lang)}</span>
            {f.unseen > 0 && <span className="new-badge">{plural(t.home.unseen, f.unseen, lang)}</span>}
          </span>
          <span className="form-card-foot">{f.closesAt && f.open.open ? format(t.home.closes, { date: when(f.closesAt, lang, zone, { time: false, long: true }) }) : format(t.home.edited, { when: relative(f.updatedAt, lang, now) })}</span>
        </a>
      </li>
    );
  };
  const section = (key: string, title: string, forms: Listed[], extra?: ReactNode) => forms.length > 0 && (
    <section className="home-section" aria-labelledby={`h-${key}`}>
      <h2 id={`h-${key}`}>{title}</h2>
      <ul className="form-grid">{forms.map(card)}{extra}</ul>
    </section>
  );
  const deleted = query("deleted");
  const templateWords = Object.fromEntries(templateKeys.map(k => [k, t.templates[k].name])) as Record<string, string>;
  return {
    title: t.home.title,
    body: (
      <div className="home">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        {deleted !== undefined && /^[1-9][0-9]{0,17}$/u.test(deleted) && <Island id={`deleted-${deleted}`} name="DeletedToast" props={{ formId: deleted, text: t.builder.deletedForm }} />}
        <div className="home-head">
          <h1>{t.home.title}</h1>
          {/* A company's first visit has one action: the empty page's own. */}
          {creator && (all.length > 0 || search) && <a className="button" href="/chest/new"><Plus />{t.home.new}</a>}
        </div>

        {toAnswer.length > 0 && (
          <section className="to-answer" aria-labelledby="h-answer">
            <h2 id="h-answer">{t.home.toAnswer}</h2>
            <ul>
              {toAnswer.map(f => (
                <li key={f.slug} id={`ask-${f.slug}`} className={f.answered ? "done" : ""}>
                  <span className="to-answer-title">{f.title}</span>
                  {/* Its marks stay together (never one of them alone on a line). */}
                  <span className="to-answer-end">
                    {f.anonymous && <span className="tag"><Mask />{t.home.anonymous}</span>}
                    {f.answered && f.once ? <span className="tag ok">{t.home.answered}</span> : (
                      <a className="button small form-go" href={`/chest/f/${f.slug}`}>{f.answered ? t.home.answerAgain : t.home.answer}</a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {mySent.length > 0 && (
          <section className="sent" aria-labelledby="h-sent">
            <h2 id="h-sent"><Inbox /> {t.home.sent}</h2>
            <ul>
              {mySent.slice(0, 8).map(x => (
                <li key={x.id} id={`sent-${x.id}`}>
                  <a href={`/chest/sent/${x.id}`} className="sent-link">
                    <span className="to-answer-title">{x.formTitle}</span>
                    <span className="dim">{when(x.createdAt, lang, zone, { time: false })}</span>
                    <FollowBadge state={x.status} label={t.follow.states[x.status]} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(all.length > 0 || search) && (
          <div className="home-search">
            <Island name="Search" props={{ action: "/chest", value: search, keep: {}, label: t.home.search, labels: t.kit.search }} />
            {search && <a className="button link" href="/chest">{t.home.clearSearch}</a>}
          </div>
        )}
        {search && all.length === 0 && <p className="quiet-note">{t.home.noMatch}</p>}

        {all.length === 0 && creator && !search && (
          <section className="empty-hero">
            <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
            <h2>{t.home.empty.title}</h2>
            <p>{t.home.empty.body}</p>
            <a className="button big" href="/chest/new">{t.home.empty.action}</a>
            <Island name="StartButtons" props={{ keys: ["contact", "feedback", "event"], words: templateWords }} />
          </section>
        )}
        {all.length === 0 && !creator && toAnswer.length === 0 && !search && <p className="quiet-note">{t.home.nothingYet}</p>}
        {!creator && <p className="quiet-note">{t.home.noCreate}</p>}

        {section("yours", t.home.yours, mine)}
        {section("shared", t.home.shared, shared)}
        {section("others", t.home.others, others)}

        {can(member, "forms.all") && <Island name="EveryoneSwitch" props={{ on: everyone, words: { everyone: t.home.everyone, everyoneHint: t.home.everyoneHint, everyoneOn: t.home.everyoneOn, everyoneOff: t.home.everyoneOff } }} />}

        {(deletedForms.length > 0 || (can(member, "privacy.erase") && all.length > 0)) && (
          <p className="home-foot">
            {deletedForms.length > 0 && <a href="/chest/trash"><Trash />{plural(t.trash.link, deletedForms.length, lang)}</a>}
            {can(member, "privacy.erase") && all.length > 0 && <a href="/chest/privacy"><Shield />{t.shell.privacy}</a>}
          </p>
        )}
      </div>
    ),
  };
}
