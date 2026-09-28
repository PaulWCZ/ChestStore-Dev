import type { ReactNode } from "react";
import * as chest from "@argentic/chest-sdk/chest";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Globe, Mask, Plus, Shield, Users } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { list, teamForms, type Listed } from "../../../lib/forms.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatDate, plural, relative } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { DeletedBanner } from "./deleted-banner.tsx";
import { StartButtons } from "./new/start-buttons.tsx";
import { templateKeys } from "../../../lib/templates.ts";

// Home: what the team asks me to answer, then my forms, those shared with
// me, and — for a manager — everyone else's. One obvious action: New form.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  const sql = db();
  const [all, toAnswer] = await Promise.all([list(sql, member), teamForms(sql, member)]);
  const mine = all.filter(f => f.owner === member.id);
  const shared = all.filter(f => f.owner !== member.id && f.level !== "owner");
  const others = all.filter(f => f.owner !== member.id && f.level === "owner");
  const creator = can(member, "forms.create");
  const now = new Date();
  const zone = chest.timeZone();
  const card = (f: Listed) => {
    const status = f.status === "draft" ? "draft" : f.open.open ? "open" : (f.open.reason ?? "closed");
    return (
      <li key={f.id}>
        <a className="form-card" href={`/chest/forms/${f.id}${f.level === "viewer" ? "/answers" : ""}`}>
          <span className="form-card-top">
            <span className={`status status-${status}`}>{t.status[status as keyof Catalogue["status"]]}</span>
            <span className="audience" title={f.audience === "public" ? t.home.public : f.anonymous ? t.home.anonymous : t.home.team}>
              {f.audience === "public" ? <Globe /> : f.anonymous ? <Mask /> : <Users />}
              <span className="visually-hidden">{f.audience === "public" ? t.home.public : f.anonymous ? t.home.anonymous : t.home.team}</span>
            </span>
          </span>
          <span className="form-card-title">{f.title || t.builder.untitled}</span>
          <span className="form-card-meta">
            <span className="answers-count">{plural(t.home.answers, f.answers, locale)}</span>
            {f.unseen > 0 && <span className="new-badge">{plural(t.home.unseen, f.unseen, locale)}</span>}
          </span>
          <span className="form-card-foot">{f.closesAt && f.open.open ? format(t.home.closes, { date: formatDate(f.closesAt, locale, zone, { day: "numeric", month: "long" }) }) : format(t.home.edited, { when: relative(f.updatedAt, locale, now) })}</span>
        </a>
      </li>
    );
  };
  const section = (title: string, forms: Listed[], extra?: ReactNode) => forms.length > 0 && (
    <section className="home-section" aria-labelledby={`h-${title}`}>
      <h2 id={`h-${title}`}>{title}</h2>
      <ul className="form-grid">{forms.map(card)}{extra}</ul>
    </section>
  );
  const deleted = (await searchParams)["deleted"];
  const templateWords = Object.fromEntries(templateKeys.map(k => [k, t.templates[k].name])) as Record<string, string>;
  return (
    <div className="home">
      <AutoRefresh seconds={30} />
      {typeof deleted === "string" && /^[1-9][0-9]{0,17}$/u.test(deleted) && <DeletedBanner formId={deleted} text={t.builder.deletedForm} undo={t.builder.undo} />}
      <div className="home-head">
        <h1>{t.home.title}</h1>
        {creator && <a className="button" href="/chest/new"><Plus />{t.home.new}</a>}
      </div>

      {toAnswer.length > 0 && (
        <section className="to-answer" aria-labelledby="h-answer">
          <h2 id="h-answer">{t.home.toAnswer}</h2>
          <ul>
            {toAnswer.map(f => (
              <li key={f.slug} className={f.answered ? "done" : ""}>
                <span className="to-answer-title">{f.title}</span>
                {f.anonymous && <span className="tag"><Mask />{t.home.anonymous}</span>}
                {f.answered && f.once ? <span className="tag ok">{t.home.answered}</span> : (
                  <a className="button small form-go" href={`/chest/f/${f.slug}`}>{f.answered ? t.home.answerAgain : t.home.answer}</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {all.length === 0 && creator && (
        <section className="empty-hero">
          <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
          <h2>{t.home.empty.title}</h2>
          <p>{t.home.empty.body}</p>
          <a className="button big" href="/chest/new">{t.home.empty.action}</a>
          <StartButtons keys={["contact", "feedback", "event"]} words={templateWords} errors={t.errors} />
        </section>
      )}
      {all.length === 0 && !creator && toAnswer.length === 0 && <p className="quiet-note">{t.home.nothingYet}</p>}
      {!creator && <p className="quiet-note">{t.home.noCreate}</p>}

      {section(t.home.yours, mine)}
      {section(t.home.shared, shared)}
      {section(t.home.others, others)}

      {can(member, "privacy.erase") && all.length > 0 && (
        <p className="home-foot"><a href="/chest/privacy"><Shield />{t.shell.privacy}</a></p>
      )}
    </div>
  );
}
