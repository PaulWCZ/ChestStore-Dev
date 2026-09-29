"use client";

import { Confirm, DateField, Dialog, Menu, useToast } from "@argentic/chest-ui/components";
import type { DateWords, DialogWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Alert, Plus } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { closeCycle, createCycle, deleteCycle, makeCurrent, reopenCycle, updateCycle } from "../actions.ts";

type Words = { cycles: Catalogue["cycles"]; errors: Catalogue["errors"]; date: DateWords; dialog: DialogWords };
type CycleRow = { id: string; name: string; startsOn: string; endsOn: string; current: boolean; closed: boolean; empty: boolean };
type Values = { name: string; startsOn: string; endsOn: string; current?: boolean };
type Failed = { ok: false; error: keyof Catalogue["errors"]; values?: Record<string, string | number> };

// A cycle's name and dates (the kit's date fields: typed in the reader's
// language, or on a calendar).
function CycleFields({ v, onChange, today, t }: { v: Values; onChange: (patch: Partial<Values>) => void; today: string; t: Words }) {
  const uid = useId();
  return (
    <>
      <div><label className="label" htmlFor={`${uid}-name`}>{t.cycles.name}</label><input id={`${uid}-name`} className="field" maxLength={60} value={v.name} onChange={e => onChange({ name: e.target.value })} /></div>
      <div className="grid-2">
        <DateField label={t.cycles.starts} value={v.startsOn || null} onChange={d => onChange({ startsOn: d ?? "" })} today={today} chips={false} labels={t.date} />
        <DateField label={t.cycles.ends} value={v.endsOn || null} onChange={d => onChange({ endsOn: d ?? "" })} today={today} min={v.startsOn || null} chips={false} labels={t.date} />
      </div>
      {v.current !== undefined && <label className="check"><input type="checkbox" checked={v.current} onChange={e => onChange({ current: e.target.checked })} />{t.cycles.makeCurrentToo}</label>}
    </>
  );
}

// The form of a cycle, in the kit's dialog: closing it after a change asks
// first, never loses what was typed.
function CycleDialog({ open, title, initial, submit, saveLabel, today, t, onClose }: { open: boolean; title: string; initial: Values; submit: (v: Values) => Promise<{ ok: true } | Failed>; saveLabel: string; today: string; t: Words; onClose: () => void }) {
  const formId = useId();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = v.name !== initial.name || v.startsOn !== initial.startsOn || v.endsOn !== initial.endsOn;
  const close = () => { setV(initial); setError(null); onClose(); };
  return (
    <Dialog open={open} title={title} onClose={close} dirty={dirty} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={close}>{t.cycles.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending}>{saveLabel}</button>
      </>}>
      <form id={formId} className="stack" onSubmit={e => {
        e.preventDefault();
        start(async () => {
          const r = await submit(v);
          if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
          setError(null);
          onClose();
        });
      }}>
        <CycleFields v={v} onChange={p => setV({ ...v, ...p })} today={today} t={t} />
        {error && <p className="error" role="alert"><Alert />{error}</p>}
      </form>
    </Dialog>
  );
}

export function NewCycle({ suggestion, first, today, t }: { suggestion: { name: string; startsOn: string; endsOn: string }; first: boolean; today: string; t: Words }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}><Plus />{t.cycles.new}</button>
      <CycleDialog open={open} title={t.cycles.new} initial={{ ...suggestion, current: first }} saveLabel={t.cycles.create} today={today} t={t} onClose={() => setOpen(false)}
        submit={async v => {
          const r = await createCycle(v);
          if (!r.ok) return r;
          toast({ id: "cycle-created", text: t.cycles.created });
          router.refresh();
          return { ok: true };
        }} />
    </>
  );
}

// An admin's actions on one cycle, in the kit's menu: make current, edit,
// close or reopen (Undo from the toast), delete while empty (it cannot be
// undone: asked first).
export function CycleAdmin({ cycle, today, t }: { cycle: CycleRow; today: string; t: Words }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const c = t.cycles;
  const failed = (r: Failed) => format(t.errors[r.error], r.values ?? {});
  const run = (step: () => Promise<{ ok: true } | Failed>, done: string, undo?: () => Promise<{ ok: true } | Failed>) =>
    start(async () => {
      const r = await step();
      if (!r.ok) return void toast({ text: failed(r), tone: "error" });
      toast({
        id: `cycle-${cycle.id}`,
        text: done,
        ...(undo ? { undo: async () => { const back = await undo(); if (!back.ok) return failed(back); router.refresh(); return true; } } : {}),
      });
      router.refresh();
    });
  return (
    <>
      <Menu
        label={format(c.menu, { name: cycle.name })}
        items={[
          ...(!cycle.current && !cycle.closed ? [{ label: c.makeCurrent, disabled: pending, onSelect: () => run(() => makeCurrent(cycle.id), format(c.madeCurrent, { name: cycle.name })) }] : []),
          { label: c.edit, onSelect: () => setEditing(true) },
          cycle.closed
            ? { label: c.reopen, disabled: pending, onSelect: () => run(() => reopenCycle(cycle.id), format(c.reopened, { name: cycle.name })) }
            : { label: c.close, disabled: pending, onSelect: () => run(() => closeCycle(cycle.id), format(c.closedToast, { name: cycle.name }), () => reopenCycle(cycle.id)) },
          ...(cycle.empty ? [{ label: c.remove, tone: "danger" as const, onSelect: () => setDeleting(true) }] : []),
        ]}
      />
      <CycleDialog open={editing} title={c.edit} initial={{ name: cycle.name, startsOn: cycle.startsOn, endsOn: cycle.endsOn }} saveLabel={c.save} today={today} t={t} onClose={() => setEditing(false)}
        submit={async v => {
          const r = await updateCycle(cycle.id, v);
          if (!r.ok) return r;
          toast({ id: `cycle-${cycle.id}`, text: c.saved });
          router.refresh();
          return { ok: true };
        }} />
      <Confirm open={deleting} title={format(c.deleteTitle, { name: cycle.name })} body={c.deleteBody} confirmLabel={c.remove} cancelLabel={c.cancel} busy={pending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => start(async () => {
          const r = await deleteCycle(cycle.id);
          setDeleting(false);
          if (!r.ok) return void toast({ text: failed(r), tone: "error" });
          toast({ id: `cycle-${cycle.id}`, text: c.removed });
          router.refresh();
        })} />
    </>
  );
}
