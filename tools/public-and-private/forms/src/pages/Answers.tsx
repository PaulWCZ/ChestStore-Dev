import { Island } from "@argentic/chest-app";
import { EmptyState, Tabs } from "@argentic/chest-ui/components";
import { Download, Zip } from "../components/icons.tsx";
import type { ReactNode } from "react";
import { dayWords, format, plural, when, type Catalogue } from "../i18n/index.ts";
import { anonymousTexts, followStates, listAnswers } from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import { open } from "../lib/forms.ts";
import { nameOf, people } from "../lib/people.ts";
import { seen } from "../lib/tell.ts";
import type { AnswerRow } from "../islands/AnswersTable.tsx";
import { answerText } from "../shared/logic.ts";
import { limits, readIn, withOptions } from "../shared/model.ts";
import { columnsOf, optionLabels } from "../shared/summary.ts";
import { zonedParts } from "../shared/zone.ts";
import type { Ctx } from "./context.ts";
import { FormFrame } from "./form-frame.tsx";

// The Answers tab's two views, the kit's link tabs: the answers
// themselves, and their summary.
export function AnswersSwitch({ base, current, t }: { base: string; current: "list" | "summary"; t: Catalogue }) {
  return <Tabs className="view-switch" items={[{ id: "list", label: t.answers.viewList, href: `${base}/answers` }, { id: "summary", label: t.answers.viewSummary, href: `${base}/summary` }]} current={current} label={t.answers.views} />;
}

// What a list or an answer reads of the address: the search, the
// filters, the order, the columns.
export function filterOf(query: (name: string) => string | undefined) {
  const where = query("where") ?? "";
  const [question, option] = where.split(":");
  return { q: query("q") ?? "", where, question, option, status: query("status") ?? "", from: query("from") ?? "", to: query("to") ?? "", sort: query("sort") === "oldest" ? "oldest" : "" };
}

// Answers: the kit's table, searched and filtered — where it stands as
// chips with their counts, a choice, the days; the filters apply at once
// and live in the address —, newest or oldest first (the "When" column),
// the columns chosen; each opens on its own page, 50 a page. Opening it
// clears the member's bell item.
// An anonymous form has no table: its written answers, each on its own,
// shuffled (src/lib/answers.ts anonymousTexts), and the summary.
export async function answersPage({ sql, member, t, lang, zone, param, query }: Ctx) {
  const { form, level } = await open(sql, member, param("id"));
  await seen(sql, form.id, member.id);
  const base = `/chest/forms/${form.id}`;
  const frame = (body: ReactNode) => ({ title: form.draft.title || t.builder.untitled, body: <FormFrame form={form} level={level} tab="answers" t={t} lang={lang}>{body}</FormFrame> });
  const exports = (
    <span className="exports">
      <a className="button quiet small" href={`${base}/export`} download><Download />{form.anonymous ? t.answers.exportSummary : t.answers.export}</a>
      {!form.anonymous && <a className="button quiet small" href={`${base}/archive`} download><Zip />{t.answers.archive}</a>}
    </span>
  );
  const head = <AnswersSwitch base={base} current="list" t={t} />;

  if (form.anonymous) {
    let data;
    try {
      data = await anonymousTexts(sql, member, form.id);
    } catch (error) {
      if (error instanceof AppError && error.code === "too_few") return frame(<div className="answers-page">{head}<EmptyState title={t.answers.floorTitle} body={format(t.answers.floor, { floor: limits.anonymousFloor, count: error.values["count"] ?? 0 })} /></div>);
      throw error;
    }
    return frame(
      <div className="answers-page">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        <div className="answers-bar">{head}<span className="spacer" />{exports}</div>
        <p className="answers-count" role="status">{plural(t.answers.count, data.total, lang)}</p>
        <p className="notice">{t.answers.anonymousRows}</p>
        {data.texts.length === 0 ? <p className="quiet-note">{t.answers.anonymousNoTexts}</p> : (
          <ol className="summary-list">
            {data.texts.map(x => (
              <li key={x.question.id} id={`texts-${x.question.id}`} className="summary-card">
                <h2>{x.question.title}{x.removed && <span className="tag">{t.summary.removed}</span>}</h2>
                <p className="hint">{plural(t.summary.answered, x.count, lang)}</p>
                {x.texts.length > 0 && <ul className="texts">{x.texts.map((text, i) => <li key={i}>{text}</li>)}</ul>}
                {x.count > x.texts.length && <p className="hint">{format(t.answers.textsMore, { shown: x.texts.length, count: x.count })}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>,
    );
  }

  const f = filterOf(query);
  const listed = await listAnswers(sql, member, form.id, { q: f.q, question: f.question, option: f.option, status: f.status, from: f.from, to: f.to, sort: f.sort, page: query("page") }, zone);
  // The questions in the member's language when the form has it.
  const versions = new Map([...listed.versions].map(([n, d]) => [n, readIn(d, lang)]));
  const draft = readIn(form.draft, lang);
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const every = columnsOf(versions, draft).filter(c => !c.removed);
  // The columns chosen (comma-separated in the address).
  const chosen = (query("cols") ?? "").split(",").filter(c => every.some(x => x.question.id === c));
  const columns = chosen.length > 0 ? every.filter(c => chosen.includes(c.question.id)) : every.slice(0, 4);
  const labels = optionLabels(versions);
  const filterable = columnsOf(versions, draft).filter(c => withOptions(c.question.kind) || c.question.kind === "yesno");
  const who = await people(listed.answers.flatMap(a => (a.respondent ? [a.respondent] : [])));
  const pages = Math.max(1, Math.ceil(listed.matching / limits.page));
  const keep: Record<string, string> = { ...(f.q ? { q: f.q } : {}), ...(f.where ? { where: f.where } : {}), ...(f.status ? { status: f.status } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.sort ? { sort: f.sort } : {}), ...(chosen.length ? { cols: chosen.join(",") } : {}) };
  const kept = new URLSearchParams(keep);
  const link = (page: number) => { const x = new URLSearchParams(keep); x.set("page", String(page)); return `${base}/answers?${x}`; };
  const unsorted = new URLSearchParams(keep);
  unsorted.delete("sort");
  const filters = f.q || f.where || f.status || f.from || f.to;
  type One = (typeof listed.answers)[number];
  const whoOf = (a: One) => (a.respondent ? (a.respondent === member.id ? t.people.you : nameOf(who.get(a.respondent), lang)) : (a.email ?? t.answers.visitor));
  const whenOf = (a: One) => (a.createdAt ? when(a.createdAt, lang, zone) : dayWords(a.month, lang, { month: "long", year: "numeric" }));
  const cellOf = (a: One, c: (typeof columns)[number]) => {
    const text = answerText({ ...c.question, options: (c.question.options ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })), rows: (c.question.rows ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })) }, a.data[c.question.id], words);
    return text.length > 90 ? text.slice(0, 89) + "…" : text;
  };
  const rows: AnswerRow[] = listed.answers.map(a => ({
    id: a.id,
    when: whenOf(a),
    at: a.createdAt ?? a.month,
    who: whoOf(a),
    email: !a.respondent && a.email ? a.email : null,
    cells: Object.fromEntries(columns.map(c => [c.question.id, cellOf(a, c)])),
    status: a.status,
    statusLabel: t.follow.states[a.status],
    href: `${base}/answers/${a.id}${kept.size ? "?" + kept : ""}`,
    openLabel: `${t.answers.openAnswer}: ${whoOf(a)}, ${whenOf(a)}`,
  }));
  const choices = filterable.map(c => ({
    id: c.question.id,
    title: c.question.title,
    options: c.question.kind === "yesno"
      ? [["yes", t.respond.yes], ["no", t.respond.no]].map(([k, l]) => ({ value: `${c.question.id}:${k}`, label: format(t.answers.filterWhere, { question: c.question.title, option: l! }) }))
      : [...(c.question.options ?? []).map(o => [o.id, labels.get(o.id) ?? o.label] as const), ...(c.question.other ? [["other", t.respond.other] as const] : [])].map(([k, l]) => ({ value: `${c.question.id}:${k}`, label: format(t.answers.filterWhere, { question: c.question.title, option: l }) })),
  }));
  return frame(
    <div className="answers-page">
      <Island name="AutoRefresh" props={{ seconds: 30 }} />
      <div className="answers-bar">{head}<span className="spacer" />{listed.total > 0 && exports}</div>
      {listed.total > 0 && (
        <div className="answers-filters">
          <Island id={`filters-${form.id}`} name="AnswersFilters" props={{
            base: `${base}/answers`,
            keep: Object.fromEntries(Object.entries(keep).filter(([k]) => !["q", "where", "from", "to"].includes(k))),
            q: f.q, where: f.where, from: f.from, to: f.to,
            today: zonedParts(new Date(), zone).day,
            active: [f.where, f.status, f.from, f.to].filter(Boolean).length,
            states: { label: t.follow.label, options: followStates.map(s => ({ value: s, label: t.follow.states[s], count: listed.counts[s] })) },
            questions: choices,
            t: { search: t.answers.search, searchWords: t.kit.search, filterButton: t.answers.filterButton, filterLabel: t.answers.filterLabel, filter: t.answers.filter, filterAll: t.answers.filterAll, from: t.answers.from, to: t.answers.to, date: t.kit.date, filters: t.kit.filters },
          }} />
          {filters && <a className="button link" href={`${base}/answers${chosen.length ? `?cols=${chosen.join(",")}` : ""}`}>{t.kit.filters.clear}</a>}
        </div>
      )}
      <p className="answers-count" role="status">{filters ? plural(t.answers.matching, listed.matching, lang) : plural(t.answers.count, listed.total, lang)}</p>
      {listed.total === 0 ? (
        <EmptyState title={t.answers.none} body={t.answers.noneHint} action={<a className="button" href={`${base}/share`}>{t.tabs.share}</a>} />
      ) : listed.answers.length === 0 ? (
        <p className="quiet-note">{t.answers.noMatch}</p>
      ) : (
        <>
          {every.length > 4 && <Island id={`columns-${form.id}`} name="ColumnsPick" props={{ base: `${base}/answers`, keep: Object.fromEntries(Object.entries(keep).filter(([k]) => k !== "cols")), columns: every.map(c => ({ id: c.question.id, title: c.question.title, on: columns.includes(c) })), label: t.answers.columns }} />}
          <Island id={`table-${form.id}`} name="AnswersTable" props={{
            rows,
            columns: columns.map(c => ({ id: c.question.id, title: c.question.title })),
            sort: f.sort ? "oldest" : "newest",
            sortBase: `${base}/answers${unsorted.size ? "?" + unsorted : ""}`,
            t: { caption: t.answers.title, when: t.answers.when, who: t.answers.who, status: t.follow.label, open: t.answers.open, empty: t.answers.noMatch, table: t.kit.table },
          }} />
        </>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label={format(t.answers.pageOf, { page: listed.page })}>
          {listed.page > 1 && <a className="button quiet small" href={link(listed.page - 1)}>{f.sort ? t.answers.previousOldest : t.answers.previous}</a>}
          <span>{format(t.answers.pageOf, { page: listed.page })}</span>
          {listed.page < pages && <a className="button quiet small" href={link(listed.page + 1)}>{f.sort ? t.answers.nextOldest : t.answers.next}</a>}
        </nav>
      )}
    </div>,
  );
}
