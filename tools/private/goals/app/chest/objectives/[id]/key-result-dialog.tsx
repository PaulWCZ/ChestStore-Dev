"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { Alert, Plus } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { KeyResultView } from "../../../../lib/views.ts";
import { addKeyResult, updateKeyResult } from "../../actions.ts";
import type { CheckInWords } from "../../views/check-in-form.tsx";
import { emptyDraft, KeyResultFields, krInput, type FieldWords, type KrDraft } from "../../views/key-result-fields.tsx";

export type KrWords = CheckInWords & FieldWords & { objective: Catalogue["objective"]; progress: Catalogue["progress"] };

// Adding a key result: a button, then its fields in a dialog.
export function AddKeyResult({ objectiveId, owners, defaultOwner, locale, currency, t, primary = false }: { objectiveId: string; owners: { id: string; name: string }[]; defaultOwner: string; locale: string; currency: string; t: KrWords; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<KrDraft>(emptyDraft(defaultOwner));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function save() {
    start(async () => {
      const r = await addKeyResult(objectiveId, krInput(draft));
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      setOpen(false);
      setDraft(emptyDraft(defaultOwner));
      setError(null);
      router.refresh();
    });
  }
  return (
    <>
      <button type="button" className={primary ? "button" : "button quiet small"} onClick={() => setOpen(true)}><Plus />{t.objective.addKeyResult}</button>
      <Dialog open={open} title={t.objective.addKeyResult} closeLabel={t.form.cancel} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
          <KeyResultFields draft={draft} onChange={setDraft} owners={owners} t={t} locale={locale} currency={currency} autoFocus />
          {error && <p className="error" role="alert"><Alert />{error}</p>}
          <div className="form-actions">
            <button type="submit" className="button" disabled={pending}>{pending ? t.form.saving : t.form.add}</button>
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.form.cancel}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// Editing one: the same fields, filled.
export function EditKeyResult({ kr, owners, locale, t, onClose }: { kr: KeyResultView; owners: { id: string; name: string }[]; locale: string; t: KrWords; onClose: () => void }) {
  const [draft, setDraft] = useState<KrDraft>({ title: kr.title, kind: kr.kind, start: kr.kind === "milestone" ? "0" : kr.startInput, target: kr.kind === "milestone" ? "1" : kr.targetInput, unit: kr.unit, owner: kr.owner.id, weight: String(kr.weight), source: kr.source });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function save() {
    start(async () => {
      const r = await updateKeyResult(kr.id, krInput(draft));
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      onClose();
      router.refresh();
    });
  }
  return (
    <Dialog open title={t.objective.editKeyResult} closeLabel={t.form.cancel} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        <KeyResultFields draft={draft} onChange={setDraft} owners={owners} t={t} locale={locale} currency={kr.currency} autoFocus />
        {error && <p className="error" role="alert"><Alert />{error}</p>}
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>{pending ? t.form.saving : t.form.save}</button>
          <button type="button" className="button quiet" onClick={onClose}>{t.form.cancel}</button>
        </div>
      </form>
    </Dialog>
  );
}
