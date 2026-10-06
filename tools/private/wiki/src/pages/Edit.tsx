import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Lock } from "../components/icons.tsx";
import { format } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { AppError } from "../lib/errors.ts";
import { page, tree, type Page } from "../lib/pages.ts";
import { listSpaces } from "../lib/spaces.ts";

// Editing a page. Rendering takes nothing: the editor asks for the page's
// lock once it is on screen (a link prefetched never locks a page).
export async function editPage({ member, locale, t, param, query }: PageContext<MemberContext>): Promise<View> {
  const id = param("id");
  // Just created ("Create and write"): the cursor waits in the page.
  const fresh = query("new") === "1";
  const sql = db();
  let p: Page;
  try {
    p = await page(sql, member, id, "write");
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    // A shared link to the editor, opened by someone who only reads the
    // page: say so, rather than "Nothing here".
    const readable = error.code === "forbidden" ? await page(sql, member, id).catch(() => null) : null;
    if (!readable) return notFound();
    return { title: readable.title, body: (
      <div className="page narrow">
        <p className="notice" role="status"><Lock />{format(t.page.cannotEdit, { space: readable.space.name })}</p>
        <p><a className="button quiet" href={`/chest/pages/${readable.id}`}>{t.page.backToPage}</a></p>
      </div>
    ) };
  }
  const spaces = await listSpaces(sql, member);
  const names = new Map(spaces.map(s => [s.id, s.name]));
  const pages = (await tree(sql, member, spaces.map(s => s.id))).map(n => ({ id: n.id, title: n.title, space: names.get(n.spaceId) ?? "" }));
  return { title: p.title, body: (
    <div className="page editing-page">
      <Island id={`editor-${p.id}`} name="Editor" props={{
        page: { id: p.id, title: p.title, doc: JSON.stringify(p.doc), version: p.version },
        pages,
        fresh,
        locale,
        t: { editor: t.editor, common: t.common, dialog: t.kit.dialog, missing: t.page.missing, tooLarge: t.errors.file_too_large, unknown: t.errors.unknown },
      }} />
    </div>
  ) };
}
