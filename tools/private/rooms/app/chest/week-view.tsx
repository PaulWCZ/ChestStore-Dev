"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvatarStack, Dialog, Segmented, useToast } from "@argentic/chest-ui/components";
import { useEffect, useRef, useState, useTransition, type ComponentType, type KeyboardEvent } from "react";
import { CalendarAdd, Check, Desk, Door, Download, Laptop, Moon, Plan, Repeat } from "../../components/icons.tsx";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format, formatDay, plural } from "../../lib/i18n/format.ts";
import type { Result } from "../../lib/errors.ts";
import type { Part, Status } from "../../lib/model.ts";
import { bookDesk, cancelDesk, checkIn, restoreDesk, setPresence, setUsualWeek } from "./actions.ts";

export type WeekDay = {
  day: string;
  week: 0 | 1;
  label: string;
  short: string;
  isToday: boolean;
  past: boolean;
  me: Status | null;
  // Colleagues at the office, my teams first (team: shares a group with me).
  others: { id: string; name: string; photo: string | null; team: boolean }[];
  desks: { id: string; name: string; area: string; part: Part }[];
  rooms: { id: string; room: string; span: string; title: string; by: string | null; checkable: boolean }[];
  usualFree: boolean;
  // My own desk, lent that day to this person.
  lentTo: string | null;
};

type Words = {
  week: Catalogue["week"];
  usual: Catalogue["usual"];
  status: Catalogue["status"];
  parts: Catalogue["parts"];
  days: Catalogue["days"];
  errors: Catalogue["errors"];
  dialog: Catalogue["dialog"];
  you: string;
  checkIn: string;
  checkedIn: string;
};

type Pattern = { days: Partial<Record<number, Status>>; deskId: string | null; lendDesk: boolean };

const icons: Record<Status, ComponentType> = { office: Plan, remote: Laptop, off: Moon };
const choices = ["office", "remote", "off"] as const;
// Faces shown, "+n" included: few enough that every face stays readable.
const faces = 4;

export function WeekView({ days, officeId, focus, usual, pattern, weekdays, desks, calendarPage, self, locale, t }: {
  days: WeekDay[];
  self: { name: string; photo: string | null };
  officeId: string;
  focus: string | null;
  usual: { id: string; name: string; areaName: string; assigned: boolean } | null;
  pattern: Pattern;
  weekdays: { day: number; name: string }[];
  desks: { id: string; name: string; mine: boolean }[];
  calendarPage: string | null;
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  // What the member just chose shows at once; the server's answer follows.
  const [chosen, setChosen] = useState<Record<string, Status | null>>({});
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => setChosen({}), [days]);
  useEffect(() => {
    if (focus) document.getElementById("day-" + focus)?.scrollIntoView({ block: "center" });
  }, [focus]);

  const fail = (error: keyof Catalogue["errors"], values?: Record<string, string | number>) => void toast({ text: format(t.errors[error], values), tone: "error" });
  // What an Undo answers the toast: true, or why it did not work.
  const undone = (r: Result<unknown>) => (r.ok ? true : format(t.errors[r.error], r.values));

  function say(day: WeekDay, status: Status) {
    const before = chosen[day.day] !== undefined ? chosen[day.day]! : day.me;
    if (before === status) return;
    setChosen(c => ({ ...c, [day.day]: status }));
    start(async () => {
      const r = await setPresence(day.day, status, status === "office" ? officeId : null);
      if (!r.ok) {
        setChosen(c => ({ ...c, [day.day]: before }));
        return fail(r.error, r.values);
      }
      const { previous, freed } = r.value;
      if (freed.length > 0) {
        const names = day.desks.map(d => d.name).join(", ");
        toast({
          id: "presence-" + day.day,
          text: format(t.week.deskFreed, { desk: names }),
          undo: async () => {
            const said = await setPresence(day.day, previous?.status ?? null, previous?.officeId ?? null);
            if (!said.ok) return undone(said);
            for (const id of freed) {
              const back = await restoreDesk(id);
              if (!back.ok) return undone(back);
            }
            router.refresh();
            return true;
          },
        });
      }
      router.refresh();
    });
  }

  function bookUsual(day: WeekDay) {
    if (!usual) return;
    start(async () => {
      const r = await bookDesk(usual.id, day.day, "day");
      if (!r.ok) return fail(r.error, r.values);
      toast({
        id: "desk-" + r.value.id,
        text: format(t.week.deskBooked, { desk: r.value.deskName, day: formatDay(day.day, locale) }),
        undo: async () => {
          const back = await cancelDesk(r.value.id);
          router.refresh();
          return undone(back);
        },
      });
      router.refresh();
    });
  }

  function here(bookingId: string) {
    start(async () => {
      const r = await checkIn(bookingId);
      if (!r.ok) return fail(r.error, r.values);
      toast(t.checkedIn);
      router.refresh();
    });
  }

  function free(day: WeekDay, desk: WeekDay["desks"][number]) {
    start(async () => {
      const r = await cancelDesk(desk.id);
      if (!r.ok) return fail(r.error, r.values);
      toast({
        id: "desk-" + desk.id,
        text: format(t.week.deskCancelled, { desk: desk.name, day: formatDay(day.day, locale) }),
        undo: async () => {
          const back = await restoreDesk(desk.id);
          router.refresh();
          return undone(back);
        },
      });
      router.refresh();
    });
  }

  const hasPattern = Object.keys(pattern.days).length > 0;
  const summary = weekdays.filter(w => pattern.days[w.day] === "office").map(w => w.name).join(", ");

  return (
    <div className="weeks">
      <div className="usual-bar">
        <button type="button" className="button quiet" onClick={() => setEditing(true)}><Repeat />{t.usual.open}</button>
        <span className="hint">{hasPattern ? (summary ? format(t.usual.summary, { days: summary }) : t.usual.summaryNone) : t.usual.pitch}</span>
      </div>
      {([0, 1] as const).map(w => (
        <section key={w} className="week" aria-labelledby={"week-" + w}>
          <h2 id={"week-" + w} className="annotation">{w === 0 ? t.week.thisWeek : t.week.nextWeek}</h2>
          <ol className="days">
            {days.filter(d => d.week === w).map(d => {
              const me = chosen[d.day] !== undefined ? chosen[d.day]! : d.me;
              const count = d.others.length + (me === "office" ? 1 : 0);
              // Me first (ringed in orange), then my teams, then the others.
              const faceList = [...(me === "office" ? [{ id: "me", name: self.name, photo: self.photo }] : []), ...d.others];
              const names = [...(me === "office" ? [t.you] : []), ...d.others.map(p => p.name)].join(", ");
              return (
                <li key={d.day} id={"day-" + d.day} className={"day-card" + (d.isToday ? " is-today" : "") + (d.past ? " is-past" : "") + (me ? " is-" + me : "") + (focus === d.day ? " is-focus" : "")}>
                  <div className="day-head">
                    <h3>
                      <span className="day-long">{d.label}</span>
                      <span className="day-short" aria-hidden="true">{d.short}</span>
                    </h3>
                    {d.isToday && <span className="tag">{t.days.today}</span>}
                    {d.past && <span className="tag quiet">{t.week.past}</span>}
                  </div>
                  <Choice day={d} me={me} label={format(t.week.whereOn, { day: d.label })} t={t} onSay={s => say(d, s)} />
                  <div className={"present" + (me === "office" ? " me-in" : "")}>
                    {faceList.length > 0 && <AvatarStack people={faceList} max={faces} size="s" label={names} />}
                    <Link href={`/chest/people?day=${d.day}`} className="present-link">
                      {plural(t.week.inOffice, count, locale)}
                      {d.others.some(p => p.team) && <span className="team-count"> · {plural(t.week.team, d.others.filter(p => p.team).length, locale)}</span>}
                    </Link>
                  </div>
                  {(d.desks.length > 0 || d.rooms.length > 0) && (
                    <ul className="bookings">
                      {d.desks.map(b => (
                        <li key={"d" + b.id} className="booking is-mine">
                          <Desk />
                          <span className="booking-text">
                            <strong>{format(t.week.myDesk, { desk: b.name })}</strong>
                            <span className="muted"> · {b.area}{b.part !== "day" ? " · " + t.parts[b.part] : ""}</span>
                          </span>
                          {!d.past && <button type="button" className="link-button" onClick={() => free(d, b)}>{t.week.cancelDesk}</button>}
                        </li>
                      ))}
                      {d.rooms.map(b => (
                        <li key={"r" + b.id} className="booking">
                          <Door />
                          <Link className="booking-text" href={`/chest/rooms?day=${d.day}&booking=${b.id}`}>
                            <strong className="mono">{b.span}</strong> <strong>{b.room}</strong>
                            {b.title && <span> · {b.title}</span>}
                            {b.by && <span className="muted"> · {b.by}</span>}
                          </Link>
                          {b.checkable && <button type="button" className="button small" onClick={() => here(b.id)}><Check />{t.checkIn}</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.lentTo && !d.past && <p className="suggest hint">{format(me === "office" ? t.week.lentBack : t.week.lent, { desk: usual?.name ?? "", name: d.lentTo })}</p>}
                  {me === "office" && !d.past && d.desks.length === 0 && (
                    <div className="suggest">
                      {usual?.assigned && !d.lentTo ? (
                        <span className="muted"><Desk /> {format(t.week.yourDesk, { desk: usual.name })}</span>
                      ) : (
                        <>
                          {usual && !usual.assigned && d.usualFree && <button type="button" className="button small" onClick={() => bookUsual(d)}><Desk />{format(t.week.bookUsual, { desk: usual.name })}</button>}
                          {usual && !usual.assigned && !d.usualFree && <span className="muted small">{format(t.week.usualTaken, { desk: usual.name })}</span>}
                          <Link className="button quiet small" href={`/chest/desks?day=${d.day}&office=${officeId}`}>{t.week.chooseDesk}</Link>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <footer className="week-foot">
        <a className="button quiet small" href="/chest/calendar/mine" download><CalendarAdd />{t.week.addAll}</a>
        <a className="button quiet small" href="/chest/mine" download><Download />{t.week.myData}</a>
        {calendarPage && <span className="hint">{t.week.inCalendar} <a href={calendarPage}>{t.week.calendarHow}</a></span>}
      </footer>
      <Dialog open={editing} title={t.usual.title} dirty={dirty} labels={t.dialog} onClose={() => { setEditing(false); setDirty(false); }}>
        {editing && <UsualForm pattern={pattern} weekdays={weekdays} desks={desks} assigned={usual?.assigned ? usual : null} t={t} onDirty={() => setDirty(true)}
          onSaved={applied => { setEditing(false); setDirty(false); toast({ id: "usual", text: applied > 0 ? plural(t.usual.saved, applied, locale) : t.usual.savedNone }); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

// Office / Remote / Off for one day: one Tab stop; the arrow keys move
// between the three, Enter or Space chooses (choosing frees a desk, so an
// arrow never chooses by itself).
function Choice({ day, me, label, t, onSay }: { day: WeekDay; me: Status | null; label: string; t: Words; onSay: (s: Status) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = me === null ? 0 : choices.indexOf(me);
  const [focusAt, setFocusAt] = useState(current);
  useEffect(() => setFocusAt(current), [current]);
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const move = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "Home" ? -9 : e.key === "End" ? 9 : 0;
    if (move === 0) return;
    e.preventDefault();
    const next = move === -9 ? 0 : move === 9 ? choices.length - 1 : (focusAt + move + choices.length) % choices.length;
    setFocusAt(next);
    refs.current[next]?.focus();
  }
  return (
    <div className="choice-row" role="radiogroup" aria-label={label} onKeyDown={key}>
      {choices.map((s, i) => {
        const Icon = icons[s];
        return (
          <button key={s} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={me === s} tabIndex={i === focusAt ? 0 : -1}
            className={"seg seg-" + s} disabled={day.past} onClick={() => onSay(s)}>
            <Icon /><span>{t.status[s]}</span>
          </button>
        );
      })}
    </div>
  );
}

// "My usual week": for each working day, where I usually am, and the desk
// I want on office days. Rooms then says it for me as the days come.
function UsualForm({ pattern, weekdays, desks, assigned, t, onDirty, onSaved }: {
  pattern: Pattern; weekdays: { day: number; name: string }[]; desks: { id: string; name: string; mine: boolean }[];
  assigned: { name: string } | null; t: Words; onDirty: () => void; onSaved: (applied: number) => void;
}) {
  const [days, setDaysNow] = useState<Partial<Record<number, Status>>>(pattern.days);
  const [deskId, setDeskIdNow] = useState(pattern.deskId ?? "");
  const [lend, setLendNow] = useState(pattern.lendDesk);
  // Anything chosen: closing the form asks first (the kit's Dialog).
  const setDays = (v: Partial<Record<number, Status>>) => { setDaysNow(v); onDirty(); };
  const setDeskId = (v: string) => { setDeskIdNow(v); onDirty(); };
  const setLend = (v: boolean) => { setLendNow(v); onDirty(); };
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  function save() {
    setError(null);
    start(async () => {
      const r = await setUsualWeek({ days: Object.fromEntries(weekdays.map(w => [String(w.day), days[w.day] ?? null])), deskId: deskId || null, lendDesk: lend });
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      onSaved(r.value.applied);
    });
  }
  return (
    <form className="stack usual-form" onSubmit={e => { e.preventDefault(); save(); }}>
      <p className="hint">{t.usual.body}</p>
      <ul className="usual-days">
        {weekdays.map(w => (
          <li key={w.day} className="usual-day">
            <span className="usual-name" aria-hidden="true">{w.name}</span>
            <Segmented label={w.name} name={"usual-" + w.day} value={days[w.day] ?? "none"}
              options={[...choices.map(s => ({ value: s, label: t.status[s] })), { value: "none" as const, label: t.usual.none }]}
              onChange={s => setDays({ ...days, [w.day]: s === "none" ? undefined : s })} />
          </li>
        ))}
      </ul>
      {assigned ? (
        <label className="check">
          <input type="checkbox" checked={lend} onChange={e => setLend(e.target.checked)} />
          {format(t.usual.lend, { desk: assigned.name })}
        </label>
      ) : (
        <label>
          <span className="label">{t.usual.desk}</span>
          <select className="select" value={deskId} onChange={e => setDeskId(e.target.value)}>
            <option value="">{t.usual.noDesk}</option>
            {desks.filter(d => !d.mine).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      <p className="hint">{t.usual.never}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row"><button type="submit" className="button" disabled={busy}>{t.usual.save}</button></div>
    </form>
  );
}
