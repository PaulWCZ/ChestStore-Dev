import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { AppError } from "../../../../lib/app-error.ts";
import { typeOf, type BookingType } from "../../../../lib/booking.ts";
import { db } from "../../../../lib/db.ts";
import { myPage } from "../../../../lib/my-page.ts";
import { publicOrigin } from "../../../../lib/public-origin.ts";
import { viewer } from "../../../../lib/session.ts";
import { TypeForm } from "../type-form.tsx";

export default async function EditTypePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <div className="empty"><p>{t.bookings.cannotHost}</p></div>;
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
      <div className="page-head"><h1>{t.types.form.titleEdit}</h1></div>
      <TypeForm id={id} base={base} locale={locale} initial={initial} t={{ types: t.types, kinds: t.kinds, colors: t.colors, minutes: t.minutes, errors: t.errors }} />
    </>
  );
}
