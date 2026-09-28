import { headers } from "next/headers";
import { Back } from "../../../../components/icons.tsx";
import { myPage } from "../../../../lib/my-page.ts";
import { publicOrigin } from "../../../../lib/public-origin.ts";
import { viewer } from "../../../../lib/session.ts";
import { TypeForm } from "../type-form.tsx";

export default async function NewTypePage() {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <div className="empty"><p>{t.bookings.cannotHost}</p></div>;
  const base = `${publicOrigin(await headers()) ?? ""}/${host.slug}`;
  return (
    <>
      <a className="back" href="/chest/types"><Back />{t.types.title}</a>
      <div className="page-head"><h1>{t.types.form.titleNew}</h1></div>
      <TypeForm id={null} base={base} locale={locale} t={{ types: t.types, kinds: t.kinds, colors: t.colors, minutes: t.minutes, errors: t.errors }}
        initial={{ title: "", slug: "", description: "", duration: 30, interval: 30, locationKind: "video", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 240, windowDays: 45, dailyLimit: 0, questions: [], color: "sky", active: true }} />
    </>
  );
}
