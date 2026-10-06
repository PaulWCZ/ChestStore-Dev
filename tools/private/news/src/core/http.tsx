import { statSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import { member, type Member } from "@argentic/chest-sdk/member";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { actions } from "../actions.ts";
import { fill, formatter, isLocale, localeOf, publicLocale, words, type Catalogue } from "../i18n/index.ts";
import { MembersLayout, PublicLayout } from "../layout.tsx";
import { sheetOf } from "../theme.ts";
import { AppError, HttpStatus, readInput, type Cookies, type ErrorCode, type MemberContext, type VisitorContext } from "./tool.ts";
import { log } from "./log.ts";

// The starter's server: security headers and the log line of every
// answer, the browser's files under /assets/, the member of every /chest
// request, the actions, the pages, the errors. The tool's routes are in
// src/app.tsx. (Polls' copy adds: the look as a stylesheet of its own in
// every page's head, a hook that completes the member, cookies in an
// action's context, and an error page per part.)

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

// What an action or a page may do with the browser's cookies: read one,
// set one (on the answer, whatever it is: a page, a redirect, JSON).
function cookiesOf(c: Context): Cookies {
  return {
    get: name => getCookie(c, name),
    set: (name, value, options) => setCookie(c, name, value, { path: options.path, maxAge: options.maxAge, sameSite: "Lax", secure: true, httpOnly: true }),
  };
}

function visitor(c: Context): VisitorContext {
  const locale = publicLocale(getCookie(c, "lang"), c.req.header("accept-language"), chest.language);
  return { member: null, locale, t: words(locale), f: formatter(locale, chest.timeZone, chest.currency), request: c.req.raw, cookies: cookiesOf(c) };
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

// The look (src/theme.ts) is a stylesheet the tool answers itself, linked
// with its hash: /chest/look.css on the team's pages, /look.css on the
// public ones. Never a <style>: the policy refuses inline styles.
async function html(c: Context, view: View, viewer: Viewer, status: 200 | 401 | 403 | 404 | 500 = 200) {
  const v = assetVersion();
  const members = viewer.member !== null;
  const sheet = await sheetOf(members ? "team" : "public");
  const error = c.req.query("error");
  const notice = error && Object.hasOwn(viewer.t.errors, error) ? viewer.t.errors[error as ErrorCode] : null;
  const page = renderToString(
    <html lang={viewer.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        {sheet.colors.map(m => <meta key={m.media} name="theme-color" media={m.media} content={m.color} />)}
        <title>{view.title === viewer.t.tool.name ? view.title : `${view.title} · ${viewer.t.tool.name}`}</title>
        <link rel="icon" href="/assets/icon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href={`${members ? "/chest" : ""}/look.css?v=${sheet.etag}`} />
        <link rel="stylesheet" href={`/assets/client.css?v=${v}`} />
        <script type="module" src={`/assets/client.js?v=${v}`} />
      </head>
      <body>
        {viewer.member !== null
          ? <MembersLayout viewer={viewer} look={sheet.look} path={c.req.path} notice={notice}>{view.body}</MembersLayout>
          : <PublicLayout viewer={viewer} look={sheet.look} path={c.req.path} notice={notice}>{view.body}</PublicLayout>}
      </body>
    </html>,
  );
  return c.html("<!doctype html>" + page, status);
}

// An error page in the reader's words. A member is offered the way back
// to the tool's first page; on the public part (a guest's link turned off,
// or wrong) there is no way into the Chest to offer.
function errorView(t: Catalogue, status: 403 | 404 | 500, members: boolean): View {
  const words = status === 403 ? t.pages.forbidden : status === 404 ? t.pages.notFound : t.pages.failed;
  const body = status === 404 && !members ? t.pages.notFound.publicBody : words.body;
  return {
    title: words.title,
    body: (
      <div className="ck-empty">
        <h1 className="ck-empty-title">{words.title}</h1>
        <p className="ck-empty-body">{body}</p>
        {members && <a className="button" href="/chest">{t.pages.notFound.back}</a>}
      </div>
    ),
  };
}

function contextOf<V extends Viewer>(c: Context, viewer: V): PageContext<V> {
  return { ...viewer, url: new URL(c.req.url), param: name => c.req.param(name) ?? "", query: name => c.req.query(name) };
}

// page(): a page of the members' part (under /chest); publicPage(): one of
// the public part. The handler reads what the page needs, then returns
// its title and its body; the layout (src/layout.tsx) goes around it.
export const page = (render: (p: PageContext<MemberContext>) => Promise<View> | View) => async (c: Context<Env>) => html(c, await render(contextOf(c, { ...c.get("viewer"), cookies: cookiesOf(c) })), c.get("viewer"));
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
    const value = await definition.run(readInput(definition.input, raw !== null && typeof raw === "object" ? raw : {}) as never, { ...viewer, request: c.req.raw, cookies: cookiesOf(c) } as never);
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

const limit = bodyLimit({ maxSize: 1 << 20, onError: c => c.text("Too large.", 413) });

// publicActionsAt: the public part's actions also answered under a path of
// the tool's (app.post("/p/:link/actions/:name", ...publicActionsAt())),
// so that a cookie kept for that path only reaches them (Polls: a guest's
// secret, for that poll's page alone).
export const publicActionsAt = () => [limit, (c: Context<Env>) => runAction(c, false)] as const;

// complete: what the tool adds to the member the Chest asserts, once per
// request, before any page or action reads it (Polls: every group the
// member is in, src/lib/groups.ts).
export function createApp({ complete }: { complete?: (who: Member) => Promise<Member> } = {}) {
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

  // The browser's files (dist/client/assets, from src/ and public/assets/):
  // linked with ?v=… they never change; any other, an hour.
  // (Set on the answer once served: serveStatic's onFound runs after its
  // answer is made, and a header set there never reached the browser —
  // the files went out "no-store".)
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set("Cache-Control", c.req.query("v") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  }, serveStatic({ root: "./dist/client" }));

  // The members' part: the Chest asserts who asks on every request
  // (member(): the only source of identity); without it, 401.
  app.use(async (c, next) => {
    if (!isMembers(c)) return next();
    const asserted = member(c.req.raw);
    if (!asserted) return c.text(visitor(c).t.pages.signIn, 401);
    const who = complete ? await complete(asserted) : asserted;
    const locale = localeOf(who.language);
    c.set("viewer", { member: who, locale, t: words(locale), f: formatter(locale, who.timeZone, chest.currency), request: c.req.raw, cookies: cookiesOf(c) });
    return next();
  });

  // The public part's language switch: the choice kept a year, then back.
  app.get("/lang/:code", c => {
    const code = c.req.param("code");
    if (isLocale(code)) setCookie(c, "lang", code, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", secure: true, httpOnly: true });
    const to = c.req.query("back") ?? "/";
    return c.redirect(/^\/(?!\/)/u.test(to) && firstSegment(to) !== "chest" ? to : "/", 303);
  });

  app.post("/chest/actions/:name", limit, c => runAction(c, true));
  app.post("/actions/:name", limit, c => runAction(c, false));

  const errorPage = (c: Context<Env>, status: 403 | 404 | 500) => {
    const viewer = viewerOf(c);
    return html(c, errorView(viewer.t, status, viewer.member !== null), viewer, status);
  };
  app.notFound(c => errorPage(c, 404));
  app.onError((error, c) => {
    if (error instanceof HttpStatus && error.to) return c.redirect(error.to, c.req.method === "GET" ? 302 : 303);
    if (error instanceof HttpStatus) return errorPage(c, error.status === 403 ? 403 : 404);
    if (chestDown(error)) log.warn("the Chest did not answer", { path: c.req.path, error: error.name });
    else log.error("page failed", error, { path: c.req.path });
    return errorPage(c, 500);
  });
  return app;
}
