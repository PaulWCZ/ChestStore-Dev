import { call } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import type { DialogWords, TableWords } from "@argentic/chest-ui/components/logic";
import { useId, useState } from "react";
import type { Catalogue } from "../i18n/index.ts";
import type { KeyResultView } from "../lib/views.ts";
import type { CheckInWords } from "./check-in-form.tsx";
import { Alert, Plus } from "./icons.tsx";
import { emptyDraft, KeyResultFields, krInput, sameDraft, type Board, type FieldWords, type KrDraft, type Owner } from "./key-result-fields.tsx";

export type KrWords = CheckInWords & FieldWords & { objective: Catalogue["objective"]; progress: Catalogue["progress"]; dialog: DialogWords; tables: TableWords };

// The fields of a key result in the kit's dialog: closing it after a
// change asks first ("Discard your changes?"), never loses what was typed.
function KeyResultDialog({ open, title, initial, saveLabel, owners, locale, currency, t, save, onClose, boards = [] }: { boards?: Board[]; open: boolean; title: string; initial: KrDraft; saveLabel: string; owners: Owner[]; locale: string; currency: string | null; t: KrWords; save: (draft: KrDraft) => Promise<string | null>; onClose: () => void }) {
  const formId = useId();
  const [draft, setDraft] = useState<KrDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => { setDraft(initial); setError(null); onClose(); };
  return (
    <Dialog open={open} title={title} onClose={close} dirty={!sameDraft(draft, initial)} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={close}>{t.form.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending}>{pending ? t.form.saving : saveLabel}</button>
      </>}>
      <form id={formId} className="stack" onSubmit={e => {
        e.preventDefault();
        if (!draft.owner) return setError(t.form.ownerMissing);
        if (pending) return;
        setPending(true);
        void save(draft).then(problem => {
          setPending(false);
          if (problem) return setError(problem);
          setError(null);
          setDraft(initial);
          onClose();
        });
      }}>
        <KeyResultFields draft={draft} onChange={setDraft} owners={owners} t={t} locale={locale} currency={currency} boards={boards} />
        {error && <p className="error" role="alert"><Alert />{error}</p>}
      </form>
    </Dialog>
  );
}

// Adding a key result: a button, then its fields in a dialog.
export function AddKeyResult({ objectiveId, owners, defaultOwner, locale, currency, t, primary = false, boards = [] }: { boards?: Board[]; objectiveId: string; owners: Owner[]; defaultOwner: string; locale: string; currency: string; t: KrWords; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={primary ? "button" : "button quiet small"} onClick={() => setOpen(true)}><Plus />{t.objective.addKeyResult}</button>
      <KeyResultDialog open={open} title={t.objective.addKeyResult} initial={emptyDraft(defaultOwner)} saveLabel={t.form.add} owners={owners} boards={boards} locale={locale} currency={currency} t={t} onClose={() => setOpen(false)}
        save={async draft => {
          const r = await call("addKeyResult", { objectiveId, keyResult: krInput(draft) }, { quiet: true });
          return r.ok ? null : r.message;
        }} />
    </>
  );
}

// Editing one: the same fields, filled.
export function EditKeyResult({ kr, owners, locale, t, onClose, boards = [] }: { boards?: Board[]; kr: KeyResultView; owners: Owner[]; locale: string; t: KrWords; onClose: () => void }) {
  const initial: KrDraft = { title: kr.title, kind: kr.kind, start: kr.kind === "milestone" ? "0" : kr.startInput, target: kr.kind === "milestone" ? "1" : kr.targetInput, unit: kr.unit, owner: kr.owner.id, weight: String(kr.weight), source: kr.source, mine: kr.sourceMine, scope: kr.sourceScope ?? "" };
  return (
    <KeyResultDialog open title={t.objective.editKeyResult} initial={initial} saveLabel={t.form.save} owners={owners} boards={boards} locale={locale} currency={kr.currency} t={t} onClose={onClose}
      save={async draft => {
        const r = await call("updateKeyResult", { id: kr.id, keyResult: krInput(draft) }, { quiet: true });
        return r.ok ? null : r.message;
      }} />
  );
}
