"use client";

import { EmptyState, Menu, useToast, type MenuItem } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Down, Eye, EyeOff, Lock, Pencil, Plus, Trash, Up } from "../../../components/icons.tsx";
import { StateIcon } from "../../../components/icons.tsx";
import { useRun } from "../../../components/use-run.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { addComponent, addExample, moveComponent, putBackComponent, removeComponent, updateComponent } from "../actions.ts";

export type Row = { id: string; kind: "component" | "group"; name: string; description: string; hidden: boolean; teamOnly: boolean; parentId: string | null; state: string };
type Entry = Row & { children: Row[] };
type Words = { components: Record<string, string>; states: Record<string, string>; errors: Record<ErrorCode, string> };

function Editor({ row, groups, t, close }: { row: Row; groups: Row[]; t: Words; close: () => void }) {
  const w = t.components;
  const { run, pending } = useRun(t.errors);
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description);
  const [parentId, setParentId] = useState(row.parentId ?? "");
  return (
    <form className="editor stack" onSubmit={async e => { e.preventDefault(); const r = await run(() => updateComponent(row.id, { name, description, ...(row.kind === "component" ? { parentId: parentId || null } : {}) }), w.saved); if (r.ok) close(); }}>
      <div className="two">
        <div>
          <label className="label" htmlFor={`name-${row.id}`}>{row.kind === "group" ? w.groupName : w.name}</label>
          <input id={`name-${row.id}`} className="field" required maxLength={80} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        {row.kind === "component" && (
          <div>
            <label className="label" htmlFor={`group-${row.id}`}>{w.group}</label>
            <select id={`group-${row.id}`} className="field" value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">{w.noGroup}</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor={`desc-${row.id}`}>{w.description}</label>
        <input id={`desc-${row.id}`} className="field" maxLength={200} placeholder={w.descriptionPlaceholder} value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="actions">
        <button type="submit" className="button small" disabled={pending}>{w.save}</button>
        <button type="button" className="button link" onClick={close}>{t.components.cancel}</button>
      </div>
    </form>
  );
}

// One service or group: its name and state, "Edit", and the rarer actions
// (order, hide, team only, delete) in the kit's menu — words, not a row of
// look-alike icons. Deleting offers Undo (the kit's toast).
function Line({ row, first, last, groups, t }: { row: Row; first: boolean; last: boolean; groups: Row[]; t: Words }) {
  const w = t.components;
  const toast = useToast();
  const { run, pending, undo } = useRun(t.errors);
  const [editing, setEditing] = useState(false);
  const items: MenuItem[] = [
    { label: w.moveUp!, icon: <Up />, disabled: first || pending, onSelect: () => void run(() => moveComponent(row.id, "up")) },
    { label: w.moveDown!, icon: <Down />, disabled: last || pending, onSelect: () => void run(() => moveComponent(row.id, "down")) },
    { label: row.hidden ? w.show! : w.hide!, icon: row.hidden ? <Eye /> : <EyeOff />, disabled: pending, onSelect: () => void run(() => updateComponent(row.id, { hidden: !row.hidden }), w.saved) },
    ...(row.kind === "component" ? [{ label: row.teamOnly ? w.makePublic! : w.makeTeamOnly!, icon: row.teamOnly ? <Eye /> : <Lock />, disabled: pending, onSelect: () => void run(() => updateComponent(row.id, { teamOnly: !row.teamOnly }), w.saved) }] : []),
    { label: w.remove!, icon: <Trash />, tone: "danger" as const, disabled: pending, onSelect: () => void run(() => removeComponent(row.id), gone => toast({ id: `component-${row.id}`, text: w.removed!, undo: undo(() => putBackComponent(gone)) })) },
  ];
  return (
    <div className={`component-line${row.kind === "group" ? " is-group" : ""}${row.hidden ? " is-hidden" : ""}`}>
      {editing ? <Editor row={row} groups={groups} t={t} close={() => setEditing(false)} /> : (
        <>
          <div className="component-name">
            <strong>{row.name}</strong>
            {row.kind === "group" && <span className="tag">{w.group_kind}</span>}
            {row.hidden && <span className="tag muted"><EyeOff />{w.hidden}</span>}
            {row.teamOnly && <span className="tag muted"><Lock />{w.teamOnly}</span>}
            {row.description && <span className="muted small">{row.description}</span>}
          </div>
          {row.kind === "component" && <span className={`state-label quiet s-${row.state}`} title={format(w.now!, { state: t.states[row.state] ?? "" })}><StateIcon state={row.state} /><span className="visually-hidden">{format(w.now!, { state: t.states[row.state] ?? "" })}</span></span>}
          <span className="line-actions">
            <button type="button" className="button quiet small" aria-label={`${w.edit} — ${row.name}`} onClick={() => setEditing(true)}><Pencil />{w.edit}</button>
            <Menu label={format(w.more!, { name: row.name })} items={items} />
          </span>
        </>
      )}
    </div>
  );
}

function AddForm({ kind, groups, t }: { kind: "component" | "group"; groups: Row[]; t: Words }) {
  const w = t.components;
  const { run, pending } = useRun(t.errors);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [teamOnly, setTeamOnly] = useState(false);
  const id = `add-${kind}`;
  return (
    <form className="card pad stack add-form" onSubmit={async e => { e.preventDefault(); const r = await run(() => addComponent({ name, description, kind, parentId: parentId || null, teamOnly }), w.added); if (r.ok) { setName(""); setDescription(""); setTeamOnly(false); } }}>
      <h2 className="h3">{kind === "group" ? w.addGroup : w.add}</h2>
      <div className="two">
        <div>
          <label className="label" htmlFor={`${id}-name`}>{kind === "group" ? w.groupName : w.name}</label>
          <input id={`${id}-name`} className="field" required maxLength={80} placeholder={kind === "group" ? w.groupPlaceholder : w.namePlaceholder} value={name} onChange={e => setName(e.target.value)} />
        </div>
        {kind === "component" && groups.length > 0 && (
          <div>
            <label className="label" htmlFor={`${id}-group`}>{w.group}</label>
            <select id={`${id}-group`} className="field" value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">{w.noGroup}</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {kind === "component" && (
        <div>
          <label className="label" htmlFor={`${id}-desc`}>{w.description}</label>
          <input id={`${id}-desc`} className="field" maxLength={200} placeholder={w.descriptionPlaceholder} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
      )}
      {kind === "component" && (
        <div>
          <label className="check">
            <input type="checkbox" checked={teamOnly} onChange={e => setTeamOnly(e.target.checked)} aria-describedby={`${id}-team-hint`} />
            <span>{w.teamOnly}</span>
          </label>
          <p id={`${id}-team-hint`} className="hint">{w.teamOnlyHint}</p>
        </div>
      )}
      <div><button type="submit" className={kind === "group" ? "button quiet" : "button"} disabled={pending}><Plus />{kind === "group" ? w.addGroup : w.add}</button></div>
    </form>
  );
}

export function ComponentsView({ entries, t }: { entries: Entry[]; t: Words }) {
  const w = t.components;
  const { run, pending } = useRun(t.errors);
  const groups = entries.filter(e => e.kind === "group");
  return (
    <>
      {entries.length === 0 ? (
        <EmptyState title={w.emptyTitle} body={w.emptyBody} example={{ label: w.example!, busy: pending, onClick: () => void run(() => addExample(w.exampleNames!.split("|"))) }} />
      ) : (
        <ul className="component-list card">
          {entries.map((e, i) => (
            <li key={e.id}>
              <Line row={e} first={i === 0} last={i === entries.length - 1} groups={groups} t={t} />
              {e.children.length > 0 && (
                <ul className="component-children">
                  {e.children.map((c, k) => <li key={c.id}><Line row={c} first={k === 0} last={k === e.children.length - 1} groups={groups} t={t} /></li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="add-forms">
        <AddForm kind="component" groups={groups} t={t} />
        <AddForm kind="group" groups={groups} t={t} />
      </div>
    </>
  );
}
