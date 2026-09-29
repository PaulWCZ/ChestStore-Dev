import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { asker, attachment } from "../../../lib/http.ts";
import { termsFile, termsFileName } from "../../../lib/terms.ts";

// The company's terms and conditions of sale, as quotes carry them, for
// whoever reads the tool.
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who || !can(who.actor, "read")) return new Response(null, { status: 401 });
  const terms = await termsFile(db());
  if (!terms) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(Buffer.from(terms.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": attachment(termsFileName(who.locale)), "Cache-Control": "no-store" },
  });
}
