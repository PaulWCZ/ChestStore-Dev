import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Back } from "../../../../components/icons.tsx";
import { Portrait } from "../../../../components/portrait.tsx";
import { can, ticks } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { everyone, nameOf, people, subjectOf } from "../../../../lib/people.ts";
import { format, formatDate, formatDay } from "../../../../lib/i18n/index.ts";
import { journey as loadJourney, type Journey } from "../../../../lib/journeys.ts";
import { dueState, id as rowId } from "../../../../lib/model.ts";
import { today, zone } from "../../../../lib/zone.ts";
import { viewer } from "../../../../lib/session.ts";
import { JourneyView, type StepView } from "./journey-view.tsx";

// One checklist: the steps before, on and after the day, who does each and
// when; ticked by whoever it is given to (or HR). HR gives a step to
// someone else, moves it, adds or removes one, stops the checklist.
export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  let journey: Journey;
  try {
    journey = await loadJourney(db(), member, rowId(id));
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const hr = can(member, "checklists.manage");
  const who = await people([journey.personId ?? "", ...journey.items.flatMap(i => [i.assignee ?? "", i.doneBy ?? ""])]);
  const subject = subjectOf(journey, who, locale);
  const personName = subject.name;
  // Steps for someone not a member yet wait until the arrival is linked.
  const waiting = (role: string, assignee: string | null) => journey.personId === null && role === "person" && assignee === null;
  const now = today();
  const roleWord = (role: string) => role === "person" ? t.journey.roles.person[journey.kind] : role === "manager" ? t.journey.roles.manager : role === "hr" ? t.journey.roles.hr : "";
  const steps: StepView[] = journey.items.map(i => ({
    id: i.id,
    text: i.text,
    done: i.done,
    due: i.due,
    dueLabel: formatDay(i.due, locale, { weekday: "short", day: "numeric", month: "short" }),
    state: dueState(i.due, now),
    when: i.due < journey.anchor ? "before" : i.due === journey.anchor ? "on" : "after",
    assignee: i.assignee,
    assigneeName: i.assignee ? (i.assignee === member.id ? t.people.you : nameOf(who.get(i.assignee), locale)) : waiting(i.role, i.assignee) ? t.journey.waiting : t.people.nobody,
    waiting: waiting(i.role, i.assignee),
    assigneePhoto: i.assignee ? who.get(i.assignee)?.photo ?? null : null,
    role: waiting(i.role, i.assignee) ? "" : roleWord(i.role),
    doneBy: i.done && i.doneBy && i.doneAt ? format(i.doneBy === member.id ? t.journey.doneByYou : t.journey.doneBy, { name: nameOf(who.get(i.doneBy), locale), date: formatDate(i.doneAt, locale, { day: "numeric", month: "short", timeZone: zone() }) }) : null,
    mine: ticks(member, i),
  }));
  const pickable = hr ? (await everyone()).people.map(p => ({ id: p.id, name: p.name })) : [];
  const done = steps.filter(s => s.done).length;
  return (
    <main className="page narrow">
      <AutoRefresh seconds={30} />
      <Link className="back" href={hr ? "/chest/checklists" : "/chest/todo"}><Back />{hr ? t.checklists.title : t.todo.title}</Link>
      <header className="journey-head">
        <Portrait name={personName} photo={subject.photo} size={96} arch />
        <div>
          <span className="row tags">
            <span className={`kind ${journey.kind}`}>{t.checklists.kinds[journey.kind]}</span>
            {journey.arrivalId && <span className="source">{t.arrivals.fromHiring}</span>}
          </span>
          <h1>{format(journey.kind === "onboarding" ? t.journey.onboarding : t.journey.offboarding, { name: personName })}</h1>
          <p className="muted">{journey.name} · {format(journey.kind === "onboarding" ? t.journey.firstDay : t.journey.lastDay, { date: formatDay(journey.anchor, locale, { weekday: "long", day: "numeric", month: "long" }) })}</p>
          <div className="progress-line">
            <span className="meter big" aria-hidden="true"><span style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%` }} /></span>
            <span>{format(t.journey.progress, { done, total: steps.length })}</span>
          </div>
        </div>
      </header>
      <JourneyView
        journey={{ id: journey.id, kind: journey.kind, anchor: journey.anchor, stopped: journey.stopped, complete: journey.completedAt !== null }}
        steps={steps}
        hr={hr}
        people={pickable}
        t={{ journey: t.journey, todo: t.todo, nobody: t.people.nobody, errors: t.errors }}
      />
    </main>
  );
}
