"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Alert, Dots, Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { closeCycle, createCycle, deleteCycle, makeCurrent, reopenCycle, updateCycle } from "../actions.ts";

type Words = { cycles: Catalogue["cycles"]; errors: Catalogue["errors"] };
type CycleRow = { id: string; name: string; startsOn: string; endsOn: string; current: boolean; closed: boolean; empty: boolean };

// A cycle's name and dates: a form in a dialog.
function CycleFields({ name, startsOn, endsOn, onChange, t, current }: { name: string; startsOn: string; endsOn: string; onChange: (v: { name?: string; startsOn?: string; endsOn?: string; current?: boolean }) => void; t: Words; current?: boolean }) {
  return (
    <>
      <div><label className="label" htmlFor="cycle-name">{t.cycles.name}</label><input id="cycle-name" className="field" maxLength={60} value={name} onChange={e => onChange({ name: e.target.value })} autoFocus /></div>
      <div className="grid-2">
        <div><label className="label" htmlFor="cycle-starts">{t.cycles.starts}</label><input id="cycle-starts" type="date" className="field" value={startsOn} onChange={e => onChange({ startsOn: e.target.value })} /></div>
        <div><label className="label" htmlFor="cycle-ends">{t.cycles.ends}</label><input id="cycle-ends" type="date" className="field" value={endsOn} onChange={e => onChange({ endsOn: e.target.value })} /></div>
      </div>
      {current !== undefined && <label className="check"><input type="checkbox" checked={current} onChange={e => onChange({ current: e.target.checked })} />{t.cycles.makeCurrentToo}</label>}
    </>
  );
}

export function NewCycle({ suggestion, first, t }: { suggestion: { name: string; startsOn: string; endsOn: string }; first: boolean; t: Words }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ ...suggestion, current: first });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}><Plus />{t.cycles.new}</button>
      <Dialog open={open} title={t.cycles.new} closeLabel={t.cycles.cancel} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={e => {
          e.preventDefault();
          start(async () => {
            const r = await createCycle(v);
            if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
            setOpen(false);
            toast(t.cycles.created);
            router.refresh();
          });
        }}>
          <CycleFields name={v.name} startsOn={v.startsOn} endsOn={v.endsOn} current={v.current} onChange={p => setV({ ...v, ...p })} t={t} />
          {error && <p className="error" role="alert"><Alert />{error}</p>}
          <div className="form-actions"><button type="submit" className="button" disabled={pending}>{t.cycles.create}</button><button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.cycles.cancel}</button></div>
        </form>
      </Dialog>
    </>
  );
}

// An admin's actions on one cycle, in a menu: make current, edit, close or
// reopen, delete while empty.
export function CycleAdmin({ cycle, t }: { cycle: CycleRow; t: Words & { checkIn: Catalogue["checkIn"] } }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ name: cycle.name, startsOn: cycle.startsOn, endsOn: cycle.endsOn });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const c = t.cycles;
  const run = (step: () => Promise<{ ok: true } | { ok: false; error: keyof Words["errors"]; values?: Record<string, string | number> }>, done: string, undo?: () => Promise<unknown>) =>
    start(async () => {
      const r = await step();
      if (!r.ok) return toast(format(t.errors[r.error], r.values ?? {}));
      toast(done, undo ? { label: t.checkIn.undo, run: () => start(async () => { await undo(); router.refresh(); }) } : undefined);
      router.refresh();
    });
  const close = (e: MouseEvent) => { (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); };
  return (
    <>
      <details className="menu">
        <summary className="icon-button" aria-label={`${cycle.name}: ${c.edit}`}><Dots /></summary>
        <div className="menu-list">
          {!cycle.current && !cycle.closed && <button type="button" disabled={pending} onClick={e => { close(e); run(() => makeCurrent(cycle.id), format(c.madeCurrent, { name: cycle.name })); }}>{c.makeCurrent}</button>}
          <button type="button" onClick={e => { close(e); setEditing(true); }}>{c.edit}</button>
          {!cycle.closed
            ? <button type="button" disabled={pending} onClick={e => { close(e); run(() => closeCycle(cycle.id), format(c.closedToast, { name: cycle.name }), () => reopenCycle(cycle.id)); }}>{c.close}</button>
            : <button type="button" disabled={pending} onClick={e => { close(e); run(() => reopenCycle(cycle.id), format(c.reopened, { name: cycle.name })); }}>{c.reopen}</button>}
          {cycle.empty && <button type="button" className="danger" disabled={pending} onClick={e => { close(e); run(() => deleteCycle(cycle.id), c.removed); }}>{c.remove}</button>}
        </div>
      </details>
      <Dialog open={editing} title={c.edit} closeLabel={c.cancel} onClose={() => setEditing(false)}>
        <form className="stack" onSubmit={e => {
          e.preventDefault();
          start(async () => {
            const r = await updateCycle(cycle.id, v);
            if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
            setEditing(false);
            toast(c.saved);
            router.refresh();
          });
        }}>
          <CycleFields name={v.name} startsOn={v.startsOn} endsOn={v.endsOn} onChange={p => setV({ ...v, ...p })} t={t} />
          {error && <p className="error" role="alert"><Alert />{error}</p>}
          <div className="form-actions"><button type="submit" className="button" disabled={pending}>{c.save}</button><button type="button" className="button quiet" onClick={() => setEditing(false)}>{c.cancel}</button></div>
        </form>
      </Dialog>
    </>
  );
}
