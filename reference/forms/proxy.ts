import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { localeOf, messagesFor } from "./lib/i18n.ts";
import { member } from "./packages/chest-client/src/member.ts";

// Every page this server renders carries its own Content-Security-Policy:
// scripts only from this origin or with the nonce of this response — the
// inline scripts of Next.js get it —, never framed. chest.json says so
// ("csp": "tool"): on the public host, the Chest adds beside it only a
// policy that blocks no script; without this one, it would add its default,
// which forbids every inline script. Next.js reads the nonce from the
// request's policy while it renders.
function policy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// The members' part (/chest) is reached only through the Chest, which
// admits members with access and asserts who they are: a request without
// a valid assertion is refused here too, before any page renders.
function membersPart(pathname: string): boolean {
  const first = pathname.split("/")[1] ?? "";
  return first.toLowerCase() === "chest";
}

export function proxy(request: NextRequest): NextResponse {
  if (membersPart(request.nextUrl.pathname) && member(request) === null) {
    return new NextResponse(messagesFor(localeOf(request.headers.get("accept-language"))).http.signIn, { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  }
  const nonce = randomBytes(16).toString("base64");
  const value = policy(nonce);
  const forwarded = new Headers(request.headers);
  forwarded.set("Content-Security-Policy", value);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", value);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static/|favicon\\.ico$).*)"],
};
