import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { textStream, zipStream, type Download, type ZipEntry } from "@argentic/chest-app";
import { AppError } from "./app-error.ts";
import { answerBatches, respondentsOf, summaryOf, writtenQuestions } from "./answers.ts";
import { cell } from "./csv.ts";
import type { Query, Sql } from "./db.ts";
import { exportPlan, summaryRows } from "./export.ts";
import { open, versions as versionsOf, type Form } from "./forms.ts";
import { format, type Catalogue, type Locale } from "../i18n/index.ts";
import { filesIn, type StoredFile } from "../shared/logic.ts";
import type { Definition } from "../shared/model.ts";
import { people } from "./people.ts";

// A form's answers leaving the tool: the CSV and the archive (ZIP with the
// files). Both are written as they are read — the answers a few hundred at
// a time (a cursor), the files one at a time —, so a form of 10,000
// answers leaves in the same few MiB of memory as one of ten
// (test/scale.test.ts). In the reader's language: headers, Yes/No, the
// separator their spreadsheet expects (French: ";"), formula-safe cells
// (src/lib/csv.ts).

const line = (cells: unknown[], separator: string) => cells.map(v => cell(v, separator)).join(separator) + "\r\n";
const separatorOf = (t: Catalogue) => (t.csv.separator === ";" ? ";" : ",");

export function fileName(title: string): string {
  return (title || "form").normalize("NFKD").replace(/[^\w -]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "form";
}

// The lines of a named form's CSV: a byte-order mark (Excel reads UTF-8),
// the header, one line per answer.
async function* answerLines(sql: Query, form: Form, all: Map<number, Definition>, t: Catalogue, locale: Locale, zone: string): AsyncGenerator<string> {
  const separator = separatorOf(t);
  const plan = exportPlan({ form, versions: all, t });
  const names = await people(await respondentsOf(sql, form.id));
  yield "﻿" + line(plan.header, separator);
  for await (const batch of answerBatches(sql, form.id)) yield batch.map(a => line(plan.row(a, { form, versions: all, t, locale, zone, names }), separator)).join("");
}

// An anonymous form's CSV: what its summary says — never one person's row
// — then every written answer on a line of its own, each question's in a
// random order of its own.
async function* summaryLines(sql: Sql, actor: Member, form: Form, t: Catalogue): AsyncGenerator<string> {
  const separator = separatorOf(t);
  const { stats, versions } = await summaryOf(sql, actor, form.id);
  yield "﻿" + summaryRows({ stats, versions, t }).map(r => line(r, separator)).join("");
  for (const { question } of writtenQuestions(versions)) {
    for await (const rows of sql<{ text: string }[]>`
      select e.value #>> '{}' as text from answers a cross join lateral jsonb_each(a.data) e
      where a.form_id = ${form.id} and a.deleted_at is null and e.key = ${question.id} and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '[^[:space:]]'
      order by gen_random_uuid()`.cursor(500)) yield rows.map(r => line([question.title, r.text, "", ""], separator)).join("");
  }
}

export async function answersCsv(sql: Sql, actor: Member, formId: unknown, t: Catalogue, locale: Locale, zone: string): Promise<Download> {
  const { form } = await open(sql, actor, formId, "viewer");
  const all = await versionsOf(sql, form.id);
  // An anonymous form's summary needs its floor of answers (summaryOf
  // says so before anything is sent).
  if (form.anonymous) await summaryOf(sql, actor, form.id);
  return { name: `${fileName(form.draft.title)}.csv`, type: "text/csv; charset=utf-8", body: textStream(form.anonymous ? summaryLines(sql, actor, form, t) : answerLines(sql, form, all, t, locale, zone)) };
}

// Everything of a form in one ZIP: the answers' CSV, the form itself (every
// published version and the draft, JSON), and every file the answers hold,
// in a folder per answer — so the CVs of a job form leave in one download.
// Not for an anonymous form (its files are none, its rows never leave).
export async function archive(sql: Sql, actor: Member, formId: unknown, t: Catalogue, locale: Locale, zone: string): Promise<Download> {
  const { form } = await open(sql, actor, formId, "viewer");
  if (form.anonymous) throw new AppError("anonymous_rows");
  const all = await versionsOf(sql, form.id);
  const encoder = new TextEncoder();
  const now = new Date();
  async function* bytes(lines: AsyncIterable<string>) {
    for await (const text of lines) yield encoder.encode(text);
  }
  async function* entries(): AsyncGenerator<ZipEntry> {
    let count = 0, missing = 0;
    yield { name: `${t.archive.answers}.csv`, modified: now, data: bytes(answerLines(sql, form, all, t, locale, zone)) };
    yield { name: "form.json", modified: now, data: JSON.stringify({ title: form.draft.title, slug: form.slug, audience: form.audience, versions: Object.fromEntries(all), draft: form.draft }, null, 2) };
    const used = new Set<string>();
    for await (const batch of answerBatches(sql, form.id)) {
      for (const a of batch) {
        count++;
        const def = all.get(a.version);
        const day = a.createdAt ? a.createdAt.slice(0, 10) : a.month.slice(0, 7);
        const folder = `${t.archive.files}/${day} ${(a.email ?? a.id).replace(/[/\\]/gu, "_")}`;
        for (const q of def?.pages.flatMap(p => p.questions) ?? []) {
          if (q.kind !== "file") continue;
          for (const [i, f] of (filesIn(a.data[q.id]).filter(x => "file" in x) as StoredFile[]).entries()) {
            let name = `${folder}/${(q.title || q.id).slice(0, 60).replace(/[/\\]/gu, "_")}${i > 0 ? ` (${i + 1})` : ""} - ${f.name.replace(/[/\\]/gu, "_")}`;
            while (used.has(name)) name = name.replace(/(\.[^./]*)?$/u, m => ` (${a.id})${m}`);
            used.add(name);
            let data: Uint8Array | null = null;
            try {
              data = (await files.get(f.file))?.data ?? null;
            } catch (error) {
              if (!(error instanceof ChestError)) throw error;
            }
            if (data) yield { name, modified: new Date(a.createdAt ?? now), data };
            else missing++;
          }
        }
      }
    }
    yield { name: `${t.archive.readme}.txt`, modified: now, data: [format(t.archive.about, { form: form.draft.title || t.builder.untitled, count }), missing ? format(t.archive.missing, { count: missing }) : ""].filter(Boolean).join("\n\n") + "\n" };
  }
  return { name: `${fileName(form.draft.title)}.zip`, type: "application/zip", body: zipStream(entries()) };
}
