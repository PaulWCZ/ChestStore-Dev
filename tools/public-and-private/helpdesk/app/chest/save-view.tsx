"use client";

import { useRef, useState, useTransition } from "react";
import { Star } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import type { ViewParams } from "../../lib/views.ts";
import { removeView, restoreView, saveView } from "./actions.ts";

// "Save this view": what the inbox shows now (words, priority, tag, order),
// under a name, in everyone's side column.
export function SaveView({ params, t }: { params: ViewParams; t: Catalogue["inbox"] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const menu = useRef<HTMLDetailsElement>(null);
  const toast = useToast();
  return (
    <details className="menu save-view" ref={menu}>
      <summary className="button quiet small"><Star />{t.saveView}</summary>
      <form className="menu-pop down stack" onSubmit={e => {
        e.preventDefault();
        start(async () => {
          const r = await saveView(name, params);
          if (!r.ok) return;
          setName("");
          if (menu.current) menu.current.open = false;
          const view = r.value;
          toast(t.viewSaved, { label: t.undo, run: () => start(async () => { await removeView(view.id); }) });
        });
      }}>
        <label className="label small" htmlFor="view-name">{t.viewName}</label>
        <input id="view-name" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={40} required />
        <div><button type="submit" className="button small" disabled={pending || !name.trim()}>{t.viewSave}</button></div>
      </form>
    </details>
  );
}

// Removing a view (from the inbox while it shows): Undo brings it back.
export function RemoveView({ id, t }: { id: string; t: Catalogue["inbox"] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button type="button" className="link-button danger" disabled={pending} onClick={() => start(async () => {
      const r = await removeView(id);
      if (!r.ok) return;
      const gone = r.value;
      toast(format(t.viewRemoved, { name: gone.name }), { label: t.undo, run: () => start(async () => { await restoreView(gone.name, gone.params); }) });
    })}>{t.removeView}</button>
  );
}
