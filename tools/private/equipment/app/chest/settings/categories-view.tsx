"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CategoryIcon, Plus, Seat, Trash } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { icons, limits, type IconName } from "../../../lib/model.ts";
import { dropCategory, newCategory, saveCategory, undoDropCategory } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; icons: Catalogue["icons"]; errors: Catalogue["errors"]; common: Catalogue["common"] };
type Cat = { id: string; name: string; builtIn: string | null; icon: IconName; licence: boolean; total: number };

// Each category on one line: its icon (a menu of icons), its name (saved when
// one leaves the field), how many items, remove when empty (with Undo).
export function CategoriesView({ categories, t, locale }: { categories: Cat[]; t: Words; locale: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState({ name: "", icon: "box" as IconName, licence: false });
  const [error, setError] = useState<string | null>(null);
  const w = t.settings;
  const show = (r: { ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => {
    if (!r.ok) toast(format(t.errors[r.error ?? "unknown"], r.values));
    router.refresh();
  };

  return (
    <div className="stack">
      <ul className="cat-list">
        {categories.map(c => {
          const label = c.name || c.builtIn || "";
          return (
            <li key={c.id} className="cat-row">
              <IconMenu value={c.icon} label={format(w.iconOf, { name: label })} t={t} onPick={icon => start(async () => show(await saveCategory(c.id, { name: c.name, icon })))} />
              <div className="cat-name">
                <label className="visually-hidden" htmlFor={`cat-${c.id}`}>{w.name}</label>
                <input id={`cat-${c.id}`} className="field" defaultValue={c.name} placeholder={c.builtIn ?? ""} maxLength={limits.categoryName}
                  onBlur={e => { const name = e.target.value.trim(); if (name !== c.name && (name || c.builtIn)) start(async () => show(await saveCategory(c.id, { name, icon: c.icon }))); }} />
                <span className="small muted">{plural(w.count, c.total, locale)}{c.licence && <> · <Seat /> {w.licenceKind}</>}</span>
              </div>
              <button type="button" className="button small quiet" disabled={pending || c.total > 0} title={c.total > 0 ? w.inUse : undefined} onClick={() => start(async () => {
                const r = await dropCategory(c.id);
                if (!r.ok) return show(r);
                toast(format(w.removed, { name: label }), { label: t.common.undo, run: () => void undoDropCategory(c.id).then(() => router.refresh()) });
                router.refresh();
              })}><Trash /><span>{w.remove}</span></button>
            </li>
          );
        })}
      </ul>
      <form className="summary-box" onSubmit={e => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await newCategory(adding);
          if (!r.ok) return setError(format(t.errors[r.error], r.values));
          toast(format(w.added, { name: adding.name.trim() }));
          setAdding({ name: "", icon: "box", licence: false });
          router.refresh();
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
        <label className="check"><input type="checkbox" checked={adding.licence} onChange={e => setAdding(a => ({ ...a, licence: e.target.checked }))} /><span>{w.licence}</span></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div><button type="submit" className="button" disabled={pending || !adding.name.trim()}><Plus />{w.add}</button></div>
      </form>
    </div>
  );
}

// A small menu of the icons a category may wear.
function IconMenu({ value, label, t, onPick }: { value: IconName; label: string; t: Words; onPick: (icon: IconName) => void }) {
  return (
    <details className="menu icon-menu">
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
