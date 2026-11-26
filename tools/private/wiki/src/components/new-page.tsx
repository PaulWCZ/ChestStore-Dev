import { call, fill as format, navigate } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import { useEffect, useState, useTransition } from "react";
import type { NewPageWords } from "../i18n/index.ts";

export type { NewPageWords };
export type PageTarget = { spaceId: string; spaceName: string; parentId: string | null; parentTitle: string | null };

const builtins = ["meeting", "howto", "decision"] as const;

// "New page": a title, and what it starts from — blank (chosen already),
// one of the space's templates, or a ready-made model. Where it goes is
// already said; the editor opens right after. The kit's dialog opens on the
// title and, once something is typed, asks before closing.
export function NewPageDialog({ target, onClose, t }: { target: PageTarget | null; onClose: () => void; t: NewPageWords }) {
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("blank");
  const [own, setOwn] = useState<{ id: string; title: string }[]>([]);
  const [pending, begin] = useTransition();
  const spaceId = target?.spaceId ?? null;
  useEffect(() => {
    setStart("blank");
    setTitle("");
    setError(null);
    setOwn([]);
    if (spaceId === null) return;
    let live = true;
    // A space of its own ("new", "mine") has no templates yet.
    if (!/^[1-9][0-9]*$/u.test(spaceId)) return;
    void call("listTemplates", { spaceId }, { refresh: false, quiet: true }).then(result => { if (live && result.ok) setOwn(result.value); });
    return () => { live = false; };
  }, [spaceId]);
  function submit() {
    if (!target) return;
    setError(null);
    begin(async () => {
      const result = await call("createPage", { spaceId: target.spaceId, parentId: target.parentId, title, start }, { refresh: false, quiet: true });
      if (!result.ok) return setError(result.message);
      onClose();
      await navigate(`/chest/pages/${result.value.id}/edit?new=1`);
    });
  }
  const choices = [
    { value: "blank", label: t.templates.blank },
    ...own.map(o => ({ value: o.id, label: o.title })),
    ...builtins.map(b => ({ value: `builtin:${b}`, label: t.templates.builtin[b] })),
  ];
  return (
    <Dialog open={target !== null} title={t.newPage.title} labels={t.dialog} dirty={title.trim() !== ""} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="where">{target?.parentTitle ? format(t.newPage.inside, { title: target.parentTitle }) : format(t.newPage.at, { space: target?.spaceName ?? "" })}</p>
        <div>
          <label className="label" htmlFor="new-page-title">{t.newPage.name}</label>
          <input id="new-page-title" name="title" className="field" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder={t.newPage.placeholder} autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? "new-page-error" : undefined} />
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
