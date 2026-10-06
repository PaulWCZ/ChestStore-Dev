import { call, toast } from "@argentic/chest-app/client";
import { Confirm, Dialog, Menu } from "@argentic/chest-ui/components";
import type { DateWords, DialogWords } from "@argentic/chest-ui/components/logic";
import { useId, useState } from "react";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { Alert, Plus } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../shared/format.ts";

type Words = { cycles: Catalogue["cycles"]; errors: Catalogue["errors"]; date: DateWords; dialog: DialogWords };
type CycleRow = { id: string; name: string; startsOn: string; endsOn: string; current: boolean; closed: boolean; empty: boolean };
type Values = { name: string; startsOn: string; endsOn: string; current?: boolean };
type Done = { ok: true } | { ok: false; message: string };

// A cycle's name and dates (the kit's date fields: typed in the reader's
// language, or on a calendar).
function CycleFields({ v, onChange, onProblem, today, t }: { v: Values; onChange: (patch: Partial<Values>) => void; onProblem: (key: string) => (problem: string | null) => void; today: string; t: Words }) {
  const uid = useId();
  return (
    <>
      <div><label className="label" htmlFor={`${uid}-name`}>{t.cycles.name}</label><input id={`${uid}-name`} className="field" maxLength={60} value={v.name} onChange={e => onChange({ name: e.target.value })} /></div>
      <div className="grid-2">
        <WatchedDateField label={t.cycles.starts} value={v.startsOn || null} onChange={d => onChange({ startsOn: d ?? "" })} onProblem={onProblem("startsOn")} today={today} chips={false} labels={t.date} />
        <WatchedDateField label={t.cycles.ends} value={v.endsOn || null} onChange={d => onChange({ endsOn: d ?? "" })} onProblem={onProblem("endsOn")} today={today} min={v.startsOn || null} chips={false} labels={t.date} />
      </div>
      {v.current !== undefined && <label className="check"><input type="checkbox" checked={v.current} onChange={e => onChange({ current: e.target.checked })} />{t.cycles.makeCurrentToo}</label>}
    </>
  );
}

// The form of a cycle, in the kit's dialog: closing it after a change asks
// first, never loses what was typed.
function CycleDialog({ open, title, initial, submit, saveLabel, today, t, onClose }: { open: boolean; title: string; initial: Values; submit: (v: Values) => Promise<Done>; saveLabel: string; today: string; t: Words; onClose: () => void }) {
  const formId = useId();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // A day refused by its field (an end before the start, unreadable) leaves
  // the previous one in `v`: saving waits (kit 0.2.4).
  const dates = useDateProblems();
  const dirty = v.name !== initial.name || v.startsOn !== initial.startsOn || v.endsOn !== initial.endsOn;
  const close = () => { setV(initial); setError(null); onClose(); };
  return (
    <Dialog open={open} title={title} onClose={close} dirty={dirty} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={close}>{t.cycles.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending || dates.problem !== null}>{saveLabel}</button>
      </>}>
      <form id={formId} className="stack" onSubmit={e => {
        e.preventDefault();
        if (dates.problem || pending) return;
        setPending(true);
        void submit(v).then(r => {
          setPending(false);
          if (!r.ok) return setError(r.message);
          setError(null);
          onClose();
        });
      }}>
        <CycleFields v={v} onChange={p => setV({ ...v, ...p })} onProblem={dates.watch} today={today} t={t} />
        {error && <p className="error" role="alert"><Alert />{error}</p>}
      </form>
    </Dialog>
  );
}

export function NewCycle({ suggestion, first, today, t }: { suggestion: { name: string; startsOn: string; endsOn: string }; first: boolean; today: string; t: Words }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}><Plus />{t.cycles.new}</button>
      <CycleDialog open={open} title={t.cycles.new} initial={{ ...suggestion, current: first }} saveLabel={t.cycles.create} today={today} t={t} onClose={() => setOpen(false)}
        submit={async v => {
          const r = await call("createCycle", { name: v.name, startsOn: v.startsOn, endsOn: v.endsOn, current: v.current ?? false }, { quiet: true });
          if (!r.ok) return r;
          toast({ id: "cycle-created", text: t.cycles.created });
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
  const [pending, setPending] = useState(false);
  const c = t.cycles;
  // One change at a time from this menu; a refusal is a toast (call()).
  const run = async (step: () => Promise<Done>, done: string, undo?: () => Promise<Done>) => {
    if (pending) return;
    setPending(true);
    const r = await step();
    setPending(false);
    if (!r.ok) return;
    toast({
      id: `cycle-${cycle.id}`,
      text: done,
      ...(undo ? { undo: async () => { const back = await undo(); return back.ok ? true : back.message; } } : {}),
    });
  };
  const id = cycle.id;
  return (
    <>
      <Menu
        label={format(c.menu, { name: cycle.name })}
        items={[
          ...(!cycle.current && !cycle.closed ? [{ label: c.makeCurrent, disabled: pending, onSelect: () => void run(() => call("makeCurrent", { id }), format(c.madeCurrent, { name: cycle.name })) }] : []),
          { label: c.edit, onSelect: () => setEditing(true) },
          cycle.closed
            ? { label: c.reopen, disabled: pending, onSelect: () => void run(() => call("reopenCycle", { id }), format(c.reopened, { name: cycle.name })) }
            : { label: c.close, disabled: pending, onSelect: () => void run(() => call("closeCycle", { id }), format(c.closedToast, { name: cycle.name }), () => call("reopenCycle", { id }, { quiet: true })) },
          ...(cycle.empty ? [{ label: c.remove, tone: "danger" as const, onSelect: () => setDeleting(true) }] : []),
        ]}
      />
      <CycleDialog open={editing} title={c.edit} initial={{ name: cycle.name, startsOn: cycle.startsOn, endsOn: cycle.endsOn }} saveLabel={c.save} today={today} t={t} onClose={() => setEditing(false)}
        submit={async v => {
          const r = await call("updateCycle", { id, name: v.name, startsOn: v.startsOn, endsOn: v.endsOn }, { quiet: true });
          if (!r.ok) return r;
          toast({ id: `cycle-${cycle.id}`, text: c.saved });
          return { ok: true };
        }} />
      <Confirm open={deleting} title={format(c.deleteTitle, { name: cycle.name })} body={c.deleteBody} confirmLabel={c.remove} cancelLabel={c.cancel} busy={pending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => void (async () => {
          if (pending) return;
          setPending(true);
          const r = await call("deleteCycle", { id });
          setPending(false);
          setDeleting(false);
          if (r.ok) toast({ id: `cycle-${cycle.id}`, text: c.removed });
        })()} />
    </>
  );
}
