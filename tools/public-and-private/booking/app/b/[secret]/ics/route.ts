import { bySecret } from "../../../../lib/booking.ts";
import { db } from "../../../../lib/db.ts";
import { catalogue, isLocale } from "../../../../lib/i18n/index.ts";
import { invitation } from "../../../../lib/mailer.ts";
import { people } from "../../../../lib/people.ts";
import { publicOrigin } from "../../../../lib/public-origin.ts";

// The guest's calendar file (the same as the email's attachment).
export async function GET(request: Request, { params }: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await params;
  const found = await bySecret(db(), secret);
  if (!found) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const b = found.booking;
  const person = (await people([b.memberId])).get(b.memberId);
  const t = catalogue(isLocale(b.guestLanguage) ? b.guestLanguage : "en");
  const link = `${publicOrigin(request.headers) ?? ""}/b/${secret}`;
  const text = invitation(b, { hostName: person?.status === "member" ? person.name : t.mail.team, link }, b.status === "cancelled");
  return new Response(text, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${t.mail.fileName}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
