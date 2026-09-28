"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPage, listTemplates } from "../app/chest/actions.ts";
import type { NewPageWords } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { Dialog } from "./dialog.tsx";

export type { NewPageWords };
export type PageTarget = { spaceId: string; spaceName: string; parentId: string | null; parentTitle: string | null };

const builtins = ["meeting", "howto", "decision"] as const;

// "New page": a title, and what it starts from — blank (chosen already),
// one of the space's templates, or a ready-made model. Where it goes is
// already said; the editor opens right after.
export function NewPageDialog({ target, onClose, t }: { target: PageTarget | null; onClose: () => void; t: NewPageWords }) {
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState("blank");
  const [own, setOwn] = useState<{ id: string; title: string }[]>([]);
  const [pending, begin] = useTransition();
  const router = useRouter();
  const spaceId = target?.spaceId ?? null;
  useEffect(() => {
    setStart("blank");
    setOwn([]);
    if (spaceId === null) return;
    let live = true;
    void listTemplates(spaceId).then(result => { if (live && result.ok) setOwn(result.value); });
    return () => { live = false; };
  }, [spaceId]);
  function submit(data: FormData) {
    if (!target) return;
    setError(null);
    begin(async () => {
      const result = await createPage({ spaceId: target.spaceId, parentId: target.parentId, title: String(data.get("title") ?? ""), start });
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      onClose();
      router.push(`/chest/pages/${result.value.id}/edit`);
    });
  }
  const choices = [
    { value: "blank", label: t.templates.blank },
    ...own.map(o => ({ value: o.id, label: o.title })),
    ...builtins.map(b => ({ value: `builtin:${b}`, label: t.templates.builtin[b] })),
  ];
  return (
    <Dialog open={target !== null} title={t.newPage.title} closeLabel={t.common.close} onClose={() => { setError(null); onClose(); }}>
      <form action={submit} className="stack">
        <p className="where">{target?.parentTitle ? format(t.newPage.inside, { title: target.parentTitle }) : format(t.newPage.at, { space: target?.spaceName ?? "" })}</p>
        <div>
          <label className="label" htmlFor="new-page-title">{t.newPage.name}</label>
          <input id="new-page-title" name="title" className="field" required maxLength={200} placeholder={t.newPage.placeholder} autoFocus autoComplete="off" aria-describedby={error ? "new-page-error" : undefined} />
        </div>
        <fieldset className="plain">
          <legend className="label">{t.templates.start}</legend>
          <div className="choices starts">
            {choices.map(c => (
              <label key={c.value} className="choice">
                <input type="radio" name="start" value={c.value} checked={start === c.value} onChange={() => setStart(c.value)} />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
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
