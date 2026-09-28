import { member, type Member } from "@argentic/chest-sdk/member";
import * as visitors from "@argentic/chest-sdk/visitors";
import { cookies, headers } from "next/headers";
import { catalogue, isLocale, publicLocale, type Catalogue, type Locale } from "./i18n/index.ts";

// Who is making this request, as the Chest asserts it (the Chest-Member
// header on the team host): null on the public host, or for anything that
// did not come through the Chest's front. The only source of identity.
export async function currentMember(): Promise<Member | null> {
  return member(new Request("http://tool/", { headers: await headers() }));
}

// The viewer of a members' page: the member, their language — the Chest
// gives it (member.locale), the tool has no switch of its own — and its
// words.
export type Viewer = { member: Member; locale: Locale; t: Catalogue };

export async function viewer(): Promise<Viewer | null> {
  const who = await currentMember();
  if (!who) return null;
  const locale: Locale = isLocale(who.locale) ? who.locale : "en";
  return { member: who, locale, t: catalogue(locale) };
}

// The language of a public page: the visitor's switch (cookie "lang"), the
// browser's languages, English.
export async function publicWords(): Promise<{ locale: Locale; t: Catalogue }> {
  // Proposal (studio): visitors.language — the switch, then the browser,
  // then the Chest's own language (not always English).
  // A plain Headers: Next.js's own object is taken for a Request by the
  // SDK (it answers to "headers" in it).
  const given = visitors.language(new Headers(await headers()));
  const locale = isLocale(given) ? given : publicLocale((await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
  return { locale, t: catalogue(locale) };
}

// The language of whatever page is being rendered: the member's on /chest,
// the visitor's elsewhere.
export async function pageLocale(): Promise<Locale> {
  return (await viewer())?.locale ?? (await publicWords()).locale;
}
