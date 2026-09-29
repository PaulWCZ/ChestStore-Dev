import * as chest from "@argentic/chest-sdk/chest";
import { member } from "@argentic/chest-sdk/member";
import { allAnswers, anonymousTexts } from "../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { exportRows, textRows } from "../../../../../../lib/export.ts";
import { toCsv } from "../../../../../../lib/csv.ts";
import { catalogue, isLocale } from "../../../../../../lib/i18n/index.ts";
import { people } from "../../../../../../lib/people.ts";

// The answers as CSV, for a spreadsheet: in the member's language (headers,
// Yes/No, the separator French spreadsheets expect), formula-safe. An
// anonymous form's CSV is its summary and its written answers each on
// their own line, shuffled — never one person's row.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = member(request);
  if (!who) return new Response(null, { status: 401 });
  const locale = isLocale(who.locale) ? who.locale : "en";
  try {
    const sql = db();
    const id = (await params).id;
    const { form, answers, versions } = await allAnswers(sql, who, id, 100000);
    const names = await people(answers.flatMap(a => (a.respondent ? [a.respondent] : [])));
    const t = catalogue(locale);
    const rows = exportRows({ form, answers, versions, t, locale, zone: chest.timeZone(), names });
    if (form.anonymous) rows.push(...textRows((await anonymousTexts(sql, who, id)).texts));
    return new Response(toCsv(rows, t.csv.separator === ";" ? ";" : ","), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(form.draft.title)}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}

function fileName(title: string): string {
  return (title || "form").normalize("NFKD").replace(/[^\w -]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "form";
}
