"use client";

import { Dialog, useToast } from "@argentic/chest-ui/components";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { useState, useTransition } from "react";
import { Star } from "../../components/icons.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import type { ViewParams } from "../../lib/views.ts";
import { removeView, restoreView, saveView } from "./actions.ts";

// "Save this view": what the inbox shows now (words, priority, tag, order),
// under a name, in everyone's side column — named in the kit's dialog (a
// typed name is never lost to a stray click).
export function SaveView({ params, t }: { params: ViewParams; t: { inbox: Catalogue["inbox"]; dialog: DialogWords; errors: Catalogue["errors"] } }) {
  const w = t.inbox;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const close = () => { setOpen(false); setName(""); setError(null); };
  return (
    <>
      <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={() => setOpen(true)}><Star />{w.saveView}</button>
      <Dialog open={open} title={w.saveView} onClose={close} dirty={name.trim() !== ""} size="s" labels={t.dialog}
        footer={<>
          <button type="button" className="ck-button ck-button-quiet" onClick={close}>{w.cancel}</button>
          <button type="submit" form="save-view" className="ck-button" disabled={pending || !name.trim()}>{w.viewSave}</button>
        </>}>
        <form id="save-view" className="stack" onSubmit={e => {
          e.preventDefault();
          start(async () => {
            const r = await saveView(name, params);
            if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
            close();
            const view = r.value;
            toast({ id: `view-${view.id}`, text: w.viewSaved, undo: async () => (await removeView(view.id)).ok });
          });
        }}>
          <div>
            <label className="label" htmlFor="view-name">{w.viewName}</label>
            <input id="view-name" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={40} required aria-describedby={error ? "view-error" : undefined} />
          </div>
          {error && <p id="view-error" className="error" role="alert">{error}</p>}
        </form>
      </Dialog>
    </>
  );
}

// Deleting a view (from the inbox while it shows): it is gone for the
// whole team, and Undo brings it back.
export function RemoveView({ id, t }: { id: string; t: Catalogue["inbox"] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button type="button" className="link-button danger" disabled={pending} onClick={() => start(async () => {
      const r = await removeView(id);
      if (!r.ok) return;
      const gone = r.value;
      toast({ id: `view-${id}`, text: format(t.viewRemoved, { name: gone.name }), undo: async () => (await restoreView(gone.name, gone.params)).ok });
    })}>{t.removeView}</button>
  );
}
