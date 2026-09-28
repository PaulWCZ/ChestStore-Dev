import * as chest from "@argentic/chest-sdk/chest";
import { AutoRefresh } from "../../../../../../components/auto-refresh.tsx";
import { Download, Search } from "../../../../../../components/icons.tsx";

import { listAnswers } from "../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { open } from "../../../../../../lib/forms.ts";
import { format, formatDate, plural } from "../../../../../../lib/i18n/index.ts";
import { answerText } from "../../../../../../lib/logic.ts";
import { limits, withOptions } from "../../../../../../lib/model.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { columnsOf, optionLabels } from "../../../../../../lib/summary.ts";
import { seen } from "../../../../../../lib/tell.ts";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Answers: a table (cards on a phone), searched and filtered, newest first;
// each opens on its own page. Opening it clears the member's bell item.
export default async function AnswersPage({ params, searchParams }: Props) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const sql = db();
  const id = (await params).id;
  const query = await searchParams;
  const q = one(query["q"]) ?? "";
  const where = one(query["where"]) ?? "";
  const [question, option] = where.split(":");
  const { form } = await open(sql, member, id);
  await seen(sql, form.id, member.id);
  let data;
  try {
    data = await listAnswers(sql, member, id, { q, question, option, page: one(query["page"]) });
  } catch (error) {
    if (error instanceof AppError && error.code === "too_few") {
      return (
        <div className="panel-page">
          <div className="empty"><h2>{t.answers.floorTitle}</h2><p>{format(t.answers.floor, { floor: limits.anonymousFloor, count: error.values["count"] ?? 0 })}</p></div>
        </div>
      );
    }
    throw error;
  }
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const columns = columnsOf(data.versions, form.draft).filter(c => !c.removed).slice(0, 4);
  const labels = optionLabels(data.versions);
  const filterable = columnsOf(data.versions, form.draft).filter(c => withOptions(c.question.kind) || c.question.kind === "yesno");
  const who = await people(data.answers.flatMap(a => (a.respondent ? [a.respondent] : [])));
  const zone = chest.timeZone();
  const base = `/chest/forms/${form.id}/answers`;
  const pages = Math.max(1, Math.ceil(data.matching / limits.page));
  const link = (page: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(where ? { where } : {}), page: String(page) })}`;
  const whoOf = (a: (typeof data.answers)[number]) => (form.anonymous ? t.answers.anonymous : a.respondent ? (a.respondent === member.id ? t.people.you : nameOf(who.get(a.respondent), locale)) : (a.email ?? t.answers.visitor));
  const whenOf = (a: (typeof data.answers)[number]) => (a.createdAt ? formatDate(a.createdAt, locale, zone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : formatDate(a.month + "T12:00:00Z", locale, "UTC", { month: "long", year: "numeric" }));
  const cellOf = (a: (typeof data.answers)[number], c: (typeof columns)[number]) => {
    const text = answerText({ ...c.question, options: (c.question.options ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })) }, a.data[c.question.id], words);
    return text.length > 90 ? text.slice(0, 89) + "…" : text;
  };
  return (
    <div className="answers-page">
      <AutoRefresh seconds={30} />
      <div className="answers-bar">
        <form className="answers-filter" method="get" action={base} role="search">
          <label className="search-field">
            <Search />
            <span className="visually-hidden">{t.answers.search}</span>
            <input className="field" type="search" name="q" defaultValue={q} placeholder={t.answers.search} />
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
          <button type="submit" className="button quiet">{t.answers.filter}</button>
        </form>
        <span className="spacer" />
        {data.total > 0 && <a className="button quiet" href={`/chest/forms/${form.id}/export`} download><Download />{t.answers.export}</a>}
      </div>
      <p className="answers-count" role="status">{q || where ? plural(t.answers.matching, data.matching, locale) : plural(t.answers.count, data.total, locale)}</p>
      {data.total === 0 ? (
        <div className="empty"><h2>{t.answers.none}</h2><p>{t.answers.noneHint}</p><a className="button quiet" href={`/chest/forms/${form.id}/share`}>{t.tabs.share}</a></div>
      ) : data.answers.length === 0 ? (
        <p className="quiet-note">{t.answers.noMatch}</p>
      ) : (
        <div className="table-wrap">
          <table className="answers-table">
            <thead>
              <tr>
                <th scope="col">{form.anonymous ? t.csv.month : t.answers.when}</th>
                <th scope="col">{t.answers.who}</th>
                {columns.map(c => <th key={c.question.id} scope="col">{c.question.title}</th>)}
                <th scope="col"><span className="visually-hidden">{t.answers.open}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.answers.map(a => (
                <tr key={a.id}>
                  <td className="nowrap">{whenOf(a)}</td>
                  <td className="who-cell">{whoOf(a)}</td>
                  {columns.map(c => <td key={c.question.id} data-label={c.question.title}>{cellOf(a, c) || <span className="dim">—</span>}</td>)}
                  <td><a className="button small quiet" href={`${base}/${a.id}`} aria-label={`${t.answers.openAnswer}: ${whoOf(a)}, ${whenOf(a)}`}>{t.answers.open}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label={format(t.answers.pageOf, { page: data.page })}>
          {data.page > 1 && <a className="button quiet small" href={link(data.page - 1)}>{t.answers.previous}</a>}
          <span>{format(t.answers.pageOf, { page: data.page })}</span>
          {data.page < pages && <a className="button quiet small" href={link(data.page + 1)}>{t.answers.next}</a>}
        </nav>
      )}
    </div>
  );
}
