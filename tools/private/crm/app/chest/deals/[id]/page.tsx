import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Back, Building, Person } from "../../../../components/icons.tsx";
import { can, canEditDeal } from "../../../../lib/access.ts";
import { timeline } from "../../../../lib/activities.ts";
import { db } from "../../../../lib/db.ts";
import { deal as readDeal } from "../../../../lib/deals.ts";
import { AppError } from "../../../../lib/errors.ts";
import { format, formatDate, formatDay, money } from "../../../../lib/i18n/index.ts";
import { amountInput } from "../../../../lib/amount.ts";
import { today } from "../../../../lib/model.ts";
import { formChoices, withWhen } from "../../../../lib/page-data.ts";
import { directory } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { Composer } from "../../ui/composer.tsx";
import { StepBox } from "../../ui/step-box.tsx";
import { Timeline } from "../../ui/timeline.tsx";
import { DealControls } from "./controls.tsx";

// One deal: where it stands (its stage, one click to the next), what comes
// next, and everything that happened. Its owner or a manager changes it.
export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const d = await readDeal(sql, member, id).catch(e => { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; });
  const [items, choices] = await Promise.all([timeline(sql, { dealId: d.id }), formChoices(sql, member, t)]);
  const people = await directory([d.owner, d.step?.owner, ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : []))], locale);
  const editable = canEditDeal(member, d);
  const stage = choices.stages.find(s => s.id === d.stageId)!;
  const now = today();
  const ownerName = people[d.owner ?? ""]?.name ?? t.common.unassigned;
  return (
    <main className="page record">
      <AutoRefresh seconds={45} />
      <nav className="crumbs"><Link prefetch={false} href="/chest/deals"><Back />{t.shell.deals}</Link></nav>
      <div className="record-head">
        <p className="label-mono">{choices.stageNames[stage.id]} · {format(t.deal.probability, { percent: stage.probability })}</p>
        <h1>{d.title}</h1>
        <p className="record-links">
          {d.company && <Link prefetch={false} href={`/chest/companies/${d.company.id}`}><Building />{d.company.name}</Link>}
          {d.contact && <Link prefetch={false} href={`/chest/contacts/${d.contact.id}`}><Person />{d.contact.name}</Link>}
        </p>
        <p className="value-big num">{money(d.value, locale, { cents: d.value % 100 !== 0 })}</p>
        {stage.kind !== "open" && d.closedAt && (
          <p className={`closed-note ${stage.kind}`}>
            {format(stage.kind === "won" ? t.deal.wonOn : t.deal.lostOn, { date: formatDate(d.closedAt, locale) })}{d.reason ? ` — ${d.reason}` : ""}
          </p>
        )}
      </div>
      <DealControls
        deal={{ id: d.id, title: d.title, stageId: d.stageId, owner: d.owner, company: d.company?.id ?? null, contact: d.contact?.id ?? null, value: amountInput(d.value), expectedClose: d.expectedClose ?? "" }}
        stages={choices.stages.map(s => ({ id: s.id, name: choices.stageNames[s.id]!, kind: s.kind, probability: s.probability }))}
        editable={editable}
        canCreate={can(member, "deals.create")}
        companies={choices.companies}
        contacts={choices.contacts}
        stageChoices={choices.stageChoices}
        team={choices.team}
        me={member.id}
        canAssign={choices.canAssign}
        t={t}
      />
      {!editable && <p className="notice">{can(member, "deals.create") ? format(t.deal.readOnly, { name: ownerName }) : t.deal.readOnlyViewer}</p>}
      <div className="record-grid">
        <div className="record-main">
          <StepBox step={d.step} dueLabel={d.step ? formatDay(d.step.due, locale, { weekday: "short", day: "numeric", month: "short" }) : null} on={{ deal: d.id }} team={choices.team} people={people} me={member.id} canEdit={editable} canAssign={choices.canAssign} today={now} locale={locale} t={t} />
          {can(member, "activities.log") ? <Composer on={{ deal: d.id }} t={t} /> : <p className="muted">{t.log.readOnly}</p>}
          <h2 className="label-mono section-gap">{t.timeline.title}</h2>
          <Timeline items={withWhen(items, locale)} people={people} stageNames={choices.stageNames} me={member.id} canRemoveAny={can(member, "deals.all")} canLog={can(member, "activities.log")} context="deal" locale={locale} t={t} />
        </div>
        <aside className="record-side">
          <dl className="facts">
            <div><dt>{t.deal.value}</dt><dd className="num">{money(d.value, locale, { cents: true })}</dd></div>
            <div><dt>{t.deal.stage}</dt><dd><span className={`stage-chip ${stage.kind}`}>{choices.stageNames[stage.id]}</span></dd></div>
            <div><dt>{t.deal.close}</dt><dd className="num">{d.expectedClose ? formatDay(d.expectedClose, locale, { day: "numeric", month: "long", year: "numeric" }) : <span className="muted">{t.deal.noClose}</span>}</dd></div>
            <div><dt>{t.deal.owner}</dt><dd>{ownerName}</dd></div>
            <div><dt>{t.deal.company}</dt><dd>{d.company ? <Link prefetch={false} href={`/chest/companies/${d.company.id}`}>{d.company.name}</Link> : <span className="muted">{t.deal.noCompany}</span>}</dd></div>
            <div><dt>{t.deal.contact}</dt><dd>{d.contact ? <Link prefetch={false} href={`/chest/contacts/${d.contact.id}`}>{d.contact.name}</Link> : <span className="muted">{t.deal.noContact}</span>}</dd></div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
