import * as chest from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { member } from "@argentic/chest-sdk/member";
import { allAnswers } from "../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { exportRows } from "../../../../../../lib/export.ts";
import { toCsv } from "../../../../../../lib/csv.ts";
import { catalogue, format, isLocale } from "../../../../../../lib/i18n/index.ts";
import { filesIn, type StoredFile } from "../../../../../../lib/logic.ts";
import { people } from "../../../../../../lib/people.ts";
import { zipStream, type Entry } from "../../../../../../lib/zip.ts";

// Everything of a form in one ZIP: the answers' CSV, the form itself
// (every published version and the draft, JSON), and every file the
// answers hold, in a folder per answer — so the CVs of a job form leave
// in one download. Written as a stream: one file in memory at a time.
// Not for an anonymous form (its files are none, its rows never leave).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = member(request);
  if (!who) return new Response(null, { status: 401 });
  const locale = isLocale(who.locale) ? who.locale : "en";
  try {
    const sql = db();
    const { form, answers, versions } = await allAnswers(sql, who, (await params).id, 100000);
    if (form.anonymous) throw new AppError("anonymous_rows");
    const t = catalogue(locale);
    const zone = chest.timeZone();
    const names = await people(answers.flatMap(a => (a.respondent ? [a.respondent] : [])));
    const now = new Date();
    const text = (s: string) => async () => new TextEncoder().encode(s);
    const entries: Entry[] = [
      { name: `${t.archive.answers}.csv`, date: now, deflate: true, data: text(toCsv(exportRows({ form, answers, versions, t, locale, zone, names }), t.csv.separator === ";" ? ";" : ",")) },
      { name: "form.json", date: now, deflate: true, data: text(JSON.stringify({ title: form.draft.title, slug: form.slug, audience: form.audience, versions: Object.fromEntries(versions), draft: form.draft }, null, 2)) },
    ];
    let missing = 0;
    for (const a of answers) {
      const def = versions.get(a.version);
      const day = a.createdAt ? a.createdAt.slice(0, 10) : a.month.slice(0, 7);
      const folder = `${t.archive.files}/${day} ${a.email ?? a.id}`;
      for (const q of def?.pages.flatMap(p => p.questions) ?? []) {
        if (q.kind !== "file") continue;
        for (const [i, f] of (filesIn(a.data[q.id]).filter(x => "file" in x) as StoredFile[]).entries()) {
          entries.push({
            name: `${folder}/${(q.title || q.id).slice(0, 60)}${i > 0 ? ` (${i + 1})` : ""} - ${f.name}`,
            date: new Date(a.createdAt ?? now),
            data: async () => {
              try {
                const body = await files.get(f.file);
                if (!body) missing++;
                return body ? body.data : null;
              } catch (error) {
                if (error instanceof ChestError) {
                  missing++;
                  return null;
                }
                throw error;
              }
            },
          });
        }
      }
    }
    entries.push({ name: `${t.archive.readme}.txt`, date: now, deflate: true, data: async () => new TextEncoder().encode([format(t.archive.about, { form: form.draft.title || t.builder.untitled, count: answers.length }), missing ? format(t.archive.missing, { count: missing }) : ""].filter(Boolean).join("\n\n") + "\n") });
    const name = (form.draft.title || "form").normalize("NFKD").replace(/[^\w -]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "form";
    return new Response(zipStream(entries), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}.zip"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
