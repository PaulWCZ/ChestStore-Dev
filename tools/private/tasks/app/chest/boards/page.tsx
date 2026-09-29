import { EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { Download, Grid, Upload } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { askWho, sharingFor } from "../../../lib/audience.ts";
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
  const newBoardWords = { create: t.create, templates: t.templates, errors: t.errors, dialog: t.dialog, peoplePicker: t.peoplePicker };
  const words = { open: t.boards.open, mine: t.boards.mine, late: t.boards.late, private: t.boards.private };
  return (
    <div className="wide">
      <div className="hello">
        <h1>{archived ? t.boards.archived : t.boards.title}</h1>
        <div className="row">
          {!archived && can(member, "import") && <Link className="button quiet" href="/chest/import"><Upload />{t.shell.import}</Link>}
          {creates && <NewBoardButton t={newBoardWords} label={t.boards.new} sharing={sharing} locale={locale} primary />}
        </div>
      </div>
      {archived && <Link className="back" href="/chest/boards">{t.boards.back}</Link>}
      {boards.length === 0 && archived ? <p className="muted">{t.boards.noArchived}</p> : boards.length === 0 && !creates ? (
        // Someone who creates no board and sees none: who can share one.
        <EmptyState icon={<Grid />} title={t.home.nothingShared.title} body={await askWho(t, locale)} />
      ) : (
        <BoardTiles boards={boards} locale={locale} t={words}>
          {creates && <NewBoardButton t={newBoardWords} label={t.boards.new} sharing={sharing} locale={locale} tile />}
        </BoardTiles>
      )}
      {!archived && (
        <p className="row">
          <Link className="link-button" href="/chest/boards?archived=1">{t.boards.archived}</Link>
          {can(member, "boards.all") && <a className="link-button" href="/chest/export"><Download /> {t.boards.exportAll}</a>}
        </p>
      )}
    </div>
  );
}
