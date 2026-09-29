"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../components/dialog.tsx";
import { Lock, Plus } from "../../components/icons.tsx";
import { PeoplePicker } from "../../components/people-picker.tsx";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format, plural } from "../../lib/i18n/format.ts";
import { createBoard } from "./actions.ts";

type Words = { create: Catalogue["create"]; templates: Catalogue["templates"]; errors: Catalogue["errors"] };
export type Sharing = { people: { id: string; name: string; photo: string | null }[]; groups: { id: string; name: string }[] };
const templateKeys = ["simple", "project", "onboarding", "empty"] as const;

// "New board": a name, how to start, who sees it — and, for a private
// board, whom it is shared with, chosen right here. Three decisions, one
// screen; the board opens right after.
export function NewBoardButton({ t, label, sharing, locale, primary = false, tile = false }: { t: Words; label: string; sharing: Sharing; locale: string; primary?: boolean; tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [people, setPeople] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const w = t.create;
  function submit(data: FormData) {
    setError(null);
    start(async () => {
      const result = await createBoard({ name: String(data.get("name") ?? ""), template: String(data.get("template") ?? "simple"), visibility, people, groups });
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      router.push(`/chest/boards/${result.value.id}`);
    });
  }
  const who = people.length === 0 && groups.length === 0 ? w.onlyYou : [people.length > 0 ? plural(w.andPeople, people.length, locale) : "", groups.length > 0 ? plural(w.andGroups, groups.length, locale) : ""].filter(Boolean).join(" · ");
  return (
    <>
      <button type="button" className={tile ? "tile new" : primary ? "button" : "button quiet"} onClick={() => setOpen(true)}><Plus />{label}</button>
      <Dialog open={open} title={w.title} closeLabel={w.cancel} onClose={() => setOpen(false)}>
        <form action={submit} className="stack">
          <div>
            <label className="label" htmlFor="board-name">{w.name}</label>
            <input id="board-name" name="name" className="field" required maxLength={80} placeholder={w.namePlaceholder} aria-describedby={error ? "board-error" : undefined} />
          </div>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">{w.template}</legend>
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
            <legend className="label">{w.visibility}</legend>
            <div className="choices">
              <label className="choice"><input type="radio" name="visibility" value="team" checked={visibility === "team"} onChange={() => setVisibility("team")} />{w.team}</label>
              <label className="choice"><input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} /><span><Lock /> {w.private}</span></label>
            </div>
          </fieldset>
          {visibility === "private" && (
            <section className="stack share-box" aria-labelledby="share-title">
              <div>
                <h3 id="share-title">{w.shareWith}</h3>
                <p className="hint" role="status">{format(w.seenBy, { who })}</p>
              </div>
              <PeoplePicker people={sharing.people} groups={sharing.groups} chosen={people} chosenGroups={groups} onChange={(p, g) => { setPeople(p); setGroups(g); }} t={{ find: w.find, groups: w.groups, people: w.shareWith }} />
            </section>
          )}
          {error && <p id="board-error" className="error" role="alert">{error}</p>}
          <div className="dialog-foot">
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{w.cancel}</button>
            <button type="submit" className="button" disabled={pending}>{w.submit}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
