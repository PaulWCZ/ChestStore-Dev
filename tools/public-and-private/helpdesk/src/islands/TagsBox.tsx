import { call, fill, toast } from "@argentic/chest-app/client";
import { Box } from "../components/box.tsx";
import { Tag } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { limits } from "../shared/model.ts";

// Settings: the team's tags — renamed for everyone (a name another tag
// has merges the two), deleted with Undo.
export function TagsBox({ tags, canTags, t }: { tags: { id: string; name: string; count: string }[]; canTags: boolean; t: Catalogue["settings"] }) {
  async function rename(id: string, name: string) {
    const r = await call("renameTag", { id, name });
    if (r.ok) toast(t.saved);
  }
  async function remove(id: string) {
    const r = await call("deleteTag", { id });
    if (!r.ok) return;
    const gone = r.value;
    toast({ id: `tag-${id}`, text: fill(t.tagDeleted, { tag: gone.shown }), undo: async () => { const back = await call("restoreTag", { name: gone.name, tickets: gone.tickets }, { quiet: true }); return back.ok || back.message; } });
  }
  return (
    <Box title={t.tags} icon={<Tag />}>
      <p className="hint">{tags.length === 0 ? t.noTags : t.tagsHint}</p>
      {tags.length > 0 && (
        <ul className="list-rows">
          {tags.map(g => (
            <li key={g.id + g.name}>
              <form className="row grow" onSubmit={e => { e.preventDefault(); void rename(g.id, String(new FormData(e.currentTarget).get("name") ?? "")); }}>
                <label className="visually-hidden" htmlFor={`tag-${g.id}`}>{t.tagName}</label>
                <input id={`tag-${g.id}`} name="name" className="field grow" defaultValue={g.name} maxLength={limits.tag} required disabled={!canTags} />
                <span className="small muted">{g.count}</span>
                {canTags && <>
                  <button type="submit" className="button small quiet">{t.save}</button>
                  <button type="button" className="link-button danger" onClick={() => void remove(g.id)}>{t.deleteTag}</button>
                </>}
              </form>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
