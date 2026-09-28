"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Building, Pencil, Plus, Seat, Trash, Upload } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { equipment as equipmentKeys, features as featureKeys, limits, type Equipment, type Feature } from "../../../lib/model.ts";
import type { OfficeView, RoomView, DeskView } from "../../../lib/places.ts";
import type { Result } from "../../../lib/errors.ts";
import * as actions from "../actions.ts";
import { featureIcons } from "../desks/desk-view.tsx";
import { equipmentIcons } from "../rooms/rooms-view.tsx";

type Words = {
  places: Catalogue["places"];
  equipment: Catalogue["equipment"];
  features: Catalogue["features"];
  errors: Catalogue["errors"];
  rooms: Catalogue["rooms"];
  booking: Catalogue["booking"];
};
type Editing = { kind: "room"; floorId: string; room: RoomView | null } | { kind: "desk"; areaId: string; desk: DeskView } | null;

export function PlacesView({ offices, office, people, names, locale, t }: {
  offices: { id: string; name: string; address: string }[];
  office: OfficeView | null;
  people: { id: string; name: string }[];
  names: Record<string, string>;
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);

  // Runs an action; says what went wrong, or refreshes the page.
  function run<T>(step: () => Promise<Result<T>>, done?: (value: T) => void) {
    start(async () => {
      const r = await step();
      if (!r.ok) return void toast(format(t.errors[r.error], r.values));
      done?.(r.value);
      router.refresh();
    });
  }
  const t2 = t.places;

  if (!office) {
    return (
      <div className="empty">
        <Building />
        <h2>{t2.firstOffice.title}</h2>
        <p>{t2.firstOffice.body}</p>
        <OfficeForm t={t} busy={pending} onSave={v => run(() => actions.addOffice(v), r => router.push(`/chest/places?office=${r.id}`))} />
        <p className="hint">{t2.csr}</p>
      </div>
    );
  }

  const floors = office.floors;
  return (
    <div className="stack-l">
      <nav className="office-tabs" aria-label={t2.offices}>
        {offices.map(o => <Link key={o.id} href={`/chest/places?office=${o.id}`} aria-current={o.id === office.id ? "page" : undefined}>{o.name}</Link>)}
        <AddInline label={t2.addOffice} placeholder={t2.officeNamePlaceholder} max={limits.officeName} busy={pending}
          onSave={name => run(() => actions.addOffice({ name, address: "" }), r => router.push(`/chest/places?office=${r.id}`))} />
      </nav>

      <section className="panel" aria-labelledby="office-title">
        <h2 id="office-title" className="annotation">{office.name}</h2>
        <OfficeForm key={office.id} t={t} busy={pending} initial={office} onSave={v => run(() => actions.updateOffice(office.id, v), () => toast(t2.saved))} />
        <button type="button" className="link-button danger small" onClick={() => run(() => actions.removeOffice(office.id), () => { toast(t2.removed); router.push("/chest/places"); })}>{t2.removeOffice}</button>
      </section>

      {floors.map(f => (
        <section key={f.id} className="panel floor-panel" aria-labelledby={"f-" + f.id}>
          <div className="panel-head">
            <EditableName id={"f-" + f.id} value={f.name} max={limits.floorName} label={t2.floorName} t={t} busy={pending} onSave={name => run(() => actions.renameFloor(f.id, name))} />
            <button type="button" className="icon-button" onClick={() => run(() => actions.removeFloor(f.id), () => toast(t2.removed))}><Trash /><span className="visually-hidden">{t2.remove} · {f.name}</span></button>
          </div>

          <h3 className="sub">{t2.rooms}</h3>
          {f.rooms.length === 0 ? <p className="hint">{t2.empty}</p> : (
            <ul className="rows">
              {f.rooms.map(r => (
                <li key={r.id} className="row-item">
                  {r.photo ? <img className="thumb" src={`/chest/files/rooms/${r.id}?size=256`} alt="" /> : <span className="thumb" aria-hidden="true" />}
                  <span className="grow">
                    <strong>{r.name}</strong>
                    <span className="room-meta">
                      <span><Seat />{plural(t.rooms.capacity, r.capacity, locale)}</span>
                      {r.equipment.map(e => { const Icon = equipmentIcons[e]; return <span key={e}><Icon />{t.equipment[e]}</span>; })}
                    </span>
                  </span>
                  <button type="button" className="button quiet small" onClick={() => setEditing({ kind: "room", floorId: f.id, room: r })}><Pencil />{t.booking.change}</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="button quiet small" onClick={() => setEditing({ kind: "room", floorId: f.id, room: null })}><Plus />{t2.addRoom}</button>

          <h3 className="sub">{t2.areas}</h3>
          {f.areas.map(a => (
            <div key={a.id} className="area-admin">
              <div className="panel-head">
                <EditableName id={"a-" + a.id} value={a.name} max={limits.areaName} label={t2.areaName} t={t} busy={pending} small onSave={name => run(() => actions.renameArea(a.id, name))} />
                <button type="button" className="icon-button" onClick={() => run(() => actions.removeArea(a.id), () => toast(t2.removed))}><Trash /><span className="visually-hidden">{t2.remove} · {a.name}</span></button>
              </div>
              <ul className="tiles admin-tiles">
                {a.desks.map(d => (
                  <li key={d.id} className={"tile" + (d.assignedTo ? " is-assigned" : " is-free")}>
                    <button type="button" onClick={() => setEditing({ kind: "desk", areaId: a.id, desk: d })} aria-label={format(t2.editDesk, { desk: d.name })}>
                      <span className="tile-name">{d.name}</span>
                      <span className="tile-state">{d.assignedTo ? names[d.assignedTo]?.split(" ")[0] : ""}</span>
                      <span className="tile-features" aria-hidden="true">{d.features.map(k => { const Icon = featureIcons[k]; return <Icon key={k} />; })}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <AddDesks t={t} busy={pending} onAdd={n => run(() => actions.addDesks(a.id, n, []), r => toast(plural(t2.desksAdded, r.ids.length, locale)))} />
            </div>
          ))}
          <AddInline label={t2.addArea} placeholder={t2.areaPlaceholder} max={limits.areaName} busy={pending} onSave={name => run(() => actions.addArea(f.id, name))} />
        </section>
      ))}

      <AddInline label={t2.addFloor} placeholder={t2.floorPlaceholder} max={limits.floorName} busy={pending} onSave={name => run(() => actions.addFloor(office.id, name))} />
      <p className="hint">{t2.csr}</p>

      <Dialog open={editing !== null} title={editing?.kind === "room" ? (editing.room ? format(t2.editRoom, { room: editing.room.name }) : t2.newRoom) : editing?.kind === "desk" ? format(t2.editDesk, { desk: editing.desk.name }) : ""} closeLabel={t.booking.close} onClose={() => setEditing(null)}>
        {editing?.kind === "room" && (
          <RoomEditor key={editing.room?.id ?? "new"} room={editing.room} floorId={editing.floorId} floors={floors.map(f => ({ id: f.id, name: f.name }))} t={t} busy={pending}
            onSave={v => run(() => (editing.room ? actions.updateRoom(editing.room.id, v) : actions.addRoom(editing.floorId, v)), () => { setEditing(null); toast(t2.saved); })}
            onRemove={() => run(() => actions.removeRoom(editing.room!.id), r => { setEditing(null); toast(r.cancelled > 0 ? plural(t2.cancelledPeople, r.cancelled, locale) : t2.removed); })}
            onPhoto={() => router.refresh()} onRemovePhoto={() => run(() => actions.removeRoomPhoto(editing.room!.id))} />
        )}
        {editing?.kind === "desk" && (
          <DeskEditor key={editing.desk.id} desk={editing.desk} areaId={editing.areaId} areas={floors.flatMap(f => f.areas.map(a => ({ id: a.id, name: f.name + " · " + a.name })))} people={people} t={t} busy={pending}
            onSave={v => run(() => actions.updateDesk(editing.desk.id, v), r => { setEditing(null); toast(r.cancelled > 0 ? plural(t2.cancelledPeople, r.cancelled, locale) : t2.saved); })}
            onRemove={() => run(() => actions.removeDesk(editing.desk.id), r => { setEditing(null); toast(r.cancelled > 0 ? plural(t2.cancelledPeople, r.cancelled, locale) : t2.removed); })} />
        )}
      </Dialog>
    </div>
  );
}

function OfficeForm({ initial, t, busy, onSave }: { initial?: { name: string; address: string }; t: Words; busy: boolean; onSave: (v: { name: string; address: string }) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  return (
    <form className="form-grid office-form" onSubmit={e => { e.preventDefault(); onSave({ name, address }); }}>
      <label className="span-2">
        <span className="label">{t.places.officeName}</span>
        <input className="field" value={name} required maxLength={limits.officeName} placeholder={t.places.officeNamePlaceholder} onChange={e => setName(e.target.value)} />
      </label>
      <label className="span-2">
        <span className="label">{t.places.address}</span>
        <input className="field" value={address} maxLength={limits.address} placeholder={t.places.addressPlaceholder} onChange={e => setAddress(e.target.value)} />
      </label>
      <div className="span-4"><button type="submit" className="button" disabled={busy}>{initial ? t.places.save : t.places.addOffice}</button></div>
    </form>
  );
}

function AddInline({ label, placeholder, max, busy, onSave }: { label: string; placeholder: string; max: number; busy: boolean; onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) return <button type="button" className="button quiet small add-inline" onClick={() => setOpen(true)}><Plus />{label}</button>;
  return (
    <form className="inline-form" onSubmit={e => { e.preventDefault(); if (value.trim()) { onSave(value); setValue(""); setOpen(false); } }}>
      <label className="visually-hidden" htmlFor={"add-" + label}>{label}</label>
      <input id={"add-" + label} className="field" autoFocus value={value} maxLength={max} placeholder={placeholder} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }} />
      <button type="submit" className="button small" disabled={busy}><Plus />{label}</button>
    </form>
  );
}

function EditableName({ id, value, max, label, t, busy, small, onSave }: { id: string; value: string; max: number; label: string; t: Words; busy: boolean; small?: boolean; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const Tag = small ? "h4" : "h3";
  if (!editing) {
    return (
      <div className="editable">
        <Tag id={id} className={small ? "area-name" : "floor-name"}>{value}</Tag>
        <button type="button" className="link-button small" onClick={() => { setText(value); setEditing(true); }}>{t.places.rename}</button>
      </div>
    );
  }
  return (
    <form className="inline-form" onSubmit={(e: FormEvent) => { e.preventDefault(); onSave(text); setEditing(false); }}>
      <label className="visually-hidden" htmlFor={id + "-name"}>{label}</label>
      <input id={id + "-name"} className="field" autoFocus value={text} maxLength={max} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Escape") setEditing(false); }} />
      <button type="submit" className="button small" disabled={busy}>{t.places.save}</button>
    </form>
  );
}

function AddDesks({ t, busy, onAdd }: { t: Words; busy: boolean; onAdd: (n: number) => void }) {
  const [n, setN] = useState(4);
  return (
    <form className="inline-form" onSubmit={e => { e.preventDefault(); onAdd(n); }}>
      <label className="count-field">
        <span className="small muted">{t.places.howMany}</span>
        <input className="field" type="number" min={1} max={limits.desksAtOnce} value={n} onChange={e => setN(Math.max(1, Math.min(limits.desksAtOnce, Number(e.target.value) || 1)))} />
      </label>
      <button type="submit" className="button quiet small" disabled={busy}><Plus />{t.places.addDesks}</button>
    </form>
  );
}

function Checks<K extends string>({ legend, keys, value, words, onChange }: { legend: string; keys: readonly K[]; value: K[]; words: Record<K, string>; onChange: (v: K[]) => void }) {
  return (
    <fieldset className="checks">
      <legend className="label">{legend}</legend>
      {keys.map(k => (
        <label key={k} className="check chip-check">
          <input type="checkbox" checked={value.includes(k)} onChange={e => onChange(e.target.checked ? keys.filter(x => x === k || value.includes(x)) : value.filter(x => x !== k))} />
          {words[k]}
        </label>
      ))}
    </fieldset>
  );
}

function Remove({ label, confirm, onRemove }: { label: string; confirm: string; onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  return <button type="button" className="button quiet danger" onClick={() => (sure ? onRemove() : setSure(true))}><Trash />{sure ? confirm : label}</button>;
}

function RoomEditor({ room, floorId, floors, t, busy, onSave, onRemove, onPhoto, onRemovePhoto }: {
  room: RoomView | null; floorId: string; floors: { id: string; name: string }[]; t: Words; busy: boolean;
  onSave: (v: actions.RoomFields) => void; onRemove: () => void; onPhoto: () => void; onRemovePhoto: () => void;
}) {
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(room?.capacity ?? 6);
  const [equipment, setEquipment] = useState<Equipment[]>(room?.equipment ?? []);
  const [note, setNote] = useState(room?.note ?? "");
  const [floor, setFloor] = useState(floorId);
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); onSave({ name, capacity, equipment, note, floorId: floor }); }}>
      <div className="form-grid">
        <label className="span-3">
          <span className="label">{t.places.roomName}</span>
          <input className="field" value={name} required maxLength={limits.roomName} onChange={e => setName(e.target.value)} />
        </label>
        <label>
          <span className="label">{t.places.capacity}</span>
          <input className="field" type="number" min={1} max={limits.capacity} value={capacity} onChange={e => setCapacity(Number(e.target.value) || 1)} />
        </label>
        {room && floors.length > 1 && (
          <label className="span-4">
            <span className="label">{t.places.floor}</span>
            <select className="select" value={floor} onChange={e => setFloor(e.target.value)}>{floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </label>
        )}
      </div>
      <Checks legend={t.places.equipment} keys={equipmentKeys} value={equipment} words={t.equipment} onChange={setEquipment} />
      <label>
        <span className="label">{t.places.note}</span>
        <input className="field" value={note} maxLength={limits.roomNote} placeholder={t.places.notePlaceholder} onChange={e => setNote(e.target.value)} />
      </label>
      {room && <Photo room={room} t={t} onDone={onPhoto} onRemove={onRemovePhoto} />}
      <div className="row actions">
        <button type="submit" className="button" disabled={busy}>{t.places.save}</button>
        {room && <Remove label={t.places.remove} confirm={t.places.confirmRemove} onRemove={onRemove} />}
      </div>
    </form>
  );
}

// The photo goes from the browser to the Chest itself: the tool authorises
// one upload, the browser sends it, the tool checks it arrived.
function Photo({ room, t, onDone, onRemove }: { room: RoomView; t: Words; onDone: () => void; onRemove: () => void }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [version, setVersion] = useState(0);
  const fail = (code: keyof Catalogue["errors"]) => toast(t.errors[code]);
  async function send(file: File) {
    if (file.size > limits.photoSize) return fail("file_too_large");
    setSending(true);
    try {
      const grant = await fetch(`/chest/api/rooms/${room.id}/photo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size: file.size }) });
      const up = await grant.json() as { url?: string; error?: keyof Catalogue["errors"] };
      if (!grant.ok || !up.url) return fail(up.error ?? "unknown");
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!put.ok) return fail(put.status === 413 ? "file_too_large" : put.status === 415 ? "invalid" : "file_missing");
      const { name } = await put.json() as { name: string };
      const confirm = await fetch(`/chest/api/rooms/${room.id}/photo`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!confirm.ok) return fail(((await confirm.json().catch(() => ({}))) as { error?: keyof Catalogue["errors"] }).error ?? "file_missing");
      toast(t.places.photoSaved);
      setVersion(v => v + 1);
      onDone();
    } catch {
      fail("unavailable");
    } finally {
      setSending(false);
    }
  }
  const shown: ReactNode = room.photo || version > 0 ? <img className="photo-preview" src={`/chest/files/rooms/${room.id}?size=256&v=${version}`} alt={format(t.rooms.photo, { room: room.name })} /> : null;
  return (
    <div className="stack-s">
      <span className="label">{t.places.photo}</span>
      {shown}
      {sending && <p className="hint" role="status">{t.places.uploading}</p>}
      <div className="row">
        <label className="button quiet small file-input">
          <Upload />{room.photo || version > 0 ? t.places.changePhoto : t.places.addPhoto}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ""; }} />
        </label>
        {(room.photo || version > 0) && <button type="button" className="link-button danger small" onClick={() => { setVersion(0); onRemove(); }}>{t.places.removePhoto}</button>}
      </div>
    </div>
  );
}

function DeskEditor({ desk, areaId, areas, people, t, busy, onSave, onRemove }: {
  desk: DeskView; areaId: string; areas: { id: string; name: string }[]; people: { id: string; name: string }[]; t: Words; busy: boolean;
  onSave: (v: actions.DeskFields) => void; onRemove: () => void;
}) {
  const [name, setName] = useState(desk.name);
  const [features, setFeatures] = useState<Feature[]>(desk.features);
  const [assignedTo, setAssigned] = useState(desk.assignedTo ?? "");
  const [area, setArea] = useState(areaId);
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); onSave({ name, features, assignedTo: assignedTo || null, areaId: area }); }}>
      <div className="form-grid">
        <label className="span-2">
          <span className="label">{t.places.deskName}</span>
          <input className="field" value={name} required maxLength={limits.deskName} onChange={e => setName(e.target.value)} />
        </label>
        <label className="span-2">
          <span className="label">{t.places.area}</span>
          <select className="select" value={area} onChange={e => setArea(e.target.value)}>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
      </div>
      <Checks legend={t.places.deskFeatures} keys={featureKeys} value={features} words={t.features} onChange={setFeatures} />
      <label>
        <span className="label">{t.places.assignedTo}</span>
        <select className="select" value={assignedTo} onChange={e => setAssigned(e.target.value)}>
          <option value="">{t.places.nobody}</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="row actions">
        <button type="submit" className="button" disabled={busy}>{t.places.save}</button>
        <Remove label={t.places.remove} confirm={t.places.confirmRemove} onRemove={onRemove} />
      </div>
    </form>
  );
}
