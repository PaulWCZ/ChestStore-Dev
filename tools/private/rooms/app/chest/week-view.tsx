"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ComponentType } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Desk, Door, Laptop, Moon, Plan } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format, formatDay, plural } from "../../lib/i18n/format.ts";
import type { Part, Status } from "../../lib/model.ts";
import { bookDesk, cancelDesk, restoreDesk, setPresence } from "./actions.ts";

export type WeekDay = {
  day: string;
  week: 0 | 1;
  label: string;
  short: string;
  isToday: boolean;
  past: boolean;
  me: Status | null;
  others: { id: string; name: string; photo: string | null }[];
  desks: { id: string; name: string; area: string; part: Part }[];
  rooms: { id: string; room: string; span: string; title: string; by: string | null }[];
  usualFree: boolean;
};

type Words = {
  week: Catalogue["week"];
  status: Catalogue["status"];
  parts: Catalogue["parts"];
  days: Catalogue["days"];
  errors: Catalogue["errors"];
  undo: string;
  you: string;
};

const icons: Record<Status, ComponentType> = { office: Plan, remote: Laptop, off: Moon };

export function WeekView({ days, officeId, focus, usual, self, locale, t }: {
  days: WeekDay[];
  self: { name: string; photo: string | null };
  officeId: string;
  focus: string | null;
  usual: { id: string; name: string; areaName: string; assigned: boolean } | null;
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  // What the member just chose shows at once; the server's answer follows.
  const [chosen, setChosen] = useState<Record<string, Status | null>>({});
  useEffect(() => setChosen({}), [days]);
  useEffect(() => {
    if (focus) document.getElementById("day-" + focus)?.scrollIntoView({ block: "center" });
  }, [focus]);

  const fail = (error: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[error], values));

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
        toast(format(t.week.deskFreed, { desk: names }), {
          label: t.undo,
          run: () => start(async () => {
            await setPresence(day.day, previous?.status ?? null, previous?.officeId ?? null);
            for (const id of freed) {
              const back = await restoreDesk(id);
              if (!back.ok) fail(back.error, back.values);
            }
            router.refresh();
          }),
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
      toast(format(t.week.deskBooked, { desk: r.value.deskName, day: formatDay(day.day, locale) }), {
        label: t.undo,
        run: () => start(async () => { await cancelDesk(r.value.id); router.refresh(); }),
      });
      router.refresh();
    });
  }

  function free(day: WeekDay, desk: WeekDay["desks"][number]) {
    start(async () => {
      const r = await cancelDesk(desk.id);
      if (!r.ok) return fail(r.error, r.values);
      toast(format(t.week.deskCancelled, { desk: desk.name, day: formatDay(day.day, locale) }), {
        label: t.undo,
        run: () => start(async () => {
          const back = await restoreDesk(desk.id);
          if (!back.ok) fail(back.error, back.values);
          router.refresh();
        }),
      });
      router.refresh();
    });
  }

  return (
    <div className="weeks">
      {([0, 1] as const).map(w => (
        <section key={w} className="week" aria-labelledby={"week-" + w}>
          <h2 id={"week-" + w} className="annotation">{w === 0 ? t.week.thisWeek : t.week.nextWeek}</h2>
          <ol className="days">
            {days.filter(d => d.week === w).map(d => {
              const me = chosen[d.day] !== undefined ? chosen[d.day]! : d.me;
              const count = d.others.length + (me === "office" ? 1 : 0);
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
                  <div className="choice-row" role="radiogroup" aria-label={format(t.week.whereOn, { day: d.label })}>
                    {(["office", "remote", "off"] as const).map(s => {
                      const Icon = icons[s];
                      return (
                        <button key={s} type="button" role="radio" aria-checked={me === s} className={"seg seg-" + s} disabled={d.past} onClick={() => say(d, s)}>
                          <Icon /><span>{t.status[s]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="present">
                    <span className="stack-avatars" aria-hidden="true">
                      {me === "office" && <span className="me-dot" title={t.you}><Avatar name={self.name} photo={self.photo} size={28} /></span>}
                      {d.others.slice(0, 5).map(p => <Avatar key={p.id} name={p.name} photo={p.photo} size={28} />)}
                      {d.others.length > 5 && <span className="avatar more">+{d.others.length - 5}</span>}
                    </span>
                    <Link href={`/chest/people?day=${d.day}`} className="present-link">
                      {plural(t.week.inOffice, count, locale)}
                      {d.others.length > 0 && <span className="visually-hidden">: {d.others.map(p => p.name).join(", ")}</span>}
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
                        </li>
                      ))}
                    </ul>
                  )}
                  {me === "office" && !d.past && d.desks.length === 0 && (
                    <div className="suggest">
                      {usual?.assigned ? (
                        <span className="muted"><Desk /> {format(t.week.yourDesk, { desk: usual.name })}</span>
                      ) : (
                        <>
                          {usual && d.usualFree && <button type="button" className="button small" onClick={() => bookUsual(d)}><Desk />{format(t.week.bookUsual, { desk: usual.name })}</button>}
                          {usual && !d.usualFree && <span className="muted small">{format(t.week.usualTaken, { desk: usual.name })}</span>}
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
    </div>
  );
}
