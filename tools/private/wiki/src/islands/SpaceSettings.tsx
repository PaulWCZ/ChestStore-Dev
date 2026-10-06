import { call, fill as format, navigate, toast } from "@argentic/chest-app/client";
import { matches } from "@argentic/chest-ui/components/logic";
import { useState, useTransition } from "react";
import { Pen, People, Trash } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

type Words = { settings: Catalogue["settings"] };

type Named = { id: string; name: string };

// A space's settings: name, description, colour; who reads it (everyone,
// or some groups); who edits it (every editor, or some groups and people).
export function SpaceSettings({ space, groups, people, me, colors, t }: { space: { id: string; name: string; description: string; color: string; visibility: "everyone" | "groups"; groups: string[]; editing: "editors" | "some"; editors: string[]; pages: number }; groups: Named[]; people: Named[]; me: string; colors: string[]; t: Words }) {
  const [visibility, setVisibility] = useState(space.visibility);
  const [chosen, setChosen] = useState<string[]>(space.groups);
  const [editing, setEditing] = useState(space.editing);
  // Choosing "only some people" starts with oneself.
  const [editors, setEditors] = useState<string[]>(space.editing === "some" ? space.editors : [me]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function save(data: FormData) {
    setError(null);
    start(async () => {
      const result = await call("updateSpace", {
        spaceId: space.id,
        input: {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          color: String(data.get("color") ?? space.color),
          visibility,
          groups: visibility === "groups" ? chosen : [],
          editing,
          editors: editing === "some" ? editors : [],
        },
      }, { refresh: false, quiet: true });
      if (!result.ok) return setError(result.message);
      toast({ id: `space-${space.id}`, text: t.settings.saved });
      await navigate(`/chest/spaces/${space.id}`);
    });
  }
  function remove() {
    start(async () => {
      const result = await call("deleteSpace", { spaceId: space.id }, { refresh: false, quiet: true });
      if (!result.ok) return setError(result.message);
      toast({ id: `space-${space.id}`, text: t.settings.deleted });
      await navigate("/chest");
    });
  }
  return (
    <>
      <form className="stack settings" onSubmit={e => { e.preventDefault(); save(new FormData(e.currentTarget)); }}>
        <div>
          <label className="label" htmlFor="space-name">{t.settings.name}</label>
          <input id="space-name" name="name" className="field" defaultValue={space.name} required maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="space-description">{t.settings.description}</label>
          <input id="space-description" name="description" className="field" defaultValue={space.description} maxLength={300} />
        </div>
        <fieldset className="plain">
          <legend className="label">{t.settings.color}</legend>
          <div className="swatches">
            {colors.map(c => (
              <label key={c} className={`swatch color-${c}`}>
                <input type="radio" name="color" value={c} defaultChecked={c === space.color} />
                <span className="chip-dot" aria-hidden="true" />
                <span>{t.settings.colors[c as keyof Words["settings"]["colors"]]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="plain">
          <legend className="label">{t.settings.who}</legend>
          <div className="choices">
            <label className="choice"><input type="radio" name="visibility" checked={visibility === "everyone"} onChange={() => setVisibility("everyone")} />{t.settings.everyone}</label>
            <label className="choice"><input type="radio" name="visibility" checked={visibility === "groups"} onChange={() => setVisibility("groups")} /><People />{t.settings.groups}</label>
          </div>
          {visibility === "groups" && (
            <div className="group-list">
              <p className="muted">{t.settings.groupsHint}</p>
              {groups.length === 0 ? <p className="muted">{t.settings.noGroups}</p> : groups.map(g => (
                <label key={g.id} className="check">
                  <input type="checkbox" checked={chosen.includes(g.id)} onChange={e => setChosen(list => (e.target.checked ? [...list, g.id] : list.filter(x => x !== g.id)))} />
                  {g.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="plain">
          <legend className="label">{t.settings.whoEdits}</legend>
          <div className="choices">
            <label className="choice"><input type="radio" name="editing" checked={editing === "editors"} onChange={() => setEditing("editors")} />{t.settings.allEditors}</label>
            <label className="choice"><input type="radio" name="editing" checked={editing === "some"} onChange={() => setEditing("some")} /><Pen />{t.settings.someEditors}</label>
          </div>
          {editing === "some" && (
            <div className="group-list">
              <p className="muted">{t.settings.someEditorsHint}</p>
              {groups.length > 0 && <p className="label small-label">{t.settings.editorGroups}</p>}
              {groups.map(g => (
                <label key={g.id} className="check">
                  <input type="checkbox" checked={editors.includes(g.id)} onChange={e => setEditors(list => (e.target.checked ? [...list, g.id] : list.filter(x => x !== g.id)))} />
                  <People />{g.name}
                </label>
              ))}
              <p className="label small-label">{t.settings.editorPeople}</p>
              {people.length > 8 && (
                <>
                  <label className="visually-hidden" htmlFor="editor-filter">{t.settings.findPerson}</label>
                  <input id="editor-filter" className="field" type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder={t.settings.findPerson} autoComplete="off" />
                </>
              )}
              {people.length === 0 ? <p className="muted">{t.settings.noEditors}</p> : people.filter(p => editors.includes(p.id) || matches(p.name, filter)).map(p => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={editors.includes(p.id)} onChange={e => setEditors(list => (e.target.checked ? [...list, p.id] : list.filter(x => x !== p.id)))} />
                  {p.id === me ? format(t.settings.meToo, { name: p.name }) : p.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div><button type="submit" className="button" disabled={pending}>{t.settings.save}</button></div>
      </form>
      <section className="danger-zone" aria-labelledby="danger-title">
        <h2 id="danger-title">{t.settings.danger}</h2>
        <p className="muted">{t.settings.deleteHint}</p>
        <button type="button" className="button quiet danger" disabled={pending || space.pages > 0} onClick={remove}><Trash />{t.settings.delete}</button>
      </section>
    </>
  );
}

