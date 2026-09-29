import { isLocale } from "../../../lib/i18n/index.ts";

// Remembers the visitor's language for the public part (a year), then goes
// back to the page they were on — a path of this site only — with
// ?lang=<code> in its address: a frame in another website may not keep
// the cookie, the address keeps the choice.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const back = new URL(request.url).searchParams.get("back") ?? "/";
  let target = /^\/(?!\/)[^\s\\]*$/u.test(back) && !back.startsWith("/chest") ? back : "/";
  if (isLocale(code)) {
    const [path = "/", query = ""] = target.split("?");
    const search = new URLSearchParams(query);
    search.set("lang", code);
    target = `${path}?${search.toString()}`;
  }
  const headers = new Headers({ Location: target, "Cache-Control": "no-store" });
  if (isLocale(code)) headers.append("Set-Cookie", `lang=${code}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`);
  return new Response(null, { status: 303, headers });
}
