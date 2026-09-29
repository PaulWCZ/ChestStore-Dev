import { toCsv } from "../../../../lib/csv.ts";
import { viewer } from "../../../../lib/session.ts";

// An example file to fill, in the reader's language: the columns Goals
// reads first, two objectives, their key results.
export async function GET(): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const { t } = v;
  const h = t.export.headers, e = t.example;
  const rows = [
    [h.level, h.team, h.objective, h.alignedTo, h.objectiveOwner, h.keyResult, h.keyResultOwner, h.type, h.start, h.target, h.current, h.unit],
    [t.levels.company, "", e.title, "", v.member.name, e.kr1, v.member.name, t.kinds.number, "0", "20", "0", e.kr1Unit],
    [t.levels.company, "", e.title, "", v.member.name, e.kr2, v.member.name, t.kinds.number, "0", "60", "0", e.kr2Unit],
    [t.levels.company, "", e.title, "", v.member.name, e.kr3, v.member.name, t.kinds.milestone, "", "", t.export.notDone, ""],
  ];
  return new Response(toCsv(rows, t.export.separator), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="goals-example.csv"', "Cache-Control": "no-store" },
  });
}
