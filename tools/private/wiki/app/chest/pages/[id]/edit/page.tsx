import { notFound } from "next/navigation";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { page, tree, type Page } from "../../../../../lib/pages.ts";
import { viewer } from "../../../../../lib/session.ts";
import { listSpaces } from "../../../../../lib/spaces.ts";
import { Editor } from "./editor.tsx";

// Editing a page. Rendering takes nothing: the editor asks for the page's
// lock once it is on screen (a link prefetched never locks a page).
export default async function EditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  // Just created ("Create and write"): the cursor waits in the page.
  const fresh = (await searchParams)["new"] === "1";
  const sql = db();
  let p: Page;
  try {
    p = await page(sql, member, id, "write");
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const spaces = await listSpaces(sql, member);
  const names = new Map(spaces.map(s => [s.id, s.name]));
  const pages = (await tree(sql, member, spaces.map(s => s.id))).map(n => ({ id: n.id, title: n.title, space: names.get(n.spaceId) ?? "" }));
  return (
    <main className="page editing-page">
      <Editor
        page={{ id: p.id, title: p.title, doc: p.doc, version: p.version }}
        pages={pages}
        fresh={fresh}
        locale={locale}
        t={{ editor: t.editor, errors: t.errors, common: t.common, missing: t.page.missing }}
      />
    </main>
  );
}
