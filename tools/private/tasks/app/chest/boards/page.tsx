import Link from "next/link";
import { Download, Upload } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { sharingFor } from "../../../lib/audience.ts";
import { listBoards } from "../../../lib/boards.ts";
import { db } from "../../../lib/db.ts";
import { viewer } from "../../../lib/session.ts";
import { BoardTiles } from "../board-tiles.tsx";
import { NewBoardButton } from "../new-board.tsx";

// Every board the member sees; the archived ones on demand.
export default async function Boards({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const archived = (await searchParams).archived === "1";
  const creates = !archived && can(member, "boards.create");
  const [boards, sharing] = await Promise.all([listBoards(db(), member, { archived }), creates ? sharingFor(member.id) : Promise.resolve({ people: [], groups: [] })]);
  const words = { open: t.boards.open, mine: t.boards.mine, late: t.boards.late, private: t.boards.private };
  return (
    <main className="wide">
      <div className="hello">
        <h1>{archived ? t.boards.archived : t.boards.title}</h1>
        <div className="row">
          {!archived && can(member, "import") && <Link className="button quiet" href="/chest/import"><Upload />{t.shell.import}</Link>}
          {creates && <NewBoardButton t={{ create: t.create, templates: t.templates, errors: t.errors }} label={t.boards.new} sharing={sharing} locale={locale} primary />}
        </div>
      </div>
      {archived && <Link className="back" href="/chest/boards">{t.boards.back}</Link>}
      {boards.length === 0 && archived ? <p className="muted">{t.boards.noArchived}</p> : (
        <BoardTiles boards={boards} locale={locale} t={words}>
          {creates && <NewBoardButton t={{ create: t.create, templates: t.templates, errors: t.errors }} label={t.boards.new} sharing={sharing} locale={locale} tile />}
        </BoardTiles>
      )}
      {!archived && (
        <p className="row">
          <Link className="link-button" href="/chest/boards?archived=1">{t.boards.archived}</Link>
          {can(member, "boards.all") && <a className="link-button" href="/chest/export"><Download /> {t.boards.exportAll}</a>}
        </p>
      )}
    </main>
  );
}
