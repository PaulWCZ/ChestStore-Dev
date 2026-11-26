import { call, navigate } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useState, useTransition } from "react";
import type { Catalogue } from "../i18n/index.ts";

export type NewSpaceWords = { newSpace: Catalogue["newSpace"]; common: Catalogue["common"]; dialog: DialogWords };

// "New space": a name and, if one likes, what it holds. Who may read it is
// set later, in its settings: most spaces are for everyone.
export function NewSpaceDialog({ open, onClose, t }: { open: boolean; onClose: () => void; t: NewSpaceWords }) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setError(null);
  }, [open]);
  function submit() {
    setError(null);
    start(async () => {
      const result = await call("createSpace", { name, description }, { refresh: false, quiet: true });
      if (!result.ok) return setError(result.message);
      onClose();
      await navigate(`/chest/spaces/${result.value.id}`);
    });
  }
  return (
    <Dialog open={open} title={t.newSpace.title} labels={t.dialog} dirty={name.trim() !== "" || description.trim() !== ""} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div>
          <label className="label" htmlFor="new-space-name">{t.newSpace.name}</label>
          <input id="new-space-name" name="name" className="field" required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t.newSpace.namePlaceholder} autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? "new-space-error" : undefined} />
        </div>
        <div>
          <label className="label" htmlFor="new-space-description">{t.newSpace.description}</label>
          <input id="new-space-description" name="description" className="field" maxLength={300} value={description} onChange={e => setDescription(e.target.value)} autoComplete="off" />
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
