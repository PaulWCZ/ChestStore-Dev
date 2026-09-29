import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { boardAudience, groupsOfTool } from "../../../../../lib/audience.ts";
import { board as readBoard, columns as readColumns, fields as readFields, labels as readLabels } from "../../../../../lib/boards.ts";
import { boardCards } from "../../../../../lib/cards.ts";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { viewer } from "../../../../../lib/session.ts";
import { Settings } from "./settings.tsx";

// A board's settings: name and colour, who sees it, labels, what was
// archived, export, archive and delete. Owners and managers change them;
// others read them.
export default async function BoardSettings({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const { id } = await params;
  let b;
  try {
    b = await readBoard(sql, member, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const own = b.access === "own";
  const [labs, boardFields, archivedColumns, archivedCards, everyone, groups] = await Promise.all([
    readLabels(sql, b.id),
    readFields(sql, b.id),
    readColumns(sql, b.id, { archived: true }),
    boardCards(sql, b.id, { archived: true }),
    // Everyone who has Tasks may be added to a private board.
    own ? boardAudience({ visibility: "team", people: [], groups: [] }) : Promise.resolve([]),
    own ? groupsOfTool() : Promise.resolve([]),
  ]);
  const who = await people(b.people.map(p => p.memberId));
  // How many cards each archived column still holds.
  const held = archivedColumns.length ? new Map((await sql<{ column_id: string; count: number }[]>`select column_id, count(*)::int as count from cards where column_id in ${sql(archivedColumns.map(c => c.id))} and archived_at is null group by column_id`).map(r => [String(r.column_id), r.count])) : new Map<string, number>();
  const members = b.people.map(p => ({ id: p.memberId, owner: p.owner, name: p.memberId === member.id ? t.people.you : nameOf(who.get(p.memberId), locale), photo: who.get(p.memberId)?.photo ?? null }));
  return (
    <main className="narrow">
      <Link className="back" href={`/chest/boards/${b.id}`}><Back />{b.name}</Link>
      <h1 style={{ marginBottom: "var(--space-5)" }}>{t.settings.title}</h1>
      <Settings
        board={{ id: b.id, name: b.name, color: b.color, visibility: b.visibility, archived: b.archived, own, writable: (b.access === "write" || own) && !b.archived, groups: b.groups }}
        members={members}
        everyone={everyone.filter(p => !b.people.some(x => x.memberId === p.id))}
        groups={groups}
        labels={labs}
        fields={boardFields}
        archivedColumns={archivedColumns.map(c => ({ ...c, cards: held.get(c.id) ?? 0 }))}
        locale={locale}
        archivedCards={archivedCards.map(c => ({ id: c.id, title: c.title }))}
        t={{ settings: t.settings, colors: t.colors, errors: t.errors, card: t.card, fields: t.fields }}
      />
    </main>
  );
}
