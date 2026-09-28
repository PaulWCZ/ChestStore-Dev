import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { boardAudience } from "../../../../lib/audience.ts";
import { board as readBoard, columns as readColumns, labels as readLabels } from "../../../../lib/boards.ts";
import { boardCards, cardDetail } from "../../../../lib/cards.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { formatDate, relative } from "../../../../lib/i18n/index.ts";
import { today } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { BoardView } from "./board-view.tsx";
import { CardPanel, type PanelCard } from "./card-panel.tsx";

type Search = { card?: string; view?: string; who?: string; label?: string };

// One board: its columns of cards (or a list), and the card asked in the
// address (?card=…) open in a panel beside it.
export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const { id } = await params;
  const search = await searchParams;
  let b;
  try {
    b = await readBoard(sql, member, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const [cols, labs, cards, audience] = await Promise.all([readColumns(sql, b.id), readLabels(sql, b.id), boardCards(sql, b.id), boardAudience(b)]);
  let detail: Awaited<ReturnType<typeof cardDetail>> | null = null;
  if (search.card) {
    try {
      detail = await cardDetail(sql, member, search.card);
      if (detail.boardId !== b.id) detail = null;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  const ids = [...cards.flatMap(c => c.assignees), ...(detail ? [...detail.assignees, detail.createdBy, ...detail.thread.map(c => c.author), ...detail.history.map(h => h.actor), ...detail.history.map(h => String(h.data["member"] ?? "")), ...detail.files.map(f => f.addedBy)] : [])];
  const who = await people(ids);
  const names: Record<string, { name: string; photo: string | null }> = {};
  for (const [key, p] of who) names[key] = { name: key === member.id ? t.people.you : nameOf(p, locale), photo: p.photo };
  names["erased"] = { name: t.people.erased, photo: null };
  names["chest"] = { name: t.people.chest, photo: null };
  const now = new Date();
  const day = today(now);
  const canWrite = b.access === "write" || b.access === "own";
  const panel: PanelCard | null = detail ? {
    ...detail,
    createdWhen: relative(detail.createdAt, locale, now),
    dueLabel: detail.due ? formatDate(detail.due + "T12:00:00Z", locale, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null,
    thread: detail.thread.map(c => ({ ...c, when: relative(c.at, locale, now), date: formatDate(c.at, locale, { dateStyle: "long", timeStyle: "short" }) })),
    history: detail.history.map(h => ({ ...h, when: relative(h.at, locale, now) })),
    files: detail.files.map(f => ({ ...f, when: relative(f.at, locale, now) })),
  } : null;
  return (
    <div className={`board-page c-${b.color}`}>
      <AutoRefresh seconds={15} />
      <BoardView
        board={{ id: b.id, name: b.name, color: b.color, access: b.access, archived: b.archived }}
        columns={cols}
        labels={labs}
        cards={cards}
        people={names}
        audience={audience.map(p => ({ ...p, name: p.id === member.id ? t.people.you : p.name }))}
        me={member.id}
        today={day}
        locale={locale}
        view={search.view === "list" ? "list" : "board"}
        filter={{ who: search.who ?? "", label: search.label ?? "" }}
        t={{ board: t.board, card: t.card, errors: t.errors, colors: t.colors }}
      />
      {panel && (
        <CardPanel
          key={panel.id}
          card={panel}
          board={{ id: b.id, color: b.color, archived: b.archived, writable: canWrite && !b.archived }}
          columns={cols}
          labels={labs}
          people={names}
          audience={audience}
          me={member.id}
          t={{ card: t.card, activity: t.activity, errors: t.errors, colors: t.colors }}
        />
      )}
    </div>
  );
}
