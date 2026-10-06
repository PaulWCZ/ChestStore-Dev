import { localeOf } from "../i18n/index.ts";
import { EmptyState } from "@argentic/chest-ui/components";
import { BoardTiles } from "../components/board-tiles.tsx";
import { Download, Grid, Upload } from "../components/icons.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { can } from "../lib/access.ts";
import { askWho, sharingFor } from "../lib/audience.ts";
import { listBoards } from "../lib/boards.ts";
import { db } from "../lib/db.ts";
import { newBoardWords } from "./MyTasks.tsx";

// Every board the member sees; the archived ones on demand.
export async function boardsPage({ member, locale: language, t, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const archived = query("archived") === "1";
  const creates = !archived && can(member, "boards.create");
  const [boards, sharing] = await Promise.all([listBoards(db(), member, { archived }), creates ? sharingFor(member.id) : Promise.resolve({ people: [], groups: [] })]);
  const newBoard = (look: { primary?: boolean; tile?: boolean }) => ({ t: newBoardWords(t), label: t.boards.new, sharing, locale, ...look });
  const words = { open: t.boards.open, mine: t.boards.mine, late: t.boards.late, private: t.boards.private };
  return {
    title: archived ? t.boards.archived : t.boards.title,
    body: (
      <div className="wide">
        <div className="hello">
          <h1>{archived ? t.boards.archived : t.boards.title}</h1>
          <div className="row">
            {!archived && can(member, "import") && <a className="button quiet" href="/chest/import"><Upload />{t.shell.import}</a>}
            {creates && <Island name="NewBoard" props={newBoard({ primary: true })} />}
          </div>
        </div>
        {archived && <a className="back" href="/chest/boards">{t.boards.back}</a>}
        {boards.length === 0 && archived ? <p className="muted">{t.boards.noArchived}</p> : boards.length === 0 && !creates ? (
          // Someone who creates no board and sees none: who can share one.
          <EmptyState icon={<Grid />} title={t.home.nothingShared.title} body={await askWho(t, locale)} />
        ) : (
          <BoardTiles boards={boards} locale={locale} t={words}>
            {creates && <Island name="NewBoard" props={newBoard({ tile: true })} />}
          </BoardTiles>
        )}
        {!archived && (
          <p className="row">
            <a className="link-button" href="/chest/boards?archived=1">{t.boards.archived}</a>
            {can(member, "boards.all") && <a className="link-button" href="/chest/export"><Download /> {t.boards.exportAll}</a>}
          </p>
        )}
      </div>
    ),
  };
}
