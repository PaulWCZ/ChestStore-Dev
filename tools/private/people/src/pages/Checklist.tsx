import { Island, type PageContext, type View } from "@argentic/chest-app";
import { Avatar } from "@argentic/chest-ui/components";
import { KindBadge } from "../components/kind.tsx";
import { format, formatDate, formatDay } from "../i18n/index.ts";
import { can, ticks } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listName, stepText } from "../lib/examples.ts";
import { journey as loadJourney } from "../lib/journeys.ts";
import { everyone, nameOf, people, subjectOf } from "../lib/people.ts";
import { tickedByEquipment } from "../lib/returns.ts";
import { welcomeMail } from "../lib/welcome.ts";
import { today, zoneOf } from "../lib/zone.ts";
import { dueState } from "../shared/model.ts";
import type { StepView } from "../islands/JourneyView.tsx";
import { BackLink, Meter } from "./parts.tsx";

// One checklist: the steps before, on and after the day, who does each and
// when; ticked by whoever it is given to (or HR). HR gives a step to
// someone else, moves it, adds or removes one, stops the checklist. One
// the reader may not see does not exist (404: lib/journeys.ts refuses
// not_found).
export async function checklistPage({ member, locale, t, param }: PageContext): Promise<View> {
  const journey = await loadJourney(db(), member, param("id"));
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
    text: stepText(i, t),
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
    doneBy: i.done && i.doneBy && i.doneAt ? format(i.doneBy === tickedByEquipment ? t.journey.doneByEquipment : i.doneBy === member.id ? t.journey.doneByYou : t.journey.doneBy, { name: nameOf(who.get(i.doneBy), locale), date: formatDate(i.doneAt, locale, zoneOf(member), { day: "numeric", month: "short" }) }) : null,
    mine: ticks(member, i),
  }));
  const pickable = hr ? (await everyone()).people.map(p => ({ id: p.id, name: p.name, photo: p.photo })) : [];
  // HR sees when the welcome email to an arrival could not be delivered.
  const bounced = hr && journey.kind === "onboarding" ? await welcomeMail(db(), journey.id) : null;
  const done = steps.filter(s => s.done).length;
  const title = format(journey.kind === "onboarding" ? t.journey.onboarding : t.journey.offboarding, { name: personName });
  return {
    title,
    body: (
      <div className="page narrow">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        <BackLink href={hr ? "/chest/checklists" : "/chest/todo"}>{hr ? t.checklists.title : t.todo.title}</BackLink>
        <header className="journey-head">
          <Avatar name={personName} photo={subject.photo} size="xl" />
          <div>
            <span className="row tags">
              <KindBadge kind={journey.kind} label={t.checklists.kinds[journey.kind]} />
              {journey.arrivalSource === "hiring" && <span className="source">{t.arrivals.fromHiring}</span>}
            </span>
            <h1>{title}</h1>
            <p className="muted">{listName(journey, t)} · {format(journey.kind === "onboarding" ? t.journey.firstDay : t.journey.lastDay, { date: formatDay(journey.anchor, locale, { weekday: "long", day: "numeric", month: "long" }) })}</p>
            <div className="progress-line">
              <Meter done={done} total={steps.length} big />
              <span>{format(t.journey.progress, { done, total: steps.length })}</span>
            </div>
          </div>
        </header>
        {bounced && <p className="banner warn" role="status">{bounced.address ? format(t.journey.welcomeBounced, { address: bounced.address }) : t.journey.welcomeBouncedNoAddress}</p>}
        <Island
          id={`journey-${journey.id}`}
          name="JourneyView"
          props={{
            journey: { id: journey.id, kind: journey.kind, anchor: journey.anchor, stopped: journey.stopped, complete: journey.completedAt !== null },
            steps,
            hr,
            people: pickable,
            today: now,
            lang: locale,
            t: { journey: t.journey, todo: { done: t.todo.done, undone: t.todo.undone }, nobody: t.people.nobody, leaveEmpty: t.people.leaveEmpty, date: t.date, peoplePicker: t.peoplePicker },
          }}
        />
      </div>
    ),
  };
}
