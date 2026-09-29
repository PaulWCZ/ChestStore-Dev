import { EmptyState, Segmented } from "@argentic/chest-ui/components";
import { Link } from "../../../components/link.tsx";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Download, ListIcon, Pipeline } from "../../../components/icons.tsx";
import { can, canEditDeal } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { boardClosedDays, boardDeals, listDeals, type DealFilter } from "../../../lib/deals.ts";
import { formatDay, money, plural } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { fieldFilterOf } from "../../../lib/fields.ts";
import { dealFormProps, dueLabel, formChoices } from "../../../lib/page-data.ts";
import { directory } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { BulkBar, BulkProvider } from "../ui/bulk.tsx";
import { NewDealButton } from "../ui/deal-form.tsx";
import { Pager } from "../ui/pager.tsx";
import { emptyDeal } from "../ui/values.ts";
import { DealBoard } from "./board.tsx";
import { DealTable } from "./deal-table.tsx";
import { Filters } from "./filters.tsx";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// The deals: a board by stage (drag a deal to its next stage) or a list to
// filter and export. Won and lost deals stay on the board 30 days.
export default async function Deals({ searchParams }: { searchParams: Search }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const view = one(params["view"]) === "list" ? "list" : "board";
  const owner = one(params["owner"]);
  const field = fieldFilterOf(key => one(params[key]));
  const filter: DealFilter = {
    ...(field && view === "list" ? { field } : {}),
    owner,
    stage: one(params["stage"]),
    closing: one(params["closing"]) === "month" ? "month" : "",
    status: (["open", "won", "lost"] as const).find(s => s === one(params["status"])) ?? (one(params["status"]) === "any" ? "" : view === "list" ? "open" : ""),
    q: one(params["q"]),
  };
  const sql = db();
  const now = today();
  const choices = await formChoices(sql, member, t);
  const newDeal = emptyDeal(member.id, choices.openStages[0]?.id ?? "");
  const dealProps = dealFormProps(choices, member.id, t);
  const kept = { owner, stage: String(filter.stage ?? ""), closing: filter.closing ?? "", status: one(params["status"]), q: String(filter.q ?? ""), cf: one(params["cf"]), cv: one(params["cv"]), cmin: one(params["cmin"]), cmax: one(params["cmax"]) };
  const query = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...kept, ...extra }).filter(([, x]) => x !== ""));
    return p.size ? "?" + p.toString() : "";
  };

  const head = (
    <div className="page-head">
      <div>
        <h1>{t.deals.title}</h1>
      </div>
      {/* Board or list: each view has its own address — the kit's
          segmented choice as links (the current one aria-current). */}
      <Segmented label={t.deals.views} value={view} link={Link}
        options={[
          { value: "board", label: t.deals.board, icon: <Pipeline />, href: `/chest/deals${query({ view: "", status: "", stage: "", closing: "", cf: "", cv: "", cmin: "", cmax: "" })}` },
          { value: "list", label: t.deals.list, icon: <ListIcon />, href: `/chest/deals${query({ view: "list" })}` },
        ]} />
      {can(member, "deals.create") && <NewDealButton label={t.deals.new} initial={newDeal} {...dealProps} />}
    </div>
  );

  if (view === "board") {
    const deals = await boardDeals(sql, member, { owner });
    const people = await directory(deals.map(d => d.owner), locale);
    return (
      <div className="page wide">
        <AutoRefresh seconds={30} />
        {head}
        <Filters view="board" owner={owner} stage="" closing="" status="" team={choices.team} me={member.id} stages={choices.stageChoices} fields={[]} today={now} t={t} />
        {!can(member, "deals.create") && <p className="notice">{t.deals.readOnly}</p>}
        {deals.length === 0 ? (
          <EmptyState
            title={owner ? t.deals.emptyFiltered : t.deals.empty}
            body={owner ? undefined : can(member, "deals.create") ? t.deals.emptyBoardAction : t.deals.emptyBody}
            action={!owner && can(member, "deals.create") ? <NewDealButton label={t.deals.new} initial={newDeal} {...dealProps} /> : undefined}
          />
        ) : (
        <>
        <p className="legend" aria-label={t.deals.legendLabel}>
          <span className="label-mono">{t.deals.legendLabel}</span>
          {(["late", "today", "planned", "none"] as const).map(k => <span key={k}><span className={`dot ${k}`} aria-hidden="true" />{t.deals.legend[k]}</span>)}
        </p>
        <DealBoard
          stages={choices.stages.map(s => ({ id: s.id, name: choices.stageNames[s.id]!, kind: s.kind, probability: s.probability }))}
          deals={deals.map(d => ({ ...d, editable: canEditDeal(member, d), closeLabel: d.expectedClose ? formatDay(d.expectedClose, locale) : null }))}
          people={people}
          me={member.id}
          today={now}
          closedDays={boardClosedDays}
          locale={locale}
          t={t}
        />
        </>
        )}
      </div>
    );
  }

  const { rows, total, value, page, pageSize } = await listDeals(sql, member, filter, 200, now, one(params["page"]));
  const people = await directory(rows.map(d => d.owner), locale);
  const probability = new Map(choices.stages.map(s => [s.id, s.probability]));
  const kind = new Map(choices.stages.map(s => [s.id, s.kind]));
  const filtered = owner !== "" || filter.stage !== "" || filter.closing !== "" || one(params["status"]) !== "" || filter.q !== "" || field !== undefined;
  const writes = can(member, "deals.create");
  return (
    <div className="page wide">
      {head}
      <Filters view="list" owner={owner} stage={String(filter.stage ?? "")} closing={filter.closing ?? ""} status={one(params["status"])} team={choices.team} me={member.id} stages={choices.stageChoices} fields={choices.fields.deals} today={now} t={t} />
      <BulkProvider>
      {writes && <BulkBar table="deals" team={choices.team} me={member.id} canAssign={choices.canAssign} canDelete={false} locale={locale} t={t} />}
      <div className="list-summary">
        <span className="num">{plural(t.deals.count, total, locale)} · {money(value, locale)}</span>
        <a className="link-button" href={`/chest/export/deals${query({})}`} download><Download />{t.common.exportCsv}</a>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? t.deals.emptyFiltered : t.deals.empty}
          body={filtered ? undefined : t.deals.emptyBody}
          action={filtered ? <Link prefetch={false} className="button quiet" href="/chest/deals?view=list">{t.common.clear}</Link> : undefined}
        />
      ) : (
        <DealTable
          writes={writes}
          labels={t.table}
          words={{ caption: t.deals.title, select: t.common.bulk.selectColumn, selectOne: t.common.bulk.select, title: t.deals.listTitle, company: t.deals.listCompany, value: t.deals.listValue, stage: t.deals.listStage, probability: t.deals.listProbability, close: t.deals.listClose, owner: t.deals.listOwner, step: t.deals.listStep }}
          rows={rows.map(d => {
            const k = kind.get(d.stageId) ?? "open";
            return {
              id: d.id,
              title: d.title,
              company: d.company ? { id: d.company.id, name: d.company.name } : null,
              value: money(d.value, locale),
              stage: choices.stageNames[d.stageId] ?? "",
              kind: k,
              probability: `${probability.get(d.stageId) ?? 0}%`,
              close: d.expectedClose ? formatDay(d.expectedClose, locale, { day: "numeric", month: "short", year: "numeric" }) : null,
              owner: people[d.owner ?? ""]?.name ?? t.common.unassigned,
              step: d.step ? { text: `${d.step.text} · ${dueLabel(d.step, now, locale, t)}${d.steps > 1 ? ` · +${d.steps - 1}` : ""}`, late: d.step.due < now } : null,
              noStep: k === "open" ? t.deals.noStep : "—",
            };
          })}
        />
      )}
      </BulkProvider>
      <Pager path="/chest/deals" params={{ view: "list", ...Object.fromEntries(Object.entries(kept).filter(([, x]) => x !== "")) }} page={page} pageSize={pageSize} total={total} locale={locale} t={t} />
    </div>
  );
}
