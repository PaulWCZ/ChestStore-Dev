import { db } from "../../../../../../lib/db.ts";
import { asker, failure, refuse } from "../../../../../../lib/http.ts";
import { answerPdf } from "../../../../../../lib/online.ts";

// The exact PDF a client answered on (the proof kept with the answer), for
// whoever may read the quote.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; answer: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const { id, answer } = await params;
    const found = await answerPdf(db(), who.actor, answer);
    if (found.documentId !== id) return refuse("not_found", 404);
    return new Response(Buffer.from(found.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${("answer-" + (found.number ?? answer)).replace(/[^A-Za-z0-9._-]/gu, "_")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
