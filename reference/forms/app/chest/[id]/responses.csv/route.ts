import { localeOf, messagesFor } from "../../../../lib/i18n.ts";
import { FormsError, csv } from "../../../../lib/model.ts";
import { member } from "@argentic/chest-sdk/member";
import { forms } from "../../../../lib/session.ts";

// Every answer of a form, as a CSV file, for a member who may read it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const t = messagesFor(localeOf(request.headers.get("accept-language")));
  try {
    const { form, responses } = await forms.responses(member(request), id);
    return new Response(csv(form.fields, responses, t.responses.received), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="responses-${form.slug}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FormsError && (error.code === "not_found" || error.code === "forbidden")) {
      return new Response(error.code === "forbidden" ? t.http.forbidden : t.http.notFound, { status: error.code === "forbidden" ? 403 : 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    throw error;
  }
}
