"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { People, Trash } from "../../../../../components/icons.tsx";
import { useToast } from "../../../../../components/toast.tsx";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { format } from "../../../../../lib/i18n/format.ts";
import { deleteSpace, updateSpace } from "../../../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"] };

export function SpaceSettings({ space, groups, colors, t }: { space: { id: string; name: string; description: string; color: string; visibility: "everyone" | "groups"; groups: string[]; pages: number }; groups: { id: string; name: string }[]; colors: string[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [visibility, setVisibility] = useState(space.visibility);
  const [chosen, setChosen] = useState<string[]>(space.groups);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function save(data: FormData) {
    setError(null);
    start(async () => {
      const result = await updateSpace(space.id, {
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        color: String(data.get("color") ?? space.color),
        visibility,
        groups: visibility === "groups" ? chosen : [],
      });
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      toast(t.settings.saved);
      router.push(`/chest/spaces/${space.id}`);
    });
  }
  function remove() {
    start(async () => {
      const result = await deleteSpace(space.id);
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      toast(t.settings.deleted);
      router.push("/chest");
    });
  }
  return (
    <>
      <form action={save} className="stack settings">
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
