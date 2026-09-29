import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { boardAudience } from "../../../../lib/audience.ts";
import { board as readBoard, columns as readColumns, fields as readFields, labels as readLabels, listBoards } from "../../../../lib/boards.ts";
import { grid, monthOf, shift } from "../../../../lib/calendar.ts";
import { boardCards, cardDetail } from "../../../../lib/cards.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { chestToday, zone } from "../../../../lib/clock.ts";
import { format, formatDate, intl, plural, relative, type Catalogue, type Locale } from "../../../../lib/i18n/index.ts";
import { quarterHours } from "../../../../lib/model.ts";
import { addDays, nextDue, type Repeat } from "../../../../lib/repeat.ts";
import type { Member } from "@argentic/chest-sdk/member";
import type { Sql } from "../../../../lib/db.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { BoardView } from "./board-view.tsx";
import { CardPanel, type PanelCard, type RepeatView } from "./card-panel.tsx";

type Search = { card?: string; view?: string; who?: string; label?: string; month?: string };

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
  const [cols, labs, own, cards, audience] = await Promise.all([readColumns(sql, b.id), readLabels(sql, b.id), readFields(sql, b.id), boardCards(sql, b.id), boardAudience(b)]);
  let detail: Awaited<ReturnType<typeof cardDetail>> | null = null;
  if (search.card) {
    try {
      detail = await cardDetail(sql, member, search.card);
      if (detail.boardId !== b.id) detail = null;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  const ids = [...cards.flatMap(c => c.assignees), ...(detail ? [...detail.assignees, detail.createdBy, ...detail.thread.map(c => c.author), ...detail.history.map(h => h.actor), ...detail.history.map(h => String(h.data["member"] ?? "")), ...detail.files.map(f => f.addedBy), ...detail.items.flatMap(i => (i.assignee ? [i.assignee] : []))] : [])];
  const who = await people(ids);
  const names: Record<string, { name: string; photo: string | null }> = {};
  for (const [key, p] of who) names[key] = { name: key === member.id ? t.people.you : nameOf(p, locale), photo: p.photo };
  names["erased"] = { name: t.people.erased, photo: null };
  names["chest"] = { name: t.people.chest, photo: null };
  const now = new Date();
  const day = chestToday(now);
  const canWrite = b.access === "write" || b.access === "own";
  const longDay = (d: string) => formatDate(d + "T12:00:00Z", locale, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const shortDay = (d: string) => formatDate(d + "T12:00:00Z", locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const panel: PanelCard | null = detail ? {
    ...detail,
    createdWhen: relative(detail.createdAt, locale, now),
    dueLabel: detail.due ? longDay(detail.due) + (detail.dueTime ? " · " + detail.dueTime : "") : null,
    startLabel: detail.start ? longDay(detail.start) : null,
    thread: detail.thread.map(c => ({ ...c, when: relative(c.at, locale, now), date: formatDate(c.at, locale, { dateStyle: "long", timeStyle: "short", timeZone: zone() }) })),
    // Dates in the history are written here, in the reader's language.
    history: detail.history.map(h => ({ ...h, when: relative(h.at, locale, now), data: { ...h.data, ...(typeof h.data["due"] === "string" ? { due: longDay(h.data["due"]) + (typeof h.data["time"] === "string" ? " · " + h.data["time"] : "") } : {}), ...(typeof h.data["start"] === "string" ? { start: longDay(h.data["start"]) } : {}) } })),
    files: detail.files.map(f => ({ ...f, when: relative(f.at, locale, now) })),
    items: detail.items.map(i => ({ ...i, dueLabel: i.due ? shortDay(i.due) : null, late: !i.done && i.due !== null && i.due < day })),
  } : null;
  // Where the open card may go: the boards the member works on, and their
  // columns.
  const targets = panel && canWrite ? await moveTargets(sql, member, b.id, t) : [];
  // Private: who sees it, said in the header.
  const others = b.people.filter(p => p.memberId !== member.id).length;
  const privacy = b.visibility === "private"
    ? (others === 0 && b.groups.length === 0 ? t.board.privateOnlyYou : [plural(t.board.privatePeople, b.people.length, locale), ...(b.groups.length > 0 ? [plural(t.board.privateGroups, b.groups.length, locale)] : [])].join(" · "))
    : null;
  const view = search.view === "list" ? "list" : search.view === "calendar" ? "calendar" : "board";
  const calendar = view === "calendar" ? calendarOf(monthOf(search.month, day), day, locale) : null;
  return (
    <div className={`board-page c-${b.color}`}>
      <AutoRefresh seconds={15} />
      <BoardView
        board={{ id: b.id, name: b.name, color: b.color, access: b.access, archived: b.archived, privacy }}
        columns={cols}
        labels={labs}
        fields={own}
        cards={cards}
        people={names}
        audience={audience.map(p => ({ ...p, name: p.id === member.id ? t.people.you : p.name }))}
        me={member.id}
        today={day}
        locale={locale}
        view={view}
        calendar={calendar}
        filter={{ who: search.who ?? "", label: search.label ?? "" }}
        t={{ board: t.board, card: t.card, errors: t.errors, colors: t.colors, dialog: t.dialog }}
      />
      {panel && (
        <CardPanel
          key={panel.id}
          card={panel}
          board={{ id: b.id, name: b.name, color: b.color, archived: b.archived, writable: canWrite && !b.archived }}
          columns={cols}
          labels={labs}
          fields={own}
          targets={targets}
          times={quarterHours}
          people={names}
          audience={audience}
          repeat={repeatView(detail!, cols, b.id, day, locale, t)}
          me={member.id}
          locale={locale}
          t={{ card: t.card, activity: t.activity, errors: t.errors, colors: t.colors, fields: t.fields, dialog: t.dialog, date: t.date, peoplePicker: t.peoplePicker, files: t.files }}
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

// The boards a card may move or be copied to (those the member works on,
// not archived), with their columns; this board first.
async function moveTargets(sql: Sql, member: Member, boardId: string, t: Catalogue): Promise<{ id: string; name: string; columns: { id: string; name: string }[] }[]> {
  const mine = (await listBoards(sql, member)).filter(x => x.access === "write" || x.access === "own");
  if (mine.length === 0) return [];
  const rows = await sql<{ id: string; board_id: string; name: string }[]>`select id, board_id, name from columns where board_id in ${sql(mine.map(x => x.id))} and archived_at is null order by position, id`;
  return mine
    .map(x => ({ id: x.id, name: x.id === boardId ? format(t.card.thisBoard, { name: x.name }) : x.name, columns: rows.filter(r => String(r.board_id) === x.id).map(r => ({ id: String(r.id), name: r.name })) }))
    .filter(x => x.columns.length > 0)
    .sort((a, c) => Number(c.id === boardId) - Number(a.id === boardId));
}

// The calendar's month, written on the server: its title, the days' names
// (Monday first), the weeks, the neighbouring months.
export type CalendarMonth = { month: string; title: string; weekdays: { short: string; long: string }[]; weeks: { date: string; day: number; inMonth: boolean; label: string }[][]; prev: string; next: string; today: string; current: string };
function calendarOf(month: string, today: string, locale: Locale): CalendarMonth {
  const f = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intl(locale), { timeZone: "UTC", ...options });
  const title = f({ month: "long", year: "numeric" }).format(new Date(month + "-15T12:00:00Z"));
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map(i => new Date(Date.UTC(2026, 0, 5 + i, 12))).map(d => ({ short: f({ weekday: "short" }).format(d), long: f({ weekday: "long" }).format(d) }));
  const long = f({ weekday: "long", day: "numeric", month: "long" });
  const weeks = grid(month).map(week => week.map(date => ({ date, day: Number(date.slice(8)), inMonth: date.startsWith(month), label: long.format(new Date(date + "T12:00:00Z")) })));
  return { month, title: title.charAt(0).toLocaleUpperCase(intl(locale)) + title.slice(1), weekdays, weeks, prev: shift(month, -1), next: shift(month, 1), today, current: today.slice(0, 7) };
}
