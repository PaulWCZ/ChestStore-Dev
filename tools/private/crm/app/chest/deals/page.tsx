import Link from "next/link";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Download, ListIcon, Pipeline } from "../../../components/icons.tsx";
import { can, canEditDeal } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { boardClosedDays, boardDeals, listDeals, type DealFilter } from "../../../lib/deals.ts";
import { format, formatDay, money, plural } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { formChoices } from "../../../lib/page-data.ts";
import { directory } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { NewDealButton } from "../ui/deal-form.tsx";
import { DealBoard } from "./board.tsx";
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
  const filter: DealFilter = {
    owner,
    stage: one(params["stage"]),
    closing: one(params["closing"]) === "month" ? "month" : "",
    status: (["open", "won", "lost"] as const).find(s => s === one(params["status"])) ?? (one(params["status"]) === "any" ? "" : view === "list" ? "open" : ""),
    q: one(params["q"]),
  };
  const sql = db();
  const now = today();
  const choices = await formChoices(sql, member, t);
  const newDeal = { title: "", company: null, contact: null, value: "", stage: choices.stageChoices[0]?.id ?? "", expectedClose: "", owner: member.id };
  const dealProps = { companies: choices.companies, contacts: choices.contacts, stages: choices.stageChoices.filter(s => choices.stages.find(x => x.id === s.id)?.kind === "open"), team: choices.team, me: member.id, canAssign: choices.canAssign, t };
  const query = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ owner, stage: String(filter.stage ?? ""), closing: filter.closing ?? "", status: one(params["status"]), q: String(filter.q ?? ""), ...extra }).filter(([, x]) => x !== ""));
    return p.size ? "?" + p.toString() : "";
  };

  const head = (
    <div className="page-head">
      <div>
        <h1>{t.deals.title}</h1>
      </div>
      <nav className="segmented" aria-label={t.deals.views}>
        <Link prefetch={false} href={`/chest/deals${query({ view: "", status: "", stage: "", closing: "" })}`} aria-current={view === "board" ? "page" : undefined}><Pipeline />{t.deals.board}</Link>
        <Link prefetch={false} href={`/chest/deals${query({ view: "list" })}`} aria-current={view === "list" ? "page" : undefined}><ListIcon />{t.deals.list}</Link>
      </nav>
      {can(member, "deals.create") && <NewDealButton label={t.deals.new} initial={newDeal} {...dealProps} />}
    </div>
  );

  if (view === "board") {
    const deals = await boardDeals(sql, member, { owner });
    const people = await directory(deals.map(d => d.owner), locale);
    return (
      <main className="page wide">
        <AutoRefresh seconds={30} />
        {head}
        <Filters view="board" owner={owner} stage="" closing="" status="" team={choices.team} me={member.id} stages={choices.stageChoices} t={t} />
        {!can(member, "deals.create") && <p className="notice">{t.deals.readOnly}</p>}
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
      </main>
    );
  }

  const { rows, total, value } = await listDeals(sql, member, filter, 500, now);
  const people = await directory(rows.map(d => d.owner), locale);
  const probability = new Map(choices.stages.map(s => [s.id, s.probability]));
  const kind = new Map(choices.stages.map(s => [s.id, s.kind]));
  const filtered = owner !== "" || filter.stage !== "" || filter.closing !== "" || one(params["status"]) !== "" || filter.q !== "";
  return (
    <main className="page wide">
      {head}
      <Filters view="list" owner={owner} stage={String(filter.stage ?? "")} closing={filter.closing ?? ""} status={one(params["status"])} team={choices.team} me={member.id} stages={choices.stageChoices} t={t} />
      <div className="list-summary">
        <span className="num">{plural(t.deals.count, total, locale)} · {money(value, locale)}</span>
        <a className="link-button" href={`/chest/export/deals${query({})}`} download><Download />{t.common.exportCsv}</a>
      </div>
      {rows.length === 0 ? (
        <div className="empty small">
          <h2>{filtered ? t.deals.emptyFiltered : t.deals.empty}</h2>
          {!filtered && <p>{t.deals.emptyBody}</p>}
          {filtered && <Link prefetch={false} className="button quiet" href="/chest/deals?view=list">{t.common.clear}</Link>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t.deals.listTitle}</th>
                <th scope="col" className="hide-phone">{t.deals.listCompany}</th>
                <th scope="col" className="right">{t.deals.listValue}</th>
                <th scope="col">{t.deals.listStage}</th>
                <th scope="col" className="right hide-phone">{t.deals.listProbability}</th>
                <th scope="col" className="hide-phone">{t.deals.listClose}</th>
                <th scope="col" className="hide-phone">{t.deals.listOwner}</th>
                <th scope="col" className="hide-phone">{t.deals.listStep}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => {
                const late = d.step && d.step.due < now;
                const k = kind.get(d.stageId);
                return (
                  <tr key={d.id}>
                    <td><Link prefetch={false} className="strong" href={`/chest/deals/${d.id}`}>{d.title}</Link><span className="show-phone muted small-text">{d.company?.name}</span></td>
                    <td className="hide-phone">{d.company ? <Link prefetch={false} href={`/chest/companies/${d.company.id}`}>{d.company.name}</Link> : <span className="muted">—</span>}</td>
                    <td className="right num">{money(d.value, locale)}</td>
                    <td><span className={`stage-chip ${k}`}>{choices.stageNames[d.stageId]}</span></td>
                    <td className="right num hide-phone">{probability.get(d.stageId)}%</td>
                    <td className="num hide-phone">{d.expectedClose ? formatDay(d.expectedClose, locale, { day: "numeric", month: "short", year: "numeric" }) : <span className="muted">—</span>}</td>
                    <td className="hide-phone">{people[d.owner ?? ""]?.name ?? <span className="muted">{t.common.unassigned}</span>}</td>
                    <td className="hide-phone">{d.step ? <span className={late ? "due late" : ""}>{d.step.text} · <span className="num">{formatDay(d.step.due, locale)}</span></span> : <span className="muted">{k === "open" ? t.deals.noStep : "—"}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length < total && <p className="muted small-text">{format(t.common.showing, { shown: rows.length, total })}</p>}
        </div>
      )}
    </main>
  );
}
