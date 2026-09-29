import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../../../components/icons.tsx";
import * as b from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { myPage } from "../../../lib/my-page.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { zoneGroups } from "../../../lib/zones.ts";
import { ForGuest } from "./for-guest.tsx";

// A host books for a guest: a customer on the phone, at the counter.
export default async function NewBookingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <EmptyState headingLevel={1} title={t.bookings.cannotHostTitle} body={t.bookings.cannotHost} />;
  const types = (await b.typesOf(db(), v.member.id, { activeOnly: true })).map(x => ({ id: x.id, label: `${x.title} · ${plural(t.minutes, x.duration, locale)}`, phone: x.locationKind === "phone" }));
  const q = await searchParams;
  const chosen = types.find(x => x.id === q["type"]) ?? types[0];
  return (
    <>
      <a className="back" href="/chest"><Back />{t.booking.back}</a>
      <PageHeader title={t.forGuest.title} intro={t.forGuest.intro} />
      {chosen ? (
        <ForGuest types={types} typeId={chosen.id} hostZone={host.zone} locale={locale} zones={zoneGroups(t.zones, Date.now(), [host.zone])} t={{ forGuest: t.forGuest, public: t.public, days: t.days, errors: t.errors, answers: t.answers }} />
      ) : (
        <EmptyState title={t.forGuest.noTypes} action={<a className="button" href="/chest/types/new">{t.types.new}</a>} />
      )}
    </>
  );
}
