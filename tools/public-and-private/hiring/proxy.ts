import { randomBytes } from "node:crypto";
import { member } from "@argentic/chest-sdk/member";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { catalogue, publicLocale } from "./lib/i18n/index.ts";

// Every page carries its own Content-Security-Policy with a nonce per
// response: Next.js runs inline scripts, which the nonce allows and nothing
// else. Style attributes are allowed (style-src-attr), style elements only
// with the nonce. Nothing is loaded from another origin: the tool has no
// network, its fonts and icons are its own files.
function policy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // The candidate's page frames the CV, from the tool itself.
    "frame-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// The members' part (/chest and below) is reached only through the Chest,
// which admits members with access and asserts who they are: a request
// without a valid assertion is refused here, before any page renders.
export function proxy(request: NextRequest): NextResponse {
  const first = request.nextUrl.pathname.split("/")[1]?.toLowerCase() ?? "";
  if (first === "chest" && member(request) === null) {
    const t = catalogue(publicLocale(request.cookies.get("lang")?.value, request.headers.get("accept-language")));
    return new NextResponse(t.http.signIn, { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  }
  // A CV, a file of an email: the route sends its own policy (a sandbox,
  // framed by the tool's pages only), never a page's.
  if (/^\/chest\/(candidates\/\d+\/cv|messages\/\d+\/files\/[a-z0-9]+)$/u.test(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  const nonce = randomBytes(16).toString("base64");
  const value = policy(nonce);
  const forwarded = new Headers(request.headers);
  forwarded.set("Content-Security-Policy", value);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", value);
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (first === "chest") {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

// Not the Chest's own routes (/chest-events is signed, never a page), nor
// the static files.
export const config = {
  matcher: ["/((?!_next/static/|chest-events$|favicon\\.ico$).*)"],
};
