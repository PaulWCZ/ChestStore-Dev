import { call, navigate, toast } from "@argentic/chest-app/client";
import { useState, useTransition } from "react";
import { CategoryIcon, Plus, Seat, Sliders, Trash } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "../i18n/format.ts";
import { fieldTypes, icons, kinds, limits, type FieldType, type IconName, type Kind } from "../shared/model.ts";
import { undoing } from "./undo.ts";

type Words = { settings: Catalogue["settings"]; icons: Catalogue["icons"]; common: Catalogue["common"] };
type FieldRow = { id: string; name: string; type: FieldType };
type Cat = { id: string; name: string; builtIn: string | null; icon: IconName; kind: Kind; total: number; membersSee: boolean; fields: FieldRow[] };

// Each category on one line: its icon (a menu of icons), its name (saved when
// one leaves the field), how many items, delete when empty (with Undo);
// whether members see who holds its items (saved when ticked).
export function CategoriesView({ categories, t, locale }: { categories: Cat[]; t: Words; locale: string }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState({ name: "", icon: "box" as IconName, kind: "asset" as Kind });
  const [error, setError] = useState<string | null>(null);
  const w = t.settings;


  return (
    <div className="stack">
      <ul className="cat-list">
        {categories.map(c => {
          const label = c.name || c.builtIn || "";
          return (
            <li key={c.id} id={`category-${c.id}`} className="cat-row">
              <IconMenu value={c.icon} label={format(w.iconOf, { name: label })} t={t} onPick={icon => start(async () => void (await call("saveCategory", { id: c.id, name: c.name, icon })))} />
              <div className="cat-name">
                <label className="visually-hidden" htmlFor={`cat-${c.id}`}>{w.name}</label>
                {/* A built-in category shows its name in the reader's language until renamed; emptied, it takes that name again. */}
                <input id={`cat-${c.id}`} className="field" defaultValue={label} maxLength={limits.categoryName}
                  onBlur={e => {
                    const name = e.target.value.trim();
                    if (name === label || (!name && !c.builtIn)) return;
                    start(async () => void (await call("saveCategory", { id: c.id, name: name === c.builtIn ? "" : name, icon: c.icon })));
                  }} />
                <span className="small muted">{plural(w.count, c.total, locale)}{c.kind === "licence" && <> · <Seat /> {w.licenceKind}</>}{c.kind === "consumable" && <> · {w.consumableKind}</>}</span>
              </div>
              <button type="button" className="button small quiet" disabled={pending || c.total > 0} title={c.total > 0 ? w.inUse : undefined} onClick={() => start(async () => {
                const r = await call("dropCategory", { id: c.id });
                if (!r.ok) return;
                toast({ id: `category-${c.id}`, text: format(w.removed, { name: label }), undo: undoing(() => call("undoDropCategory", { id: c.id }, { quiet: true })) });
              })}><Trash /><span>{w.remove}</span></button>
              {c.kind !== "consumable" && <SeeToggle id={c.id} label={label} on={c.membersSee} t={t} />}
              <FieldsEditor category={c} label={label} t={t} />
            </li>
          );
        })}
      </ul>
      <form className="summary-box" onSubmit={e => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await call("newCategory", adding, { quiet: true });
          if (!r.ok) return setError(r.message);
          toast(format(w.added, { name: adding.name.trim() }));
          setAdding({ name: "", icon: "box", kind: "asset" });
        });
      }}>
        <h2>{w.add}</h2>
        <div className="cat-row">
          <IconMenu value={adding.icon} label={w.icon} t={t} onPick={icon => setAdding(a => ({ ...a, icon }))} />
          <div className="cat-name">
            <label className="visually-hidden" htmlFor="cat-new">{w.addName}</label>
            <input id="cat-new" className="field" value={adding.name} onChange={e => setAdding(a => ({ ...a, name: e.target.value }))} placeholder={w.addPlaceholder} maxLength={limits.categoryName} />
          </div>
        </div>
        <fieldset className="kind-choices">
          <legend className="label">{w.kind}</legend>
          {kinds.map(k => (
            <label key={k} className="check"><input type="radio" name="new-kind" checked={adding.kind === k} onChange={() => setAdding(a => ({ ...a, kind: k }))} /><span>{w.kinds[k]}</span></label>
          ))}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div><button type="submit" className="button" disabled={pending || !adding.name.trim()}><Plus />{w.add}</button></div>
      </form>
    </div>
  );
}

// "Members see who holds these": ticked at once, saved, said in a toast;
// refused, it goes back as it was.
function SeeToggle({ id, label, on, t }: { id: string; label: string; on: boolean; t: Words }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(on);
  const w = t.settings;
  return (
    <label className="check cat-see">
      <input type="checkbox" checked={value} disabled={pending} onChange={e => {
        const next = e.currentTarget.checked;
        setValue(next);
        start(async () => {
          const r = await call("setMembersSee", { id, value: next });
          if (!r.ok) return setValue(!next);
          toast(format(next ? w.seeOn : w.seeOff, { name: label }));
        });
      }} />
      <span>{w.membersSee}</span>
    </label>
  );
}

// A small menu of the icons a category may wear.
function IconMenu({ value, label, t, onPick }: { value: IconName; label: string; t: Words; onPick: (icon: IconName) => void }) {
  return (
    <details className="menu">
      <summary className="icon-button big-icon"><CategoryIcon name={value} /><span className="visually-hidden">{label}</span></summary>
      <div className="menu-list icon-grid" role="group" aria-label={label}>
        {icons.map(icon => (
          <button key={icon} type="button" className={icon === value ? "icon-choice picked" : "icon-choice"} aria-pressed={icon === value} onClick={e => { onPick(icon); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}>
            <CategoryIcon name={icon} /><span className="visually-hidden">{t.icons[icon]}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

// A category's own fields (IMEI, RAM, licence plate…): renamed when one
// leaves the name, removed with Undo, added with a name and a type.
function FieldsEditor({ category, label, t }: { category: Cat; label: string; t: Words }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [error, setError] = useState<string | null>(null);
  const w = t.settings;
  const summary = category.fields.length > 0 ? category.fields.map(f => f.name).join(" · ") : w.fieldsNone;
  return (
    <details className="fields-editor">
      <summary className="button link small"><Sliders />{w.fields}<span className="muted fields-summary">{summary}</span></summary>
      <div className="stack">
        <h3 className="visually-hidden">{format(w.fieldsOf, { name: label })}</h3>
        {category.fields.length > 0 && (
          <ul className="field-list">
            {category.fields.map(f => (
              <li key={f.id} id={`field-row-${f.id}`}>
                <label className="visually-hidden" htmlFor={`field-${f.id}`}>{format(w.renameField, { name: f.name })}</label>
                <input id={`field-${f.id}`} className="field" defaultValue={f.name} maxLength={limits.fieldName}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== f.name) start(async () => void (await call("saveField", { id: f.id, name: v }))); }} />
                <span className="small muted">{w.fieldTypes[f.type]}</span>
                <button type="button" className="icon-button" disabled={pending} onClick={() => start(async () => {
                  const r = await call("dropField", { id: f.id });
                  if (!r.ok) return;
                  toast({ id: `field-${f.id}`, text: format(w.fieldRemoved, { name: f.name }), undo: undoing(() => call("undoDropField", { id: f.id }, { quiet: true })) });
                })}><Trash /><span className="visually-hidden">{format(w.removeField, { name: f.name })}</span></button>
              </li>
            ))}
          </ul>
        )}
        <form className="field-add" onSubmit={e => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await call("newField", { categoryId: category.id, name, type }, { quiet: true });
            if (!r.ok) return setError(r.message);
            toast(format(w.fieldAdded, { name: name.trim() }));
            setName("");
            setType("text");
          });
        }}>
          <div className="form-field">
            <label className="label" htmlFor={`new-field-${category.id}`}>{w.fieldName}</label>
            <input id={`new-field-${category.id}`} className="field" value={name} onChange={e => setName(e.target.value)} maxLength={limits.fieldName} placeholder={w.fieldPlaceholder} />
          </div>
          <div className="form-field">
            <label className="label" htmlFor={`new-type-${category.id}`}>{w.fieldType}</label>
            <select id={`new-type-${category.id}`} className="field" value={type} onChange={e => setType(e.target.value as FieldType)}>
              {fieldTypes.map(ft => <option key={ft} value={ft}>{w.fieldTypes[ft]}</option>)}
            </select>
          </div>
          <button type="submit" className="button quiet" disabled={pending || !name.trim()}><Plus />{w.addField}</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </details>
  );
}
