import { localeOf, member, type Member } from "@argentic/chest-sdk/member";
import { cache } from "react";
import * as visitors from "@argentic/chest-sdk/visitors";
import { headers } from "next/headers";
import { catalogue, type Catalogue, type Locale } from "./i18n/index.ts";
import { withAllGroups } from "./groups.ts";
import { chestZone } from "./zone.ts";

// Who is making this request, as the Chest asserts it (the Chest-Member
// header on the team host): null on the public host, or for anything that
// did not come through the Chest's front. The only source of identity.
// Its groups are all the member's (lib/groups.ts: the assertion names only
// those that give Polls), asked of the Chest once per request.
export const currentMember = cache(async (): Promise<Member | null> => {
  const who = member(new Request("http://tool/", { headers: await headers() }));
  return who && withAllGroups(who);
});

// The viewer of a members' page: the member, their language — the Chest
// gives it (member.language), the tool has no switch of its own —, its words
// and the Chest's time zone.
export type Viewer = { member: Member; locale: Locale; t: Catalogue; zone: string };

export async function viewer(): Promise<Viewer | null> {
  const who = await currentMember();
  if (!who) return null;
  const locale: Locale = localeOf(who.language);
  return { member: who, locale, t: catalogue(locale), zone: chestZone() };
}

// The language of a public page (Proposal (studio): visitors.language):
// the visitor's switch (cookie "lang"), the browser's languages, then the
// Chest's own language.
export async function publicWords(): Promise<{ locale: Locale; t: Catalogue }> {
  const locale = localeOf(visitors.language(await headers()));
  return { locale, t: catalogue(locale) };
}

// The language of whatever page is being rendered: the member's on /chest,
// the visitor's elsewhere.
export async function pageLocale(): Promise<Locale> {
  return (await viewer())?.locale ?? (await publicWords()).locale;
}
