"use client";

import { EmptyState, Menu, useToast, type MenuItem } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Down, Eye, EyeOff, Lock, Pencil, Plus, Trash, Up } from "../../../components/icons.tsx";
import { StateIcon } from "../../../components/icons.tsx";
import { LanguagePick, SecondField, SecondToggle, secondOf, type Languages } from "../../../components/second-field.tsx";
import { useRun } from "../../../components/use-run.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { addComponent, addExample, moveComponent, putBackComponent, removeComponent, updateComponent } from "../actions.ts";

// A service as written — name and description in `language`, their
// optional versions in the other language — and `shown`, its name as the
// editor reads it.
export type Row = { id: string; kind: "component" | "group"; name: string; description: string; language: string; nameSecond: string | null; descriptionSecond: string | null; shown: string; hidden: boolean; teamOnly: boolean; parentId: string | null; state: string };
type Entry = Row & { children: Row[] };
type Words = { components: Record<string, string>; states: Record<string, string>; errors: Record<ErrorCode, string> };

// The second language's name and description: behind "Also in English"
// (or French), open when the service already has them.
function SecondFields({ id, other, open, setOpen, name, setName, description, setDescription, group, t }: { id: string; other: { code: string; name: string }; open: boolean; setOpen: (v: boolean) => void; name: string; setName: (v: string) => void; description: string; setDescription: (v: string) => void; group: boolean; t: Words }) {
  const w = t.components;
  return (
    <>
      <SecondToggle checked={open} onChange={setOpen} label={format(w.alsoIn!, { language: other.name })} />
      {open && (
        <div className="two">
          <SecondField id={`${id}-name2`} label={format(w.nameIn!, { language: other.name })} value={name} onChange={setName} lang={other.code} multiline={false} max={80} />
          {!group && <SecondField id={`${id}-desc2`} label={format(w.descriptionIn!, { language: other.name })} value={description} onChange={setDescription} lang={other.code} multiline={false} max={200} />}
        </div>
      )}
    </>
  );
}

function Editor({ row, groups, languages, t, close }: { row: Row; groups: Row[]; languages: Languages; t: Words; close: () => void }) {
  const w = t.components;
  const { run, pending } = useRun(t.errors);
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description);
  const [parentId, setParentId] = useState(row.parentId ?? "");
  const [both, setBoth] = useState(Boolean(row.nameSecond || row.descriptionSecond));
  const [nameSecond, setNameSecond] = useState(row.nameSecond ?? "");
  const [descriptionSecond, setDescriptionSecond] = useState(row.descriptionSecond ?? "");
  const other = secondOf(row.language, languages.options);
  // Unticked, the second version goes.
  const second = both ? { name: nameSecond, description: descriptionSecond } : { name: "", description: "" };
  return (
    <form className="editor stack" onSubmit={async e => { e.preventDefault(); const r = await run(() => updateComponent(row.id, { name, description, second, ...(row.kind === "component" ? { parentId: parentId || null } : {}) }), w.saved); if (r.ok) close(); }}>
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
              {groups.map(g => <option key={g.id} value={g.id}>{g.shown}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor={`desc-${row.id}`}>{w.description}</label>
        <input id={`desc-${row.id}`} className="field" maxLength={200} placeholder={w.descriptionPlaceholder} value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <SecondFields id={`edit-${row.id}`} other={other} open={both} setOpen={setBoth} name={nameSecond} setName={setNameSecond} description={descriptionSecond} setDescription={setDescriptionSecond} group={row.kind === "group"} t={t} />
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
function Line({ row, first, last, groups, languages, t }: { row: Row; first: boolean; last: boolean; groups: Row[]; languages: Languages; t: Words }) {
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
      {editing ? <Editor row={row} groups={groups} languages={languages} t={t} close={() => setEditing(false)} /> : (
        <>
          <div className="component-name">
            <strong lang={row.language}>{row.name}</strong>
            {row.kind === "group" && <span className="tag">{w.group_kind}</span>}
            {row.hidden && <span className="tag muted"><EyeOff />{w.hidden}</span>}
            {row.teamOnly && <span className="tag muted"><Lock />{w.teamOnly}</span>}
            {row.description && <span className="muted small" lang={row.language}>{row.description}</span>}
            {row.nameSecond && <span className="muted small">{format(w.inBoth!, { language: secondOf(row.language, languages.options).name, name: row.nameSecond })}</span>}
          </div>
          {row.kind === "component" && <span className={`state-label quiet s-${row.state}`} title={format(w.now!, { state: t.states[row.state] ?? "" })}><StateIcon state={row.state} /><span className="visually-hidden">{format(w.now!, { state: t.states[row.state] ?? "" })}</span></span>}
          <span className="line-actions">
            <button type="button" className="button quiet small" aria-label={`${w.edit} — ${row.shown}`} onClick={() => setEditing(true)}><Pencil />{w.edit}</button>
            <Menu label={format(w.more!, { name: row.shown })} items={items} />
          </span>
        </>
      )}
    </div>
  );
}

function AddForm({ kind, groups, languages, t }: { kind: "component" | "group"; groups: Row[]; languages: Languages; t: Words }) {
  const w = t.components;
  const { run, pending } = useRun(t.errors);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [teamOnly, setTeamOnly] = useState(false);
  const [language, setLanguage] = useState(languages.main);
  const [both, setBoth] = useState(false);
  const [nameSecond, setNameSecond] = useState("");
  const [descriptionSecond, setDescriptionSecond] = useState("");
  const id = `add-${kind}`;
  const other = secondOf(language, languages.options);
  return (
    <form className="card pad stack add-form" onSubmit={async e => { e.preventDefault(); const r = await run(() => addComponent({ name, description, kind, parentId: parentId || null, teamOnly, language, ...(both ? { second: { name: nameSecond, description: descriptionSecond } } : {}) }), w.added); if (r.ok) { setName(""); setDescription(""); setTeamOnly(false); setNameSecond(""); setDescriptionSecond(""); } }}>
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
              {groups.map(g => <option key={g.id} value={g.id}>{g.shown}</option>)}
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
      <div className="two">
        <LanguagePick id={`${id}-language`} label={w.writtenIn!} value={language} onChange={setLanguage} options={languages.options} />
      </div>
      <SecondFields id={id} other={other} open={both} setOpen={setBoth} name={nameSecond} setName={setNameSecond} description={descriptionSecond} setDescription={setDescriptionSecond} group={kind === "group"} t={t} />
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

export function ComponentsView({ entries, languages, t }: { entries: Entry[]; languages: Languages; t: Words }) {
  const w = t.components;
  const { run, pending } = useRun(t.errors);
  const groups = entries.filter(e => e.kind === "group");
  return (
    <>
      {entries.length === 0 ? (
        <EmptyState title={w.emptyTitle} body={w.emptyBody} example={{ label: w.example!, busy: pending, onClick: () => void run(() => addExample()) }} />
      ) : (
        <ul className="component-list card">
          {entries.map((e, i) => (
            <li key={e.id}>
              <Line row={e} first={i === 0} last={i === entries.length - 1} groups={groups} languages={languages} t={t} />
              {e.children.length > 0 && (
                <ul className="component-children">
                  {e.children.map((c, k) => <li key={c.id}><Line row={c} first={k === 0} last={k === e.children.length - 1} groups={groups} languages={languages} t={t} /></li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="add-forms">
        <AddForm kind="component" groups={groups} languages={languages} t={t} />
        <AddForm kind="group" groups={groups} languages={languages} t={t} />
      </div>
    </>
  );
}
