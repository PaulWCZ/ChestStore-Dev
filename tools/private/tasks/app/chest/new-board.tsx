"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../components/dialog.tsx";
import { Plus } from "../../components/icons.tsx";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format } from "../../lib/i18n/format.ts";
import { createBoard } from "./actions.ts";

type Words = { create: Catalogue["create"]; templates: Catalogue["templates"]; errors: Catalogue["errors"] };
const templateKeys = ["simple", "project", "onboarding", "empty"] as const;

// "New board": a name, how to start, who sees it. Three decisions, one
// screen; the board opens right after.
export function NewBoardButton({ t, label, primary = false, tile = false }: { t: Words; label: string; primary?: boolean; tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit(data: FormData) {
    setError(null);
    start(async () => {
      const result = await createBoard({ name: String(data.get("name") ?? ""), template: String(data.get("template") ?? "simple"), visibility: String(data.get("visibility") ?? "team") });
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      router.push(`/chest/boards/${result.value.id}`);
    });
  }
  return (
    <>
      <button type="button" className={tile ? "tile new" : primary ? "button" : "button quiet"} onClick={() => setOpen(true)}><Plus />{label}</button>
      <Dialog open={open} title={t.create.title} closeLabel={t.create.cancel} onClose={() => setOpen(false)}>
        <form action={submit} className="stack">
          <div>
            <label className="label" htmlFor="board-name">{t.create.name}</label>
            <input id="board-name" name="name" className="field" required maxLength={80} placeholder={t.create.namePlaceholder} autoFocus aria-describedby={error ? "board-error" : undefined} />
          </div>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">{t.create.template}</legend>
            <div className="choices">
              {templateKeys.map((key, i) => (
                <label key={key} className="choice">
                  <input type="radio" name="template" value={key} defaultChecked={i === 0} />
                  {t.templates[key]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">{t.create.visibility}</legend>
            <div className="choices">
              <label className="choice"><input type="radio" name="visibility" value="team" defaultChecked />{t.create.team}</label>
              <label className="choice"><input type="radio" name="visibility" value="private" />{t.create.private}</label>
            </div>
          </fieldset>
          {error && <p id="board-error" className="error" role="alert">{error}</p>}
          <div className="dialog-foot">
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.create.cancel}</button>
            <button type="submit" className="button" disabled={pending}>{t.create.submit}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
