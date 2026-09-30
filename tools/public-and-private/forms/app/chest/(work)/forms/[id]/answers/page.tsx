import { chest } from "@argentic/chest-sdk/chest";
import { EmptyState, Filters, SearchBox } from "@argentic/chest-ui/components";
import { AutoRefresh } from "../../../../../../components/auto-refresh.tsx";
import { Down, Download, Zip } from "../../../../../../components/icons.tsx";
import { anonymousTexts, followStates, listAnswers } from "../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { format, formatDate, plural } from "../../../../../../lib/i18n/index.ts";
import { answerText } from "../../../../../../lib/logic.ts";
import { limits, readIn, withOptions } from "../../../../../../lib/model.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { formOr404 } from "../../../../../../lib/pages.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { columnsOf, optionLabels } from "../../../../../../lib/summary.ts";
import { seen } from "../../../../../../lib/tell.ts";
import { zonedParts } from "../../../../../../lib/zone.ts";
import { AnswersSwitch } from "../answers-switch.tsx";
import { AnswersTable, FilterDates, type AnswerRow } from "./answers-table.tsx";
import { AutoFilter } from "./auto-filter.tsx";
import { FilterFold } from "./filter-fold.tsx";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

// Answers: the kit's table, searched (the kit's search box, "/") and
// filtered — where it stands as chips with their counts, a choice, the
// days; the filters apply at once and live in the address —, newest or
// oldest first (the "When" column), the columns chosen; each opens on its
// own page. Opening it clears the member's bell item.
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
  const zone = chest.timeZone;
  const exports = (
    <span className="exports">
      <a className="button quiet small" href={`${base}/export`} download><Download />{form.anonymous ? t.answers.exportSummary : t.answers.export}</a>
      {!form.anonymous && <a className="button quiet small" href={`${base}/archive`} download><Zip />{t.answers.archive}</a>}
    </span>
  );
  const head = <AnswersSwitch base={base} current="list" list={t.answers.viewList} summary={t.answers.viewSummary} label={t.answers.views} />;

  if (form.anonymous) {
    let data;
    try {
      data = await anonymousTexts(sql, member, id);
    } catch (error) {
      if (error instanceof AppError && error.code === "too_few") {
        return (
          <div className="answers-page">
            {head}
            <EmptyState title={t.answers.floorTitle} body={format(t.answers.floor, { floor: limits.anonymousFloor, count: error.values["count"] ?? 0 })} />
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
  const listed = await listAnswers(sql, member, id, { q, question, option, status, from, to, sort, page: one(query["page"]) }, zone);
  // The questions in the member's language when the form has it.
  const data = { ...listed, versions: new Map([...listed.versions].map(([n, d]) => [n, readIn(d, locale)])) };
  const draft = readIn(form.draft, locale);
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const every = columnsOf(data.versions, draft).filter(c => !c.removed);
  // The columns chosen: the checkboxes' form repeats "cols", the other
  // links keep them comma-separated.
  const chosen = many(query["cols"]).flatMap(c => c.split(",")).filter(c => every.some(x => x.question.id === c));
  const columns = chosen.length > 0 ? every.filter(c => chosen.includes(c.question.id)) : every.slice(0, 4);
  const labels = optionLabels(data.versions);
  const filterable = columnsOf(data.versions, draft).filter(c => withOptions(c.question.kind) || c.question.kind === "yesno");
  const who = await people(data.answers.flatMap(a => (a.respondent ? [a.respondent] : [])));
  const pages = Math.max(1, Math.ceil(data.matching / limits.page));
  const keep = new URLSearchParams({ ...(q ? { q } : {}), ...(where ? { where } : {}), ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(sort ? { sort } : {}), ...(chosen.length ? { cols: chosen.join(",") } : {}) });
  const link = (page: number) => { const x = new URLSearchParams(keep); x.set("page", String(page)); return `${base}/answers?${x}`; };
  const unsorted = new URLSearchParams(keep);
  unsorted.delete("sort");
  const filters = q || where || status || from || to;
  const whoOf = (a: (typeof data.answers)[number]) => (a.respondent ? (a.respondent === member.id ? t.people.you : nameOf(who.get(a.respondent), locale)) : (a.email ?? t.answers.visitor));
  const whenOf = (a: (typeof data.answers)[number]) => (a.createdAt ? formatDate(a.createdAt, locale, zone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : formatDate(a.month + "T12:00:00Z", locale, "UTC", { month: "long", year: "numeric" }));
  const cellOf = (a: (typeof data.answers)[number], c: (typeof columns)[number]) => {
    const text = answerText({ ...c.question, options: (c.question.options ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })), rows: (c.question.rows ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })) }, a.data[c.question.id], words);
    return text.length > 90 ? text.slice(0, 89) + "…" : text;
  };
  const answerLink = (a: (typeof data.answers)[number]) => `${base}/answers/${a.id}${keep.size ? "?" + keep : ""}`;
  const rows: AnswerRow[] = data.answers.map(a => ({
    id: a.id,
    when: whenOf(a),
    at: a.createdAt ?? a.month,
    who: whoOf(a),
    email: !a.respondent && a.email ? a.email : null,
    cells: Object.fromEntries(columns.map(c => [c.question.id, cellOf(a, c)])),
    status: a.status,
    statusLabel: t.follow.states[a.status],
    href: answerLink(a),
    openLabel: `${t.answers.openAnswer}: ${whoOf(a)}, ${whenOf(a)}`,
  }));
  const today = zonedParts(new Date(), zone).day;
  return (
    <div className="answers-page">
      <AutoRefresh seconds={30} />
      <div className="answers-bar">{head}<span className="spacer" />{data.total > 0 && exports}</div>
      {data.total > 0 && (
        <div className="answers-filters">
          <SearchBox action={`${base}/answers`} value={q} maxLength={100} keep={Object.fromEntries([...keep].filter(([k]) => k !== "q"))} labels={{ ...t.search, label: t.answers.search, placeholder: t.answers.search }} />
          <FilterFold active={[where, status, from, to].filter(Boolean).length} label={t.answers.filterButton}>
          <Filters path={`${base}/answers`} params={keep} labels={t.filters}
            groups={[{ key: "status", label: t.follow.label, all: true, options: followStates.map(s => ({ value: s, label: t.follow.states[s], count: data.counts[s] })) }]} />
          <AutoFilter action={`${base}/answers`} className="answers-filter" label={t.answers.filterLabel}>
            {[...keep].filter(([k]) => !["where", "from", "to"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {filterable.length > 0 && (
              <label className="mini">
                <span className="mini-label">{t.answers.filter}</span>
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
            <FilterDates from={from} to={to} today={today} t={{ from: t.answers.from, to: t.answers.to, date: t.date }} />
          </AutoFilter>
          </FilterFold>
          {filters && <a className="button link" href={`${base}/answers${chosen.length ? `?cols=${chosen.join(",")}` : ""}`}>{t.filters.clear}</a>}
        </div>
      )}
      <p className="answers-count" role="status">{filters ? plural(t.answers.matching, data.matching, locale) : plural(t.answers.count, data.total, locale)}</p>
      {data.total === 0 ? (
        <EmptyState title={t.answers.none} body={t.answers.noneHint} action={<a className="button" href={`${base}/share`}>{t.tabs.share}</a>} />
      ) : data.answers.length === 0 ? (
        <p className="quiet-note">{t.answers.noMatch}</p>
      ) : (
        <>
          {every.length > 4 && (
            <details className="columns-pick">
              {/* A control that says it opens: a button's look, a chevron. */}
              <summary><span>{t.answers.columns}</span><span className="chevron" aria-hidden="true"><Down /></span></summary>
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
          <AnswersTable
            rows={rows}
            columns={columns.map(c => ({ id: c.question.id, title: c.question.title }))}
            sort={sort ? "oldest" : "newest"}
            sortBase={`${base}/answers${unsorted.size ? "?" + unsorted : ""}`}
            t={{ caption: t.answers.title, when: t.answers.when, who: t.answers.who, status: t.follow.label, open: t.answers.open, empty: t.answers.noMatch, table: t.table }}
          />
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
