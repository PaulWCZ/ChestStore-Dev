import type { Member } from "@argentic/chest-sdk/member";
import type { Sql } from "./db.ts";
import { mapDoc, normalize } from "./doc.ts";
import type { Catalogue } from "./i18n/index.ts";
import { fromMarkdown } from "./markdown.ts";
import { createPage, writeContent } from "./pages.ts";
import { createSpace } from "./spaces.ts";

// The example handbook an editor adds in one click on an empty wiki: a
// space and five short pages in their language (the catalogue's
// "starter"), linked to each other ("page:<key>" in the words), ready to be
// edited or deleted.
export async function addExample(sql: Sql, actor: Member | null, t: Catalogue): Promise<{ spaceId: string; pageId: string }> {
  const s = await createSpace(sql, actor, { name: t.starter.space, description: t.starter.description });
  const keys = Object.keys(t.starter.pages) as (keyof Catalogue["starter"]["pages"])[];
  const ids = new Map<string, string>();
  for (const key of keys) ids.set(key, (await createPage(sql, actor, { spaceId: s.id, title: t.starter.pages[key].title })).id);
  await sql.begin(async tx => {
    for (const key of keys) {
      const doc = mapDoc(fromMarkdown(t.starter.pages[key].body), n => {
        const marks = n.marks?.map(m => {
          const target = m.type === "link" ? /^page:([a-z]+)$/u.exec(String(m.attrs?.["href"] ?? ""))?.[1] : undefined;
          return target && ids.has(target) ? { type: "link", attrs: { href: `/chest/pages/${ids.get(target)}` } } : m;
        });
        return marks ? { ...n, marks } : n;
      });
      await writeContent(tx, ids.get(key)!, actor!.id, { title: t.starter.pages[key].title, doc: normalize(doc), kind: "edited" });
    }
  });
  return { spaceId: s.id, pageId: ids.get(keys[0]!)! };
}
