"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createPage } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { Dialog } from "./dialog.tsx";

export type NewPageWords = { newPage: Catalogue["newPage"]; common: Catalogue["common"]; errors: Catalogue["errors"] };
export type PageTarget = { spaceId: string; spaceName: string; parentId: string | null; parentTitle: string | null };

// "New page": a title, where it goes is already said; the editor opens
// right after.
export function NewPageDialog({ target, onClose, t }: { target: PageTarget | null; onClose: () => void; t: NewPageWords }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit(data: FormData) {
    if (!target) return;
    setError(null);
    start(async () => {
      const result = await createPage({ spaceId: target.spaceId, parentId: target.parentId, title: String(data.get("title") ?? "") });
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      onClose();
      router.push(`/chest/pages/${result.value.id}/edit`);
    });
  }
  return (
    <Dialog open={target !== null} title={t.newPage.title} closeLabel={t.common.close} onClose={() => { setError(null); onClose(); }}>
      <form action={submit} className="stack">
        <p className="where">{target?.parentTitle ? format(t.newPage.inside, { title: target.parentTitle }) : format(t.newPage.at, { space: target?.spaceName ?? "" })}</p>
        <div>
          <label className="label" htmlFor="new-page-title">{t.newPage.name}</label>
          <input id="new-page-title" name="title" className="field" required maxLength={200} placeholder={t.newPage.placeholder} autoFocus autoComplete="off" aria-describedby={error ? "new-page-error" : undefined} />
        </div>
        {error && <p id="new-page-error" className="error" role="alert">{error}</p>}
        <div className="dialog-foot">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={pending}>{t.newPage.create}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewPageButton({ target, t, className = "button", children }: { target: PageTarget; t: NewPageWords; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      <NewPageDialog target={open ? target : null} onClose={() => setOpen(false)} t={t} />
    </>
  );
}
