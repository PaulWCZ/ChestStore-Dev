import { call, toast } from "@argentic/chest-app/client";
import { EmptyState, StatusBadge } from "@argentic/chest-ui/components";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Back, Check, Close, Copy, Lock, Next, Note, Plus, Send } from "../components/icons.tsx";
import { WorkPicker, type PickerProject } from "../components/work-picker.tsx";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { DayEntry, GridRow } from "../lib/entries.ts";
import type { WeekStatus } from "../lib/weeks.ts";
import { formatDuration, parseDuration } from "../shared/duration.ts";
import { readWork } from "../shared/work.ts";
import { DayPanel } from "./DayPanel.tsx";

// My week (src/pages/Week.tsx): the grid of the week, its standing in the
// approval, the strip of days (on a phone) and the chosen day's list. One
// island, keyed by its Monday (another week is another island: nothing
// typed in one shows in the next). Every change is an action (call()),
// shown at once and put right by the page the server sends back.
export type DayInfo = { day: string; weekday: string; date: string; long: string; today: boolean; locked: boolean };
export type DayItem = DayEntry & { span: string | null };
export type WeekWords = { week: Catalogue["week"]; day: Catalogue["day"]; work: Catalogue["work"]; errors: Catalogue["errors"]; timer: Catalogue["timer"] };
// Where the week stands in the approval: its status, and the sentence that
// says it ("Approved by Camille on 3 Oct", "Sent back by Camille: …").
// `early`: this week, before its Friday — sending it is possible (someone
// off at the end of the week), not suggested.
export type WeekStanding = { status: WeekStatus; text: string | null; reason: string | null; canSubmit: boolean; approvals: boolean; early: boolean };

const rowName = (r: GridRow) => (r.taskName ? `${r.projectName} · ${r.taskName}` : r.projectName);
const link = (week: string, day?: string) => `/chest?week=${week}${day ? `&day=${day}` : ""}`;

export function WeekView(props: {
  monday: string; previous: string; next: string; thisWeek: boolean; title: string; days: DayInfo[]; rows: GridRow[]; selected: string; items: DayItem[];
  projects: PickerProject[]; lock: { text: string; short: string } | null; standing: WeekStanding; locale: string; t: WeekWords;
  // A manager adds the projects: an empty tool speaks to them as such.
  canManage?: boolean;
}) {
  const { t, days, monday, standing } = props;
  const [rows, setRows] = useState(props.rows);
  const [pending, setPending] = useState(false);
  // One step at a time (an action and its refresh), in the order asked.
  const start = (run: () => Promise<unknown>) => {
    setPending(true);
    void run().finally(() => setPending(false));
  };
  const [adding, setAdding] = useState(false);
  const [noting, setNoting] = useState<{ ri: number; ci: number } | null>(null);
  useEffect(() => setRows(props.rows), [props.rows]);
  // A week sent for approval, or approved, is read-only for its person.
  const closed = standing.status === "submitted" || standing.status === "approved";

  const totals = days.map((_, i) => rows.reduce((n, r) => n + r.cells[i]!.minutes, 0));
  const total = totals.reduce((a, b) => a + b, 0);

  function put(ri: number, ci: number, cell: GridRow["cells"][number]) {
    setRows(list => list.map((r, i) => (i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? cell : c)) } : r)));
  }

  function commit(ri: number, ci: number, text: string): boolean {
    const minutes = parseDuration(text);
    if (minutes === null) {
      toast({ id: "cell", text: format(t.week.badDuration, { value: text.trim() }), tone: "error" });
      return false;
    }
    const row = rows[ri];
    if (!row) return true;
    const before = row.cells[ci]!;
    if (minutes === before.minutes) return true;
    put(ri, ci, { ...before, minutes, count: minutes ? 1 : 0, note: minutes ? before.note : "" });
    start(async () => {
      // What the person typed goes as typed: the server reads it again.
      const r = await call("saveCell", { projectId: row.projectId, taskId: row.taskId, day: days[ci]!.day, duration: text });
      if (!r.ok) put(ri, ci, before);
    });
    return true;
  }

  function note(ri: number, ci: number, text: string) {
    const cell = rows[ri]?.cells[ci];
    if (!cell?.entryId) return;
    const before = cell;
    put(ri, ci, { ...cell, note: text });
    setNoting(null);
    start(async () => {
      const r = await call("setNote", { id: cell.entryId!, note: text });
      if (!r.ok) return put(ri, ci, before);
      toast({ id: "note", text: t.week.noteSaved });
    });
  }

  function openNote(ri: number, ci: number) {
    if (!rows[ri]?.cells[ci]?.entryId) return void toast({ id: "note", text: t.week.noteFirst });
    setNoting({ ri, ci });
  }

  function remove(row: GridRow) {
    const input = { week: monday, projectId: row.projectId, taskId: row.taskId };
    setRows(list => list.filter(r => r !== row));
    start(async () => {
      const r = await call("removeRow", input);
      if (!r.ok) return setRows(props.rows);
      const ids = r.value;
      toast({
        id: `row-${row.projectId}-${row.taskId ?? ""}`,
        text: t.week.rowRemoved,
        undo: async () => {
          const u = await call("restoreEntries", { ids, row: input }, { quiet: true });
          return u.ok || u.message;
        },
      });
    });
  }

  function copy() {
    start(async () => {
      const r = await call("copyLastWeek", { week: monday });
      if (!r.ok) return;
      toast({ id: "copy", text: r.value > 0 ? plural(t.week.copied, r.value, props.locale) : t.week.nothingToCopy });
    });
  }

  function send() {
    start(async () => {
      const r = await call("submitWeek", { week: monday });
      if (!r.ok) return;
      // Undo takes the week back (the managers' bell item goes with it).
      toast({
        id: "week",
        // Nobody else may approve it (the only manager's week): said.
        text: r.value.approvers === 0 ? t.week.sentNobody : t.week.sent,
        undo: async () => {
          const u = await call("withdrawWeek", { week: monday }, { quiet: true });
          return u.ok || u.message;
        },
      });
    });
  }

  function takeBack() {
    start(async () => {
      const r = await call("withdrawWeek", { week: monday });
      if (!r.ok) return;
      toast({ id: "week", text: t.week.takenBack });
    });
  }

  const selectedDay = days.find(d => d.day === props.selected) ?? days[0]!;
  const selectedIndex = days.indexOf(selectedDay);
  const noProjects = props.projects.length === 0;
  return (
    <div>
      <header className="week-head">
        <div className="week-title">
          <h1>{props.title}</h1>
          <nav className="week-nav" aria-label={t.week.title}>
            <a className="button icon quiet step" href={link(props.previous)} aria-label={t.week.previous} title={t.week.previous}><Back /></a>
            {!props.thisWeek && <a className="button quiet small" href="/chest">{t.week.thisWeek}</a>}
            <a className="button icon quiet step" href={link(props.next)} aria-label={t.week.next} title={t.week.next}><Next /></a>
          </nav>
        </div>
        <div className="week-total">
          <span className="label">{t.week.total}</span>
          <span className="num big">{formatDuration(total)}</span>
        </div>
      </header>

      {standing.approvals && (standing.status !== "open" || (standing.canSubmit && total > 0)) && (
        <div className={`standing ${standing.status}`} role="status">
          {standing.status === "open" && (standing.early ? (
            <>
              <span>{t.week.sendEarlyHint}</span>
              <button type="button" className="button quiet" disabled={pending} onClick={send}><Send />{t.week.sendEarly}</button>
            </>
          ) : (
            <>
              <span>{t.week.sendHint}</span>
              <button type="button" className="button" disabled={pending} onClick={send}><Send />{t.week.send}</button>
            </>
          ))}
          {standing.status === "submitted" && (
            <>
              <span className="state"><Send /><span>{t.week.submitted}</span></span>
              <button type="button" className="button link" disabled={pending} onClick={takeBack}>{t.week.takeBack}</button>
            </>
          )}
          {standing.status === "approved" && <span className="state"><Check /><span>{standing.text}</span></span>}
          {standing.status === "returned" && (
            <>
              <span className="state"><span>{standing.text} {standing.reason && <q className="reason">{standing.reason}</q>}</span></span>
              <button type="button" className="button" disabled={pending} onClick={send}><Send />{t.week.sendAgain}</button>
            </>
          )}
        </div>
      )}

      {props.lock && days.some(d => d.locked) && <p className="notice"><Lock /><span>{props.lock.text}</span></p>}

      <div className="grid-area">
        {rows.length > 0 ? (
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col" className="row-head">{t.week.project}</th>
                  {days.map(d => (
                    <th key={d.day} scope="col" className={`day-head${d.today ? " today" : ""}${d.day === props.selected ? " chosen" : ""}`}>
                      <a href={link(monday, d.day)} aria-label={d.long} aria-current={d.day === props.selected ? "date" : undefined}>
                        <span className="wd">{d.weekday}</span><span className="dn num">{d.date}</span>
                      </a>
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
                          <span className="c">{r.clientName ?? t.work.noClient}{!r.writable && <span title={t.week.closedHint}><StatusBadge tone="neutral" size="s" label={t.week.closed} /></span>}</span>
                        </span>
                      </th>
                      {r.cells.map((c, ci) => {
                        const d = days[ci]!;
                        const label = format(t.week.cell, { row: rowName(r), day: d.long });
                        const classes = `cell${d.today ? " today" : ""}${d.day === props.selected ? " chosen" : ""}`;
                        if (c.count > 1) {
                          return <td key={d.day} className={classes}><a className="several num" href={link(monday, d.day)} aria-label={`${label}: ${formatDuration(c.minutes)}. ${format(t.week.several, { count: c.count })}`} title={format(t.week.several, { count: c.count })}>{formatDuration(c.minutes)}<span className="dots" aria-hidden="true">··</span></a></td>;
                        }
                        if (!r.writable || d.locked || closed || c.invoiced) {
                          const why = c.invoiced ? ` (${t.week.invoiced})` : "";
                          return (
                            <td key={d.day} className={classes + " ro"}>
                              <span className="num" aria-hidden="true" title={c.note || undefined}>{c.minutes ? formatDuration(c.minutes) : ""}</span>
                              <span className="visually-hidden">{`${label}: ${formatDuration(c.minutes)}${why}${c.note ? `. ${c.note}` : ""}`}</span>
                              {c.note && <span className="note-dot" aria-hidden="true" />}
                            </td>
                          );
                        }
                        return (
                          <td key={d.day} className={classes} data-noted={c.note ? "" : undefined}>
                            <CellInput minutes={c.minutes} label={label} note={c.note} ri={ri} ci={ci} commit={commit} onNote={openNote} />
                            {c.entryId && (
                              <button type="button" className={`note-button${c.note ? " has" : ""}`} tabIndex={-1} title={c.note || t.week.addNote} aria-label={format(t.week.noteFor, { cell: label })} onClick={() => openNote(ri, ci)}><Note /></button>
                            )}
                            {noting && noting.ri === ri && noting.ci === ci && (
                              <NotePopover label={format(t.week.noteFor, { cell: label })} initial={c.note} t={t} onSave={text => note(ri, ci, text)} onClose={() => {
                                setNoting(null);
                                (document.querySelector(`[data-cell="${ri}:${ci}"]`) as HTMLInputElement | null)?.focus();
                              }} />
                            )}
                          </td>
                        );
                      })}
                      <td className="sum num">{formatDuration(rowTotal)}</td>
                      <td className="row-end">
                        {r.writable && !closed && !r.cells.some((c, i) => (c.minutes > 0 && days[i]!.locked) || c.invoiced) && (
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
          noProjects && props.canManage
            ? <EmptyState title={t.week.empty.managerTitle} body={t.week.empty.noProjectsManager} />
            : <EmptyState title={t.week.empty.title} body={noProjects ? t.week.empty.noProjects : t.week.empty.body} />
        )}
        {!closed && !noProjects && (
          <div className="grid-actions">
            {adding ? (
              <AddRow projects={props.projects} t={t} onCancel={() => setAdding(false)} onAdd={w => {
                start(async () => {
                  const r = await call("addRow", { week: monday, ...w });
                  if (r.ok) setAdding(false);
                });
              }} />
            ) : (
              <>
                <button type="button" className="button quiet" onClick={() => setAdding(true)}><Plus />{t.week.addRow}</button>
                <button type="button" className="button quiet" onClick={copy}><Copy />{t.week.copy}</button>
                {rows.length > 0 && <p className="hint">{t.week.hint}</p>}
              </>
            )}
          </div>
        )}
      </div>

      <nav className="day-strip" aria-label={t.week.days}>
        <a className="strip-step" href={link(props.previous)} aria-label={t.week.previous}><Back /></a>
        {days.map((d, i) => (
          <a key={d.day} href={link(monday, d.day)} className={`strip-day${d.today ? " today" : ""}`} aria-current={d.day === props.selected ? "date" : undefined} aria-label={`${d.long}: ${formatDuration(totals[i]!)}`}>
            <span className="wd">{d.weekday}</span>
            <span className="dn num">{d.date}</span>
            <span className="tt num">{totals[i] ? formatDuration(totals[i]!) : "–"}</span>
          </a>
        ))}
        <a className="strip-step" href={link(props.next)} aria-label={t.week.next}><Next /></a>
      </nav>

      <DayPanel key={props.selected} day={{ ...selectedDay, locked: selectedDay.locked || closed }} total={totals[selectedIndex] ?? 0} items={props.items} projects={props.projects} lock={closed ? null : props.lock} t={t} />
    </div>
  );
}

// A cell: what is typed is read when leaving it (Tab, Enter, a click
// elsewhere). Enter and the arrows go down and up the column; Shift+Enter
// opens the cell's note.
function CellInput({ minutes, label, note, ri, ci, commit, onNote }: { minutes: number; label: string; note: string; ri: number; ci: number; commit: (ri: number, ci: number, text: string) => boolean; onNote: (ri: number, ci: number) => void }) {
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
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      leave();
      onNote(ri, ci);
    } else if (e.key === "Enter" || e.key === "ArrowDown") {
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
      aria-label={note ? `${label}. ${note}` : label}
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

// The note of a cell: what the time was for, as the client's invoice will
// say it. Enter saves (Shift+Enter a new line), Escape closes.
function NotePopover({ label, initial, t, onSave, onClose }: { label: string; initial: string; t: WeekWords; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { area.current?.focus(); area.current?.select(); }, []);
  return (
    <div className="note-popover" role="dialog" aria-label={label} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <label className="label" htmlFor="cell-note">{t.week.note}</label>
      <textarea id="cell-note" ref={area} className="field" rows={3} maxLength={500} value={text} placeholder={t.day.notePlaceholder}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(text); } }} />
      <div className="row">
        <button type="button" className="button small" onClick={() => onSave(text)}>{t.day.save}</button>
        <button type="button" className="button link small" onClick={onClose}>{t.day.cancel}</button>
      </div>
    </div>
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
