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
  const nonce = randomBytes(16).toString("base64");
  const value = policy(nonce);
  const forwarded = new Headers(request.headers);
  forwarded.set("Content-Security-Policy", value);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", value);
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (first === "chest") response.headers.set("Cache-Control", "no-store");
  else if (first === "s" || first === "subscribe" || first === "unsubscribed" || first === "lang") {
    // A subscriber's page holds their address and their link: never kept
    // by a cache, never passed on to another site.
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
  } else if (request.method === "GET" && (first === "" || first === "history" || first === "incidents")) {
    // The status page is read again and again when something breaks: a
    // browser may keep it 30 seconds. Not a shared cache: the page speaks
    // the visitor's language (cookie, Accept-Language) and Next.js replaces
    // the Vary header that would keep one copy per language.
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=30");
  }
  return response;
}

// Not the Chest's own routes (/chest-events is signed, never a page), nor
// the static files, nor what sets its own headers: the public API (JSON
// for any site, lib/api.ts), the badge (a picture) and the widget (its own
// policy, framed by the sites the editors listed), heartbeats.
export const config = {
  matcher: ["/((?!_next/static/|chest-events$|chest-jobs/|chest-checks$|chest-webhooks$|favicon\\.ico$|api/v2/|badge\\.svg$|embed$|heartbeat/).*)"],
};
