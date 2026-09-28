import { contact } from "../../../../../lib/contacts.ts";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { fileName } from "../../../../../lib/export.ts";
import { viewer } from "../../../../../lib/session.ts";
import { toVcard } from "../../../../../lib/vcard.ts";

// One contact as a vCard, to add to a phone's address book.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const { id } = await params;
  try {
    const c = await contact(db(), v.member, id);
    const card = toVcard({ name: c.name, email: c.email, phone: c.phone, title: c.title, company: c.company?.name ?? "", notes: "", tags: c.tags, revised: c.updatedAt });
    return new Response(card, { headers: { "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(c.name, "vcf")}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
