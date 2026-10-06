import { Back } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { Island } from "../core/island.tsx";
import { AppError, notFound } from "../core/tool.ts";
import { boardAudience, groupsOfTool } from "../lib/audience.ts";
import { board as readBoard, columns as readColumns, fields as readFields, labels as readLabels } from "../lib/boards.ts";
import { boardCards } from "../lib/cards.ts";
import { db } from "../lib/db.ts";
import { nameOf, people } from "../lib/people.ts";

// A board's settings: name and colour, who sees it, labels, fields, what
// was archived, export, archive and delete. Owners and managers change
// them; others read them.
export async function settingsPage({ member, locale, t, param }: PageContext): Promise<View> {
  const sql = db();
  const b = await readBoard(sql, member, param("id")).catch((error: unknown) => (error instanceof AppError && error.code === "not_found" ? notFound() : Promise.reject(error)));
  const own = b.access === "own";
  const [labs, boardFields, archivedColumns, archivedCards, everyone, groups] = await Promise.all([
    readLabels(sql, b.id),
    readFields(sql, b.id),
    readColumns(sql, b.id, { archived: true, words: t.templates.columns }),
    boardCards(sql, b.id, { archived: true }),
    // Everyone who has Tasks may be added to a private board.
    own ? boardAudience({ visibility: "team", people: [], groups: [] }) : Promise.resolve([]),
    own ? groupsOfTool() : Promise.resolve([]),
  ]);
  const who = await people(b.people.map(p => p.memberId));
  // How many cards each archived column still holds.
  const held = archivedColumns.length ? new Map((await sql<{ column_id: string; count: number }[]>`select column_id, count(*)::int as count from cards where column_id in ${sql(archivedColumns.map(c => c.id))} and archived_at is null group by column_id`).map(r => [String(r.column_id), r.count])) : new Map<string, number>();
  const members = b.people.map(p => ({ id: p.memberId, owner: p.owner, name: p.memberId === member.id ? t.people.you : nameOf(who.get(p.memberId), locale), photo: who.get(p.memberId)?.photo ?? null }));
  return {
    title: `${t.settings.title} · ${b.name}`,
    body: (
      <div className="narrow">
        <a className="back" href={`/chest/boards/${b.id}`}><Back />{b.name}</a>
        <h1 className="page-title">{t.settings.title}</h1>
        <Island name="BoardSettings" props={{
          board: { id: b.id, name: b.name, color: b.color, visibility: b.visibility, archived: b.archived, own, writable: (b.access === "write" || own) && !b.archived, groups: b.groups },
          members,
          everyone: everyone.filter(p => !b.people.some(x => x.memberId === p.id)),
          groups,
          labels: labs,
          fields: boardFields,
          archivedColumns: archivedColumns.map(c => ({ ...c, cards: held.get(c.id) ?? 0 })),
          locale,
          archivedCards: archivedCards.map(c => ({ id: c.id, title: c.title })),
          t: { settings: t.settings, colors: t.colors, card: t.card, fields: t.fields, peoplePicker: t.peoplePicker },
        }} />
      </div>
    ),
  };
}
