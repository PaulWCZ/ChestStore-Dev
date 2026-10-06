import type { Member } from "@argentic/chest-sdk/member";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { AppError, notFound, redirect } from "@argentic/chest-app";
import { dateFormat, dayText, numberFormat, format, formatDate, listFormat, plural, relative, type Catalogue, type Locale, localeOf } from "../i18n/index.ts";
import type { RepeatView, Target } from "../islands/CardPanel.tsx";
import { boardAudience } from "../lib/audience.ts";
import { board as readBoard, columnName, columns as readColumns, fields as readFields, labels as readLabels, listBoards } from "../lib/boards.ts";
import { boardCards, cardDetail, whereIs } from "../lib/cards.ts";
import { chestToday } from "../lib/clock.ts";
import { db, type Sql } from "../lib/db.ts";
import { nameOf, people } from "../lib/people.ts";
import { grid, monthOf, shift, timelineDays, timelineStart, timelineStep, type CalendarMonth, type TimelineWindow } from "../shared/calendar.ts";
import { addDays, nextDue, type Repeat } from "../shared/repeat.ts";

// One board: its columns of cards (or a list, a calendar, a timeline), and
// the card asked in the address (?card=…) open in a panel beside it. Both
// are islands (the board's drag and drop, the card's changes); the page
// writes every date and name on the server, in the reader's language.
export async function boardPage({ member, locale: language, t, param, query, url }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const b = await readBoard(sql, member, param("id")).catch((error: unknown) => (error instanceof AppError && error.code === "not_found" ? notFound() : Promise.reject(error)));
  const [cols, labs, own, cards, audience] = await Promise.all([readColumns(sql, b.id, { words: t.templates.columns }), readLabels(sql, b.id), readFields(sql, b.id), boardCards(sql, b.id), boardAudience(b)]);
  const asked = query("card");
  let detail: Awaited<ReturnType<typeof cardDetail>> | null = null;
  let cardGone = false;
  if (asked) {
    try {
      detail = await cardDetail(sql, member, asked);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      cardGone = true;
    }
    // The card moved to another board since this address was made (an
    // older bell item or email): open it where it is now.
    if (detail && detail.boardId !== b.id) redirect(`/chest/boards/${detail.boardId}?card=${encodeURIComponent(detail.id)}`);
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
  const longDay = (d: string) => dayText(d, locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const shortDay = (d: string) => dayText(d, locale);
  const panel = detail ? {
    ...detail,
    createdWhen: relative(detail.createdAt, locale, now),
    dueLabel: detail.due ? longDay(detail.due) + (detail.dueTime ? " · " + detail.dueTime : "") : null,
    startLabel: detail.start ? longDay(detail.start) : null,
    thread: detail.thread.map(c => ({ ...c, when: relative(c.at, locale, now), date: formatDate(c.at, locale, { dateStyle: "long", timeStyle: "short", timeZone: member.timeZone }) })),
    // Dates in the history are written here, in the reader's language;
    // every value goes as words.
    history: detail.history.map(h => ({ id: h.id, actor: h.actor, kind: h.kind, when: relative(h.at, locale, now), data: words({ ...h.data, ...(typeof h.data["due"] === "string" ? { due: longDay(h.data["due"]) + (typeof h.data["time"] === "string" ? " · " + h.data["time"] : "") } : {}), ...(typeof h.data["start"] === "string" ? { start: longDay(h.data["start"]) } : {}) }) })),
    files: detail.files.map(f => ({ ...f, when: relative(f.at, locale, now) })),
    items: detail.items.map(i => ({ ...i, dueLabel: i.due ? shortDay(i.due) : null, late: !i.done && i.due !== null && i.due < day })),
  } : null;
  // Where the open card may go: the boards the member works on, and their
  // columns.
  const targets = panel && canWrite ? await moveTargets(sql, member, b.id, t) : [];
  // The cards this one may wait for: the others of the board, not done.
  const linkable = panel ? cards.filter(c => c.id !== panel.id && !c.done).map(c => ({ id: c.id, title: c.title })) : [];
  // Private: who sees it, said in the header.
  const others = b.people.filter(p => p.memberId !== member.id).length;
  const privacy = b.visibility === "private"
    ? (others === 0 && b.groups.length === 0 ? t.board.privateOnlyYou : [plural(t.board.privatePeople, b.people.length, locale), ...(b.groups.length > 0 ? [plural(t.board.privateGroups, b.groups.length, locale)] : [])].join(" · "))
    : null;
  const asView = query("view");
  const view = asView === "list" ? "list" : asView === "calendar" ? "calendar" : asView === "timeline" ? "timeline" : "board";
  const calendar = view === "calendar" ? calendarOf(monthOf(query("month"), day), day, locale) : null;
  const timeline = view === "timeline" ? timelineOf(timelineStart(query("from"), day), day, locale, cards, t.board.timeline.week) : null;
  const path = url.pathname;
  // The board's dates and numbers, written here (never in the browser).
  const written = { short: {} as Record<string, string>, long: {} as Record<string, string>, numbers: {} as Record<string, string> };
  for (const day of new Set(cards.flatMap(c => [c.due, c.start]).filter((d): d is string => !!d))) {
    written.short[day] = dayText(day, locale);
    written.long[day] = dayText(day, locale, { day: "numeric", month: "short", year: "numeric" });
  }
  const numberFields = new Set(own.filter(f => f.kind === "number").map(f => f.id));
  for (const c of cards) for (const [field, value] of Object.entries(c.values)) if (numberFields.has(field) && value !== "" && Number.isFinite(Number(value))) written.numbers[value] = numberFormat(locale).format(Number(value));
  return {
    title: panel ? `${panel.title} · ${b.name}` : b.name,
    body: (
      <div className={`board-page c-${b.color}`}>
        <Island name="AutoRefresh" props={{ seconds: 15 }} />
        {cardGone && <p className="notice card-gone" role="status">{t.board.cardGone}</p>}
        <Island name="BoardView" props={{
          board: { id: b.id, name: b.name, color: b.color, access: b.access, archived: b.archived, privacy },
          path,
          columns: cols,
          labels: labs,
          fields: own,
          cards,
          people: names,
          audience: audience.map(p => ({ ...p, name: p.id === member.id ? t.people.you : p.name })),
          me: member.id,
          today: day,
          locale,
          view,
          calendar,
          timeline,
          filter: { who: query("who") ?? "", label: query("label") ?? "" },
          written,
          t: { board: t.board, card: t.card, colors: t.colors, dialog: t.dialog },
        }} />
        {panel && (
          // One root per card: another card opened is a new panel (its
          // drafts, its focus), never the last one with new props.
          <Island name="CardPanel" id={`card-panel-${panel.id}`} props={{
            path,
            view: (() => { const q = new URLSearchParams(url.search); q.delete("card"); return q.toString(); })(),
            card: panel,
            board: { id: b.id, name: b.name, color: b.color, archived: b.archived, writable: canWrite && !b.archived },
            columns: cols,
            labels: labs,
            fields: own,
            targets,
            linkable,
            people: names,
            audience,
            repeat: repeatView(detail!, cols, b.id, day, locale, t),
            me: member.id,
            locale,
            t: { card: t.card, activity: t.activity, errors: { file_too_large: t.errors.file_too_large, file_missing: t.errors.file_missing, unavailable: t.errors.unavailable }, colors: t.colors, fields: t.fields, dialog: t.dialog, date: t.date, peoplePicker: t.peoplePicker, files: t.files },
          }} />
        )}
      </div>
    ),
  };
}

// A history line's values, as words for the page (ids, names, dates).
const words = (data: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : v === null || v === undefined ? "" : String(v)]));

// What the card says of its repeat, written here (dates and day names on
// the server: the browser's Intl may write them otherwise).
function repeatView(card: { due: string | null; done: boolean; archived: boolean; repeat: Repeat | null; next: { id: string; due: string | null } | null }, cols: { id: string; name: string; done: boolean }[], boardId: string, day: string, locale: Locale, t: Catalogue): RepeatView {
  const dateOf = (d: string) => dayText(d, locale, { weekday: "long", day: "numeric", month: "long" });
  const dayName = (weekday: number, style: "long" | "short") => dateFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + weekday, 12)));
  // Monday first, as the week is read in Europe; Sunday is 0.
  const days = [1, 2, 3, 4, 5, 6, 0].map(value => ({ value, short: dayName(value, "short"), long: dayName(value, "long") }));
  const rule = card.repeat;
  let summary: string | null = null;
  if (rule) {
    const words = t.card.repeats;
    summary = rule.every === "week"
      ? format(words.week, { days: listFormat(locale).format(days.filter(d => rule.days.includes(d.value)).map(d => d.long)) })
      : rule.every === "month" ? (rule.day === 31 ? words.monthLast : format(words.month, { day: rule.day })) : words[rule.every];
  }
  const lane = cols.find(c => !c.done);
  const upcoming = rule && !card.next && !card.archived && lane ? format(t.card.repeatNext, { column: lane.name, date: dateOf(nextDue(rule, card.due ?? addDays(day, -1), day)) }) : null;
  const made = card.next ? { text: format(t.card.repeatMade, { date: card.next.due ? dateOf(card.next.due) : t.card.noDue }), href: `/chest/boards/${boardId}?card=${card.next.id}` } : null;
  return { summary, upcoming, made, days, today: day };
}

// The boards a card may move or be copied to (those the member works on,
// not archived), with their columns; this board first.
async function moveTargets(sql: Sql, member: Member, boardId: string, t: Catalogue): Promise<Target[]> {
  const mine = (await listBoards(sql, member)).filter(x => x.access === "write" || x.access === "own");
  if (mine.length === 0) return [];
  const rows = await sql<{ id: string; board_id: string; name: string; key: string | null }[]>`select id, board_id, name, key from columns where board_id in ${sql(mine.map(x => x.id))} and archived_at is null order by position, id`;
  return mine
    .map(x => ({ id: x.id, name: x.id === boardId ? format(t.card.thisBoard, { name: x.name }) : x.name, columns: rows.filter(r => String(r.board_id) === x.id).map(r => ({ id: String(r.id), name: columnName(r.name, r.key, t.templates.columns) })) }))
    .filter(x => x.columns.length > 0)
    .sort((a, c) => Number(c.id === boardId) - Number(a.id === boardId));
}

// The calendar's month, written on the server: its title, the days' names
// (Monday first), the weeks, the neighbouring months.
function calendarOf(month: string, today: string, locale: Locale): CalendarMonth {
  const f = (options: Intl.DateTimeFormatOptions) => dateFormat(locale, { timeZone: "UTC", ...options });
  const title = f({ month: "long", year: "numeric" }).format(new Date(month + "-15T12:00:00Z"));
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map(i => new Date(Date.UTC(2026, 0, 5 + i, 12))).map(d => ({ short: f({ weekday: "short" }).format(d), long: f({ weekday: "long" }).format(d) }));
  const long = f({ weekday: "long", day: "numeric", month: "long" });
  const weeks = grid(month).map(week => week.map(date => ({ date, day: Number(date.slice(8)), inMonth: date.startsWith(month), label: long.format(new Date(date + "T12:00:00Z")) })));
  return { month, title: title.charAt(0).toLocaleUpperCase(locale) + title.slice(1), weekdays, weeks, prev: shift(month, -1), next: shift(month, 1), today, current: today.slice(0, 7) };
}

// The timeline's six weeks, written on the server: each day's number,
// weekday and name, the month where it starts, the neighbouring windows;
// and the name of every day a card starts or is due on (for the bars'
// labels).
function timelineOf(first: string, today: string, locale: Locale, cards: { start: string | null; due: string | null }[], weekWords: string): TimelineWindow {
  const f = (options: Intl.DateTimeFormatOptions) => dateFormat(locale, { timeZone: "UTC", ...options });
  const at = (d: string) => new Date(d + "T12:00:00Z");
  const dates = Array.from({ length: timelineDays }, (_, i) => addDays(first, i));
  const long = f({ weekday: "long", day: "numeric", month: "long" });
  const names: Record<string, string> = {};
  for (const d of [...dates, ...cards.flatMap(c => [c.start, c.due]).filter((x): x is string => !!x)]) names[d] ??= long.format(at(d));
  const month = f({ month: "short" });
  const letter = f({ weekday: "narrow" });
  const days = dates.map((date, i) => ({ date, day: Number(date.slice(8)), weekday: letter.format(at(date)), month: i === 0 || date.endsWith("-01") ? month.format(at(date)) : null }));
  const range = f({ day: "numeric", month: "short", year: "numeric" });
  const brief = f({ day: "numeric", month: "short" });
  const short: Record<string, string> = {};
  for (const d of Object.keys(names)) short[d] = brief.format(at(d));
  const weeks = Array.from({ length: Math.ceil(timelineDays / 7) }, (_, i) => addDays(first, i * 7)).map(d => ({ first: d, label: format(weekWords, { date: brief.format(at(d)) }) }));
  return { first, title: range.formatRange(at(first), at(dates.at(-1)!)), days, prev: addDays(first, -timelineStep), next: addDays(first, timelineStep), current: timelineStart(undefined, today), today, names, weeks, short };
}

// A card's address by its id: bell items, emails and calendar events point
// here, and it opens the card on the board it is on now — a card moved to
// another board since is still found. A card gone, or on a board the
// member does not see, is "Nothing here" (a private board does not leak).
export async function cardAddress({ member, param }: PageContext): Promise<View> {
  const id = param("id");
  const boardId = await whereIs(db(), member, id).catch((error: unknown) => (error instanceof AppError ? notFound() : Promise.reject(error)));
  return redirect(`/chest/boards/${boardId}?card=${encodeURIComponent(id)}`);
}
