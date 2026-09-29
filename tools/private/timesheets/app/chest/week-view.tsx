"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type KeyboardEvent } from "react";
import { Back, Close, Copy, Lock, Next, Plus } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { WorkPicker, type PickerProject } from "../../components/work-picker.tsx";
import { readWork } from "../../lib/work.ts";
import { formatDuration, parseDuration } from "../../lib/duration.ts";
import type { DayEntry, GridRow } from "../../lib/entries.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format, plural } from "../../lib/i18n/format.ts";
import { addRow, copyLastWeek, removeRow, restoreEntries, saveCell } from "./actions.ts";
import { DayPanel } from "./day-panel.tsx";

export type DayInfo = { day: string; weekday: string; date: string; long: string; today: boolean; locked: boolean };
export type DayItem = DayEntry & { span: string | null };
export type WeekWords = { week: Catalogue["week"]; day: Catalogue["day"]; work: Catalogue["work"]; errors: Catalogue["errors"]; timer: Catalogue["timer"] };

const rowName = (r: GridRow) => (r.taskName ? `${r.projectName} · ${r.taskName}` : r.projectName);
const link = (week: string, day?: string) => `/chest?week=${week}${day ? `&day=${day}` : ""}`;

export function WeekView(props: {
  monday: string; previous: string; next: string; thisWeek: boolean; title: string; days: DayInfo[]; rows: GridRow[]; selected: string; items: DayItem[];
  projects: PickerProject[]; lock: { text: string; short: string } | null; locale: string; t: WeekWords;
}) {
  const { t, days, monday } = props;
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(props.rows);
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  useEffect(() => setRows(props.rows), [props.rows]);

  const totals = days.map((_, i) => rows.reduce((n, r) => n + r.cells[i]!.minutes, 0));
  const total = totals.reduce((a, b) => a + b, 0);
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[code], values));

  function commit(ri: number, ci: number, text: string): boolean {
    const minutes = parseDuration(text);
    if (minutes === null) {
      toast(format(t.week.badDuration, { value: text.trim() }));
      return false;
    }
    const row = rows[ri];
    if (!row) return true;
    const before = row.cells[ci]!;
    if (minutes === before.minutes) return true;
    const put = (cell: GridRow["cells"][number]) => setRows(list => list.map((r, i) => (i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? cell : c)) } : r)));
    put({ ...before, minutes, count: minutes ? 1 : 0, note: minutes ? before.note : "" });
    start(async () => {
      const r = await saveCell({ projectId: row.projectId, taskId: row.taskId, day: days[ci]!.day, minutes });
      if (!r.ok) {
        put(before);
        fail(r.error, r.values);
      }
    });
    return true;
  }

  function remove(row: GridRow) {
    const input = { week: monday, projectId: row.projectId, taskId: row.taskId };
    setRows(list => list.filter(r => r !== row));
    start(async () => {
      const r = await removeRow(input);
      if (!r.ok) {
        setRows(props.rows);
        return fail(r.error, r.values);
      }
      const ids = r.value;
      toast(t.week.rowRemoved, { label: t.timer.undo, run: () => start(async () => { const u = await restoreEntries(ids, input); if (!u.ok) fail(u.error, u.values); router.refresh(); }) });
    });
  }

  function copy() {
    start(async () => {
      const r = await copyLastWeek(monday);
      if (!r.ok) return fail(r.error, r.values);
      toast(r.value > 0 ? plural(t.week.copied, r.value, props.locale) : t.week.nothingToCopy);
    });
  }

  const selectedDay = days.find(d => d.day === props.selected) ?? days[0]!;
  const selectedIndex = days.indexOf(selectedDay);
  return (
    <div className="week">
      <header className="week-head">
        <div className="week-title">
          <h1>{props.title}</h1>
          <nav className="week-nav" aria-label={t.week.title}>
            <Link className="button icon quiet" href={link(props.previous)} aria-label={t.week.previous} title={t.week.previous}><Back /></Link>
            {!props.thisWeek && <Link className="button quiet small" href="/chest">{t.week.thisWeek}</Link>}
            <Link className="button icon quiet" href={link(props.next)} aria-label={t.week.next} title={t.week.next}><Next /></Link>
          </nav>
        </div>
        <div className="week-total">
          <span className="label">{t.week.total}</span>
          <span className="num big">{formatDuration(total)}</span>
        </div>
      </header>

      {props.lock && days.some(d => d.locked) && <p className="notice"><Lock /><span>{props.lock.text}</span></p>}

      <div className="grid-area">
        {rows.length > 0 ? (
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col" className="row-head">{t.week.project}</th>
                  {days.map(d => (
                    <th key={d.day} scope="col" className={`day-head${d.today ? " today" : ""}${d.day === props.selected ? " chosen" : ""}${d.locked ? " locked" : ""}`}>
                      <Link href={link(monday, d.day)} aria-label={d.long} aria-current={d.day === props.selected ? "date" : undefined}>
                        <span className="wd">{d.weekday}</span><span className="dn num">{d.date}</span>
                      </Link>
                      {d.locked && <span className="lock-mark" title={props.lock?.short}><Lock /><span className="visually-hidden">{t.week.locked}</span></span>}
                    </th>
                  ))}
                  <th scope="col" className="sum">{t.week.total}</th>
                  <th scope="col"><span className="visually-hidden">{t.week.rowActions}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => {
                  const rowTotal = r.cells.reduce((n, c) => n + c.minutes, 0);
                  return (
                    <tr key={`${r.projectId}:${r.taskId ?? ""}`} className={r.writable ? "" : "closed"}>
                      <th scope="row" className="row-head">
                        <span className={`swatch c-${r.color}`} aria-hidden="true" />
                        <span className="row-name">
                          <span className="p">{r.projectName}{r.taskName && <span className="k"> · {r.taskName}</span>}</span>
                          <span className="c">{r.clientName ?? t.work.noClient}{!r.writable && <span className="tag" title={t.week.closedHint}>{t.week.closed}</span>}</span>
                        </span>
                      </th>
                      {r.cells.map((c, ci) => {
                        const d = days[ci]!;
                        const label = format(t.week.cell, { row: rowName(r), day: d.long });
                        const classes = `cell${d.today ? " today" : ""}${d.day === props.selected ? " chosen" : ""}`;
                        if (c.count > 1) {
                          return <td key={d.day} className={classes}><Link className="several num" href={link(monday, d.day)} aria-label={`${label}: ${formatDuration(c.minutes)}. ${format(t.week.several, { count: c.count })}`} title={format(t.week.several, { count: c.count })}>{formatDuration(c.minutes)}<span className="dots" aria-hidden="true">··</span></Link></td>;
                        }
                        if (!r.writable || d.locked) {
                          return <td key={d.day} className={classes + " ro"}><span className="num" aria-label={`${label}: ${formatDuration(c.minutes)}`}>{c.minutes ? formatDuration(c.minutes) : ""}</span></td>;
                        }
                        return <td key={d.day} className={classes}><CellInput minutes={c.minutes} label={label} ri={ri} ci={ci} commit={commit} /></td>;
                      })}
                      <td className="sum num">{formatDuration(rowTotal)}</td>
                      <td className="row-end">
                        {r.writable && !r.cells.some((c, i) => c.minutes > 0 && days[i]!.locked) && (
                          <button type="button" className="button icon link" aria-label={format(t.week.removeRow, { name: rowName(r) })} title={format(t.week.removeRow, { name: rowName(r) })} onClick={() => remove(r)}><Close /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="row-head">{t.week.total}</th>
                  {totals.map((m, i) => <td key={days[i]!.day} className={`num${days[i]!.today ? " today" : ""}${days[i]!.day === props.selected ? " chosen" : ""}`}>{formatDuration(m)}</td>)}
                  <td className="sum num">{formatDuration(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty grid-empty">
            <h2>{t.week.empty.title}</h2>
            <p>{t.week.empty.body}</p>
          </div>
        )}
        <div className="grid-actions">
          {adding ? (
            <AddRow projects={props.projects} t={t} onCancel={() => setAdding(false)} onAdd={w => {
              start(async () => {
                const r = await addRow({ week: monday, ...w });
                if (!r.ok) return fail(r.error, r.values);
                setAdding(false);
              });
            }} />
          ) : (
            <>
              {props.projects.length > 0 && <button type="button" className="button quiet" onClick={() => setAdding(true)}><Plus />{t.week.addRow}</button>}
              <button type="button" className="button quiet" onClick={copy}><Copy />{t.week.copy}</button>
              {rows.length > 0 && <p className="hint">{t.week.hint}</p>}
            </>
          )}
        </div>
      </div>

      <nav className="day-strip" aria-label={t.week.days}>
        <Link className="strip-step" href={link(props.previous)} aria-label={t.week.previous}><Back /></Link>
        {days.map((d, i) => (
          <Link key={d.day} href={link(monday, d.day)} className={`strip-day${d.today ? " today" : ""}`} aria-current={d.day === props.selected ? "date" : undefined} aria-label={`${d.long}: ${formatDuration(totals[i]!)}`}>
            <span className="wd">{d.weekday}</span>
            <span className="dn num">{d.date}</span>
            <span className="tt num">{totals[i] ? formatDuration(totals[i]!) : "–"}</span>
          </Link>
        ))}
        <Link className="strip-step" href={link(props.next)} aria-label={t.week.next}><Next /></Link>
      </nav>

      <DayPanel key={props.selected} day={selectedDay} total={totals[selectedIndex] ?? 0} items={props.items} projects={props.projects} lock={props.lock} t={t} />
    </div>
  );
}

// A cell: what is typed is read when leaving it (Tab, Enter, a click
// elsewhere). Enter and the arrows go down and up the column.
function CellInput({ minutes, label, ri, ci, commit }: { minutes: number; label: string; ri: number; ci: number; commit: (ri: number, ci: number, text: string) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const shown = minutes ? formatDuration(minutes) : "";
  const move = (to: number) => (document.querySelector(`[data-cell="${to}:${ci}"]`) as HTMLInputElement | null)?.focus();
  function leave() {
    if (draft === null) return;
    const ok = draft === shown || commit(ri, ci, draft);
    setInvalid(!ok);
    setDraft(null);
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      leave();
      move(ri + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      leave();
      move(ri - 1);
    } else if (e.key === "Escape") {
      setDraft(null);
      setInvalid(false);
    }
  }
  return (
    <input
      className={`cell-input num${invalid ? " invalid" : ""}`}
      data-cell={`${ri}:${ci}`}
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={draft ?? shown}
      placeholder="–"
      maxLength={12}
      autoComplete="off"
      spellCheck={false}
      onFocus={e => { setDraft(shown); e.currentTarget.select(); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={leave}
      onKeyDown={key}
    />
  );
}

function AddRow({ projects, t, onAdd, onCancel }: { projects: PickerProject[]; t: WeekWords; onAdd: (w: { projectId: string; taskId: string | null }) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form className="add-row" onSubmit={e => { e.preventDefault(); const w = readWork(value); if (w) onAdd(w); }}>
      <WorkPicker id="add-row" projects={projects} value={value} onChange={setValue} t={t.work} />
      <button type="submit" className="button" disabled={!value}><Plus />{t.week.add}</button>
      <button type="button" className="button link" onClick={onCancel}>{t.week.cancel}</button>
    </form>
  );
}
