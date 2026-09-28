"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createSpace } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { Dialog } from "./dialog.tsx";

export type NewSpaceWords = { newSpace: Catalogue["newSpace"]; common: Catalogue["common"]; errors: Catalogue["errors"] };

// "New space": a name and, if one likes, what it holds. Who may read it is
// set later, in its settings: most spaces are for everyone.
export function NewSpaceDialog({ open, onClose, t }: { open: boolean; onClose: () => void; t: NewSpaceWords }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit(data: FormData) {
    setError(null);
    start(async () => {
      const result = await createSpace({ name: String(data.get("name") ?? ""), description: String(data.get("description") ?? "") });
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      onClose();
      router.push(`/chest/spaces/${result.value.id}`);
    });
  }
  return (
    <Dialog open={open} title={t.newSpace.title} closeLabel={t.common.close} onClose={() => { setError(null); onClose(); }}>
      <form action={submit} className="stack">
        <div>
          <label className="label" htmlFor="new-space-name">{t.newSpace.name}</label>
          <input id="new-space-name" name="name" className="field" required maxLength={80} placeholder={t.newSpace.namePlaceholder} autoFocus autoComplete="off" aria-describedby={error ? "new-space-error" : undefined} />
        </div>
        <div>
          <label className="label" htmlFor="new-space-description">{t.newSpace.description}</label>
          <input id="new-space-description" name="description" className="field" maxLength={300} autoComplete="off" />
        </div>
        {error && <p id="new-space-error" className="error" role="alert">{error}</p>}
        <div className="dialog-foot">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={pending}>{pending ? t.newSpace.creating : t.newSpace.create}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewSpaceButton({ t, className = "button", children }: { t: NewSpaceWords; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      <NewSpaceDialog open={open} onClose={() => setOpen(false)} t={t} />
    </>
  );
}
