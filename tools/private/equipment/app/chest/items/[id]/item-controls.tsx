"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Avatar } from "../../../../components/avatar.tsx";
import { Dialog } from "../../../../components/dialog.tsx";
import { Dots, Give, Pencil, Search, Seat, Sliders, TakeBack, Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import { chosenStatuses, fold, limits, type Status } from "../../../../lib/model.ts";
import type { Holder } from "../../../../lib/view.ts";
import { deleteItem, giveItem, giveSeat, restoreItem, setItemStatus, takeBackItem, takeSeat, undoTakeBack, undoTakeSeat } from "../../actions.ts";

type Words = { item: Catalogue["item"]; give: Catalogue["give"]; takeBack: Catalogue["takeBack"]; status: Catalogue["status"]; errors: Catalogue["errors"]; common: Catalogue["common"]; people: Catalogue["people"] };
type Colleague = { id: string; name: string; photo: string | null };
type SeatHolder = { member: string; name: string; photo: string | null; since: string };
type ItemInfo = { id: string; name: string; tag: string; status: Status; licence: boolean; seats: number; heldSince: string | null; placeName: string | null };

// Who has it, and the one action that follows: give it (in stock), take it
// back (held), a seat (licence). Rare actions — edit, status, delete — are
// in "More". Taking back and deleting offer Undo instead of a question.
export function ItemControls({ item, holder, holderText, seatHolders, team, places, today, locale, t }: {
  item: ItemInfo; holder: Holder; holderText: string; seatHolders: SeatHolder[]; team: Colleague[]; places: string[]; today: string; locale: string; t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"give" | "back" | "status" | "seat" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => setError(format(t.errors[r.error], r.values));
  const open = (d: typeof dialog) => { setError(null); setDialog(d); };
  const held = holder.kind === "member" || holder.kind === "place";

  function remove() {
    start(async () => {
      const r = await deleteItem(item.id);
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      toast(format(t.item.deleted, { name: item.name }), {
        label: t.common.undo,
        run: () => void restoreItem(item.id).then(u => { if (u.ok) router.push(`/chest/items/${item.id}`); else toast(format(t.errors[u.error], u.values)); }),
      });
      router.push("/chest/items");
    });
  }

  function dropSeat(s: SeatHolder) {
    start(async () => {
      const r = await takeSeat(item.id, s.member);
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      toast(t.takeBack.seatDone, s.member.startsWith("mbr_") ? { label: t.common.undo, run: () => void undoTakeSeat(item.id, s.member).then(() => router.refresh()) } : undefined);
      router.refresh();
    });
  }

  const more = (
    <details className="menu">
      <summary className="button quiet"><Dots /><span>{t.common.more}</span></summary>
      <div className="menu-list" role="group">
        <Link className="menu-item" href={`/chest/items/${item.id}/edit`}><Pencil />{t.common.edit}</Link>
        <button type="button" className="menu-item" onClick={() => open("status")}><Sliders />{t.item.status}</button>
        <button type="button" className="menu-item danger" onClick={remove} disabled={pending}><Trash />{t.common.delete}</button>
        <p className="menu-hint">{t.item.deleteHint}</p>
      </div>
    </details>
  );

  return (
    <section className="holder-panel" aria-label={t.item.with}>
      {item.licence ? (
        <>
          <div className="seats-head">
            <p className="holder-line"><strong>{format(t.item.seatsUsed, { used: seatHolders.length, seats: item.seats })}</strong></p>
            <meter className="seats-meter" min={0} max={Math.max(item.seats, 1)} value={seatHolders.length} aria-label={t.item.seatsTitle} />
            <p className="small muted">{plural(t.item.seatsFree, Math.max(item.seats - seatHolders.length, 0), locale)}</p>
          </div>
          {seatHolders.length === 0 ? <p className="muted">{t.item.noSeats}</p> : (
            <ul className="seat-list">
              {seatHolders.map((s, i) => (
                <li key={s.member + i}>
                  <Avatar name={s.name} photo={s.photo} size={28} />
                  <span className="seat-name">{s.name}<span className="small muted block">{s.since}</span></span>
                  <button type="button" className="button small quiet" disabled={pending} onClick={() => dropSeat(s)}><TakeBack /><span className="visually-hidden">{format(t.item.takeSeat, { name: s.name })}</span><span aria-hidden="true">{t.item.takeBack}</span></button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            {item.status !== "retired" && <button type="button" className="button" disabled={seatHolders.length >= item.seats} onClick={() => open("seat")}><Seat />{t.item.giveSeat}</button>}
            {more}
          </div>
        </>
      ) : (
        <>
          {holder.kind === "member" ? (
            <p className="holder-line"><Avatar name={holder.name} photo={holder.photo} size={40} /><span><strong className={holder.gone ? "gone" : undefined}>{holderText}</strong>{item.heldSince && <span className="muted block">{format(t.item.withSince, { date: item.heldSince })}</span>}</span></p>
          ) : holder.kind === "place" ? (
            <p className="holder-line"><strong>{format(t.item.atPlace, { place: holder.name })}</strong>{item.heldSince && <span className="muted block">{format(t.item.withSince, { date: item.heldSince })}</span>}</p>
          ) : (
            <p className="holder-line muted">{item.status === "in_stock" ? t.item.inStock : t.item.notAvailable}</p>
          )}
          <div className="row">
            {held ? (
              <>
                <button type="button" className="button" onClick={() => open("back")}><TakeBack />{t.item.takeBack}</button>
                <button type="button" className="button quiet" onClick={() => open("give")}><Give />{t.item.giveElse}</button>
              </>
            ) : item.status !== "retired" ? (
              <button type="button" className="button" onClick={() => open("give")}><Give />{t.item.give}</button>
            ) : null}
            {more}
          </div>
        </>
      )}

      <Dialog open={dialog === "give"} title={format(t.give.title, { name: item.name })} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <GiveForm item={item} team={team.filter(p => !(holder.kind === "member" && holder.id === p.id))} places={places} today={today} t={t} error={error} pending={pending}
          onSubmit={(to, note, day, label) => start(async () => {
            const r = await giveItem(item.id, { to, note, day });
            if (!r.ok) return fail(r);
            setDialog(null);
            toast("member" in to ? format(t.give.done, { name: label }) : format(t.give.moved, { place: label }));
            router.refresh();
          })} />
      </Dialog>
      <Dialog open={dialog === "seat"} title={format(t.give.seatTitle, { name: item.name })} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <PeoplePicker people={team.filter(p => !seatHolders.some(s => s.member === p.id))} t={t} error={error} pending={pending}
          onPick={p => start(async () => {
            const r = await giveSeat(item.id, p.id);
            if (!r.ok) return fail(r);
            setDialog(null);
            toast(format(t.give.seatDone, { name: p.name }));
            router.refresh();
          })} />
      </Dialog>
      <Dialog open={dialog === "back"} title={format(t.takeBack.title, { name: item.name })} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <BackForm from={holderText} today={today} t={t} error={error} pending={pending}
          onSubmit={(note, repair, day) => start(async () => {
            const r = await takeBackItem(item.id, { note, day, status: repair ? "in_repair" : "in_stock" });
            if (!r.ok) return fail(r);
            setDialog(null);
            const from = r.value;
            toast(format(repair ? t.takeBack.doneRepair : t.takeBack.done, { name: item.name }), { label: t.common.undo, run: () => void undoTakeBack(item.id, from).then(() => router.refresh()) });
            router.refresh();
          })} />
      </Dialog>
      <Dialog open={dialog === "status"} title={format(t.item.statusTitle, { name: item.name })} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <StatusForm item={item} t={t} error={error} pending={pending}
          onSubmit={(status, note) => start(async () => {
            const r = await setItemStatus(item.id, status, note);
            if (!r.ok) return fail(r);
            setDialog(null);
            router.refresh();
          })} />
      </Dialog>
    </section>
  );
}

// Everyone who has the tool, found by the start of a name (accents aside).
function PeoplePicker({ people, t, error, pending, onPick, picked }: { people: Colleague[]; t: Words; error: string | null; pending: boolean; onPick: (p: Colleague) => void; picked?: string }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const k = fold(q);
    return people.filter(p => !k || fold(p.name).split(" ").some(w => w.startsWith(k)) || fold(p.name).startsWith(k)).slice(0, 50);
  }, [people, q]);
  return (
    <div className="stack">
      <div className="search-field">
        <Search />
        <label className="visually-hidden" htmlFor="pick-q">{t.give.find}</label>
        <input id="pick-q" className="field" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.give.find} autoFocus autoComplete="off" />
      </div>
      {shown.length === 0 ? <p className="muted">{t.give.noOne}</p> : (
        <ul className="pick-list">
          {shown.map(p => (
            <li key={p.id}>
              <button type="button" className={p.id === picked ? "pick picked" : "pick"} aria-pressed={p.id === picked} disabled={pending} onClick={() => onPick(p)}>
                <Avatar name={p.name} photo={p.photo} size={28} /><span>{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function GiveForm({ item, team, places, today, t, error, pending, onSubmit }: {
  item: ItemInfo; team: Colleague[]; places: string[]; today: string; t: Words; error: string | null; pending: boolean;
  onSubmit: (to: { member: string } | { place: string }, note: string, day: string, label: string) => void;
}) {
  const [mode, setMode] = useState<"person" | "place">("person");
  const [person, setPerson] = useState<Colleague | null>(null);
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(today);
  const ready = mode === "person" ? person !== null : place.trim() !== "" && place.trim() !== item.placeName;
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      if (!ready) return;
      onSubmit(mode === "person" ? { member: person!.id } : { place: place.trim() }, note, day, mode === "person" ? person!.name : place.trim());
    }}>
      <div className="segmented" role="radiogroup" aria-label={t.item.with}>
        <label className={mode === "person" ? "on" : undefined}><input type="radio" name="give-mode" checked={mode === "person"} onChange={() => setMode("person")} />{t.give.toPerson}</label>
        <label className={mode === "place" ? "on" : undefined}><input type="radio" name="give-mode" checked={mode === "place"} onChange={() => setMode("place")} />{t.give.toPlace}</label>
      </div>
      {mode === "person" ? (
        <PeoplePicker people={team} t={t} error={null} pending={pending} picked={person?.id} onPick={setPerson} />
      ) : (
        <div className="form-field">
          <label className="label" htmlFor="give-place">{t.give.place}</label>
          <input id="give-place" className="field" list="give-places" value={place} onChange={e => setPlace(e.target.value)} maxLength={limits.place} placeholder={t.give.placePlaceholder} autoFocus />
          <datalist id="give-places">{places.map(p => <option key={p} value={p} />)}</datalist>
        </div>
      )}
      <div className="two">
        <div className="form-field">
          <label className="label" htmlFor="give-day">{t.give.day}</label>
          <input id="give-day" className="field" type="date" value={day} max={today} onChange={e => setDay(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="label" htmlFor="give-note">{t.give.note} <span className="muted">({t.common.optional})</span></label>
          <input id="give-note" className="field" value={note} onChange={e => setNote(e.target.value)} maxLength={limits.condition} placeholder={t.give.notePlaceholder} />
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        <button type="submit" className="button" disabled={pending || !ready}><Give />{mode === "person" && person ? format(t.give.submitTo, { name: person.name }) : t.give.submit}</button>
      </div>
    </form>
  );
}

function BackForm({ from, today, t, error, pending, onSubmit }: { from: string; today: string; t: Words; error: string | null; pending: boolean; onSubmit: (note: string, repair: boolean, day: string) => void }) {
  const [note, setNote] = useState("");
  const [repair, setRepair] = useState(false);
  const [day, setDay] = useState(today);
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); onSubmit(note, repair, day); }}>
      <p className="strong">{format(t.takeBack.from, { name: from })}</p>
      <div className="two">
        <div className="form-field">
          <label className="label" htmlFor="back-day">{t.takeBack.day}</label>
          <input id="back-day" className="field" type="date" value={day} max={today} onChange={e => setDay(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="label" htmlFor="back-note">{t.takeBack.note} <span className="muted">({t.common.optional})</span></label>
          <input id="back-note" className="field" value={note} onChange={e => setNote(e.target.value)} maxLength={limits.condition} placeholder={t.takeBack.notePlaceholder} autoFocus />
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={repair} onChange={e => setRepair(e.target.checked)} /><span>{t.takeBack.repair}</span></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        <button type="submit" className="button" disabled={pending}><TakeBack />{t.takeBack.submit}</button>
      </div>
    </form>
  );
}

function StatusForm({ item, t, error, pending, onSubmit }: { item: ItemInfo; t: Words; error: string | null; pending: boolean; onSubmit: (status: string, note: string) => void }) {
  const choices = item.licence ? (["in_stock", "retired"] as const) : chosenStatuses;
  const [status, setStatus] = useState<string>(choices.includes(item.status as never) ? item.status : choices[0]);
  const [note, setNote] = useState("");
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); onSubmit(status, note); }}>
      <fieldset className="choices">
        <legend className="visually-hidden">{t.item.status}</legend>
        {choices.map(s => (
          <label key={s} className={status === s ? "choice picked" : "choice"}>
            <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
            <span className={`stamp st-${s}`}>{t.status[s]}</span>
          </label>
        ))}
      </fieldset>
      <p className="hint">{item.licence ? t.item.statusHintLicence : t.item.statusHint}</p>
      <div className="form-field">
        <label className="label" htmlFor="status-note">{t.item.statusNote}</label>
        <input id="status-note" className="field" value={note} onChange={e => setNote(e.target.value)} maxLength={limits.condition} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        <button type="submit" className="button" disabled={pending}>{t.common.save}</button>
      </div>
    </form>
  );
}
