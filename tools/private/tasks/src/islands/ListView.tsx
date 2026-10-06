import { AvatarStack } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Alert, Blocked } from "../components/icons.tsx";
import { onLinkClick } from "@argentic/chest-app/client";
import { dayText, intl, numberFormat, plural } from "../i18n/format.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { Column, Field, Label } from "../lib/boards.ts";
import type { CardSummary } from "../lib/cards.ts";
import { addDays } from "../shared/repeat.ts";
import type { People } from "./BoardView.tsx";

type Words = { board: Catalogue["board"]; card: Catalogue["card"]; colors: Catalogue["colors"] };
type SortKey = "title" | "column" | "people" | "start" | "due";
type GroupKey = "none" | "column" | "person" | "due";

// The board as a table: sort by any heading, group by column, person or
// due date, done cards hidden unless asked. Each title opens its card.
export function ListView({ query, columns, cards, labels, fields, people, today, locale, t }: { query: (change: Record<string, string>) => string; columns: Column[]; cards: CardSummary[]; labels: Label[]; fields: Field[]; people: People; today: string; locale: Locale; t: Words }) {
  const [sort, setSort] = useState<{ key: SortKey; up: boolean } | null>(null);
  const [group, setGroup] = useState<GroupKey>("none");
  const [showDone, setShowDone] = useState(false);
  const w = t.board.list;
  const order = new Map(columns.map((c, i) => [c.id, i]));
  const columnOf = (c: CardSummary) => columns.find(k => k.id === c.columnId);
  const nameOf = (id: string) => people[id]?.name ?? "";
  const dateOf = (day: string, year = false) => dayText(day, locale, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
  const hidden = cards.filter(c => c.done).length;

  const rows = (() => {
    const list = cards.filter(c => showDone || !c.done).map(c => ({ card: c, index: (order.get(c.columnId) ?? 0) * 100000 + cards.indexOf(c) }));
    const by: Record<SortKey, (c: CardSummary) => string | number> = {
      title: c => c.title.toLocaleLowerCase(intl(locale)),
      column: c => order.get(c.columnId) ?? 0,
      people: c => c.assignees.map(nameOf).sort().join(", ").toLocaleLowerCase(intl(locale)) || "￿",
      start: c => c.start ?? "9999",
      due: c => (c.due ?? "9999") + (c.dueTime ?? ""),
    };
    list.sort((a, b) => {
      if (!sort) return a.index - b.index;
      const x = by[sort.key](a.card), y = by[sort.key](b.card);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), intl(locale));
      return (sort.up ? d : -d) || a.index - b.index;
    });
    return list.map(r => r.card);
  })();

  // Groups, in a sensible order: columns as on the board, people by name
  // (nobody last), dates from late to later (none last).
  const groups: { key: string; title: string; cards: CardSummary[] }[] = [];
  const add = (key: string, title: string, card: CardSummary) => {
    let g = groups.find(x => x.key === key);
    if (!g) groups.push((g = { key, title, cards: [] }));
    g.cards.push(card);
  };
  for (const card of rows) {
    if (group === "none") add("all", "", card);
    else if (group === "column") add(card.columnId, columnOf(card)?.name ?? "", card);
    else if (group === "person") {
      if (card.assignees.length === 0) add("~", w.nobody, card);
      else for (const a of card.assignees) add(a, nameOf(a), card);
    } else {
      const state = !card.due ? "none" : card.due < today ? "late" : card.due === today ? "today" : card.due <= addDays(today, 7) ? "soon" : "later";
      add(state, w.dueGroups[state], card);
    }
  }
  const rank = { late: 0, today: 1, soon: 2, later: 3, none: 4 } as Record<string, number>;
  if (group === "column") groups.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  if (group === "person") groups.sort((a, b) => (a.key === "~" ? 1 : b.key === "~" ? -1 : a.title.localeCompare(b.title, intl(locale))));
  if (group === "due") groups.sort((a, b) => (rank[a.key] ?? 9) - (rank[b.key] ?? 9));

  const href = (id: string) => query({ card: id });
  const heading = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort?.key === key ? (sort.up ? "ascending" : "descending") : undefined}>
      <button type="button" className="sort" onClick={() => setSort(sort?.key === key ? (sort.up ? { key, up: false } : null) : { key, up: true })}>
        {label}<span aria-hidden="true" className="arrow">{sort?.key === key ? (sort.up ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="table-wrap">
      <div className="list-tools">
        <label className="row small">
          <span className="label">{w.groupBy}</span>
          <select className="select compact" value={group} onChange={e => setGroup(e.target.value as GroupKey)}>
            <option value="none">{w.groupNone}</option>
            <option value="column">{w.column}</option>
            <option value="person">{w.assignees}</option>
            <option value="due">{w.due}</option>
          </select>
        </label>
        <label className="row small check-line">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          {plural(w.showDone, hidden, locale)}
        </label>
      </div>
      {rows.length === 0 ? <p className="muted">{w.empty}</p> : groups.map(g => (
        <section key={g.key} className="list-group" aria-label={g.title || undefined}>
          {g.title && <h2 className="list-group-title">{g.title} <span className="chip">{g.cards.length}</span></h2>}
          <table className="cards">
            <thead>
              <tr>
                {heading("title", w.title)}
                {heading("column", w.column)}
                {heading("people", w.assignees)}
                {heading("start", w.start)}
                {heading("due", w.due)}
                <th scope="col">{w.labels}</th>
                {fields.map(f => <th key={f.id} scope="col">{f.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {g.cards.map(card => {
                const state = !card.due || card.done ? "" : card.due < today ? "due-late" : card.due === today ? "due-today" : "";
                return (
                  <tr key={card.id} className={card.done ? "is-done" : undefined}>
                    <td><a href={href(card.id)} onClick={e => onLinkClick(e, { top: false })}>{card.title}</a></td>
                    <td>{columnOf(card)?.name}</td>
                    <td><AvatarStack people={card.assignees.map(a => ({ id: a, name: nameOf(a) || "?", photo: people[a]?.photo ?? null }))} max={4} size="s" labels={{ more: t.board.othersAssigned }} lang={locale} /></td>
                    <td>{card.start && dateOf(card.start)}</td>
                    <td>{card.due && <Due card={card} state={state} text={dateOf(card.due, true)} t={t} />}</td>
                    <td><span className="row">{card.labels.map(id => labels.find(l => l.id === id)).filter((l): l is Label => !!l).map(l => <span key={l.id} className={`chip label-chip c-${l.color}`}>{l.name || t.colors[l.color]}</span>)}</span></td>
                    {fields.map(f => <td key={f.id} className={f.kind === "number" ? "number" : undefined}>{f.kind === "number" && card.values[f.id] ? numberFormat(locale).format(Number(card.values[f.id])) : card.values[f.id] ?? ""}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* On a phone, the same rows as stacked cards: no sideways scroll. */}
          <ul className="list-cards">
            {g.cards.map(card => {
              const state = !card.due || card.done ? "" : card.due < today ? "due-late" : card.due === today ? "due-today" : "";
              const cardLabels = card.labels.map(id => labels.find(l => l.id === id)).filter((l): l is Label => !!l);
              const blocked = !card.done && card.waiting !== 0;
              return (
                <li key={card.id} className={card.done ? "is-done" : undefined}>
                  <a href={href(card.id)} onClick={e => onLinkClick(e, { top: false })} className="list-card-title">{card.title}</a>
                  <span className="list-card-meta">
                    <span className="chip">{columnOf(card)?.name}</span>
                    {card.due && <Due card={card} state={state} text={dateOf(card.due)} t={t} />}
                    {blocked && <span className="chip blocked"><Blocked />{t.card.blockedBadge}</span>}
                    {cardLabels.map(l => <span key={l.id} className={`chip label-chip c-${l.color}`}>{l.name || t.colors[l.color]}</span>)}
                    {card.assignees.length > 0 && <span className="push"><AvatarStack people={card.assignees.map(a => ({ id: a, name: nameOf(a) || "?", photo: people[a]?.photo ?? null }))} max={3} size="s" labels={{ more: t.board.othersAssigned }} lang={locale} /></span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}


// A due date: late says so in a word and a sign, not only by its colour.
function Due({ card, state, text, t }: { card: CardSummary; state: string; text: string; t: Words }) {
  return <span className={`chip ${state}`}>{state === "due-late" && <><Alert />{t.card.late} · </>}{text}{card.dueTime && " · " + card.dueTime}</span>;
}
