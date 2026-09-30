import { localeOf, member, type Member } from "@argentic/chest-sdk/member";
import { cookies, headers } from "next/headers";
import { withGroups } from "./groups.ts";
import { catalogue, publicLocale, type Catalogue, type Locale } from "./i18n/index.ts";

// Who is making this request, as the Chest asserts it (the Chest-Member
// header on the team host): null on the public host, or for anything that
// did not come through the Chest's front. The only source of identity.
// Its groups are all the member's groups the Chest tells (lib/groups.ts),
// not only those that give Tasks: a private board may be shared with any.
export async function currentMember(): Promise<Member | null> {
  const who = member(new Request("http://tool/", { headers: await headers() }));
  return who ? withGroups(who) : null;
}

// The viewer of a members' page: the member, their language — the Chest
// gives it (member.language), the tool has no switch of its own — and its
// words.
export type Viewer = { member: Member; locale: Locale; t: Catalogue };

export async function viewer(): Promise<Viewer | null> {
  const who = await currentMember();
  if (!who) return null;
  const locale: Locale = localeOf(who.language);
  return { member: who, locale, t: catalogue(locale) };
}

// The language of a public page: the visitor's switch (cookie "lang"), the
// browser's languages, English.
export async function publicWords(): Promise<{ locale: Locale; t: Catalogue }> {
  const locale = publicLocale((await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
  return { locale, t: catalogue(locale) };
}

// The language of whatever page is being rendered: the member's on /chest,
// the visitor's elsewhere.
export async function pageLocale(): Promise<Locale> {
  return (await viewer())?.locale ?? (await publicWords()).locale;
}
