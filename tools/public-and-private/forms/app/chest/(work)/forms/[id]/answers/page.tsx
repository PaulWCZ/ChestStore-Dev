import * as chest from "@argentic/chest-sdk/chest";
import { AutoRefresh } from "../../../../../../components/auto-refresh.tsx";
import { Download, Search, Zip } from "../../../../../../components/icons.tsx";
import { anonymousTexts, followStates, listAnswers } from "../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { format, formatDate, plural } from "../../../../../../lib/i18n/index.ts";
import { answerText } from "../../../../../../lib/logic.ts";
import { limits, withOptions } from "../../../../../../lib/model.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { formOr404 } from "../../../../../../lib/pages.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { columnsOf, optionLabels } from "../../../../../../lib/summary.ts";
import { seen } from "../../../../../../lib/tell.ts";
import { AnswersSwitch } from "../answers-switch.tsx";
import { AutoFilter } from "./auto-filter.tsx";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

// Answers: a table (cards on a phone), searched and filtered — the
// filters apply at once —, newest or oldest first, the columns chosen;
// each opens on its own page. Opening it clears the member's bell item.
// An anonymous form has no table: its written answers, each on its own,
// shuffled (lib/answers.ts anonymousTexts), and the summary.
export default async function AnswersPage({ params, searchParams }: Props) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const sql = db();
  const id = (await params).id;
  const query = await searchParams;
  const { form } = await formOr404(member, id);
  await seen(sql, form.id, member.id);
  const base = `/chest/forms/${form.id}`;
  const zone = chest.timeZone();
  const exports = (
    <span className="exports">
      <a className="button quiet small" href={`${base}/export`} download><Download />{form.anonymous ? t.answers.exportSummary : t.answers.export}</a>
      {!form.anonymous && <a className="button quiet small" href={`${base}/archive`} download><Zip />{t.answers.archive}</a>}
    </span>
  );
  const head = <AnswersSwitch base={base} list={t.answers.viewList} summary={t.answers.viewSummary} label={t.answers.views} />;

  if (form.anonymous) {
    let data;
    try {
      data = await anonymousTexts(sql, member, id);
    } catch (error) {
      if (error instanceof AppError && error.code === "too_few") {
        return (
          <div className="answers-page">
            {head}
            <div className="empty"><h2>{t.answers.floorTitle}</h2><p>{format(t.answers.floor, { floor: limits.anonymousFloor, count: error.values["count"] ?? 0 })}</p></div>
          </div>
        );
      }
      throw error;
    }
    return (
      <div className="answers-page">
        <AutoRefresh seconds={30} />
        <div className="answers-bar">{head}<span className="spacer" />{exports}</div>
        <p className="answers-count" role="status">{plural(t.answers.count, data.total, locale)}</p>
        <p className="notice">{t.answers.anonymousRows}</p>
        {data.texts.length === 0 ? <p className="quiet-note">{t.answers.anonymousNoTexts}</p> : (
          <ol className="summary-list">
            {data.texts.map(x => (
              <li key={x.question.id} className="summary-card">
                <h2>{x.question.title}{x.removed && <span className="tag">{t.summary.removed}</span>}</h2>
                <p className="hint">{plural(t.summary.answered, x.texts.length, locale)}</p>
                {x.texts.length > 0 && <ul className="texts">{x.texts.map((text, i) => <li key={i}>{text}</li>)}</ul>}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  const q = one(query["q"]) ?? "";
  const where = one(query["where"]) ?? "";
  const status = one(query["status"]) ?? "";
  const from = one(query["from"]) ?? "";
  const to = one(query["to"]) ?? "";
  const sort = one(query["sort"]) === "oldest" ? "oldest" : "";
  const [question, option] = where.split(":");
  const data = await listAnswers(sql, member, id, { q, question, option, status, from, to, sort, page: one(query["page"]) }, zone);
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const every = columnsOf(data.versions, form.draft).filter(c => !c.removed);
  const chosen = many(query["cols"]).filter(c => every.some(x => x.question.id === c));
  const columns = chosen.length > 0 ? every.filter(c => chosen.includes(c.question.id)) : every.slice(0, 4);
  const labels = optionLabels(data.versions);
  const filterable = columnsOf(data.versions, form.draft).filter(c => withOptions(c.question.kind) || c.question.kind === "yesno");
  const who = await people(data.answers.flatMap(a => (a.respondent ? [a.respondent] : [])));
  const pages = Math.max(1, Math.ceil(data.matching / limits.page));
  const keep = new URLSearchParams({ ...(q ? { q } : {}), ...(where ? { where } : {}), ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(sort ? { sort } : {}) });
  for (const c of chosen) keep.append("cols", c);
  const link = (page: number) => { const x = new URLSearchParams(keep); x.set("page", String(page)); return `${base}/answers?${x}`; };
  const filters = q || where || status || from || to;
  const whoOf = (a: (typeof data.answers)[number]) => (a.respondent ? (a.respondent === member.id ? t.people.you : nameOf(who.get(a.respondent), locale)) : (a.email ?? t.answers.visitor));
  const whenOf = (a: (typeof data.answers)[number]) => (a.createdAt ? formatDate(a.createdAt, locale, zone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : formatDate(a.month + "T12:00:00Z", locale, "UTC", { month: "long", year: "numeric" }));
  const cellOf = (a: (typeof data.answers)[number], c: (typeof columns)[number]) => {
    const text = answerText({ ...c.question, options: (c.question.options ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })), rows: (c.question.rows ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })) }, a.data[c.question.id], words);
    return text.length > 90 ? text.slice(0, 89) + "…" : text;
  };
  const answerLink = (a: (typeof data.answers)[number]) => `${base}/answers/${a.id}${keep.size ? "?" + keep : ""}`;
  return (
    <div className="answers-page">
      <AutoRefresh seconds={30} />
      <div className="answers-bar">{head}<span className="spacer" />{data.total > 0 && exports}</div>
      {data.total > 0 && (
        <AutoFilter action={`${base}/answers`} className="answers-filter" label={t.answers.filterLabel}>
          <label className="search-field">
            <Search />
            <span className="visually-hidden">{t.answers.search}</span>
            <input className="field" type="search" name="q" defaultValue={q} placeholder={t.answers.search} enterKeyHint="search" />
          </label>
          {filterable.length > 0 && (
            <label className="mini">
              <span className="visually-hidden">{t.answers.filter}</span>
              <select className="field" name="where" defaultValue={where}>
                <option value="">{t.answers.filterAll}</option>
                {filterable.map(c => (
                  <optgroup key={c.question.id} label={c.question.title}>
                    {c.question.kind === "yesno"
                      ? [["yes", t.respond.yes], ["no", t.respond.no]].map(([k, l]) => <option key={k} value={`${c.question.id}:${k}`}>{format(t.answers.filterWhere, { question: c.question.title, option: l! })}</option>)
                      : [...(c.question.options ?? []).map(o => [o.id, labels.get(o.id) ?? o.label] as const), ...(c.question.other ? [["other", t.respond.other] as const] : [])].map(([k, l]) => <option key={k} value={`${c.question.id}:${k}`}>{format(t.answers.filterWhere, { question: c.question.title, option: l })}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <label className="mini">
            <span className="visually-hidden">{t.follow.label}</span>
            <select className="field" name="status" defaultValue={status}>
              <option value="">{t.follow.all}</option>
              {followStates.map(s => <option key={s} value={s}>{`${t.follow.states[s]} (${data.counts[s]})`}</option>)}
            </select>
          </label>
          <label className="mini date-mini"><span className="mini-label">{t.answers.from}</span><input className="field" type="date" name="from" defaultValue={from} lang={locale} /></label>
          <label className="mini date-mini"><span className="mini-label">{t.answers.to}</span><input className="field" type="date" name="to" defaultValue={to} lang={locale} /></label>
          <label className="mini">
            <span className="visually-hidden">{t.answers.order}</span>
            <select className="field" name="sort" defaultValue={sort}>
              <option value="">{t.answers.newest}</option>
              <option value="oldest">{t.answers.oldest}</option>
            </select>
          </label>
          {chosen.map(c => <input key={c} type="hidden" name="cols" value={c} />)}
          {filters && <a className="button link" href={`${base}/answers`}>{t.answers.clear}</a>}
        </AutoFilter>
      )}
      <p className="answers-count" role="status">{filters ? plural(t.answers.matching, data.matching, locale) : plural(t.answers.count, data.total, locale)}</p>
      {data.total === 0 ? (
        <div className="empty"><h2>{t.answers.none}</h2><p>{t.answers.noneHint}</p><a className="button quiet" href={`${base}/share`}>{t.tabs.share}</a></div>
      ) : data.answers.length === 0 ? (
        <p className="quiet-note">{t.answers.noMatch}</p>
      ) : (
        <>
          {every.length > 4 && (
            <details className="columns-pick">
              <summary>{t.answers.columns}</summary>
              <AutoFilter action={`${base}/answers`} className="columns-form" label={t.answers.columns}>
                {[...keep.entries()].filter(([k]) => k !== "cols").map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
                {every.map(c => (
                  <label key={c.question.id} className="check">
                    <input type="checkbox" name="cols" value={c.question.id} defaultChecked={columns.includes(c)} />
                    {c.question.title}
                  </label>
                ))}
              </AutoFilter>
            </details>
          )}
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t.answers.title}>
            <table className="answers-table">
              <thead>
                <tr>
                  <th scope="col">{t.answers.when}</th>
                  <th scope="col">{t.answers.who}</th>
                  {columns.map(c => <th key={c.question.id} scope="col">{c.question.title}</th>)}
                  <th scope="col">{t.follow.label}</th>
                  <th scope="col"><span className="visually-hidden">{t.answers.open}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.answers.map(a => (
                  <tr key={a.id}>
                    <td className="nowrap">{whenOf(a)}</td>
                    <td className="who-cell">{!a.respondent && a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : whoOf(a)}</td>
                    {columns.map(c => <td key={c.question.id} data-label={c.question.title}>{cellOf(a, c) || <span className="dim">—</span>}</td>)}
                    <td data-label={t.follow.label}><span className={`follow follow-${a.status}`}>{t.follow.states[a.status]}</span></td>
                    <td><a className="button small quiet" href={answerLink(a)} aria-label={`${t.answers.openAnswer}: ${whoOf(a)}, ${whenOf(a)}`}>{t.answers.open}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label={format(t.answers.pageOf, { page: data.page })}>
          {data.page > 1 && <a className="button quiet small" href={link(data.page - 1)}>{sort ? t.answers.previousOldest : t.answers.previous}</a>}
          <span>{format(t.answers.pageOf, { page: data.page })}</span>
          {data.page < pages && <a className="button quiet small" href={link(data.page + 1)}>{sort ? t.answers.nextOldest : t.answers.next}</a>}
        </nav>
      )}
    </div>
  );
}
