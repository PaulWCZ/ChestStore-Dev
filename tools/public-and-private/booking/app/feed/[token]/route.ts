import { feed } from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { calendar } from "../../../lib/ics.ts";
import { catalogue } from "../../../lib/i18n/index.ts";

// A host's private calendar feed (/feed/<token>.ics), on the public host so
// a calendar app can subscribe: the token is the only key. Their meetings
// of the last 30 days and ahead; cancelled ones say so, and calendars
// remove them.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const found = token.endsWith(".ics") ? await feed(db(), token.slice(0, -4)) : null;
  if (!found) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const text = calendar(
    found.bookings.map(x => ({
        uid: `booking-${x.id}@chest`,
        sequence: x.moves + (x.status === "cancelled" ? 1 : 0),
        start: x.startsAt,
        end: x.endsAt,
        summary: `${x.title} — ${x.guestName}`,
        description: [x.guestEmail, x.guestPhone, x.guestNote].filter(Boolean).join("\n"),
        ...(x.location ? { location: x.location } : {}),
        cancelled: x.status === "cancelled",
        stamp: x.cancelledAt ?? x.createdAt,
      })),
    { name: catalogue("en").meta.name },
  );
  return new Response(text, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
