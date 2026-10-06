import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { Island } from "../core/island.tsx";
import type { MemberContext } from "../core/tool.ts";
import { plural } from "../i18n/index.ts";
import * as b from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { mailState } from "../lib/mailer.ts";
import { myPage } from "../lib/my-page.ts";
import { zoneGroups } from "../lib/zones.ts";
import { cannotHost } from "./bits.tsx";

// A host books for a guest (/chest/new): a customer on the phone, at the
// counter.
export async function newBookingPage(v: PageContext<MemberContext>): Promise<View> {
  const { t, locale, query } = v;
  const host = await myPage(v);
  if (!host) return cannotHost(t);
  const types = (await b.typesOf(db(), v.member.id, { activeOnly: true })).map(x => ({ id: x.id, label: `${x.title} · ${plural(t.minutes, x.duration, locale)}`, phone: x.locationKind === "phone" }));
  const chosen = types.find(x => x.id === query("type")) ?? types[0];
  // Asked of the Chest before promising the guest an email (studio.16).
  const mailing = (await mailState()) === "ready";
  return {
    title: t.forGuest.title,
    body: (
      <>
        <a className="back" href="/chest"><Back />{t.booking.back}</a>
        <PageHeader size="m" title={t.forGuest.title} intro={mailing ? t.forGuest.intro : t.forGuest.introNoMail} />
        {chosen ? (
          <Island name="ForGuest" props={{ mailing, types, typeId: chosen.id, hostZone: host.zone, locale, zones: zoneGroups(t.zones, Date.now(), [host.zone]), t: { forGuest: t.forGuest, public: t.public, days: t.days, errors: t.errors, answers: t.answers } }} />
        ) : (
          <EmptyState title={t.forGuest.noTypes} action={<a className="button" href="/chest/types/new">{t.types.new}</a>} />
        )}
      </>
    ),
  };
}
