import { statSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import { member } from "@argentic/chest-sdk/member";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { actions } from "../actions.ts";
import { fill, formatter, isLocale, localeOf, publicLocale, words, type Catalogue } from "../i18n/index.ts";
import { MembersLayout, PublicLayout } from "../layout.tsx";
import { AppError, HttpStatus, readInput, type ErrorCode, type MemberContext, type VisitorContext } from "./tool.ts";
import { log } from "./log.ts";

// The starter's server: security headers and the log line of every
// answer, the browser's files under /assets/, the member of every /chest
// request, the actions, the pages, the errors. The tool's routes are in
// src/app.tsx.

// The policy of every answer: the tool's own files only. No inline script,
// no inline style (no style="" either): the Chest's default policy for a
// public part is the same, so the tool needs no "csp" permission.
export const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// Who reads a page, and in which words: a member (on /chest) or a visitor.
export type Viewer = MemberContext | VisitorContext;
type Env = { Variables: { viewer: MemberContext } };

// What a page handler gets, and gives back.
export type PageContext<V extends Viewer = MemberContext> = V & { url: URL; param(name: string): string; query(name: string): string | undefined };
export type View = { title: string; body: ReactNode };

const firstSegment = (path: string) => path.split("/")[1]?.toLowerCase() ?? "";
const isMembers = (c: Context) => firstSegment(c.req.path) === "chest";

function visitor(c: Context): VisitorContext {
  const locale = publicLocale(getCookie(c, "lang"), c.req.header("accept-language"), chest.language);
  return { member: null, locale, t: words(locale), f: formatter(locale, chest.timeZone, chest.currency), request: c.req.raw };
}
const viewerOf = (c: Context<Env>): Viewer => (isMembers(c) && c.get("viewer")) || visitor(c);

// The browser's files are linked with their build time (?v=…): a new
// build is fetched at once, an unchanged one comes from the cache.
function assetVersion(): string {
  try {
    return Math.round(statSync("dist/client/assets/client.js").mtimeMs + statSync("dist/client/assets/client.css").mtimeMs).toString(36);
  } catch {
    return "none";
  }
}

function html(c: Context, view: View, viewer: Viewer, status: 200 | 401 | 403 | 404 | 500 = 200) {
  const v = assetVersion();
  const error = c.req.query("error");
  const notice = error && Object.hasOwn(viewer.t.errors, error) ? viewer.t.errors[error as ErrorCode] : null;
  const page = renderToString(
    <html lang={viewer.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{view.title === viewer.t.tool.name ? view.title : `${view.title} · ${viewer.t.tool.name}`}</title>
        <link rel="stylesheet" href={`/assets/client.css?v=${v}`} />
        <script type="module" src={`/assets/client.js?v=${v}`} />
      </head>
      <body>
        {viewer.member !== null
          ? <MembersLayout viewer={viewer} path={c.req.path} notice={notice}>{view.body}</MembersLayout>
          : <PublicLayout viewer={viewer} path={c.req.path} notice={notice}>{view.body}</PublicLayout>}
      </body>
    </html>,
  );
  return c.html("<!doctype html>" + page, status);
}

function errorView(t: Catalogue, status: 403 | 404 | 500): View {
  const words = status === 403 ? t.pages.forbidden : status === 404 ? t.pages.notFound : t.pages.failed;
  return { title: words.title, body: <div className="ck-empty"><h1 className="ck-empty-title">{words.title}</h1><p className="ck-empty-body">{words.body}</p></div> };
}

function contextOf<V extends Viewer>(c: Context, viewer: V): PageContext<V> {
  return { ...viewer, url: new URL(c.req.url), param: name => c.req.param(name) ?? "", query: name => c.req.query(name) };
}

// page(): a page of the members' part (under /chest); publicPage(): one of
// the public part. The handler reads what the page needs, then returns
// its title and its body; the layout (src/layout.tsx) goes around it.
export const page = (render: (p: PageContext<MemberContext>) => Promise<View> | View) => async (c: Context<Env>) => html(c, await render(contextOf(c, c.get("viewer"))), c.get("viewer"));
export const publicPage = (render: (p: PageContext<VisitorContext>) => Promise<View> | View) => async (c: Context) => {
  const viewer = visitor(c);
  return html(c, await render(contextOf(c, viewer)), viewer);
};

// A mutation is sent by the page itself: the browser says so
// (Sec-Fetch-Site), or, for an older one, its Origin is this host.
function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  try {
    return origin !== null && new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

// The page the form was sent from (same host, same part), to go back to.
function back(c: Context, members: boolean, error?: ErrorCode): string {
  let to = members ? "/chest" : "/";
  try {
    const from = new URL(c.req.header("referer") ?? "");
    if (from.host === c.req.header("host") && (firstSegment(from.pathname) === "chest") === members) {
      from.searchParams.delete("error");
      to = from.pathname + from.search;
    }
  } catch { /* no referer: the part's first page */ }
  if (!error) return to;
  return to + (to.includes("?") ? "&" : "?") + "error=" + error;
}

const chestDown = (e: unknown) => e instanceof Unavailable || e instanceof RateLimited || e instanceof QuotaExceeded || e instanceof CapabilityNotGranted;

// POST /chest/actions/<name> (members) and /actions/<name> (visitors).
async function runAction(c: Context<Env>, members: boolean) {
  const name = c.req.param("name") ?? "";
  const definition = Object.hasOwn(actions, name) ? actions[name as keyof typeof actions] : undefined;
  const viewer = members ? c.get("viewer") : visitor(c);
  const fetched = c.req.header("x-tool-action") === "1"; // from call() or an enhanced form: answer JSON
  const refuse = (status: 400 | 403 | 404 | 500, code: ErrorCode, values?: Record<string, string | number>) =>
    fetched ? c.json({ ok: false, error: code, message: fill(viewer.t.errors[code], values) }, status) : c.redirect(back(c, members, code), 303);
  if (!sameOrigin(c.req.raw)) return c.text("Cross-site request refused.", 403);
  if (!definition || definition.access !== (members ? "member" : "public")) return refuse(404, "not_found");
  try {
    const json = c.req.header("content-type")?.startsWith("application/json") === true;
    if (json && !fetched) return c.text("Cross-site request refused.", 403);
    const raw = json ? await c.req.json<Record<string, unknown>>() : formFields(await c.req.formData());
    const value = await definition.run(readInput(definition.input, raw !== null && typeof raw === "object" ? raw : {}) as never, { ...viewer, request: c.req.raw } as never);
    return fetched ? c.json({ ok: true, value: value ?? null }) : c.redirect(back(c, members), 303);
  } catch (error) {
    if (error instanceof HttpStatus && error.to) return fetched ? c.json({ ok: true, value: null, redirect: error.to }) : c.redirect(error.to, 303);
    if (error instanceof HttpStatus) return refuse(error.status === 403 ? 403 : 404, error.status === 403 ? "forbidden" : "not_found");
    if (error instanceof AppError) return refuse(error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400, error.code, error.values);
    if (error instanceof SyntaxError) return refuse(400, "invalid");
    if (chestDown(error)) {
      log.warn("the Chest did not answer", { action: name, error: (error as Error).name });
      return refuse(500, "unavailable");
    }
    log.error("action failed", error, { action: name });
    return refuse(500, "unknown");
  }
}

// A form's fields; a name sent several times (checkboxes) is a list.
function formFields(data: FormData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const name of new Set(data.keys())) {
    const all = data.getAll(name).filter((v): v is string => typeof v === "string");
    fields[name] = all.length > 1 ? all : all[0];
  }
  return fields;
}

export function createApp() {
  const app = new Hono<Env>();

  // Every answer: the policy, the headers that go with it, a log line.
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    c.header("Content-Security-Policy", policy);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
    if (!c.req.path.startsWith("/assets/") || c.res.status >= 400) log.info("request", { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - started) });
  });

  app.use("/assets/*", serveStatic({ root: "./dist/client", onFound: (_path, c) => { c.header("Cache-Control", "public, max-age=31536000, immutable"); } }));

  // The members' part: the Chest asserts who asks on every request
  // (member(): the only source of identity); without it, 401.
  app.use(async (c, next) => {
    if (!isMembers(c)) return next();
    const who = member(c.req.raw);
    if (!who) return c.text(visitor(c).t.pages.signIn, 401);
    const locale = localeOf(who.language);
    c.set("viewer", { member: who, locale, t: words(locale), f: formatter(locale, who.timeZone, chest.currency), request: c.req.raw });
    return next();
  });

  // The public part's language switch: the choice kept a year, then back.
  app.get("/lang/:code", c => {
    const code = c.req.param("code");
    if (isLocale(code)) setCookie(c, "lang", code, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", secure: true, httpOnly: true });
    const to = c.req.query("back") ?? "/";
    return c.redirect(/^\/(?!\/)/u.test(to) && firstSegment(to) !== "chest" ? to : "/", 303);
  });

  const limit = bodyLimit({ maxSize: 1 << 20, onError: c => c.text("Too large.", 413) });
  app.post("/chest/actions/:name", limit, c => runAction(c, true));
  app.post("/actions/:name", limit, c => runAction(c, false));

  app.notFound(c => html(c, errorView(viewerOf(c).t, 404), viewerOf(c), 404));
  app.onError((error, c) => {
    if (error instanceof HttpStatus && error.to) return c.redirect(error.to, c.req.method === "GET" ? 302 : 303);
    if (error instanceof HttpStatus) return html(c, errorView(viewerOf(c).t, error.status === 403 ? 403 : 404), viewerOf(c), error.status === 403 ? 403 : 404);
    if (chestDown(error)) log.warn("the Chest did not answer", { path: c.req.path, error: error.name });
    else log.error("page failed", error, { path: c.req.path });
    return html(c, errorView(viewerOf(c).t, 500), viewerOf(c), 500);
  });
  return app;
}
