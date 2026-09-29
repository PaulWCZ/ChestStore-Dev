import { db } from "../../../../../lib/db.ts";
import { asker, attachment, failure } from "../../../../../lib/http.ts";
import { runFile } from "../../../../../lib/payments.ts";

// A batch's transfer file (pain.001.001.03 XML), for the accountants: the
// same file each time it is downloaded, to upload to the company's bank.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return new Response(null, { status: 401 });
  try {
    const { id } = await params;
    const file = await runFile(db(), who.actor, id);
    return new Response(file.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": attachment(file.fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
