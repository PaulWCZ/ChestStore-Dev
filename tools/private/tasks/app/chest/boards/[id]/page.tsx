import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { boardAudience } from "../../../../lib/audience.ts";
import { board as readBoard, columns as readColumns, labels as readLabels } from "../../../../lib/boards.ts";
import { boardCards, cardDetail } from "../../../../lib/cards.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { chestToday, zone } from "../../../../lib/clock.ts";
import { format, formatDate, intl, relative, type Catalogue, type Locale } from "../../../../lib/i18n/index.ts";
import { addDays, nextDue, type Repeat } from "../../../../lib/repeat.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { BoardView } from "./board-view.tsx";
import { CardPanel, type PanelCard, type RepeatView } from "./card-panel.tsx";

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
  const day = chestToday(now);
  const canWrite = b.access === "write" || b.access === "own";
  const panel: PanelCard | null = detail ? {
    ...detail,
    createdWhen: relative(detail.createdAt, locale, now),
    dueLabel: detail.due ? formatDate(detail.due + "T12:00:00Z", locale, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null,
    thread: detail.thread.map(c => ({ ...c, when: relative(c.at, locale, now), date: formatDate(c.at, locale, { dateStyle: "long", timeStyle: "short", timeZone: zone() }) })),
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
          repeat={repeatView(detail!, cols, b.id, day, locale, t)}
          me={member.id}
          t={{ card: t.card, activity: t.activity, errors: t.errors, colors: t.colors }}
        />
      )}
    </div>
  );
}

// What the card says of its repeat, written here (dates and day names on
// the server: the browser's Intl may write them otherwise).
function repeatView(card: { due: string | null; done: boolean; archived: boolean; repeat: Repeat | null; next: { id: string; due: string | null } | null }, cols: { id: string; name: string; done: boolean }[], boardId: string, day: string, locale: Locale, t: Catalogue): RepeatView {
  const dateOf = (d: string) => new Intl.DateTimeFormat(intl(locale), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const dayName = (weekday: number, style: "long" | "short") => new Intl.DateTimeFormat(intl(locale), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + weekday, 12)));
  // Monday first, as the week is read in Europe; Sunday is 0.
  const days = [1, 2, 3, 4, 5, 6, 0].map(value => ({ value, short: dayName(value, "short"), long: dayName(value, "long") }));
  const rule = card.repeat;
  let summary: string | null = null;
  if (rule) {
    const words = t.card.repeats;
    summary = rule.every === "week"
      ? format(words.week, { days: new Intl.ListFormat(intl(locale), { type: "conjunction" }).format(days.filter(d => rule.days.includes(d.value)).map(d => d.long)) })
      : rule.every === "month" ? (rule.day === 31 ? words.monthLast : format(words.month, { day: rule.day })) : words[rule.every];
  }
  const lane = cols.find(c => !c.done);
  const upcoming = rule && !card.next && !card.archived && lane ? format(t.card.repeatNext, { column: lane.name, date: dateOf(nextDue(rule, card.due ?? addDays(day, -1), day)) }) : null;
  const made = card.next ? { text: format(t.card.repeatMade, { date: card.next.due ? dateOf(card.next.due) : t.card.noDue }), href: `/chest/boards/${boardId}?card=${card.next.id}` } : null;
  return { summary, upcoming, made, days, today: day };
}
