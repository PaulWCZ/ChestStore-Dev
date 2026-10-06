import { call, navigate, refresh, toast, type Outcome } from "@argentic/chest-app/client";
import { Avatar, EmptyState, Filters, Segmented, Tabs } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Check, Lock, Plus } from "../components/icons.tsx";
import { StayLink } from "../components/stay-link.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, formatDay, plural } from "../i18n/format.ts";
import { features as featureKeys, overlaps, type Feature, type Part } from "../lib/model.ts";

export type DeskTile = {
  id: string;
  name: string;
  features: Feature[];
  // Given to someone: them (mine: to the person booked for), and whether
  // they lend it that day (away).
  assigned: { mine: boolean; name: string; lent: boolean } | null;
  bookings: { id: string; part: Part; mine: boolean; name: string; photo: string | null }[];
};
type Area = { id: string; name: string; kept: { name: string; mine: boolean } | null; desks: DeskTile[] };
type Floor = { id: string; name: string; areas: Area[] };
export type DeskWords = {
  desks: Catalogue["desks"];
  parts: Catalogue["parts"];
  features: Catalogue["features"];
  featuresShort: Catalogue["featuresShort"];
  keptFor: string;
  filters: Catalogue["kit"]["filters"];
};

type State = "free" | "mine" | "taken" | "assigned" | "yours" | "kept";

// locked: why the day cannot be booked (hint: the words saying so);
// forWhom: an admin booking for someone else, else null.
export function DeskView({ floors, day, part, view, wanted, locked, hint, forWhom, links, locale, t }: {
  floors: Floor[];
  day: string;
  part: Part;
  view: "plan" | "list";
  wanted: Feature[];
  locked: "past" | "closed" | "notYet" | null;
  hint: string;
  forWhom: { id: string; name: string } | null;
  links: { parts: Record<Part, string>; views: Record<"plan" | "list", string>; params: Record<string, string | undefined> };
  locale: string;
  t: DeskWords;
}) {
  // Bookings made or freed here show at once; the page refreshed by
  // call() brings the server's answer, and the local marks go with it.
  const [mine, setMine] = useState<Record<string, string | null>>({});
  // What an Undo answers the toast: true, or why it did not work.
  const undone = (r: Outcome<unknown>) => (r.ok ? true : r.message);

  function stateOf(d: DeskTile, area: Area): { state: State; holders: DeskTile["bookings"]; myBooking: string | null } {
    const local = mine[d.id];
    const relevant = d.bookings.filter(b => overlaps(b.part, part));
    const own = local !== undefined ? local : relevant.find(b => b.mine)?.id ?? null;
    const others = relevant.filter(b => !b.mine);
    if (d.assigned && !d.assigned.lent) return { state: d.assigned.mine ? "yours" : "assigned", holders: [], myBooking: null };
    if (own) return { state: "mine", holders: others, myBooking: own };
    if (others.length > 0) return { state: "taken", holders: others, myBooking: null };
    if (area.kept && !area.kept.mine) return { state: "kept", holders: [], myBooking: null };
    return { state: "free", holders: [], myBooking: null };
  }

  async function book(d: DeskTile) {
    // One desk at a time: a desk of mine at that time moves here.
    const moved = Object.fromEntries(floors.flatMap(f => f.areas.flatMap(a => a.desks.map(x => [x, a] as const))).filter(([x, a]) => stateOf(x, a).state === "mine").map(([x]) => [x.id, null]));
    setMine(m => ({ ...m, ...moved, [d.id]: "pending" }));
    const r = await call("bookDesk", { deskId: d.id, day, part, move: true, ...(forWhom ? { for: forWhom.id } : {}) });
    setMine({});
    // Refused (someone just took it): the plan as it is now.
    if (!r.ok) return void refresh();
    toast({
      id: "desk-" + d.id + "-" + day,
      text: format(t.desks.booked, { desk: d.name, day: formatDay(day, locale) }),
      undo: async () => undone(await call("undoDesk", { bookingId: r.value.id, replaced: r.value.replaced }, { quiet: true })),
    });
  }

  async function free(d: DeskTile, bookingId: string) {
    setMine(m => ({ ...m, [d.id]: null }));
    const r = await call("cancelDesk", { bookingId });
    setMine(m => { const n = { ...m }; delete n[d.id]; return n; });
    if (!r.ok) return;
    toast({
      id: "desk-" + d.id + "-" + day,
      text: format(t.desks.cancelled, { desk: d.name }),
      undo: async () => undone(await call("restoreDesk", { bookingId }, { quiet: true })),
    });
  }

  const matches = (d: DeskTile) => wanted.every(f => d.features.includes(f));
  const freeDesks = floors.flatMap(f => f.areas.flatMap(a => a.desks.filter(d => matches(d) && stateOf(d, a).state === "free").map(d => ({ d, floor: f.name, area: a.name }))));
  // A tile says what a desk offers in words (two at most, then "+1").
  const offers = (d: DeskTile) => d.features.slice(0, 2).map(k => t.featuresShort[k]).join(" · ") + (d.features.length > 2 ? ` +${d.features.length - 2}` : "");

  function label(d: DeskTile, s: ReturnType<typeof stateOf>): string {
    const what = d.features.length > 0 ? " " + format(t.desks.offers, { list: d.features.map(k => t.features[k]).join(", ") }) : "";
    if (locked) return format(t.desks.tileLocked, { desk: d.name }) + what;
    if (s.state === "free" && d.assigned?.lent) return format(t.desks.tileLent, { desk: d.name, name: d.assigned.name }) + what;
    if (s.state === "free") return format(t.desks.tileFree, { desk: d.name }) + what;
    if (s.state === "mine") return format(t.desks.tileMine, { desk: d.name });
    if (s.state === "taken") return format(t.desks.tileTaken, { desk: d.name, name: s.holders.map(h => h.name).join(", ") });
    if (s.state === "kept") return format(t.desks.tileKept, { desk: d.name });
    return format(t.desks.tileAssigned, { desk: d.name, name: d.assigned?.name ?? "" });
  }

  return (
    <div className="stack desk-page">
      {/* Two rows, each fitting a phone: when (the kit's Segmented) and
          the plan or the list (the kit's Tabs); then what a desk offers —
          several at once (the kit's Filters, a multiple group: f=screen,dock). */}
      <div className="toolbar desk-toolbar">
        <Segmented label={t.desks.part} name="part" value={part} options={(["day", "am", "pm"] as const).map(p => ({ value: p, label: t.parts[p] }))}
          onChange={p => void navigate(links.parts[p], { top: false })} />
        <Tabs label={t.desks.view} current={view} link={props => <StayLink {...props} />}
          items={[{ id: "plan", label: t.desks.plan, href: links.views.plan }, { id: "list", label: t.desks.list, href: links.views.list }]} />
      </div>
      <Filters path="/chest/desks" params={links.params} link={props => <StayLink {...props} />} labels={t.filters} className="feature-filters"
        groups={[{ key: "f", label: t.desks.filters, multiple: true, options: featureKeys.map(f => ({ value: f, label: t.features[f] })) }]} />
      <p id="desk-places" tabIndex={-1} className={"hint" + (locked ? " is-locked" : "")} aria-live="polite">
        {locked ? hint : <>{plural(t.desks.freeCount, freeDesks.length, locale)} · {hint}</>}
      </p>
      {view === "plan" ? (
        floors.map(f => (
          <section key={f.id} className="floor" aria-labelledby={"floor-" + f.id}>
            <h2 id={"floor-" + f.id} className="annotation">{f.name}</h2>
            {f.areas.map(a => (
              <div key={a.id} className="area">
                <h3 className="area-name">{a.name}{a.kept && <span className="kept"><Lock />{format(t.keptFor, { group: a.kept.name })}</span>}</h3>
                <ul className="tiles">
                  {a.desks.map(d => {
                    const s = stateOf(d, a);
                    const dim = !matches(d);
                    const clickable = !locked && (s.state === "free" || (s.state === "mine" && s.myBooking !== "pending"));
                    return (
                      <li key={d.id} className={"tile is-" + (locked && s.state === "free" ? "locked" : s.state) + (dim ? " is-dim" : "")}>
                        <button type="button" disabled={!clickable} aria-label={label(d, s)} onClick={() => (s.state === "free" ? void book(d) : s.myBooking && s.myBooking !== "pending" ? void free(d, s.myBooking) : undefined)}>
                          <span className="tile-name">{d.name}</span>
                          <span className="tile-state">
                            {s.state === "free" && !locked && <><Plus />{t.desks.free}</>}
                            {s.state === "free" && locked === "notYet" && t.desks.notYet}
                            {s.state === "free" && !locked && d.assigned?.lent && <span className="lent">{format(t.desks.lentBy, { name: d.assigned.name.split(" ")[0] ?? d.assigned.name })}</span>}
                            {s.state === "mine" && <><Check />{forWhom ? forWhom.name.split(" ")[0] : t.desks.you}</>}
                            {s.state === "taken" && s.holders.map(h => <span key={h.id} className="holder"><Avatar name={h.name} photo={h.photo} size="s" /><span>{part === "day" && h.part !== "day" ? format(t.desks.halfTaken, { part: t.parts[h.part], name: h.name.split(" ")[0] ?? h.name }) : h.name.split(" ")[0]}</span></span>)}
                            {s.state === "assigned" && format(t.desks.assignedTo, { name: d.assigned?.name.split(" ")[0] ?? "" })}
                            {s.state === "yours" && t.desks.yours}
                            {s.state === "kept" && <><Lock />{t.desks.kept}</>}
                          </span>
                          <span className="tile-features" aria-hidden="true">{offers(d)}</span>
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
        <EmptyState title={locked ? hint : t.desks.noneFree} />
      ) : (
        <ul className="rows">
          {freeDesks.map(({ d, floor, area }) => (
            <li key={d.id} className="row-item">
              <span className="mono strong">{d.name}</span>
              <span className="grow">
                <span>{area}</span> <span className="muted">· {floor}</span>
                <span className="features-inline">{d.features.map(k => t.features[k]).join(" · ")}</span>
                {d.assigned?.lent && <span className="features-inline">{format(t.desks.lentBy, { name: d.assigned.name })}</span>}
              </span>
              <button type="button" className="button small" disabled={locked !== null} onClick={() => void book(d)}>{t.desks.book}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
