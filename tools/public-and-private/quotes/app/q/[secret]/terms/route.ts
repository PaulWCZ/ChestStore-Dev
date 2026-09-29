import * as chest from "@argentic/chest-sdk/chest";
import { db } from "../../../../lib/db.ts";
import { openLink } from "../../../../lib/online.ts";
import { termsFile, termsFileName } from "../../../../lib/terms.ts";

// The company's terms and conditions of sale, for the client who holds a
// quote's link (nothing for a link turned off).
export async function GET(_: Request, { params }: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await params;
  const sql = db();
  const opened = await openLink(sql, secret, chest.today());
  const none = { status: 404, headers: { "Cache-Control": "no-store" } };
  if (!opened || opened.showing === "off") return new Response(null, none);
  const terms = await termsFile(sql);
  if (!terms) return new Response(null, none);
  return new Response(Buffer.from(terms.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${termsFileName(opened.full.language)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
