"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ComponentType } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Check, Dock, Plus, Quiet, Screen, Standing, Window } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatDay, plural } from "../../../lib/i18n/format.ts";
import { features as featureKeys, overlaps, type Feature, type Part } from "../../../lib/model.ts";
import { bookDesk, cancelDesk, restoreDesk, undoDesk } from "../actions.ts";

export type DeskTile = {
  id: string;
  name: string;
  features: Feature[];
  assigned: { mine: boolean; name: string } | null;
  bookings: { id: string; part: Part; mine: boolean; name: string; photo: string | null }[];
};
type Floor = { id: string; name: string; areas: { id: string; name: string; desks: DeskTile[] }[] };
type Words = {
  desks: Catalogue["desks"];
  parts: Catalogue["parts"];
  features: Catalogue["features"];
  errors: Catalogue["errors"];
  undo: string;
  closedDay: string;
  past: string;
};

export const featureIcons: Record<Feature, ComponentType> = { screen: Screen, dock: Dock, standing: Standing, window: Window, quiet: Quiet };

type State = "free" | "mine" | "taken" | "assigned" | "yours";

export function DeskView({ floors, day, part, view, wanted, closed, past, links, rules, locale, t }: {
  floors: Floor[];
  day: string;
  part: Part;
  view: "plan" | "list";
  wanted: Feature[];
  closed: boolean;
  past: boolean;
  links: { parts: Record<Part, string>; views: Record<"plan" | "list", string>; features: Record<Feature, string> };
  rules: string;
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  // Bookings made or freed here show at once, before the page reloads.
  const [mine, setMine] = useState<Record<string, string | null>>({});
  const fail = (error: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[error], values));

  function stateOf(d: DeskTile): { state: State; holders: DeskTile["bookings"]; myBooking: string | null } {
    const local = mine[d.id];
    const relevant = d.bookings.filter(b => overlaps(b.part, part));
    const own = local !== undefined ? local : relevant.find(b => b.mine)?.id ?? null;
    const others = relevant.filter(b => !b.mine);
    if (d.assigned) return { state: d.assigned.mine ? "yours" : "assigned", holders: [], myBooking: null };
    if (own) return { state: "mine", holders: others, myBooking: own };
    if (others.length > 0) return { state: "taken", holders: others, myBooking: null };
    return { state: "free", holders: [], myBooking: null };
  }

  function book(d: DeskTile) {
    // One desk at a time: a desk of mine at that time moves here.
    const moved = Object.fromEntries(floors.flatMap(f => f.areas.flatMap(a => a.desks)).filter(x => stateOf(x).state === "mine").map(x => [x.id, null]));
    setMine(m => ({ ...m, ...moved, [d.id]: "pending" }));
    start(async () => {
      const r = await bookDesk(d.id, day, part, true);
      if (!r.ok) {
        setMine({});
        fail(r.error, r.values);
        router.refresh();
        return;
      }
      setMine(m => ({ ...m, [d.id]: r.value.id }));
      toast(format(t.desks.booked, { desk: d.name, day: formatDay(day, locale) }), {
        label: t.undo,
        run: () => start(async () => {
          const back = await undoDesk(r.value.id, r.value.replaced);
          if (!back.ok) fail(back.error, back.values);
          setMine({});
          router.refresh();
        }),
      });
      router.refresh();
    });
  }

  function free(d: DeskTile, bookingId: string) {
    setMine(m => ({ ...m, [d.id]: null }));
    start(async () => {
      const r = await cancelDesk(bookingId);
      if (!r.ok) {
        setMine(m => { const n = { ...m }; delete n[d.id]; return n; });
        return fail(r.error, r.values);
      }
      toast(format(t.desks.cancelled, { desk: d.name }), {
        label: t.undo,
        run: () => start(async () => {
          const back = await restoreDesk(bookingId);
          if (!back.ok) fail(back.error, back.values);
          router.refresh();
        }),
      });
      router.refresh();
    });
  }

  const matches = (d: DeskTile) => wanted.every(f => d.features.includes(f));
  const locked = closed || past;
  const freeDesks = floors.flatMap(f => f.areas.flatMap(a => a.desks.filter(d => matches(d) && stateOf(d).state === "free").map(d => ({ d, floor: f.name, area: a.name }))));

  function label(d: DeskTile, s: ReturnType<typeof stateOf>): string {
    if (s.state === "free") return format(t.desks.tileFree, { desk: d.name });
    if (s.state === "mine") return format(t.desks.tileMine, { desk: d.name });
    if (s.state === "taken") return format(t.desks.tileTaken, { desk: d.name, name: s.holders.map(h => h.name).join(", ") });
    return format(t.desks.tileAssigned, { desk: d.name, name: d.assigned?.name ?? "" });
  }

  return (
    <div className="stack desk-page">
      <div className="toolbar">
        <div className="segmented" role="group" aria-label={t.desks.part}>
          {(["day", "am", "pm"] as const).map(p => <Link key={p} href={links.parts[p]} aria-current={p === part ? "true" : undefined} scroll={false}>{t.parts[p]}</Link>)}
        </div>
        <div className="chips" role="group" aria-label={t.desks.filters}>
          {featureKeys.map(f => {
            const Icon = featureIcons[f];
            return <Link key={f} href={links.features[f]} className="chip" aria-current={wanted.includes(f) ? "true" : undefined} scroll={false}><Icon />{t.features[f]}</Link>;
          })}
        </div>
        <div className="segmented small" role="group" aria-label={t.desks.view}>
          <Link href={links.views.plan} aria-current={view === "plan" ? "true" : undefined} scroll={false}>{t.desks.plan}</Link>
          <Link href={links.views.list} aria-current={view === "list" ? "true" : undefined} scroll={false}>{t.desks.list}</Link>
        </div>
      </div>
      <p className="hint" aria-live="polite">
        {closed ? t.closedDay : past ? t.past : <>{plural(t.desks.freeCount, freeDesks.length, locale)} · {rules}</>}
      </p>
      {view === "plan" ? (
        floors.map(f => (
          <section key={f.id} className="floor" aria-labelledby={"floor-" + f.id}>
            <h2 id={"floor-" + f.id} className="annotation">{f.name}</h2>
            {f.areas.map(a => (
              <div key={a.id} className="area">
                <h3 className="area-name">{a.name}</h3>
                <ul className="tiles">
                  {a.desks.map(d => {
                    const s = stateOf(d);
                    const dim = !matches(d);
                    const clickable = !locked && (s.state === "free" || (s.state === "mine" && s.myBooking !== "pending"));
                    return (
                      <li key={d.id} className={"tile is-" + s.state + (dim ? " is-dim" : "")}>
                        <button type="button" disabled={!clickable} aria-label={label(d, s)} onClick={() => (s.state === "free" ? book(d) : s.myBooking && s.myBooking !== "pending" ? free(d, s.myBooking) : undefined)}>
                          <span className="tile-name">{d.name}</span>
                          <span className="tile-state">
                            {s.state === "free" && <><Plus />{t.desks.free}</>}
                            {s.state === "mine" && <><Check />{t.desks.you}</>}
                            {s.state === "taken" && s.holders.map(h => <span key={h.id} className="holder"><Avatar name={h.name} photo={h.photo} size={20} /><span>{part === "day" && h.part !== "day" ? format(t.desks.halfTaken, { part: t.parts[h.part], name: h.name.split(" ")[0] ?? h.name }) : h.name.split(" ")[0]}</span></span>)}
                            {s.state === "assigned" && format(t.desks.assignedTo, { name: d.assigned?.name.split(" ")[0] ?? "" })}
                            {s.state === "yours" && t.desks.yours}
                          </span>
                          <span className="tile-features" aria-hidden="true">
                            {d.features.map(k => { const Icon = featureIcons[k]; return <Icon key={k} />; })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))
      ) : freeDesks.length === 0 ? (
        <p className="empty small">{t.desks.noneFree}</p>
      ) : (
        <ul className="rows">
          {freeDesks.map(({ d, floor, area }) => (
            <li key={d.id} className="row-item">
              <span className="mono strong">{d.name}</span>
              <span className="grow">
                <span>{area}</span> <span className="muted">· {floor}</span>
                <span className="features-inline">{d.features.map(k => t.features[k]).join(" · ")}</span>
              </span>
              <button type="button" className="button small" disabled={locked} onClick={() => book(d)}>{t.desks.book}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
