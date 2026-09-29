"use client";

import { Dialog } from "@argentic/chest-ui/components";
import type { DialogWords, TableWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Alert, Plus } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { KeyResultView } from "../../../../lib/views.ts";
import { addKeyResult, updateKeyResult } from "../../actions.ts";
import type { CheckInWords } from "../../views/check-in-form.tsx";
import { emptyDraft, KeyResultFields, krInput, sameDraft, type FieldWords, type KrDraft, type Owner } from "../../views/key-result-fields.tsx";

export type KrWords = CheckInWords & FieldWords & { objective: Catalogue["objective"]; progress: Catalogue["progress"]; dialog: DialogWords; tables: TableWords };

// The fields of a key result in the kit's dialog: closing it after a
// change asks first ("Discard your changes?"), never loses what was typed.
function KeyResultDialog({ open, title, initial, saveLabel, owners, locale, currency, t, save, onClose }: { open: boolean; title: string; initial: KrDraft; saveLabel: string; owners: Owner[]; locale: string; currency: string | null; t: KrWords; save: (draft: KrDraft) => Promise<string | null>; onClose: () => void }) {
  const formId = useId();
  const [draft, setDraft] = useState<KrDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
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
        start(async () => {
          const problem = await save(draft);
          if (problem) return setError(problem);
          setError(null);
          setDraft(initial);
          onClose();
        });
      }}>
        <KeyResultFields draft={draft} onChange={setDraft} owners={owners} t={t} locale={locale} currency={currency} />
        {error && <p className="error" role="alert"><Alert />{error}</p>}
      </form>
    </Dialog>
  );
}

// Adding a key result: a button, then its fields in a dialog.
export function AddKeyResult({ objectiveId, owners, defaultOwner, locale, currency, t, primary = false }: { objectiveId: string; owners: Owner[]; defaultOwner: string; locale: string; currency: string; t: KrWords; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className={primary ? "button" : "button quiet small"} onClick={() => setOpen(true)}><Plus />{t.objective.addKeyResult}</button>
      <KeyResultDialog open={open} title={t.objective.addKeyResult} initial={emptyDraft(defaultOwner)} saveLabel={t.form.add} owners={owners} locale={locale} currency={currency} t={t} onClose={() => setOpen(false)}
        save={async draft => {
          const r = await addKeyResult(objectiveId, krInput(draft));
          if (!r.ok) return format(t.errors[r.error], r.values ?? {});
          router.refresh();
          return null;
        }} />
    </>
  );
}

// Editing one: the same fields, filled.
export function EditKeyResult({ kr, owners, locale, t, onClose }: { kr: KeyResultView; owners: Owner[]; locale: string; t: KrWords; onClose: () => void }) {
  const router = useRouter();
  const initial: KrDraft = { title: kr.title, kind: kr.kind, start: kr.kind === "milestone" ? "0" : kr.startInput, target: kr.kind === "milestone" ? "1" : kr.targetInput, unit: kr.unit, owner: kr.owner.id, weight: String(kr.weight), source: kr.source };
  return (
    <KeyResultDialog open title={t.objective.editKeyResult} initial={initial} saveLabel={t.form.save} owners={owners} locale={locale} currency={kr.currency} t={t} onClose={onClose}
      save={async draft => {
        const r = await updateKeyResult(kr.id, krInput(draft));
        if (!r.ok) return format(t.errors[r.error], r.values ?? {});
        router.refresh();
        return null;
      }} />
  );
}
