"use client";

import { Confirm, Dialog, EmptyState, PeoplePicker, useToast } from "@argentic/chest-ui/components";
import { localSearch } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Building, Pencil, Plus, Seat, Trash, Upload } from "../../../components/icons.tsx";
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
  dialog: Catalogue["dialog"];
  peoplePicker: Catalogue["peoplePicker"];
};
type Editing = { kind: "room"; floorId: string; room: RoomView | null } | { kind: "desk"; areaId: string; desk: DeskView } | null;

export function PlacesView({ offices, office, people, groups, names, locale, t }: {
  offices: { id: string; name: string; address: string }[];
  office: OfficeView | null;
  people: { id: string; name: string; photo: string | null }[];
  // The Chest's groups a room or an area may be kept for.
  groups: { id: string; name: string }[];
  names: Record<string, string>;
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [dirty, setDirty] = useState(false);
  const edit = (e: Editing) => { setDirty(false); setEditing(e); };

  // Runs an action; says what went wrong, or refreshes the page.
  function run<T>(step: () => Promise<Result<T>>, done?: (value: T) => void) {
    start(async () => {
      const r = await step();
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      done?.(r.value);
      router.refresh();
    });
  }
  const t2 = t.places;

  if (!office) {
    return (
      <EmptyState icon={<Building />} title={t2.firstOffice.title} body={t2.firstOffice.body} note={t2.csr}
        action={<OfficeForm t={t} busy={pending} onSave={v => run(() => actions.addOffice(v), r => router.push(`/chest/places?office=${r.id}`))} />} />
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
        <OfficeForm key={office.id} t={t} busy={pending} initial={office} onSave={v => run(() => actions.updateOffice(office.id, v), () => toast({ id: "office", text: t2.saved }))} />
        <button type="button" className="link-button danger small" onClick={() => run(() => actions.removeOffice(office.id), () => { toast({ id: "office", text: t2.removed }); router.push("/chest/places"); })}>{t2.removeOffice}</button>
      </section>

      {floors.map(f => (
        <section key={f.id} className="panel floor-panel" aria-labelledby={"f-" + f.id}>
          <div className="panel-head">
            <EditableName id={"f-" + f.id} value={f.name} max={limits.floorName} label={t2.floorName} t={t} busy={pending} onSave={name => run(() => actions.renameFloor(f.id, name))} />
            <button type="button" className="button quiet small danger" onClick={() => run(() => actions.removeFloor(f.id), () => toast({ id: "floor-" + f.id, text: t2.removed }))}><Trash />{t2.removeFloor}</button>
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
                  <button type="button" className="button quiet small" onClick={() => edit({ kind: "room", floorId: f.id, room: r })}><Pencil />{t.booking.change}</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="button quiet small" onClick={() => edit({ kind: "room", floorId: f.id, room: null })}><Plus />{t2.addRoom}</button>

          <h3 className="sub">{t2.areas}</h3>
          {f.areas.map(a => (
            <div key={a.id} className="area-admin">
              <div className="panel-head">
                <EditableName id={"a-" + a.id} value={a.name} max={limits.areaName} label={t2.areaName} t={t} busy={pending} small onSave={name => run(() => actions.renameArea(a.id, name))} />
                <button type="button" className="button quiet small danger" onClick={() => run(() => actions.removeArea(a.id), () => toast({ id: "area-" + a.id, text: t2.removed }))}><Trash />{t2.removeArea}</button>
              </div>
              {groups.length > 0 && (
                <label className="inline-label kept-for">
                  <span className="small muted">{t2.keptFor}</span>
                  <select className="select narrow-select" value={a.groupId ?? ""} onChange={e => run(() => actions.setAreaGroup(a.id, e.target.value || null), () => toast({ id: "area-" + a.id, text: t2.saved }))}>
                    <option value="">{t2.everyone}</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
              )}
              <ul className="tiles admin-tiles">
                {a.desks.map(d => (
                  <li key={d.id} className={"tile" + (d.assignedTo ? " is-assigned" : " is-free")}>
                    <button type="button" onClick={() => edit({ kind: "desk", areaId: a.id, desk: d })} aria-label={format(t2.editDesk, { desk: d.name })}>
                      <span className="tile-name">{d.name}</span>
                      <span className="tile-state">{d.assignedTo ? names[d.assignedTo]?.split(" ")[0] : ""}</span>
                      <span className="tile-features" aria-hidden="true">{d.features.map(k => { const Icon = featureIcons[k]; return <Icon key={k} />; })}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <AddDesks t={t} busy={pending} onAdd={n => run(() => actions.addDesks(a.id, n, []), r => toast({
                id: "desks-" + a.id,
                text: plural(t2.desksAdded, r.ids.length, locale),
                undo: async () => {
                  const back = await actions.undoAddDesks(r.ids);
                  router.refresh();
                  return back.ok ? true : format(t.errors[back.error], back.values);
                },
              }))} />
            </div>
          ))}
          <AddInline label={t2.addArea} placeholder={t2.areaPlaceholder} max={limits.areaName} busy={pending} onSave={name => run(() => actions.addArea(f.id, name))} />
        </section>
      ))}

      <AddInline label={t2.addFloor} placeholder={t2.floorPlaceholder} max={limits.floorName} busy={pending} onSave={name => run(() => actions.addFloor(office.id, name))} />
      <ImportPanel officeId={office.id} t={t} locale={locale} onDone={() => router.refresh()} />
      <p className="hint">{t2.csr}</p>

      <Dialog open={editing !== null} dirty={dirty} labels={t.dialog} title={editing?.kind === "room" ? (editing.room ? format(t2.editRoom, { room: editing.room.name }) : t2.newRoom) : editing?.kind === "desk" ? format(t2.editDesk, { desk: editing.desk.name }) : ""} onClose={() => edit(null)}>
        {editing?.kind === "room" && (
          <RoomEditor key={editing.room?.id ?? "new"} room={editing.room} floorId={editing.floorId} floors={floors.map(f => ({ id: f.id, name: f.name }))} groups={groups} t={t} busy={pending} onDirty={() => setDirty(true)}
            onSave={v => run(() => (editing.room ? actions.updateRoom(editing.room.id, v) : actions.addRoom(editing.floorId, v)), () => { edit(null); toast({ id: "room-" + (editing.room?.id ?? "new"), text: t2.saved }); })}
            onRemove={() => run(() => actions.removeRoom(editing.room!.id), r => { edit(null); toast({ id: "room-" + editing.room!.id, text: r.cancelled > 0 ? plural(t2.cancelledPeople, r.cancelled, locale) : t2.removed }); })}
            onPhoto={() => router.refresh()} onRemovePhoto={() => run(() => actions.removeRoomPhoto(editing.room!.id))} />
        )}
        {editing?.kind === "desk" && (
          <DeskEditor key={editing.desk.id} desk={editing.desk} areaId={editing.areaId} areas={floors.flatMap(f => f.areas.map(a => ({ id: a.id, name: f.name + " · " + a.name })))} people={people} locale={locale} t={t} busy={pending} onDirty={() => setDirty(true)}
            onSave={v => run(() => actions.updateDesk(editing.desk.id, v), r => { edit(null); toast({ id: "desk-" + editing.desk.id, text: r.cancelled > 0 ? plural(t2.cancelledPeople, r.cancelled, locale) : t2.saved }); })}
            onRemove={() => run(() => actions.removeDesk(editing.desk.id), r => { edit(null); toast({ id: "desk-" + editing.desk.id, text: r.cancelled > 0 ? plural(t2.cancelledPeople, r.cancelled, locale) : t2.removed }); })} />
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
      <button type="submit" className="button small" disabled={busy || value.trim() === ""}><Plus />{label}</button>
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

// Deleting a room or a desk cancels its coming bookings and tells their
// people: it cannot be undone, so it asks first, in the page (the kit's
// Confirm; never the browser's window.confirm).
function Remove({ label, title, body, cancel, onRemove }: { label: string; title: string; body: string; cancel: string; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className="button quiet danger" onClick={() => setAsking(true)}><Trash />{label}</button>
      <Confirm open={asking} title={title} body={body} confirmLabel={label} cancelLabel={cancel} onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); onRemove(); }} />
    </>
  );
}

function RoomEditor({ room, floorId, floors, groups, t, busy, onDirty, onSave, onRemove, onPhoto, onRemovePhoto }: {
  room: RoomView | null; floorId: string; floors: { id: string; name: string }[]; groups: { id: string; name: string }[]; t: Words; busy: boolean;
  onDirty: () => void; onSave: (v: actions.RoomFields) => void; onRemove: () => void; onPhoto: () => void; onRemovePhoto: () => void;
}) {
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(room?.capacity ?? 6);
  const [equipment, setEquipment] = useState<Equipment[]>(room?.equipment ?? []);
  const [note, setNote] = useState(room?.note ?? "");
  const [floor, setFloor] = useState(floorId);
  const [group, setGroup] = useState(room?.groupId ?? "");
  return (
    <form className="stack" onChange={onDirty} onSubmit={e => { e.preventDefault(); onSave({ name, capacity, equipment, note, floorId: floor, groupId: group || null }); }}>
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
      {groups.length > 0 && (
        <label>
          <span className="label">{t.places.keptFor}</span>
          <select className="select" value={group} onChange={e => setGroup(e.target.value)}>
            <option value="">{t.places.everyone}</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      {room && <Photo room={room} t={t} onDone={onPhoto} onRemove={onRemovePhoto} />}
      <div className="row actions">
        <button type="submit" className="button" disabled={busy}>{t.places.save}</button>
        {room && <Remove label={t.places.remove} title={format(t.places.deleteRoom, { room: room.name })} body={t.places.deleteBody} cancel={t.places.keep} onRemove={onRemove} />}
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
  const fail = (code: keyof Catalogue["errors"]) => toast({ text: t.errors[code], tone: "error" });
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
      toast({ id: "photo-" + room.id, text: t.places.photoSaved });
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

function DeskEditor({ desk, areaId, areas, people, locale, t, busy, onDirty, onSave, onRemove }: {
  desk: DeskView; areaId: string; areas: { id: string; name: string }[]; people: { id: string; name: string; photo: string | null }[]; locale: string; t: Words; busy: boolean;
  onDirty: () => void; onSave: (v: actions.DeskFields) => void; onRemove: () => void;
}) {
  const [name, setName] = useState(desk.name);
  const [features, setFeatures] = useState<Feature[]>(desk.features);
  const [assignedTo, setAssigned] = useState(desk.assignedTo ?? "");
  const [area, setArea] = useState(areaId);
  const search = useMemo(() => localSearch(people), [people]);
  const holder = people.filter(p => p.id === assignedTo);
  return (
    <form className="stack" onChange={onDirty} onSubmit={e => { e.preventDefault(); onSave({ name, features, assignedTo: assignedTo || null, areaId: area }); }}>
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
      <PeoplePicker label={t.places.assignedTo} hint={t.places.nobody} clearable value={holder} search={search} labels={t.peoplePicker} lang={locale}
        onChange={v => { setAssigned(v[0]?.id ?? ""); onDirty(); }} />
      <div className="row actions">
        <button type="submit" className="button" disabled={busy}>{t.places.save}</button>
        <Remove label={t.places.remove} title={format(t.places.deleteDesk, { desk: desk.name })} body={t.places.deleteBody} cancel={t.places.keep} onRemove={onRemove} />
      </div>
    </form>
  );
}

// Moving in: rooms from Google Workspace's resources CSV, desks and who has
// them from any spreadsheet. The file is read here and sent as text; what
// was left out is said line by line.
function ImportPanel({ officeId, t, locale, onDone }: { officeId: string; t: Words; locale: string; onDone: () => void }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [report, setReport] = useState<{ said: string; lines: string[] } | null>(null);
  const t2 = t.places.import;
  function send(kind: "rooms" | "desks", file: File) {
    if (file.size > 2 << 20) return void toast({ text: t.errors.file_too_large, tone: "error" });
    start(async () => {
      const text = await file.text();
      const r = kind === "rooms" ? await actions.importRooms(officeId, text) : await actions.importDesks(officeId, text);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      const v = r.value;
      const said = "floors" in v
        ? plural(t2.roomsDone, v.added, locale) + (v.floors > 0 ? " " + plural(t2.floorsDone, v.floors, locale) : "")
        : plural(t2.desksDone, v.given, locale) + (v.added > 0 ? " " + plural(t2.desksAdded, v.added, locale) : "") + (v.cancelled > 0 ? " " + plural(t.places.cancelledPeople, v.cancelled, locale) : "");
      setReport({ said, lines: v.skipped.slice(0, 20).map(x => format(t2.line, { line: x.line, reason: t2.reasons[x.reason] })).concat(v.skipped.length > 20 ? [plural(t2.more, v.skipped.length - 20, locale)] : []) });
      onDone();
    });
  }
  return (
    <section className="panel" aria-labelledby="import-title">
      <h2 id="import-title" className="annotation">{t2.title}</h2>
      <p className="hint">{t2.body}</p>
      <div className="row">
        <label className="button quiet small file-input">
          <Upload />{t2.rooms}
          <input type="file" accept=".csv,text/csv" className="visually-hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) send("rooms", f); e.target.value = ""; }} />
        </label>
        <label className="button quiet small file-input">
          <Upload />{t2.desks}
          <input type="file" accept=".csv,text/csv" className="visually-hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) send("desks", f); e.target.value = ""; }} />
        </label>
      </div>
      <ul className="hint notes">
        <li>{t2.roomsHelp}</li>
        <li>{t2.desksHelp}</li>
      </ul>
      {report && (
        <div className="import-report" role="status">
          <p><strong>{report.said}</strong></p>
          {report.lines.length > 0 && <ul className="hint notes">{report.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
