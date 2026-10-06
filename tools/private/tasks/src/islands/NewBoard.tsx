import { Dialog, PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type Choice } from "@argentic/chest-ui/components/logic";
import { useId, useMemo, useState, useTransition } from "react";
import { Lock, Plus } from "../components/icons.tsx";
import { call } from "../core/client.tsx";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

export type NewBoardWords = { create: Catalogue["create"]; templates: Pick<Catalogue["templates"], "simple" | "project" | "onboarding" | "empty">; dialog: Catalogue["dialog"]; peoplePicker: Catalogue["peoplePicker"] };
type Words = NewBoardWords;
export type Sharing = { people: { id: string; name: string; photo: string | null }[]; groups: { id: string; name: string }[] };
const templateKeys = ["simple", "project", "onboarding", "empty"] as const;

// "New board": a name, how to start, who sees it — and, for a private
// board, whom it is shared with (people and Chest groups, found by typing
// a name), chosen right here. Three decisions, one screen; the board opens
// right after.
export function NewBoard({ t, label, sharing, locale, primary = false, tile = false }: { t: Words; label: string; sharing: Sharing; locale: string; primary?: boolean; tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [chosen, setChosen] = useState<Choice[]>([]);
  const [pending, start] = useTransition();
  const formId = useId();
  const w = t.create;
  // Groups first, then people: whom a private board may be shared with.
  const choices = useMemo<Choice[]>(() => [
    ...sharing.groups.map(g => ({ kind: "group" as const, id: g.id, name: g.name })),
    ...sharing.people.map(p => ({ kind: "member" as const, id: p.id, name: p.name, photo: p.photo })),
  ], [sharing]);
  const search = useMemo(() => localSearch(choices), [choices]);
  const people = chosen.filter(c => c.kind !== "group").map(c => c.id);
  const groups = chosen.filter(c => c.kind === "group").map(c => c.id);
  const close = () => {
    setOpen(false);
    setName("");
    setChosen([]);
    setVisibility("team");
    setError(null);
  };
  // The board opens once made (the action sends there).
  function submit(data: FormData) {
    setError(null);
    start(async () => {
      const template = String(data.get("template") ?? "simple");
      const result = await call("createBoard", { name: String(data.get("name") ?? ""), template: templateKeys.find(k => k === template) ?? "simple", visibility, people, groups }, { quiet: true });
      if (!result.ok) setError(result.message);
    });
  }
  const who = people.length === 0 && groups.length === 0 ? w.onlyYou : [people.length > 0 ? plural(w.andPeople, people.length, locale) : "", groups.length > 0 ? plural(w.andGroups, groups.length, locale) : ""].filter(Boolean).join(" · ");
  return (
    <>
      <button type="button" className={tile ? "tile new" : primary ? "button" : "button quiet"} onClick={() => setOpen(true)}><Plus />{label}</button>
      <Dialog open={open} title={w.title} onClose={close} dirty={name.trim() !== "" || chosen.length > 0} labels={t.dialog}
        footer={<>
          <button type="button" className="button quiet" onClick={close}>{w.cancel}</button>
          <button type="submit" form={formId} className="button" disabled={pending}>{w.submit}</button>
        </>}>
        <form id={formId} className="stack" onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
          <div>
            <label className="label" htmlFor="board-name">{w.name}</label>
            <input id="board-name" name="name" className="field" required maxLength={80} placeholder={w.namePlaceholder} value={name} onChange={e => setName(e.target.value)} aria-describedby={error ? "board-error" : undefined} />
          </div>
          <fieldset className="stack plain">
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
          <fieldset className="stack plain">
            <legend className="label">{w.visibility}</legend>
            <div className="choices">
              <label className="choice"><input type="radio" name="visibility" value="team" checked={visibility === "team"} onChange={() => setVisibility("team")} />{w.team}</label>
              <label className="choice"><input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} /><span><Lock /> {w.private}</span></label>
            </div>
          </fieldset>
          {visibility === "private" && (
            <section className="stack share-box" aria-label={w.shareWith}>
              <PeoplePicker label={w.shareWith} multiple value={chosen} onChange={setChosen} search={search} suggestions={choices.slice(0, 12)} labels={t.peoplePicker} lang={locale} />
              <p className="hint" role="status">{format(w.seenBy, { who })}</p>
            </section>
          )}
          {error && <p id="board-error" className="error" role="alert">{error}</p>}
        </form>
      </Dialog>
    </>
  );
}
