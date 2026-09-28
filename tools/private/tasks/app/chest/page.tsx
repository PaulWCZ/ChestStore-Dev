import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Grid } from "../../components/icons.tsx";
import { can } from "../../lib/access.ts";
import { listBoards } from "../../lib/boards.ts";
import { myTasks } from "../../lib/cards.ts";
import { db } from "../../lib/db.ts";
import { intl, plural } from "../../lib/i18n/index.ts";
import { chestToday } from "../../lib/clock.ts";
import { dueState, type DueState } from "../../lib/model.ts";
import { reminderOn } from "../../lib/reminders.ts";
import { viewer } from "../../lib/session.ts";
import { refreshBadges } from "../../lib/tell.ts";
import { BoardTiles } from "./board-tiles.tsx";
import { NewBoardButton } from "./new-board.tsx";
import { ReminderSwitch } from "./reminder-switch.tsx";
import { TaskGroups, type TaskRow } from "./task-groups.tsx";

// Home: what is on my plate, across every board, by when it is due; and
// my boards. The one obvious action: tick what is done.
export default async function Home() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const [boards, tasks, reminder] = await Promise.all([listBoards(sql, member), myTasks(sql, member), reminderOn(sql, member)]);
  // The tile's number may have gone stale overnight (nothing runs in the
  // background): set it right whenever its owner comes home.
  await refreshBadges(sql, [member.id]);
  const doneColumns = new Map((await sql<{ board_id: string; id: string; name: string }[]>`
    select distinct on (board_id) board_id, id, name from columns where done and archived_at is null order by board_id, position`).map(r => [String(r.board_id), { id: String(r.id), name: r.name }]));
  const now = chestToday();
  const rows: TaskRow[] = tasks.map(task => ({
    id: task.id,
    title: task.title,
    boardId: task.boardId,
    boardName: task.boardName,
    boardColor: task.boardColor,
    columnId: task.columnId,
    due: task.due,
    dueLabel: task.due ? new Intl.DateTimeFormat(intl(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(task.due + "T00:00:00Z")) : null,
    state: dueState(task.due, now),
    checklist: task.checklist,
    repeats: task.repeats,
    done: doneColumns.get(task.boardId) ?? null,
  }));
  const order: DueState[] = ["late", "today", "soon", "later", "none"];
  const mine = boards.filter(b => b.mine > 0 || b.createdBy === member.id).slice(0, 7);
  const shownBoards = mine.length > 0 ? mine : boards.slice(0, 7);
  return (
    <main className="narrow">
      <AutoRefresh seconds={30} />
      <div className="hello">
        <div>
          <h1>{t.home.title}</h1>
          <p>{plural(t.home.summary, rows.length, locale)}</p>
        </div>
      </div>
      {boards.length === 0 ? (
        <div className="empty">
          <Grid />
          <h2>{t.home.firstTime.title}</h2>
          <p>{t.home.firstTime.body}</p>
          {can(member, "boards.create") && <NewBoardButton t={{ create: t.create, templates: t.templates, errors: t.errors }} label={t.home.firstTime.action} primary />}
        </div>
      ) : (
        <>
          {rows.length === 0 ? (
            <div className="empty">
              <h2>{t.home.empty.title}</h2>
              <p>{t.home.empty.body}</p>
              <Link className="button quiet" href="/chest/boards">{t.home.empty.action}</Link>
            </div>
          ) : (
            <TaskGroups rows={rows} order={order} t={{ groups: t.home.groups, markDone: t.home.markDone, doneToast: t.home.doneToast, doneRepeatToast: t.home.doneRepeatToast, repeats: t.card.repeatBadge, undo: t.card.undo, errors: t.errors, late: t.card.late, today: t.card.today, progress: t.card.progress }} />
          )}
          <section aria-labelledby="your-boards" style={{ marginTop: "var(--space-6)" }}>
            <div className="section-title">
              <h2 id="your-boards">{t.home.boards}</h2>
              <Link className="link-button" href="/chest/boards">{t.home.allBoards}</Link>
            </div>
            <BoardTiles boards={shownBoards} locale={locale} t={{ open: t.boards.open, mine: t.boards.mine, late: t.boards.late, private: t.boards.private }}>
              {can(member, "boards.create") && <NewBoardButton t={{ create: t.create, templates: t.templates, errors: t.errors }} label={t.boards.new} tile />}
            </BoardTiles>
          </section>
          <ReminderSwitch on={reminder} t={{ label: t.home.reminder, errors: t.errors }} />
        </>
      )}
    </main>
  );
}

