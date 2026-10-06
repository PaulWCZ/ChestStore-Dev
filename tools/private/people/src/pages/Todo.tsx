import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { CheckList } from "../components/icons.tsx";
import { format, formatDay, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { stepText } from "../lib/examples.ts";
import { myItems } from "../lib/journeys.ts";
import { people, subjectOf } from "../lib/people.ts";
import { refreshBadges } from "../lib/tell.ts";
import { todayOf } from "../lib/zone.ts";
import { dueState } from "../shared/model.ts";
import type { Group } from "../islands/TodoList.tsx";

// My to-dos: the steps given to me in the checklists of colleagues who
// arrive or leave (and in my own), by checklist, soonest first. The one
// obvious action: tick what is done.
export async function todoPage({ member, locale, t }: PageContext): Promise<View> {
  const sql = db();
  const groups = await myItems(sql, member);
  // The tile's number may have gone stale (dates move overnight, between
  // two morning runs): set it right here.
  await refreshBadges(sql, [member.id]);
  const who = await people(groups.flatMap(g => (g.journey.personId ? [g.journey.personId] : [])));
  // "Today" and "late" as the reader lives them: their own zone.
  const now = todayOf(member);
  const shown: Group[] = groups.map(g => {
    const person = subjectOf(g.journey, who, locale);
    const mine = g.journey.personId === member.id;
    const name = person.name;
    return {
      id: g.journey.id,
      title: mine ? (g.journey.kind === "onboarding" ? t.todo.yoursOnboarding : t.todo.yoursOffboarding) : format(g.journey.kind === "onboarding" ? t.todo.onboarding : t.todo.offboarding, { name }),
      person: { name, photo: person.photo },
      items: g.items.map(i => ({
        id: i.id, text: stepText(i, t), done: i.done,
        due: formatDay(i.due, locale, { weekday: "short", day: "numeric", month: "short" }),
        state: dueState(i.due, now),
      })),
    };
  });
  const open = shown.reduce((n, g) => n + g.items.filter(i => !i.done).length, 0);
  return {
    title: t.todo.title,
    body: (
      <div className="page narrow">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        <PageHeader title={t.todo.title} intro={plural(t.todo.summary, open, locale)} />
        {shown.length === 0 ? (
          <EmptyState icon={<CheckList />} title={t.todo.empty.title} body={t.todo.empty.body} />
        ) : (
          <Island name="TodoList" props={{ groups: shown, t: { whole: t.todo.whole, late: t.todo.late, today: t.todo.today, done: t.todo.done, undone: t.todo.undone, doneRecently: t.todo.doneRecently } }} />
        )}
      </div>
    ),
  };
}
