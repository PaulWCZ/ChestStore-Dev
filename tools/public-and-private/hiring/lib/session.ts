import { localeOf, member, type Member } from "@argentic/chest-sdk/member";
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
  // The Chest's reading first (Proposal (studio): visitors.language — the
  // switch's cookie, Accept-Language, then the Chest's own language).
  const h = await headers();
  // A candidate's own link says the language they applied in (proxy.ts);
  // the switch's choice wins over it.
  const cookie = (await cookies()).get("lang")?.value;
  const linked = h.get("x-link-lang");
  if (!isLocale(cookie) && isLocale(linked)) return { locale: linked, t: catalogue(linked) };
  let locale: Locale;
  try {
    const said = visitors.language(h);
    locale = isLocale(said) ? said : publicLocale((await cookies()).get("lang")?.value, h.get("accept-language"));
  } catch {
    locale = publicLocale((await cookies()).get("lang")?.value, h.get("accept-language"));
  }
  return { locale, t: catalogue(locale) };
}

// The language of whatever page is being rendered: the member's on /chest,
// the visitor's elsewhere.
export async function pageLocale(): Promise<Locale> {
  return (await viewer())?.locale ?? (await publicWords()).locale;
}

// The nonce of this response's Content-Security-Policy (proxy.ts): a
// script the page writes itself (the job's structured data) carries it.
export function nonceOf(h: Headers): string | undefined {
  return /'nonce-([A-Za-z0-9+/=]+)'/u.exec(h.get("content-security-policy") ?? "")?.[1];
}
