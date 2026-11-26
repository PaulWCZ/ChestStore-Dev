import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { AppError } from "./errors.ts";
import { fileName, id, limits } from "./model.ts";
import { page } from "./pages.ts";

// The images and files of pages, kept by the Chest (files capability). A
// page's files live in its folder `pages/<id>/`, named by the Chest; the
// tool records one only once the Chest confirms it holds it. The Chest
// names an upload by its type (SDK 0.4.1: ".png", ".pdf"…; no extension
// for a type it does not know). A file is
// opened by whoever reads its page, through /chest/files/<id>.

export type PageFile = { id: string; pageId: string; object: string; fileName: string; type: string; size: number; image: boolean };

export const folderOf = (pageId: string): string => `pages/${pageId}/`;
export const objectPattern = /^pages\/([0-9]+)\/[0-9a-f]{20}(\.[a-z0-9]{1,8})?$/u;

// Images the pages show inline; any other type is a file to download.
export const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function attach(sql: Query, actor: Member | null, pageId: unknown, input: { object: string; fileName: unknown; type: string; size: number }): Promise<PageFile> {
  const p = await page(sql, actor, pageId, "write");
  const m = objectPattern.exec(input.object);
  if (!m || m[1] !== p.id) throw new AppError("invalid");
  if (input.size > limits.fileSize) throw new AppError("file_too_large");
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from page_files where page_id = ${p.id}`;
  if ((count?.n ?? 0) >= limits.filesPerPage) throw new AppError("too_many", { max: limits.filesPerPage });
  const name = fileName(input.fileName);
  const type = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/iu.test(input.type) ? input.type.toLowerCase() : "application/octet-stream";
  const [row] = await sql<{ id: string }[]>`
    insert into page_files (page_id, object, file_name, type, size, added_by) values (${p.id}, ${input.object}, ${name}, ${type}, ${input.size}, ${actor!.id})
    on conflict (object) do update set file_name = excluded.file_name returning id`;
  return { id: String(row!.id), pageId: p.id, object: input.object, fileName: name, type, size: input.size, image: imageTypes.includes(type) };
}

// fileOf finds a file for whoever reads its page (a page in the trash keeps
// its files for its editors, who may restore it).
export async function fileOf(sql: Query, actor: Member | null, fileId: unknown): Promise<PageFile> {
  const key = id(fileId);
  const [row] = await sql<{ id: string; page_id: string; object: string; file_name: string; type: string; size: string }[]>`
    select id, page_id, object, file_name, type, size from page_files where id = ${key}`;
  if (!row) throw new AppError("not_found");
  await page(sql, actor, String(row.page_id), "read", { deleted: true });
  return { id: String(row.id), pageId: String(row.page_id), object: row.object, fileName: row.file_name, type: row.type, size: Number(row.size), image: imageTypes.includes(row.type) };
}

export async function filesOf(sql: Query, pageId: string): Promise<PageFile[]> {
  const found = await sql<{ id: string; object: string; file_name: string; type: string; size: string }[]>`
    select id, object, file_name, type, size from page_files where page_id = ${pageId} order by id`;
  return found.map(r => ({ id: String(r.id), pageId, object: r.object, fileName: r.file_name, type: r.type, size: Number(r.size), image: imageTypes.includes(r.type) }));
}
