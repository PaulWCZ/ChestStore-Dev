import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { AppError } from "../../../../lib/app-error.ts";
import { otherHosts, typeOf, type BookingType } from "../../../../lib/booking.ts";
import { db } from "../../../../lib/db.ts";
import { myPage } from "../../../../lib/my-page.ts";
import { publicOrigin } from "../../../../lib/public-origin.ts";
import { viewer } from "../../../../lib/session.ts";
import { can } from "../../../../lib/access.ts";
import { people } from "../../../../lib/people.ts";
import { TypeForm } from "../type-form.tsx";

// The hosts an administrator may put in a type's team, with their names
// (null: the viewer cannot choose).
async function teamChoices(v: NonNullable<Awaited<ReturnType<typeof viewer>>>): Promise<{ id: string; name: string }[] | null> {
  if (!can(v.member, "settings")) return null;
  const ids = await otherHosts(db(), v.member);
  const names = await people(ids);
  return ids.flatMap(id => { const p = names.get(id); return p?.status === "member" ? [{ id, name: p.name }] : []; });
}

export default async function EditTypePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <EmptyState headingLevel={1} title={t.bookings.cannotHostTitle} body={t.bookings.cannotHost} />;
  let ty: BookingType;
  try {
    ty = await typeOf(db(), v.member, (await params).id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const base = `${publicOrigin(await headers()) ?? ""}/${host.slug}`;
  const { id, memberId: _, ...initial } = ty;
  return (
    <>
      <a className="back" href="/chest/types"><Back />{t.types.title}</a>
      <PageHeader title={t.types.form.titleEdit} />
      <TypeForm team={await teamChoices(v)} id={id} base={base} locale={locale} initial={initial} t={{ types: t.types, kinds: t.kinds, colors: t.colors, minutes: t.minutes, errors: t.errors }} />
    </>
  );
}
