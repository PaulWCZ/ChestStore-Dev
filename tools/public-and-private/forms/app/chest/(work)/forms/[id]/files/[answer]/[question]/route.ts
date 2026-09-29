import { member } from "@argentic/chest-sdk/member";
import { oneAnswer } from "../../../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../../../lib/app-error.ts";
import { db } from "../../../../../../../../lib/db.ts";
import { filesIn, type StoredFile } from "../../../../../../../../lib/logic.ts";
import { link } from "../../../../../../../../lib/uploads.ts";

// A file of an answer: whoever may read the form's answers gets a fresh
// signed link to it from the Chest (15 minutes), never a lasting address.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; answer: string; question: string }> }): Promise<Response> {
  const who = member(request);
  if (!who) return new Response(null, { status: 401 });
  const { id, answer, question } = await params;
  try {
    const found = await oneAnswer(db(), who, id, answer);
    // One file of the answer (?n=, for a question that took several).
    const search = new URL(request.url).searchParams;
    const n = Number(search.get("n") ?? "0");
    const file = (filesIn(found.answer.data[question]).filter(f => "file" in f) as StoredFile[])[Number.isInteger(n) && n >= 0 ? n : 0];
    if (!file) throw new AppError("not_found");
    const url = await link(file.file, search.has("download"));
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "unavailable" ? 503 : 404 });
    throw error;
  }
}
