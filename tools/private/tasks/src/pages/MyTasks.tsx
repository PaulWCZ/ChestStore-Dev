import { EmptyState } from "@argentic/chest-ui/components";
import { BoardTiles } from "../components/board-tiles.tsx";
import { Calendar, Grid } from "../components/icons.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { after } from "@argentic/chest-app";
import { dayText, plural, localeOf } from "../i18n/index.ts";
import type { NewBoardWords } from "../islands/NewBoard.tsx";
import type { TaskRow } from "../islands/TaskGroups.tsx";
import { can } from "../lib/access.ts";
import { askWho, sharingFor } from "../lib/audience.ts";
import { columnName, listBoards } from "../lib/boards.ts";
import { mySteps, myTasks } from "../lib/cards.ts";
import { chestToday } from "../lib/clock.ts";
import { db } from "../lib/db.ts";
import { calendarPage, calendarWorks, sync as syncCalendar } from "../lib/due-calendar.ts";
import { emailOn, mailPreference, mailState } from "../lib/mail.ts";
import { reminderOn } from "../lib/reminders.ts";
import { refreshBadges } from "../lib/tell.ts";
import { dueState, type DueState } from "../shared/model.ts";

// Home: what is on my plate, across every board, by when it is due; and
// my boards. The one obvious action: tick what is done.
export async function myTasksPage({ member, locale: language, t }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const creates = can(member, "boards.create");
  const [boards, tasks, steps, reminder, emails, sharing, feed, delivery, preference] = await Promise.all([listBoards(sql, member), myTasks(sql, member), mySteps(sql, member), reminderOn(sql, member), emailOn(sql, member), creates ? sharingFor(member.id) : Promise.resolve({ people: [], groups: [] }), calendarWorks(sql), mailState(), mailPreference(member.id)]);
  // The tile's number may have gone stale overnight (nothing runs in the
  // background but the schedules): set it right whenever its owner comes
  // home.
  await refreshBadges(sql, [member.id]);
  // Likewise the calendars, once the page is sent (a Chest just updated,
  // a board brought in by the seed): only what changed is put.
  after("calendar sync", () => syncCalendar(db()));
  const doneColumns = new Map((await sql<{ board_id: string; id: string; name: string; key: string | null }[]>`
    select distinct on (board_id) board_id, id, name, key from columns where done and archived_at is null order by board_id, position`).map(r => [String(r.board_id), { id: String(r.id), name: columnName(r.name, r.key, t.templates.columns) }]));
  const now = chestToday();
  const dayLabel = (due: string | null) => (due ? dayText(due, locale) : null);
  const rows: TaskRow[] = [
    ...tasks.map(task => ({
      kind: "card" as const,
      id: task.id,
      title: task.title,
      cardId: task.id,
      cardTitle: null,
      boardId: task.boardId,
      boardName: task.boardName,
      boardColor: task.boardColor,
      columnId: task.columnId,
      due: task.due,
      dueLabel: task.due ? (dayLabel(task.due)! + (task.dueTime ? " · " + task.dueTime : "")) : null,
      state: dueState(task.due, now),
      checklist: task.checklist,
      repeats: task.repeats,
      done: doneColumns.get(task.boardId) ?? null,
    })),
    ...steps.map(step => ({
      kind: "step" as const,
      id: step.id,
      title: step.text,
      cardId: step.cardId,
      cardTitle: step.cardTitle,
      boardId: step.boardId,
      boardName: step.boardName,
      boardColor: step.boardColor,
      columnId: null,
      due: step.due,
      dueLabel: dayLabel(step.due),
      state: dueState(step.due, now),
      checklist: { done: 0, total: 0 },
      repeats: false,
      done: null,
    })),
  ].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const newBoard = (label: string, look: { primary?: boolean; tile?: boolean }) => ({ t: newBoardWords(t), label, sharing, locale, ...look });
  const order: DueState[] = ["late", "today", "soon", "later", "none"];
  const mine = boards.filter(b => b.mine > 0 || b.createdBy === member.id).slice(0, 7);
  const shownBoards = mine.length > 0 ? mine : boards.slice(0, 7);
  return {
    title: t.home.title,
    body: (
      <div className="narrow">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        <div className="hello">
          <div>
            <h1>{t.home.title}</h1>
            <p>{plural(t.home.summary, rows.length, locale)}</p>
          </div>
        </div>
        {boards.length === 0 ? (
          creates ? (
            <EmptyState icon={<Grid />} title={t.home.firstTime.title} body={t.home.firstTime.body}
              action={<Island name="NewBoard" props={newBoard(t.home.firstTime.action, { primary: true })} />}
              example={can(member, "import") ? { label: t.home.firstTime.import, href: "/chest/import" } : null} />
          ) : (
            <EmptyState icon={<Grid />} title={t.home.nothingShared.title} body={await askWho(t, locale)} />
          )
        ) : (
          <>
            {rows.length === 0 ? (
              <EmptyState title={t.home.empty.title} body={t.home.empty.body} action={<a className="button quiet" href="/chest/boards">{t.home.empty.action}</a>} />
            ) : (
              <Island name="TaskGroups" props={{ rows, order, t: { groups: t.home.groups, markDone: t.home.markDone, doneAnyway: t.card.doneAnyway, doneToast: t.home.doneToast, doneRepeatToast: t.home.doneRepeatToast, stepDone: t.home.stepDone, stepOf: t.home.stepOf, repeats: t.card.repeatBadge, late: t.card.late, today: t.card.today, progress: t.card.progress } }} />
            )}
            <section aria-labelledby="your-boards" className="your-boards">
              <div className="section-title">
                <h2 id="your-boards">{t.home.boards}</h2>
                <a className="link-button" href="/chest/boards">{t.home.allBoards}</a>
              </div>
              <BoardTiles boards={shownBoards} locale={locale} t={{ open: t.boards.open, mine: t.boards.mine, late: t.boards.late, private: t.boards.private }}>
                {creates && <Island name="NewBoard" props={newBoard(t.boards.new, { tile: true })} />}
              </BoardTiles>
            </section>
            <div className="switches">
              <Island name="ReminderSwitch" props={{ on: reminder, label: t.home.reminder }} />
              <Island name="EmailSwitch" props={{ on: emails, label: t.home.email }} />
              {/* What the Chest will do with them (mail.available): said
                  before the person counts on an email that will not come. */}
              {emails && delivery === "off" && <p className="hint">{t.home.emailOff}</p>}
              {emails && delivery === "quota" && <p className="hint">{t.home.emailQuota}</p>}
              {delivery !== "off" && preference === "digest" && <p className="hint">{t.home.emailDigest}</p>}
              {delivery !== "off" && preference === "none" && <p className="hint">{t.home.emailNone}</p>}
            </div>
            {/* The Chest's calendar holds my due dates (lib/due-calendar.ts):
                said only once the Chest took one. */}
            {feed === true && <p><a className="link-button" href={calendarPage}><Calendar /> {t.calendar.link}</a></p>}
          </>
        )}
      </div>
    ),
  };
}

// The words of the "New board" dialog, as an island takes them.
export const newBoardWords = (t: PageContext["t"]): NewBoardWords => ({
  create: t.create,
  templates: { simple: t.templates.simple, project: t.templates.project, onboarding: t.templates.onboarding, empty: t.templates.empty },
  dialog: t.dialog,
  peoplePicker: t.peoplePicker,
});
