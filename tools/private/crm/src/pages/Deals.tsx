import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, Segmented } from "@argentic/chest-ui/components";
import type { BoardDeal } from "../components/board.tsx";
import type { DealRow } from "../components/deal-table.tsx";
import { ListIcon, Pipeline } from "../components/icons.tsx";
import { emptyDeal } from "../components/values.ts";
import { formatDay, money, plural, localeOf } from "../i18n/index.ts";
import { can, canEditDeal } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { boardClosedDays, boardDeals, listDeals, type DealFilter } from "../lib/deals.ts";
import { fieldFilterOf } from "../lib/fields.ts";
import { currency, dealFormProps, dueLabel, formChoices } from "../lib/page-data.ts";
import { directory } from "../lib/people.ts";
import { today } from "../lib/zone.ts";
import { Pager } from "./parts.tsx";
import { words } from "./words.ts";

// The deals: a board by stage (drag a deal to its next stage) or a list to
// filter, give many to someone and export. Won and lost deals stay on the
// board 30 days.
export async function dealsPage({ member, locale: lang, t, query }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const one = (key: string) => query(key) ?? "";
  const view = one("view") === "list" ? "list" : "board";
  const owner = one("owner");
  const field = fieldFilterOf(one);
  const filter: DealFilter = {
    ...(field && view === "list" ? { field } : {}),
    owner,
    stage: one("stage"),
    closing: one("closing") === "month" ? "month" : "",
    status: (["open", "won", "lost"] as const).find(s => s === one("status")) ?? (one("status") === "any" ? "" : view === "list" ? "open" : ""),
    q: one("q"),
  };
  const sql = db();
  const now = today();
  const cur = currency();
  const choices = await formChoices(sql, member, t);
  const newDeal = { initial: emptyDeal(member.id, choices.openStages[0]?.id ?? ""), ...dealFormProps(choices, member.id), t: words.deal(t) };
  const kept: Record<string, string> = Object.fromEntries(Object.entries({ owner, stage: String(filter.stage ?? ""), closing: filter.closing ?? "", status: one("status"), q: String(filter.q ?? ""), cf: one("cf"), cv: one("cv"), cmin: one("cmin"), cmax: one("cmax") }).filter(([, x]) => x !== ""));
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...kept, ...extra }).filter(([, x]) => x !== ""));
    return `/chest/deals${p.size ? "?" + p.toString() : ""}`;
  };
  const address = { path: "/chest/deals", query: { ...kept, ...(view === "list" ? { view } : {}) } };

  // An empty board (nothing filtered) has one way in: its own "New deal".
  const boardList = view === "board" ? await boardDeals(sql, member, { owner }) : [];
  const emptyBoard = view === "board" && owner === "" && boardList.length === 0;
  const head = (
    <div className="page-head">
      <div>
        <h1>{t.deals.title}</h1>
      </div>
      {/* Board or list: each view has its own address — the kit's
          segmented choice as links (the current one aria-current). */}
      <Segmented label={t.deals.views} value={view}
        options={[
          { value: "board", label: t.deals.board, icon: <Pipeline />, href: href({ status: "", stage: "", closing: "", cf: "", cv: "", cmin: "", cmax: "" }) },
          { value: "list", label: t.deals.list, icon: <ListIcon />, href: href({ view: "list" }) },
        ]} />
      {can(member, "deals.create") && !emptyBoard && <Island name="NewDealButton" props={{ label: t.deals.new, ...newDeal }} />}
    </div>
  );

  if (view === "board") {
    const deals = boardList;
    const people = await directory(deals.map(d => d.owner), locale);
    const year = now.slice(0, 4);
    const stages = choices.stages.map(s => ({ id: s.id, name: choices.stageNames[s.id]!, kind: s.kind, probability: s.probability, total: money(deals.filter(d => d.stageId === s.id).reduce((n, d) => n + d.value, 0), locale, { currency: cur }) }));
    const cards: BoardDeal[] = deals.map(d => {
      const step = d.step;
      const state = !step ? "none" : step.due < now ? "late" : step.due === now ? "today" : "planned";
      return {
        id: d.id, title: d.title, stageId: d.stageId, value: d.value, valueText: money(d.value, locale, { currency: d.currency }),
        company: d.company?.name ?? null, closeLabel: d.expectedClose ? formatDay(d.expectedClose, locale, { day: "numeric", month: "short" }, year) : null,
        owner: d.owner, open: d.closedAt === null, state, stateLabel: state === "none" ? t.deals.noStep : state === "late" ? t.deals.stepLate : state === "today" ? t.deals.stepToday : step!.text,
        editable: canEditDeal(member, d),
      };
    });
    return {
      title: t.deals.title,
      body: (
        <div className="page wide">
          <Island name="AutoRefresh" props={{ seconds: 30 }} />
          {head}
          {!emptyBoard && <Island name="DealFilters" props={{ address, view: "board", owner, stage: "", closing: "", status: "", team: choices.team, me: member.id, stages: choices.stageChoices, fields: [], today: now, t: words.dealFilters(t) }} />}
          {!can(member, "deals.create") && <p className="notice">{t.deals.readOnly}</p>}
          {deals.length === 0 ? (
            <EmptyState
              title={owner ? t.deals.emptyFiltered : t.deals.empty}
              body={owner ? undefined : can(member, "deals.create") ? t.deals.emptyBoardAction : t.deals.emptyBody}
              action={!owner && can(member, "deals.create") ? <Island name="NewDealButton" props={{ label: t.deals.new, ...newDeal }} /> : undefined}
            />
          ) : (
            <>
              <p className="legend" aria-label={t.deals.legendLabel}>
                <span className="label-mono">{t.deals.legendLabel}</span>
                {(["late", "today", "planned", "none"] as const).map(k => <span key={k}><span className={`dot ${k}`} aria-hidden="true" />{t.deals.legend[k]}</span>)}
              </p>
              <Island name="DealBoard" id="island-deal-board" props={{ stages, deals: cards, people, me: member.id, closedDays: boardClosedDays, currency: cur, locale, t: words.board(t) }} />
            </>
          )}
        </div>
      ),
    };
  }

  const { rows, total, value, page, pageSize } = await listDeals(sql, member, filter, 200, now, one("page"));
  const people = await directory(rows.map(d => d.owner), locale);
  const probability = new Map(choices.stages.map(s => [s.id, s.probability]));
  const kind = new Map(choices.stages.map(s => [s.id, s.kind]));
  const filtered = owner !== "" || filter.stage !== "" || filter.closing !== "" || one("status") !== "" || filter.q !== "" || field !== undefined;
  const writes = can(member, "deals.create");
  const year = now.slice(0, 4);
  const exportQuery = new URLSearchParams(kept).toString();
  const list: DealRow[] = rows.map(d => {
    const k = kind.get(d.stageId) ?? "open";
    return {
      id: d.id,
      title: d.title,
      company: d.company ? { id: d.company.id, name: d.company.name } : null,
      value: money(d.value, locale, { currency: d.currency }),
      stage: choices.stageNames[d.stageId] ?? "",
      kind: k,
      probability: `${probability.get(d.stageId) ?? 0}%`,
      close: d.expectedClose ? formatDay(d.expectedClose, locale, { day: "numeric", month: "short" }, year) : null,
      owner: people[d.owner ?? ""]?.name ?? t.common.unassigned,
      step: d.step ? { text: `${d.step.text} · ${dueLabel(d.step, now, locale, t)}${d.steps > 1 ? ` · +${d.steps - 1}` : ""}`, late: d.step.due < now } : null,
      noStep: k === "open" ? t.deals.noStep : "—",
    };
  });
  return {
    title: t.deals.title,
    body: (
      <div className="page wide">
        {head}
        <Island name="DealFilters" props={{ address, view: "list", owner, stage: String(filter.stage ?? ""), closing: filter.closing ?? "", status: one("status"), team: choices.team, me: member.id, stages: choices.stageChoices, fields: choices.fields.deals, today: now, t: words.dealFilters(t) }} />
        <Island name="DealList" id="island-deal-list" props={{
          rows: list, writes, team: choices.team, me: member.id, canAssign: choices.canAssign, locale, labels: t.table, t: words.owner(t),
          words: { caption: t.deals.title, select: t.common.bulk.selectColumn, selectOne: t.common.bulk.select, title: t.deals.listTitle, company: t.deals.listCompany, value: t.deals.listValue, stage: t.deals.listStage, probability: t.deals.listProbability, close: t.deals.listClose, owner: t.deals.listOwner, step: t.deals.listStep },
          summary: { text: `${plural(t.deals.count, total, locale)} · ${money(value, locale, { currency: cur })}`, exportHref: `/chest/export/deals${exportQuery ? "?" + exportQuery : ""}`, exportLabel: t.common.exportCsv },
        }} />
        {rows.length === 0 && (
          <EmptyState
            title={filtered ? t.deals.emptyFiltered : t.deals.empty}
            body={filtered ? undefined : t.deals.emptyBody}
            action={filtered ? <a className="button quiet" href="/chest/deals?view=list">{t.common.clear}</a> : undefined}
          />
        )}
        <Pager path="/chest/deals" params={{ view: "list", ...kept }} page={page} pageSize={pageSize} total={total} locale={locale} t={t} />
      </div>
    ),
  };
}
