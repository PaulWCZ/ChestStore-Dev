import { isLocale } from "../../../lib/i18n/index.ts";

// Remembers the visitor's language for the public part (a year), then goes
// back to the page they were on — a path of this site only. The address
// it goes back to carries the language ("?hl=fr"): browsers keep the public
// pages 30 seconds, and must not show the copy in the other language.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const back = new URL(request.url).searchParams.get("back") ?? "/";
  const target = /^\/(?!\/)[^\s\\]*$/u.test(back) && !back.startsWith("/chest") ? back : "/";
  const fresh = isLocale(code) ? `${target}${target.includes("?") ? "&" : "?"}hl=${code}` : target;
  const headers = new Headers({ Location: fresh, "Cache-Control": "no-store" });
  if (isLocale(code)) headers.append("Set-Cookie", `lang=${code}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`);
  return new Response(null, { status: 303, headers });
}
