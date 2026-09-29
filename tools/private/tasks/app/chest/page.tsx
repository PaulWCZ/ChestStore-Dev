import { EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Grid } from "../../components/icons.tsx";
import { can } from "../../lib/access.ts";
import { managerNames, sharingFor } from "../../lib/audience.ts";
import { columnName, listBoards } from "../../lib/boards.ts";
import { mySteps, myTasks } from "../../lib/cards.ts";
import { db } from "../../lib/db.ts";
import { format, intl, plural, type Catalogue } from "../../lib/i18n/index.ts";
import { emailOn } from "../../lib/mail.ts";
import { chestToday } from "../../lib/clock.ts";
import { dueState, type DueState } from "../../lib/model.ts";
import { reminderOn } from "../../lib/reminders.ts";
import { viewer } from "../../lib/session.ts";
import { refreshBadges } from "../../lib/tell.ts";
import { BoardTiles } from "./board-tiles.tsx";
import { NewBoardButton } from "./new-board.tsx";
import { EmailSwitch, ReminderSwitch } from "./reminder-switch.tsx";
import { TaskGroups, type TaskRow } from "./task-groups.tsx";

// Home: what is on my plate, across every board, by when it is due; and
// my boards. The one obvious action: tick what is done.
export default async function Home() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const creates = can(member, "boards.create");
  const [boards, tasks, steps, reminder, emails, sharing] = await Promise.all([listBoards(sql, member), myTasks(sql, member), mySteps(sql, member), reminderOn(sql, member), emailOn(sql, member), creates ? sharingFor(member.id) : Promise.resolve({ people: [], groups: [] })]);
  // The tile's number may have gone stale overnight (nothing runs in the
  // background): set it right whenever its owner comes home.
  await refreshBadges(sql, [member.id]);
  const doneColumns = new Map((await sql<{ board_id: string; id: string; name: string; key: string | null }[]>`
    select distinct on (board_id) board_id, id, name, key from columns where done and archived_at is null order by board_id, position`).map(r => [String(r.board_id), { id: String(r.id), name: columnName(r.name, r.key, t.templates.columns) }]));
  const now = chestToday();
  const dayLabel = (due: string | null) => (due ? new Intl.DateTimeFormat(intl(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(due + "T00:00:00Z")) : null);
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
  const newBoardWords = { create: t.create, templates: t.templates, errors: t.errors, dialog: t.dialog, peoplePicker: t.peoplePicker };
  const order: DueState[] = ["late", "today", "soon", "later", "none"];
  const mine = boards.filter(b => b.mine > 0 || b.createdBy === member.id).slice(0, 7);
  const shownBoards = mine.length > 0 ? mine : boards.slice(0, 7);
  return (
    <div className="narrow">
      <AutoRefresh seconds={30} />
      <div className="hello">
        <div>
          <h1>{t.home.title}</h1>
          <p>{plural(t.home.summary, rows.length, locale)}</p>
        </div>
      </div>
      {boards.length === 0 ? (
        creates ? (
          <EmptyState icon={<Grid />} title={t.home.firstTime.title} body={t.home.firstTime.body}
            action={<NewBoardButton t={newBoardWords} label={t.home.firstTime.action} sharing={sharing} locale={locale} primary />} />
        ) : (
          <EmptyState icon={<Grid />} title={t.home.nothingShared.title} body={await askWho(t, locale)} />
        )
      ) : (
        <>
          {rows.length === 0 ? (
            <EmptyState title={t.home.empty.title} body={t.home.empty.body} action={<Link className="button quiet" href="/chest/boards">{t.home.empty.action}</Link>} />
          ) : (
            <TaskGroups rows={rows} order={order} t={{ groups: t.home.groups, markDone: t.home.markDone, doneAnyway: t.card.doneAnyway, doneToast: t.home.doneToast, doneRepeatToast: t.home.doneRepeatToast, stepDone: t.home.stepDone, stepOf: t.home.stepOf, repeats: t.card.repeatBadge, errors: t.errors, late: t.card.late, today: t.card.today, progress: t.card.progress }} />
          )}
          <section aria-labelledby="your-boards" className="your-boards">
            <div className="section-title">
              <h2 id="your-boards">{t.home.boards}</h2>
              <Link className="link-button" href="/chest/boards">{t.home.allBoards}</Link>
            </div>
            <BoardTiles boards={shownBoards} locale={locale} t={{ open: t.boards.open, mine: t.boards.mine, late: t.boards.late, private: t.boards.private }}>
              {creates && <NewBoardButton t={newBoardWords} label={t.boards.new} sharing={sharing} locale={locale} tile />}
            </BoardTiles>
          </section>
          <div className="switches">
            <ReminderSwitch on={reminder} t={{ label: t.home.reminder, errors: t.errors }} />
            <EmailSwitch on={emails} t={{ label: t.home.email, errors: t.errors }} />
          </div>
        </>
      )}
    </div>
  );
}

// Who to ask for a board, by name when the Chest says who the managers are.
async function askWho(t: Catalogue, locale: string): Promise<string> {
  const names = await managerNames();
  return names.length > 0 ? format(t.home.nothingShared.body, { names: new Intl.ListFormat(intl(locale), { type: "disjunction" }).format(names) }) : t.home.nothingShared.anyone;
}
