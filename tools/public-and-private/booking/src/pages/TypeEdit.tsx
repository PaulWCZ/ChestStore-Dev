import { PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { Island } from "../core/island.tsx";
import { AppError, notFound, type MemberContext } from "../core/tool.ts";
import { languageNames } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { otherHosts, typeOf, type BookingType } from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { myPage } from "../lib/my-page.ts";
import { people } from "../lib/people.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { cannotHost } from "./bits.tsx";

// The hosts an administrator may put in a type's team, with their names
// (null: the viewer cannot choose).
async function teamChoices(v: MemberContext): Promise<{ id: string; name: string }[] | null> {
  if (!can(v.member, "settings")) return null;
  const ids = await otherHosts(db(), v.member);
  const names = await people(ids);
  return ids.flatMap(id => { const p = names.get(id); return p?.status === "member" ? [{ id, name: p.name }] : []; });
}

const blank = { title: "", slug: "", description: "", duration: 30, interval: 30, locationKind: "video", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 240, windowDays: 45, dailyLimit: 0, questions: [], color: "sky", active: true, videoRooms: false, paymentLink: "", pool: [], alt: {} } as const;

// A booking type, new (/chest/types/new) or to change (/chest/types/<id>):
// the TypeForm island.
export async function typeEditPage(v: PageContext<MemberContext>, id: string | null): Promise<View> {
  const { t, locale, request } = v;
  const host = await myPage(v);
  if (!host) return cannotHost(t);
  let ty: BookingType | null = null;
  if (id !== null) {
    try {
      ty = await typeOf(db(), v.member, id);
    } catch (error) {
      if (error instanceof AppError) return notFound();
      throw error;
    }
  }
  const base = `${publicOrigin(request.headers) ?? ""}/${host.slug}`;
  const title = ty ? t.types.form.titleEdit : t.types.form.titleNew;
  const second = host.second ? { code: host.second, name: (t.languages as Record<string, string>)[host.second] ?? languageNames[host.second] ?? host.second } : null;
  const initial = ty ? (({ id: _, memberId: __, ...rest }) => rest)(ty) : { ...blank, questions: [], pool: [], alt: {} };
  return {
    title,
    body: (
      <>
        <a className="back" href="/chest/types"><Back />{t.types.title}</a>
        <PageHeader size="m" title={title} />
        <Island name="TypeForm" props={{ second, team: await teamChoices(v), id: ty?.id ?? null, base, locale, initial, t: { types: t.types, kinds: t.kinds, colors: t.colors, minutes: t.minutes } }} />
      </>
    ),
  };
}
